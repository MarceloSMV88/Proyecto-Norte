'use client'
import { clpShort } from '@/lib/utils'

interface Bar { m: string; income: number; expense: number; partial?: boolean }

export default function BarPairs({ data }: { data: Bar[] }) {
  if (!data.length) return null
  const max = Math.max(...data.flatMap(d => [d.income, d.expense]), 1)
  const h = 100

  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12, height: h + 28, overflowX: 'auto' }}>
      {data.map((d, i) => (
        <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, flex: 1, minWidth: 40 }}>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: h }}>
            <div style={{
              width: 14, height: (d.income / max) * h,
              background: 'var(--ok)', borderRadius: '3px 3px 0 0', opacity: d.partial ? 0.6 : 1,
            }} />
            <div style={{
              width: 14, height: (d.expense / max) * h,
              background: 'var(--danger)', borderRadius: '3px 3px 0 0', opacity: d.partial ? 0.6 : 1,
            }} />
          </div>
          <span style={{ fontSize: 11, color: 'var(--text-faint)', fontFamily: 'var(--font-ui)' }}>{d.m}</span>
        </div>
      ))}
    </div>
  )
}
