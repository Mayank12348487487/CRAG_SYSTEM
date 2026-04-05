"""
Enhanced CRAG pipeline with:
- Per-user isolated FAISS indexes (persisted across logout/restart)
- Short-term memory injection (last N turns from session)
- Long-term memory injection (user's summarized knowledge)
"""

from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_community.vectorstores import FAISS
from typing import TypedDict, List, Optional
from langgraph.graph import StateGraph, START, END
from langchain_community.document_loaders import PyMuPDFLoader
from langchain_huggingface import ChatHuggingFace, HuggingFaceEmbeddings, HuggingFaceEndpoint
from pydantic import BaseModel, Field
from langchain_core.output_parsers import JsonOutputParser
from tavily import TavilyClient
from dotenv import load_dotenv
import os
import shutil

load_dotenv()

# ─── Per-User FAISS Store ──────────────────────────────────────────────────────
# Each user gets their own folder: faiss_indexes/{user_id}/
# This ensures complete data isolation and full persistence across logout/restart.

INDEX_BASE = "faiss_indexes"          # root directory, holds one sub-dir per user
os.makedirs(INDEX_BASE, exist_ok=True)

embeddings = HuggingFaceEmbeddings(model_name="sentence-transformers/all-MiniLM-L6-v2")

_user_stores: dict = {}               # in-memory cache: user_id -> FAISS


def _user_index_path(user_id: str) -> str:
    return os.path.join(INDEX_BASE, user_id)


def _load_store(user_id: str) -> Optional[FAISS]:
    """Load a user's FAISS index from disk into the cache."""
    path = _user_index_path(user_id)
    if os.path.exists(path):
        try:
            store = FAISS.load_local(path, embeddings, allow_dangerous_deserialization=True)
            _user_stores[user_id] = store
            print(f"[FAISS] Loaded index for user {user_id}")
            return store
        except Exception as e:
            print(f"[FAISS] Failed to load index for {user_id}: {e}")
    return None


def _get_store(user_id: str) -> Optional[FAISS]:
    """Return cached store or load from disk. Returns None if user has no index."""
    if user_id not in _user_stores:
        _load_store(user_id)
    return _user_stores.get(user_id)


def get_indexed_files(user_id: str) -> List[str]:
    """Return list of PDF filenames indexed for this user."""
    store = _get_store(user_id)
    if store and hasattr(store, "docstore"):
        sources = set()
        for doc in store.docstore._dict.values():
            sources.add(doc.metadata.get("source", "Unknown"))
        return list(sources)
    return []


def add_pdfs_to_index(file_paths: List[str], user_id: str) -> int:
    """Index PDFs into this user's private FAISS store and persist to disk."""
    docs = []
    for path in file_paths:
        try:
            loader = PyMuPDFLoader(path)
            loaded = loader.load()
            for d in loaded:
                d.metadata["source"] = os.path.basename(path)
            docs.extend(loaded)
        except Exception as e:
            print(f"[FAISS] Failed to load {path}: {e}")

    if not docs:
        return 0

    splitter = RecursiveCharacterTextSplitter(chunk_size=300, chunk_overlap=30)
    chunks = splitter.split_documents(docs)

    store = _get_store(user_id)
    if store is None:
        store = FAISS.from_documents(documents=chunks, embedding=embeddings)
    else:
        store.add_documents(chunks)

    index_path = _user_index_path(user_id)
    os.makedirs(index_path, exist_ok=True)
    store.save_local(index_path)
    _user_stores[user_id] = store
    print(f"[FAISS] Saved {len(chunks)} chunks for user {user_id}")
    return len(chunks)


def clear_index(user_id: str):
    """Delete this user's entire FAISS index from disk and memory."""
    _user_stores.pop(user_id, None)
    path = _user_index_path(user_id)
    if os.path.exists(path):
        shutil.rmtree(path, ignore_errors=True)
        print(f"[FAISS] Cleared index for user {user_id}")


def remove_pdf_from_index(user_id: str, filename: str) -> int:
    """Remove chunks associated with a specific filename from this user's index."""
    store = _get_store(user_id)
    if store and hasattr(store, "docstore"):
        # Find docstore IDs that match this filename in metadata
        ids_to_delete = [
            obj_id for obj_id, doc in store.docstore._dict.items()
            if doc.metadata.get("source") == filename
        ]
        
        if ids_to_delete:
            store.delete(ids_to_delete)
            # Persist the shrunk index
            index_path = _user_index_path(user_id)
            os.makedirs(index_path, exist_ok=True)
            store.save_local(index_path)
            # Update cache
            _user_stores[user_id] = store
            print(f"[FAISS] Deleted {len(ids_to_delete)} chunks matching {filename} for user {user_id}")
            return len(ids_to_delete)
            
    return 0


