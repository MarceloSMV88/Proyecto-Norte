'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LayoutGrid, Layers, ArrowLeftRight, Flag, Wallet, TrendingUp, Settings } from 'lucide-react'

// Tab bar inferior para ≤920px (el sidebar se oculta en ese breakpoint).
const NAV = [
  { href: '/resumen',     label: 'Resumen',  Icon: LayoutGrid },
  { href: '/presupuesto', label: 'Presup.',  Icon: Layers },
  { href: '/movimientos', label: 'Movs',     Icon: ArrowLeftRight },
  { href: '/metas',       label: 'Metas',    Icon: Flag },
  { href: '/cuentas',     label: 'Cuentas',  Icon: Wallet },
  { href: '/habitos',     label: 'Hábitos',  Icon: TrendingUp },
  { href: '/ajustes',     label: 'Ajustes',  Icon: Settings },
]

export default function MobileNav() {
  const pathname = usePathname()
  return (
    <nav className="mobile-nav" aria-label="Navegación principal">
      {NAV.map(({ href, label, Icon }) => (
        <Link key={href} href={href} className={`mnav-item${pathname.startsWith(href) ? ' active' : ''}`}>
          <Icon size={20} strokeWidth={pathname.startsWith(href) ? 2.4 : 2} />
          <span>{label}</span>
        </Link>
      ))}
    </nav>
  )
}
