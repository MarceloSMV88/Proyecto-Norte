'use client'
import { clp } from '@/lib/utils'

interface StatCardProps {
  label: string
  value: number
  delta?: number
  deltaLabel?: string
  valueColor?: string
  spark?: number[]
}

export default function StatCard({ label, value, delta, deltaLabel, valueColor, spark }: StatCardProps) {
  const positive = delta !== undefined ? delta >= 0 : null
  const deltaColor = positive === null ? 'var(--text-faint)' : positive ? 'var(--ok)' : 'var(--danger)'

  return (
    <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-2)', fontFamily: 'var(--font-ui)', textTransform: 'uppercase', letterSpacing: '.5px' }}>
        {label}
      </span>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 8 }}>
        <span style={{ fontSize: 24, fontWeight: 700, fontFamily: 'var(--font-ui)', letterSpacing: '-1px', color: valueColor || 'var(--text)', lineHeight: 1 }}>
          {clp(value)}
        </span>
        {spark && <SparkLine data={spark} />}
      </div>
      {delta !== undefined && (
        <span style={{ fontSize: 12, color: deltaColor, fontFamily: 'var(--font-ui)', fontWeight: 500 }}>
          {positive ? '↑' : '↓'} {clp(Math.abs(delta))} {deltaLabel}
        </span>
      )}
    </div>
  )
}

function SparkLine({ data }: { data: number[] }) {
  if (!data.length) return null
  const max = Math.max(...data, 1)
  const h = 32, w = 80
  const pts = data.map((v, i) => `${(i / (data.length - 1)) * w},${h - (v / max) * h}`)
  return (
    <svg width={w} height={h} style={{ flexShrink: 0 }}>
      <polyline
        points={pts.join(' ')}
        fill="none"
        stroke="var(--accent)"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity={0.7}
      />
    </svg>
  )
}
