<script setup lang="ts">
import { ref, computed, watch, defineAsyncComponent } from 'vue'
import { BookOpen } from 'lucide-vue-next'
import type { LifeEntry } from '../types'
import { parseOccurredDate, getBeijingYear } from '../utils/format'
import { fetchEntries } from '../utils/api'

const AlmanacModal = defineAsyncComponent(() => import('./AlmanacModal.vue'))

const props = defineProps<{
  entries: LifeEntry[]
  refreshKey?: number
}>()

const emit = defineEmits<{
  (e: 'selectEntry', item: LifeEntry): void
}>()

const currentYearStr = String(getBeijingYear())
const selectedYear = ref(currentYearStr)
const isAlmanacOpen = ref(false)

// WEB-7：归档页直接复用 App 已经拉全的 props.entries，按年派生分组。
// 原先这里会再按年串行翻一遍所有页 —— 时间流刚拉过 7 页，归档页又拉一遍，
// 属于纯重复流量。只有「某年确实不在内存里」时才补拉，并按年缓存。
const fetchedYearEntries = ref<Record<string, LifeEntry[]>>({})
const inFlightYears = new Set<string>()
let yearAbort: AbortController | null = null

const loadAllEntriesForYear = async (yr: string) => {
  if (!yr || inFlightYears.has(yr)) return
  // 内存里已有这一年的记录（App 的全量列表已覆盖），不再回源；
  // 已经补拉并在 fetchedYearEntries 中缓存的年份也不再回源。
  const hasLocalYear = props.entries.some(
    (e) => parseOccurredDate(e.occurred_at).year === yr,
  )
  if (hasLocalYear || fetchedYearEntries.value[yr]) return

  inFlightYears.add(yr)
  // 同一年的多页必须共享一个 AbortSignal：
  // fetchEntries 在不传 signal 时会按 scope 互相 abort（同一 scope = year:<yr>），
  // 4 路并发会变成「后一页取消前一页」，结果全是 null，年份永远补不回来。
  yearAbort?.abort()
  const controller = new AbortController()
  yearAbort = controller
  try {
    const collected: LifeEntry[] = []
    let page = 1
    let done = false
    // 补拉也走 4 路有界并发，保持页序。
    while (page <= 50 && !done) {
      const batch: number[] = []
      for (let p = page; p < page + 4 && p <= 50; p++) batch.push(p)
      const results = await Promise.all(
        batch.map((p) => fetchEntries({
          year: yr,
          page: p,
          page_size: 100,
          signal: controller.signal,
        })),
      )
      for (const pageData of results) {
        // null 代表「本次请求被中断 / 命中缓存协商」，整体放弃，不能写半截数据。
        if (pageData === null) return
        if (!Array.isArray(pageData) || pageData.length === 0) {
          done = true
          break
        }
        collected.push(...pageData)
        if (pageData.length < 100) {
          done = true
          break
        }
      }
      page = batch[batch.length - 1] + 1
    }
    fetchedYearEntries.value = { ...fetchedYearEntries.value, [yr]: collected }
  } catch (err) {
    console.warn(`Failed to fetch full entries for year ${yr}:`, err)
  } finally {
    inFlightYears.delete(yr)
    if (yearAbort === controller) yearAbort = null
  }
}

// 只在切换到「内存里没有的年份」时补拉；不监听 refreshKey / entries，
// 增删改由 App 的本地乐观更新直接反映到 props.entries。
watch(
  selectedYear,
  (yr) => {
    if (yr) void loadAllEntriesForYear(yr)
  },
  { immediate: true },
)

// 增删改后让补拉缓存失效：props.entries 覆盖到的年份会直接回退到最新数据，
// 只有「内存里本来就没有」的年份才需要重新回源。
watch(
  () => props.refreshKey,
  () => {
    fetchedYearEntries.value = {}
    if (selectedYear.value) void loadAllEntriesForYear(selectedYear.value)
  },
)

// 获取所有出现的年份 (RC-48)
const years = computed(() => {
  const set = new Set<string>()
  props.entries.forEach(e => {
    const { year } = parseOccurredDate(e.occurred_at)
    if (year) set.add(year)
  })
  Object.keys(fetchedYearEntries.value).forEach((year) => set.add(year))
  const list = Array.from(set).sort((a, b) => b.localeCompare(a))
  return list.length > 0 ? list : [currentYearStr]
})

