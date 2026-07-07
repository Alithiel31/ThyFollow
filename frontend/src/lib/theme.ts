// src/lib/theme.ts — gestion du thème (auto / clair / sombre)
//
// Principe : on pose (ou retire) l'attribut data-theme sur <html>.
// - 'auto'  → pas d'attribut : le CSS suit prefers-color-scheme
// - 'light' / 'dark' → attribut posé : le CSS force le jeu de tokens
// Le choix est persisté dans localStorage pour survivre au rechargement.

import { create } from 'zustand';

export type ThemeMode = 'auto' | 'light' | 'dark';

const STORAGE_KEY = 'thyro_theme';

function applyTheme(mode: ThemeMode) {
  const root = document.documentElement;
  if (mode === 'auto') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', mode);
}

function initialMode(): ThemeMode {
  const saved = localStorage.getItem(STORAGE_KEY);
  return saved === 'light' || saved === 'dark' ? saved : 'auto';
}

interface ThemeState {
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
  cycle: () => void; // auto → clair → sombre → auto
}

export const useThemeStore = create<ThemeState>((set, get) => ({
  mode: initialMode(),
  setMode: (mode) => {
    localStorage.setItem(STORAGE_KEY, mode);
    applyTheme(mode);
    set({ mode });
  },
  cycle: () => {
    const order: ThemeMode[] = ['auto', 'light', 'dark'];
    const next = order[(order.indexOf(get().mode) + 1) % order.length];
    get().setMode(next);
  },
}));

// Application immédiate au chargement du module (avant le premier rendu React)
applyTheme(initialMode());
