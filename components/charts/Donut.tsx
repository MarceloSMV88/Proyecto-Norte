'use client'
import { clpShort } from '@/lib/utils'

interface DonutSegment { label: string; value: number; color: string }

export default function Donut({ data, size = 120 }: { data: DonutSegment[]; size?: number }) {
  const total = data.reduce((s, d) => s + Math.abs(d.value), 0) || 1
  const r = 40; const cx = 60; const cy = 60; const stroke = 12
  let offset = 0

  const colorMap: Record<string, string> = {
    emerald: '#34c98a', blue: '#4f93f5', violet: '#9b8cf0',
    amber: '#e6b25a', red: '#ef7a63', slate: '#7c8893',
  }

  const circumference = 2 * Math.PI * r

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
      <svg width={size} height={size} viewBox="0 0 120 120" style={{ flexShrink: 0 }}>
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--surface-3)" strokeWidth={stroke} />
        {data.map((seg, i) => {
          const pct = Math.abs(seg.value) / total
          const dash = pct * circumference
          const gap = circumference - dash
          const rotation = (offset * 360) - 90
          offset += pct
          const color = colorMap[seg.color] || seg.color
          return (
            <circle key={i} cx={cx} cy={cy} r={r} fill="none"
              stroke={color} strokeWidth={stroke}
              strokeDasharray={`${dash} ${gap}`}
              strokeDashoffset={0}
              transform={`rotate(${rotation} ${cx} ${cy})`}
              strokeLinecap="round"
              style={{ transition: 'stroke-dasharray .5s ease' }}
            />
          )
        })}
      </svg>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {data.slice(0, 5).map((seg, i) => {
          const color = colorMap[seg.color] || seg.color
          return (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: color, flexShrink: 0 }} />
              <span style={{ fontSize: 12, color: 'var(--text-2)', fontFamily: 'var(--font-ui)' }}>{seg.label}</span>
              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', fontFamily: 'var(--font-ui)', marginLeft: 'auto' }}>
                {clpShort(seg.value)}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
