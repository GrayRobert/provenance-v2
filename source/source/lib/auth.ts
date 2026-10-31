// Local-first version: no accounts, no tokens. Kept as a tiny compatibility
// shim for components that still import these helpers.
export function setAuthToken(_token: string): void {}

export function getAuthToken(): string | null {
  return null;
}

/** Local-first version: always authenticated as the local user. */
export function isAuthenticated(): boolean {
  return true;
}
