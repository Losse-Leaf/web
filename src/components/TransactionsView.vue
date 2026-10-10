<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { Plus, ChevronLeft, ChevronRight, Trash2, Edit2, Wallet, Download, X, Settings } from 'lucide-vue-next'
import {
  fetchTransactions,
  fetchTransactionSummary,
  deleteTransaction,
  updateTransaction,
  fetchAssetsOverview,
  fetchCreditChannels,
} from '../utils/api'
import type { Transaction, TransactionSummary, CuratorProfile, AssetsOverview, CreditChannel } from '../types'
import { useExport } from '../composables/useExport'
import { formatMoney } from '../utils/format'
import { loadCuratorProfile } from '../utils/profile'
import CreditChannelsModal from './CreditChannelsModal.vue'

const props = defineProps<{
  transactions?: Transaction[]
  profile?: CuratorProfile | null
}>()

const emit = defineEmits<{
  (e: 'openAdd'): void
  (e: 'transactionDeleted', id: number): void
  (e: 'transactionUpdated', tx: Transaction): void
}>()

const { exportTransactionsCSV } = useExport()

const currentDate = ref(new Date())
const transactionsList = ref<Transaction[]>([])
const summary = ref<TransactionSummary | null>(null)
const isLoading = ref(false)
const selectedCategoryFilter = ref<string>('')

// 信贷渠道与资产大盘 (RC-53, FE-15)
const isCreditModalOpen = ref(false)
const assetsOverview = ref<AssetsOverview | null>(null)
const creditChannels = ref<CreditChannel[]>([])

// 编辑态 (RG-11)
const editingTx = ref<Transaction | null>(null)
const editTitle = ref('')
const editAmount = ref('')
const editCategory = ref('餐饮')
const editType = ref<'expense' | 'income'>('expense')
const editNote = ref('')
const editPaymentMethod = ref('微信支付')
const editOccurredAt = ref('')

const categoriesList = ['餐饮', '交通', '购物', '娱乐', '学习', '住房', '医疗', '其他']
const paymentMethodsList = ['微信支付', '支付宝', '银行卡', '现金', '其他']

// 资产与信贷管理大盘 (RC-53)
const totalFixedAssets = computed(() => {
  const profile = props.profile || loadCuratorProfile()
  const gears = profile.edc_gear || []
  return gears
    .filter((g) => g.status !== '已出二手')
    .reduce((sum, g) => sum + (g.price_cents || 0), 0)
})

const activeGearCount = computed(() => {
  const profile = props.profile || loadCuratorProfile()
  const gears = profile.edc_gear || []
  return gears.filter((g) => g.status !== '已出二手').length
})

const totalInstallmentLiabilities = computed(() => {
  return transactionsList.value
    .filter((t) => t.is_installment)
    .reduce((sum, t) => sum + (t.installment_total_amount || t.amount), 0)
})

const estimatedNetWorth = computed(() => {
  const balance = summary.value?.balance || 0
  return totalFixedAssets.value + balance - totalInstallmentLiabilities.value
})

const getDaysUntilDay = (targetDay: number) => {
  const now = new Date()
  const currentDay = now.getDate()
  if (currentDay <= targetDay) {
    return targetDay - currentDay
  }
  const nextMonthDate = new Date(now.getFullYear(), now.getMonth() + 1, targetDay)
  const diffMs = nextMonthDate.getTime() - now.getTime()
  return Math.ceil(diffMs / (1000 * 60 * 60 * 24))
}

const huabeiCountdown = computed(() => getDaysUntilDay(10))
const baitiaoCountdown = computed(() => getDaysUntilDay(20))

const year = computed(() => currentDate.value.getFullYear())
const month = computed(() => currentDate.value.getMonth() + 1)

const prevMonth = () => {
  currentDate.value = new Date(year.value, month.value - 2, 1)
}

const nextMonth = () => {
  currentDate.value = new Date(year.value, month.value, 1)
}

const loadAssetsOverview = async () => {
  try {
    const [overview, channels] = await Promise.all([
      fetchAssetsOverview().catch(() => null),
      fetchCreditChannels().catch(() => []),
    ])
    if (overview) assetsOverview.value = overview
    creditChannels.value = channels
  } catch (err) {
    console.error('Failed to load assets overview:', err)
  }
}

