// Norte — componentes de gráficos (SVG, responsivos, animados)
/* global React */
(function () {
const { useState, useEffect, useRef } = React;

function cvar(name) { return 'var(--c-' + name + ')'; }

// Hook: dispara animación al montar
function useMounted(delay) {
  const [on, setOn] = useState(false);
  useEffect(() => { const t = setTimeout(() => setOn(true), delay || 60); return () => clearTimeout(t); }, []);
  return on;
}

// ─────────────────────────────────────────────
// Área + línea de ritmo (flujo del mes)
// ─────────────────────────────────────────────
function AreaTrend({ flow, pace, labels }) {
  const on = useMounted(120);
  const W = 680, H = 240, padL = 8, padR = 8, padT = 18, padB = 26;
  const max = Math.max.apply(null, flow.concat(pace)) * 1.08;
  const n = flow.length;
  const x = (i) => padL + (i / (n - 1)) * (W - padL - padR);
  const y = (v) => padT + (1 - v / max) * (H - padT - padB);

  const linePts = (arr) => arr.map((v, i) => x(i) + ',' + y(v)).join(' ');
  const areaPath = 'M' + x(0) + ',' + y(flow[0]) + ' L' +
    flow.map((v, i) => x(i) + ',' + y(v)).join(' L') +
    ' L' + x(n - 1) + ',' + (H - padB) + ' L' + x(0) + ',' + (H - padB) + ' Z';

  const flowRef = useRef(null);
  const [len, setLen] = useState(0);
  useEffect(() => { if (flowRef.current) setLen(flowRef.current.getTotalLength()); }, []);

  const lastIdx = n - 1;
  return (
    <svg viewBox={'0 0 ' + W + ' ' + H} className="chart" preserveAspectRatio="none" style={{ width: '100%', height: 'auto', overflow: 'visible' }}>
      <defs>
        <linearGradient id="areaFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.28" />
          <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
        </linearGradient>
      </defs>
      {/* gridlines */}
      {[0.25, 0.5, 0.75, 1].map((g, i) => (
        <line key={i} x1={padL} x2={W - padR} y1={padT + g * (H - padT - padB)} y2={padT + g * (H - padT - padB)}
          stroke="var(--hairline)" strokeWidth="1" />
      ))}
      {/* área */}
      <path d={areaPath} fill="url(#areaFill)" style={{ opacity: on ? 1 : 0, transition: 'opacity .8s ease .3s' }} />
      {/* línea de ritmo ideal (punteada) */}
      <polyline points={linePts(pace)} fill="none" stroke="var(--text-faint)" strokeWidth="1.5"
        strokeDasharray="3 5" strokeLinecap="round" style={{ opacity: on ? 0.7 : 0, transition: 'opacity .6s ease .5s' }} />
      {/* línea de gasto real */}
      <polyline ref={flowRef} points={linePts(flow)} fill="none" stroke="var(--accent)" strokeWidth="2.5"
        strokeLinecap="round" strokeLinejoin="round"
        style={{ strokeDasharray: len, strokeDashoffset: on ? 0 : len, transition: 'stroke-dashoffset 1.1s cubic-bezier(.4,0,.1,1)' }} />
      {/* punto final */}
      <circle cx={x(lastIdx)} cy={y(flow[lastIdx])} r="4.5" fill="var(--accent)"
        style={{ opacity: on ? 1 : 0, transition: 'opacity .4s ease 1.1s' }} />
      <circle cx={x(lastIdx)} cy={y(flow[lastIdx])} r="9" fill="var(--accent)" opacity="0.18"
        style={{ opacity: on ? 0.18 : 0, transition: 'opacity .4s ease 1.1s' }} />
      {/* etiquetas x */}
      {labels.map((l, i) => (
        <text key={i} x={l.x * (W - padL - padR) + padL} y={H - 6} fill="var(--text-faint)" fontSize="11"
          textAnchor="middle" fontFamily="var(--font-ui)">{l.t}</text>
      ))}
    </svg>
  );
}

// ─────────────────────────────────────────────
// Barras pareadas: ingreso vs gasto por mes
// ─────────────────────────────────────────────
function BarPairs({ months, max }) {
  const on = useMounted(150);
  const H = 150;
  return (
    <div className="barpairs">
      {months.map((m, i) => {
        const ih = (m.income / max) * 100;
        const eh = (m.expense / max) * 100;
        return (
          <div className="barpair" key={i} title={m.m}>
            <div className="barpair-cols">
              <div className="bar bar-income" style={{ height: on ? ih + '%' : '0%', transitionDelay: (i * 50) + 'ms' }} />
              <div className={'bar bar-expense' + (m.partial ? ' partial' : '')} style={{ height: on ? eh + '%' : '0%', transitionDelay: (i * 50 + 25) + 'ms' }} />
            </div>
            <span className="barpair-label">{m.m}</span>
          </div>
        );
      })}
    </div>
  );
}

// ─────────────────────────────────────────────
// Donut de categorías
// ─────────────────────────────────────────────
function Donut({ segments, centerTop, centerBottom }) {
  const on = useMounted(180);
  const size = 180, stroke = 22, r = (size - stroke) / 2, c = 2 * Math.PI * r;
  const total = segments.reduce((s, x) => s + x.value, 0);
  let acc = 0;
  return (
    <div className="donut-wrap">
      <svg viewBox={'0 0 ' + size + ' ' + size} className="donut">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--hairline)" strokeWidth={stroke} />
        {segments.map((s, i) => {
          const frac = s.value / total;
          const dash = frac * c;
          const off = acc;
          acc += dash;
          return (
            <circle key={i} cx={size / 2} cy={size / 2} r={r} fill="none"
              stroke={cvar(s.color)} strokeWidth={stroke} strokeLinecap="butt"
              strokeDasharray={dash + ' ' + (c - dash)}
              strokeDashoffset={on ? -off : -off + c * 0.0001}
              style={{
                transform: 'rotate(-90deg)', transformOrigin: 'center',
                opacity: on ? 1 : 0,
                strokeDasharray: on ? (dash + ' ' + (c - dash)) : ('0 ' + c),
                transition: 'stroke-dasharray .9s cubic-bezier(.4,0,.1,1) ' + (i * 70 + 100) + 'ms, opacity .4s ease ' + (i * 70) + 'ms'
              }} />
          );
        })}
      </svg>
      <div className="donut-center">
        <span className="donut-top">{centerTop}</span>
        <span className="donut-bottom">{centerBottom}</span>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// Barra de progreso (presupuesto / metas)
// ─────────────────────────────────────────────
function Progress({ value, max, state, height }) {
  const on = useMounted(100);
  const pct = Math.min(100, (value / max) * 100);
  const over = value > max;
  const cls = state || (over ? 'red' : pct > 88 ? 'amber' : 'emerald');
  return (
    <div className="progress" style={{ height: height || 7 }}>
      <div className={'progress-fill ' + cls} style={{ width: on ? Math.min(100, pct) + '%' : '0%' }} />
      {over && <div className="progress-over" style={{ opacity: on ? 1 : 0 }} />}
    </div>
  );
}

// Mini sparkline (para tarjetas stat)
function Spark({ data, color, up }) {
  const on = useMounted(140);
  const W = 100, H = 30, max = Math.max.apply(null, data), min = Math.min.apply(null, data);
  const x = (i) => (i / (data.length - 1)) * W;
  const y = (v) => H - ((v - min) / (max - min || 1)) * H;
  const pts = data.map((v, i) => x(i) + ',' + y(v)).join(' ');
  const ref = useRef(null);
  const [len, setLen] = useState(0);
  useEffect(() => { if (ref.current) setLen(ref.current.getTotalLength()); }, []);
  return (
    <svg viewBox={'0 0 ' + W + ' ' + H} className="spark" preserveAspectRatio="none">
      <polyline ref={ref} points={pts} fill="none" stroke={cvar(color || 'emerald')} strokeWidth="2"
        strokeLinecap="round" strokeLinejoin="round"
        style={{ strokeDasharray: len, strokeDashoffset: on ? 0 : len, transition: 'stroke-dashoffset 1s ease .2s' }} />
    </svg>
  );
}

Object.assign(window, { AreaTrend, BarPairs, Donut, Progress, Spark, useMounted, cvar });
})();
