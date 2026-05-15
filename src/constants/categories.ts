export const EXPENSE_CATEGORIES = [
  { id: 'food_dining',    label: 'Food & Dining',    icon: '🍽️', color: '#F59E0B' },
  { id: 'transport',      label: 'Transport',         icon: '🚗', color: '#3B82F6' },
  { id: 'accommodation',  label: 'Accommodation',     icon: '🏨', color: '#8B5CF6' },
  { id: 'equipment',      label: 'Equipment',         icon: '💻', color: '#10B981' },
  { id: 'software',       label: 'Software & SaaS',   icon: '📱', color: '#6366F1' },
  { id: 'marketing',      label: 'Marketing',         icon: '📢', color: '#EC4899' },
  { id: 'utilities',      label: 'Utilities',         icon: '⚡', color: '#F97316' },
  { id: 'healthcare',     label: 'Healthcare',        icon: '🏥', color: '#14B8A6' },
  { id: 'entertainment',  label: 'Entertainment',     icon: '🎬', color: '#A855F7' },
  { id: 'office',         label: 'Office Supplies',   icon: '📎', color: '#F43F5E' },
  { id: 'travel',         label: 'Travel',            icon: '✈️', color: '#0EA5E9' },
  { id: 'other',          label: 'Other',             icon: '📋', color: '#6B7280' },
] as const

export type CategoryId = typeof EXPENSE_CATEGORIES[number]['id']