const loadData = async () => {
  try {
    isLoading.value = true
    const [txs, sum] = await Promise.all([
      fetchTransactions({ year: year.value, month: month.value }),
      fetchTransactionSummary({ year: year.value, month: month.value }),
      loadAssetsOverview(),
    ])
    transactionsList.value = txs
    summary.value = sum
  } catch (err) {
    console.error('Failed to load transactions:', err)
  } finally {
    isLoading.value = false
  }
}

watch([year, month], () => {
  loadData()
})

watch(
  () => props.transactions,
  () => {
    loadData()
  },
  { deep: true }
)

onMounted(() => {
  loadData()
})

// 分组：按天汇聚
interface DayGroup {
  dateStr: string
  displayDay: string
  items: Transaction[]
  dayTotalExpense: number
}

const toggleCategoryFilter = (cat: string) => {
  if (selectedCategoryFilter.value === cat) {
    selectedCategoryFilter.value = ''
  } else {
    selectedCategoryFilter.value = cat
  }
}

const dayGroups = computed(() => {
  const map = new Map<string, Transaction[]>()
  const listToGroup = selectedCategoryFilter.value
    ? transactionsList.value.filter((t) => t.category === selectedCategoryFilter.value)
    : transactionsList.value

  listToGroup.forEach((tx) => {
    const d = new Date(tx.occurred_at)
    const key = !isNaN(d.getTime())
      ? `${d.getMonth() + 1}月${d.getDate()}日`
      : '近期'
    const list = map.get(key) || []
    list.push(tx)
    map.set(key, list)
  })

  const groups: DayGroup[] = []
  map.forEach((items, displayDay) => {
    let dayTotal = 0
    items.forEach((it) => {
      if (it.type === 'expense') dayTotal += it.amount
    })
    groups.push({
      dateStr: displayDay,
      displayDay,
      items,
      dayTotalExpense: dayTotal,
    })
  })

  return groups
})


const startEdit = (tx: Transaction) => {
  editingTx.value = tx
  editTitle.value = tx.title
  editAmount.value = (tx.amount / 100).toFixed(2)
  editCategory.value = tx.category
  editType.value = tx.type
  editNote.value = tx.note || ''
  editPaymentMethod.value = tx.payment_method || '微信支付'
  editOccurredAt.value = tx.occurred_at ? tx.occurred_at.slice(0, 16) : ''
}

const saveEdit = async () => {
  if (!editingTx.value) return
  const amtFloat = parseFloat(editAmount.value)
  if (isNaN(amtFloat) || amtFloat <= 0) return

  const updated = await updateTransaction(editingTx.value.id, {
    title: editTitle.value.trim() || editCategory.value,
    amount: Math.round(amtFloat * 100),
    type: editType.value,
    category: editCategory.value,
    note: editNote.value.trim(),
    payment_method: editPaymentMethod.value.trim() || undefined,
    occurred_at: editOccurredAt.value || undefined,
  })

  const idx = transactionsList.value.findIndex((t) => t.id === updated.id)
  if (idx !== -1) {
    transactionsList.value[idx] = updated
  }
  emit('transactionUpdated', updated)
  editingTx.value = null
  fetchTransactionSummary({ year: year.value, month: month.value })
    .then((sum) => {
      if (sum) summary.value = sum
    })
    .catch(() => {})
}

const removeTx = async (id: number) => {
  if (!confirm('确定删除这笔记录？')) return
  await deleteTransaction(id)
  transactionsList.value = transactionsList.value.filter((t) => t.id !== id)
  emit('transactionDeleted', id)
  fetchTransactionSummary({ year: year.value, month: month.value })
    .then((sum) => {
      if (sum) summary.value = sum
    })
    .catch(() => {})
}

// 支出光谱细线条颜色与占比 (Earthy publication film palette)
const CATEGORY_COLORS: Record<string, string> = {
  餐饮: '#a24f2b', // 暖赭石
  交通: '#4a6b82', // 青石灰
  购物: '#8c6d46', // 旧皮褐
  娱乐: '#7a5980', // 暮紫
  住房: '#3f5a4a', // 苔藓绿
  学习: '#5c6773', // 墨色
  医疗: '#b35c5c', // 枯叶红
  其他: '#8a857b', // 米灰
}

