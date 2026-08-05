import React, { useState, useRef, useCallback, useMemo, useEffect } from 'react'
import {
  View, Text, ScrollView, TouchableOpacity, TextInput,
  StyleSheet, Alert, Animated, PanResponder, RefreshControl, Platform,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useFocusEffect } from '@react-navigation/native'
import { Colors } from '../../constants/colors'
import { EXPENSE_CATEGORIES, INCOME_CATEGORIES } from '../../constants/categories'
import { useExpenseStore } from '../../store/expenseStore'
import { getCurrencySymbol, toDisplayAmount } from '../../lib/currency'
import { useAuthStore } from '../../store/authStore'
import type { Expense } from '../../types'
import type { CategoryId } from '../../constants/categories'
import { getTodayMidnight, parseLocalDate } from '../../lib/date'

type FilterId = 'all' | 'income' | CategoryId

const FILTERS: Array<{ id: FilterId; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'income', label: 'Income' },
  ...EXPENSE_CATEGORIES.map(c => ({
    id: c.id as FilterId,
    label: c.label.split('&')[0].trim().split(' ').slice(0, 2).join(' '),
  })),
]

function groupLabel(dateStr: string): string {
  const today = getTodayMidnight()
  const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1)
  const d = parseLocalDate(dateStr); d.setHours(0, 0, 0, 0)
  if (d.getTime() === today.getTime()) return 'Today'
  if (d.getTime() === yesterday.getTime()) return 'Yesterday'
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'long', day: 'numeric' })
}

// ─── Swipeable delete row ─────────────────────────────────────────────────────

function SwipeableRow({ onDelete, children }: { onDelete: () => void; children: React.ReactNode }) {
  const DELETE_W = 76
  const translateX = useRef(new Animated.Value(0)).current

  const pan = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => false,
    onMoveShouldSetPanResponder: (_, { dx, dy }) =>
      Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy) * 2,
    onPanResponderMove: (_, { dx }) => {
      translateX.setValue(Math.max(-DELETE_W, Math.min(0, dx)))
    },
    onPanResponderRelease: (_, { dx }) => {
      Animated.spring(translateX, {
        toValue: dx < -(DELETE_W / 2) ? -DELETE_W : 0,
        useNativeDriver: true,
        friction: 8,
        tension: 40,
      }).start()
    },
  })).current

  const close = () =>
    Animated.spring(translateX, { toValue: 0, useNativeDriver: true, friction: 8 }).start()

  return (
    <View style={s.swipeWrap}>
      <View style={[s.deleteBack, { width: DELETE_W }]}>
        <TouchableOpacity style={s.deleteBtn} onPress={() => { close(); onDelete() }}>
          <Ionicons name="trash-outline" size={18} color="#fff" />
          <Text style={s.deleteTxt}>Delete</Text>
        </TouchableOpacity>
      </View>
      <Animated.View {...pan.panHandlers} style={[s.rowFg, { transform: [{ translateX }] }]}>
        {children}
      </Animated.View>
    </View>
  )
}

// ─── Skeleton row ─────────────────────────────────────────────────────────────

function SkeletonRow() {
  const opacity = useRef(new Animated.Value(0.4)).current
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.9, duration: 700, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.4, duration: 700, useNativeDriver: true }),
      ])
    ).start()
    return () => opacity.stopAnimation()
  }, [])
  return (
    <Animated.View style={[sk.row, { opacity }]}>
      <View style={sk.icon} />
      <View style={sk.lines}>
        <View style={sk.lineA} />
        <View style={sk.lineB} />
      </View>
      <View style={sk.amt} />
    </Animated.View>
  )
}

const sk = StyleSheet.create({
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 14, paddingVertical: 13,
    backgroundColor: Colors.card, borderRadius: 14, marginBottom: 2,
  },
  icon: { width: 42, height: 42, borderRadius: 12, backgroundColor: Colors.border },
  lines: { flex: 1, gap: 6 },
  lineA: { height: 12, borderRadius: 6, backgroundColor: Colors.border, width: '60%' },
  lineB: { height: 10, borderRadius: 5, backgroundColor: Colors.border, width: '40%' },
  amt: { width: 52, height: 14, borderRadius: 6, backgroundColor: Colors.border },
})

// ─── ExpensesScreen ───────────────────────────────────────────────────────────

