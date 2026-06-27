export function clp(n: number, withSign = false): string {
  const v = Math.round(Math.abs(n))
  const s = '$' + v.toLocaleString('es-CL')
  if (withSign) return (n < 0 ? '−' : '+') + s
  return (n < 0 ? '−' : '') + s
}

export function clpShort(n: number): string {
  const a = Math.abs(n)
  if (a >= 1_000_000) return '$' + (n / 1_000_000).toLocaleString('es-CL', { maximumFractionDigits: 1 }) + 'M'
  if (a >= 1_000) return '$' + Math.round(n / 1_000) + 'k'
  return '$' + Math.round(n)
}

export function formatDate(dateStr: string): string {
  // Parse at local noon to avoid UTC-midnight shifting the date a day back
  const d = new Date(dateStr.slice(0, 10) + 'T12:00:00')
  const todayIso = new Date().toISOString().slice(0, 10)
  const yesterdayIso = new Date(Date.now() - 86400000).toISOString().slice(0, 10)
  const iso = dateStr.slice(0, 10)

  if (iso === todayIso) return 'Hoy'
  if (iso === yesterdayIso) return 'Ayer'
  return d.toLocaleDateString('es-CL', { day: 'numeric', month: 'short' })
}

export function computeSummary(
  categories: { assigned: number; spent: number; fixed: boolean }[],
  accounts: { type: string; balance: number }[],
  income: number,
  daysLeft = 12
) {
  const assignedTotal = categories.reduce((s, c) => s + c.assigned, 0)
  const spentTotal = categories.reduce((s, c) => s + c.spent, 0)
  const unassigned = income - assignedTotal
  const available = accounts.filter(a => a.type === 'Cuenta').reduce((s, a) => s + a.balance, 0)
  const savings = accounts.filter(a => a.type === 'Ahorro').reduce((s, a) => s + a.balance, 0)
  const variableAssigned = categories.filter(c => !c.fixed).reduce((s, c) => s + c.assigned, 0)
  const variableSpent = categories.filter(c => !c.fixed).reduce((s, c) => s + c.spent, 0)
  const safeToday = Math.max(0, Math.round((variableAssigned - variableSpent) / daysLeft / 100) * 100)

  return { income, assignedTotal, spentTotal, unassigned, available, savings, safeToday, daysLeft, variableAssigned, variableSpent }
}

export function getDaysLeftInMonth(): number {
  const now = new Date()
  const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
  return Math.max(1, lastDay - now.getDate())
}

export function getCurrentMonth(): string {
  return new Date().toISOString().slice(0, 7) + '-01'
}

export function cn(...classes: (string | undefined | false | null)[]): string {
  return classes.filter(Boolean).join(' ')
}
