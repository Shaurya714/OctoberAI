import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.config import settings

client = TestClient(app)


def test_health_endpoint_no_key(monkeypatch):
    """Verifies that /health reports status ok and gemini_configured=False when key is empty."""
    monkeypatch.setattr(settings, "gemini_api_key", "")
    response = client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert data["gemini_configured"] is False


def test_health_endpoint_with_key(monkeypatch):
    """Verifies that /health reports gemini_configured=True without revealing the secret key."""
    secret_key = "AIzaSyTestGeminiSecretKey12345"
    monkeypatch.setattr(settings, "gemini_api_key", secret_key)
    response = client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert data["gemini_configured"] is True
    # Secret must never appear in payload or response
    assert secret_key not in response.text
