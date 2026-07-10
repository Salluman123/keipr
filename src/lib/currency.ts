export const CURRENCIES = [
  { code: 'USD', symbol: '$',    label: 'USD — US Dollar'         },
  { code: 'GBP', symbol: '£',    label: 'GBP — British Pound'     },
  { code: 'EUR', symbol: '€',    label: 'EUR — Euro'              },
  { code: 'AED', symbol: 'د.إ',  label: 'AED — UAE Dirham'        },
  { code: 'INR', symbol: '₹',    label: 'INR — Indian Rupee'      },
  { code: 'CAD', symbol: 'CA$',  label: 'CAD — Canadian Dollar'   },
  { code: 'AUD', symbol: 'A$',   label: 'AUD — Australian Dollar' },
  { code: 'JPY', symbol: '¥',    label: 'JPY — Japanese Yen'      },
] as const

export type CurrencyCode = typeof CURRENCIES[number]['code']

// Fallback rates: 1 USD = X units of that currency.
// These are used if the live fetch fails or hasn't completed yet.
let liveRates: Record<string, number> = {
  USD: 1,
  GBP: 0.79,
  EUR: 0.92,
  AED: 3.67,
  INR: 83.5,
  CAD: 1.36,
  AUD: 1.52,
  JPY: 149,
}

/**
 * Fetches live exchange rates from a free public API (no key required).
 * Falls back silently to the hardcoded rates above if the network call fails.
 * Call this once on app startup.
 */
export async function refreshExchangeRates(): Promise<void> {
  try {
    const res = await fetch('https://open.er-api.com/v6/latest/USD')
    if (!res.ok) return
    const data = await res.json()
    if (data?.result === 'success' && data.rates) {
      const { rates } = data
      liveRates = {
        USD: 1,
        GBP: rates.GBP ?? liveRates.GBP,
        EUR: rates.EUR ?? liveRates.EUR,
        AED: rates.AED ?? liveRates.AED,
        INR: rates.INR ?? liveRates.INR,
        CAD: rates.CAD ?? liveRates.CAD,
        AUD: rates.AUD ?? liveRates.AUD,
        JPY: rates.JPY ?? liveRates.JPY,
      }
    }
  } catch {
    // Network unavailable — hardcoded fallback rates remain active
  }
}

export function getCurrencySymbol(code: string): string {
  return CURRENCIES.find(c => c.code === code)?.symbol ?? '$'
}

export function getCurrencyRate(code: string): number {
  return liveRates[code] ?? 1
}

/**
 * Converts an amount from its original currency to the user's display currency.
 *
 * How it works:
 *   1. amount / getCurrencyRate(fromCurrency)  →  converts original → USD
 *   2. × displayRate                           →  converts USD → display currency
 *
 * Use this everywhere instead of writing the formula inline.
 */
export function toDisplayAmount(
  amount: number,
  fromCurrency: string,
  displayRate: number,
): number {
  return (amount / getCurrencyRate(fromCurrency)) * displayRate
}
