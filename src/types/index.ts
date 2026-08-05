import type { Session, User } from '@supabase/supabase-js'
import type { AnyCategoryId } from '../constants/categories'

export type AccountType = 'personal' | 'freelancer' | 'business'

export interface Profile {
  id: string
  full_name: string
  email: string
  account_type: AccountType
  avatar_url?: string
  created_at: string
  updated_at: string
}

export type TransactionType = 'expense' | 'income'

export interface Expense {
  id: string
  user_id: string
  vendor: string
  amount: number
  currency: string
  category: AnyCategoryId
  type: TransactionType
  date: string
  receipt_image_url?: string
  notes?: string
  tax_deductible: boolean
  is_recurring: boolean
  tags: string[]
  created_at: string
}

export interface AuthStore {
  user: User | null
  session: Session | null
  loading: boolean
  signIn: (email: string, password: string) => Promise<void>
  /** Resolves true when email confirmation is required before the user can sign in. */
  signUp: (email: string, password: string, fullName: string, accountType: AccountType) => Promise<boolean>
  signOut: () => Promise<void>
  resetPassword: (email: string) => Promise<void>
  initialize: () => Promise<void>
  signInWithApple: () => Promise<void>
}
