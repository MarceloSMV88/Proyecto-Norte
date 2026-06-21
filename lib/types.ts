export type AccentColor = 'emerald' | 'blue' | 'violet' | 'amber' | 'red'
export type CategoryGroup = 'Fijos' | 'Variables' | 'Ahorro'
export type AccountType = 'Cuenta' | 'Crédito' | 'Ahorro'
export type TransactionType = 'gasto' | 'ingreso' | 'transfer'
export type UsageLevel = 'alto' | 'medio' | 'bajo'
export type ProfileRole = 'Admin' | 'Pro'
export type Theme = 'dark' | 'light'
export type Density = 'compact' | 'normal' | 'comfy'

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
  assigned: number
  spent: number
  fixed: boolean
  month: string
  created_at: string
}

export interface Account {
  id: string
  profile_id: string
  name: string
  bank: string
  type: AccountType
  balance: number
  color: AccentColor
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
