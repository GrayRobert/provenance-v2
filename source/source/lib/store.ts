import { create } from 'zustand';
import { User } from './types';

// Local-first version: a single local user, always initialized, no sign-out.
const LOCAL_USER: User = { userId: 'local-user', email: '' };

interface AuthState {
  user: User | null;
  initialized: boolean;
  setUser: (user: User | null) => void;
  initializeAuth: () => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: LOCAL_USER,
  initialized: true,
  setUser: (user) => set({ user }),
  initializeAuth: () => {},
  logout: () => {},
}));

export function useAppReady(): { isReady: boolean } {
  return { isReady: true };
}
