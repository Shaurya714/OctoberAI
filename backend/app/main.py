import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.schemas import HealthResponse
from app.api.chat import router as chat_router

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("octoberai.backend")


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Starting OctoberAI backend service...")
    if settings.is_gemini_configured:
        logger.info(f"Gemini API key detected. Active model: {settings.effective_model}")
    else:
        logger.warning(
            "GEMINI_API_KEY is not configured in backend/.env. "
            "Backend will run in configuration-pending mode."
        )
    yield
    logger.info("Shutting down OctoberAI backend service...")


app = FastAPI(
    title="OctoberAI Backend",
    description="FastAPI backend service powering OctoberAI companion with Google Gemini API integration",
    version="0.3.0",
    lifespan=lifespan,
)

# Enable CORS for desktop and local dev clients
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)


@app.get("/health", response_model=HealthResponse, tags=["health"])
async def health_check() -> HealthResponse:
    """
    Reports backend operational status and whether Gemini credentials are set.
    Never exposes secrets, tokens, or credential contents.
    """
    return HealthResponse(
        status="ok",
        gemini_configured=settings.is_gemini_configured,
    )


# Mount Chat endpoints
app.include_router(chat_router)
