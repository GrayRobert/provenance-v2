// Local-first version: no Clerk. Components that coordinate with the token
// provider get inert defaults.
export const clerkTokenReady = true;
export const clerkSignedIn = true;
export const clerkUserId: string | null = 'local-user';

export type ClerkTokenProviderHandlers = {
  getToken: (() => Promise<string | null>) | null;
  signOut: (() => void) | null;
  isSignedIn: (() => boolean) | null;
  userId: (() => string | null) | null;
};

export function setClerkTokenProvider(_handlers: ClerkTokenProviderHandlers): void {}

export async function getClerkToken(): Promise<string | null> {
  return null;
}

export function getClerkSignOut(): (() => void) | null {
  return null;
}

export function getClerkIsSignedIn(): boolean {
  return true;
}

export function getClerkUserId(): string | null {
  return 'local-user';
}
