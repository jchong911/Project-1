import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import {
  ArrowDownLeft,
  ArrowLeft,
  ArrowRight,
  Banknote,
  BarChart3,
  Check,
  ChevronDown,
  CircleHelp,
  CreditCard,
  Download,
  FileText,
  Goal as GoalIcon,
  LayoutDashboard,
  LoaderCircle,
  LogOut,
  Plus,
  Repeat2,
  ScanLine,
  Settings2,
  ShoppingBag,
  Sparkles,
  Trash2,
  Wallet,
  X,
} from 'lucide-react'
import {
  calculateMonthlyStats,
  clearLegacyBudgetData,
  createEmptyData,
  formatCurrency,
  formatMonthLabel,
  formatShortDate,
  getCurrentMonthKey,
  getTodayString,
  readLegacyBudgetData,
  shiftMonthKey,
  type Bucket,
  type BucketDefinition,
  type BudgetData,
  type Expense,
  type Goal,
  type Paycheck,
  type Subscription,
} from './budget'
import {
  deleteAllBudgetData,
  removeExpense,
  removePaycheck,
  removeSubscription,
  saveBudgetSplit,
  saveExpense,
  saveGoal,
  savePaycheck,
  saveSubscription,
  subscribeToBudget,
} from './budgetCloud'
import { useFirebaseUser } from './authContext'
import type { PayslipSuggestions } from './payslip'
import './App.css'

type View = 'overview' | 'activity' | 'subscriptions' | 'goals' | 'settings'
type Dialog = 'income' | 'expense' | 'subscription' | 'goal' | 'contribution' | 'split' | null
type PayslipReview = PayslipSuggestions & { fileName: string }

const createId = () => globalThis.crypto.randomUUID()

