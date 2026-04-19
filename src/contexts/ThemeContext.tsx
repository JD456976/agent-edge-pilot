import React, { createContext, useContext, useEffect, useState } from 'react';

type Theme = 'dark' | 'light';
export type Skin = 'command-center' | 'luxury' | 'field-agent';

interface ThemeContextType {
  theme: Theme;
  skin: Skin;
  setTheme: (t: Theme) => void;
  setSkin: (s: Skin) => void;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const SKIN_META: Record<Skin, { label: string; description: string }> = {
  'command-center': { label: 'Command Center', description: 'Bloomberg-inspired, data-dense with blue accents' },
  'luxury': { label: 'Dark Luxury', description: 'Linear-inspired, minimal with glass depth' },
  'field-agent': { label: 'Field Agent', description: 'Warm earthy tones — built for agents on the road' },
};

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(() => {
    const stored = localStorage.getItem('dp-theme');
    return (stored === 'light' || stored === 'dark') ? stored : 'dark';
  });

  const [skin, setSkinState] = useState<Skin>(() => {
    const stored = localStorage.getItem('dp-skin');
    return (stored === 'command-center' || stored === 'luxury' || stored === 'field-agent') ? stored as Skin : 'command-center';
  });

  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove('dark', 'light');
    root.classList.add(theme);
    localStorage.setItem('dp-theme', theme);
  }, [theme]);

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.skin = skin;
    localStorage.setItem('dp-skin', skin);
  }, [skin]);

  const setTheme = (t: Theme) => setThemeState(t);
  const setSkin = (s: Skin) => setSkinState(s);
  const toggleTheme = () => setThemeState(prev => prev === 'dark' ? 'light' : 'dark');

  return (
    <ThemeContext.Provider value={{ theme, skin, setTheme, setSkin, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}
