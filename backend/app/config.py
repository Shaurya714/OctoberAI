from pathlib import Path
from typing import List
from pydantic_settings import BaseSettings, SettingsConfigDict

# Resolve backend root directory (where .env lives)
BASE_DIR = Path(__file__).resolve().parent.parent
ENV_FILE = BASE_DIR / ".env"

# Recommended and actively supported model for Gemini API
DEFAULT_GEMINI_MODEL = "gemini-3.8-flash"


class Settings(BaseSettings):
    gemini_api_key: str = ""
    gemini_model: str = DEFAULT_GEMINI_MODEL
    backend_host: str = "127.0.0.1"
    backend_port: int = 8000
    cors_origins: List[str] = [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:8000",
        "http://127.0.0.1:8000",
        "app://-",
    ]

    model_config = SettingsConfigDict(
        env_file=str(ENV_FILE),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    @property
    def is_gemini_configured(self) -> bool:
        """Returns True only when a non-empty GEMINI_API_KEY is configured."""
        return bool(self.gemini_api_key and self.gemini_api_key.strip())

    @property
    def effective_model(self) -> str:
        """Returns the configured model, or falls back to DEFAULT_GEMINI_MODEL."""
        if self.gemini_model and self.gemini_model.strip():
            model = self.gemini_model.strip()
            # Automatically upgrade deprecated/unavailable model to supported default
            if model in ("gemini-2.5-flash", "models/gemini-2.5-flash"):
                return DEFAULT_GEMINI_MODEL
            return model
        return DEFAULT_GEMINI_MODEL


# Instantiate global settings singleton
settings = Settings()
