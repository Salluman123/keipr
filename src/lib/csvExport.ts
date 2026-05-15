import * as FileSystem from 'expo-file-system/legacy'
import * as Sharing from 'expo-sharing'
import type { Expense } from '../types'

export async function exportExpensesAsCSV(expenses: Expense[]): Promise<void> {
  const header = 'Date,Vendor,Category,Amount,Notes'
  const rows = expenses.map(e =>
    [e.date, e.vendor, e.category, e.amount.toFixed(2), e.notes ?? '']
      .map(v => `"${String(v).replace(/"/g, '""')}"`)
      .join(',')
  )
  const csv = [header, ...rows].join('\n')

  const path = `${FileSystem.cacheDirectory}keipr_expenses_${Date.now()}.csv`
  await FileSystem.writeAsStringAsync(path, csv, {
    encoding: FileSystem.EncodingType.UTF8,
  })

  const canShare = await Sharing.isAvailableAsync()
  if (!canShare) throw new Error('Sharing is not available on this device')

  await Sharing.shareAsync(path, {
    mimeType: 'text/csv',
    dialogTitle: 'Export Keipr Expenses',
    UTI: 'public.comma-separated-values-text',
  })
}
