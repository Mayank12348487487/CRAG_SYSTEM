"""
Memory Manager — Short-term and Long-term memory for the CRAG system.

Short-term: Last N messages per session (stored in MongoDB `messages` collection).
Long-term:  Summarized facts per user (stored in `long_term_memory` collection),
            updated periodically using the LLM.
"""

from datetime import datetime
from typing import List, Optional
from database import messages_col, long_term_col
from langchain_ollama import ChatOllama

llm = ChatOllama(model="mistral:7b")

SHORT_TERM_LIMIT = 10          # last N messages kept in context
SUMMARIZE_EVERY = 20           # summarize long-term every N messages


# ─── Short-Term Memory ─────────────────────────────────────────────────────────

async def get_short_term(user_id: str) -> List[dict]:
    """Return the last SHORT_TERM_LIMIT messages for a user."""
    cursor = messages_col.find(
        {"user_id": user_id},
        {"_id": 0, "role": 1, "content": 1, "created_at": 1}
    ).sort("created_at", -1).limit(SHORT_TERM_LIMIT)
    messages = await cursor.to_list(length=SHORT_TERM_LIMIT)
    return list(reversed(messages))   # oldest first


def format_short_term(messages: List[dict]) -> str:
    """Format short-term messages into a readable context string."""
    if not messages:
        return ""
    lines = []
    for m in messages:
        role = "User" if m["role"] == "user" else "Assistant"
        lines.append(f"{role}: {m['content']}")
    return "\n".join(lines)


# ─── Long-Term Memory ──────────────────────────────────────────────────────────

async def get_long_term(user_id: str) -> str:
    """Return the long-term memory summary for a user."""
    doc = await long_term_col.find_one({"user_id": user_id})
    if not doc:
        return ""
    return doc.get("summary", "")


async def update_long_term(user_id: str, new_qa: str):
    """
    Append a new Q&A turn to long-term memory.
    Every SUMMARIZE_EVERY turns, re-summarize using the LLM.
    """
    doc = await long_term_col.find_one({"user_id": user_id})
    
    if not doc:
        # First time — create the record
        await long_term_col.insert_one({
            "user_id": user_id,
            "turns": [new_qa],
            "summary": "",
            "updated_at": datetime.utcnow()
        })
        doc = await long_term_col.find_one({"user_id": user_id})

    turns: list = doc.get("turns", [])
    turns.append(new_qa)

    # Re-summarize if threshold reached
    summary = doc.get("summary", "")
    if len(turns) % SUMMARIZE_EVERY == 0:
        summary = await _summarize(turns, summary)
        turns = []  # reset turns after summarizing

    await long_term_col.update_one(
        {"user_id": user_id},
        {"$set": {
            "turns": turns,
            "summary": summary,
            "updated_at": datetime.utcnow()
        }}
    )


async def _summarize(turns: List[str], existing_summary: str) -> str:
    """Use LLM to compress conversation history into key facts."""
    history_text = "\n".join(turns[-SUMMARIZE_EVERY:])
    prompt = f"""You are a memory assistant. Extract key facts and important information from this conversation history.

Existing summary:
{existing_summary or "None yet."}

New conversation turns:
{history_text}

Create a concise updated summary capturing the most important facts about this user's interests, topics discussed, and notable information. Keep it under 300 words.

Summary:"""
    result = llm.invoke(prompt)
    return result.content


# ─── Save Turn ─────────────────────────────────────────────────────────────────

async def save_turn(user_id: str, question: str, answer: str, sources: list = []):
    """Persist a Q&A turn to short-term (messages) and update long-term memory."""
    now = datetime.utcnow()
    
    # Short-term: save user message
    await messages_col.insert_one({
        "user_id": user_id,
        "role": "user",
        "content": question,
        "sources": [],
        "created_at": now
    })
    
    # Short-term: save assistant message
    await messages_col.insert_one({
        "user_id": user_id,
        "role": "assistant",
        "content": answer,
        "sources": sources,
        "created_at": datetime.utcnow()
    })
    
    # Long-term: update memory
    qa_text = f"Q: {question}\nA: {answer}"
    await update_long_term(user_id, qa_text)