function App() {
  const { user, signOut } = useFirebaseUser()
  const [data, setData] = useState<BudgetData>(createEmptyData)
  const [legacyData, setLegacyData] = useState(readLegacyBudgetData)
  const [isImportingLegacy, setIsImportingLegacy] = useState(false)
  const [dataReady, setDataReady] = useState(false)
  const [syncError, setSyncError] = useState('')
  const [view, setView] = useState<View>('overview')
  const [monthKey, setMonthKey] = useState(getCurrentMonthKey)
  const [dialog, setDialog] = useState<Dialog>(null)
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null)
  const [editingSubscription, setEditingSubscription] = useState<Subscription | null>(null)
  const [targetGoalId, setTargetGoalId] = useState('')
  const [fixedSavings, setFixedSavings] = useState(false)
  const [splitError, setSplitError] = useState('')
  const [draftBuckets, setDraftBuckets] = useState<BucketDefinition[]>([])
  const [payslipReview, setPayslipReview] = useState<PayslipReview | null>(null)
  const [isParsingPayslip, setIsParsingPayslip] = useState(false)
  const [payslipError, setPayslipError] = useState('')

  useEffect(() => {
    return subscribeToBudget(user.uid, (nextData) => {
      setData(nextData)
      setDataReady(true)
      setSyncError('')
    }, (error) => {
      setSyncError(cloudErrorMessage(error))
      setDataReady(true)
    })
  }, [user.uid])

  const commitCloud = (operation: Promise<unknown>) => {
    setSyncError('')
    void operation.catch((error: unknown) => setSyncError(cloudErrorMessage(error)))
  }

  const importLegacyData = async () => {
    if (!legacyData) return
    setIsImportingLegacy(true)
    setSyncError('')
    try {
      await Promise.all([
        ...legacyData.paychecks.map((paycheck) => savePaycheck(user.uid, paycheck)),
        ...legacyData.expenses.map((expense) => saveExpense(user.uid, expense)),
        ...legacyData.goals.map((goal) => saveGoal(user.uid, goal)),
        saveBudgetSplit(user.uid, legacyData.buckets),
      ])
      clearLegacyBudgetData()
      setLegacyData(null)
    } catch (error) {
      setSyncError(cloudErrorMessage(error))
    } finally {
      setIsImportingLegacy(false)
    }
  }

  const discardLegacyData = () => {
    if (!window.confirm('Delete the previous browser copy? This does not change your synced budget.')) return
    clearLegacyBudgetData()
    setLegacyData(null)
  }

  const stats = calculateMonthlyStats(data, monthKey)
  const monthExpenses = data.expenses
    .filter((expense) => expense.date.startsWith(monthKey))
    .sort((first, second) => second.date.localeCompare(first.date))
  const monthPaychecks = data.paychecks
    .filter((paycheck) => paycheck.date.startsWith(monthKey))
    .sort((first, second) => second.date.localeCompare(first.date))
  const monthGoals = data.goals.map((goal) => ({
    ...goal,
    monthContribution: goal.contributions
      .filter((contribution) => contribution.date.startsWith(monthKey))
      .reduce((total, contribution) => total + contribution.amount, 0),
  }))
  const totalAllocated = data.buckets.reduce((total, bucket) => total + bucket.percentage, 0)
  const draftAllocated = draftBuckets.reduce((total, bucket) => total + bucket.percentage, 0)

  const openDialog = (kind: Exclude<Dialog, null>, goalId = '') => {
    setEditingExpense(null)
    setSplitError('')
    setFixedSavings(data.savingsAmount !== null)
    setDraftBuckets(data.buckets.map((bucket) => ({ ...bucket })))
    setTargetGoalId(goalId || data.goals[0]?.id || '')
    setPayslipReview(null)
    setPayslipError('')
    setDialog(kind)
  }

  const updateDraftBucket = (bucketId: string, updates: Partial<BucketDefinition>) => {
    setDraftBuckets((current) => current.map((bucket) => bucket.id === bucketId ? { ...bucket, ...updates } : bucket))
  }

  const addDraftBucket = () => {
    const id = `custom-${createId()}`
    setDraftBuckets((current) => [
      ...current,
      { id, name: 'New bucket', percentage: 0, color: '#7c8c80' },
    ])
  }

  const removeDraftBucket = (bucketId: string) => {
    setDraftBuckets((current) => current.filter((bucket) => bucket.id !== bucketId))
  }

  const openExpense = (expense: Expense) => {
    setEditingExpense(expense)
    setSplitError('')
    setDialog('expense')
  }

  const openSubscription = (subscription?: Subscription) => {
    setEditingSubscription(subscription ?? null)
    setSplitError('')
    setDialog('subscription')
  }

  const closeDialog = () => {
    setDialog(null)
    setEditingExpense(null)
    setEditingSubscription(null)
    setSplitError('')
    setPayslipReview(null)
    setPayslipError('')
  }

  const handlePayslipFile = async (file?: File) => {
    if (!file) return
    setIsParsingPayslip(true)
    setPayslipError('')
    try {
      const { parsePayslip } = await import('./payslip')
      const suggestions = await parsePayslip(file)
      setPayslipReview({
        ...suggestions,
        date: suggestions.date || getTodayString(),
        fileName: file.name,
      })
    } catch (error) {
      setPayslipError(error instanceof Error ? error.message : 'Could not read that file. Enter the amounts manually.')
    } finally {
      setIsParsingPayslip(false)
    }
  }

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const values = new FormData(event.currentTarget)

    if (dialog === 'split') {
      const buckets = draftBuckets.map((bucket) => ({
        ...bucket,
        percentage: Number(values.get(bucket.id)),
      }))
      const savingsAmount = fixedSavings ? Number(values.get('savingsAmount')) : null
      if (buckets.some((bucket) => !Number.isFinite(bucket.percentage) || bucket.percentage < 0) || buckets.reduce((total, bucket) => total + bucket.percentage, 0) !== 100) {
        setSplitError('Your percentages need to add up to 100%.')
        return
      }
      if (savingsAmount !== null && (!Number.isFinite(savingsAmount) || savingsAmount < 0)) {
        setSplitError('Enter a valid monthly savings amount.')
        return
      }
      setData({ ...data, buckets, savingsAmount })
      commitCloud(saveBudgetSplit(user.uid, buckets, savingsAmount))
      closeDialog()
      return
    }

    const base = data
    const id = createId()
    const date = String(values.get('date') || getTodayString())

    if (dialog === 'income') {
      const sourceNote = String(values.get('sourceNote') || '').trim()
      const paycheck = {
        id,
        date,
        amount: Number(values.get('amount')),
        ...(sourceNote ? { sourceNote } : {}),
      }
      setData({ ...base, paychecks: [...base.paychecks, paycheck] })
      commitCloud(savePaycheck(user.uid, paycheck))
    }

    if (dialog === 'expense') {
      const expense: Expense = {
        id: editingExpense?.id ?? id,
        date,
        amount: Number(values.get('amount')),
        category: String(values.get('category') || 'Other'),
        description: String(values.get('description') || 'Expense'),
        bucket: String(values.get('bucket')) as Bucket,
      }
      const alreadyExists = base.expenses.some((item) => item.id === expense.id)
      const expenses = alreadyExists
        ? base.expenses.map((item) => item.id === expense.id ? expense : item)
        : [...base.expenses, expense]
      setData({ ...base, expenses })
      commitCloud(saveExpense(user.uid, expense))
    }

    if (dialog === 'subscription') {
      const subscription: Subscription = {
        id: editingSubscription?.id ?? id,
        name: String(values.get('name') || 'Subscription').trim(),
        amount: Number(values.get('amount')),
        category: String(values.get('category') || 'Other'),
        bucket: String(values.get('bucket')) as Bucket,
        active: values.get('active') === 'on',
      }
      const alreadyExists = base.subscriptions.some((item) => item.id === subscription.id)
      const subscriptions = alreadyExists
        ? base.subscriptions.map((item) => item.id === subscription.id ? subscription : item)
        : [...base.subscriptions, subscription]
      setData({ ...base, subscriptions })
      commitCloud(saveSubscription(user.uid, subscription))
    }

    if (dialog === 'goal') {
      const goal: Goal = {
        id,
        name: String(values.get('name')),
        target: Number(values.get('target')),
        saved: 0,
        includeInSavings: values.get('includeInSavings') === 'on',
        contributions: [],
      }
      setData({ ...base, goals: [...base.goals, goal] })
      commitCloud(saveGoal(user.uid, goal))
    }

    if (dialog === 'contribution') {
      const originalGoal = data.goals.find((goal) => goal.id === targetGoalId)
      const existingGoal = base.goals.find((goal) => goal.id === targetGoalId)
      const goal = existingGoal ?? (originalGoal ? { ...originalGoal, saved: 0, contributions: [] } : null)
      if (!goal) return
      const amount = Number(values.get('amount'))
      const updatedGoal: Goal = {
        ...goal,
        saved: goal.saved + amount,
        contributions: [...goal.contributions, { id, date, amount }],
      }
      const goals = existingGoal
        ? base.goals.map((item) => item.id === goal.id ? updatedGoal : item)
        : [...base.goals, updatedGoal]
      setData({ ...base, goals })
      commitCloud(saveGoal(user.uid, updatedGoal))
    }

    closeDialog()
  }

  const deletePaycheck = (paycheckId: string) => {
    setData({ ...data, paychecks: data.paychecks.filter((paycheck) => paycheck.id !== paycheckId) })
    commitCloud(removePaycheck(user.uid, paycheckId))
  }

  const deleteExpense = (expenseId: string) => {
    setData({ ...data, expenses: data.expenses.filter((expense) => expense.id !== expenseId) })
    commitCloud(removeExpense(user.uid, expenseId))
  }

  const deleteSubscription = (subscriptionId: string) => {
    setData({ ...data, subscriptions: data.subscriptions.filter((subscription) => subscription.id !== subscriptionId) })
    commitCloud(removeSubscription(user.uid, subscriptionId))
  }

  const clearAllData = () => {
    if (window.confirm('Delete all budget data in your account? This cannot be undone.')) {
      setSyncError('')
      void deleteAllBudgetData(user.uid).then(() => setView('overview')).catch((error: unknown) => {
        setSyncError(cloudErrorMessage(error))
      })
    }
  }

  const exportData = () => {
    const file = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(file)
    link.download = 'pocket-plan-data.json'
    link.click()
    URL.revokeObjectURL(link.href)
  }

  const navItems: { id: View; label: string; icon: ReactNode }[] = [
    { id: 'overview', label: 'Overview', icon: <LayoutDashboard size={18} /> },
    { id: 'activity', label: 'Activity', icon: <CreditCard size={18} /> },
    { id: 'subscriptions', label: 'Subscriptions', icon: <Repeat2 size={18} /> },
    { id: 'goals', label: 'Goals', icon: <GoalIcon size={18} /> },
    { id: 'settings', label: 'Budget setup', icon: <Settings2 size={18} /> },
  ]

  const headings: Record<View, { eyebrow: string; title: string; description: string }> = {
    overview: {
      eyebrow: 'Your money, at a glance',
      title: 'Make room for what matters.',
      description: 'A clear view of what came in, what went out, and what is still yours to plan.',
    },
    activity: {
      eyebrow: 'Monthly ledger',
      title: 'Every entry, accounted for.',
      description: 'Review, correct, or remove an expense from your monthly record.',
    },
    subscriptions: {
      eyebrow: 'Recurring costs',
      title: 'Subscriptions',
      description: 'Track monthly services such as YouTube Premium, Gemini, or other recurring payments.',
    },
    goals: {
      eyebrow: 'The longer view',
      title: 'Small steps add up.',
      description: 'Track the things you are putting money aside for, one contribution at a time.',
    },
    settings: {
      eyebrow: 'Make it yours',
      title: 'Set your budget rhythm.',
      description: 'Choose a split that fits your bank income and keep your data in your hands.',
    },
  }

  const heading = headings[view]

  if (!dataReady) return <main className="auth-loading"><LoaderCircle size={20} /><span>Loading your synced budget…</span></main>

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a className="brand" href="#overview" onClick={() => setView('overview')}>
          <span className="brand-mark"><i /><i /><i /></span>
          <span className="brand-name">pocket<span>plan</span></span>
        </a>

        <div className="sidebar-caption">YOUR SPACE</div>
        <nav className="primary-nav" aria-label="Main navigation">
          {navItems.map((item) => (
            <button
              key={item.id}
              className={`nav-item ${view === item.id ? 'active' : ''}`}
              onClick={() => setView(item.id)}
              aria-current={view === item.id ? 'page' : undefined}
            >
              {item.icon}<span>{item.label}</span>
              {view === item.id && <span className="nav-indicator" />}
            </button>
          ))}
        </nav>

        <div className="sidebar-bottom">
          <div className="profile-row">
            <div className="profile-avatar">{user.email?.slice(0, 1).toUpperCase() ?? 'U'}</div>
            <div className="profile-copy"><strong>{user.email ?? 'Personal account'}</strong><span>Signed in</span></div>
            <button className="icon-button logout-button" aria-label="Sign out" title="Sign out" onClick={() => void signOut()}><LogOut size={17} /></button>
          </div>
        </div>
      </aside>

      <main className="main-content">
        <div className="topbar">
          <div className="breadcrumb"><span>Workspace</span><ArrowRight size={13} /><strong>{navItems.find((item) => item.id === view)?.label}</strong></div>
          <div className="topbar-right">
            <span className={`local-status ${syncError ? 'sync-error' : ''}`}><span /> {syncError ? 'Sync issue' : 'Live sync'}</span>
            <button className="icon-button help-button" aria-label="About cloud sync" title="Budget entries sync through your private Firebase account"><CircleHelp size={18} /></button>
          </div>
        </div>

        {syncError && <div className="cloud-error" role="alert">{syncError}</div>}

        <header className="page-header">
          <div>
            <p className="eyebrow">{heading.eyebrow}</p>
            <h1>{heading.title}</h1>
            <p className="page-description">{heading.description}</p>
          </div>
          <div className="header-actions">
            {(view === 'overview' || view === 'activity' || view === 'subscriptions') && (
              <div className="month-switcher" aria-label="Select month">
                <button className="icon-button" aria-label="Previous month" onClick={() => setMonthKey(shiftMonthKey(monthKey, -1))}><ArrowLeft size={17} /></button>
                <span>{formatMonthLabel(monthKey)}</span>
                <button className="icon-button" aria-label="Next month" onClick={() => setMonthKey(shiftMonthKey(monthKey, 1))}><ArrowRight size={17} /></button>
              </div>
            )}
            <button className="button button-secondary" onClick={() => openDialog('income')}><Banknote size={16} /> Add income</button>
            {view === 'subscriptions'
              ? <button className="button button-primary" onClick={() => openSubscription()}><Plus size={17} /> Add subscription</button>
              : <button className="button button-primary" onClick={() => openDialog('expense')}><Plus size={17} /> Add expense</button>}
          </div>
        </header>

        {view === 'overview' && (
          <>
            <section className="metrics-grid" aria-label="Monthly totals">
              <Metric label="Bank income" value={formatCurrency(stats.income)} note={stats.income ? 'Your recorded bank amount' : 'Add your first income entry'} icon={<ArrowDownLeft size={17} />} tone="green" />
              <Metric label="Needs + wants" value={formatCurrency(stats.purchases)} note="Everyday spending" icon={<ShoppingBag size={17} />} tone="coral" />
              <Metric label="To your goals" value={formatCurrency(stats.goalContributions)} note="This month" icon={<GoalIcon size={17} />} tone="blue" />
              <Metric label="Still to plan" value={formatCurrency(stats.remaining)} note={stats.remaining < 0 ? 'Past this month’s income' : 'Income after tracked activity'} icon={<Wallet size={17} />} tone="lime" />
            </section>

            <section className="budget-section">
              <div className="section-heading">
                <div><p className="section-kicker">YOUR MONEY, YOUR PLAN</p><h2>Monthly breakdown</h2></div>
                <button className="text-button" onClick={() => openDialog('split')}>Customize buckets <Settings2 size={15} /></button>
              </div>
              {totalAllocated !== 100 && <p className="inline-warning">Your buckets currently add up to {totalAllocated}%. Set them to 100% to complete your plan.</p>}
              <div className="budget-layout">
                <div className="split-visual">
                  <div
                    className="split-ring"
                    role="img"
                    aria-label="Custom monthly budget split"
                    style={{ background: `conic-gradient(${data.buckets.map((bucket, index) => `${bucket.color} ${data.buckets.slice(0, index).reduce((total, item) => total + item.percentage, 0)}% ${data.buckets.slice(0, index + 1).reduce((total, item) => total + item.percentage, 0)}%`).join(', ')})` }}
                  ><div><span>BASED ON</span><strong>BANK AMOUNT</strong></div></div>
                  <div className="split-legend">
                    {data.buckets.map((bucket) => <span key={bucket.id}><i className="legend-dot" style={{ background: bucket.color }} />{bucket.name} <strong>{bucket.percentage}%</strong></span>)}
                  </div>
                </div>
                <div className="bucket-grid">
                  {data.buckets.map((bucket) => (
                    <BucketPanel
                      key={bucket.id}
                      allocation={stats.allocations[bucket.id]}
                      used={stats.used[bucket.id] ?? 0}
                      percentage={bucket.id === 'savings' && data.savingsAmount !== null ? null : bucket.percentage}
                      color={bucket.color}
                      name={bucket.name}
                    />
                  ))}
                </div>
              </div>
            </section>

            <div className="lower-grid">
              <ActivityPanel expenses={monthExpenses.slice(0, 5)} buckets={data.buckets} onViewAll={() => setView('activity')} onEdit={openExpense} onDelete={deleteExpense} />
              <GoalsPanel goals={monthGoals.slice(0, 2)} onViewAll={() => setView('goals')} onAdd={() => openDialog('goal')} onContribute={(goalId) => openDialog('contribution', goalId)} />
            </div>
          </>
        )}

        {view === 'activity' && (
          <section className="page-section">
            <div className="section-heading"><div><p className="section-kicker">{formatMonthLabel(monthKey).toUpperCase()}</p><h2>Money activity</h2></div><span className="count-label">{monthPaychecks.length + monthExpenses.length} entries</span></div>
            <div className="activity-section">
              <div className="activity-section-heading"><h3>Income</h3><span>{monthPaychecks.length} recorded</span></div>
              <IncomeList paychecks={monthPaychecks} onDelete={deletePaycheck} />
            </div>
            <div className="activity-section">
              <div className="activity-section-heading"><h3>Spending</h3><span>{monthExpenses.length} recorded</span></div>
              <ActivityList expenses={monthExpenses} buckets={data.buckets} onEdit={openExpense} onDelete={deleteExpense} />
            </div>
          </section>
        )}

        {view === 'subscriptions' && (
          <section className="page-section">
            <div className="section-heading"><div><p className="section-kicker">RECURRING AMOUNTS</p><h2>Monthly services</h2></div><span className="count-label">{formatCurrency(stats.subscriptions)} active per month</span></div>
            <SubscriptionList subscriptions={data.subscriptions} buckets={data.buckets} onEdit={openSubscription} onDelete={deleteSubscription} />
          </section>
        )}

        {view === 'goals' && (
          <section className="page-section">
            <div className="section-heading"><div><p className="section-kicker">SAVING WITH PURPOSE</p><h2>Your goals</h2></div><button className="button button-primary" onClick={() => openDialog('goal')}><Plus size={17} /> New goal</button></div>
            <GoalsList goals={monthGoals} onContribute={(goalId) => openDialog('contribution', goalId)} />
          </section>
        )}

        {view === 'settings' && (
          <section className="settings-grid">
            <div className="settings-panel split-settings">
              <div className="settings-icon"><BarChart3 size={19} /></div>
              <p className="section-kicker">MONTHLY ALLOCATION</p>
              <h2>Choose your split</h2>
              <p>Percentages are applied to your bank income. Change them as your life changes.</p>
              <div className="settings-split-list">
                {data.buckets.map((bucket) => <div key={bucket.id}><span>{bucket.name}</span><strong>{bucket.percentage}%</strong></div>)}
              </div>
              <button className="button button-secondary" onClick={() => openDialog('split')}><Settings2 size={16} /> Edit buckets</button>
            </div>
            <div className="settings-panel currency-settings">
              <div className="settings-icon blue-icon"><Banknote size={19} /></div>
              <p className="section-kicker">CURRENCY</p>
              <h2>Hong Kong dollars</h2>
              <p>All budget totals currently use HKD. Automatic exchange-rate conversion is not included in this preview.</p>
              <div className="currency-code"><span>HKD</span><strong>HK$</strong><ChevronDown size={16} /></div>
            </div>
            <div className="settings-panel storage-settings">
              <div className="settings-icon coral-icon"><FileText size={19} /></div>
              <p className="section-kicker">YOUR DATA</p>
              <h2>Synced to your account</h2>
              <p>Budget entries sync through Firebase. Payslips are read in your browser and never uploaded or retained by Pocketplan.</p>
              <div className="settings-actions"><button className="button button-secondary" onClick={exportData}><Download size={16} /> Export data</button><button className="button button-danger" onClick={clearAllData}><Trash2 size={15} /> Delete all cloud data</button></div>
            </div>
            {legacyData && <div className="settings-panel legacy-import-panel">
              <div className="settings-icon"><Download size={19} /></div>
              <p className="section-kicker">PREVIOUS BROWSER DATA</p>
              <h2>Bring your old entries with you</h2>
              <p>Found {legacyData.paychecks.length} paychecks, {legacyData.expenses.length} expenses, and {legacyData.goals.length} goals on this browser. Import them into your account, or remove the old browser copy.</p>
              <div className="settings-actions">
                <button className="button button-primary" onClick={() => void importLegacyData()} disabled={isImportingLegacy}><Download size={16} /> {isImportingLegacy ? 'Importing…' : 'Import to my account'}</button>
                <button className="button button-danger" onClick={discardLegacyData} disabled={isImportingLegacy}><Trash2 size={15} /> Delete browser copy</button>
              </div>
            </div>}
          </section>
        )}

        <footer className="page-footer"><span>POCKETPLAN · PERSONAL FINANCE PREVIEW</span></footer>
      </main>

      {dialog && (
        <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) closeDialog() }}>
          <section className="dialog-panel" role="dialog" aria-modal="true" aria-labelledby="dialog-title">
            <div className="dialog-heading"><div><p className="section-kicker">{dialog === 'split' ? 'BUDGET SETTINGS' : 'YOUR MONEY, YOUR RECORD'}</p><h2 id="dialog-title">{dialogTitle(dialog, editingExpense, editingSubscription)}</h2></div><button className="icon-button" aria-label="Close" onClick={closeDialog}><X size={19} /></button></div>
            <form onSubmit={handleSubmit} key={`${dialog}-${editingExpense?.id ?? editingSubscription?.id ?? 'new'}-${payslipReview?.fileName ?? 'manual'}`}>
              {(dialog === 'income' || dialog === 'expense' || dialog === 'contribution') && <FormField label="Date"><input name="date" type="date" defaultValue={editingExpense?.date ?? (dialog === 'income' ? payslipReview?.date : undefined) ?? getTodayString()} required /></FormField>}
              {dialog === 'income' && <>
                <div
                  className="payslip-import"
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={(event) => { event.preventDefault(); void handlePayslipFile(event.dataTransfer.files[0]) }}
                >
                  <label className="payslip-dropzone">
                    {isParsingPayslip ? <LoaderCircle size={18} className="parsing-spinner" /> : <ScanLine size={18} />}
                    <span>{isParsingPayslip ? 'Reading locally…' : 'Drop a payslip or scan to fill these fields'}</span>
                    <input type="file" accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg" onChange={(event) => void handlePayslipFile(event.target.files?.[0])} disabled={isParsingPayslip} />
                  </label>
                  <p>PDF, JPG, or PNG. Read in this browser; the file is never uploaded or saved.</p>
                  {payslipReview && <div className="payslip-result"><Check size={14} /><span>Read from {payslipReview.fileName}. Review and correct the amount below.</span></div>}
                  {payslipError && <p className="payslip-error" role="alert">{payslipError}</p>}
                </div>
                <FormField label="Bank amount" hint="The amount you want to use for this income entry"><div className="money-input"><span>HK$</span><input name="amount" type="number" min="0.01" step="0.01" placeholder="0.00" defaultValue={payslipReview?.amount} required /></div></FormField>
                {payslipReview && <FormField label="Where will you keep the original?" hint="Optional note, saved with the income entry"><input name="sourceNote" type="text" maxLength={120} placeholder="e.g. On my phone, in Files" /></FormField>}
              </>}
              {dialog === 'expense' && <>
                <FormField label="What was it?"><input name="description" type="text" placeholder="e.g. Weekly groceries" defaultValue={editingExpense?.description} maxLength={70} required /></FormField>
                <FormField label="Amount"><div className="money-input"><span>HK$</span><input name="amount" type="number" min="0.01" step="0.01" placeholder="0.00" defaultValue={editingExpense?.amount} required /></div></FormField>
                <div className="form-row">
                  <FormField label="Category"><input name="category" list="category-options" placeholder="Choose or type" defaultValue={editingExpense?.category} required /><datalist id="category-options"><option>Housing</option><option>Groceries</option><option>Transport</option><option>Dining</option><option>Shopping</option><option>Health</option><option>Utilities</option><option>Other</option></datalist></FormField>
                  <FormField label="Bucket"><select name="bucket" defaultValue={editingExpense?.bucket ?? data.buckets[0]?.id}>{data.buckets.map((bucket) => <option key={bucket.id} value={bucket.id}>{bucket.name}</option>)}</select></FormField>
                </div>
              </>}
              {dialog === 'subscription' && <>
                <FormField label="Service name"><input name="name" type="text" placeholder="e.g. YouTube Premium or Gemini" defaultValue={editingSubscription?.name} maxLength={60} required /></FormField>
                <FormField label="Monthly amount"><div className="money-input"><span>HK$</span><input name="amount" type="number" min="0.01" step="0.01" placeholder="0.00" defaultValue={editingSubscription?.amount} required /></div></FormField>
                <div className="form-row">
                  <FormField label="Category"><input name="category" list="subscription-category-options" placeholder="Choose or type" defaultValue={editingSubscription?.category ?? 'Subscriptions'} required /><datalist id="subscription-category-options"><option>Subscriptions</option><option>Entertainment</option><option>Productivity</option><option>Utilities</option><option>Other</option></datalist></FormField>
                  <FormField label="Bucket"><select name="bucket" defaultValue={editingSubscription?.bucket ?? data.buckets[0]?.id}>{data.buckets.map((bucket) => <option key={bucket.id} value={bucket.id}>{bucket.name}</option>)}</select></FormField>
                </div>
                <label className="check-field"><input name="active" type="checkbox" defaultChecked={editingSubscription?.active ?? true} /><span><strong>Active monthly subscription</strong><small>Turn off to keep it in your list without counting it in spending.</small></span></label>
              </>}
              {dialog === 'goal' && <>
                <FormField label="Goal name"><input name="name" type="text" placeholder="e.g. New laptop" maxLength={48} required /></FormField>
                <FormField label="Target amount"><div className="money-input"><span>HK$</span><input name="target" type="number" min="1" step="0.01" placeholder="0.00" required /></div></FormField>
                <label className="check-field"><input name="includeInSavings" type="checkbox" defaultChecked /><span><strong>Count contributions in my savings bucket</strong><small>Turn off to track this goal separately from the 50/30/20 plan.</small></span></label>
              </>}
              {dialog === 'contribution' && <>
                {data.goals.length > 1 && <FormField label="Goal"><select value={targetGoalId} onChange={(event) => setTargetGoalId(event.target.value)}>{data.goals.map((goal) => <option key={goal.id} value={goal.id}>{goal.name}</option>)}</select></FormField>}
                <FormField label="Contribution"><div className="money-input"><span>HK$</span><input name="amount" type="number" min="0.01" step="0.01" placeholder="0.00" required autoFocus /></div></FormField>
                <p className="dialog-note">Your goal total and monthly savings will update when you save.</p>
              </>}
              {dialog === 'split' && <>
                <div className="split-inputs">
                  {draftBuckets.map((bucket) => <FormField key={bucket.id} label={bucket.name}><div className="percent-input"><input name={bucket.id} type="number" min="0" max="100" step="1" value={bucket.percentage} onChange={(event) => updateDraftBucket(bucket.id, { percentage: Number(event.target.value) })} required /><span>%</span></div></FormField>)}
                </div>
                <div className="custom-bucket-editor">
                  {draftBuckets.map((bucket) => <div className="custom-bucket-row" key={bucket.id}><input aria-label="Bucket name" value={bucket.name} onChange={(event) => updateDraftBucket(bucket.id, { name: event.target.value })} maxLength={32} /><input aria-label="Bucket color" type="color" value={bucket.color} onChange={(event) => updateDraftBucket(bucket.id, { color: event.target.value })} /><button type="button" className="row-delete" aria-label={`Remove ${bucket.name}`} onClick={() => removeDraftBucket(bucket.id)}><Trash2 size={15} /></button></div>)}
                  <button type="button" className="button button-secondary" onClick={addDraftBucket}><Plus size={15} /> Add custom bucket</button>
                </div>
                <label className="check-field"><input name="fixedSavings" type="checkbox" checked={fixedSavings} onChange={(event) => setFixedSavings(event.target.checked)} /><span><strong>Use a fixed monthly savings amount</strong><small>Choose a specific amount instead of the savings percentage.</small></span></label>
                {fixedSavings && <FormField label="Monthly savings amount"><div className="money-input"><span>HK$</span><input name="savingsAmount" type="number" min="0" step="0.01" defaultValue={data.savingsAmount ?? 0} required /></div></FormField>}
                <div className={`split-total ${splitError ? 'error' : ''}`}><span>{splitError || 'Your percentages must total 100%; the fixed amount overrides savings.'}</span><strong>{draftAllocated}%</strong></div>
              </>}
              <div className="dialog-actions"><button className="button button-secondary" type="button" onClick={closeDialog}>Cancel</button><button className="button button-primary" type="submit"><Check size={16} /> {dialog === 'split' ? 'Save split' : editingExpense ? 'Save changes' : 'Save entry'}</button></div>
            </form>
          </section>
        </div>
      )}
    </div>
  )
}

