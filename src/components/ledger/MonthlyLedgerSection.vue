<script setup lang="ts">
import { ref, computed } from 'vue'
import { Edit2, Plus, Trash2, Wallet } from 'lucide-vue-next'
import type { Transaction, TransactionSummary } from '../../types'
import { formatMoney, parseOccurredDate } from '../../utils/format'

const props = defineProps<{
  year: number
  month: number
  summary: TransactionSummary | null
  transactionsList: Transaction[]
  isLoading: boolean
}>()

const emit = defineEmits<{
  (e: 'openAdd'): void
  (e: 'editTransaction', tx: Transaction): void
  (e: 'deleteTransaction', id: number): void
}>()

const selectedCategoryFilter = ref<string>('')

const toggleCategoryFilter = (cat: string) => {
  selectedCategoryFilter.value = selectedCategoryFilter.value === cat ? '' : cat
}

const CATEGORY_COLORS: Record<string, string> = {
  餐饮: '#a24f2b',
  交通: '#4a6b82',
  购物: '#8c6d46',
  数码器材: '#3a5a6b',
  娱乐: '#7a5980',
  住房: '#3f5a4a',
  学习: '#5c6773',
  医疗: '#b35c5c',
  旅行度假: '#b57c3c',
  其他: '#8a857b',
}

const FALLBACK_PALETTE = ['#6b7b5c', '#9c6644', '#586f7c', '#7f5539', '#6d597a', '#b56576', '#4a5759']

const getCategoryColor = (cat: string) => {
  if (CATEGORY_COLORS[cat]) return CATEGORY_COLORS[cat]
  let hash = 0
  for (let i = 0; i < cat.length; i++) {
    hash = (hash * 31 + cat.charCodeAt(i)) >>> 0
  }
  return FALLBACK_PALETTE[hash % FALLBACK_PALETTE.length]
}

const spectrumItems = computed(() => {
  if (!props.summary || !props.summary.total_expense || props.summary.total_expense <= 0) return []
  const breakdown = props.summary.category_breakdown || {}
  const total = props.summary.total_expense
  return Object.entries(breakdown)
    .filter(([_, amt]) => amt > 0)
    .map(([cat, amt]) => ({
      category: cat,
      amount: amt,
      percentage: Math.round((amt / total) * 1000) / 10,
      color: getCategoryColor(cat),
    }))
    .sort((a, b) => b.amount - a.amount)
})

interface DayGroup {
  dateStr: string
  displayDay: string
  items: Transaction[]
  dayTotalExpense: number
}

const dayGroups = computed(() => {
  const map = new Map<string, Transaction[]>()
  const listToGroup = selectedCategoryFilter.value
    ? props.transactionsList.filter((t) => t.category === selectedCategoryFilter.value)
    : props.transactionsList

  listToGroup.forEach((tx) => {
    const { month, day, year } = parseOccurredDate(tx.occurred_at)
    const key = tx.occurred_at ? `${Number(month)}月${Number(day)}日` : '近期'
    const list = map.get(`${year}-${key}`) || []
    list.push(tx)
    map.set(`${year}-${key}`, list)
  })

  const groups: DayGroup[] = []
  map.forEach((items, displayDay) => {
    let dayTotal = 0
    items.forEach((it) => {
      if (it.type === 'expense') dayTotal += it.amount
    })
    const label = displayDay.split('-').slice(1).join('-')
    groups.push({
      dateStr: label,
      displayDay: label,
      items,
      dayTotalExpense: dayTotal,
    })
  })

  return groups
})
</script>

