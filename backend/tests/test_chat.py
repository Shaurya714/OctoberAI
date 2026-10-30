import json
from unittest.mock import AsyncMock, MagicMock, patch
import pytest
from fastapi.testclient import TestClient
import httpx
from google.genai import errors

from app.main import app
from app.config import settings
from app.schemas import ChatMessage
from app.services.gemini_service import prepare_gemini_contents

client = TestClient(app)


def test_chat_missing_api_key_blocks_gemini_queries(monkeypatch):
    """Verifies that calling /api/chat with a query requiring Gemini returns 503 if GEMINI_API_KEY is missing."""
    monkeypatch.setattr(settings, "gemini_api_key", "")
    payload = {
        "messages": [
            {"role": "user", "content": "Explain entropy in thermodynamics in detail"}
        ],
        "stream": False,
    }
    response = client.post("/api/chat", json=payload)
    assert response.status_code == 503
    data = response.json()
    assert "detail" in data
    assert "GEMINI_API_KEY" in data["detail"]


def test_chat_missing_api_key_still_allows_local_responses(monkeypatch):
    """Verifies that local conversation engine answers greetings even if GEMINI_API_KEY is not configured."""
    monkeypatch.setattr(settings, "gemini_api_key", "")
    payload = {
        "messages": [
            {"role": "user", "content": "Hi"}
        ],
        "stream": False,
    }
    response = client.post("/api/chat", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data["role"] == "assistant"
    assert "Hi!" in data["content"]
    assert data["model"] == "local"


@pytest.mark.parametrize(
    "invalid_payload",
    [
        {"messages": []},  # empty message list
        {"messages": [{"role": "user", "content": "   "}]},  # blank whitespace
        {"messages": [{"role": "admin", "content": "Hello"}]},  # invalid role
        {"messages": [{"role": "user", "content": "A" * 4001}]},  # exceeds max length
        {},  # missing messages
    ],
)
def test_chat_invalid_requests(invalid_payload):
    """Verifies that malformed or non-compliant payloads are rejected with 422."""
    response = client.post("/api/chat", json=invalid_payload)
    assert response.status_code == 422


def test_chat_local_stream_response():
    """Verifies that local engine response is streamed immediately via SSE."""
    payload = {
        "messages": [{"role": "user", "content": "who are you"}],
        "stream": True,
    }
    response = client.post("/api/chat", json=payload)
    assert response.status_code == 200
    assert "text/event-stream" in response.headers.get("content-type", "")

    # Parse SSE lines
    lines = [line.strip() for line in response.text.split("\n") if line.strip().startswith("data: ")]
    assert len(lines) == 1
    event_data = json.loads(lines[0][6:])
    assert event_data["done"] is True
    assert event_data["model"] == "local"
    assert "OctoberAI" in event_data["text"]


def test_chat_successful_mocked_streaming(monkeypatch):
    """Verifies successful streamed response with multiple chunks."""
    monkeypatch.setattr(settings, "gemini_api_key", "test_gemini_valid_key")
    monkeypatch.setattr(settings, "gemini_model", "gemini-3.8-flash")

    # Create mock chunks
    chunk1 = MagicMock()
    chunk1.text = "Hello "
    chunk2 = MagicMock()
    chunk2.text = "from "
    chunk3 = MagicMock()
    chunk3.text = "Gemini!"

    async def mock_stream_gen(*args, **kwargs):
        for c in [chunk1, chunk2, chunk3]:
            yield c

    mock_client = MagicMock()
    mock_client.aio.models.generate_content_stream = AsyncMock(side_effect=mock_stream_gen)

    with patch("app.services.gemini_service.get_gemini_client", return_value=mock_client):
        response = client.post(
            "/api/chat",
            json={
                "messages": [
                    {"role": "user", "content": "Explain machine learning in simple terms"}
                ],
                "stream": True,
            },
        )

        assert response.status_code == 200
        assert "text/event-stream" in response.headers.get("content-type", "")

        lines = [line.strip() for line in response.text.split("\n") if line.strip().startswith("data: ")]
        assert len(lines) >= 4  # 3 content chunks + 1 done chunk

        chunks = [json.loads(line[6:]) for line in lines]
        text_received = "".join(c.get("text", "") for c in chunks)
        assert text_received == "Hello from Gemini!"
        assert chunks[-1]["done"] is True
        assert chunks[-1]["model"] == "gemini-3.8-flash"


def test_chat_successful_mocked_non_streaming(monkeypatch):
    """Verifies non-streaming response when stream=False is passed."""
    monkeypatch.setattr(settings, "gemini_api_key", "test_gemini_valid_key")
    monkeypatch.setattr(settings, "gemini_model", "gemini-3.8-flash")

    mock_response = MagicMock()
    mock_response.text = "This is a non-streamed Gemini response."

    mock_client = MagicMock()
    mock_client.aio.models.generate_content = AsyncMock(return_value=mock_response)

    with patch("app.services.gemini_service.get_gemini_client", return_value=mock_client):
        response = client.post(
            "/api/chat",
            json={
                "messages": [
                    {"role": "user", "content": "Explain recursion in programming"}
                ],
                "stream": False,
            },
        )

        assert response.status_code == 200
        data = response.json()
        assert data["role"] == "assistant"
        assert data["content"] == "This is a non-streamed Gemini response."
        assert data["model"] == "gemini-3.8-flash"


def test_chat_interrupted_stream_emits_error(monkeypatch):
    """Verifies that an error occurring during chunk generation yields an error event safely."""
    monkeypatch.setattr(settings, "gemini_api_key", "test_gemini_valid_key")

    async def failing_stream_gen(*args, **kwargs):
        chunk = MagicMock()
        chunk.text = "Partial beginning... "
        yield chunk
        raise errors.APIError(500, {"error": {"message": "Stream connection broken by provider."}})

    mock_client = MagicMock()
    mock_client.aio.models.generate_content_stream = AsyncMock(side_effect=failing_stream_gen)

    with patch("app.services.gemini_service.get_gemini_client", return_value=mock_client):
        response = client.post(
            "/api/chat",
            json={
                "messages": [{"role": "user", "content": "Calculate value of pi to 100 digits"}],
                "stream": True,
            },
        )
        assert response.status_code == 200
        lines = [line.strip() for line in response.text.split("\n") if line.strip().startswith("data: ")]
        chunks = [json.loads(line[6:]) for line in lines]
        # Should have the partial chunk, then an error chunk with done: true
        assert any("error" in c for c in chunks)
        error_chunk = [c for c in chunks if "error" in c][0]
        assert error_chunk["done"] is True
        assert "encountered an error" in error_chunk["error"].lower()


def test_chat_model_not_found_404_error(monkeypatch):
    """Verifies that upstream Gemini 404 model availability error is reported as HTTP 404 in non-streaming."""
    monkeypatch.setattr(settings, "gemini_api_key", "test_gemini_valid_key")

    error_response = errors.APIError(
        404,
        {
            "error": {
                "message": "This model models/gemini-2.5-flash is no longer available to new users. Please update your code to use models/gemini-3.8-flash"
            }
        },
    )
    mock_client = MagicMock()
    mock_client.aio.models.generate_content = AsyncMock(side_effect=error_response)

    with patch("app.services.gemini_service.get_gemini_client", return_value=mock_client):
        response = client.post(
            "/api/chat",
            json={
                "messages": [{"role": "user", "content": "Tell me about Mars"}],
                "stream": False,
            },
        )
        assert response.status_code == 404
        data = response.json()
        assert "detail" in data
        assert "model" in data["detail"].lower()


def test_chat_rate_limit_error(monkeypatch):
    """Verifies that Gemini APIError with 429 quota exhaustion maps to HTTP 429 in non-streaming."""
    monkeypatch.setattr(settings, "gemini_api_key", "test_gemini_valid_key")

    error_response = errors.APIError(429, {"error": {"message": "Resource has been exhausted (quota)."}})
    mock_client = MagicMock()
    mock_client.aio.models.generate_content = AsyncMock(side_effect=error_response)

    with patch("app.services.gemini_service.get_gemini_client", return_value=mock_client):
        response = client.post(
            "/api/chat",
            json={
                "messages": [{"role": "user", "content": "Testing rate limit"}],
                "stream": False,
            },
        )
        assert response.status_code == 429
        assert "rate limit" in response.json()["detail"].lower() or "quota" in response.json()["detail"].lower()


def test_chat_auth_error(monkeypatch):
    """Verifies that Gemini APIError with 400/401 invalid key maps to HTTP 401."""
    monkeypatch.setattr(settings, "gemini_api_key", "test_gemini_invalid_key")

    error_response = errors.APIError(400, {"error": {"message": "API key not valid. Please pass a valid API key."}})
    mock_client = MagicMock()
    mock_client.aio.models.generate_content = AsyncMock(side_effect=error_response)

    with patch("app.services.gemini_service.get_gemini_client", return_value=mock_client):
        response = client.post(
            "/api/chat",
            json={
                "messages": [{"role": "user", "content": "Testing auth failure"}],
                "stream": False,
            },
        )
        assert response.status_code == 401
        assert "unauthorized" in response.json()["detail"].lower() or "invalid" in response.json()["detail"].lower()


def test_chat_connection_error(monkeypatch):
    """Verifies that network connection failures map to HTTP 503."""
    monkeypatch.setattr(settings, "gemini_api_key", "test_gemini_valid_key")

    mock_client = MagicMock()
    mock_client.aio.models.generate_content = AsyncMock(
        side_effect=httpx.ConnectError("Connection refused by remote host")
    )

    with patch("app.services.gemini_service.get_gemini_client", return_value=mock_client):
        response = client.post(
            "/api/chat",
            json={
                "messages": [{"role": "user", "content": "Testing connection failure"}],
                "stream": False,
            },
        )
        assert response.status_code == 503
        assert "unable to reach" in response.json()["detail"].lower() or "connect" in response.json()["detail"].lower()


def test_chat_server_error(monkeypatch):
    """Verifies that Gemini internal 500 error maps to HTTP 502 Bad Gateway."""
    monkeypatch.setattr(settings, "gemini_api_key", "test_gemini_valid_key")

    error_response = errors.APIError(500, {"error": {"message": "Internal server error."}})
    mock_client = MagicMock()
    mock_client.aio.models.generate_content = AsyncMock(side_effect=error_response)

    with patch("app.services.gemini_service.get_gemini_client", return_value=mock_client):
        response = client.post(
            "/api/chat",
            json={
                "messages": [{"role": "user", "content": "Testing 500 failure"}],
                "stream": False,
            },
        )
        assert response.status_code == 502
        assert "encountered an error" in response.json()["detail"].lower()


def test_conversation_history_handling():
    """Verifies that prepare_gemini_contents bounds history and ensures the first message is a user message."""
    raw_messages = [
        ChatMessage(role="assistant", content="Welcome message that shouldn't lead Gemini contents"),
        ChatMessage(role="user", content="First user query"),
        ChatMessage(role="assistant", content="First answer"),
        ChatMessage(role="user", content="Follow-up query"),
    ]
    contents = prepare_gemini_contents(raw_messages)

    assert len(contents) == 3
    assert contents[0].role == "user"
    assert contents[0].parts[0].text == "First user query"
    assert contents[1].role == "model"
    assert contents[2].role == "user"
    assert contents[2].parts[0].text == "Follow-up query"


def test_effective_model_fallback(monkeypatch):
    """Verifies that effective_model auto-upgrades deprecated 2.5-flash and respects custom models."""
    monkeypatch.setattr(settings, "gemini_model", "")
    assert settings.effective_model == "gemini-3.8-flash"

    monkeypatch.setattr(settings, "gemini_model", "gemini-2.5-flash")
    assert settings.effective_model == "gemini-3.8-flash"

    monkeypatch.setattr(settings, "gemini_model", "gemini-3.5-flash-lite")
    assert settings.effective_model == "gemini-3.5-flash-lite"