function Metric({ label, value, note, icon, tone }: { label: string; value: string; note: string; icon: ReactNode; tone: string }) {
  return <div className="metric"><div className={`metric-icon ${tone}`}>{icon}</div><span className="metric-label">{label}</span><strong className="metric-value">{value}</strong><span className="metric-note">{note}</span></div>
}

function BucketPanel({ allocation, used, percentage, color, name }: { allocation: number; used: number; percentage: number | null; color: string; name: string }) {
  const progress = allocation > 0 ? Math.min(used / allocation * 100, 100) : used > 0 ? 100 : 0
  const over = used > allocation
  const amountLabel = percentage === null ? formatCurrency(allocation) : `${percentage}%`
  return (
    <div className="bucket-panel" style={{ borderTopColor: color }}>
      <div className="bucket-top"><span className="bucket-symbol" style={{ color, background: `${color}22` }}><GoalIcon size={17} /></span><span className="bucket-percent">{amountLabel}</span></div>
      <h3>{name}</h3>
      <div className="bucket-amount"><strong>{formatCurrency(used)}</strong><span>of {formatCurrency(allocation)}</span></div>
      <div className="progress-track" role="progressbar" aria-label={`${name} budget used`} aria-valuenow={Math.round(progress)} aria-valuemin={0} aria-valuemax={100}><span className={over ? 'over' : ''} style={{ width: `${progress}%`, background: color }} /></div>
      <p className={`bucket-status ${over ? 'over-text' : ''}`}>{over ? `${formatCurrency(used - allocation)} over plan` : `${formatCurrency(allocation - used)} left`}</p>
    </div>
  )
}

