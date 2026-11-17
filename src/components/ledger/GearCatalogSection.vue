<script setup lang="ts">
import { computed } from 'vue'
import { ArrowRightLeft, Trash2 } from 'lucide-vue-next'
import type { GearItem } from '../../types'
import { formatMoney } from '../../utils/format'

const props = defineProps<{
  allGearItems: GearItem[]
  gearFilter: 'active' | 'sold' | 'all'
}>()

const emit = defineEmits<{
  (e: 'sellGear', item: GearItem): void
  (e: 'removeGear', item: GearItem): void
}>()

const filteredGearItems = computed<GearItem[]>(() => {
  return props.allGearItems.filter((g) => {
    const isSold = g.status === 'sold'
    if (props.gearFilter === 'active') return !isSold
    if (props.gearFilter === 'sold') return isSold
    return true
  })
})

const calcGearHoldingStats = (item: GearItem) => {
  if (!item.purchase_date) return null
  const start = new Date(item.purchase_date)
  if (isNaN(start.getTime())) return null
  const end = item.status === 'sold' && item.sold_date ? new Date(item.sold_date) : new Date()
  const diffMs = Math.max(0, end.getTime() - start.getTime())
  const days = Math.max(1, Math.ceil(diffMs / (1000 * 60 * 60 * 24)))
  const netCostCents =
    item.status === 'sold'
      ? Math.max(0, (item.price_cents || 0) - (item.sold_price_cents || 0))
      : item.price_cents || 0
  const dailyCents = Math.round(netCostCents / days)
  return {
    days,
    dailyCents,
    netCostCents,
  }
}

const gearHoldingStatsMap = computed<Map<string, { days: number; dailyCents: number; netCostCents: number } | null>>(() => {
  const map = new Map<string, { days: number; dailyCents: number; netCostCents: number } | null>()
  for (const item of props.allGearItems) {
    if (item.id) map.set(item.id, calcGearHoldingStats(item))
  }
  return map
})
</script>

<template>
  <section class="space-y-6">
    <div
      v-if="filteredGearItems.length === 0"
      class="p-12 rounded-xs border border-dashed border-[var(--border-subtle)] bg-[var(--bg-subtle)]/15 text-center space-y-3"
    >
      <p class="font-serif-editorial text-base text-[var(--ink-secondary)]">
        {{ gearFilter === 'sold' ? '尚无转售回血的设备记录' : '固定资产设备库暂无在役单品' }}
      </p>
      <p class="font-mono-archive text-xs text-[var(--ink-muted)]">
        可录入新设备或在达成心愿时沉淀至固定资产库。
      </p>
    </div>

    <div v-else class="grid grid-cols-1 md:grid-cols-2 gap-5">
      <article
        v-for="(gear, idx) in filteredGearItems"
        :key="gear.id || gear.name"
        class="p-5 sm:p-6 rounded-xs border border-[var(--border-subtle)] bg-[var(--bg-subtle)]/30 hover:border-[var(--border-divider)] transition-all flex flex-col justify-between gap-4 group"
      >
        <div class="flex items-center justify-between gap-3 text-[11px] font-mono-archive">
          <div class="flex items-center gap-2 min-w-0">
            <span class="text-[var(--ink-muted)] shrink-0">NO. {{ String(idx + 1).padStart(2, '0') }}</span>
            <span class="text-[var(--border-divider)] shrink-0">/</span>
            <span class="text-[var(--ink-secondary)] truncate">{{ gear.category || '固定资产' }}</span>
            <span
              v-if="gear.status === 'sold'"
              class="vermilion-seal px-1.5 py-0.2 text-[11px] shrink-0 font-mono-archive"
            >
              已回血
            </span>
            <span
              v-else
              class="px-1.5 py-0.5 rounded-xs text-[11px] shrink-0 border bg-emerald-900/10 text-[var(--accent-moss)] border-[var(--accent-moss)]/30 font-mono-archive"
            >
              在役自用
            </span>
          </div>

          <div class="flex items-center gap-2 shrink-0">
            <button
              v-if="gear.status !== 'sold' && gear.id"
              type="button"
              @click="emit('sellGear', gear)"
              class="px-2.5 py-1 text-[11px] rounded-xs border border-[var(--border-subtle)] hover:border-[var(--ink-primary)] bg-[var(--bg-archive)] text-[var(--ink-secondary)] hover:text-[var(--ink-primary)] transition-colors cursor-pointer inline-flex items-center gap-1 whitespace-nowrap shrink-0"
              title="转售出二手"
            >
              <ArrowRightLeft class="w-3 h-3 shrink-0" />
              <span>出二手回血</span>
            </button>
            <button
              v-if="gear.id"
              type="button"
              @click="emit('removeGear', gear)"
              class="p-1 text-[var(--ink-muted)] hover:text-red-700 transition-colors cursor-pointer shrink-0"
              title="移除设备"
            >
              <Trash2 class="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        <div class="space-y-1.5">
          <div class="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h3 class="font-serif-editorial text-xl font-medium text-[var(--ink-primary)] tracking-tight">
              {{ gear.name }}
            </h3>
            <span v-if="gear.spec" class="font-mono-archive text-xs text-[var(--ink-muted)]">
              {{ gear.spec }}
            </span>
          </div>
          <p v-if="gear.note" class="font-serif-editorial text-sm text-[var(--ink-secondary)] italic leading-relaxed">
            “{{ gear.note }}”
          </p>
        </div>

        <div class="pt-3.5 border-t border-[var(--border-subtle)]/70 grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4 font-mono-archive text-xs">
          <div class="space-y-0.5">
            <span class="block text-[11px] text-[var(--ink-muted)]">购入原值</span>
            <span class="font-serif-editorial text-base font-medium text-[var(--ink-primary)]">
              ¥{{ formatMoney(gear.price_cents || 0) }}
            </span>
          </div>

          <div class="space-y-0.5">
            <span class="block text-[11px] text-[var(--ink-muted)]">
              {{ gear.purchase_date ? `购于 ${gear.purchase_date}` : '服役时长' }}
            </span>
            <span class="font-serif-editorial text-base font-medium text-[var(--ink-primary)]">
              <template v-if="gearHoldingStatsMap.get(gear.id || '')">
                {{ gearHoldingStatsMap.get(gear.id || '')?.days }} 天
              </template>
              <template v-else>—</template>
            </span>
          </div>

          <div class="space-y-0.5">
            <template v-if="gear.status === 'sold' && gear.sold_price_cents">
              <span class="block text-[11px] text-[var(--ink-muted)]">二手回血</span>
              <span class="font-serif-editorial text-base font-medium text-[var(--accent-moss)]">
                +¥{{ formatMoney(gear.sold_price_cents) }}
              </span>
            </template>
            <template v-else>
              <span class="block text-[11px] text-[var(--ink-muted)]">日均持有成本</span>
              <span class="font-serif-editorial text-base font-medium text-[var(--ink-primary)]">
                <template v-if="gearHoldingStatsMap.get(gear.id || '')">
                  ¥{{ formatMoney(gearHoldingStatsMap.get(gear.id || '')?.dailyCents || 0) }}<span class="text-[11px] font-normal text-[var(--ink-muted)]">/天</span>
                </template>
                <template v-else>—</template>
              </span>
            </template>
          </div>
        </div>
      </article>
    </div>
  </section>
</template>
