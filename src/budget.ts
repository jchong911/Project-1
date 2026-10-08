export type Bucket = string

export interface BucketDefinition {
  id: string
  name: string
  percentage: number
  color: string
}

export interface Paycheck {
  id: string
  date: string
  amount: number
  sourceNote?: string
}

export interface Expense {
  id: string
  date: string
  amount: number
  category: string
  description: string
  bucket: Bucket
}

export interface Subscription {
  id: string
  name: string
  amount: number
  category: string
  bucket: Bucket
  active: boolean
}

export interface Contribution {
  id: string
  date: string
  amount: number
}

export interface Goal {
  id: string
  name: string
  target: number
  saved: number
  includeInSavings: boolean
  contributions: Contribution[]
}

export interface BudgetData {
  paychecks: Paycheck[]
  subscriptions: Subscription[]
  expenses: Expense[]
  goals: Goal[]
  buckets: BucketDefinition[]
  percentages: Record<Bucket, number>
  savingsAmount: number | null
}

export interface MonthlyStats {
  income: number
  used: Record<Bucket, number>
  allocations: Record<Bucket, number>
  purchases: number
  subscriptions: number
  goalContributions: number
  remaining: number
}

export const defaultBuckets: BucketDefinition[] = [
  { id: 'needs', name: 'Needs', percentage: 50, color: '#65ad88' },
  { id: 'wants', name: 'Wants', percentage: 30, color: '#d5ac40' },
  { id: 'savings', name: 'Savings', percentage: 20, color: '#7191c4' },
]

export const createEmptyData = (): BudgetData => ({
  paychecks: [],
  subscriptions: [],
  expenses: [],
  goals: [],
  buckets: defaultBuckets.map((bucket) => ({ ...bucket })),
  percentages: { needs: 50, wants: 30, savings: 20 },
  savingsAmount: null,
})

const legacyStorageKey = 'pocket-plan-data-v1'

export const readLegacyBudgetData = (): BudgetData | null => {
  if (typeof window === 'undefined') return null
  try {
    const saved = window.localStorage.getItem(legacyStorageKey)
    if (!saved) return null
    const parsed = JSON.parse(saved) as Partial<BudgetData> & { isSample?: boolean }
    if (parsed.isSample) return null

    const empty = createEmptyData()
    const legacy: BudgetData = {
      ...empty,
      paychecks: Array.isArray(parsed.paychecks) ? parsed.paychecks : [],
      expenses: Array.isArray(parsed.expenses) ? parsed.expenses : [],
      subscriptions: [],
      goals: Array.isArray(parsed.goals) ? parsed.goals : [],
      savingsAmount: typeof parsed.savingsAmount === 'number' && parsed.savingsAmount >= 0
        ? parsed.savingsAmount
        : null,
      buckets: Array.isArray(parsed.buckets) && parsed.buckets.length > 0
        ? parsed.buckets
        : defaultBuckets.map((bucket) => ({ ...bucket })),
      percentages: { ...empty.percentages, ...parsed.percentages },
    }
    const hasRecords = legacy.paychecks.length > 0 || legacy.expenses.length > 0 || legacy.goals.length > 0
    const hasCustomSplit = Object.keys(empty.percentages).some((key) =>
      legacy.percentages[key as Bucket] !== empty.percentages[key as Bucket],
    )
    return hasRecords || hasCustomSplit ? legacy : null
  } catch {
    return null
  }
}

export const clearLegacyBudgetData = () => {
  try {
    window.localStorage.removeItem(legacyStorageKey)
  } catch {
    // Preserve the synced app if local browser storage is unavailable.
  }
}

export const getCurrentMonthKey = (date = new Date()) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`

export const getTodayString = (date = new Date()) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`

export const shiftMonthKey = (monthKey: string, offset: number) => {
  const [year, month] = monthKey.split('-').map(Number)
  const shifted = new Date(year, month - 1 + offset, 1)
  return getCurrentMonthKey(shifted)
}

export const formatMonthLabel = (monthKey: string) => {
  const [year, month] = monthKey.split('-').map(Number)
  return new Intl.DateTimeFormat('en-HK', { month: 'long', year: 'numeric' }).format(
    new Date(year, month - 1, 1),
  )
}

export const formatCurrency = (amount: number) =>
  new Intl.NumberFormat('en-HK', {
    style: 'currency',
    currency: 'HKD',
    maximumFractionDigits: 2,
  }).format(amount)

export const formatShortDate = (date: string) =>
  new Intl.DateTimeFormat('en-HK', { day: 'numeric', month: 'short' }).format(
    new Date(`${date}T00:00:00`),
  )

export const calculateMonthlyStats = (data: BudgetData, monthKey: string): MonthlyStats => {
  const paychecks = data.paychecks.filter((paycheck) => paycheck.date.startsWith(monthKey))
  const activeSubscriptions = data.subscriptions.filter((subscription) => subscription.active)
  const expenses = data.expenses.filter((expense) => expense.date.startsWith(monthKey))
  const income = paychecks.reduce((total, paycheck) => total + paycheck.amount, 0)
  const goalContributions = data.goals.reduce((total, goal) => total + goal.contributions
    .filter((contribution) => contribution.date.startsWith(monthKey))
    .reduce((goalTotal, contribution) => goalTotal + contribution.amount, 0), 0)
  const savingsContributions = data.goals.reduce((total, goal) => {
    if (!goal.includeInSavings) return total
    return total + goal.contributions
      .filter((contribution) => contribution.date.startsWith(monthKey))
      .reduce((goalTotal, contribution) => goalTotal + contribution.amount, 0)
  }, 0)

  const buckets = data.buckets.length > 0 ? data.buckets : defaultBuckets
  const used: Record<Bucket, number> = Object.fromEntries(
    buckets.map((bucket) => [
      bucket.id,
      expenses
        .filter((expense) => expense.bucket === bucket.id)
        .reduce((total, expense) => total + expense.amount, 0)
        + activeSubscriptions
          .filter((subscription) => subscription.bucket === bucket.id)
          .reduce((total, subscription) => total + subscription.amount, 0),
    ]),
  )
  const allocations: Record<Bucket, number> = Object.fromEntries(
    buckets.map((bucket) => [
      bucket.id,
      bucket.id === 'savings' && data.savingsAmount !== null
        ? data.savingsAmount
        : income * bucket.percentage / 100,
    ]),
  )
  if (buckets.some((bucket) => bucket.id === 'savings') && data.savingsAmount === null) {
    used.savings += savingsContributions
  }
  const purchases = expenses.reduce((total, expense) => total + expense.amount, 0)
    + activeSubscriptions.reduce((total, subscription) => total + subscription.amount, 0)

  return {
    income,
    used,
    allocations,
    purchases,
    subscriptions: activeSubscriptions.reduce((total, subscription) => total + subscription.amount, 0),
    goalContributions,
    remaining: income - purchases - goalContributions,
  }
}