function ActivityPanel({ expenses, buckets, onViewAll, onEdit, onDelete }: { expenses: Expense[]; buckets: BucketDefinition[]; onViewAll: () => void; onEdit: (expense: Expense) => void; onDelete: (id: string) => void }) {
  return <section className="list-panel"><div className="section-heading compact-heading"><div><p className="section-kicker">RECENT ENTRIES</p><h2>Where it went</h2></div><button className="text-button" onClick={onViewAll}>View all <ArrowRight size={15} /></button></div><ActivityList expenses={expenses} buckets={buckets} onEdit={onEdit} onDelete={onDelete} /></section>
}

function IncomeList({ paychecks, onDelete }: { paychecks: Paycheck[]; onDelete: (id: string) => void }) {
  if (paychecks.length === 0) return <div className="empty-state"><span><Banknote size={20} /></span><strong>No income recorded for this month</strong><p>Add an income entry to see it here.</p></div>
  return <div className="activity-list">{paychecks.map((paycheck) => (
    <div className="activity-row income-row" key={paycheck.id}>
      <div className="activity-main">
        <span className="activity-icon income"><ArrowDownLeft size={17} /></span>
        <span className="activity-copy"><strong>Bank income</strong><small>{paycheck.sourceNote || 'Imported or entered manually'} <i /> {formatShortDate(paycheck.date)}</small></span>
      </div>
      <span className="activity-bucket">Income</span>
      <strong className="activity-amount">+{formatCurrency(paycheck.amount)}</strong>
      <button className="row-delete" aria-label={`Delete income from ${formatShortDate(paycheck.date)}`} title="Delete income" onClick={() => onDelete(paycheck.id)}><Trash2 size={15} /></button>
    </div>
  ))}</div>
}

