export type AccentColor = 'emerald' | 'blue' | 'violet' | 'amber' | 'red'
export type CategoryGroup = 'Fijos' | 'Variables' | 'Ahorro'
export type AccountType = 'Cuenta' | 'Crédito' | 'Ahorro'
export type TransactionType = 'gasto' | 'ingreso' | 'transfer'
export type UsageLevel = 'alto' | 'medio' | 'bajo'
export type ProfileRole = 'Admin' | 'Pro'
export type Theme = 'dark' | 'light' | 'clay'
export type Density = 'compact' | 'normal' | 'comfy'
export type CommitmentStatus = 'pendiente' | 'detectado' | 'pagado' | 'vencido' | 'omitido' | 'sin_gasto'

export interface Profile {
  id: string
  user_id: string | null
  name: string
  full_name: string
  initials: string
  color: AccentColor
  role: ProfileRole
  income: number
  created_by: string | null
  created_at: string
}

export interface Category {
  id: string
  profile_id: string
  name: string
  icon: string
  color: AccentColor
  group_name: CategoryGroup
  fixed: boolean
  active: boolean
  created_at: string
}

export interface CategoryBudget {
  id: string
  category_id: string
  month: string
  assigned: number
  spent: number
}

// Forma aplanada que usan Presupuesto/Resumen/Hábitos tras el join category_budgets+categories,
// para no tener que tocar el resto de cada pantalla (que ya usa cat.assigned/cat.spent/cat.name).
export type CategoryWithBudget = Category & { assigned: number; spent: number; budget_id: string }

// Forma cruda que devuelve supabase-js al pedir category_budgets con categories!inner(...)
// anidada — es lo que recibe flattenCategoryBudgets() antes de aplanar.
export type CategoryBudgetJoinRow = { id: string; assigned: number; spent: number; categories: Category | null }

export interface Account {
  id: string
  profile_id: string
  name: string
  bank: string
  type: AccountType
  balance: number          // Cuenta/Ahorro: saldo (≥0). Crédito: deuda como negativo.
  credit_limit: number | null  // solo Crédito: cupo total
  last4: string | null     // últimos 4 dígitos (TC, para mapeo Google Wallet)
  account_number: string | null // N° de cuenta (Cuenta/Ahorro, para matchear transferencias por Gmail)
  color: AccentColor
  image_url: string | null // reemplaza el ícono genérico si está seteada
  created_at: string
}

export interface Goal {
  id: string
  profile_id: string
  name: string
  color: AccentColor
  target: number
  current: number
  monthly: number
  due: string | null
  created_at: string
}

export interface Transaction {
  id: string
  profile_id: string
  category_id: string | null
  account_id: string | null
  name: string
  amount: number
  type: TransactionType
  recurring: boolean
  source: string | null
  description: string | null
  date: string
  created_at: string
  categories?: { name: string; icon: string; color: string } | null
  accounts?: { name: string } | null
}

export interface Subscription {
  id: string
  profile_id: string
  category_id: string | null
  name: string
  amount: number
  day: number
  color: AccentColor
  used: UsageLevel
  created_at: string
}

export interface Upcoming {
  id: string
  profile_id: string
  subscription_id: string | null
  category_id: string | null
  account_id: string | null
  name: string
  amount: number
  due_date: string
  categories?: { name: string; icon: string } | null
  accounts?: { name: string } | null
}

export interface MonthlyCommitment {
  id: string
  profile_id: string
  category_id: string
  account_id: string | null
  paid_transaction_id: string | null
  name: string
  group_name: string
  expected_amount: number
  actual_amount: number
  due_day: number | null
  payment_method: string | null
  matcher_hint: string | null
  status: CommitmentStatus
  month: string
  created_at: string
  categories?: { name: string; icon: string; color: string; group_name: CategoryGroup } | null
  accounts?: { name: string } | null
  transactions?: { name: string; amount: number; date: string } | null
}

export interface Summary {
  income: number
  assignedTotal: number
  spentTotal: number
  unassigned: number
  available: number
  savings: number
  safeToday: number
  daysLeft: number
  variableAssigned: number
  variableSpent: number
}

export interface MonthlyBar {
  m: string
  income: number
  expense: number
  partial?: boolean
}

export interface InsightLeak {
  id: string
  label: string
  amount: number
  color: AccentColor
}
