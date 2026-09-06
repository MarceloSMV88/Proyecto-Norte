// Norte — páginas de módulos (Presupuesto, Movimientos, Metas, Cuentas, Hábitos)
/* global React, Icon, Progress, BarPairs, Donut, Spark, StatCard */
(function () {
const D = window.NORTE_DATA;
const { useState } = React;
const clp = D.clp, clpShort = D.clpShort;

// ── Encabezado de página ──────────────────────
function PageHeader({ title, subtitle, children }) {
  return (
    <div className="page-head">
      <div>
        <h2 className="page-title">{title}</h2>
        <p className="page-sub">{subtitle}</p>
      </div>
      {children && <div className="page-head-actions">{children}</div>}
    </div>
  );
}

function MiniStat({ label, value, tone }) {
  return (
    <div className="card mini-stat">
      <span className="mini-stat-label">{label}</span>
      <span className={'mini-stat-value' + (tone ? ' ' + tone : '')}>{value}</span>
    </div>
  );
}

// ══════════════════════════════════════════════
// 1 · PRESUPUESTO
// ══════════════════════════════════════════════
function BudgetPage({ onMove }) {
  const s = D.summary;
  const groups = ['Fijos', 'Variables', 'Ahorro'];
  const assignedPct = Math.round((s.assignedTotal / s.income) * 100);
  return (
    <>
      <section className="assign-banner card">
        <div className="assign-l">
          <span className="eyebrow"><span className="dot" />Listo para asignar</span>
          <div className="assign-amount ok">{clp(s.unassigned)}</div>
          <p className="assign-note">Asignaste el 100% de tu ingreso. Cada peso tiene un trabajo asignado este mes.</p>
        </div>
        <div className="assign-r">
          <div className="assign-bar-row"><span>Ingreso</span><b>{clp(s.income)}</b></div>
          <div className="assign-track"><div className="assign-fill" style={{ width: assignedPct + '%' }} /></div>
          <div className="assign-legend">
            <span><i className="sw sw-accent" />Asignado {clp(s.assignedTotal)}</span>
            <span><i className="sw" style={{ background: 'var(--surface-3)' }} />Sin asignar {clp(s.unassigned)}</span>
          </div>
        </div>
      </section>

      <div className="stat-row">
        <MiniStat label="Ingreso del mes" value={clp(s.income)} />
        <MiniStat label="Asignado" value={clp(s.assignedTotal)} />
        <MiniStat label="Gastado" value={clp(s.spentTotal)} tone="warn" />
        <MiniStat label="Disponible total" value={clp(s.assignedTotal - s.spentTotal)} tone="ok" />
      </div>

      {groups.map(g => {
        const cats = D.categories.filter(c => c.group === g);
        const gAssigned = cats.reduce((a, c) => a + c.assigned, 0);
        const gSpent = cats.reduce((a, c) => a + c.spent, 0);
        return (
          <div className="card budget-group" key={g}>
            <div className="bg-head">
              <h3 className="card-title">{g}</h3>
              <div className="bg-totals">
                <span>Asignado <b>{clp(gAssigned)}</b></span>
                <span>Gastado <b>{clp(gSpent)}</b></span>
                <span className={gAssigned - gSpent < 0 ? 'red' : 'ok'}>Queda <b>{clp(gAssigned - gSpent)}</b></span>
              </div>
            </div>
            <div className="bgrid-head">
              <span>Categoría</span><span>Asignado</span><span>Gastado</span><span className="ta-r">Disponible</span><span />
            </div>
            {cats.map(c => {
              const avail = c.assigned - c.spent;
              const over = avail < 0;
              const near = !over && (c.spent / c.assigned) > 0.88;
              return (
                <div className="bgrid-row" key={c.id}>
                  <span className="bgrid-cat">
                    <span className={'cat-ic c-' + c.color}><Icon name={c.icon} size={16} /></span>
                    <span className="bgrid-name">{c.name}{c.fixed && <i className="brow-tag">Fijo</i>}</span>
                  </span>
                  <span className="bgrid-assigned">{clp(c.assigned)}</span>
                  <span className="bgrid-spent">
                    <Progress value={c.spent} max={c.assigned} state={over ? 'red' : near ? 'amber' : null} height={5} />
                    <i>{clp(c.spent)}</i>
                  </span>
                  <span className={'bgrid-avail ta-r ' + (over ? 'red' : near ? 'amber' : 'ok')}>{clp(avail)}</span>
                  <button className="bgrid-move" onClick={() => onMove(c)} title="Mover dinero"><Icon name="swap" size={15} /></button>
                </div>
              );
            })}
          </div>
        );
      })}
    </>
  );
}

// ══════════════════════════════════════════════
// 2 · MOVIMIENTOS
// ══════════════════════════════════════════════
const TYPE_FILTERS = [
  { id: 'todos', label: 'Todos' },
  { id: 'gasto', label: 'Gastos' },
  { id: 'ingreso', label: 'Ingresos' },
  { id: 'recurring', label: 'Recurrentes' }
];
function catOf(id) { return D.categories.find(c => c.id === id); }

function TxnsPage({ onAdd }) {
  const [type, setType] = useState('todos');
  const [acc, setAcc] = useState('todas');
  const [q, setQ] = useState('');
  const list = D.transactions.filter(t => {
    if (type === 'gasto' && t.type !== 'gasto') return false;
    if (type === 'ingreso' && t.type !== 'ingreso') return false;
    if (type === 'recurring' && !t.recurring) return false;
    if (acc !== 'todas' && t.account !== acc) return false;
    if (q && !t.name.toLowerCase().includes(q.toLowerCase())) return false;
    return true;
  });
  const incomes = D.transactions.filter(t => t.type === 'ingreso').reduce((a, t) => a + t.amount, 0);
  const expenses = D.transactions.filter(t => t.type === 'gasto').reduce((a, t) => a + Math.abs(t.amount), 0);

  // agrupar por fecha conservando orden
  const groupsOrder = [];
  const byDate = {};
  list.forEach(t => { if (!byDate[t.date]) { byDate[t.date] = []; groupsOrder.push(t.date); } byDate[t.date].push(t); });

  return (
    <>
      <div className="stat-row stat-row-3">
        <MiniStat label="Ingresos del mes" value={clp(incomes)} tone="ok" />
        <MiniStat label="Gastos del mes" value={clp(expenses)} tone="warn" />
        <MiniStat label="Balance" value={clp(incomes - expenses)} tone={incomes - expenses >= 0 ? 'ok' : 'red'} />
      </div>

      <div className="card txn-card">
        <div className="txn-filters">
          <div className="search-box">
            <Icon name="search" size={16} />
            <input placeholder="Buscar movimiento…" value={q} onChange={e => setQ(e.target.value)} />
          </div>
          <div className="tabs sm">
            {TYPE_FILTERS.map(f => (
              <button key={f.id} className={type === f.id ? 'on' : ''} onClick={() => setType(f.id)}>{f.label}</button>
            ))}
          </div>
          <select className="filter-sel" value={acc} onChange={e => setAcc(e.target.value)}>
            <option value="todas">Todas las cuentas</option>
            <option value="Corriente">Corriente</option>
            <option value="Vista">Vista</option>
            <option value="Crédito">Crédito</option>
          </select>
        </div>

        <div className="txn-list">
          {groupsOrder.length === 0 && <div className="txn-empty"><Icon name="search" size={22} />Sin movimientos para este filtro</div>}
          {groupsOrder.map(date => {
            const items = byDate[date];
            const daySum = items.reduce((a, t) => a + t.amount, 0);
            return (
              <div className="txn-group" key={date}>
                <div className="txn-date">
                  <span>{date === 'Hoy' || date === 'Ayer' ? date : date}</span>
                  <span className={'txn-daysum ' + (daySum >= 0 ? 'ok' : '')}>{clp(daySum, true)}</span>
                </div>
                {items.map(t => {
                  const c = catOf(t.cat);
                  const ic = t.type === 'transfer' ? 'swap' : t.type === 'ingreso' ? 'arrowdown' : (c ? c.icon : 'cart');
                  const col = t.type === 'transfer' ? 'blue' : t.type === 'ingreso' ? 'emerald' : (c ? c.color : 'slate');
                  return (
                    <div className="txn-row" key={t.id}>
                      <span className={'cat-ic c-' + col}><Icon name={ic} size={16} /></span>
                      <span className="txn-name">
                        {t.name}
                        {t.recurring && <i className="txn-badge"><Icon name="repeat" size={11} />Recurrente</i>}
                      </span>
                      <span className="txn-cat">{c ? c.name : (t.source || 'Transferencia')}</span>
                      <span className="txn-acc">{t.account}</span>
                      <span className={'txn-amt ' + (t.amount >= 0 ? 'pos' : '')}>{clp(t.amount, t.amount >= 0)}</span>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}

// ══════════════════════════════════════════════
// 3 · METAS
// ══════════════════════════════════════════════
function GoalRing({ pct, color }) {
  const size = 86, stroke = 8, r = (size - stroke) / 2, c = 2 * Math.PI * r;
  const dash = (pct / 100) * c;
  return (
    <div className="goal-ring">
      <svg viewBox={'0 0 ' + size + ' ' + size}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--hairline)" strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={'var(--c-' + color + ')'} strokeWidth={stroke}
          strokeLinecap="round" strokeDasharray={dash + ' ' + (c - dash)}
          style={{ transform: 'rotate(-90deg)', transformOrigin: 'center', transition: 'stroke-dasharray 1s ease .2s' }} />
      </svg>
      <span className="goal-ring-pct">{pct}%</span>
    </div>
  );
}

function GoalsPage({ onAdd }) {
  const total = D.goals.reduce((a, g) => a + g.current, 0);
  const target = D.goals.reduce((a, g) => a + g.target, 0);
  const monthly = D.goals.reduce((a, g) => a + g.monthly, 0);
  return (
    <>
      <div className="stat-row stat-row-3">
        <MiniStat label="Ahorrado en metas" value={clp(total)} tone="ok" />
        <MiniStat label="Objetivo total" value={clp(target)} />
        <MiniStat label="Aporte mensual" value={clp(monthly)} />
      </div>

      <div className="goals-grid">
        {D.goals.map(g => {
          const pct = Math.round((g.current / g.target) * 100);
          const remaining = g.target - g.current;
          const monthsLeft = Math.ceil(remaining / g.monthly);
          return (
            <div className="card goal-card" key={g.id}>
              <div className="goal-card-top">
                <GoalRing pct={pct} color={g.color} />
                <div className="goal-card-meta">
                  <h3 className="goal-card-name">{g.name}</h3>
                  <p className="goal-card-amt"><b>{clp(g.current)}</b> <i>de {clp(g.target)}</i></p>
                  {g.due && <span className="goal-card-due"><Icon name="calendar" size={13} />Meta: {g.due}</span>}
                </div>
              </div>
              <div className="goal-card-foot">
                <div className="gcf-row"><span>Aporte mensual</span><b>{clp(g.monthly)}</b></div>
                <div className="gcf-row"><span>Falta</span><b>{clp(remaining)}</b></div>
                <div className="gcf-proj"><Icon name="trending" size={14} />A este ritmo, lista en <b>{monthsLeft} {monthsLeft === 1 ? 'mes' : 'meses'}</b></div>
              </div>
              <div className="goal-card-actions">
                <button className="btn-soft sm" onClick={() => onAdd('mover')}><Icon name="plus" size={14} />Aportar</button>
                <button className="link-btn">Ajustar meta</button>
              </div>
            </div>
          );
        })}
        <button className="card goal-add" onClick={() => onAdd('meta')}>
          <span className="goal-add-ic"><Icon name="plus" size={22} /></span>
          <span>Crear nueva meta</span>
          <i>Fondo, viaje, deuda o compra futura</i>
        </button>
      </div>
    </>
  );
}

// ══════════════════════════════════════════════
// 4 · CUENTAS
// ══════════════════════════════════════════════
function AccountsPage({ onMove }) {
  const liquid = D.accounts.filter(a => a.type === 'Cuenta').reduce((s, a) => s + a.balance, 0);
  const savings = D.accounts.filter(a => a.type === 'Ahorro').reduce((s, a) => s + a.balance, 0);
  const debt = D.accounts.filter(a => a.type === 'Crédito').reduce((s, a) => s + a.balance, 0);
  const net = liquid + savings + debt;
  const types = ['Cuenta', 'Ahorro', 'Crédito'];
  const typeLabel = { Cuenta: 'Cuentas', Ahorro: 'Ahorro e inversión', Crédito: 'Tarjetas de crédito' };
  return (
    <>
      <section className="networth card">
        <div className="nw-l">
          <span className="eyebrow"><span className="dot" />Patrimonio neto</span>
          <div className="nw-amount">{clp(net)}</div>
          <p className="assign-note">Disponible + ahorro − deudas de tarjeta</p>
        </div>
        <div className="nw-breakdown">
          <div className="nw-item"><span className="nw-dot c-emerald" /><span>Disponible</span><b>{clp(liquid)}</b></div>
          <div className="nw-item"><span className="nw-dot c-violet" /><span>Ahorro</span><b>{clp(savings)}</b></div>
          <div className="nw-item"><span className="nw-dot c-red" /><span>Deudas</span><b className="red">{clp(debt)}</b></div>
        </div>
      </section>

      {types.map(tp => {
        const accs = D.accounts.filter(a => a.type === tp);
        if (!accs.length) return null;
        return (
          <div className="acc-section" key={tp}>
            <h3 className="acc-section-title">{typeLabel[tp]}</h3>
            <div className="acc-grid">
              {accs.map(a => (
                <div className="card acc-card" key={a.id}>
                  <div className="acc-top">
                    <span className={'acc-ic c-' + a.color}><Icon name={a.type === 'Crédito' ? 'wallet' : a.type === 'Ahorro' ? 'target' : 'layers'} size={18} /></span>
                    <button className="icon-btn ghost sm" onClick={() => onMove()}><Icon name="swap" size={14} /></button>
                  </div>
                  <div className="acc-name">{a.name}</div>
                  <div className="acc-bank">{a.bank}</div>
                  <div className={'acc-balance ' + (a.balance < 0 ? 'red' : '')}>{clp(a.balance)}</div>
                  <div className="acc-foot">{a.type === 'Crédito' ? 'Cupo usado' : 'Saldo disponible'}</div>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </>
  );
}

// ══════════════════════════════════════════════
// 5 · HÁBITOS
// ══════════════════════════════════════════════
function HabitsPage() {
  const ins = D.insights;
  const maxSpent = Math.max.apply(null, ins.topCats.map(c => c.spent));
  const maxM = Math.max.apply(null, D.months.map(m => m.income));
  return (
    <>
      <div className="habit-insights">
        <div className="card insight-card accent-tint">
          <span className="insight-eyebrow"><Icon name="sparkle" size={14} />Resumen</span>
          <p className="insight-text">Gastas en promedio <b>{clp(ins.avgDaily)}</b> al día. Tu día más caro suele ser <b>{ins.biggestDay.label}</b> ({clp(ins.biggestDay.amount)}).</p>
        </div>
        <div className="card insight-card">
          <span className="insight-eyebrow"><Icon name="repeat" size={14} />Suscripciones</span>
          <p className="insight-text"><b>{clp(ins.subsTotal)}</b> al mes en {D.subscriptions.length} servicios. <b className="warn">{clp(ins.unusedAmount)}</b> en {ins.unusedSubs.length} que casi no usas.</p>
        </div>
        <div className="card insight-card">
          <span className="insight-eyebrow"><Icon name="trending" size={14} />Proyección fin de mes</span>
          <p className="insight-text">Si sigues así, cerrarás mayo en <b>{clp(ins.projectedEnd)}</b> de gasto — <b className="ok">{clp(1198000 - ins.projectedEnd)}</b> menos que abril.</p>
        </div>
      </div>

      <div className="grid-2col">
        <div className="col-main">
          <div className="card">
            <div className="card-head"><div><h3 className="card-title">Dónde gastas más</h3><p className="card-sub">Categorías más pesadas de {D.monthLabel.split(' ')[0]}</p></div></div>
            <div className="hbars">
              {ins.topCats.map(c => (
                <div className="hbar" key={c.id}>
                  <span className="hbar-cat"><span className={'dot c-' + c.color} />{c.name}</span>
                  <div className="hbar-track"><div className={'hbar-fill bg-' + c.color} style={{ width: (c.spent / maxSpent * 100) + '%' }} /></div>
                  <span className="hbar-val">{clp(c.spent)}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="card">
            <div className="card-head"><div><h3 className="card-title">Evolución mensual</h3><p className="card-sub">Ingresos vs gastos · últimos 6 meses</p></div></div>
            <BarPairs months={D.months} max={maxM} />
            <div className="flow-legend">
              <span><i className="sw sw-income" />Ingresos</span>
              <span><i className="sw sw-expense" />Gastos</span>
            </div>
          </div>
        </div>
        <div className="col-side">
          <div className="card">
            <div className="card-head"><div><h3 className="card-title">Posibles fugas</h3><p className="card-sub">Gasto que podrías recortar</p></div></div>
            <div className="leak-list">
              {ins.leaks.map(l => (
                <div className="leak-row" key={l.id}>
                  <span className={'leak-ic c-' + l.color}><Icon name="bell" size={15} /></span>
                  <span className="leak-text">{l.label}</span>
                  <span className="leak-amt">{clp(l.amount)}</span>
                </div>
              ))}
            </div>
            <div className="leak-total"><span>Recorte potencial</span><b className="ok">{clp(ins.leaks.reduce((a, l) => a + l.amount, 0))}/mes</b></div>
          </div>
          <div className="card">
            <div className="card-head"><div><h3 className="card-title">Suscripciones</h3><p className="card-sub">{clp(ins.subsTotal)} al mes</p></div></div>
            <div className="sub-list">
              {D.subscriptions.map(sub => (
                <div className="sub-row" key={sub.id}>
                  <span className={'sub-dot c-' + sub.color} />
                  <span className="sub-name">{sub.name}</span>
                  <span className={'sub-use use-' + sub.used}>{sub.used}</span>
                  <span className="sub-amt">{clp(sub.amount)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

const PAGES = {
  presupuesto: BudgetPage,
  movimientos: TxnsPage,
  metas: GoalsPage,
  cuentas: AccountsPage,
  habitos: HabitsPage
};

Object.assign(window, { PageHeader, BudgetPage, TxnsPage, GoalsPage, AccountsPage, HabitsPage, PAGES });
})();
