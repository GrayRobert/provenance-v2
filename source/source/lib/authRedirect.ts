/**
 * Safe in-app path to send the user after sign-in (guards against open redirects).
 * Accepts path + optional query, e.g. /songs/abc or /songs/abc?tab=1
 */
export function getSafeRedirectTarget(candidate: string | null | undefined): string | null {
  if (candidate == null || typeof candidate !== 'string') return null;
  const t = candidate.trim();
  if (!t.startsWith('/') || t.startsWith('//')) return null;
  if (t.includes('\\')) return null;
  // Avoid loops / pointless destinations
  if (/^\/(login|register|post-login)(\/|\?|$)/.test(t)) return null;
  return t;
}

/** Build /login href with optional return path and auth error flag. */
export function buildLoginHref(opts: { returnPath?: string | null; errorAuth?: boolean }): string {
  const params = new URLSearchParams();
  if (opts.errorAuth) params.set('error', 'auth');
  const safe = opts.returnPath != null ? getSafeRedirectTarget(opts.returnPath) : null;
  if (safe) params.set('redirect_url', safe);
  const q = params.toString();
  return q ? `/login?${q}` : '/login';
}

/** Clerk redirect after sign-in/up: always hit post-login for trackLogin + role routing, then forward. */
export function buildPostLoginRedirectUrl(returnPath: string | null | undefined): string {
  const safe = getSafeRedirectTarget(returnPath ?? null);
  if (!safe) return '/post-login';
  return `/post-login?redirect_url=${encodeURIComponent(safe)}`;
}

/** Survives OAuth round-trips when Clerk drops query params on redirect to /post-login */
export const POST_LOGIN_RETURN_STORAGE_KEY = 'provenance_post_login_redirect';

export function stashReturnPathAfterLogin(pathWithQuery: string): void {
  if (typeof window === 'undefined') return;
  const safe = getSafeRedirectTarget(pathWithQuery);
  if (!safe) return;
  try {
    sessionStorage.setItem(POST_LOGIN_RETURN_STORAGE_KEY, safe);
  } catch {
    /* ignore */
  }
}

export function takeReturnPathAfterLogin(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(POST_LOGIN_RETURN_STORAGE_KEY);
    sessionStorage.removeItem(POST_LOGIN_RETURN_STORAGE_KEY);
    return getSafeRedirectTarget(raw);
  } catch {
    return null;
  }
}

export function clearStashedReturnPath(): void {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.removeItem(POST_LOGIN_RETURN_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
