<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { BookOpen } from 'lucide-vue-next'
import type { LifeEntry } from '../types'
import { parseOccurredDate } from '../utils/format'
import { fetchEntries } from '../utils/api'
import AlmanacModal from './AlmanacModal.vue'

const props = defineProps<{
  entries: LifeEntry[]
}>()

const emit = defineEmits<{
  (e: 'selectEntry', item: LifeEntry): void
}>()

const currentYearStr = new Date().getFullYear().toString()
const selectedYear = ref(currentYearStr)
const isAlmanacOpen = ref(false)

// 存储自主按年分页拉取的全量条目 (避免仅吃前 100 条缓存导致旧数据缺失)
const fetchedYearEntries = ref<LifeEntry[]>([])
const isFetchingYear = ref(false)

const loadAllEntriesForYear = async (yr: string) => {
  if (!yr) return
  isFetchingYear.value = true
  try {
    let page = 1
    let collected: LifeEntry[] = []
    while (true) {
      const pageData = await fetchEntries({ year: yr, page, page_size: 100 })
      if (!pageData || !Array.isArray(pageData) || pageData.length === 0) break
      collected = [...collected, ...pageData]
      if (pageData.length < 100) break
      page++
    }
    if (collected.length > 0) {
      fetchedYearEntries.value = collected
    }
  } catch (err) {
    console.warn(`Failed to fetch full entries for year ${yr}:`, err)
  } finally {
    isFetchingYear.value = false
  }
}

watch(selectedYear, (yr) => {
  if (yr) {
    loadAllEntriesForYear(yr)
  }
}, { immediate: true })

// 获取所有出现的年份 (RC-48)
const years = computed(() => {
  const set = new Set<string>()
  props.entries.forEach(e => {
    const { year } = parseOccurredDate(e.occurred_at)
    if (year) set.add(year)
  })
  const list = Array.from(set).sort((a, b) => b.localeCompare(a))
  return list.length > 0 ? list : [currentYearStr]
})

// 当年份列表更新且 selectedYear 不在列表中时，选中最新的一年
watch(years, (newYears) => {
  if (newYears.length > 0 && !newYears.includes(selectedYear.value)) {
    selectedYear.value = newYears[0]
  }
}, { immediate: true })

// 当前年份的所有条目：合并本地缓存与全量拉取数据 (RC-48)
const yearEntries = computed(() => {
  const localYearList = props.entries.filter(e => parseOccurredDate(e.occurred_at).year === selectedYear.value)
  if (fetchedYearEntries.value.length === 0) {
    return localYearList
  }
  const map = new Map<number, LifeEntry>()
  fetchedYearEntries.value.forEach(e => map.set(e.id, e))
  localYearList.forEach(e => map.set(e.id, e))
  return Array.from(map.values()).sort((a, b) => {
    const timeA = parseOccurredDate(a.occurred_at).timestamp
    const timeB = parseOccurredDate(b.occurred_at).timestamp
    return timeB - timeA
  })
})

const getTypeName = (type: string) => {
  const map: Record<string, string> = {
    thought: '随想',
    photo: '摄影',
    coffee: '咖啡',
    music: '听音',
    book: '书摘',
    place: '行迹',
    project: '造物',
    game: '游戏',
    purchase: '好物',
    gear: '装备',
    moment: '日常',
  }
  return map[type] || type
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
    <div class="flex items-center justify-between gap-4 mb-8 font-mono-archive text-sm">
      <div class="flex items-center gap-6">
        <button
          v-for="y in years"
          :key="y"
          @click="selectedYear = y"
          class="transition-colors cursor-pointer py-1"
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
        class="inline-flex items-center gap-1.5 px-3 py-1 text-xs border border-[var(--border-subtle)] hover:border-[var(--ink-primary)] text-[var(--ink-secondary)] hover:text-[var(--ink-primary)] rounded-xs transition-colors cursor-pointer"
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
      @close="isAlmanacOpen = false"
    />

  </div>
</template>
