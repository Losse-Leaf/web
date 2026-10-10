import { ref } from 'vue'
import type { Transaction, LifeEntry } from '../types'
import { fetchTransactions } from '../utils/api'

const TX_CACHE_KEY = 'looseleaf_cached_transactions'

export const DEFAULT_TRANSACTIONS: Transaction[] = [
  {
    id: 1,
    amount: 12900,
    type: 'expense',
    category: '购物',
    title: 'MCHOSE A7 无线鼠标',
    note: '替换用了四年的旧鼠标',
    payment_method: '微信支付',
    occurred_at: '2026-10-09T14:20:00Z',
  },
  {
    id: 2,
    amount: 1800,
    type: 'expense',
    category: '餐饮',
    title: '午饭面条',
    note: '公司楼下片儿川',
    payment_method: '支付宝',
    occurred_at: '2026-10-09T12:15:00Z',
  },
  {
    id: 3,
    amount: 6800,
    type: 'expense',
    category: '餐饮',
    title: '埃塞俄比亚咖啡生豆',
    note: '浅烘花魁 250g',
    payment_method: '微信支付',
    occurred_at: '2026-10-08T16:30:00Z',
  },
  {
    id: 4,
    amount: 500000,
    type: 'income',
    category: '其他',
    title: '稿酬与项目结项',
    note: '校园开源平台二期补贴',
    payment_method: '银行转账',
    occurred_at: '2026-10-07T10:00:00Z',
  },
]

function getInitialTransactions(): Transaction[] {
  try {
    const cached = localStorage.getItem(TX_CACHE_KEY) || localStorage.getItem('chimu_cached_transactions')
    if (cached) {
      const parsed = JSON.parse(cached)
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed
      }
    }
  } catch {}
  return [...DEFAULT_TRANSACTIONS]
}

const transactions = ref<Transaction[]>(getInitialTransactions())

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
  const saveToCache = (list: Transaction[]) => {
    try {
      localStorage.setItem(TX_CACHE_KEY, JSON.stringify(list))
    } catch {}
  }

  const loadRemoteTransactions = async (params?: { year?: number; month?: number }) => {
    try {
      const data = await fetchTransactions(params)
      if (data && data.length > 0) {
        transactions.value = data
        saveToCache(data)
      }
    } catch (err) {
      console.warn('Backend transactions unreachable, serving local cache:', err)
    }
  }

  const addTransaction = (tx: Transaction) => {
    transactions.value = [tx, ...transactions.value.filter((t) => t.id !== tx.id)]
    saveToCache(transactions.value)
  }

  const updateTransactionItem = (tx: Transaction) => {
    const idx = transactions.value.findIndex((t) => t.id === tx.id)
    if (idx !== -1) {
      transactions.value[idx] = tx
    }
    saveToCache(transactions.value)
  }

  const removeTransaction = (id: number) => {
    transactions.value = transactions.value.filter((t) => t.id !== id)
    saveToCache(transactions.value)
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
