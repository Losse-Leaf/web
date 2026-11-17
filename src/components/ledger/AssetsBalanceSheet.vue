<script setup lang="ts">
import { ref, computed } from 'vue'
import { Settings } from 'lucide-vue-next'
import { updateInitialLiquidBalance } from '../../utils/api'
import type {
  AssetsOverview,
  CreditChannel,
  GearItem,
  Transaction,
  TransactionSummary,
} from '../../types'
import {
  centsToInputYuan,
  formatMoney,
  getBeijingNow,
  parseYuanToCents,
} from '../../utils/format'

const props = defineProps<{
  assetsOverview: AssetsOverview | null
  summary: TransactionSummary | null
  transactionsList: Transaction[]
  allGearItems: GearItem[]
  creditChannels: CreditChannel[]
  activeSubTab: 'ledger' | 'gear'
}>()

const emit = defineEmits<{
  (e: 'update:activeSubTab', tab: 'ledger' | 'gear'): void
  (e: 'openCreditModal'): void
  (e: 'editTransaction', tx: Transaction): void
  (e: 'liquidBalanceSaved'): void
}>()

const isEditingLiquidBalance = ref(false)
const liquidBalanceInput = ref('')
const isSavingLiquidBalance = ref(false)

const openEditLiquidBalance = () => {
  const currentInitial = props.assetsOverview?.initial_liquid_balance ?? 0
  liquidBalanceInput.value = centsToInputYuan(currentInitial)
  isEditingLiquidBalance.value = true
}

const saveInitialLiquidBalance = async () => {
  const parsed = parseYuanToCents(liquidBalanceInput.value, {
    allowEmpty: true,
    allowZero: true,
    allowNegative: true,
    fieldLabel: '流动资金底数',
  })
  if (!parsed.ok) return
  try {
    isSavingLiquidBalance.value = true
    await updateInitialLiquidBalance(parsed.cents)
    isEditingLiquidBalance.value = false
    emit('liquidBalanceSaved')
  } catch (err) {
    console.error('Failed to update initial liquid balance:', err)
  } finally {
    isSavingLiquidBalance.value = false
  }
}

const totalFixedAssets = computed(() => {
  return props.allGearItems
    .filter((g) => g.status !== 'sold')
    .reduce((sum, g) => sum + (g.price_cents || 0), 0)
})

const activeGearCount = computed(() => {
  return props.allGearItems.filter((g) => g.status !== 'sold').length
})

const calcInstallmentRemainingDebt = (tx: Transaction): number => {
  const total = tx.installment_total_amount || tx.amount || 0
  const months = tx.installment_months || 12
  const remain = tx.installment_remain_months ?? months
  if (remain <= 0) return 0
  if (remain >= months) return total
  const paidMonths = months - remain
  const monthlyPay = tx.installment_monthly_pay || Math.floor(total / months)
  return Math.max(0, total - paidMonths * monthlyPay)
}

const calcInstallmentPeriodAmount = (tx: Transaction): number => {
  const total = tx.installment_total_amount || tx.amount || 0
  const months = tx.installment_months || 0
  const monthlyPay = tx.installment_monthly_pay || (months > 0 ? Math.floor(total / months) : 0)
  const remain = tx.installment_remain_months ?? months
  if (months > 0 && remain === 1) {
    return Math.max(0, total - (months - 1) * monthlyPay)
  }
  return monthlyPay
}

const totalInstallmentLiabilities = computed(() => {
  return props.transactionsList
    .filter((t) => t.is_installment)
    .reduce((sum, t) => sum + calcInstallmentRemainingDebt(t), 0)
})

const estimatedNetWorth = computed(() => {
  const balance = props.summary?.balance || 0
  return totalFixedAssets.value + balance - totalInstallmentLiabilities.value
})

const liquidBalanceDisplay = computed(() => {
  return props.assetsOverview?.liquid_balance ?? props.summary?.balance ?? 0
})

const activeInstallmentsList = computed(() => {
  if (props.assetsOverview?.channel_liabilities) {
    const items: Array<{ tx: Transaction; channelName: string; channelColor?: string }> = []
    for (const ch of props.assetsOverview.channel_liabilities) {
      for (const tx of ch.installments || []) {
        items.push({
          tx,
          channelName: ch.channel_name,
          channelColor: ch.color,
        })
      }
    }
    return items
  }
  return props.transactionsList
    .filter((t) => t.is_installment && (t.installment_remain_months ?? 1) > 0)
    .map((tx) => ({
      tx,
      channelName:
        props.creditChannels.find((c) => c.code === tx.installment_channel_code)?.name ||
        tx.installment_channel_code ||
        '信贷分期',
      channelColor: undefined,
    }))
})

