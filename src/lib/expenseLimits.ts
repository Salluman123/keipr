import { supabase } from './supabase'

export const FREE_EXPENSE_LIMIT = 10

export async function hasReachedExpenseLimit(userId: string, isPro: boolean): Promise<boolean> {
  if (isPro) return false

  const now = new Date()
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
  const nextMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1))

  const { count, error } = await supabase
    .from('expenses')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .gte('created_at', monthStart.toISOString())
    .lt('created_at', nextMonth.toISOString())

  if (error) throw error
  return (count ?? 0) >= FREE_EXPENSE_LIMIT
}
