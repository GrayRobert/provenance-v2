// Local-first version: the app is always "signed in" as the local user.
export function useAuthGuard(): { isReady: boolean; authChecked: boolean } {
  return { isReady: true, authChecked: true };
}

/** No-op in the local version: no JWT to expire. */
export function useTokenExpiryGuard(): void {}
