<script setup lang="ts">
import { ref, computed, onMounted, watch, defineAsyncComponent } from 'vue'
import {
  Plus,
  ChevronLeft,
  ChevronRight,
  CreditCard,
  SlidersHorizontal,
} from 'lucide-vue-next'
import {
  fetchTransactions,
  fetchTransactionSummary,
  deleteTransaction,
  fetchCreditChannels,
  getAdminToken,
} from '../utils/api'
import type {
  Transaction,
  TransactionSummary,
  CreditChannel,
} from '../types'
import { useCategories } from '../composables/useCategories'
import { askConfirm, showAlert } from '../composables/useConfirm'
import { getBeijingNow } from '../utils/format'
import MonthlyLedgerSection from './ledger/MonthlyLedgerSection.vue'
import TransactionEditModal from './ledger/TransactionEditModal.vue'

const WishlistView = defineAsyncComponent(() => import('./WishlistView.vue'))
const CreditChannelsModal = defineAsyncComponent(() => import('./CreditChannelsModal.vue'))

const props = defineProps<{
  refreshKey?: number
  wishesRefreshKey?: number
  initialTab?: 'ledger' | 'wishes'
}>()

const emit = defineEmits<{
  (e: 'openAdd', kind?: 'transaction' | 'wish'): void
  (e: 'transactionDeleted', id: number): void
  (e: 'transactionUpdated', tx: Transaction): void
  (e: 'wishResolved'): void
  (e: 'requestAuth'): void
  (e: 'tabChange', tab: 'ledger' | 'wishes'): void
}>()

const { loadCategories, openCategoryManager } = useCategories()

const isAdmin = computed(() => Boolean(getAdminToken()))
const currentDate = ref(getBeijingNow())
const transactionsList = ref<Transaction[]>([])
const summary = ref<TransactionSummary | null>(null)
const isLoading = ref(false)
const activeSubTab = ref<'ledger' | 'wishes'>(
  isAdmin.value ? (props.initialTab || 'ledger') : 'wishes',
)

const isCreditModalOpen = ref(false)
const creditChannels = ref<CreditChannel[]>([])
const editingTx = ref<Transaction | null>(null)

const year = computed(() => currentDate.value.getUTCFullYear())
const month = computed(() => currentDate.value.getUTCMonth() + 1)

const prevMonth = () => {
  currentDate.value = new Date(Date.UTC(year.value, month.value - 2, 1))
}

const nextMonth = () => {
  currentDate.value = new Date(Date.UTC(year.value, month.value, 1))
}

const switchTab = (tab: 'ledger' | 'wishes') => {
  if (tab === 'ledger' && !isAdmin.value) {
    emit('requestAuth')
    return
  }
  activeSubTab.value = tab
  emit('tabChange', tab)
}

let dataLoadSeq = 0
let channelsLoadSeq = 0

const loadCreditChannels = async () => {
  if (!isAdmin.value) return
  const seq = ++channelsLoadSeq
  try {
    const channels = await fetchCreditChannels().catch(() => [])
    if (seq !== channelsLoadSeq) return
    creditChannels.value = channels
  } catch (err) {
    console.error('Failed to load credit channels:', err)
  }
}

const loadData = async () => {
  if (!isAdmin.value) return
  const seq = ++dataLoadSeq
  try {
    isLoading.value = true
    const [txs, sum] = await Promise.all([
      fetchTransactions({ year: year.value, month: month.value }),
      fetchTransactionSummary({ year: year.value, month: month.value }),
      loadCreditChannels(),
    ])
    if (seq !== dataLoadSeq) return
    transactionsList.value = txs
    summary.value = sum
  } catch (err) {
    console.error('Failed to load transactions:', err)
  } finally {
    if (seq === dataLoadSeq) isLoading.value = false
  }
}

watch(
  () => props.initialTab,
  (nextTab) => {
    if (!nextTab) return
    if (!isAdmin.value) {
      activeSubTab.value = 'wishes'
      return
    }
    activeSubTab.value = nextTab
  },
)

watch([year, month], () => {
  loadData()
})

watch(
  () => props.refreshKey,
  () => {
    loadData()
  },
)

onMounted(() => {
  if (isAdmin.value) {
    loadCategories()
    loadData()
  }
})

const handleTransactionSaved = async (updated: Transaction) => {
  const idx = transactionsList.value.findIndex((t) => t.id === updated.id)
  if (idx !== -1) {
    transactionsList.value[idx] = updated
  }
  emit('transactionUpdated', updated)
  await loadData()
}

const removeTx = async (id: number) => {
  const ok = await askConfirm({
    title: '删除账目',
    message: '确定删除这笔账目记录？此操作不可恢复。',
    confirmText: '删除',
    danger: true,
  })
  if (!ok) return
  try {
    await deleteTransaction(id)
  } catch (err: any) {
    await showAlert({ title: '删除失败', message: err?.message || '删除账目失败', danger: true })
    return
  }
  transactionsList.value = transactionsList.value.filter((t) => t.id !== id)
  emit('transactionDeleted', id)
  await loadData()
}

const handleWishResolved = async () => {
  if (isAdmin.value) {
    await loadData()
  }
  emit('wishResolved')
}
</script>

