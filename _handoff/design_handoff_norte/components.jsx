// Norte — componentes de UI
/* global React, Icon, Progress, Spark, AreaTrend, BarPairs, Donut, cvar */
(function () {
const D = window.NORTE_DATA;
const { useState } = React;
const clp = D.clp, clpShort = D.clpShort;

// ── Marca ──────────────────────────────────────
function Logo({ compact }) {
  return (
    <div className="logo">
      <div className="logo-mark">
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none">
          <path d="M12 2l3.2 6.8L22 12l-6.8 3.2L12 22l-3.2-6.8L2 12l6.8-3.2z"
            fill="var(--accent)" />
          <circle cx="12" cy="12" r="2.4" fill="var(--surface)" />
        </svg>
      </div>
      {!compact && <span className="logo-word">Norte</span>}
    </div>
  );
}

// ── Sidebar ────────────────────────────────────
const NAV = [
  { id: 'resumen', label: 'Resumen', icon: 'grid' },
  { id: 'presupuesto', label: 'Presupuesto', icon: 'layers' },
  { id: 'movimientos', label: 'Movimientos', icon: 'swap' },
  { id: 'metas', label: 'Metas', icon: 'flag' },
  { id: 'cuentas', label: 'Cuentas', icon: 'wallet' },
  { id: 'habitos', label: 'Hábitos', icon: 'pulse' }
];
function Sidebar({ active, onNav, user }) {
  user = user || { initials: 'CR', full: 'Camila Rojas', role: 'Administradora', color: 'emerald' };
  return (
    <aside className="sidebar">
      <Logo />
      <nav className="nav">
        {NAV.map(n => (
          <button key={n.id} className={'nav-item' + (active === n.id ? ' active' : '')} onClick={() => onNav(n.id)}>
            <Icon name={n.icon} size={19} />
            <span>{n.label}</span>
            {n.id === 'presupuesto' && <span className="nav-dot" />}
          </button>
        ))}
      </nav>
      <div className="sidebar-foot">
        <button className={'nav-item' + (active === 'ajustes' ? ' active' : '')} onClick={() => onNav('ajustes')}><Icon name="settings" size={19} /><span>Ajustes</span></button>
        <button className="user" onClick={() => onNav('ajustes')} title="Cambiar de perfil">
          <div className={'avatar av-' + user.color}>{user.initials}</div>
          <div className="user-meta">
            <span className="user-name">{user.full}</span>
            <span className="user-sub">{user.role}</span>
          </div>
          <Icon name="chevdown" size={15} className="user-chev" />
        </button>
      </div>
    </aside>
  );
}

// ── Topbar ─────────────────────────────────────
function Topbar({ month, onMonth, onAdd, view, onView, meta, action }) {
  return (
    <header className="topbar">
      <div className="topbar-l">
        <div>
          <h1 className="greet">{meta.title}</h1>
          <p className="greet-sub">{meta.sub}</p>
        </div>
      </div>
      <div className="topbar-r">
        <div className="month-pick">
          <button className="icon-btn" onClick={() => onMonth(-1)} aria-label="Mes anterior"><Icon name="chevright" size={18} style={{ transform: 'rotate(180deg)' }} /></button>
          <span className="month-label"><Icon name="calendar" size={15} />{month}</span>
          <button className="icon-btn" onClick={() => onMonth(1)} aria-label="Mes siguiente"><Icon name="chevright" size={18} /></button>
        </div>
        <button className="icon-btn ghost" aria-label="Buscar"><Icon name="search" size={18} /></button>
        <button className="icon-btn ghost bell" aria-label="Alertas"><Icon name="bell" size={18} /><span className="ping" /></button>
        <div className="view-toggle">
          <button className={view === 'desktop' ? 'on' : ''} onClick={() => onView('desktop')}>Escritorio</button>
          <button className={view === 'mobile' ? 'on' : ''} onClick={() => onView('mobile')}>Móvil</button>
        </div>
        {action
          ? <button className={action.soft ? 'btn-soft' : 'btn-primary'} onClick={action.on}><Icon name={action.icon} size={17} />{action.label}</button>
          : <button className="btn-primary" onClick={() => onAdd('gasto')}><Icon name="plus" size={17} />Agregar</button>}
      </div>
    </header>
  );
}

// ── Hero: disponible para gastar hoy ───────────
function HeroCard({ onAdd }) {
  const s = D.summary;
  const spentToday = 9300;        // gasto de hoy
  const paceToday = s.safeToday;  // ritmo recomendado
  const pacePct = Math.min(100, (spentToday / (paceToday * 1.6)) * 100);
  const markerPct = (paceToday / (paceToday * 1.6)) * 100;
  return (
    <section className="hero card">
      <div className="hero-main">
        <div className="hero-head">
          <span className="eyebrow"><span className="dot" />Disponible para gastar hoy</span>
          <span className="hero-chip"><Icon name="sparkle" size={13} />Ritmo saludable</span>
        </div>
        <div className="hero-amount">{clp(s.safeToday)}</div>
        <p className="hero-note">
          Después de cubrir gastos fijos y metas, puedes gastar esto hoy sin desviarte.
          Te quedan <b>{s.daysLeft} días</b> en {D.monthLabel.split(' ')[0].toLowerCase()} y
          <b> {clp(s.variableAssigned - s.variableSpent)}</b> de presupuesto variable.
        </p>
        <div className="pace">
          <div className="pace-bar">
            <div className="pace-fill" style={{ width: pacePct + '%' }} />
            <div className="pace-marker" style={{ left: markerPct + '%' }}><span>hoy</span></div>
          </div>
          <div className="pace-legend">
            <span>Gastado hoy <b>{clp(spentToday)}</b></span>
            <span>Recomendado <b>{clp(paceToday)}</b></span>
          </div>
        </div>
        <div className="quick-actions">
          <button onClick={() => onAdd('gasto')}><span className="qa-ic red"><Icon name="arrowup" size={16} /></span>Agregar gasto</button>
          <button onClick={() => onAdd('ingreso')}><span className="qa-ic emerald"><Icon name="arrowdown" size={16} /></span>Agregar ingreso</button>
          <button onClick={() => onAdd('mover')}><span className="qa-ic blue"><Icon name="swap" size={16} /></span>Mover dinero</button>
          <button onClick={() => onAdd('meta')}><span className="qa-ic violet"><Icon name="flag" size={16} /></span>Crear meta</button>
        </div>
      </div>
      <div className="hero-side">
        <MiniGauge pct={Math.round((s.variableSpent / s.variableAssigned) * 100)} />
        <div className="hero-side-rows">
          <div><span className="hsr-l">Ingreso del mes</span><span className="hsr-v">{clp(s.income)}</span></div>
          <div><span className="hsr-l">Asignado</span><span className="hsr-v">{clp(s.assignedTotal)}</span></div>
          <div><span className="hsr-l">Libre por asignar</span><span className={'hsr-v ' + (s.unassigned === 0 ? 'ok' : 'warn')}>{clp(s.unassigned)}</span></div>
        </div>
      </div>
    </section>
  );
}

function MiniGauge({ pct }) {
  const size = 132, stroke = 12, r = (size - stroke) / 2, c = 2 * Math.PI * r;
  const dash = (pct / 100) * c;
  return (
    <div className="gauge">
      <svg viewBox={'0 0 ' + size + ' ' + size}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--hairline)" strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--accent)" strokeWidth={stroke}
          strokeLinecap="round" strokeDasharray={dash + ' ' + (c - dash)}
          style={{ transform: 'rotate(-90deg)', transformOrigin: 'center', transition: 'stroke-dasharray 1s ease .3s' }} />
      </svg>
      <div className="gauge-c">
        <span className="gauge-pct">{pct}%</span>
        <span className="gauge-lbl">del variable</span>
      </div>
    </div>
  );
}

// ── Stat cards ─────────────────────────────────
function StatCard({ label, value, delta, deltaUp, bad, spark, sparkColor, accent }) {
  return (
    <div className={'card stat' + (accent ? ' stat-accent' : '')}>
      <div className="stat-top">
        <span className="stat-label">{label}</span>
        {delta != null && (
          <span className={'stat-delta ' + (bad ? 'down' : deltaUp ? 'up' : 'down')}>
            <Icon name={deltaUp ? 'arrowup' : 'arrowdown'} size={13} />{delta}
          </span>
        )}
      </div>
      <div className="stat-value">{value}</div>
      <div className="stat-spark"><Spark data={spark} color={sparkColor} /></div>
    </div>
  );
}

// ── Flujo del mes (tabs) ───────────────────────
function FlowCard() {
  const [tab, setTab] = useState('mes');
  const s = D.summary;
  const maxM = Math.max.apply(null, D.months.map(m => m.income));
  const labels = [
    { x: 0, t: '1' }, { x: 0.33, t: '7' }, { x: 0.66, t: '14' }, { x: 1, t: 'hoy' }
  ];
  return (
    <div className="card flow">
      <div className="card-head">
        <div>
          <h3 className="card-title">{tab === 'mes' ? 'Flujo del mes' : 'Ingresos vs gastos'}</h3>
          <p className="card-sub">
            {tab === 'mes'
              ? <>Vas <b className="ok">{clp(s.variableAssigned - s.variableSpent)} bajo</b> tu ritmo ideal</>
              : <>Promedio de gasto <b>{clp(1090000)}</b> · ahorro <b className="ok">24%</b></>}
          </p>
        </div>
        <div className="tabs">
          <button className={tab === 'mes' ? 'on' : ''} onClick={() => setTab('mes')}>Este mes</button>
          <button className={tab === '6m' ? 'on' : ''} onClick={() => setTab('6m')}>6 meses</button>
        </div>
      </div>
      {tab === 'mes'
        ? <>
            <AreaTrend flow={D.dailyFlow} pace={D.pace} labels={labels} />
            <div className="flow-legend">
              <span><i className="sw sw-accent" />Gasto real</span>
              <span><i className="sw sw-dash" />Ritmo ideal</span>
            </div>
          </>
        : <>
            <BarPairs months={D.months} max={maxM} />
            <div className="flow-legend">
              <span><i className="sw sw-income" />Ingresos</span>
              <span><i className="sw sw-expense" />Gastos</span>
            </div>
          </>}
    </div>
  );
}

// ── Presupuesto por categorías ─────────────────
function BudgetCard({ onMove }) {
  const [open, setOpen] = useState(null);
  const [filter, setFilter] = useState('todas');
  const cats = D.categories.filter(c => filter === 'todas' ? true : filter === 'fijos' ? c.fixed : !c.fixed);
  const s = D.summary;
  return (
    <div className="card budget">
      <div className="card-head">
        <div>
          <h3 className="card-title">Presupuesto por categorías</h3>
          <p className="card-sub">Asignado <b>{clp(s.assignedTotal)}</b> · Gastado <b>{clp(s.spentTotal)}</b></p>
        </div>
        <div className="tabs sm">
          {['todas', 'fijos', 'variables'].map(f => (
            <button key={f} className={filter === f ? 'on' : ''} onClick={() => setFilter(f)}>{f[0].toUpperCase() + f.slice(1)}</button>
          ))}
        </div>
      </div>
      <div className="budget-list">
        {cats.map(c => {
          const avail = c.assigned - c.spent;
          const over = avail < 0;
          const near = !over && (c.spent / c.assigned) > 0.88;
          const isOpen = open === c.id;
          const txns = D.transactions.filter(t => t.cat === c.id);
          return (
            <div className={'brow' + (isOpen ? ' open' : '')} key={c.id}>
              <button className="brow-main" onClick={() => setOpen(isOpen ? null : c.id)}>
                <span className={'cat-ic c-' + c.color}><Icon name={c.icon} size={17} /></span>
                <span className="brow-name">
                  {c.name}
                  <span className="brow-tag">{c.fixed ? 'Fijo' : 'Variable'}</span>
                </span>
                <span className="brow-mid">
                  <Progress value={c.spent} max={c.assigned} state={over ? 'red' : near ? 'amber' : null} />
                  <span className="brow-nums">{clp(c.spent)} <i>de {clp(c.assigned)}</i></span>
                </span>
                <span className={'brow-avail ' + (over ? 'red' : near ? 'amber' : 'ok')}>
                  {over ? <><Icon name="arrowup" size={13} />{clp(avail)}</> : clp(avail)}
                  <i>{over ? 'excedido' : 'disponible'}</i>
                </span>
                <Icon name="chevdown" size={16} className={'brow-chev' + (isOpen ? ' rot' : '')} />
              </button>
              {isOpen && (
                <div className="brow-detail">
                  <div className="detail-txns">
                    {txns.length ? txns.slice(0, 4).map(t => (
                      <div className="dtx" key={t.id}>
                        <span className="dtx-name">{t.name}</span>
                        <span className="dtx-acc">{t.account}</span>
                        <span className="dtx-date">{t.date}</span>
                        <span className="dtx-amt">{clp(t.amount)}</span>
                      </div>
                    )) : <span className="dtx-empty">Sin movimientos este mes</span>}
                  </div>
                  <div className="detail-actions">
                    {over && <span className="detail-alert"><Icon name="bell" size={13} />Esta categoría superó su límite por {clp(Math.abs(avail))}</span>}
                    <button className="link-btn" onClick={() => onMove(c)}><Icon name="swap" size={14} />Mover dinero</button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Gasto por categoría (donut) ────────────────
function CategoryDonut() {
  const top = [...D.categories].filter(c => c.id !== 'metas' && c.id !== 'vivienda')
    .sort((a, b) => b.spent - a.spent).slice(0, 5);
  const otros = D.categories.filter(c => c.id !== 'metas' && c.id !== 'vivienda' && !top.includes(c))
    .reduce((s, c) => s + c.spent, 0);
  const segs = top.map(c => ({ value: c.spent, color: c.color, name: c.name }));
  if (otros > 0) segs.push({ value: otros, color: 'slate', name: 'Otros' });
  const total = segs.reduce((s, x) => s + x.value, 0);
  return (
    <div className="card donut-card">
      <div className="card-head"><div><h3 className="card-title">Gasto por categoría</h3><p className="card-sub">Variable · {D.monthLabel.split(' ')[0]}</p></div></div>
      <div className="donut-body">
        <Donut segments={segs} centerTop={clpShort(total)} centerBottom="gastado" />
        <div className="donut-legend">
          {segs.map((s, i) => (
            <div className="dl" key={i}>
              <span className={'dot c-' + s.color} />
              <span className="dl-name">{s.name}</span>
              <span className="dl-val">{Math.round((s.value / total) * 100)}%</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Próximos vencimientos ──────────────────────
function UpcomingCard() {
  return (
    <div className="card upcoming">
      <div className="card-head"><div><h3 className="card-title">Próximos vencimientos</h3><p className="card-sub">{D.upcoming.length} pagos en los próximos 10 días</p></div></div>
      <div className="up-list">
        {D.upcoming.map(u => (
          <div className="up-row" key={u.id}>
            <span className={'up-day' + (u.inDays <= 1 ? ' soon' : '')}>{u.inDays === 1 ? 'mañana' : 'en ' + u.inDays + ' días'}</span>
            <span className="up-name">{u.name}<i>{u.account}</i></span>
            <span className="up-amt">{clp(u.amount)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Metas ──────────────────────────────────────
function GoalsCard({ onAdd }) {
  return (
    <div className="card goals">
      <div className="card-head">
        <div><h3 className="card-title">Metas</h3><p className="card-sub">Vas aportando <b>{clp(250000)}</b> al mes</p></div>
        <button className="icon-btn ghost sm" onClick={() => onAdd('meta')}><Icon name="plus" size={16} /></button>
      </div>
      <div className="goal-list">
        {D.goals.map(g => {
          const pct = Math.round((g.current / g.target) * 100);
          return (
            <div className="goal" key={g.id}>
              <div className="goal-top">
                <span className={'goal-dot c-' + g.color} />
                <span className="goal-name">{g.name}</span>
                <span className="goal-pct">{pct}%</span>
              </div>
              <Progress value={g.current} max={g.target} state={g.color} height={6} />
              <div className="goal-bot">
                <span>{clp(g.current)} <i>de {clp(g.target)}</i></span>
                {g.due && <span className="goal-due">{g.due}</span>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

Object.assign(window, {
  Logo, Sidebar, Topbar, HeroCard, StatCard, FlowCard, BudgetCard,
  CategoryDonut, UpcomingCard, GoalsCard, NAV
});
})();
