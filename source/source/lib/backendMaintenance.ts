import axios from 'axios';

/**
 * True when the request never reached a valid HTTP response (connection failed, CORS, offline, etc.)
 * or was explicitly a network failure. Used to show a maintenance overlay in production.
 */
export function isBackendUnreachableError(error: unknown): boolean {
  if (!axios.isAxiosError(error)) return false;
  if (axios.isCancel(error)) return false;
  if (error.response != null) return false;
  if (error.code === 'ERR_NETWORK' || error.message === 'Network Error') return true;
  // Request was sent but no response (typical when API host is down)
  return error.request != null;
}

let unreachable = false;
const listeners = new Set<() => void>();

function emit(): void {
  for (const l of listeners) l();
}

export function notifyBackendUnreachable(): void {
  if (unreachable) return;
  unreachable = true;
  emit();
}

export function clearBackendUnreachable(): void {
  if (!unreachable) return;
  unreachable = false;
  emit();
}

export function getBackendUnreachable(): boolean {
  return unreachable;
}

export function subscribeBackendUnreachable(onChange: () => void): () => void {
  listeners.add(onChange);
  return () => listeners.delete(onChange);
}

/** Called from the API error interceptor (production only). */
export function notifyBackendUnreachableIfNeeded(error: unknown): void {
  if (typeof window === 'undefined' || process.env.NODE_ENV !== 'production') return;
  if (!isBackendUnreachableError(error)) return;
  notifyBackendUnreachable();
}
