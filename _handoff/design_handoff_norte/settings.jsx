// Norte — página Ajustes (perfiles familiares, apariencia, privacidad) + UserModal
/* global React, Icon */
(function () {
  const D = window.NORTE_DATA;
  const { useState, useEffect, useRef } = React;
  const clp = D.clp;

  // ── Tarjeta de tema (preview) ──
  function ThemeTile({ id, label, active, onPick }) {
    const dark = id === 'dark';
    const sw = dark ?
    { bg: '#0c0e11', card: '#161a1f', line: 'rgba(255,255,255,.1)', txt: '#f1f3f5', txt2: '#6a7178' } :
    { bg: '#eef0ee', card: '#ffffff', line: 'rgba(15,20,25,.1)', txt: '#15191c', txt2: '#9aa0a6' };
    return (
      <button className={'theme-tile' + (active ? ' on' : '')} onClick={() => onPick(id)}>
      <div className="theme-prev" style={{ background: sw.bg }}>
        <div className="theme-prev-card" style={{ background: sw.card, borderColor: sw.line }}>
          <span className="tp-dot" style={{ background: 'var(--accent)' }} />
          <span className="tp-line" style={{ background: sw.txt, width: '60%' }} />
          <span className="tp-line" style={{ background: sw.txt2, width: '40%' }} />
        </div>
        <div className="theme-prev-bars">
          <span style={{ background: 'var(--accent)', height: '70%' }} />
          <span style={{ background: sw.txt2, height: '45%' }} />
          <span style={{ background: sw.txt2, height: '85%' }} />
        </div>
      </div>
      <span className="theme-tile-label">{label}{active && <Icon name="check" size={15} />}</span>
    </button>);

  }

  function SettingsPage(props) {
    const { user, users, onSwitch, onAddUser, onRemove, onSetRole,
      theme, setTheme, accent, setAccent, accents, density, setDensity } = props;
    const isAdmin = user.role === 'Admin';

    return (
      <>
      {/* APARIENCIA */}
      <div className="card set-card">
        <div className="set-card-head">
          <h3 className="card-title">Apariencia</h3>
          <p className="card-sub">Elige cómo se ve Norte en tu dispositivo</p>
        </div>
        <label className="set-label">Tema</label>
        <div className="theme-tiles">
          <ThemeTile id="dark" label="Oscuro" active={theme === 'dark'} onPick={setTheme} />
          <ThemeTile id="light" label="Claro clásico" active={theme === 'light'} onPick={setTheme} />
        </div>
        <label className="set-label">Color de acento</label>
        <div className="accent-swatches">
          {Object.keys(accents).map((k) =>
            <button key={k} className={'accent-sw' + (accent === k ? ' on' : '')} style={{ background: accents[k] }}
            onClick={() => setAccent(k)} title={k} aria-label={k}>
              {accent === k && <Icon name="check" size={15} />}
            </button>
            )}
        </div>
        <label className="set-label">Densidad</label>
        <div className="seg">
          {[['compact', 'Compacta'], ['regular', 'Normal'], ['comfy', 'Amplia']].map(([v, l]) =>
            <button key={v} className={density === v ? 'on' : ''} onClick={() => setDensity(v)}>{l}</button>
            )}
        </div>
      </div>

      {/* PERFILES */}
      <div className="card set-card">
        <div className="set-card-head">
          <div>
            <h3 className="card-title">{isAdmin ? 'Perfiles del hogar' : 'Mi perfil'}</h3>
            <p className="card-sub">{isAdmin ? 'Administra los integrantes y asigna sus permisos' : 'Tu información personal en Norte'}</p>
          </div>
          {isAdmin && <button className="btn-primary" onClick={onAddUser}><Icon name="plus" size={16} />Agregar integrante</button>}
        </div>

        <div className="privacy-note">
          <span className="privacy-ic"><Icon name="check" size={15} /></span>
          <div>
            <b>Privacidad entre perfiles</b>
            <p>Cada persona ve únicamente sus ingresos, gastos, presupuesto y metas dentro de su perfil. {isAdmin ? 'Como Admin gestionas los perfiles del hogar y el permiso de cada integrante.' : 'Solo el administrador del hogar puede ver y gestionar los demás perfiles.'}</p>
          </div>
        </div>

        {isAdmin ?
          <div className="profile-list">
            {users.map((u) => {
              const isSelf = u.id === user.id;
              return (
                <div className={'profile-row' + (isSelf ? ' active' : '')} key={u.id}>
                  <div className={'avatar av-' + u.color}>{u.initials}</div>
                  <div className="profile-meta">
                    <span className="profile-name">{u.full}{isSelf && <span className="you-badge">Tú</span>}<span className={'role-pill' + (u.role === 'Admin' ? ' admin' : '')}>{u.role}</span></span>
                    <span className="profile-role">ingreso {clp(u.income)}</span>
                  </div>
                  {!isSelf &&
                    <select className="role-select" value={u.role} onChange={(e) => onSetRole(u.id, e.target.value)} title="Asignar perfil">
                      <option value="Pro">Pro</option>
                      <option value="Admin">Admin</option>
                    </select>}
                  {isSelf ?
                    <span className="profile-active"><span className="pa-dot" />Perfil activo</span> :
                    <button className="btn-soft sm" onClick={() => onSwitch(u.id)}><Icon name="swap" size={14} />Cambiar</button>}
                  {u.id !== 'marcelo' && !isSelf &&
                    <button className="profile-del" onClick={() => onRemove(u.id)} title="Quitar integrante"><Icon name="x" size={15} /></button>}
                </div>);
            })}
          </div> :
          <div className="profile-list">
            <div className="profile-row active">
              <div className={'avatar av-' + user.color}>{user.initials}</div>
              <div className="profile-meta">
                <span className="profile-name">{user.full}<span className="you-badge">Tú</span><span className="role-pill">{user.role}</span></span>
                <span className="profile-role">ingreso {clp(user.income)}</span>
              </div>
              <span className="profile-active"><span className="pa-dot" />Perfil activo</span>
            </div>
            <div className="admin-only-note"><Icon name="settings" size={15} />Los demás perfiles y permisos los administra el responsable del hogar.</div>
          </div>}
      </div>

      {/* CUENTA */}
      <div className="card set-card">
        <div className="set-card-head">
          <h3 className="card-title">Cuenta y datos</h3>
          <p className="card-sub">Hogar Rojas · plan familiar</p>
        </div>
        <div className="set-rows">
          <div className="set-row"><span><Icon name="wallet" size={17} />Moneda</span><b>Peso chileno (CLP $)</b></div>
          <div className="set-row"><span><Icon name="bell" size={17} />Alertas de presupuesto</span><Toggle defaultOn /></div>
          <div className="set-row"><span><Icon name="repeat" size={17} />Detectar suscripciones</span><Toggle defaultOn /></div>
          <div className="set-row"><span><Icon name="calendar" size={17} />Resumen mensual por correo</span><Toggle /></div>
        </div>
      </div>
    </>);

  }

  function Toggle({ defaultOn }) {
    const [on, setOn] = useState(!!defaultOn);
    return (
      <button className={'toggle' + (on ? ' on' : '')} onClick={() => setOn(!on)} role="switch" aria-checked={on}>
      <span className="toggle-knob" />
    </button>);

  }

  // ── Modal: agregar integrante ──
  const USER_COLORS = ['emerald', 'blue', 'violet', 'amber', 'red'];
  function fmtNum(raw) {
    const d = (raw || '').replace(/\D/g, '');
    return d ? parseInt(d, 10).toLocaleString('es-CL') : '';
  }
  function UserModal({ onClose, onSubmit }) {
    const [name, setName] = useState('');
    const [role, setRole] = useState('Pro');
    const [color, setColor] = useState('violet');
    const [income, setIncome] = useState('');
    const incomeNum = parseInt((income || '0').replace(/\D/g, ''), 10) || 0;
    const valid = name.trim().length > 1;
    const ref = useRef(null);
    useEffect(() => {setTimeout(() => ref.current && ref.current.focus(), 120);}, []);
    const initials = name.trim() ? name.trim().split(/\s+/).map((p) => p[0]).slice(0, 2).join('').toUpperCase() : '··';

    return (
      <div className="modal-scrim" onClick={onClose}>
      <div className="modal accent-violet" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3>Agregar integrante</h3>
          <button className="icon-btn ghost" onClick={onClose}><Icon name="x" size={18} /></button>
        </div>

        <div className="user-preview">
          <div className={'avatar lg av-' + color}>{initials}</div>
          <div>
            <div className="up-name">{name.trim() || 'Nombre del integrante'}</div>
            <div className="up-role">{role} · su perfil será privado</div>
          </div>
        </div>

        <label className="field-label">Nombre</label>
        <input ref={ref} className="text-input" placeholder="Ej: Diego Rojas" value={name} onChange={(e) => setName(e.target.value)} />

        <label className="field-label">Perfil asignado</label>
        <div className="chip-grid">
          {['Pro', 'Admin'].map((r) =>
            <button key={r} className={'chip' + (role === r ? ' on' : '')} onClick={() => setRole(r)}>{r}</button>
            )}
        </div>

        <label className="field-label">Color de perfil</label>
        <div className="accent-swatches">
          {USER_COLORS.map((c) =>
            <button key={c} className={'accent-sw c-fill-' + c + (color === c ? ' on' : '')} onClick={() => setColor(c)} aria-label={c}>
              {color === c && <Icon name="check" size={15} />}
            </button>
            )}
        </div>

        <label className="field-label">Ingreso mensual aproximado</label>
        <div className="amount-field sm">
          <span className="amount-cur">$</span>
          <input className="amount-input" inputMode="numeric" placeholder="0" value={income}
            onChange={(e) => setIncome(fmtNum(e.target.value))} />
        </div>

        <button className={'btn-primary block' + (valid ? '' : ' disabled')}
          onClick={() => valid && onSubmit({ name: name.trim(), role, color, income: incomeNum })}>
          Crear perfil privado
        </button>
      </div>
    </div>);

  }

  Object.assign(window, { SettingsPage, UserModal });
})();