function ActivityList({ expenses, buckets, onEdit, onDelete }: { expenses: Expense[]; buckets: BucketDefinition[]; onEdit: (expense: Expense) => void; onDelete: (id: string) => void }) {
  const bucketById = (bucketId: Bucket) => buckets.find((bucket) => bucket.id === bucketId) ?? { id: bucketId, name: bucketId, percentage: 0, color: '#65ad88' }
  if (expenses.length === 0) return <div className="empty-state"><span><CreditCard size={20} /></span><strong>No expenses for this month yet</strong><p>Add your first expense to see it here.</p></div>
  return <div className="activity-list">{expenses.map((expense) => {
    const bucket = bucketById(expense.bucket)
    return <div className="activity-row" key={expense.id}>
      <button className="activity-main" onClick={() => onEdit(expense)} aria-label={`Edit ${expense.description}`}>
        <span className="activity-icon" style={{ color: bucket.color, background: `${bucket.color}22` }}><ShoppingBag size={17} /></span>
        <span className="activity-copy"><strong>{expense.description}</strong><small>{expense.category} <i /> {formatShortDate(expense.date)}</small></span>
      </button>
      <span className="activity-bucket">{bucket.name}</span>
      <strong className="activity-amount">−{formatCurrency(expense.amount)}</strong>
      <button className="row-delete" aria-label={`Delete ${expense.description}`} title="Delete expense" onClick={() => onDelete(expense.id)}><Trash2 size={15} /></button>
    </div>
  })}</div>
}

