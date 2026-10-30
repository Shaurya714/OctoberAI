# OctoberAI Backend

FastAPI backend service powering the OctoberAI desktop companion using the Google Gemini API.

## Prerequisites

* Python 3.10+ (Python 3.11 recommended)
* Windows PowerShell (or your platform terminal)

## Setup Instructions

### 1. Create and Activate Virtual Environment

From the project root (`OctoberAI/`) or the `backend/` directory:

```powershell
# From project root:
py -3.11 -m venv backend\.venv
.\backend\.venv\Scripts\Activate.ps1
```

Or from the `backend/` folder:

```powershell
cd backend
py -3.11 -m venv .venv
.\.venv\Scripts\Activate.ps1
```

### 2. Install Dependencies

```powershell
pip install -r requirements.txt
```

### 3. Configure API Key

Open `backend/.env` (or copy `.env.example` to `.env`) and add your Google Gemini API key:

```env
GEMINI_API_KEY=AIzaSy_your_actual_gemini_api_key_here
GEMINI_MODEL=gemini-3.8-flash
BACKEND_HOST=127.0.0.1
BACKEND_PORT=8000
```

> **Note**: If `GEMINI_MODEL` is left blank, OctoberAI defaults to `gemini-3.8-flash`. You can also configure other supported Gemini models such as `gemini-3.5-flash-lite`.

### 4. Run the Backend Server

You can run the server from either the project root or the `backend/` directory:

**From project root:**
```powershell
.\backend\.venv\Scripts\python.exe -m uvicorn app.main:app --app-dir backend --host 127.0.0.1 --port 8000 --reload
```

**From `backend/` directory (with venv activated):**
```powershell
uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
```

### 5. Run Backend Tests

```powershell
# From project root:
.\backend\.venv\Scripts\pytest.exe backend\tests -v
```

## API Endpoints

* `GET /health` — Check backend status and whether Gemini credentials are configured (`gemini_configured: bool`), without exposing secrets.
* `POST /api/chat` — Multi-turn conversation endpoint powered by the official Google GenAI SDK.
