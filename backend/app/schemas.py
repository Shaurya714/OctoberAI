from typing import List, Literal, Optional
from pydantic import BaseModel, Field, field_validator

RoleType = Literal["user", "assistant", "system"]


class ChatMessage(BaseModel):
    role: RoleType
    content: str = Field(..., min_length=1, max_length=4000)

    @field_validator("content")
    @classmethod
    def content_must_not_be_blank(cls, v: str) -> str:
        trimmed = v.strip()
        if not trimmed:
            raise ValueError("Message content must not be blank")
        return trimmed


class ChatRequest(BaseModel):
    messages: List[ChatMessage] = Field(..., min_length=1, max_length=30)
    system_prompt: Optional[str] = Field(
        default="You are OctoberAI, a minimalist, helpful, and concise desktop AI companion. Provide clear, direct, and thoughtful answers.",
        max_length=2000,
    )
    stream: bool = True


class ChatResponse(BaseModel):
    role: Literal["assistant"] = "assistant"
    content: str
    model: str


class HealthResponse(BaseModel):
    status: str = "ok"
    gemini_configured: bool
