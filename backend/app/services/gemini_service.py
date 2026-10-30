import logging
from typing import AsyncIterator, List, Optional
from fastapi import HTTPException, status
import httpx
from google import genai
from google.genai import types, errors

from app.config import settings
from app.schemas import ChatMessage, ChatResponse

logger = logging.getLogger(__name__)

# Bounded output token limit suitable for desktop companion and free tier
DEFAULT_MAX_OUTPUT_TOKENS = 1024
MAX_HISTORY_MESSAGES = 12

# Cached client singleton to avoid recreating client instances and HTTP pools per request
_cached_client: Optional[genai.Client] = None
_cached_key: Optional[str] = None


def get_gemini_client(api_key: Optional[str] = None) -> genai.Client:
    """
    Returns a cached Google GenAI Client or creates a new one if key changes.
    Reuses connection pools across requests.
    """
    global _cached_client, _cached_key
    key = (api_key or settings.gemini_api_key).strip()
    if _cached_client is not None and _cached_key == key:
        return _cached_client
    _cached_client = genai.Client(api_key=key)
    _cached_key = key
    return _cached_client


def prepare_gemini_contents(messages: List[ChatMessage]) -> List[types.Content]:
    """
    Prepares bounded conversation turns for Gemini.
    Ensures that multi-turn conversation starts with a 'user' message,
    as strictly required by Google Gemini multi-turn API.
    """
    bounded = messages[-MAX_HISTORY_MESSAGES:] if len(messages) > MAX_HISTORY_MESSAGES else messages

    # Strip any leading assistant/system turns
    start_idx = 0
    for i, msg in enumerate(bounded):
        if msg.role == "user":
            start_idx = i
            break

    active_messages = bounded[start_idx:]
    if not active_messages:
        active_messages = [messages[-1]]

    contents = []
    for msg in active_messages:
        role = "user" if msg.role == "user" else "model"
        contents.append(
            types.Content(
                role=role,
                parts=[types.Part.from_text(text=msg.content)],
            )
        )
    return contents


def map_gemini_exception(e: Exception, model_name: str) -> tuple[int, str]:
    """
    Maps Google GenAI errors and network exceptions into client-safe status codes and messages.
    Never exposes API keys, tokens, or raw secrets.
    """
    if isinstance(e, errors.APIError):
        code = getattr(e, "code", None)
        err_msg = str(e).lower()
        logger.warning(f"Gemini APIError encountered (code: {code}): {e}")

        # Upstream 404 Model Not Found / Model Deprecated or Unavailable
        if (
            code == 404
            or "not found" in err_msg
            or "not available" in err_msg
            or "no longer available" in err_msg
        ):
            detail_msg = (
                f"Gemini model '{model_name}' is unavailable or not found. "
                "Please check GEMINI_MODEL in backend/.env (e.g. 'gemini-3.8-flash')."
            )
            raw_msg = getattr(e, "message", None) or str(e)
            if raw_msg and "key" not in raw_msg.lower():
                detail_msg = f"Model configuration error: {raw_msg}"
            return (status.HTTP_404_NOT_FOUND, detail_msg)

        if (
            code in (401, 403)
            or "api_key" in err_msg
            or "api key" in err_msg
            or "unauthorized" in err_msg
            or "permission" in err_msg
            or ("key" in err_msg and ("invalid" in err_msg or "not valid" in err_msg))
        ):
            return (
                status.HTTP_401_UNAUTHORIZED,
                "Invalid or unauthorized Gemini API key. Please check your GEMINI_API_KEY.",
            )

        if code == 429 or "resource_exhausted" in err_msg or "quota" in err_msg or "rate limit" in err_msg:
            return (
                status.HTTP_429_TOO_MANY_REQUESTS,
                "Gemini API rate limit or quota exceeded. Please wait a moment before sending another message.",
            )

        if code in (503, 504):
            raw_msg = getattr(e, "message", None) or str(e)
            if raw_msg and ("demand" in raw_msg.lower() or "overloaded" in raw_msg.lower() or "unavailable" in raw_msg.lower()):
                detail_msg = "Google Gemini is temporarily experiencing high demand. Please try again in a few moments."
            else:
                detail_msg = "The Gemini API service is temporarily unavailable. Please try again shortly."
            return (status.HTTP_503_SERVICE_UNAVAILABLE, detail_msg)

        if code and code >= 500:
            return (
                status.HTTP_502_BAD_GATEWAY,
                "The Gemini AI service encountered an error while processing your request. Please try again.",
            )

        return (
            status.HTTP_500_INTERNAL_SERVER_ERROR,
            "A service error occurred while communicating with Google Gemini.",
        )

    if isinstance(e, (httpx.ConnectError, httpx.TimeoutException, httpx.NetworkError)):
        logger.error(f"Network error connecting to Gemini API: {e}")
        return (
            status.HTTP_503_SERVICE_UNAVAILABLE,
            "Unable to reach the Gemini API service. Please verify your internet connection.",
        )

    logger.exception("Unexpected error in Gemini service execution")
    return (
        status.HTTP_500_INTERNAL_SERVER_ERROR,
        "An unexpected error occurred while generating the AI response.",
    )