def retrieve_for_user(user_id: str, question: str, k: int = 4) -> list:
    """Run similarity search scoped to this user's private index."""
    store = _get_store(user_id)
    if store is None:
        return []
    retriever = store.as_retriever(search_type="similarity", search_kwargs={"k": k})
    return retriever.invoke(question)


# ─── LLM Setup ─────────────────────────────────────────────────────────────────

llm_hugging = HuggingFaceEndpoint(repo_id="meta-llama/Llama-3.1-8B-Instruct")
model = ChatHuggingFace(llm=llm_hugging)


# ─── State ─────────────────────────────────────────────────────────────────────

class CRAGState(TypedDict):
    question: str
    session_id: str
    user_id: str
    short_term_context: str       # last N messages
    long_term_context: str        # summarized user knowledge
    retrieved_context: str
    filtered_context: str
    web_context: str              # web search results (Tavily)
    final_answer: str
    is_relevant: bool
    is_chatter: bool              # flag for conversational routing
    needs_web: bool               # flag for web-search-needed queries
    sources: List[str]
    step_log: List[str]           # for frontend node visualization


# ─── Nodes ─────────────────────────────────────────────────────────────────────

class ChatterOutput(BaseModel):
    is_chatter: bool = Field(description="Is the user input just casual chatter or a greeting?")

def detect_chatter(state: CRAGState):
    question = state["question"]
    step_log = state.get("step_log", [])

    # ── Fast rule-based web-need detection ────────────────────────────────────
    web_trigger_keywords = [
        "latest", "recent", "news", "today", "yesterday", "this week",
        "this month", "current", "now", "update", "2024", "2025", "2026",
        "trending", "breaking", "just announced", "new development"
    ]
    q_lower = question.lower()
    needs_web = any(kw in q_lower for kw in web_trigger_keywords)

    parser = JsonOutputParser(pydantic_object=ChatterOutput)
    prompt = f"""You are a helpful routing assistant. Determine if the user's input is a casual greeting or conversational chatter (like "hi", "how are you", "what is your name") OR if it is a rigid question that requires searching a database for an exact answer.

{parser.get_format_instructions()}

User Input: {question}
"""
    try:
        response = model.invoke(prompt)
        parsed = parser.invoke(response)
        is_chatter = parsed.get("is_chatter", False)
    except Exception as e:
        is_chatter = False

    return {
        "is_chatter": is_chatter,
        "needs_web": needs_web,
        "step_log": step_log + [f"router: is_chatter={is_chatter}, needs_web={needs_web}"]
    }

def decide_chatter(state: CRAGState):
    return "chatter" if state.get("is_chatter") else "rag"

def generate_chatter(state: CRAGState):
    question = state["question"]
    short_term = state.get("short_term_context", "")
    long_term = state.get("long_term_context", "")
    step_log = state.get("step_log", [])
    
    memory_section = ""
    if long_term:
        memory_section += f"\nUser's background:\n{long_term}\n"
    if short_term:
        memory_section += f"\nPrevious conversation:\n{short_term}\n"
        
    prompt = f"""You are a friendly, helpful AI assistant. Answer the following conversational message naturally.
{memory_section}
User: {question}
Assistant:"""

    response = model.invoke(prompt)
    return {
        "final_answer": response.content,
        "step_log": step_log + ["generate_chatter: responded to chatter"]
    }

def retrieve_node(state: CRAGState):
    question = state["question"]
    user_id = state.get("user_id", "")
    step_log = state.get("step_log", [])

    result = retrieve_for_user(user_id, question, k=4)

    if not result:
        return {
            "retrieved_context": [],
            "sources": [],
            "step_log": step_log + ["retrieve: no docs found for this user"]
        }

    sources = list({d.metadata.get("source", "unknown") for d in result})
    return {
        "retrieved_context": result,
        "sources": sources,
        "step_log": step_log + [f"retrieve: found {len(result)} chunks from {sources}"]
    }


class GradeOutput(BaseModel):
    is_relevant: bool = Field(description="Are Documents relevant?")