<template>
  <section class="space-y-8">
    <!-- 框体化月度核心收支三联表 + 支出光谱分布 -->
    <div class="rounded-xs border border-[var(--border-subtle)] bg-[var(--bg-subtle)]/20 overflow-hidden">
      <div class="grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-[var(--border-subtle)] font-serif-editorial">
        <div class="p-5 sm:p-6 space-y-1">
          <span class="font-mono-archive text-xs tracking-wider text-[var(--ink-muted)] block">
            {{ month }} 月支出合计
          </span>
          <div class="text-2xl sm:text-3xl font-medium tracking-tight text-[var(--ink-primary)]">
            ¥{{ formatMoney(summary?.total_expense || 0) }}
          </div>
        </div>

        <div class="p-5 sm:p-6 space-y-1">
          <span class="font-mono-archive text-xs tracking-wider text-[var(--ink-muted)] block">
            {{ month }} 月收入合计
          </span>
          <div class="text-2xl sm:text-3xl font-medium tracking-tight text-[var(--accent-moss)]">
            ¥{{ formatMoney(summary?.total_income || 0) }}
          </div>
        </div>

        <div class="p-5 sm:p-6 space-y-1">
          <span class="font-mono-archive text-xs tracking-wider text-[var(--ink-muted)] block">
            当月净结余
          </span>
          <div
            class="text-2xl sm:text-3xl font-medium tracking-tight"
            :class="(summary?.balance || 0) >= 0 ? 'text-[var(--ink-primary)]' : 'text-red-700'"
          >
            {{ (summary?.balance || 0) < 0 ? '-' : '' }}¥{{ formatMoney(Math.abs(summary?.balance || 0)) }}
          </div>
        </div>
      </div>

      <!-- 支出光谱细线条 -->
      <div
        class="p-5 sm:p-6 border-t border-[var(--border-subtle)] bg-[var(--bg-archive)]/50 space-y-3.5 min-h-[160px] transition-opacity"
        :class="summary && summary.total_expense > 0 && spectrumItems.length > 0 ? '' : 'opacity-0 pointer-events-none'"
      >
        <div class="flex items-center justify-between text-xs font-mono-archive text-[var(--ink-muted)]">
          <span class="tracking-wider">支出类目分布</span>
          <span>{{ spectrumItems.length }} 个支出类目</span>
        </div>

        <div class="h-2 w-full rounded-full bg-[var(--bg-subtle)] overflow-hidden flex">
          <div
            v-for="item in spectrumItems"
            :key="item.category"
            :style="{ width: `${item.percentage}%`, backgroundColor: item.color }"
            class="h-full transition-all duration-300 relative group cursor-pointer"
            :title="`${item.category}: ¥${formatMoney(item.amount)} (${item.percentage}%)`"
          ></div>
        </div>

        <div class="flex items-center gap-x-5 overflow-x-auto whitespace-nowrap text-xs font-mono-archive min-h-[26px]">
          <button
            v-for="item in spectrumItems"
            :key="item.category"
            type="button"
            @click="toggleCategoryFilter(item.category)"
            class="flex items-center gap-2 py-0.5 px-1.5 rounded-xs transition-colors cursor-pointer border shrink-0"
            :class="selectedCategoryFilter === item.category
              ? 'border-[var(--ink-primary)] bg-[var(--bg-subtle)] text-[var(--ink-primary)] font-semibold'
              : 'border-transparent text-[var(--ink-secondary)] hover:text-[var(--ink-primary)]'"
          >
            <span class="w-2 h-2 rounded-full shrink-0" :style="{ backgroundColor: item.color }"></span>
            <span>{{ item.category }}</span>
            <span class="text-[var(--ink-muted)]">{{ item.percentage }}%</span>
            <span class="font-mono-archive text-[var(--ink-primary)]">¥{{ formatMoney(item.amount) }}</span>
          </button>

          <button
            type="button"
            @click="selectedCategoryFilter = ''"
            :disabled="!selectedCategoryFilter"
            class="text-[11px] text-[var(--accent-warm)] hover-underline cursor-pointer ml-auto shrink-0 transition-opacity"
            :class="selectedCategoryFilter ? '' : 'opacity-0 pointer-events-none'"
          >
            清空类目筛选（显示全部）
          </button>
        </div>
      </div>
    </div>

    <!-- 记账列表 (按日汇聚) -->
    <div v-if="isLoading" class="min-h-[320px] space-y-4 animate-pulse" aria-hidden="true">
      <div class="h-3 w-28 rounded-xs bg-[var(--bg-subtle)]"></div>
      <div class="h-10 rounded-xs bg-[var(--bg-subtle)]"></div>
      <div class="h-10 rounded-xs bg-[var(--bg-subtle)]"></div>
      <div class="h-10 rounded-xs bg-[var(--bg-subtle)]"></div>
    </div>

    <div
      v-else-if="dayGroups.length === 0"
      class="min-h-[320px] px-6 rounded-xs border border-dashed border-[var(--border-subtle)] bg-[var(--bg-subtle)]/15 text-center flex flex-col items-center justify-center space-y-4"
    >
      <div class="w-10 h-10 rounded-full border border-[var(--border-subtle)] flex items-center justify-center mx-auto text-[var(--ink-muted)]">
        <Wallet class="w-4 h-4" />
      </div>
      <div class="space-y-1 font-serif-editorial">
        <h3 class="text-base text-[var(--ink-primary)]">{{ year }} 年 {{ month }} 月尚无收支流水</h3>
        <p class="text-xs text-[var(--ink-muted)]">
          从一顿具体的餐食、一件器物或一笔回血开始，记录真实的资产变动。
        </p>
      </div>
      <button
        type="button"
        @click="emit('openAdd')"
        class="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-mono-archive border border-[var(--border-subtle)] hover:border-[var(--ink-primary)] rounded-xs cursor-pointer transition-colors"
      >
        <Plus class="w-3.5 h-3.5" />
        <span>添加本月第一笔账目</span>
      </button>
    </div>

    <div v-else class="space-y-8 min-h-[320px]">
      <section
        v-for="group in dayGroups"
        :key="group.dateStr"
        class="space-y-2"
      >
        <div class="flex items-baseline justify-between border-b-2 border-double border-[var(--border-divider)] pb-1.5 text-xs font-mono-archive text-[var(--ink-muted)]">
          <div class="flex items-center gap-2">
            <span class="w-1.5 h-1.5 rounded-full bg-[var(--accent-warm)]"></span>
            <span class="text-sm font-serif-editorial text-[var(--ink-primary)] font-medium tracking-wide">
              {{ group.displayDay }}
            </span>
          </div>
          <span v-if="group.dayTotalExpense > 0" class="tracking-wide">
            支出小计：<span class="text-[var(--ink-primary)] font-medium tabular-nums">-¥{{ formatMoney(group.dayTotalExpense) }}</span>
          </span>
        </div>

        <div class="divide-y divide-[var(--border-subtle)]/50">
          <div
            v-for="tx in group.items"
            :key="tx.id"
            class="py-2.5 flex items-center justify-between group hover:bg-[var(--bg-subtle)]/40 px-2 rounded-xs transition-colors"
          >
            <div class="flex items-center gap-2.5 min-w-0 flex-1 mr-3">
              <span class="text-[11px] font-mono-archive tracking-wider text-[var(--ink-muted)] border border-[var(--border-subtle)] bg-[var(--bg-archive)] px-1.5 py-0.5 rounded-xs shrink-0 select-none">
                {{ tx.category }}
              </span>
              <span class="font-serif-editorial text-sm sm:text-base text-[var(--ink-primary)] truncate">
                {{ tx.title }}
              </span>
              <span
                v-if="tx.is_installment"
                class="text-[11px] font-mono-archive tracking-wider text-[var(--accent-warm)] border border-[var(--accent-warm)]/40 px-1.5 py-0.2 rounded-xs bg-[var(--accent-warm)]/5 shrink-0 select-none"
              >
                分期
              </span>
              <span v-if="tx.payment_method" class="text-[11px] font-mono-archive text-[var(--ink-muted)] hidden lg:inline shrink-0">
                [{{ tx.payment_method }}]
              </span>
              <span v-if="tx.note" class="text-xs font-serif-editorial text-[var(--ink-muted)] truncate hidden md:inline">
                — {{ tx.note }}
              </span>
              <div class="dot-leader hidden sm:block"></div>
            </div>

            <div class="flex items-center gap-3 font-mono-archive text-sm shrink-0">
              <span
                class="tabular-nums font-medium"
                :class="tx.type === 'expense' ? 'text-[var(--ink-primary)]' : 'text-[var(--accent-moss)]'"
              >
                {{ tx.type === 'expense' ? '-' : '+' }}¥{{ formatMoney(tx.amount) }}
              </span>

              <div class="flex items-center gap-1.5 text-xs text-[var(--ink-muted)] opacity-0 group-hover:opacity-100 pointer-events-none group-hover:pointer-events-auto transition-opacity">
                <button
                  type="button"
                  @click="emit('editTransaction', tx)"
                  class="p-1 hover:text-[var(--ink-primary)] cursor-pointer transition-colors"
                  title="修改账目"
                >
                  <Edit2 class="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  @click="emit('deleteTransaction', tx.id)"
                  class="p-1 hover:text-red-700 cursor-pointer transition-colors"
                  title="删除账目"
                >
                  <Trash2 class="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  </section>
</template>