export default function ExpensesScreen() {
  const insets = useSafeAreaInsets()
  const { user } = useAuthStore()
  const { expenses, loading, fetchError, fetchExpenses, deleteExpense, selectedMonth, selectedYear, currency, currencyRate } = useExpenseStore()
  const sym = getCurrencySymbol(currency)
  const userId = user?.id ?? ''

  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<FilterId>('all')
  const [refreshing, setRefreshing] = useState(false)

  const filtered = useMemo(() => expenses.filter(e => {
    const matchType =
      filter === 'all' ? true
      : filter === 'income' ? e.type === 'income'
      : e.type === 'expense' && e.category === filter
    const matchSearch = !search || e.vendor.toLowerCase().includes(search.toLowerCase())
    return matchType && matchSearch
  }), [expenses, filter, search])

  // Total In / Out always reflect the full month (narrowed only by search),
  // independent of which list filter chip is active.
  const totalOut = useMemo(
    () => expenses
      .filter(e => e.type === 'expense' && (!search || e.vendor.toLowerCase().includes(search.toLowerCase())))
      .reduce((sum, e) => sum + toDisplayAmount(e.amount, e.currency || 'USD', currencyRate), 0),
    [expenses, search, currencyRate]
  )

  const totalIn = useMemo(
    () => expenses
      .filter(e => e.type === 'income' && (!search || e.vendor.toLowerCase().includes(search.toLowerCase())))
      .reduce((sum, e) => sum + toDisplayAmount(e.amount, e.currency || 'USD', currencyRate), 0),
    [expenses, search, currencyRate]
  )

  const { groupOrder, groupMap } = useMemo(() => {
    const order: string[] = []
    const map: Record<string, Expense[]> = {}
    filtered.forEach(e => {
      const key = groupLabel(e.date)
      if (!map[key]) { map[key] = []; order.push(key) }
      map[key].push(e)
    })
    return { groupOrder: order, groupMap: map }
  }, [filtered])

  useFocusEffect(
    useCallback(() => {
      if (userId) fetchExpenses(userId, selectedMonth, selectedYear)
    }, [userId, selectedMonth, selectedYear])
  )

  const onRefresh = useCallback(async () => {
    setRefreshing(true)
    await fetchExpenses(userId, selectedMonth, selectedYear)
    setRefreshing(false)
  }, [userId, selectedMonth, selectedYear])

  const confirmDelete = (expense: Expense) => {
    Alert.alert(
      expense.type === 'income' ? 'Delete Income' : 'Delete Expense',
      `Delete "${expense.vendor}" for ${sym}${toDisplayAmount(expense.amount, expense.currency || 'USD', currencyRate).toFixed(2)}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete', style: 'destructive',
          onPress: async () => {
            try { await deleteExpense(expense.id) }
            catch { Alert.alert('Error', 'Could not delete this entry.') }
          },
        },
      ]
    )
  }

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      <View style={s.screenHeader}>
        <Text style={s.screenTitle}>Transactions</Text>
        <Text style={s.screenCount}>
          {filtered.length} {filtered.length === 1 ? 'entry' : 'entries'}
        </Text>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[s.scroll, { paddingBottom: insets.bottom + 24 }]}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={Colors.purpleLight}
            colors={[Colors.purpleLight]}
          />
        }
      >
        {/* Search */}
        <View style={s.searchBar}>
          <Ionicons name="search-outline" size={16} color={Colors.gray} style={{ marginRight: 8 }} />
          <TextInput
            style={s.searchInput}
            value={search}
            onChangeText={setSearch}
            placeholder="Search transactions..."
            placeholderTextColor={Colors.gray}
            returnKeyType="search"
          />
          {!!search && (
            <TouchableOpacity onPress={() => setSearch('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="close-circle" size={16} color={Colors.gray} />
            </TouchableOpacity>
          )}
        </View>

        {/* Filter chips */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chipsRow}>
          {FILTERS.map(f => (
            <TouchableOpacity
              key={f.id}
              onPress={() => setFilter(f.id)}
              style={[s.chip, filter === f.id && s.chipActive]}
              activeOpacity={0.75}
            >
              <Text style={[s.chipText, filter === f.id && s.chipTextActive]}>{f.label}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Summary pills */}
        <View style={s.pillsRow}>
          <View style={[s.pill, { borderColor: Colors.success + '55' }]}>
            <Ionicons name="arrow-down-outline" size={13} color={Colors.success} />
            <Text style={[s.pillLabel, { color: Colors.success }]}>Total In</Text>
            <Text style={[s.pillAmt, { color: Colors.success }]}>{sym}{totalIn.toFixed(2)}</Text>
          </View>
          <View style={[s.pill, { borderColor: Colors.error + '55' }]}>
            <Ionicons name="arrow-up-outline" size={13} color={Colors.error} />
            <Text style={[s.pillLabel, { color: Colors.error }]}>Total Out</Text>
            <Text style={[s.pillAmt, { color: Colors.error }]}>{sym}{totalOut.toFixed(2)}</Text>
          </View>
        </View>

        {/* Grouped expense list */}
        {loading && expenses.length === 0 ? (
          <View>
            {[...Array(5)].map((_, i) => <SkeletonRow key={i} />)}
          </View>
        ) : fetchError && expenses.length === 0 ? (
          <View style={s.empty}>
            <Text style={s.emptyIcon}>📡</Text>
            <Text style={s.emptyTitle}>Couldn't load transactions</Text>
            <Text style={s.emptySubtext}>Check your connection, then pull down to try again</Text>
          </View>
        ) : groupOrder.length === 0 ? (
          <View style={s.empty}>
            <Text style={s.emptyIcon}>📭</Text>
            <Text style={s.emptyTitle}>
              {search || filter !== 'all' ? 'No matching transactions' : 'No transactions this month'}
            </Text>
            <Text style={s.emptySubtext}>
              {!search && filter === 'all'
                ? 'Scan a receipt or add one manually'
                : 'Try a different search or filter'}
            </Text>
          </View>
        ) : (
          groupOrder.map(title => (
            <View key={title}>
              <Text style={s.sectionHeader}>{title}</Text>
              {groupMap[title].map(expense => {
                const isIncome = expense.type === 'income'
                const cat = (isIncome ? INCOME_CATEGORIES : EXPENSE_CATEGORIES).find(c => c.id === expense.category)
                const dateStr = parseLocalDate(expense.date)
                  .toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                return (
                  <SwipeableRow key={expense.id} onDelete={() => confirmDelete(expense)}>
                    <TouchableOpacity
                      style={s.row}
                      onLongPress={() => confirmDelete(expense)}
                      activeOpacity={0.75}
                    >
                      <View style={[s.iconPill, { backgroundColor: (cat?.color ?? '#6B7280') + '22' }]}>
                        <Text style={s.emoji}>{cat?.icon ?? '📋'}</Text>
                      </View>
                      <View style={s.rowInfo}>
                        <Text style={s.vendor} numberOfLines={1}>{expense.vendor}</Text>
                        <Text style={s.rowMeta}>{cat?.label ?? 'Other'} · {dateStr}</Text>
                      </View>
                      <Text style={[s.amount, isIncome && { color: Colors.success }]}>
                        {isIncome ? '+' : '-'}{sym}{toDisplayAmount(expense.amount, expense.currency || 'USD', currencyRate).toFixed(2)}
                      </Text>
                    </TouchableOpacity>
                  </SwipeableRow>
                )
              })}
            </View>
          ))
        )}
      </ScrollView>
    </View>
  )
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },

  screenHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingTop: 8, paddingBottom: 12,
  },
  screenTitle: { fontSize: 24, fontFamily: 'Georgia', color: Colors.offWhite },
  screenCount: { fontSize: 13, color: Colors.gray },

  scroll: { paddingHorizontal: 20, paddingTop: 4 },

  searchBar: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: Colors.card, borderRadius: 14,
    borderWidth: 1, borderColor: Colors.border,
    paddingHorizontal: 14,
    paddingVertical: Platform.OS === 'ios' ? 13 : 9,
    marginBottom: 12,
  },
  searchInput: { flex: 1, fontSize: 15, color: Colors.offWhite },

  chipsRow: { flexDirection: 'row', gap: 8, paddingBottom: 14 },
  chip: {
    paddingHorizontal: 14, paddingVertical: 7,
    borderRadius: 20, borderWidth: 1, borderColor: Colors.border,
    backgroundColor: Colors.card,
  },
  chipActive: { borderColor: Colors.purpleLight, backgroundColor: Colors.purpleDark + '44' },
  chipText: { fontSize: 13, color: Colors.gray },
  chipTextActive: { color: Colors.purpleLight, fontWeight: '600' },

  pillsRow: { flexDirection: 'row', gap: 12, marginBottom: 20 },
  pill: {
    flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: Colors.card, borderRadius: 14, borderWidth: 1,
    paddingHorizontal: 14, paddingVertical: 12,
  },
  pillLabel: { flex: 1, fontSize: 12, fontWeight: '600' },
  pillAmt: { fontSize: 14, fontWeight: '700' },

  sectionHeader: {
    fontSize: 11, fontWeight: '700', color: Colors.gray,
    letterSpacing: 0.7, paddingTop: 8, paddingBottom: 6, paddingHorizontal: 2,
  },

  swipeWrap: { marginBottom: 2, borderRadius: 14, overflow: 'hidden' },
  deleteBack: {
    position: 'absolute', right: 0, top: 0, bottom: 0,
    backgroundColor: Colors.error,
    alignItems: 'center', justifyContent: 'center',
  },
  deleteBtn: { alignItems: 'center', gap: 3 },
  deleteTxt: { color: '#fff', fontSize: 10, fontWeight: '700' },
  rowFg: { backgroundColor: Colors.card },

  row: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 14, paddingVertical: 13, gap: 12,
  },
  iconPill: {
    width: 42, height: 42, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
  },
  emoji: { fontSize: 18 },
  rowInfo: { flex: 1, gap: 3 },
  vendor: { fontSize: 14, color: Colors.offWhite, fontWeight: '500' },
  rowMeta: { fontSize: 12, color: Colors.gray },
  amount: { fontSize: 14, fontWeight: '700', color: Colors.offWhite },

  empty: { alignItems: 'center', paddingTop: 64, gap: 10 },
  emptyIcon: { fontSize: 44 },
  emptyTitle: { fontSize: 17, color: Colors.offWhite, fontWeight: '600' },
  emptySubtext: { fontSize: 14, color: Colors.gray, textAlign: 'center' },
})
