// src/lib/store.ts
import { create } from 'zustand';
import type { User } from '../types';

interface AuthState {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  setAuth: (user: User, token: string) => void;
  logout: () => void;
  setLoading: (v: boolean) => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  token: localStorage.getItem('thyro_token'),
  isLoading: true,
  setAuth: (user, token) => {
    localStorage.setItem('thyro_token', token);
    set({ user, token, isLoading: false });
  },
  logout: () => {
    localStorage.removeItem('thyro_token');
    set({ user: null, token: null, isLoading: false });
    window.location.href = '/login';
  },
  setLoading: (v) => set({ isLoading: v }),
}));
