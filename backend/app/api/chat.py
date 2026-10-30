import json
from typing import Union
from fastapi import APIRouter, HTTPException, status
from fastapi.responses import StreamingResponse

from app.config import settings
from app.schemas import ChatRequest, ChatResponse
from app.services.local_response import get_local_response
from app.services.gemini_service import (
    generate_chat_completion,
    stream_gemini_completion,
)

router = APIRouter(prefix="/api", tags=["chat"])


@router.post("/chat", response_model=None)
async def chat_endpoint(request: ChatRequest):
    """
    Processes chat requests with multi-turn conversation history.
    Pipeline:
      1. Input validation (handled by Pydantic)
      2. Local conversation engine check
         - If confident match: return instant local response (streaming SSE or JSON)
      3. If no local match:
         - Validate Gemini configuration (503 if missing)
         - If stream=True (default): stream chunks progressively via SSE
         - If stream=False: return standard ChatResponse JSON
    """
    # Step 1: Check local conversation engine
    local_match = get_local_response(request.messages)

    if local_match is not None:
        if request.stream:
            async def local_stream():
                # Yield instant response in SSE format
                chunk_data = json.dumps({
                    "text": local_match,
                    "done": True,
                    "model": "local",
                })
                yield f"data: {chunk_data}\n\n"

            return StreamingResponse(
                local_stream(),
                media_type="text/event-stream",
                headers={
                    "Cache-Control": "no-cache",
                    "Connection": "keep-alive",
                    "X-Accel-Buffering": "no",
                },
            )
        return ChatResponse(
            role="assistant",
            content=local_match,
            model="local",
        )

    # Step 2: Not handled locally -> requires Gemini
    if not settings.is_gemini_configured:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Gemini API key is not configured. Please add your GEMINI_API_KEY to backend/.env and restart the backend.",
        )

    # Step 3: Stream vs. Non-stream completion
    if request.stream:
        async def sse_event_stream():
            async for item in stream_gemini_completion(
                messages=request.messages,
                system_prompt=request.system_prompt,
            ):
                yield f"data: {json.dumps(item)}\n\n"

        return StreamingResponse(
            sse_event_stream(),
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
                "X-Accel-Buffering": "no",
            },
        )

    # Non-streaming fallback
    return await generate_chat_completion(
        messages=request.messages,
        system_prompt=request.system_prompt,
    )
