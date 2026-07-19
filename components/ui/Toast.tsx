'use client'
import { createContext, useContext, useState, useCallback } from 'react'

interface ToastContextValue { showToast: (msg: string) => void }
const ToastContext = createContext<ToastContextValue | null>(null)

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [msg, setMsg] = useState<string | null>(null)
  const [closing, setClosing] = useState(false)
  const showToast = useCallback((m: string) => {
    setClosing(false)
    setMsg(m)
    setTimeout(() => setClosing(true), 2600)
  }, [])

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      {msg && (
        <div
          className="toast"
          data-closing={closing || undefined}
          onAnimationEnd={() => { if (closing) setMsg(null) }}
        >
          {msg}
        </div>
      )}
    </ToastContext.Provider>
  )
}

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used within ToastProvider')
  return ctx
}
