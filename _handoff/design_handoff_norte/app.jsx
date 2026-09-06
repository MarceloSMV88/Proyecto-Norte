// Norte — app principal
/* global React, ReactDOM, D, Icon, Sidebar, Topbar, HeroCard, StatCard, FlowCard,
   BudgetCard, CategoryDonut, UpcomingCard, GoalsCard, IOSDevice,
   useTweaks, TweaksPanel, TweakSection, TweakColor, TweakRadio, TweakToggle */
const { useState, useEffect, useRef } = React;
const D = window.NORTE_DATA;
const clp = D.clp;

// ── Modal agregar (gasto / ingreso / mover / meta) ──
const MODAL_META = {
  gasto:  { title: 'Agregar gasto',    accent: 'red',     verb: 'Registrar gasto' },
  ingreso:{ title: 'Agregar ingreso',  accent: 'emerald', verb: 'Registrar ingreso' },
  mover:  { title: 'Mover dinero',     accent: 'blue',    verb: 'Mover' },
  meta:   { title: 'Crear meta',       accent: 'violet',  verb: 'Crear meta' }
};
const EXP_CATS = D.categories.filter(c => c.id !== 'metas');

function fmtInput(raw) {
  const digits = (raw || '').replace(/\D/g, '');
  if (!digits) return '';
  return parseInt(digits, 10).toLocaleString('es-CL');
}

