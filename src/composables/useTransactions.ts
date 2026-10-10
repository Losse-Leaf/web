import { ref } from 'vue'
import type { Transaction, LifeEntry } from '../types'
import { fetchTransactions } from '../utils/api'

const TX_CACHE_KEY = 'looseleaf_cached_transactions'

// 真实记账数据统一管理 (真实空态，遵循单一事实来源 RC-38)
export const DEFAULT_TRANSACTIONS: Transaction[] = []

function getInitialTransactions(): Transaction[] {
  try {
    const raw = localStorage.getItem(TX_CACHE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      const list = Array.isArray(parsed) ? parsed : parsed?.data
      if (Array.isArray(list)) {
        return list
      }
    }
  } catch {}
  return []
}

const transactions = ref<Transaction[]>(getInitialTransactions())

// 节流写入本地存储并附带时间戳 (FE-06)
let saveTxTimer: number | null = null
function throttledSaveTransactions(list: Transaction[]) {
  if (saveTxTimer) clearTimeout(saveTxTimer)
  saveTxTimer = window.setTimeout(() => {
    try {
      localStorage.setItem(TX_CACHE_KEY, JSON.stringify({ cached_at: Date.now(), data: list }))
    } catch {}
  }, 400)
}

export const txToEntry = (tx: Transaction): LifeEntry => {
  const d = new Date(tx.occurred_at)
  const pad = (n: number) => String(n).padStart(2, '0')
  const year = !isNaN(d.getTime()) ? String(d.getFullYear()) : '2026'
  const month = !isNaN(d.getTime()) ? pad(d.getMonth() + 1) : '10'
  const day = !isNaN(d.getTime()) ? pad(d.getDate()) : '09'
  const time = !isNaN(d.getTime()) ? `${pad(d.getHours())}:${pad(d.getMinutes())}` : ''

  return {
    id: 100000 + tx.id,
    type: 'transaction',
    title: tx.title || tx.category || '记账',
    content: tx.note || '',
    occurred_at: tx.occurred_at,
    date: `${year}.${month}.${day}`,
    year,
    month,
    day,
    time,
    amount: tx.amount,
    tx_type: tx.type,
    category: tx.category,
    payment_method: tx.payment_method,
    is_transaction: true,
  }
}

export function useTransactions() {
  const loadRemoteTransactions = async (params?: { year?: number; month?: number }) => {
    try {
      const data = await fetchTransactions(params)
      if (Array.isArray(data)) {
        transactions.value = data
        throttledSaveTransactions(data)
      }
    } catch (err) {
      console.warn('Backend transactions unreachable, serving local cache:', err)
    }
  }

  const addTransaction = (tx: Transaction) => {
    transactions.value = [tx, ...transactions.value.filter((t) => t.id !== tx.id)]
    throttledSaveTransactions(transactions.value)
  }

  const updateTransactionItem = (tx: Transaction) => {
    const idx = transactions.value.findIndex((t) => t.id === tx.id)
    if (idx !== -1) {
      transactions.value[idx] = tx
    }
    throttledSaveTransactions(transactions.value)
  }

  const removeTransaction = (id: number) => {
    transactions.value = transactions.value.filter((t) => t.id !== id)
    throttledSaveTransactions(transactions.value)
  }

  return {
    transactions,
    loadRemoteTransactions,
    addTransaction,
    updateTransactionItem,
    removeTransaction,
    txToEntry,
  }
}
