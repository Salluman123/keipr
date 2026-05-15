export const CURRENCIES = [
  { code: 'USD', symbol: '$',    label: 'USD — US Dollar',          rate: 1     },
  { code: 'GBP', symbol: '£',    label: 'GBP — British Pound',      rate: 0.79  },
  { code: 'EUR', symbol: '€',    label: 'EUR — Euro',               rate: 0.92  },
  { code: 'AED', symbol: 'د.إ',  label: 'AED — UAE Dirham',         rate: 3.67  },
  { code: 'INR', symbol: '₹',    label: 'INR — Indian Rupee',       rate: 83.5  },
  { code: 'CAD', symbol: 'CA$',  label: 'CAD — Canadian Dollar',    rate: 1.36  },
  { code: 'AUD', symbol: 'A$',   label: 'AUD — Australian Dollar',  rate: 1.52  },
  { code: 'JPY', symbol: '¥',    label: 'JPY — Japanese Yen',       rate: 149   },
] as const

export type CurrencyCode = typeof CURRENCIES[number]['code']

export function getCurrencySymbol(code: string): string {
  return CURRENCIES.find(c => c.code === code)?.symbol ?? '$'
}

export function getCurrencyRate(code: string): number {
  return CURRENCIES.find(c => c.code === code)?.rate ?? 1
}