const availableAlmanacYears = computed(() => {
  const currentY = getBeijingYear()
  let minYear = currentY
  props.entries.forEach(e => {
    const y = parseInt(parseOccurredDate(e.occurred_at).year, 10)
    if (!isNaN(y) && y >= 2000 && y <= currentY) {
      if (y < minYear) minYear = y
    }
  })
  const list: number[] = []
  for (let y = currentY; y >= minYear; y--) {
    list.push(y)
  }
  return list
})

// 当年份列表更新且 selectedYear 不在列表中时，选中最新的一年
watch(years, (newYears) => {
  if (newYears.length > 0 && !newYears.includes(selectedYear.value)) {
    selectedYear.value = newYears[0]
  }
}, { immediate: true })

// 当前年份的所有条目：内存 props 优先，补拉的年份数据只作为兜底。
const yearEntries = computed(() => {
  const cached = fetchedYearEntries.value[selectedYear.value] || []
  if (cached.length === 0) {
    return props.entries.filter(
      (e) => parseOccurredDate(e.occurred_at).year === selectedYear.value,
    )
  }
  const map = new Map<number, LifeEntry>()
  cached.forEach((e) => map.set(e.id, e))
  props.entries
    .filter((e) => parseOccurredDate(e.occurred_at).year === selectedYear.value)
    .forEach((e) => map.set(e.id, e))
  return Array.from(map.values()).sort((a, b) => {
    const timeA = parseOccurredDate(a.occurred_at).timestamp
    const timeB = parseOccurredDate(b.occurred_at).timestamp
    return timeB - timeA
  })
})

const getTypeName = (type: string) => {
  // RC-128 四母体收敛后仅认 4 类纯粹形态 (BE-36)
  const map: Record<string, string> = {
    life: '日常',
    travel: '游历',
    project: '造物',
    wish: '心愿',
  }
  return map[type] || '日常'
}

// 轻量统计
const yearStats = computed(() => {
  const counts: Record<string, number> = {}
  yearEntries.value.forEach(e => {
    const t = getTypeName(e.type)
    counts[t] = (counts[t] || 0) + 1
  })
  return counts
})

// 按月份分组 (RC-48)
const monthGroups = computed(() => {
  const map = new Map<string, LifeEntry[]>()
  const monthOrder = ['12', '11', '10', '09', '08', '07', '06', '05', '04', '03', '02', '01']
  
  monthOrder.forEach(m => {
    const list = yearEntries.value.filter(e => parseOccurredDate(e.occurred_at).month === m)
    if (list.length > 0) {
      map.set(m, list)
    }
  })
  return map
})

const getMonthFull = (m: string) => {
  const names: Record<string, string> = {
    '12': '十二月 · DECEMBER',
    '11': '十一月 · NOVEMBER',
    '10': '十月 · OCTOBER',
    '09': '九月 · SEPTEMBER',
    '08': '八月 · AUGUST',
    '07': '七月 · JULY',
    '06': '六月 · JUNE',
    '05': '五月 · MAY',
    '04': '四月 · APRIL',
    '03': '三月 · MARCH',
    '02': '二月 · FEBRUARY',
    '01': '一月 · JANUARY',
  }
  return names[m] || `${m}月`
}

const formatMonthDay = (occurredAt?: string) => {
  const { month, day } = parseOccurredDate(occurredAt)
  return `${month}.${day}`
}
</script>

