import { create } from 'zustand'
import * as SecureStore from 'expo-secure-store'
import { supabase } from '../lib/supabase'
import { getCurrencyRate, toDisplayAmount } from '../lib/currency'
import { removeReceipt } from '../lib/receiptStorage'
import type { Expense, TransactionType } from '../types'
import type { AnyCategoryId } from '../constants/categories'

const CURRENCY_KEY = 'keipr_currency'

type NewExpense = {
  user_id: string
  vendor: string
  amount: number
  currency: string
  date: string
  category: AnyCategoryId
  type?: TransactionType
  notes?: string
  receipt_image_url?: string
}

interface FetchParams { userId: string; month: number; year: number }

interface ExpenseStore {
  expenses: Expense[]
  loading: boolean
  fetchError: boolean
  selectedMonth: number
  selectedYear: number
  totalIncome: number
  totalExpenses: number
  monthChangePercent: number | null
  lastFetchParams: FetchParams | null
  currency: string
  currencyRate: number
  fetchExpenses: (userId: string, month: number, year: number) => Promise<void>
  addExpense: (expense: NewExpense) => Promise<void>
  deleteExpense: (id: string) => Promise<void>
  setSelectedPeriod: (month: number, year: number) => void
  setCurrency: (code: string) => void
}

const computeStats = (expenses: Expense[]) => ({
  // Normalise to USD (rate 1) so HomeScreen can multiply by any display-currency rate
  totalIncome: expenses
    .filter(e => e.type === 'income')
    .reduce((sum, e) => sum + toDisplayAmount(e.amount, e.currency || 'USD', 1), 0),
  totalExpenses: expenses
    .filter(e => e.type === 'expense')
    .reduce((sum, e) => sum + toDisplayAmount(e.amount, e.currency || 'USD', 1), 0),
})

const dateRange = (month: number, year: number) => {
  const mm = String(month + 1).padStart(2, '0')
  const lastDay = new Date(year, month + 1, 0).getDate()
  return {
    start: `${year}-${mm}-01`,
    end: `${year}-${mm}-${String(lastDay).padStart(2, '0')}`,
  }
}

const now = new Date()

// Guards against out-of-order resolution when multiple fetchExpenses calls are
// in flight at once (e.g. ExpensesScreen's focus-triggered fetch racing the
// 300ms delayed refetch after addExpense/deleteExpense). Only the result of
// the most recently *issued* call is allowed to update state, regardless of
// which call resolves first.
let fetchRequestId = 0

export const useExpenseStore = create<ExpenseStore>((set, get) => {
  SecureStore.getItemAsync(CURRENCY_KEY)
    .then(v => { if (v) set({ currency: v, currencyRate: getCurrencyRate(v) }) })
    .catch(() => {})

  return {
  expenses: [],
  loading: false,
  fetchError: false,
  selectedMonth: now.getMonth(),
  selectedYear: now.getFullYear(),
  totalIncome: 0,
  totalExpenses: 0,
  monthChangePercent: null,
  lastFetchParams: null,
  currency: 'USD',
  currencyRate: 1,

  setSelectedPeriod: (month, year) => set({ selectedMonth: month, selectedYear: year }),

  setCurrency: (code) => {
    set({ currency: code, currencyRate: getCurrencyRate(code) })
    SecureStore.setItemAsync(CURRENCY_KEY, code).catch(() => {})
  },

  fetchExpenses: async (userId, month, year) => {
    const requestId = ++fetchRequestId
    set({ loading: true, fetchError: false, lastFetchParams: { userId, month, year } })
    try {
      const { start, end } = dateRange(month, year)

      const { data, error } = await supabase
        .from('expenses')
        .select('*')
        .eq('user_id', userId)
        .gte('date', start)
        .lte('date', end)
        .order('date', { ascending: false })

      if (error) throw error
      const expenses = (data ?? []) as Expense[]

      const prevMonth = month === 0 ? 11 : month - 1
      const prevYear = month === 0 ? year - 1 : year
      const prev = dateRange(prevMonth, prevYear)

      const { data: prevData } = await supabase
        .from('expenses')
        .select('amount,currency')
        .eq('user_id', userId)
        .eq('type', 'expense')
        .gte('date', prev.start)
        .lte('date', prev.end)

      const prevTotal = (prevData ?? [])
        .reduce(
          (sum: number, e: { amount: number | null; currency: string | null }) =>
            sum + toDisplayAmount(e.amount ?? 0, e.currency || 'USD', 1),
          0,
        )

      const currTotal = computeStats(expenses).totalExpenses
      const monthChangePercent =
        prevTotal > 0 ? ((currTotal - prevTotal) / prevTotal) * 100 : null

      // A newer fetchExpenses call has been issued since this one started —
      // discard this result so a slower, stale request can't clobber fresher
      // data that already landed.
      if (requestId !== fetchRequestId) return
      set({ expenses, ...computeStats(expenses), monthChangePercent, loading: false, fetchError: false })
    } catch {
      if (requestId !== fetchRequestId) return
      // Keep whatever is already on screen, but flag the failure so screens can
      // show "couldn't load" instead of a false "no expenses yet" empty state.
      set({ loading: false, fetchError: true })
    }
  },

  addExpense: async (expense) => {
    const { data, error } = await supabase
      .from('expenses')
      .insert({ ...expense, type: expense.type ?? 'expense' })
      .select()
      .single()
    if (error) {
      if (error.message.includes('FREE_EXPENSE_LIMIT_REACHED')) {
        throw new Error('You have reached the monthly free expense limit.')
      }
      throw error
    }

    setTimeout(() => {
      const { lastFetchParams, selectedMonth, selectedYear } = get()
      const params = lastFetchParams ?? {
        userId: expense.user_id,
        month: selectedMonth,
        year: selectedYear,
      }
      get().fetchExpenses(params.userId, params.month, params.year)
    }, 300)
  },

  deleteExpense: async (id) => {
    const receiptValue = get().expenses.find(expense => expense.id === id)?.receipt_image_url
    const { error } = await supabase.from('expenses').delete().eq('id', id)
    if (error) throw error
    let cleanupFailed = false
    try {
      await removeReceipt(receiptValue)
    } catch {
      cleanupFailed = true
    }
    setTimeout(() => {
      const { lastFetchParams } = get()
      if (lastFetchParams) {
        get().fetchExpenses(lastFetchParams.userId, lastFetchParams.month, lastFetchParams.year)
      }
    }, 300)
    if (cleanupFailed) {
      throw new Error('Expense deleted, but its receipt could not be removed.')
    }
  },
  }
})
