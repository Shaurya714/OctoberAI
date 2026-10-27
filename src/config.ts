/**
 * Configurable backend endpoint for OctoberAI companion.
 * Defaults to http://127.0.0.1:8000. Can be overridden via VITE_BACKEND_URL.
 */
export const BACKEND_URL =
  (import.meta.env.VITE_BACKEND_URL as string) || 'http://127.0.0.1:8000';