<template>
  <div class="max-w-4xl mx-auto px-4 sm:px-8 py-10 sm:py-20 text-left">
    
    <!-- 标头 -->
    <header class="pb-10 border-b border-[var(--border-subtle)] mb-12 space-y-3">
      <div class="flex items-center gap-3">
        <h1 class="font-serif-editorial text-4xl sm:text-5xl font-normal text-[var(--ink-primary)]">
          归档
        </h1>
        <span class="font-mono-archive text-xs tracking-widest text-[var(--ink-muted)]">
          编年史归档
        </span>
      </div>
      <p class="font-serif-editorial text-sm sm:text-base text-[var(--ink-secondary)]">
        按岁月回溯过往的记忆、瞬间与造物。
      </p>
    </header>

    <!-- 年份切换（文本式，非按钮 Card）与 年度生活年鉴入口 (FE-14) -->
    <!-- MOB-P1-103：窄屏（360px）下年份条 + 年鉴按钮同排会溢出并被 body overflow-x 裁掉，
         导致「翻阅年度年鉴」按钮根本点不到。这里改为纵向排列 + 年份条可横向滚动。 -->
    <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-8 font-mono-archive text-sm">
      <div class="flex items-center gap-4 sm:gap-6 overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0 snap-x">
        <button
          v-for="y in years"
          :key="y"
          @click="selectedYear = y"
          class="transition-colors cursor-pointer py-1 shrink-0 snap-start"
          :class="selectedYear === y 
            ? 'text-[var(--ink-primary)] font-bold border-b-2 border-[var(--ink-primary)]' 
            : 'text-[var(--ink-muted)] hover:text-[var(--ink-primary)]'"
        >
          {{ y }}年
        </button>
      </div>

      <button
        @click="isAlmanacOpen = true"
        type="button"
        class="inline-flex items-center gap-1.5 px-3 py-2 text-xs border border-[var(--border-subtle)] hover:border-[var(--ink-primary)] text-[var(--ink-secondary)] hover:text-[var(--ink-primary)] rounded-xs transition-colors cursor-pointer self-start sm:self-auto shrink-0"
        title="翻阅五幕式年度生活年鉴"
      >
        <BookOpen class="w-3.5 h-3.5 text-[var(--accent-warm)]" />
        <span>翻阅 {{ selectedYear }} 年度年鉴 ↗</span>
      </button>
    </div>

    <!-- 极轻量文本统计（非 Dashboard，纯文字注脚） -->
    <div class="font-mono-archive text-xs text-[var(--ink-muted)] pb-8 mb-12 border-b border-[var(--border-subtle)] flex flex-wrap items-center gap-y-1">
      <span>{{ selectedYear }}年 · </span>
      <span class="text-[var(--ink-secondary)] font-medium ml-1">共 {{ yearEntries.length }} 条生活记录</span>
      <template v-if="Object.keys(yearStats).length > 0">
        <span class="mx-2">·</span>
        <span v-for="(count, type) in yearStats" :key="type" class="mr-3">
          {{ count }} 条{{ type }}
        </span>
      </template>
    </div>

    <!-- 空状态 (RG-12) -->
    <div
      v-if="monthGroups.size === 0"
      class="py-20 text-center space-y-3 font-serif-editorial text-[var(--ink-muted)] border border-dashed border-[var(--border-subtle)] rounded-xs"
    >
      <p class="text-base text-[var(--ink-primary)]">该年份尚未收录任何生活散页</p>
      <p class="text-xs font-mono-archive text-[var(--ink-secondary)]">点击右下角「+」或顶部「＋ 记录」写下此时此刻的印记</p>
    </div>

    <!-- 按月份沉浸式浏览时间线清单 -->
    <div v-else class="space-y-16">
      <section
        v-for="[month, items] in monthGroups"
        :key="month"
        class="space-y-6"
      >
        <div class="font-mono-archive text-xs tracking-wider text-[var(--ink-muted)] border-b border-[var(--border-subtle)] pb-2 flex justify-between items-center">
          <span class="text-[var(--ink-secondary)] font-semibold">{{ getMonthFull(month) }}</span>
          <span>{{ items.length }} 条记录</span>
        </div>

        <div class="divide-y divide-[var(--border-subtle)]/60">
          <div
            v-for="item in items"
            :key="item.id"
            @click="emit('selectEntry', item)"
            class="py-4 flex flex-col sm:flex-row sm:items-baseline justify-between gap-2 group hover:bg-[var(--bg-subtle)]/40 px-2 rounded-sm transition-colors cursor-pointer"
          >
            <div class="flex items-baseline gap-4">
              <span class="font-mono-archive text-xs text-[var(--ink-muted)] shrink-0 w-12">
                {{ formatMonthDay(item.occurred_at) }}
              </span>
              <span class="font-serif-editorial text-base sm:text-lg text-[var(--ink-primary)] group-hover:text-[var(--accent-warm)] transition-colors">
                {{ item.title }}
              </span>
            </div>

            <div class="flex items-center gap-3 text-xs font-mono-archive text-[var(--ink-muted)] shrink-0 pl-16 sm:pl-0">
              <span v-if="item.location" class="hidden md:inline">{{ item.location }}</span>
              <span class="text-[11px] tracking-wider text-[var(--ink-muted)]">· {{ getTypeName(item.type) }}</span>
            </div>
          </div>
        </div>
      </section>
    </div>

    <!-- 年度生活年鉴画卷弹窗 (FE-14) -->
    <AlmanacModal
      v-if="isAlmanacOpen"
      :isOpen="isAlmanacOpen"
      :initialYear="parseInt(selectedYear) || 2026"
      :availableYears="availableAlmanacYears"
      @close="isAlmanacOpen = false"
    />

  </div>
</template>