const getDaysUntilDay = (targetDay: number) => {
  const now = getBeijingNow()
  const y = now.getUTCFullYear()
  const m = now.getUTCMonth()
  const d = now.getUTCDate()
  if (d <= targetDay) {
    return targetDay - d
  }
  const nextMonth = Date.UTC(y, m + 1, targetDay)
  const todayUtc = Date.UTC(y, m, d)
  return Math.ceil((nextMonth - todayUtc) / (1000 * 60 * 60 * 24))
}

const huabeiCountdown = computed(() => getDaysUntilDay(10))
const baitiaoCountdown = computed(() => getDaysUntilDay(20))
</script>

<template>
  <section class="rounded-xs border border-[var(--border-subtle)] bg-[var(--bg-subtle)]/25 overflow-hidden">
    <!-- 四列核心资产指标网格 -->
    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-[var(--border-subtle)]">
      <!-- 01 个人净资产 -->
      <div class="p-5 sm:p-6 space-y-2">
        <div class="flex items-center justify-between text-[11px] font-mono-archive text-[var(--ink-muted)]">
          <span>01 · 个人净资产</span>
          <span class="text-[11px]">实时核算</span>
        </div>
        <div class="font-serif-editorial text-2xl sm:text-3xl font-semibold tracking-tight text-[var(--ink-primary)]">
          {{ (assetsOverview?.net_worth ?? estimatedNetWorth) < 0 ? '-' : '' }}¥{{ formatMoney(Math.abs(assetsOverview?.net_worth ?? estimatedNetWorth)) }}
        </div>
        <p class="text-[11px] font-mono-archive text-[var(--ink-muted)]">
          流动资金 + 固资 − 待还负债
        </p>
      </div>

      <!-- 02 流动资金池 -->
      <div
        @click="!isEditingLiquidBalance && emit('update:activeSubTab', 'ledger')"
        class="p-5 sm:p-6 space-y-2 transition-colors cursor-pointer"
        :class="activeSubTab === 'ledger' ? 'bg-[var(--bg-archive)]/60' : 'hover:bg-[var(--bg-subtle)]/40'"
      >
        <div class="flex items-center justify-between text-[11px] font-mono-archive text-[var(--ink-muted)]">
          <span>02 · 流动资金池</span>
          <button
            v-if="!isEditingLiquidBalance"
            @click.stop="openEditLiquidBalance"
            type="button"
            class="text-[11px] text-[var(--ink-secondary)] hover:text-[var(--ink-primary)] underline underline-offset-2 cursor-pointer transition-colors"
          >
            校准底数
          </button>
        </div>

        <div
          v-if="!isEditingLiquidBalance"
          class="min-h-[36px] flex items-center font-serif-editorial text-2xl sm:text-3xl font-medium tracking-tight tabular-nums"
          :class="liquidBalanceDisplay >= 0 ? 'text-[var(--ink-primary)]' : 'text-red-700'"
        >
          {{ liquidBalanceDisplay < 0 ? '-' : '' }}¥{{ formatMoney(Math.abs(liquidBalanceDisplay)) }}
        </div>

        <div v-else @click.stop class="min-h-[36px] flex items-center gap-1.5 font-mono-archive">
          <span class="text-xs text-[var(--ink-muted)]">¥</span>
          <input
            v-model="liquidBalanceInput"
            type="number"
            step="0.01"
            placeholder="0.00"
            class="w-24 px-2 py-1 text-xs bg-[var(--bg-archive)] border border-[var(--border-subtle)] focus:border-[var(--ink-primary)] rounded-xs outline-none text-[var(--ink-primary)]"
          />
          <button
            @click="saveInitialLiquidBalance"
            type="button"
            :disabled="isSavingLiquidBalance"
            class="px-2 py-1 text-[11px] bg-[var(--ink-primary)] text-[var(--bg-archive)] rounded-xs cursor-pointer hover:opacity-90 shrink-0"
          >
            保存
          </button>
          <button
            @click="isEditingLiquidBalance = false"
            type="button"
            class="px-1.5 py-1 text-[11px] text-[var(--ink-muted)] hover:text-[var(--ink-primary)] cursor-pointer shrink-0"
          >
            取消
          </button>
        </div>

        <p class="text-[11px] font-mono-archive text-[var(--ink-muted)] truncate">
          <template v-if="assetsOverview?.initial_liquid_balance">
            初始底数 ¥{{ formatMoney(assetsOverview.initial_liquid_balance) }}
          </template>
          <template v-else>
            储蓄底数与日常收支结余
          </template>
        </p>
      </div>

      <!-- 03 固定资产沉淀 -->
      <div
        @click="emit('update:activeSubTab', 'gear')"
        class="p-5 sm:p-6 space-y-2 transition-colors cursor-pointer"
        :class="activeSubTab === 'gear' ? 'bg-[var(--bg-archive)]/60' : 'hover:bg-[var(--bg-subtle)]/40'"
      >
        <div class="flex items-center justify-between text-[11px] font-mono-archive text-[var(--ink-muted)]">
          <span>03 · 固定资产沉淀</span>
          <span>{{ assetsOverview?.gear_summary?.active_count ?? activeGearCount }} 件在役</span>
        </div>
        <div class="font-serif-editorial text-2xl sm:text-3xl font-medium tracking-tight text-[var(--ink-primary)]">
          ¥{{ formatMoney(assetsOverview?.fixed_assets ?? totalFixedAssets) }}
        </div>
        <p class="text-[11px] font-mono-archive text-[var(--ink-muted)]">
          <template v-if="(assetsOverview?.gear_summary?.sold_recovered_value ?? 0) > 0">
            累计二手回血 +¥{{ formatMoney(assetsOverview?.gear_summary?.sold_recovered_value || 0) }}
          </template>
          <template v-else>
            在用生产力设备
          </template>
        </p>
      </div>

      <!-- 04 待还信贷分期 -->
      <div class="p-5 sm:p-6 space-y-2">
        <div class="flex items-center justify-between text-[11px] font-mono-archive text-[var(--ink-muted)]">
          <span>04 · 待还信贷分期</span>
          <span>{{ activeInstallmentsList.length }} 笔在还</span>
        </div>
        <div
          class="font-serif-editorial text-2xl sm:text-3xl font-medium tracking-tight"
          :class="(assetsOverview?.total_liabilities ?? totalInstallmentLiabilities) > 0 ? 'text-[var(--accent-warm)]' : 'text-[var(--ink-primary)]'"
        >
          {{ (assetsOverview?.total_liabilities ?? totalInstallmentLiabilities) > 0 ? '-' : '' }}¥{{ formatMoney(assetsOverview?.total_liabilities ?? totalInstallmentLiabilities) }}
        </div>
        <p class="text-[11px] font-mono-archive text-[var(--ink-muted)]">
          <template v-if="(assetsOverview?.monthly_liabilities ?? 0) > 0">
            月供合计 ¥{{ formatMoney(assetsOverview?.monthly_liabilities || 0) }} / 月
          </template>
          <template v-else>
            当前无待还分期负债
          </template>
        </p>
      </div>
    </div>

    <!-- 信贷渠道倒计时底栏 -->
    <div class="px-5 sm:px-6 py-3 border-t border-[var(--border-subtle)] bg-[var(--bg-subtle)]/45 flex flex-wrap items-center justify-between gap-3 font-mono-archive text-xs">
      <div class="flex flex-wrap items-center gap-2.5">
        <span class="text-[11px] text-[var(--ink-muted)] mr-1">信贷还款日历</span>
        <template v-if="assetsOverview?.channel_liabilities && assetsOverview.channel_liabilities.length > 0">
          <div
            v-for="ch in assetsOverview.channel_liabilities"
            :key="ch.channel_code"
            class="px-2.5 py-1 rounded-xs border border-[var(--border-subtle)] bg-[var(--bg-archive)] inline-flex items-center gap-2 text-[11px]"
          >
            <span class="w-1.5 h-1.5 rounded-full shrink-0" :style="{ backgroundColor: ch.color || 'var(--accent-warm)' }" />
            <span class="text-[var(--ink-secondary)]">{{ ch.channel_name }}</span>
            <span class="text-[var(--ink-primary)] font-medium">
              {{ ch.days_until_repayment === 0 ? '今日还款' : `${ch.days_until_repayment} 天后 (每月${ch.repayment_day}日)` }}
            </span>
            <span v-if="ch.total_debt > 0" class="text-[var(--accent-warm)] border-l border-[var(--border-subtle)] pl-2">
              待还 ¥{{ formatMoney(ch.total_debt) }}
            </span>
          </div>
        </template>
        <template v-else>
          <div class="px-2.5 py-1 rounded-xs border border-[var(--border-subtle)] bg-[var(--bg-archive)] inline-flex items-center gap-2 text-[11px]">
            <span class="w-1.5 h-1.5 rounded-full bg-[var(--accent-warm)]" />
            <span class="text-[var(--ink-secondary)]">花呗</span>
            <span class="text-[var(--ink-primary)] font-medium">{{ huabeiCountdown === 0 ? '今日到期' : `${huabeiCountdown} 天后 (每月10日)` }}</span>
          </div>
          <div class="px-2.5 py-1 rounded-xs border border-[var(--border-subtle)] bg-[var(--bg-archive)] inline-flex items-center gap-2 text-[11px]">
            <span class="w-1.5 h-1.5 rounded-full bg-[var(--accent-vermilion)]" />
            <span class="text-[var(--ink-secondary)]">京东白条</span>
            <span class="text-[var(--ink-primary)] font-medium">{{ baitiaoCountdown === 0 ? '今日到期' : `${baitiaoCountdown} 天后 (每月20日)` }}</span>
          </div>
        </template>
      </div>

      <button
        @click="emit('openCreditModal')"
        type="button"
        class="px-2.5 py-1 rounded-xs border border-[var(--border-subtle)] hover:border-[var(--ink-primary)] bg-[var(--bg-archive)] text-[var(--ink-secondary)] hover:text-[var(--ink-primary)] transition-colors cursor-pointer inline-flex items-center gap-1.5 text-[11px] shrink-0"
      >
        <Settings class="w-3 h-3" />
        <span>管理信贷渠道</span>
      </button>
    </div>

    <!-- 内嵌式在还分期进度明细条 -->
    <div
      v-if="activeInstallmentsList.length > 0"
      class="divide-y divide-[var(--border-subtle)]/60 border-t border-[var(--border-subtle)] bg-[var(--bg-archive)]/60"
    >
      <div
        v-for="item in activeInstallmentsList"
        :key="item.tx.id"
        class="px-5 sm:px-6 py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs font-mono-archive hover:bg-[var(--bg-subtle)]/35 transition-colors"
      >
        <div class="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span class="px-1.5 py-0.5 text-[11px] rounded-xs border border-[var(--accent-warm)]/35 text-[var(--accent-warm)] bg-[var(--accent-warm)]/5 shrink-0">
            {{ item.channelName }} · 每月 {{ item.tx.repayment_day || 10 }} 日
          </span>
          <span class="font-serif-editorial text-sm font-medium text-[var(--ink-primary)]">
            {{ item.tx.title }}
          </span>
          <span class="text-[11px] text-[var(--ink-muted)]">
            总额 ¥{{ formatMoney(item.tx.installment_total_amount || item.tx.amount) }} · 每期 ¥{{ formatMoney(calcInstallmentPeriodAmount(item.tx)) }}
          </span>
        </div>

        <div class="flex items-center justify-between sm:justify-end gap-4 shrink-0">
          <div class="flex items-center gap-2.5">
            <div class="w-20 h-1.5 rounded-full bg-[var(--border-subtle)] overflow-hidden hidden sm:block">
              <div
                class="h-full bg-[var(--accent-warm)] transition-all duration-300"
                :style="{
                  width: `${Math.min(100, Math.max(5, Math.round((((item.tx.installment_months || 12) - (item.tx.installment_remain_months || 0)) / (item.tx.installment_months || 12)) * 100)))}%`,
                }"
              />
            </div>
            <span class="text-[11px] text-[var(--ink-secondary)] whitespace-nowrap">
              已还 {{ (item.tx.installment_months || 12) - (item.tx.installment_remain_months || 0) }}/{{ item.tx.installment_months || 12 }} 期 · 剩 {{ item.tx.installment_remain_months }} 期
            </span>
          </div>

          <div class="flex items-center gap-2.5">
            <span class="text-sm font-serif-editorial font-semibold text-[var(--accent-warm)] whitespace-nowrap">
              待还 ¥{{ formatMoney(calcInstallmentRemainingDebt(item.tx)) }}
            </span>
            <button
              type="button"
              @click="emit('editTransaction', item.tx)"
              class="px-2 py-0.5 text-[11px] rounded-xs border border-[var(--border-subtle)] hover:border-[var(--ink-primary)] text-[var(--ink-secondary)] hover:text-[var(--ink-primary)] cursor-pointer transition-colors whitespace-nowrap shrink-0"
            >
              校准期数
            </button>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>