function AddModal({ type, onClose, onSubmit }) {
  const meta = MODAL_META[type];
  const [amount, setAmount] = useState('');
  const [cat, setCat] = useState(type === 'gasto' ? 'super' : null);
  const [account, setAccount] = useState('cc');
  const [from, setFrom] = useState('super');
  const [to, setTo] = useState('restaurant');
  const [name, setName] = useState('');
  const amountNum = parseInt((amount || '0').replace(/\D/g, ''), 10) || 0;
  const valid = amountNum > 0 && (type !== 'meta' || name.trim());
  const inputRef = useRef(null);
  useEffect(() => { setTimeout(() => inputRef.current && inputRef.current.focus(), 120); }, []);

  function submit() {
    if (!valid) return;
    onSubmit({ type, amount: amountNum, cat, account, from, to, name });
  }

  return (
    <div className="modal-scrim" onClick={onClose}>
      <div className={'modal accent-' + meta.accent} onClick={e => e.stopPropagation()}>
        <div className="modal-head">
          <h3>{meta.title}</h3>
          <button className="icon-btn ghost" onClick={onClose}><Icon name="x" size={18} /></button>
        </div>

        <div className="amount-field">
          <span className="amount-cur">$</span>
          <input ref={inputRef} className="amount-input" inputMode="numeric" placeholder="0"
            value={amount} onChange={e => setAmount(fmtInput(e.target.value))}
            onKeyDown={e => e.key === 'Enter' && submit()} />
        </div>

        {(type === 'gasto') && (
          <>
            <label className="field-label">Categoría</label>
            <div className="chip-grid">
              {EXP_CATS.map(c => (
                <button key={c.id} className={'chip' + (cat === c.id ? ' on' : '')} onClick={() => setCat(c.id)}>
                  <span className={'cat-ic sm c-' + c.color}><Icon name={c.icon} size={14} /></span>{c.name}
                </button>
              ))}
            </div>
          </>
        )}
        {type === 'ingreso' && (
          <>
            <label className="field-label">Origen</label>
            <div className="chip-grid">
              {['Sueldo', 'Extra', 'Reembolso', 'Inversión'].map((o, i) => (
                <button key={o} className={'chip' + ((cat || 'Sueldo') === o ? ' on' : '')} onClick={() => setCat(o)}>{o}</button>
              ))}
            </div>
          </>
        )}
        {type === 'mover' && (
          <div className="move-row">
            <div className="move-sel">
              <label className="field-label">Desde</label>
              <select value={from} onChange={e => setFrom(e.target.value)}>
                {D.categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <Icon name="chevright" size={18} className="move-arrow" />
            <div className="move-sel">
              <label className="field-label">Hacia</label>
              <select value={to} onChange={e => setTo(e.target.value)}>
                {D.categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          </div>
        )}
        {type === 'meta' && (
          <>
            <label className="field-label">Nombre de la meta</label>
            <input className="text-input" placeholder="Ej: Viaje a Bariloche" value={name} onChange={e => setName(e.target.value)} />
          </>
        )}

        {(type === 'gasto' || type === 'ingreso') && (
          <div className="row-2">
            <div>
              <label className="field-label">Cuenta</label>
              <select value={account} onChange={e => setAccount(e.target.value)}>
                {D.accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </div>
            <div>
              <label className="field-label">Fecha</label>
              <select defaultValue="hoy"><option value="hoy">Hoy</option><option>Ayer</option><option>Esta semana</option></select>
            </div>
          </div>
        )}
        {type === 'meta' && (
          <div className="row-2">
            <div><label className="field-label">Aporte mensual</label><select defaultValue="40"><option value="40">$40.000</option><option>$60.000</option><option>$100.000</option></select></div>
            <div><label className="field-label">Fecha objetivo</label><select defaultValue="dic"><option value="dic">Dic 2026</option><option>Jun 2027</option><option>Sin fecha</option></select></div>
          </div>
        )}

        <button className={'btn-primary block' + (valid ? '' : ' disabled')} onClick={submit}>{meta.verb}</button>
      </div>
    </div>
  );
}

// ── Toast ──
function Toast({ msg }) {
  return <div className="toast"><span className="toast-ic"><Icon name="check" size={15} /></span>{msg}</div>;
}

// ── Stat cards data ──
function StatRow() {
  const s = D.summary;
  return (
    <div className="stat-row">
      <StatCard accent label="Saldo disponible" value={clp(s.available)} delta="3,2%" deltaUp
        spark={[820, 910, 880, 1010, 980, 1120, 1180, 1284]} sparkColor="emerald" />
      <StatCard label="Gastos del mes" value={clp(s.spentTotal)} delta="8,1%" deltaUp bad
        spark={[40, 92, 145, 221, 289, 361, 451, 538, 612]} sparkColor="red" />
      <StatCard label="Ahorro acumulado" value={clp(s.savings)} delta="6,4%" deltaUp
        spark={[1900, 2010, 2120, 2150, 2230, 2280, 2350]} sparkColor="violet" />
      <StatCard label="Libre por asignar" value={clp(s.unassigned)} delta="al día" deltaUp
        spark={[120, 80, 60, 40, 20, 0, 0]} sparkColor="blue" />
    </div>
  );
}

// ── Router de página ──
function PageRouter({ active, onAdd, onMove, settings }) {
  if (active === 'resumen') return <Dashboard onAdd={onAdd} onMove={onMove} />;
  if (active === 'ajustes') return <SettingsPage {...settings} />;
  const View = window.PAGES[active];
  return View ? <View onAdd={onAdd} onMove={onMove} /> : <Dashboard onAdd={onAdd} onMove={onMove} />;
}

// ── Dashboard (compartido escritorio/móvil) ──
function Dashboard({ onAdd, onMove }) {
  return (
    <>
      <HeroCard onAdd={onAdd} />
      <StatRow />
      <div className="grid-2col">
        <div className="col-main">
          <FlowCard />
          <BudgetCard onMove={onMove} />
        </div>
        <div className="col-side">
          <CategoryDonut />
          <UpcomingCard />
          <GoalsCard onAdd={onAdd} />
        </div>
      </div>
    </>
  );
}

// ── Tweaks ──
const ACCENTS = {
  esmeralda: '#34c98a', azul: '#4f93f5', violeta: '#9b8cf0', ambar: '#e6b25a', coral: '#ef7a63'
};
const FONTS = {
  'Geométrica': "'Space Grotesk', system-ui",
  'Neutra': "'Manrope', system-ui",
  'Mono acento': "'Space Grotesk', system-ui"
};
const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "accent": "esmeralda",
  "fontUi": "Geométrica",
  "density": "regular",
  "theme": "dark",
  "cards": "borde"
}/*EDITMODE-END*/;

function App() {
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const [view, setView] = useState('desktop');
  const [active, setActive] = useState('resumen');
  const [monthIdx, setMonthIdx] = useState(0);
  const [modal, setModal] = useState(null);
  const [toast, setToast] = useState(null);
  const [userId, setUserId] = useState(D.activeUserId);
  const [, setTick] = useState(0);
  const activeUser = D.activeUser();

  function showToast(msg) { setToast(msg); setTimeout(() => setToast(null), 2600); }

  function selectUser(id) { D.setUser(id); setUserId(id); setTick(x => x + 1); }
  function handleSwitchUser(id) { selectUser(id); const u = D.users.filter(x => x.id === id)[0]; showToast('Viendo el perfil de ' + (u ? u.name : '')); }
  function handleAddUser(cfg) { const id = D.addUser(cfg); setModal(null); selectUser(id); showToast('Perfil de ' + cfg.name + ' creado · privado'); }
  function handleRemoveUser(id) { D.removeUser(id); setTick(x => x + 1); showToast('Integrante eliminado'); }
  function handleSetRole(id, role) { D.setRole(id, role); setTick(x => x + 1); const u = D.users.filter(x => x.id === id)[0]; showToast((u ? u.name : '') + ' ahora es ' + role); }

  function handleSubmit(p) {
    setModal(null);
    if (p.type === 'gasto') {
      const c = D.categories.find(x => x.id === p.cat);
      if (c) { c.spent += p.amount; D.summary.spentTotal += p.amount; D.summary.variableSpent += c.fixed ? 0 : p.amount; }
      D.transactions.unshift({ id: 'n' + Date.now(), cat: p.cat, name: 'Nuevo gasto', amount: -p.amount, date: 'Hoy', account: 'Corriente' });
      showToast('Gasto de ' + clp(p.amount) + ' registrado');
    } else if (p.type === 'ingreso') {
      D.summary.available += p.amount; D.summary.income += p.amount;
      showToast('Ingreso de ' + clp(p.amount) + ' registrado');
    } else if (p.type === 'mover') {
      const f = D.categories.find(x => x.id === p.from), to = D.categories.find(x => x.id === p.to);
      if (f) f.assigned -= p.amount; if (to) to.assigned += p.amount;
      showToast('Moviste ' + clp(p.amount) + ' entre sobres');
    } else {
      showToast('Meta «' + (p.name || 'Nueva meta') + '» creada');
    }
    setTick(x => x + 1);
  }

  const month = D.monthLabel;
  const settings = {
    user: activeUser, users: D.users,
    onSwitch: handleSwitchUser, onAddUser: () => setModal('usuario'), onRemove: handleRemoveUser, onSetRole: handleSetRole,
    theme: t.theme, setTheme: v => setTweak('theme', v),
    accent: t.accent, setAccent: v => setTweak('accent', v), accents: ACCENTS,
    density: t.density, setDensity: v => setTweak('density', v)
  };
  const PAGE_META = {
    resumen:     { title: 'Hola, ' + activeUser.name, sub: 'Vas bien este mes. Esto es lo que importa hoy.', action: null },
    presupuesto: { title: 'Presupuesto', sub: 'Asigna tu ingreso de ' + month + ' · cada peso con un propósito', action: { label: 'Mover dinero', icon: 'swap', soft: true, on: () => setModal('mover') } },
    movimientos: { title: 'Movimientos', sub: D.transactions.length + ' registros este mes · ingresos, gastos y transferencias', action: { label: 'Agregar', icon: 'plus', on: () => setModal('gasto') } },
    metas:       { title: 'Metas', sub: 'Ahorra con intención · cada meta avanza sola cada mes', action: { label: 'Nueva meta', icon: 'plus', on: () => setModal('meta') } },
    cuentas:     { title: 'Cuentas', sub: 'Tu patrimonio en un solo lugar · saldo por cuenta', action: { label: 'Transferir', icon: 'swap', soft: true, on: () => setModal('mover') } },
    habitos:     { title: 'Hábitos', sub: 'Dónde se va tu dinero y cómo evolucionas · sin planillas', action: null },
    ajustes:     { title: 'Ajustes', sub: 'Perfiles familiares, apariencia y privacidad', action: null }
  };
  const pageMeta = PAGE_META[active] || PAGE_META.resumen;
  const rootStyle = {
    '--accent': ACCENTS[t.accent] || ACCENTS.esmeralda,
    '--font-ui': FONTS[t.fontUi] || FONTS['Geométrica']
  };
  const cls = ['app', 'theme-' + (t.theme || 'dark'), 'dens-' + (t.density || 'regular'), 'cards-' + (t.cards || 'borde')].join(' ');

  return (
    <div className={cls} style={rootStyle}>
      {view === 'desktop' ? (
        <div className="shell">
          <Sidebar active={active} onNav={setActive} user={activeUser} />
          <main className="main">
            <Topbar month={month} onMonth={() => {}} onAdd={setModal} view={view} onView={setView} meta={pageMeta} action={pageMeta.action} />
            <div className="scroll" key={userId}>
              <PageRouter active={active} onAdd={setModal} onMove={() => setModal('mover')} settings={settings} />
              <footer className="foot-note">Norte · perfil de {activeUser.name} · {month}</footer>
            </div>
          </main>
        </div>
      ) : (
        <div className="mobile-stage">
          <div className="mobile-switch">
            <div className="view-toggle">
              <button onClick={() => setView('desktop')}>Escritorio</button>
              <button className="on">Móvil</button>
            </div>
          </div>
          <IOSDevice dark>
            <div className="mobile-scope">
              <div className="m-top">
                <Logo />
                <div className="m-top-r">
                  <button className="icon-btn ghost bell" aria-label="Alertas"><Icon name="bell" size={18} /><span className="ping" /></button>
                  <button className={'m-avatar av-' + activeUser.color} onClick={() => setActive('ajustes')} aria-label="Perfil">{activeUser.initials}</button>
                </div>
              </div>
              <div className="m-scroll" key={userId + active}>
                {active !== 'resumen' && (
                  <div className="m-page-head">
                    <h2>{pageMeta.title}</h2>
                    <p>{pageMeta.sub}</p>
                  </div>
                )}
                <PageRouter active={active} onAdd={setModal} onMove={() => setModal('mover')} settings={settings} />
                <div style={{ height: 80 }} />
              </div>
              <nav className="m-tabs">
                {[['resumen', 'grid'], ['presupuesto', 'layers'], ['add', 'plus'], ['movimientos', 'swap'], ['metas', 'flag']].map(([id, ic]) => (
                  id === 'add'
                    ? <button key={id} className="m-fab" onClick={() => setModal('gasto')}><Icon name="plus" size={22} /></button>
                    : <button key={id} className={'m-tab' + (active === id ? ' on' : '')} onClick={() => setActive(id)}><Icon name={ic} size={20} /></button>
                ))}
              </nav>
            </div>
          </IOSDevice>
        </div>
      )}

      {modal === 'usuario'
        ? <UserModal onClose={() => setModal(null)} onSubmit={handleAddUser} />
        : modal && <AddModal type={modal} onClose={() => setModal(null)} onSubmit={handleSubmit} />}
      {toast && <Toast msg={toast} />}

      <TweaksPanel title="Tweaks">
        <TweakSection label="Color de acento" />
        <TweakColor label="Acento" value={ACCENTS[t.accent]} options={Object.values(ACCENTS)}
          onChange={v => { const k = Object.keys(ACCENTS).find(k => ACCENTS[k] === v); setTweak('accent', k || 'esmeralda'); }} />
        <TweakSection label="Tipografía" />
        <TweakRadio label="Interfaz" value={t.fontUi} options={Object.keys(FONTS)} onChange={v => setTweak('fontUi', v)} />
        <TweakSection label="Diseño" />
        <TweakRadio label="Densidad" value={t.density} options={['compact', 'regular', 'comfy']} onChange={v => setTweak('density', v)} />
        <TweakRadio label="Tarjetas" value={t.cards} options={['borde', 'sombra', 'glass']} onChange={v => setTweak('cards', v)} />
        <TweakToggle label="Modo oscuro" value={t.theme === 'dark'} onChange={v => setTweak('theme', v ? 'dark' : 'light')} />
      </TweaksPanel>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
