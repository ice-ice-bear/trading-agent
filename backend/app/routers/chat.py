import logging
from collections import defaultdict

from fastapi import APIRouter
from sse_starlette.sse import EventSourceResponse

from app.models.schemas import ChatRequest
from app.services.claude_service import stream_chat

logger = logging.getLogger(__name__)
router = APIRouter()

# In-memory session store: session_id -> list of messages
sessions: dict[str, list[dict]] = defaultdict(list)


@router.post("/api/chat")
async def chat(request: ChatRequest):
    """Stream a chat response via SSE."""
    session_id = request.session_id

    # Add user message to session history
    sessions[session_id].append({"role": "user", "content": request.message})

    async def event_generator():
        assistant_text = ""
        async for event_str in stream_chat(sessions[session_id], session_id):
            import json
            event_data = json.loads(event_str)

            # Accumulate assistant text for session history
            if event_data["event"] == "text_delta":
                assistant_text += event_data["data"]["text"]
            elif event_data["event"] == "done":
                # Save assistant response to session history
                if assistant_text:
                    sessions[session_id].append(
                        {"role": "assistant", "content": assistant_text}
                    )

            yield {"event": event_data["event"], "data": json.dumps(event_data["data"])}

    return EventSourceResponse(event_generator())


@router.delete("/api/sessions/{session_id}")
async def delete_session(session_id: str):
    """Clear a chat session."""
    if session_id in sessions:
        del sessions[session_id]
    return {"status": "ok"}


@router.get("/api/sessions")
async def list_sessions():
    """List all active session IDs."""
    return {
        "sessions": [
            {"id": sid, "message_count": len(msgs)}
            for sid, msgs in sessions.items()
        ]
    }
