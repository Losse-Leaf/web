<script setup lang="ts">
import { ref, computed, onMounted, watch, defineAsyncComponent } from 'vue'
import {
  Plus,
  ChevronLeft,
  ChevronRight,
  Laptop,
  SlidersHorizontal,
} from 'lucide-vue-next'
import {
  fetchTransactions,
  fetchTransactionSummary,
  deleteTransaction,
  fetchAssetsOverview,
  fetchCreditChannels,
  deleteGearAsset,
} from '../utils/api'
import type {
  Transaction,
  TransactionSummary,
  CuratorProfile,
  AssetsOverview,
  CreditChannel,
  GearItem,
} from '../types'
import { useCategories } from '../composables/useCategories'
import { askConfirm, showAlert } from '../composables/useConfirm'
import { getBeijingNow } from '../utils/format'
import { loadCuratorProfile } from '../utils/profile'
import AssetsBalanceSheet from './ledger/AssetsBalanceSheet.vue'
import MonthlyLedgerSection from './ledger/MonthlyLedgerSection.vue'
import GearCatalogSection from './ledger/GearCatalogSection.vue'
import GearAssetFormModal from './ledger/GearAssetFormModal.vue'
import GearSellModal from './ledger/GearSellModal.vue'
import TransactionEditModal from './ledger/TransactionEditModal.vue'

const CreditChannelsModal = defineAsyncComponent(() => import('./CreditChannelsModal.vue'))

const props = defineProps<{
  profile?: CuratorProfile | null
  refreshKey?: number
}>()

const emit = defineEmits<{
  (e: 'openAdd'): void
  (e: 'transactionDeleted', id: number): void
  (e: 'transactionUpdated', tx: Transaction): void
  (e: 'gearChanged'): void
}>()

const { loadCategories, openCategoryManager } = useCategories()

const currentDate = ref(getBeijingNow())
const transactionsList = ref<Transaction[]>([])
const summary = ref<TransactionSummary | null>(null)
const isLoading = ref(false)
const activeSubTab = ref<'ledger' | 'gear'>('ledger')

const isCreditModalOpen = ref(false)
const assetsOverview = ref<AssetsOverview | null>(null)
const creditChannels = ref<CreditChannel[]>([])

const gearFilter = ref<'active' | 'sold' | 'all'>('active')
const isAddGearModalOpen = ref(false)
const sellingGear = ref<GearItem | null>(null)
const editingTx = ref<Transaction | null>(null)

const allGearItems = computed<GearItem[]>(() => {
  if (assetsOverview.value?.gear_summary?.items) {
    return assetsOverview.value.gear_summary.items
  }
  const profile = props.profile || loadCuratorProfile()
  return profile.edc_gear || []
})

const activeGearCount = computed(
  () => allGearItems.value.filter((g) => g.status !== 'sold').length,
)

const soldGearCount = computed(
  () => allGearItems.value.filter((g) => g.status === 'sold').length,
)

const year = computed(() => currentDate.value.getUTCFullYear())
const month = computed(() => currentDate.value.getUTCMonth() + 1)

const prevMonth = () => {
  currentDate.value = new Date(Date.UTC(year.value, month.value - 2, 1))
}

const nextMonth = () => {
  currentDate.value = new Date(Date.UTC(year.value, month.value, 1))
}

let dataLoadSeq = 0
let assetsLoadSeq = 0

const loadAssetsOverview = async () => {
  const seq = ++assetsLoadSeq
  try {
    const [overview, channels] = await Promise.all([
      fetchAssetsOverview().catch(() => null),
      fetchCreditChannels().catch(() => []),
    ])
    if (seq !== assetsLoadSeq) return
    if (overview) assetsOverview.value = overview
    creditChannels.value = channels
  } catch (err) {
    console.error('Failed to load assets overview:', err)
  }
}

