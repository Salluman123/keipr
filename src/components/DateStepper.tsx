import React from 'react'
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native'
import { Colors } from '../constants/colors'
import { getTodayMidnight } from '../lib/date'

interface Props {
  value: Date
  onChange: (d: Date) => void
}

export default function DateStepper({ value, onChange }: Props) {
  const today = getTodayMidnight()
  const isToday = value.getTime() === today.getTime()

  const shift = (n: number) => {
    const d = new Date(value); d.setDate(d.getDate() + n)
    if (d > today) return
    onChange(d)
  }

  const label = value.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })

  return (
    <View style={ds.row}>
      <TouchableOpacity onPress={() => shift(-1)} style={ds.arrow}>
        <Text style={ds.arrowText}>‹</Text>
      </TouchableOpacity>
      <Text style={ds.value}>{label}</Text>
      <TouchableOpacity onPress={() => shift(1)} style={[ds.arrow, isToday && ds.arrowDisabled]} disabled={isToday}>
        <Text style={[ds.arrowText, isToday && { color: Colors.border }]}>›</Text>
      </TouchableOpacity>
    </View>
  )
}

const ds = StyleSheet.create({
  row: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: Colors.inputBg, borderRadius: 12,
    borderWidth: 1, borderColor: Colors.border,
    paddingHorizontal: 6, paddingVertical: 4,
  },
  arrow: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  arrowDisabled: { opacity: 0.3 },
  arrowText: { fontSize: 24, color: Colors.purpleLight, lineHeight: 28 },
  value: { fontSize: 15, color: Colors.offWhite, fontWeight: '500' },
})
