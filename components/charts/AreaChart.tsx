'use client'

interface AreaChartProps {
  data: number[]
  pace: number[]
  height?: number
}

export default function AreaChart({ data, pace, height = 160 }: AreaChartProps) {
  if (!data.length) return null
  const w = 600
  const h = height
  const max = Math.max(...data, ...pace, 1)
  const px = (i: number) => (i / (data.length - 1)) * w
  const py = (v: number) => h - (v / max) * (h - 12) - 4

  const area = data.map((v, i) => `${px(i)},${py(v)}`).join(' ')
  const areaFull = `0,${h} ${area} ${w},${h}`
  const paceLine = pace.map((v, i) => `${(i / (pace.length - 1)) * w},${py(v)}`).join(' ')

  return (
    <svg viewBox={`0 0 ${w} ${h}`} style={{ width: '100%', height }} preserveAspectRatio="none">
      <defs>
        <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.22" />
          <stop offset="100%" stopColor="var(--accent)" stopOpacity="0.01" />
        </linearGradient>
      </defs>
      <polygon points={areaFull} fill="url(#areaGrad)" />
      <polyline points={area} fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <polyline points={paceLine} fill="none" stroke="var(--text-faint)" strokeWidth="1.5" strokeDasharray="5,4" strokeLinecap="round" />
    </svg>
  )
}
