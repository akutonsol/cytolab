'use client';

import { createContext, useContext, useEffect, useState } from 'react';

export interface ThemeDef { id: string; name: string; color: string }

export const themes: ThemeDef[] = [
  { id: 'indigo', name: 'Indigo', color: '#4F46E5' },
  { id: 'emerald', name: 'Emerald', color: '#059669' },
  { id: 'violet', name: 'Violet', color: '#7C3AED' },
  { id: 'rose', name: 'Rose', color: '#E11D48' },
  { id: 'ocean', name: 'Ocean', color: '#3f97ef' },
  { id: 'sky', name: 'Sky', color: '#0798ff' },
  { id: 'cobalt', name: 'Cobalt', color: '#153ac9' },
  { id: 'slate', name: 'Professional', color: '#334155' },
  { id: 'dark', name: 'Dark', color: '#0F172A' },
];

const STORAGE_KEY = 'cytolab-theme';
const DEFAULT = 'indigo';
const isValid = (id: string | null): id is string => !!id && themes.some((t) => t.id === id);

interface Ctx { currentTheme: string; setTheme: (id: string) => void; themes: ThemeDef[] }
const ThemeContext = createContext<Ctx>({ currentTheme: DEFAULT, setTheme: () => {}, themes });

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [currentTheme, setCurrent] = useState(DEFAULT);

  // Hydrate from localStorage (an inline <head> script already set the attribute
  // pre-paint to avoid a flash; this just syncs React state).
  useEffect(() => {
    const saved = typeof window !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null;
    const next = isValid(saved) ? saved : DEFAULT;
    setCurrent(next);
    document.documentElement.setAttribute('data-theme', next);
  }, []);

  const setTheme = (id: string) => {
    if (!isValid(id)) return;
    setCurrent(id);
    document.documentElement.setAttribute('data-theme', id);
    try { localStorage.setItem(STORAGE_KEY, id); } catch { /* storage blocked */ }
  };

  return <ThemeContext.Provider value={{ currentTheme, setTheme, themes }}>{children}</ThemeContext.Provider>;
}

export const useTheme = () => useContext(ThemeContext);