const spectrumItems = computed(() => {
  if (!summary.value || !summary.value.total_expense || summary.value.total_expense <= 0) return []
  const breakdown = summary.value.category_breakdown || {}
  const total = summary.value.total_expense
  return Object.entries(breakdown)
    .filter(([_, amt]) => amt > 0)
    .map(([cat, amt]) => {
      const percentage = Math.round((amt / total) * 1000) / 10
      return {
        category: cat,
        amount: amt,
        percentage,
        color: CATEGORY_COLORS[cat] || '#8a857b',
      }
    })
    .sort((a, b) => b.amount - a.amount)
})
</script>

<template>
  <div class="max-w-4xl mx-auto px-4 sm:px-8 py-10 sm:py-20 text-left">
    
    <!-- 标头与月度切换器 -->
    <header class="pb-10 border-b border-[var(--border-subtle)] mb-12 space-y-4">
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-3">
          <h1 class="font-serif-editorial text-4xl sm:text-5xl font-normal text-[var(--ink-primary)]">
            记账
          </h1>
          <span class="font-mono-archive text-xs tracking-widest text-[var(--ink-muted)]">
            生活收支与记账
          </span>
        </div>

        <div class="flex items-center gap-2">
          <button
            @click="exportTransactionsCSV(transactionsList)"
            class="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-mono-archive border border-[var(--border-subtle)] hover:border-[var(--ink-primary)] rounded-xs transition-colors cursor-pointer text-[var(--ink-secondary)] hover:text-[var(--ink-primary)]"
            title="导出当前月份账目 CSV 表格"
          >
            <Download class="w-3.5 h-3.5" />
            <span class="hidden sm:inline">导出月度 CSV</span>
          </button>

          <button
            @click="emit('openAdd')"
            class="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono-archive bg-[var(--ink-primary)] text-[var(--bg-archive)] rounded-xs hover:opacity-90 transition-opacity cursor-pointer shadow-xs"
          >
            <Plus class="w-3.5 h-3.5" />
            <span>记一笔</span>
          </button>
        </div>
      </div>

      <!-- 月度指示器 -->
      <div class="flex items-center justify-between pt-2">
        <div class="flex items-center gap-3 font-mono-archive text-sm">
          <button
            @click="prevMonth"
            class="p-1 hover:text-[var(--ink-primary)] text-[var(--ink-muted)] cursor-pointer"
            title="上个月"
          >
            <ChevronLeft class="w-4 h-4" />
          </button>
          <span class="text-base text-[var(--ink-primary)] font-serif-editorial font-medium">
            {{ year }} 年 {{ month }} 月
          </span>
          <button
            @click="nextMonth"
            class="p-1 hover:text-[var(--ink-primary)] text-[var(--ink-muted)] cursor-pointer"
            title="下个月"
          >
            <ChevronRight class="w-4 h-4" />
          </button>
        </div>

        <p class="font-serif-editorial text-xs text-[var(--ink-muted)] hidden sm:block">
          记录日常的柴米油盐与生活花销。
        </p>
      </div>
    </header>

    <!-- 个人净资产与资产大盘指示纸签 (RC-53, FE-15) -->
    <div class="mb-10 p-4 sm:p-5 rounded-xs border border-[var(--border-subtle)] bg-[var(--bg-subtle)]/40 flex flex-col md:flex-row md:items-center justify-between gap-5 font-mono-archive text-xs">
      <div class="flex flex-wrap items-center gap-x-8 gap-y-3">
        <!-- 流动可用资金池 (储蓄与余额) -->
        <div>
          <span class="text-[var(--ink-muted)] block text-[11px]">流动资金池 (储蓄与结余)</span>
          <span class="font-serif-editorial text-lg font-medium" :class="(assetsOverview?.liquid_balance ?? 0) >= 0 ? 'text-[var(--ink-primary)]' : 'text-red-700'">
            {{ (assetsOverview?.liquid_balance ?? 0) < 0 ? '-' : '' }}¥{{ formatMoney(Math.abs(assetsOverview?.liquid_balance ?? (summary?.balance || 0))) }}
          </span>
        </div>

        <!-- 固定资产沉淀 -->
        <div>
          <span class="text-[var(--ink-muted)] block text-[11px]">固定资产沉淀 (在用设备)</span>
          <div class="flex items-baseline gap-1.5">
            <span class="font-serif-editorial text-lg text-[var(--ink-primary)] font-medium">
              ¥{{ formatMoney(assetsOverview?.fixed_assets ?? totalFixedAssets) }}
            </span>
            <span class="text-[10px] text-[var(--ink-muted)]">({{ assetsOverview?.gear_summary?.active_count ?? activeGearCount }} 件在用)</span>
          </div>
        </div>

        <!-- 待还信贷分期 -->
        <div v-if="(assetsOverview?.total_liabilities ?? totalInstallmentLiabilities) > 0">
          <span class="text-[var(--ink-muted)] block text-[11px]">待还信贷分期 (负债)</span>
          <span class="font-serif-editorial text-lg text-[var(--accent-warm)] font-medium">
            -¥{{ formatMoney(assetsOverview?.total_liabilities ?? totalInstallmentLiabilities) }}
          </span>
        </div>

        <!-- 个人净资产 -->
        <div>
          <span class="text-[var(--ink-muted)] block text-[11px]">个人净资产 (流动资金+固资-负债)</span>
          <span class="font-serif-editorial text-lg text-[var(--ink-primary)] font-semibold">
            ¥{{ formatMoney(assetsOverview?.net_worth ?? estimatedNetWorth) }}
          </span>
        </div>
      </div>

      <!-- 渠道独立还款日倒计时纸签与管理按钮 -->
      <div class="flex flex-wrap items-center gap-2 text-[11px]">
        <template v-if="assetsOverview?.channel_liabilities && assetsOverview.channel_liabilities.length > 0">
          <div
            v-for="ch in assetsOverview.channel_liabilities"
            :key="ch.channel_code"
            class="px-2.5 py-1 rounded-xs border border-[var(--border-subtle)] bg-[var(--bg-archive)] flex items-center gap-1.5 shadow-2xs"
            :title="`每月 ${ch.repayment_day} 号还款 · 待还 ¥${formatMoney(ch.total_debt)}`"
          >
            <span class="w-1.5 h-1.5 rounded-full" :style="{ backgroundColor: ch.color || 'var(--accent-warm)' }" />
            <span class="text-[var(--ink-muted)]">{{ ch.channel_name }}</span>
            <span class="text-[var(--ink-primary)] font-semibold">
              {{ ch.days_until_repayment === 0 ? '今日还款' : `${ch.days_until_repayment} 天后 (${ch.repayment_day}日)` }}
            </span>
          </div>
        </template>
        <template v-else>
          <div class="px-2.5 py-1 rounded-xs border border-[var(--border-subtle)] bg-[var(--bg-archive)] flex items-center gap-1.5 shadow-2xs">
            <span class="text-[var(--ink-muted)]">花呗还款日</span>
            <span class="text-[var(--ink-primary)] font-semibold">{{ huabeiCountdown === 0 ? '今日到期' : `${huabeiCountdown} 天后 (10日)` }}</span>
          </div>
          <div class="px-2.5 py-1 rounded-xs border border-[var(--border-subtle)] bg-[var(--bg-archive)] flex items-center gap-1.5 shadow-2xs">
            <span class="text-[var(--ink-muted)]">白条还款日</span>
            <span class="text-[var(--ink-primary)] font-semibold">{{ baitiaoCountdown === 0 ? '今日到期' : `${baitiaoCountdown} 天后 (20日)` }}</span>
          </div>
        </template>

        <button
          @click="isCreditModalOpen = true"
          type="button"
          class="px-2.5 py-1 rounded-xs border border-[var(--border-subtle)] hover:border-[var(--ink-primary)] bg-[var(--bg-archive)] text-[var(--ink-secondary)] hover:text-[var(--ink-primary)] transition-colors cursor-pointer flex items-center gap-1"
          title="管理信贷渠道与每月独立还款日"
        >
          <Settings class="w-3 h-3" />
          <span>管理渠道</span>
        </button>
      </div>
    </div>

    <!-- 月度核心收支概览 (Editorial 优雅排版，非粗笨 SaaS 卡片) -->
    <div class="grid grid-cols-1 sm:grid-cols-3 gap-8 pb-12 mb-14 border-b border-[var(--border-subtle)] font-serif-editorial">
      <div class="space-y-1">
        <span class="font-mono-archive text-xs tracking-wider text-[var(--ink-muted)] block">本月支出</span>
        <div class="text-3xl font-medium tracking-tight text-[var(--ink-primary)]">
          ¥{{ formatMoney(summary?.total_expense || 0) }}
        </div>
      </div>

      <div class="space-y-1">
        <span class="font-mono-archive text-xs tracking-wider text-[var(--ink-muted)] block">本月收入</span>
        <div class="text-3xl font-medium tracking-tight text-[var(--accent-moss)]">
          ¥{{ formatMoney(summary?.total_income || 0) }}
        </div>
      </div>

      <div class="space-y-1">
        <span class="font-mono-archive text-xs tracking-wider text-[var(--ink-muted)] block">当月结余</span>
        <div
          class="text-3xl font-medium tracking-tight"
          :class="(summary?.balance || 0) >= 0 ? 'text-[var(--ink-primary)]' : 'text-red-700'"
        >
          {{ (summary?.balance || 0) < 0 ? '-' : '' }}¥{{ formatMoney(Math.abs(summary?.balance || 0)) }}
        </div>
      </div>
    </div>

    <!-- 支出光谱细线条 (Spending Spectrum Bar · Editorial 典雅色带) -->
    <div
      v-if="summary && summary.total_expense > 0 && spectrumItems.length > 0"
      class="pb-10 mb-14 border-b border-[var(--border-subtle)] space-y-4"
    >
      <div class="flex items-center justify-between text-xs font-mono-archive text-[var(--ink-muted)]">
        <span class="tracking-wider">支出光谱分布</span>
        <span>{{ spectrumItems.length }} 个支出类目</span>
      </div>

      <!-- 分段光谱细线 (微小圆角，纯色拼接) -->
      <div class="h-2 w-full rounded-full bg-[var(--bg-subtle)] overflow-hidden flex">
        <div
          v-for="item in spectrumItems"
          :key="item.category"
          :style="{ width: `${item.percentage}%`, backgroundColor: item.color }"
          class="h-full transition-all duration-300 relative group cursor-pointer"
          :title="`${item.category}: ¥${formatMoney(item.amount)} (${item.percentage}%)`"
        ></div>
      </div>

      <!-- 类目图例与占比明细 (点击可按类目聚焦) -->
      <div class="flex flex-wrap items-center gap-x-6 gap-y-2 text-xs font-mono-archive">
        <button
          v-for="item in spectrumItems"
          :key="item.category"
          @click="toggleCategoryFilter(item.category)"
          class="flex items-center gap-2 py-0.5 px-1.5 rounded-xs transition-colors cursor-pointer border"
          :class="selectedCategoryFilter === item.category
            ? 'border-[var(--ink-primary)] bg-[var(--bg-subtle)] text-[var(--ink-primary)] font-semibold'
            : 'border-transparent text-[var(--ink-secondary)] hover:text-[var(--ink-primary)]'"
          :title="selectedCategoryFilter === item.category ? '点击取消类目过滤' : `点击仅看【${item.category}】流水`"
        >
          <span class="w-2 h-2 rounded-full shrink-0" :style="{ backgroundColor: item.color }"></span>
          <span>{{ item.category }}</span>
          <span class="text-[var(--ink-muted)]">{{ item.percentage }}%</span>
          <span class="font-mono-archive text-[var(--ink-primary)]">¥{{ formatMoney(item.amount) }}</span>
        </button>

        <button
          v-if="selectedCategoryFilter"
          @click="selectedCategoryFilter = ''"
          class="text-[11px] text-[var(--accent-warm)] hover-underline cursor-pointer ml-auto"
        >
          清空类目筛选（显示全部）
        </button>
      </div>
    </div>

    <!-- 记账列表 (按日汇聚，Editorial 细线排版) -->
    <div v-if="dayGroups.length === 0" class="py-20 text-center space-y-4">
      <div class="w-12 h-12 rounded-full border border-[var(--border-subtle)] flex items-center justify-center mx-auto text-[var(--ink-muted)]">
        <Wallet class="w-5 h-5" />
      </div>
      <div class="space-y-1 font-serif-editorial">
        <h3 class="text-lg text-[var(--ink-primary)]">这个月还没有记录</h3>
        <p class="text-xs text-[var(--ink-muted)]">
          从一顿具体的饭、一杯咖啡开始，记录日常的收支脚步。
        </p>
      </div>
      <button
        @click="emit('openAdd')"
        class="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-mono-archive border border-[var(--border-subtle)] hover:border-[var(--ink-primary)] rounded-xs cursor-pointer transition-colors"
      >
        <Plus class="w-3.5 h-3.5" />
        <span>添加第一笔账目</span>
      </button>
    </div>

    <div v-else class="space-y-12">
      <section
        v-for="group in dayGroups"
        :key="group.dateStr"
        class="space-y-4"
      >
        <!-- 日期锚点 -->
        <div class="flex items-baseline justify-between border-b border-[var(--border-subtle)] pb-2 text-xs font-mono-archive text-[var(--ink-muted)]">
          <span class="text-sm font-serif-editorial text-[var(--ink-primary)] font-medium">
            {{ group.displayDay }}
          </span>
          <span v-if="group.dayTotalExpense > 0">
            日支出：-¥{{ formatMoney(group.dayTotalExpense) }}
          </span>
        </div>

        <!-- 账目细项 -->
        <div class="divide-y divide-[var(--border-subtle)]/60">
          <div
            v-for="tx in group.items"
            :key="tx.id"
            class="py-3.5 flex items-center justify-between group hover:bg-[var(--bg-subtle)]/40 px-2 rounded-xs transition-colors"
          >
            <div class="space-y-0.5">
              <div class="flex items-center gap-2.5">
                <span class="font-serif-editorial text-base text-[var(--ink-primary)]">
                  {{ tx.title }}
                </span>
                <span class="text-[10px] font-mono-archive tracking-wider text-[var(--ink-muted)] border border-[var(--border-subtle)] px-1.5 py-0.2 rounded-xs">
                  {{ tx.category }}
                </span>
                <span
                  v-if="tx.is_installment"
                  class="text-[10px] font-mono-archive tracking-wider text-[var(--accent-warm)] border border-[var(--accent-warm)]/40 px-1.5 py-0.2 rounded-xs bg-[var(--accent-warm)]/5"
                >
                  {{ tx.installment_channel_code === 'huabei' ? '花呗' : tx.installment_channel_code === 'baitiao' ? '白条' : '分期' }}{{ tx.installment_months ? ' ' + tx.installment_months + '期' : '' }} ({{ tx.repayment_day || 10 }}日)
                </span>
              </div>
              <p v-if="tx.note" class="text-xs font-serif-editorial text-[var(--ink-muted)]">
                {{ tx.note }}
              </p>
            </div>

            <!-- 金额与操作 -->
            <div class="flex items-center gap-4 font-mono-archive text-sm">
              <span
                :class="tx.type === 'expense' ? 'text-[var(--ink-primary)] font-medium' : 'text-[var(--accent-moss)] font-medium'"
              >
                {{ tx.type === 'expense' ? '-' : '+' }}¥{{ formatMoney(tx.amount) }}
              </span>

              <div class="flex sm:hidden sm:group-hover:flex items-center gap-1.5 text-xs text-[var(--ink-muted)]">
                <button
                  @click="startEdit(tx)"
                  class="p-1 hover:text-[var(--ink-primary)] cursor-pointer"
                  title="修改"
                >
                  <Edit2 class="w-3.5 h-3.5" />
                </button>
                <button
                  @click="removeTx(tx.id)"
                  class="p-1 hover:text-red-700 cursor-pointer"
                  title="删除"
                >
                  <Trash2 class="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>

    <!-- 内联编辑模态 (RG-11) -->
    <div
      v-if="editingTx"
      class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/45 backdrop-blur-xs animate-in fade-in duration-200"
      @click.self="editingTx = null"
    >
      <div class="bg-[var(--bg-archive)] border border-[var(--border-subtle)] p-6 rounded-xs w-full max-w-md space-y-4 max-h-[90dvh] overflow-y-auto">
        <div class="flex items-center justify-between pb-2 border-b border-[var(--border-subtle)]">
          <h3 class="font-serif-editorial text-lg font-medium text-[var(--ink-primary)]">
            修改账目
          </h3>
          <button @click="editingTx = null" class="text-[var(--ink-muted)] hover:text-[var(--ink-primary)] cursor-pointer">
            <X class="w-4 h-4" />
          </button>
        </div>

        <div class="space-y-4 text-xs font-mono-archive">
          <!-- 收支类型切换 -->
          <div class="flex items-center gap-2">
            <button
              type="button"
              @click="editType = 'expense'"
              class="flex-1 py-1.5 rounded-xs border text-center transition-all cursor-pointer"
              :class="editType === 'expense'
                ? 'border-[var(--accent-warm)] bg-[var(--accent-warm)] text-white font-medium shadow-xs'
                : 'border-[var(--border-subtle)] text-[var(--ink-muted)] hover:border-[var(--border-divider)]'"
            >
              支出
            </button>
            <button
              type="button"
              @click="editType = 'income'"
              class="flex-1 py-1.5 rounded-xs border text-center transition-all cursor-pointer"
              :class="editType === 'income'
                ? 'border-emerald-700 bg-emerald-700 text-white font-medium shadow-xs'
                : 'border-[var(--border-subtle)] text-[var(--ink-muted)] hover:border-[var(--border-divider)]'"
            >
              收入
            </button>
          </div>

          <!-- 金额与事项名称 -->
          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="block text-[var(--ink-muted)] mb-1">金额 (¥) *</label>
              <input
                v-model="editAmount"
                type="number"
                step="0.01"
                placeholder="0.00"
                class="w-full px-3 py-1.5 text-sm border border-[var(--border-subtle)] rounded-xs outline-none bg-transparent text-[var(--ink-primary)]"
              />
            </div>
            <div>
              <label class="block text-[var(--ink-muted)] mb-1">事项名称 *</label>
              <input
                v-model="editTitle"
                type="text"
                placeholder="例如: 柴米油盐"
                class="w-full px-3 py-1.5 text-sm border border-[var(--border-subtle)] rounded-xs outline-none bg-transparent text-[var(--ink-primary)] font-serif-editorial"
              />
            </div>
          </div>

          <!-- 分类胶囊选择 -->
          <div>
            <label class="block text-[var(--ink-muted)] mb-1.5">分类</label>
            <div class="flex flex-wrap gap-1.5">
              <button
                v-for="cat in categoriesList"
                :key="cat"
                type="button"
                @click="editCategory = cat"
                class="px-2.5 py-1 rounded-xs border text-[11px] transition-all cursor-pointer"
                :class="editCategory === cat
                  ? 'border-[var(--ink-primary)] bg-[var(--ink-primary)] text-[var(--bg-archive)] font-medium shadow-xs'
                  : 'border-[var(--border-subtle)] text-[var(--ink-secondary)] hover:border-[var(--border-divider)]'"
              >
                {{ cat }}
              </button>
            </div>
          </div>

          <!-- 支付方式与发生时间 -->
          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="block text-[var(--ink-muted)] mb-1">支付方式</label>
              <select
                v-model="editPaymentMethod"
                class="w-full px-2.5 py-1.5 text-xs border border-[var(--border-subtle)] rounded-xs outline-none bg-transparent text-[var(--ink-primary)]"
              >
                <option v-for="pm in paymentMethodsList" :key="pm" :value="pm">{{ pm }}</option>
              </select>
            </div>
            <div>
              <label class="block text-[var(--ink-muted)] mb-1">记录时间</label>
              <input
                v-model="editOccurredAt"
                type="datetime-local"
                class="w-full px-2 py-1.5 text-xs border border-[var(--border-subtle)] rounded-xs outline-none bg-transparent text-[var(--ink-primary)]"
              />
            </div>
          </div>

          <!-- 备注 -->
          <div>
            <label class="block text-[var(--ink-muted)] mb-1">备注说明</label>
            <input
              v-model="editNote"
              type="text"
              placeholder="选填备注..."
              class="w-full px-3 py-1.5 text-xs border border-[var(--border-subtle)] rounded-xs outline-none bg-transparent text-[var(--ink-primary)]"
            />
          </div>
        </div>

        <div class="flex items-center justify-end gap-3 pt-3 border-t border-[var(--border-subtle)]">
          <button @click="editingTx = null" class="px-3 py-1.5 text-xs font-mono-archive text-[var(--ink-muted)] hover:text-[var(--ink-primary)] cursor-pointer">
            取消
          </button>
          <button @click="saveEdit" class="px-4 py-1.5 text-xs font-mono-archive bg-[var(--ink-primary)] text-[var(--bg-archive)] rounded-xs cursor-pointer hover:opacity-90">
            保存修改
          </button>
        </div>
      </div>
    </div>

    <!-- 信贷渠道与独立还款日管理抽屉 (FE-15) -->
    <CreditChannelsModal
      v-if="isCreditModalOpen"
      :isOpen="isCreditModalOpen"
      @close="isCreditModalOpen = false"
      @channelsUpdated="loadAssetsOverview"
    />

  </div>
</template>