<template>
  <div class="max-w-5xl mx-auto px-4 sm:px-8 py-10 sm:py-20 text-left space-y-10">
    <!-- 标头与操作栏 -->
    <header class="pb-10 border-b border-[var(--border-subtle)] space-y-4">
      <div class="flex flex-wrap items-center justify-between gap-4">
        <div class="flex flex-wrap items-baseline gap-3">
          <h1 class="font-serif-editorial text-4xl sm:text-5xl font-normal text-[var(--ink-primary)]">
            {{ isAdmin ? '记账' : '心愿单' }}
          </h1>
          <span class="font-mono-archive text-xs tracking-widest text-[var(--ink-muted)]">
            {{ isAdmin ? '日常流水 · 收支光谱 · 心愿单' : '好物 · 旅程 · 里程碑' }}
          </span>
        </div>

        <div v-if="isAdmin" class="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            @click="isCreditModalOpen = true"
            class="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono-archive border border-[var(--border-subtle)] hover:border-[var(--ink-primary)] rounded-xs transition-colors cursor-pointer text-[var(--ink-secondary)] hover:text-[var(--ink-primary)]"
          >
            <CreditCard class="w-3.5 h-3.5" />
            <span>信贷渠道</span>
          </button>

          <button
            type="button"
            @click="openCategoryManager('expense')"
            class="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono-archive border border-[var(--border-subtle)] hover:border-[var(--ink-primary)] rounded-xs transition-colors cursor-pointer text-[var(--ink-secondary)] hover:text-[var(--ink-primary)]"
          >
            <SlidersHorizontal class="w-3.5 h-3.5" />
            <span>分类管理</span>
          </button>

          <button
            type="button"
            @click="emit('openAdd', activeSubTab === 'wishes' ? 'wish' : 'transaction')"
            class="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-mono-archive bg-[var(--ink-primary)] text-[var(--bg-archive)] rounded-xs hover:opacity-90 transition-opacity cursor-pointer shadow-xs"
          >
            <Plus class="w-3.5 h-3.5" />
            <span>{{ activeSubTab === 'wishes' ? '许下心愿' : '记一笔' }}</span>
          </button>
        </div>
      </div>
    </header>

    <!-- 二级子视图切换栏：日常流水 | 心愿单 -->
    <div
      v-if="isAdmin"
      class="flex flex-wrap items-center justify-between gap-4 border-b border-[var(--border-subtle)] pb-4"
    >
      <div class="flex items-center gap-6 text-sm font-serif-editorial">
        <button
          type="button"
          @click="switchTab('ledger')"
          class="pb-1.5 transition-colors cursor-pointer flex items-center gap-2"
          :class="
            activeSubTab === 'ledger'
              ? 'text-[var(--ink-primary)] font-medium border-b-2 border-[var(--ink-primary)]'
              : 'text-[var(--ink-muted)] hover:text-[var(--ink-primary)]'
          "
        >
          <span>日常流水</span>
          <span class="font-mono-archive text-xs text-[var(--ink-muted)]">({{ transactionsList.length }})</span>
        </button>

        <button
          type="button"
          @click="switchTab('wishes')"
          class="pb-1.5 transition-colors cursor-pointer flex items-center gap-2"
          :class="
            activeSubTab === 'wishes'
              ? 'text-[var(--ink-primary)] font-medium border-b-2 border-[var(--ink-primary)]'
              : 'text-[var(--ink-muted)] hover:text-[var(--ink-primary)]'
          "
        >
          <span>心愿单</span>
        </button>
      </div>

      <div v-if="activeSubTab === 'ledger'" class="flex flex-wrap items-center gap-3 font-mono-archive text-xs">
        <div class="inline-flex items-center gap-1 border border-[var(--border-subtle)] rounded-xs px-2 py-1 bg-[var(--bg-subtle)]/30">
          <button
            @click="prevMonth"
            class="p-0.5 hover:text-[var(--ink-primary)] text-[var(--ink-muted)] cursor-pointer"
            title="上个月"
          >
            <ChevronLeft class="w-3.5 h-3.5" />
          </button>
          <span class="px-2 text-[var(--ink-primary)] font-medium">
            {{ year }} 年 {{ month }} 月
          </span>
          <button
            @click="nextMonth"
            class="p-0.5 hover:text-[var(--ink-primary)] text-[var(--ink-muted)] cursor-pointer"
            title="下个月"
          >
            <ChevronRight class="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>

    <!-- 视图 A：月度收支概览与流水台账 -->
    <MonthlyLedgerSection
      v-if="isAdmin && activeSubTab === 'ledger'"
      :year="year"
      :month="month"
      :summary="summary"
      :transactionsList="transactionsList"
      :isLoading="isLoading"
      @openAdd="emit('openAdd', 'transaction')"
      @editTransaction="(tx) => (editingTx = tx)"
      @deleteTransaction="removeTx"
    />

    <!-- 视图 B：内嵌心愿单 -->
    <WishlistView
      v-else
      :embedded="true"
      :refreshKey="wishesRefreshKey"
      @wishResolved="handleWishResolved"
      @requestAuth="emit('requestAuth')"
    />

    <!-- 修改账目弹窗 -->
    <TransactionEditModal
      v-if="isAdmin"
      :transaction="editingTx"
      :creditChannels="creditChannels"
      @close="editingTx = null"
      @saved="handleTransactionSaved"
    />

    <!-- 信贷渠道与独立还款日管理弹窗 -->
    <CreditChannelsModal
      v-if="isAdmin && isCreditModalOpen"
      :isOpen="isCreditModalOpen"
      @close="isCreditModalOpen = false"
      @channelsUpdated="loadCreditChannels"
    />
  </div>
</template>
