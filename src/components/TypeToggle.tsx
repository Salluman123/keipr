import React from 'react'
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native'
import { Colors } from '../constants/colors'
import type { TransactionType } from '../types'

export default function TypeToggle({
  value, onChange,
}: {
  value: TransactionType
  onChange: (type: TransactionType) => void
}) {
  return (
    <View style={styles.typeToggle}>
      <TouchableOpacity
        onPress={() => onChange('expense')}
        activeOpacity={0.75}
        style={[styles.typeBtn, value === 'expense' && styles.typeBtnActive]}
      >
        <Text style={[styles.typeBtnText, value === 'expense' && styles.typeBtnTextActive]}>Expense</Text>
      </TouchableOpacity>
      <TouchableOpacity
        onPress={() => onChange('income')}
        activeOpacity={0.75}
        style={[styles.typeBtn, value === 'income' && styles.typeBtnActiveIncome]}
      >
        <Text style={[styles.typeBtnText, value === 'income' && styles.typeBtnTextActive]}>Income</Text>
      </TouchableOpacity>
    </View>
  )
}

const styles = StyleSheet.create({
  typeToggle: {
    flexDirection: 'row',
    backgroundColor: Colors.card, borderRadius: 14,
    borderWidth: 1, borderColor: Colors.border, padding: 4, gap: 4,
  },
  typeBtn: { flex: 1, paddingVertical: 10, borderRadius: 11, alignItems: 'center' },
  typeBtnActive: { backgroundColor: Colors.purpleDark + 'AA' },
  typeBtnActiveIncome: { backgroundColor: Colors.success + '33' },
  typeBtnText: { fontSize: 14, color: Colors.gray, fontWeight: '600' },
  typeBtnTextActive: { color: Colors.offWhite },
})
