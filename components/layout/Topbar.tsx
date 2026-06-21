'use client'
import { Plus } from 'lucide-react'

interface TopbarProps {
  title: string
  subtitle?: string
  action?: { label: string; onClick: () => void }
}

export default function Topbar({ title, subtitle, action }: TopbarProps) {
  return (
    <header className="topbar">
      <div style={{ flex: 1 }}>
        <h1 style={{ fontFamily: 'var(--font-ui)', fontSize: 20, fontWeight: 700, color: 'var(--text)', margin: 0, lineHeight: 1.2 }}>
          {title}
        </h1>
        {subtitle && (
          <p style={{ fontSize: 12, color: 'var(--text-faint)', margin: 0 }}>{subtitle}</p>
        )}
      </div>
      {action && (
        <button
          onClick={action.onClick}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '8px 16px',
            borderRadius: 'var(--radius-sm)',
            background: 'var(--accent)',
            color: '#06140e',
            fontFamily: 'var(--font-ui)',
            fontWeight: 600,
            fontSize: 13.5,
            border: 'none',
            cursor: 'pointer',
            flexShrink: 0,
          }}
        >
          <Plus size={15} />
          {action.label}
        </button>
      )}
    </header>
  )
}
