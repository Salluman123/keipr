import { create } from 'zustand'
import * as SecureStore from 'expo-secure-store'
import { supabase } from '../lib/supabase'
import { getCurrencyRate } from '../lib/currency'
import type { Expense } from '../types'
import type { CategoryId } from '../constants/categories'

const CURRENCY_KEY = 'keipr_currency'

type NewExpense = {
  user_id: string
  vendor: string
  amount: number
  date: string
  category: CategoryId
  notes?: string
  receipt_image_url?: string
}

interface FetchParams { userId: string; month: number; year: number }

interface ExpenseStore {
  expenses: Expense[]
  loading: boolean
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
  totalIncome: 0,
  totalExpenses: expenses.reduce((sum, e) => sum + e.amount, 0),
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

export const useExpenseStore = create<ExpenseStore>((set, get) => {
  SecureStore.getItemAsync(CURRENCY_KEY)
    .then(v => { if (v) set({ currency: v, currencyRate: getCurrencyRate(v) }) })
    .catch(() => {})

  return {
  expenses: [],
  loading: false,
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
    set({ loading: true, lastFetchParams: { userId, month, year } })
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
        .select('amount')
        .eq('user_id', userId)
        .gte('date', prev.start)
        .lte('date', prev.end)

      const prevTotal = (prevData ?? [])
        .reduce((sum: number, e: any) => sum + (e.amount ?? 0), 0)

      const currTotal = computeStats(expenses).totalExpenses
      const monthChangePercent =
        prevTotal > 0 ? ((currTotal - prevTotal) / prevTotal) * 100 : null

      set({ expenses, ...computeStats(expenses), monthChangePercent, loading: false })
    } catch {
      set({ loading: false })
    }
  },

  addExpense: async (expense) => {
    const { data, error } = await supabase
      .from('expenses')
      .insert(expense)
      .select()
      .single()
    if (error) throw error

    setTimeout(() => {
      const { lastFetchParams } = get()
      if (lastFetchParams) {
        get().fetchExpenses(lastFetchParams.userId, lastFetchParams.month, lastFetchParams.year)
      }
    }, 300)
  },

  deleteExpense: async (id) => {
    const { error } = await supabase.from('expenses').delete().eq('id', id)
    if (error) throw error
    setTimeout(() => {
      const { lastFetchParams } = get()
      if (lastFetchParams) {
        get().fetchExpenses(lastFetchParams.userId, lastFetchParams.month, lastFetchParams.year)
      }
    }, 300)
  },
  }
})
