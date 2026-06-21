'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LayoutGrid, Layers, ArrowLeftRight, Flag, Wallet, TrendingUp, Settings, LogOut } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { useProfiles } from '@/contexts/ProfileContext'

const NAV = [
  { href: '/resumen',     label: 'Resumen',     Icon: LayoutGrid },
  { href: '/presupuesto', label: 'Presupuesto', Icon: Layers },
  { href: '/movimientos', label: 'Movimientos', Icon: ArrowLeftRight },
  { href: '/metas',       label: 'Metas',       Icon: Flag },
  { href: '/cuentas',     label: 'Cuentas',     Icon: Wallet },
  { href: '/habitos',     label: 'Hábitos',     Icon: TrendingUp },
]

const AV_CLASS: Record<string, string> = {
  emerald: 'av-emerald', blue: 'av-blue', violet: 'av-violet', amber: 'av-amber', red: 'av-red',
}

export default function Sidebar() {
  const pathname = usePathname()
  const { signOut } = useAuth()
  const { profiles, activeProfile, setActiveProfile } = useProfiles()

  return (
    <aside className="sidebar">
      {/* Logo */}
      <Link href="/resumen" className="logo">
        <div className="logo-mark">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none">
            <path d="M12 2l3.2 6.8L22 12l-6.8 3.2L12 22l-3.2-6.8L2 12l6.8-3.2z" fill="var(--accent)" />
            <circle cx="12" cy="12" r="2.4" fill="var(--surface)" />
          </svg>
        </div>
        <span className="logo-word">Norte</span>
      </Link>

      {/* Nav links */}
      <nav className="nav">
        {NAV.map(({ href, label, Icon }) => (
          <Link
            key={href}
            href={href}
            className={`nav-item${pathname.startsWith(href) ? ' active' : ''}`}
          >
            <Icon size={19} />
            <span>{label}</span>
          </Link>
        ))}
      </nav>

      {/* Footer */}
      <div className="sidebar-foot">
        {/* Profile switcher for Admin */}
        {profiles.length > 1 && (
          <div style={{ marginBottom: 8, display: 'flex', flexDirection: 'column', gap: 2 }}>
            {profiles.map(p => (
              <button
                key={p.id}
                onClick={() => setActiveProfile(p)}
                className="nav-item"
                style={{ opacity: activeProfile?.id === p.id ? 1 : 0.6 }}
              >
                <div className={`avatar ${AV_CLASS[p.color] || 'av-emerald'}`} style={{ width: 24, height: 24, fontSize: 10 }}>
                  {p.initials}
                </div>
                <span style={{ flex: 1 }}>{p.name}</span>
                {activeProfile?.id === p.id && (
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--accent)' }} />
                )}
              </button>
            ))}
          </div>
        )}

        <Link href="/ajustes" className={`nav-item${pathname.startsWith('/ajustes') ? ' active' : ''}`}>
          <Settings size={19} />
          <span>Ajustes</span>
        </Link>

        {/* Active user */}
        {activeProfile && (
          <div className="user-row">
            <div className={`avatar ${AV_CLASS[activeProfile.color] || 'av-emerald'}`}>
              {activeProfile.initials}
            </div>
            <div className="user-meta">
              <span className="user-name">{activeProfile.name}</span>
              <span className="user-sub">{activeProfile.role}</span>
            </div>
          </div>
        )}

        <button
          onClick={signOut}
          className="nav-item"
          style={{ color: 'var(--text-faint)', marginTop: 2 }}
        >
          <LogOut size={19} />
          <span>Salir</span>
        </button>
      </div>
    </aside>
  )
}