const loadData = async () => {
  const seq = ++dataLoadSeq
  try {
    isLoading.value = true
    const [txs, sum] = await Promise.all([
      fetchTransactions({ year: year.value, month: month.value }),
      fetchTransactionSummary({ year: year.value, month: month.value }),
      loadAssetsOverview(),
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
  loadCategories()
  loadData()
})

const handleGearCreatedOrSold = async () => {
  emit('gearChanged')
  await loadData()
}

const handleRemoveGear = async (item: GearItem) => {
  if (!item.id) return
  const ok = await askConfirm({
    title: '移除设备',
    message: `确定从固定资产库中移除「${item.name}」？`,
    confirmText: '移除',
    danger: true,
  })
  if (!ok) return
  try {
    await deleteGearAsset(item.id)
    emit('gearChanged')
    await loadAssetsOverview()
  } catch (err: any) {
    await showAlert({ title: '删除失败', message: err.message || '删除设备失败', danger: true })
  }
}

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
</script>

<template>
  <div class="max-w-5xl mx-auto px-4 sm:px-8 py-10 sm:py-20 text-left space-y-10">
    <!-- 标头与操作栏 -->
    <header class="pb-10 border-b border-[var(--border-subtle)] space-y-4">
      <div class="flex flex-wrap items-center justify-between gap-4">
        <div class="flex flex-wrap items-baseline gap-3">
          <h1 class="font-serif-editorial text-4xl sm:text-5xl font-normal text-[var(--ink-primary)]">
            资产
          </h1>
          <span class="font-mono-archive text-xs tracking-widest text-[var(--ink-muted)]">
            净资产大盘 · 收支台账 · 固定设备库
          </span>
        </div>

        <div class="flex flex-wrap items-center gap-2.5">
          <button
            @click="openCategoryManager('expense')"
            class="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono-archive border border-[var(--border-subtle)] hover:border-[var(--ink-primary)] rounded-xs transition-colors cursor-pointer text-[var(--ink-secondary)] hover:text-[var(--ink-primary)]"
          >
            <SlidersHorizontal class="w-3.5 h-3.5" />
            <span>分类管理</span>
          </button>

          <button
            @click="emit('openAdd')"
            class="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-mono-archive bg-[var(--ink-primary)] text-[var(--bg-archive)] rounded-xs hover:opacity-90 transition-opacity cursor-pointer shadow-xs"
          >
            <Plus class="w-3.5 h-3.5" />
            <span>记一笔</span>
          </button>
        </div>
      </div>
    </header>

    <!-- 1. 个人资产负债总览表 -->
    <AssetsBalanceSheet
      :assetsOverview="assetsOverview"
      :summary="summary"
      :transactionsList="transactionsList"
      :allGearItems="allGearItems"
      :creditChannels="creditChannels"
      v-model:activeSubTab="activeSubTab"
      @openCreditModal="isCreditModalOpen = true"
      @editTransaction="(tx) => (editingTx = tx)"
      @liquidBalanceSaved="loadAssetsOverview"
    />

    <!-- 2. 二级子视图切换栏：月度收支台账 / 固定资产设备库 -->
    <div class="flex flex-wrap items-center justify-between gap-4 border-b border-[var(--border-subtle)] pb-4">
      <div class="flex items-center gap-6 text-sm font-serif-editorial">
        <button
          type="button"
          @click="activeSubTab = 'ledger'"
          class="pb-1.5 transition-colors cursor-pointer flex items-center gap-2"
          :class="
            activeSubTab === 'ledger'
              ? 'text-[var(--ink-primary)] font-medium border-b-2 border-[var(--ink-primary)]'
              : 'text-[var(--ink-muted)] hover:text-[var(--ink-primary)]'
          "
        >
          <span>月度收支台账</span>
          <span class="font-mono-archive text-xs text-[var(--ink-muted)]">({{ transactionsList.length }})</span>
        </button>

        <button
          type="button"
          @click="activeSubTab = 'gear'"
          class="pb-1.5 transition-colors cursor-pointer flex items-center gap-2"
          :class="
            activeSubTab === 'gear'
              ? 'text-[var(--ink-primary)] font-medium border-b-2 border-[var(--ink-primary)]'
              : 'text-[var(--ink-muted)] hover:text-[var(--ink-primary)]'
          "
        >
          <span>固定资产设备库</span>
          <span class="font-mono-archive text-xs text-[var(--ink-muted)]">
            (在役 {{ assetsOverview?.gear_summary?.active_count ?? activeGearCount }})
          </span>
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

      <div v-else class="flex flex-wrap items-center gap-2.5 text-xs font-mono-archive">
        <div class="inline-flex items-center rounded-xs border border-[var(--border-subtle)] p-0.5 bg-[var(--bg-subtle)]/40">
          <button
            type="button"
            @click="gearFilter = 'active'"
            class="px-2.5 py-1 rounded-xs transition-colors cursor-pointer whitespace-nowrap"
            :class="gearFilter === 'active' ? 'bg-[var(--ink-primary)] text-[var(--bg-archive)] font-medium' : 'text-[var(--ink-muted)] hover:text-[var(--ink-primary)]'"
          >
            在役 ({{ activeGearCount }})
          </button>
          <button
            type="button"
            @click="gearFilter = 'sold'"
            class="px-2.5 py-1 rounded-xs transition-colors cursor-pointer whitespace-nowrap"
            :class="gearFilter === 'sold' ? 'bg-[var(--ink-primary)] text-[var(--bg-archive)] font-medium' : 'text-[var(--ink-muted)] hover:text-[var(--ink-primary)]'"
          >
            已转售 ({{ soldGearCount }})
          </button>
          <button
            type="button"
            @click="gearFilter = 'all'"
            class="px-2.5 py-1 rounded-xs transition-colors cursor-pointer whitespace-nowrap"
            :class="gearFilter === 'all' ? 'bg-[var(--ink-primary)] text-[var(--bg-archive)] font-medium' : 'text-[var(--ink-muted)] hover:text-[var(--ink-primary)]'"
          >
            全部
          </button>
        </div>

        <button
          type="button"
          @click="isAddGearModalOpen = true"
          class="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xs border border-[var(--ink-primary)] bg-[var(--ink-primary)] text-[var(--bg-archive)] hover:opacity-90 transition-opacity cursor-pointer whitespace-nowrap shrink-0"
        >
          <Laptop class="w-3.5 h-3.5" />
          <span>录入新设备</span>
        </button>
      </div>
    </div>

    <!-- 视图 A：月度收支概览与流水台账 -->
    <MonthlyLedgerSection
      v-if="activeSubTab === 'ledger'"
      :year="year"
      :month="month"
      :summary="summary"
      :transactionsList="transactionsList"
      :isLoading="isLoading"
      @openAdd="emit('openAdd')"
      @editTransaction="(tx) => (editingTx = tx)"
      @deleteTransaction="removeTx"
    />

    <!-- 视图 B：随身与桌面固定资产设备库 -->
    <GearCatalogSection
      v-else
      :allGearItems="allGearItems"
      :gearFilter="gearFilter"
      @sellGear="(item) => (sellingGear = item)"
      @removeGear="handleRemoveGear"
    />

    <!-- 模态框 A：录入新固定资产设备 -->
    <GearAssetFormModal
      :isOpen="isAddGearModalOpen"
      :creditChannels="creditChannels"
      @close="isAddGearModalOpen = false"
      @created="handleGearCreatedOrSold"
    />

    <!-- 模态框 B：设备转售出二手回血 -->
    <GearSellModal
      :gear="sellingGear"
      @close="sellingGear = null"
      @sold="handleGearCreatedOrSold"
    />

    <!-- 模态框 C：修改账目 -->
    <TransactionEditModal
      :transaction="editingTx"
      :creditChannels="creditChannels"
      @close="editingTx = null"
      @saved="handleTransactionSaved"
    />

    <!-- 信贷渠道与独立还款日管理抽屉 -->
    <CreditChannelsModal
      v-if="isCreditModalOpen"
      :isOpen="isCreditModalOpen"
      @close="isCreditModalOpen = false"
      @channelsUpdated="loadAssetsOverview"
    />
  </div>
</template>
