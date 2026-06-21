'use client'

interface Bar { m: string; income: number; expense: number; partial?: boolean }

export default function BarPairs({ data }: { data: Bar[] }) {
  if (!data.length) return <div style={{ height: 168 }} />
  const max = Math.max(...data.flatMap(d => [d.income, d.expense]), 1)
  const h = 140

  return (
    <div className="barpairs">
      {data.map((d, i) => (
        <div key={i} className="barpair">
          <div className="barpair-cols">
            <div className={`bar bar-income`} style={{ height: Math.max(2, (d.income / max) * h), opacity: d.partial ? 0.65 : 1 }} />
            <div className={`bar bar-expense${d.partial ? ' partial' : ''}`} style={{ height: Math.max(2, (d.expense / max) * h), opacity: d.partial ? 0.65 : 1 }} />
          </div>
          <span className="barpair-label">{d.m}</span>
        </div>
      ))}
    </div>
  )
}