function SubscriptionList({ subscriptions, buckets, onEdit, onDelete }: { subscriptions: Subscription[]; buckets: BucketDefinition[]; onEdit: (subscription: Subscription) => void; onDelete: (id: string) => void }) {
  const bucketById = (bucketId: Bucket) => buckets.find((bucket) => bucket.id === bucketId) ?? { id: bucketId, name: bucketId, percentage: 0, color: '#65ad88' }
  if (subscriptions.length === 0) return <div className="empty-state"><span><Repeat2 size={20} /></span><strong>No active subscriptions yet</strong><p>Add a recurring service to keep monthly costs visible.</p></div>
  return <div className="subscription-list">{subscriptions.map((subscription) => {
    const bucket = bucketById(subscription.bucket)
    return <article className="subscription-row" key={subscription.id}>
      <span className="subscription-icon"><Repeat2 size={18} /></span>
      <div className="subscription-copy"><strong>{subscription.name}</strong><span>{subscription.category} · {bucket.name}</span></div>
      <strong className="subscription-amount">{formatCurrency(subscription.amount)}<small>/month</small></strong>
      <div className="subscription-actions"><button className="text-button" onClick={() => onEdit(subscription)}>Edit</button><button className="row-delete" aria-label={`Delete ${subscription.name}`} title="Delete subscription" onClick={() => onDelete(subscription.id)}><Trash2 size={15} /></button></div>
    </article>
  })}</div>
}