def grade_documents(state: CRAGState):
    question = state["question"]
    context = state["retrieved_context"]
    step_log = state.get("step_log", [])

    if not context:
        return {"is_relevant": False, "step_log": step_log + ["grade: no context, marking irrelevant"]}

    content = "\n".join([d.page_content for d in context])
    parser = JsonOutputParser(pydantic_object=GradeOutput)
    
    prompt = f"""You are a strict evaluator grading document relevance.

{parser.get_format_instructions()}

Task:
- If the Context contains ANY information useful to answer the Question, you MUST return true.
- If the Context is completely irrelevant, return false.

Question: {question}

Context:
{content}
"""

    response = model.invoke(prompt)
    try:
        parsed = parser.invoke(response)
        is_relevant = parsed.get("is_relevant", False)
    except Exception as e:
        print(f"Failed to parse grading output: {e}, Raw: {response.content}")
        is_relevant = False

    return {
        "is_relevant": is_relevant,
        "step_log": step_log + [f"grade: relevant={is_relevant}"]
    }


def decide_path(state: CRAGState):
    return "good" if state["is_relevant"] else "bad"


def web_search_node(state: CRAGState):
    """Performs a Tavily web search and stores results in web_context.
    Triggered when: (a) docs were graded irrelevant, OR (b) query needs fresh web data.
    """
    question = state["question"]
    step_log = state.get("step_log", [])

    try:
        client = TavilyClient(api_key=os.getenv("TAVILY_API_KEY"))
        web_result = client.search(question, search_depth="advanced", max_results=5)
        web_context = "\n\n".join(
            [f"[{i['title']}]\n{i['content']}" for i in web_result.get("results", [])]
        )
        web_sources = [i.get("url", "") for i in web_result.get("results", [])]
        print(f"[Tavily] Found {len(web_result.get('results', []))} results.")
    except Exception as e:
        print(f"[Tavily] Search failed: {e}")
        web_context = ""
        web_sources = []

    return {
        "web_context": web_context,
        "sources": list(set(state.get("sources", []) + web_sources)),
        "step_log": step_log + [f"web_search: fetched {len(web_sources)} web results"]
    }


def generate_answer(state: CRAGState):
    question = state["question"]
    short_term = state.get("short_term_context", "")
    long_term = state.get("long_term_context", "")
    step_log = state.get("step_log", [])

    # Build PDF doc context
    pdf_context = "\n".join(
        [d.page_content for d in state.get("retrieved_context", []) if hasattr(d, 'page_content')]
    )
    # Web context from Tavily (may be empty if web_search_node was not called)
    web_context = state.get("web_context", "")

    memory_section = ""
    if long_term:
        memory_section += f"\nUser's background (long-term memory):\n{long_term}\n"
    if short_term:
        memory_section += f"\nPrevious conversation:\n{short_term}\n"

    # Compose context block — prioritise web for recency
    context_block = ""
    if web_context:
        context_block += f"## Web Search Results (latest, prioritise these for recent events):\n{web_context}\n\n"
    if pdf_context:
        context_block += f"## Document Knowledge (from uploaded PDFs):\n{pdf_context}\n"

    if not context_block:
        context_block = "No context available."

    prompt = f"""You are an expert assistant with memory of past interactions.
{memory_section}
Answer the following question using the context below. Be clear, concise, and friendly.
If web search results are present, use them for any recent/latest information and clearly state if information comes from recent news.

Question: {question}

{context_block}

Answer:"""

    response = model.invoke(prompt)
    return {
        "final_answer": response.content,
        "step_log": step_log + ["generate: answer produced"]
    }


# ─── Graph ─────────────────────────────────────────────────────────────────────

def decide_after_grade(state: CRAGState):
    """After grading:
    - If docs irrelevant → always web search
    - If docs relevant BUT query needs fresh web data → web search first
    - If docs relevant and no web needed → generate directly
    """
    is_relevant = state.get("is_relevant", False)
    needs_web = state.get("needs_web", False)

    if not is_relevant:
        return "web_search"          # docs are bad → fallback to web
    elif needs_web:
        return "web_search"          # docs ok but user wants latest news
    else:
        return "generate"            # docs are good and no recency needed


builder = StateGraph(CRAGState)

builder.add_node("detect_chatter", detect_chatter)
builder.add_node("generate_chatter", generate_chatter)
builder.add_node("retrieve", retrieve_node)
builder.add_node("grade", grade_documents)
builder.add_node("web_search", web_search_node)   # renamed & fixed node
builder.add_node("generate", generate_answer)

builder.set_entry_point("detect_chatter")
builder.add_conditional_edges(
    "detect_chatter", decide_chatter,
    {"chatter": "generate_chatter", "rag": "retrieve"}
)
builder.add_edge("generate_chatter", END)
builder.add_edge("retrieve", "grade")
builder.add_conditional_edges(
    "grade", decide_after_grade,
    {"generate": "generate", "web_search": "web_search"}
)
builder.add_edge("web_search", "generate")   # after web search → generate
builder.add_edge("generate", END)

graph = builder.compile()
