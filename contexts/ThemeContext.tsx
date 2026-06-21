'use client'
import { createContext, useContext, useState, useEffect } from 'react'
import type { AccentColor, Density, Theme } from '@/lib/types'

interface ThemeContextValue {
  theme: Theme
  accent: AccentColor
  density: Density
  setTheme: (t: Theme) => void
  setAccent: (a: AccentColor) => void
  setDensity: (d: Density) => void
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>('dark')
  const [accent, setAccentState] = useState<AccentColor>('emerald')
  const [density, setDensityState] = useState<Density>('normal')

  useEffect(() => {
    const t = (localStorage.getItem('norte-theme') as Theme) || 'dark'
    const a = (localStorage.getItem('norte-accent') as AccentColor) || 'emerald'
    const d = (localStorage.getItem('norte-density') as Density) || 'normal'
    setThemeState(t); setAccentState(a); setDensityState(d)
  }, [])

  const setTheme = (t: Theme) => { setThemeState(t); localStorage.setItem('norte-theme', t) }
  const setAccent = (a: AccentColor) => { setAccentState(a); localStorage.setItem('norte-accent', a) }
  const setDensity = (d: Density) => { setDensityState(d); localStorage.setItem('norte-density', d) }

  const cls = [
    theme === 'light' ? 'theme-light' : '',
    `accent-${accent}`,
    density === 'compact' ? 'dens-compact' : density === 'comfy' ? 'dens-comfy' : '',
  ].filter(Boolean).join(' ')

  useEffect(() => {
    document.body.className = cls
  }, [cls])

  return (
    <ThemeContext.Provider value={{ theme, accent, density, setTheme, setAccent, setDensity }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider')
  return ctx
}
