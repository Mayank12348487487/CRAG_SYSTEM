"""
Chat routes: message history, SSE streaming chat.
"""

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from fastapi.responses import StreamingResponse
import shutil
import os
from auth import get_current_user
from database import messages_col
from models import ChatRequest, MessageOut
from memory import get_short_term, get_long_term, save_turn, format_short_term
from rag import get_graph, add_pdfs_to_index, clear_index, get_indexed_files, remove_pdf_from_index
import json

router = APIRouter(prefix="/api/chat", tags=["chat"])

@router.get("/history", response_model=list[MessageOut])
async def get_history(current_user: dict = Depends(get_current_user)):
    user_id = str(current_user["_id"])
    cursor = messages_col.find({"user_id": user_id}).sort("created_at", 1)
    msgs = await cursor.to_list(length=200)
    return [
        MessageOut(
            id=str(m["_id"]),
            role=m["role"],
            content=m["content"],
            created_at=m["created_at"],
            sources=m.get("sources", [])
        )
        for m in msgs
    ]


@router.post("/send")
async def send_message(body: ChatRequest, current_user: dict = Depends(get_current_user)):
    """
    Run the CRAG graph and stream events back via SSE.
    """
    user_id = str(current_user["_id"])

    # Load memory context
    short_term_msgs = await get_short_term(user_id)
    short_term_text = format_short_term(short_term_msgs)
    long_term_text = await get_long_term(user_id)

    async def event_generator():
        try:
            # Signal start
            yield f"data: {json.dumps({'type': 'start', 'message': 'Processing...'})}\n\n"

            # Prepare input state
            state_input = {
                "question": body.question,
                "session_id": user_id,
                "user_id": user_id,
                "short_term_context": short_term_text,
                "long_term_context": long_term_text,
                "retrieved_context": [],
                "filtered_context": "",
                "web_context": "",         # populated by web_search_node if triggered
                "final_answer": "",
                "is_relevant": False,
                "is_chatter": False,
                "needs_web": False,        # set by detect_chatter via keyword detection
                "sources": [],
                "step_log": []
            }

            # Stream graph steps
            final_answer = ""
            sources = []

            async for event in get_graph().astream(state_input):
                for node_name, node_output in event.items():
                    # Emit step event
                    step_info = {
                        "type": "step",
                        "node": node_name,
                        "log": node_output.get("step_log", [])[-1] if node_output.get("step_log") else "",
                    }
                    yield f"data: {json.dumps(step_info)}\n\n"

                    if "final_answer" in node_output and node_output["final_answer"]:
                        final_answer = node_output["final_answer"]
                    if "sources" in node_output and node_output["sources"]:
                        sources = node_output["sources"]

            # Persist turn to memory
            await save_turn(user_id, body.question, final_answer, sources)

            # Emit final answer
            yield f"data: {json.dumps({'type': 'done', 'answer': final_answer, 'sources': sources})}\n\n"

        except Exception as e:
            yield f"data: {json.dumps({'type': 'error', 'message': str(e)})}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        }
    )

@router.get("/memory")
async def get_memory(current_user: dict = Depends(get_current_user)):
    """Return the user's long-term memory summary."""
    user_id = str(current_user["_id"])
    summary = await get_long_term(user_id)
    return {"summary": summary or "No long-term memory yet."}


# ─── Document Uploads ──────────────────────────────────────────────────────────

@router.post("/upload")
async def upload_documents(
    files: list[UploadFile] = File(...),
    current_user: dict = Depends(get_current_user)
):
    user_id = str(current_user["_id"])   # ← was missing!
    import tempfile
    import shutil
    
    file_paths = []

    for file in files:
        if file.filename.endswith(".pdf"):
            try:
                with tempfile.NamedTemporaryFile(delete=False, suffix=".pdf") as tmp:
                    shutil.copyfileobj(file.file, tmp)
                    file_paths.append(tmp.name)
                print(f"[Upload] Saved {file.filename} → {tmp.name}")
            except Exception as e:
                print(f"[Upload] Failed to save {file.filename}: {e}")

    if not file_paths:
        raise HTTPException(status_code=400, detail="No valid PDF files received")

    try:
        chunks_added = add_pdfs_to_index(file_paths, user_id)
        print(f"[Upload] Indexed {chunks_added} chunks for user {user_id}")
    except Exception as e:
        print(f"[Upload] Indexing failed for user {user_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Indexing failed: {str(e)}")
    finally:
        for path in file_paths:
            try:
                os.remove(path)
            except:
                pass

    return {"message": f"Successfully indexed {chunks_added} chunks from {len(file_paths)} file(s)"}


@router.post("/clear_pdfs")
async def clear_pdfs(current_user: dict = Depends(get_current_user)):
    user_id = str(current_user["_id"])
    clear_index(user_id)   # ← only clears THIS user's docs
    return {"message": "Knowledge base cleared."}


@router.post("/clear_history")
async def clear_history(current_user: dict = Depends(get_current_user)):
    user_id = str(current_user["_id"])
    await messages_col.delete_many({"user_id": user_id})
    return {"message": "Chat history cleared."}

@router.get("/documents")
async def get_documents(current_user: dict = Depends(get_current_user)):
    user_id = str(current_user["_id"])
    files = get_indexed_files(user_id)   # ← only shows THIS user's docs
    return {"documents": files}

@router.delete("/documents/{filename}")
async def delete_document(filename: str, current_user: dict = Depends(get_current_user)):
    user_id = str(current_user["_id"])
    deleted_count = remove_pdf_from_index(user_id, filename)
    if deleted_count == 0:
        raise HTTPException(status_code=404, detail="Document not found in index")
    return {"message": f"Successfully removed {filename} and its {deleted_count} chunks."}
