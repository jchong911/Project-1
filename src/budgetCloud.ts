import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  setDoc,
  writeBatch,
  type Unsubscribe,
} from 'firebase/firestore'
import { firestore } from './firebase'
import {
  createEmptyData,
  type BudgetData,
  type Expense,
  type Goal,
  type Paycheck,
  type Subscription,
} from './budget'

const requireFirestore = () => {
  if (!firestore) throw new Error('Firebase has not been configured.')
  return firestore
}

const userCollection = (userId: string, collectionName: string) =>
  collection(requireFirestore(), 'users', userId, collectionName)

const recordDocument = (userId: string, collectionName: string, id: string) =>
  doc(requireFirestore(), 'users', userId, collectionName, id)

const normalizePaycheck = (item: Record<string, unknown> & { id?: string }) => {
  const amount = Number(item.amount)
  if (Number.isFinite(amount) && amount > 0) return { ...item, amount } as Paycheck
  const legacyNet = Number(item.net)
  const legacyGross = Number(item.gross)
  return {
    ...item,
    amount: Number.isFinite(legacyNet) && legacyNet > 0 ? legacyNet : legacyGross,
  } as Paycheck
}

export const subscribeToBudget = (
  userId: string,
  onData: (data: BudgetData) => void,
  onError: (error: Error) => void,
): Unsubscribe => {
  let data = createEmptyData()
  const emit = () => onData(data)
  const stop = [
    onSnapshot(doc(requireFirestore(), 'users', userId, 'settings', 'budget'), (snapshot) => {
      const settings = snapshot.data()
      const percentages = settings?.percentages
      const savingsAmount = typeof settings?.savingsAmount === 'number' ? settings.savingsAmount : null
      data = {
        ...data,
        percentages: percentages && typeof percentages === 'object'
          ? { ...data.percentages, ...percentages }
          : data.percentages,
        savingsAmount,
      }
      emit()
    }, onError),
    onSnapshot(userCollection(userId, 'paychecks'), (snapshot) => {
      data = {
        ...data,
        paychecks: snapshot.docs.map((item) => normalizePaycheck({ ...item.data(), id: item.id })),
      }
      emit()
    }, onError),
    onSnapshot(userCollection(userId, 'expenses'), (snapshot) => {
      data = { ...data, expenses: snapshot.docs.map((item) => ({ ...item.data(), id: item.id }) as Expense) }
      emit()
    }, onError),
    onSnapshot(userCollection(userId, 'subscriptions'), (snapshot) => {
      data = {
        ...data,
        subscriptions: snapshot.docs.map((item) => ({ ...item.data(), id: item.id }) as Subscription),
      }
      emit()
    }, onError),
    onSnapshot(userCollection(userId, 'goals'), (snapshot) => {
      data = { ...data, goals: snapshot.docs.map((item) => ({ ...item.data(), id: item.id }) as Goal) }
      emit()
    }, onError),
  ]

  return () => stop.forEach((unsubscribe) => unsubscribe())
}

export const saveBudgetSplit = (
  userId: string,
  percentages: BudgetData['percentages'],
  savingsAmount: number | null = null,
) => setDoc(doc(requireFirestore(), 'users', userId, 'settings', 'budget'), {
  percentages,
  savingsAmount,
})

export const savePaycheck = (userId: string, paycheck: Paycheck) =>
  setDoc(recordDocument(userId, 'paychecks', paycheck.id), paycheck)

export const saveExpense = (userId: string, expense: Expense) =>
  setDoc(recordDocument(userId, 'expenses', expense.id), expense)

export const saveSubscription = (userId: string, subscription: Subscription) =>
  setDoc(recordDocument(userId, 'subscriptions', subscription.id), subscription)

export const removeExpense = (userId: string, expenseId: string) =>
  deleteDoc(recordDocument(userId, 'expenses', expenseId))

export const removeSubscription = (userId: string, subscriptionId: string) =>
  deleteDoc(recordDocument(userId, 'subscriptions', subscriptionId))

export const saveGoal = (userId: string, goal: Goal) =>
  setDoc(recordDocument(userId, 'goals', goal.id), goal)

export const deleteAllBudgetData = async (userId: string) => {
  const database = requireFirestore()
  const collections = ['paychecks', 'expenses', 'subscriptions', 'goals']
  const snapshots = await Promise.all(collections.map((name) => getDocs(userCollection(userId, name))))
  const references = snapshots.flatMap((snapshot) => snapshot.docs.map((item) => item.ref))
  references.push(doc(database, 'users', userId, 'settings', 'budget'))

  for (let index = 0; index < references.length; index += 450) {
    const batch = writeBatch(database)
    references.slice(index, index + 450).forEach((reference) => batch.delete(reference))
    await batch.commit()
  }
}