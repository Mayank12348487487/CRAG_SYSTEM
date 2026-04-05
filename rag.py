from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_community.vectorstores import FAISS
from typing import  TypedDict,List,Annotated
from operator import add
from langgraph.graph import StateGraph,START,END
from langchain_core.messages import  BaseMessage
from langchain_community.document_loaders import PyMuPDFLoader
import operator
from langchain_huggingface import  ChatHuggingFace,HuggingFaceEmbeddings,HuggingFaceEndpoint
from dotenv import load_dotenv
from langchain_ollama import ChatOllama
from langchain_community.tools import tool
from langchain_community.retrievers import WikipediaRetriever
from langchain_community.tools import DuckDuckGoSearchRun
from langgraph.prebuilt import ToolNode,tools_condition
from tavily import TavilyClient
from pydantic import BaseModel,Field
import os

load_dotenv()

def load_multiple_pdfs(folder_path):
    all_docs = []

    for file in os.listdir(folder_path):
        if file.endswith(".pdf"):
            loader = PyMuPDFLoader(os.path.join(folder_path, file))
            docs = loader.load()

            # ✅ Add metadata (VERY IMPORTANT)
            for d in docs:
                d.metadata["source"] = file

            all_docs.extend(docs)

    return all_docs



docs = load_multiple_pdfs(r"C:\Users\Mayank Joshi\Downloads\pdfs")
splitter = RecursiveCharacterTextSplitter(chunk_size=300,chunk_overlap=30)
chunks = splitter.split_documents(docs)
embeddings = HuggingFaceEmbeddings(
    model_name="sentence-transformers/all-MiniLM-L6-v2"
)
vector_store = FAISS.from_documents(
    documents=chunks,
    embedding=embeddings,
    
)

retriever = vector_store.as_retriever(
    search_type="similarity",
    search_kwargs={"k": 4}
)

llm_ollama = ChatOllama(model="mistral:7b")
llm_hugging = HuggingFaceEndpoint(repo_id="meta-llama/Llama-3.1-8B-Instruct")
model = ChatHuggingFace(llm=llm_hugging)

class CRAGState(TypedDict):
    question:str
    reterived_context:str
    filtered_context:str
    final_answer:str
    is_relevant:bool


def Reterive_node(state:CRAGState):
    question = state['question']
    result = retriever.invoke(question)
    return {"reterived_context":result}

class Grade_Output(BaseModel):
    is_relevant:bool=Field(description="Are Documents relevant?")

def grade_documents(state:CRAGState):
    question = state["question"]
    context = state["reterived_context"]

    content = "\n".join([d.page_content for d in context])
    prompt = f"""
    You are a strict evaluator.

    Question: {question}

    Context:
    {content}

    Task:
    - If the context contains information useful to answer the question → True
    - Otherwise → False

    Answer ONLY True or False.
    """
    structured_llm = llm_ollama.with_structured_output(Grade_Output)
    result = structured_llm.invoke(prompt)

    return{"is_relevant":result.is_relevant}

def decide_path(state:CRAGState):
    if state["is_relevant"]:
        return "good"
    else:
        return "bad"

def rewrite_query(state:CRAGState):
    question = state["question"]
    docs= state["reterived_context"]
    context = "\n".join([d.page_content for d in docs])
    
    client = TavilyClient(api_key=os.getenv("TAVILY_API_KEY"))
    web_result = client.search(question)
    web_context = "\n".join([i["content"] for i in web_result["results"]])
    prompt = f"""
    You are a helpful assistant. Answer the user's question based on the provided context.

    Question: {question}

    Retrieved Documents:
    {context}

    Web Search Results:
    {web_context}

    Instructions:
    - Answer based on the context above
    - If documents and web results conflict, prefer the most recent web result
    - If the context doesn't contain the answer, say "I don't know"

    
    """
    result = model.invoke(prompt)
    return {"filtered_context":result.content}

def generate_answer(state: CRAGState):
    question = state["question"]

    context = state.get("filtered_context") or "\n".join(
        [d.page_content for d in state["reterived_context"]]
    )

    prompt = f"""
    Answer the question:

    Question: {question}
    Context: {context}
    """

    response = model.invoke(prompt)

    return {"final_answer": response.content}


builder = StateGraph(CRAGState)

builder.add_node("retrieve", Reterive_node)
builder.add_node("grade", grade_documents)
builder.add_node("rewrite", rewrite_query)
builder.add_node("generate", generate_answer)

builder.set_entry_point("retrieve")

builder.add_edge("retrieve", "grade")

builder.add_conditional_edges(
    "grade",
    decide_path,
    {
        "good": "generate",
        "bad": "rewrite"
    }
)

builder.add_edge("rewrite", "generate")

graph = builder.compile()

result = graph.invoke({
    "question": "What is Cyber Security and what is the latest Cyber crime happend?"
})

print(result["final_answer"])

    
