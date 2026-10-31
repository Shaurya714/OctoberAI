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

export interface StreamCallbacks {
  onChunk: (chunk: string) => void;
  onComplete: (model?: string) => void;
  onError: (errorMsg: string) => void;
}

export async function checkBackendHealth(): Promise<HealthCheckResponse> {
  const response = await fetch(`${BACKEND_URL}/health`);
  if (!response.ok) {
    throw new Error(`Health check returned status ${response.status}`);
  }
  return response.json();
}

export async function streamChatMessage(
  messages: BackendChatMessage[],
  callbacks: StreamCallbacks,
  signal?: AbortSignal,
): Promise<void> {
  let response: Response;

  try {
    response = await fetch(`${BACKEND_URL}/api/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'text/event-stream',
      },
      body: JSON.stringify({ messages, stream: true }),
      signal,
    });
  } catch (err: any) {
    if (err?.name === 'AbortError') {
      return;
    }
    throw new Error(
      `Cannot connect to October backend at ${BACKEND_URL}. Please ensure the FastAPI server is running.`
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

  if (!response.body) {
    throw new Error('Response body is empty or streaming is not supported.');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith('data: ')) {
          const jsonStr = trimmed.slice(6);
          try {
            const data = JSON.parse(jsonStr);
            if (data.error) {
              callbacks.onError(data.error);
              return;
            }
            if (data.text) {
              callbacks.onChunk(data.text);
            }
            if (data.done) {
              callbacks.onComplete(data.model);
            }
          } catch {
            // Ignore incomplete JSON chunks
          }
        }
      }
    }
  } catch (streamErr: any) {
    if (streamErr?.name === 'AbortError') {
      return;
    }
    callbacks.onError('The connection was interrupted while receiving the AI response.');
  }
}

export async function sendChatMessage(messages: BackendChatMessage[]): Promise<ChatApiResponse> {
  let response: Response;

  try {
    response = await fetch(`${BACKEND_URL}/api/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ messages, stream: false }),
    });
  } catch {
    throw new Error(
      `Cannot connect to October backend at ${BACKEND_URL}. Please ensure the FastAPI server is running.`
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
