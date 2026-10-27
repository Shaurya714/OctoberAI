import { BACKEND_URL } from '../config';

export interface BackendChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface ChatApiResponse {
  role: 'assistant';
  content: string;
  model: string;
}

export interface HealthCheckResponse {
  status: string;
  gemini_configured: boolean;
}

export async function checkBackendHealth(): Promise<HealthCheckResponse> {
  const response = await fetch(`${BACKEND_URL}/health`);
  if (!response.ok) {
    throw new Error(`Health check returned status ${response.status}`);
  }
  return response.json();
}

export async function sendChatMessage(messages: BackendChatMessage[]): Promise<ChatApiResponse> {
  let response: Response;

  try {
    response = await fetch(`${BACKEND_URL}/api/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ messages }),
    });
  } catch (err) {
    // Network failure when backend process is not active or unreachable
    throw new Error(
      `Cannot connect to OctoberAI backend at ${BACKEND_URL}. Please ensure the FastAPI server is running.`
    );
  }

  if (!response.ok) {
    let errorDetail = 'An error occurred while communicating with the AI service.';
    try {
      const errorJson = await response.json();
      if (errorJson.detail) {
        if (typeof errorJson.detail === 'string') {
          errorDetail = errorJson.detail;
        } else if (Array.isArray(errorJson.detail)) {
          errorDetail = errorJson.detail.map((d: any) => d.msg || JSON.stringify(d)).join(', ');
        }
      }
    } catch {
      errorDetail = `Server returned error (${response.status}): ${response.statusText}`;
    }
    throw new Error(errorDetail);
  }

  return response.json();
}