async def stream_gemini_completion(
    messages: List[ChatMessage],
    system_prompt: Optional[str] = None,
    client: Optional[genai.Client] = None,
) -> AsyncIterator[dict]:
    """
    Asynchronously streams response chunks from Google Gemini API.
    Yields dicts with:
      {"text": str, "done": False}
      {"text": "", "done": True, "model": str}
    Or in case of failure:
      {"error": str, "done": True, "status_code": int}
    """
    if not settings.is_gemini_configured:
        yield {
            "error": "Gemini API key is not configured. Please add your GEMINI_API_KEY to backend/.env and restart the backend.",
            "done": True,
            "status_code": status.HTTP_503_SERVICE_UNAVAILABLE,
        }
        return

    model_name = settings.effective_model
    contents = prepare_gemini_contents(messages)
    system_instruction = system_prompt.strip() if system_prompt and system_prompt.strip() else None

    config = types.GenerateContentConfig(
        system_instruction=system_instruction,
        max_output_tokens=DEFAULT_MAX_OUTPUT_TOKENS,
        temperature=0.7,
    )

    gemini_client = client or get_gemini_client()

    try:
        stream = await gemini_client.aio.models.generate_content_stream(
            model=model_name,
            contents=contents,
            config=config,
        )

        async for chunk in stream:
            text = chunk.text or ""
            if text:
                yield {"text": text, "done": False}

        yield {"text": "", "done": True, "model": model_name}

    except Exception as e:
        status_code, error_detail = map_gemini_exception(e, model_name)
        yield {"error": error_detail, "done": True, "status_code": status_code}


async def generate_chat_completion(
    messages: List[ChatMessage],
    system_prompt: Optional[str] = None,
    client: Optional[genai.Client] = None,
) -> ChatResponse:
    """
    Calls Google Gemini API with multi-turn conversation history and returns a validated ChatResponse.
    Used for non-streaming requests or direct API clients.
    Raises HTTPException with safe, client-facing status codes and messages on failures.
    """
    if not settings.is_gemini_configured:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Gemini API key is not configured. Please add your GEMINI_API_KEY to backend/.env and restart the backend.",
        )

    model_name = settings.effective_model
    contents = prepare_gemini_contents(messages)
    system_instruction = system_prompt.strip() if system_prompt and system_prompt.strip() else None

    config = types.GenerateContentConfig(
        system_instruction=system_instruction,
        max_output_tokens=DEFAULT_MAX_OUTPUT_TOKENS,
        temperature=0.7,
    )

    gemini_client = client or get_gemini_client()

    try:
        response = await gemini_client.aio.models.generate_content(
            model=model_name,
            contents=contents,
            config=config,
        )

        content = response.text or ""

        return ChatResponse(
            role="assistant",
            content=content,
            model=model_name,
        )

    except Exception as e:
        status_code, error_detail = map_gemini_exception(e, model_name)
        raise HTTPException(status_code=status_code, detail=error_detail)
