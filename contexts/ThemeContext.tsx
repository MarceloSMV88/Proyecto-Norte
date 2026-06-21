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
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    const t = (localStorage.getItem('norte-theme') as Theme) || 'dark'
    const a = (localStorage.getItem('norte-accent') as AccentColor) || 'emerald'
    const d = (localStorage.getItem('norte-density') as Density) || 'normal'
    setThemeState(t); setAccentState(a); setDensityState(d)
    setMounted(true)
  }, [])

  const setTheme   = (t: Theme)       => { setThemeState(t);   localStorage.setItem('norte-theme', t) }
  const setAccent  = (a: AccentColor) => { setAccentState(a);  localStorage.setItem('norte-accent', a) }
  const setDensity = (d: Density)     => { setDensityState(d); localStorage.setItem('norte-density', d) }

  const cls = [
    'app',
    theme === 'light' ? 'theme-light' : '',
    accent !== 'emerald' ? `accent-${accent}` : '',
    density === 'compact' ? 'dens-compact' : density === 'comfy' ? 'dens-comfy' : '',
    'cards-borde',
  ].filter(Boolean).join(' ')

  return (
    <ThemeContext.Provider value={{ theme, accent, density, setTheme, setAccent, setDensity }}>
      <div className={cls} style={{ minHeight: '100vh' }}>
        {children}
      </div>
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider')
  return ctx
}
