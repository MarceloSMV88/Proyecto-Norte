'use client'

interface ProgressRingProps {
  pct: number // 0–1
  size?: number
  stroke?: number
  color?: string
  label?: string
  sublabel?: string
}

export default function ProgressRing({ pct, size = 80, stroke = 8, color = 'var(--accent)', label, sublabel }: ProgressRingProps) {
  const r = (size - stroke) / 2
  const cx = size / 2
  const circum = 2 * Math.PI * r
  const filled = Math.min(1, Math.max(0, pct)) * circum

  return (
    <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={cx} cy={cx} r={r} fill="none" stroke="var(--surface-3)" strokeWidth={stroke} />
        <circle cx={cx} cy={cx} r={r} fill="none" stroke={color} strokeWidth={stroke}
          strokeDasharray={`${filled} ${circum - filled}`}
          strokeLinecap="round"
          style={{ transition: 'stroke-dasharray .5s ease' }}
        />
      </svg>
      {(label || sublabel) && (
        <div style={{
          position: 'absolute', inset: 0,
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          textAlign: 'center',
        }}>
          {label && <span style={{ fontSize: size * 0.19, fontWeight: 700, fontFamily: 'var(--font-ui)', color: 'var(--text)', lineHeight: 1 }}>{label}</span>}
          {sublabel && <span style={{ fontSize: size * 0.14, color: 'var(--text-faint)', lineHeight: 1.2 }}>{sublabel}</span>}
        </div>
      )}
    </div>
  )
}
