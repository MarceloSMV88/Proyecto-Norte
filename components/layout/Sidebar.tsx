'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard, PiggyBank, ArrowLeftRight,
  Target, CreditCard, TrendingUp, Settings, LogOut,
} from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { useProfiles } from '@/contexts/ProfileContext'

const NAV = [
  { href: '/resumen',      label: 'Resumen',      Icon: LayoutDashboard },
  { href: '/presupuesto',  label: 'Presupuesto',  Icon: PiggyBank },
  { href: '/movimientos',  label: 'Movimientos',  Icon: ArrowLeftRight },
  { href: '/metas',        label: 'Metas',        Icon: Target },
  { href: '/cuentas',      label: 'Cuentas',      Icon: CreditCard },
  { href: '/habitos',      label: 'Hábitos',      Icon: TrendingUp },
]

function Logo() {
  return (
    <svg width="28" height="28" viewBox="0 0 36 36" fill="none">
      <path d="M18 2L22.5 13.5L34 18L22.5 22.5L18 34L13.5 22.5L2 18L13.5 13.5Z" fill="var(--accent)" />
    </svg>
  )
}

function ProfileSwitcher() {
  const { profiles, activeProfile, setActiveProfile } = useProfiles()
  if (profiles.length <= 1) return null

  return (
    <div style={{ padding: '8px 0', borderTop: '1px solid var(--hairline)', marginTop: 'auto' }}>
      {profiles.map(p => (
        <button
          key={p.id}
          onClick={() => setActiveProfile(p)}
          style={{
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '8px 12px',
            borderRadius: 10,
            border: 'none',
            background: activeProfile?.id === p.id ? 'var(--surface)' : 'transparent',
            color: activeProfile?.id === p.id ? 'var(--text)' : 'var(--text-2)',
            cursor: 'pointer',
            fontFamily: 'var(--font-ui)',
            fontSize: 13,
            fontWeight: 500,
            textAlign: 'left',
            transition: 'background .15s',
          }}
        >
          <Avatar profile={p} size={24} />
          <span>{p.name}</span>
          {p.role === 'Admin' && (
            <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--accent)', fontWeight: 600 }}>Admin</span>
          )}
        </button>
      ))}
    </div>
  )
}

function Avatar({ profile, size = 32 }: { profile: { initials: string; color: string }; size?: number }) {
  const colorMap: Record<string, string> = {
    emerald: '#34c98a', blue: '#4f93f5', violet: '#9b8cf0', amber: '#e6b25a', red: '#ef7a63',
  }
  const bg = colorMap[profile.color] || '#34c98a'
  return (
    <div style={{
      width: size, height: size,
      borderRadius: '50%',
      background: bg + '22',
      border: `2px solid ${bg}44`,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontSize: size * 0.38,
      fontWeight: 700,
      color: bg,
      fontFamily: 'var(--font-ui)',
      flexShrink: 0,
    }}>
      {profile.initials}
    </div>
  )
}

export default function Sidebar() {
  const pathname = usePathname()
  const { profile, signOut } = useAuth()
  const { activeProfile } = useProfiles()

  return (
    <nav className="sidebar">
      {/* Logo */}
      <Link href="/resumen" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '4px 12px 16px', textDecoration: 'none' }}>
        <Logo />
        <span style={{ fontFamily: 'var(--font-ui)', fontWeight: 700, fontSize: 18, color: 'var(--text)' }}>Norte</span>
      </Link>

      {/* Nav links */}
      {NAV.map(({ href, label, Icon }) => (
        <Link
          key={href}
          href={href}
          className={`sidebar-nav-item${pathname.startsWith(href) ? ' active' : ''}`}
        >
          <Icon size={16} />
          {label}
        </Link>
      ))}

      <div style={{ marginTop: 'auto' }} />

      {/* Active profile */}
      {activeProfile && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderTop: '1px solid var(--hairline)', marginTop: 8 }}>
          <Avatar profile={activeProfile} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', fontFamily: 'var(--font-ui)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {activeProfile.name}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-faint)' }}>{activeProfile.role}</div>
          </div>
        </div>
      )}

      <ProfileSwitcher />

      {/* Settings + Logout */}
      <Link href="/ajustes" className={`sidebar-nav-item${pathname.startsWith('/ajustes') ? ' active' : ''}`} style={{ marginTop: 4 }}>
        <Settings size={16} />
        Ajustes
      </Link>

      <button
        onClick={signOut}
        className="sidebar-nav-item"
        style={{ border: 'none', width: '100%', cursor: 'pointer', background: 'transparent' }}
      >
        <LogOut size={16} />
        Salir
      </button>
    </nav>
  )
}