function GoalsPanel({ goals, onViewAll, onAdd, onContribute }: { goals: (Goal & { monthContribution: number })[]; onViewAll: () => void; onAdd: () => void; onContribute: (goalId: string) => void }) {
  return <section className="list-panel goals-panel"><div className="section-heading compact-heading"><div><p className="section-kicker">FUTURE YOU</p><h2>Goals in motion</h2></div>{goals.length > 0 && <button className="text-button" onClick={onViewAll}>All goals <ArrowRight size={15} /></button>}</div>
    {goals.length === 0 ? <div className="empty-state"><span><GoalIcon size={20} /></span><strong>Give your savings a name</strong><p>Set a target and watch each contribution move you closer.</p><button className="text-button" onClick={onAdd}>Create a goal <Plus size={15} /></button></div> : <GoalsList goals={goals} onContribute={onContribute} compact />}
  </section>
}

function GoalsList({ goals, onContribute, compact = false }: { goals: (Goal & { monthContribution: number })[]; onContribute: (goalId: string) => void; compact?: boolean }) {
  if (goals.length === 0) return <div className="empty-state"><span><GoalIcon size={20} /></span><strong>No goals yet</strong><p>Create a target to start tracking your progress.</p></div>
  return <div className={`goals-list ${compact ? 'compact' : ''}`}>{goals.map((goal) => {
    const progress = goal.target > 0 ? Math.min(goal.saved / goal.target * 100, 100) : 0
    return <article className="goal-row" key={goal.id}>
      <div className="goal-heading"><span className="goal-marker"><Sparkles size={16} /></span><div className="goal-name"><strong>{goal.name}</strong><span>{goal.includeInSavings ? 'Counts in savings bucket' : 'Tracked separately'}</span></div><div className="goal-totals"><strong>{formatCurrency(goal.saved)}</strong><span>of {formatCurrency(goal.target)}</span></div></div>
      <div className="goal-progress"><div className="goal-progress-track" role="progressbar" aria-label={`${goal.name} progress`} aria-valuenow={Math.round(progress)} aria-valuemin={0} aria-valuemax={100}><span style={{ width: `${progress}%` }} /></div><span>{Math.round(progress)}%</span></div>
      {!compact && <div className="goal-foot"><span>{goal.monthContribution ? `${formatCurrency(goal.monthContribution)} added this month` : 'No contributions this month'}</span><button className="text-button" onClick={() => onContribute(goal.id)}><Plus size={15} /> Add money</button></div>}
      {compact && <div className="goal-foot"><span>{goal.monthContribution ? `${formatCurrency(goal.monthContribution)} this month` : 'No monthly contribution yet'}</span><button className="icon-button add-contribution" aria-label={`Add money to ${goal.name}`} onClick={() => onContribute(goal.id)}><Plus size={16} /></button></div>}
    </article>
  })}</div>
}

function FormField({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return <label className="form-field"><span className="field-heading"><strong>{label}</strong>{hint && <small>{hint}</small>}</span>{children}</label>
}

function dialogTitle(dialog: Exclude<Dialog, null>, editingExpense: Expense | null, editingSubscription: Subscription | null) {
  if (dialog === 'income') return 'Add bank income'
  if (dialog === 'expense') return editingExpense ? 'Edit expense' : 'Log an expense'
  if (dialog === 'subscription') return editingSubscription ? 'Edit subscription' : 'Add a subscription'
  if (dialog === 'goal') return 'Set a savings goal'
  if (dialog === 'contribution') return 'Add to your goal'
  return 'Adjust your percentages'
}

function cloudErrorMessage(error: unknown) {
  const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : ''
  if (code.includes('permission-denied')) return 'Firebase denied access. Check that the user-scoped Firestore rules are deployed.'
  if (code.includes('unavailable') || code.includes('network')) return 'Could not reach Firebase. Check your internet connection; changes may not have synced.'
  return 'Could not sync your budget. Check your Firebase project setup and try again.'
}

export default App