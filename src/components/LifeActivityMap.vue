<script setup lang="ts">
import { ref, computed, onMounted, nextTick } from 'vue'
import type { LifeEntry } from '../types'
import { parseOccurredDate } from '../utils/format'

const props = defineProps<{
  entries: LifeEntry[]
  selectedDate?: string
}>()

const emit = defineEmits<{
  (e: 'selectDate', date: string): void
}>()

const scrollContainer = ref<HTMLElement | null>(null)

// 悬停气泡信息
const hoveredDay = ref<{
  date: string
  dayOfWeek: string
  entries: LifeEntry[]
  count: number
  x: number
  y: number
} | null>(null)

// 建立日期映射表
const entryMap = computed(() => {
  const map = new Map<string, LifeEntry[]>()
  props.entries.forEach(e => {
    const key = parseOccurredDate(e.occurred_at).dotDate
    const list = map.get(key) || []
    list.push(e)
    map.set(key, list)
  })
  return map
})

// 星期几定义（GitHub 规范：第 0 行周日，第 6 行周六）
const weekDays = ['日', '一', '二', '三', '四', '五', '六']
// GitHub 风格左侧只标记周一、周三、周五
const weekLabels = [
  { index: 1, label: '周一' },
  { index: 3, label: '周三' },
  { index: 5, label: '周五' },
]

export interface DayCell {
  date: string
  displayDate: string
  dayOfWeekStr: string
  dayOfWeek: number
  month: number
  year: number
  isToday: boolean
  isFuture: boolean
  entries: LifeEntry[]
  count: number
  level: number
  baseClass: string
}

// 今天日期基准
const today = new Date()
today.setHours(0, 0, 0, 0)
const pad = (n: number) => String(n).padStart(2, '0')
const todayStr = `${today.getFullYear()}.${pad(today.getMonth() + 1)}.${pad(today.getDate())}`

const todayDisplay = computed(() => todayStr)

// 生成对齐 GitHub 的完整 53 周矩阵（最近整整 1 年，最新时间就是今天）
const calendarWeeks = computed(() => {
  const weeks: DayCell[][] = []

  // 今天的星期 (0=Sun, 6=Sat)
  const todayDayOfWeek = today.getDay()

  // GitHub 热力图规范：从今天往前推 52 周，并对齐到周日
  // 52 周 * 7 天 = 364 天。起始周的第一天(周日) 为：
  const startDate = new Date(today)
  startDate.setDate(today.getDate() - 52 * 7 - todayDayOfWeek)
  startDate.setHours(0, 0, 0, 0)

  // 终点日期：当前周的周六（或者今天之后的本周余下天数被标记为 isFuture）
  const endDate = new Date(today)
  endDate.setDate(today.getDate() + (6 - todayDayOfWeek))
  endDate.setHours(0, 0, 0, 0)

  let cur = new Date(startDate)
  let currentWeek: DayCell[] = []

  while (cur <= endDate) {
    const y = cur.getFullYear()
    const m = cur.getMonth() + 1
    const d = cur.getDate()

    const dateStr = `${y}.${pad(m)}.${pad(d)}`
    const dayOfWeek = cur.getDay() // 0=Sun, ..., 6=Sat

    const isToday = dateStr === todayStr
    const isFuture = cur.getTime() > today.getTime()

    const matchedEntries = !isFuture ? (entryMap.value.get(dateStr) || []) : []
    const count = matchedEntries.length

    // GitHub 4级色阶
    let level = 0
    if (count === 1) level = 1
    else if (count === 2) level = 2
    else if (count === 3) level = 3
    else if (count >= 4) level = 4

    let baseClass = ''
    if (isFuture) {
      baseClass = 'opacity-0 pointer-events-none'
    } else {
      if (level === 0) {
        baseClass = 'bg-[var(--activity-empty)] hover:bg-[var(--border-divider)] cursor-default'
      } else if (level === 1) {
        baseClass = 'bg-[var(--activity-l1)] cursor-pointer shadow-xs'
      } else if (level === 2) {
        baseClass = 'bg-[var(--activity-l2)] cursor-pointer shadow-xs'
      } else if (level === 3) {
        baseClass = 'bg-[var(--activity-l3)] cursor-pointer shadow-xs'
      } else if (level >= 4) {
        baseClass = 'bg-[var(--activity-l4)] cursor-pointer shadow-xs'
      }
    }

    currentWeek.push({
      date: dateStr,
      displayDate: `${m}月${d}日`,
      dayOfWeekStr: `周${weekDays[dayOfWeek]}`,
      dayOfWeek,
      month: m,
      year: y,
      isToday,
      isFuture,
      entries: matchedEntries,
      count,
      level,
      baseClass,
    })

    if (currentWeek.length === 7) {
      weeks.push(currentWeek)
      currentWeek = []
    }

    cur.setDate(cur.getDate() + 1)
  }

  return weeks
})

// 按日期索引单元格（供事件委托极速定位）
const cellByDateMap = computed(() => {
  const map = new Map<string, DayCell>()
  for (const week of calendarWeeks.value) {
    for (const cell of week) {
      map.set(cell.date, cell)
    }
  }
  return map
})

// 月份横向标签（GitHub 风格：按周计算月份变化）
const monthLabels = computed(() => {
  const labels: { label: string; weekIndex: number }[] = []
  let lastMonth = -1

  calendarWeeks.value.forEach((week, wIdx) => {
    // 查看本周是否有发生月份转换的日子，优先取周内靠前的日子
    const firstNonFutureDay = week.find(d => !d.isFuture) || week[0]
    if (firstNonFutureDay && firstNonFutureDay.month !== lastMonth) {
      // 避免首尾相隔过近（至少间隔 2 周才渲染下一个标签）
      if (labels.length === 0 || wIdx - labels[labels.length - 1].weekIndex >= 2) {
        lastMonth = firstNonFutureDay.month
        const monthNames = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月']
        labels.push({
          label: monthNames[lastMonth - 1],
          weekIndex: wIdx,
        })
      }
    }
  })

  return labels
})

// 最近一年的全部有效天数集合
const pastYearDays = computed(() => {
  const list: DayCell[] = []
  calendarWeeks.value.forEach(w => {
    w.forEach(d => {
      if (!d.isFuture) list.push(d)
    })
  })
  return list
})

// 统计：过去一年印记总数
const totalPastYearEntries = computed(() => {
  return pastYearDays.value.reduce((acc, d) => acc + d.count, 0)
})

// 统计：过去一年活跃天数
const activeDaysCount = computed(() => {
  return pastYearDays.value.filter(d => d.count > 0).length
})

// 统计：连续记录 Streak 计算（当前连续 & 最长连续）
const streaks = computed(() => {
  const days = pastYearDays.value
  let maxStreak = 0
  let curRunning = 0

  days.forEach(d => {
    if (d.count > 0) {
      curRunning++
      if (curRunning > maxStreak) maxStreak = curRunning
    } else {
      curRunning = 0
    }
  })

  // 计算当前连续天数（从今天往回倒推）
  let currentStreak = 0
  for (let i = days.length - 1; i >= 0; i--) {
    if (days[i].count > 0) {
      currentStreak++
    } else {
      // 如果今天是 0，允许从昨天看起
      if (i === days.length - 1 && days[i].count === 0) {
        continue
      }
      break
    }
  }

  return {
    longest: maxStreak,
    current: currentStreak,
  }
})

// 事件委托：容器级鼠标悬浮
const onGridMouseOver = (event: MouseEvent) => {
  const target = (event.target as HTMLElement).closest<HTMLElement>('button[data-date]')
  if (!target) {
    hoveredDay.value = null
    return
  }
  const date = target.dataset.date
  if (!date) {
    hoveredDay.value = null
    return
  }
  const cell = cellByDateMap.value.get(date)
  if (!cell || cell.isFuture) {
    hoveredDay.value = null
    return
  }
  const rect = target.getBoundingClientRect()
  hoveredDay.value = {
    date: cell.date,
    dayOfWeek: cell.dayOfWeekStr,
    entries: cell.entries,
    count: cell.count,
    x: rect.left + rect.width / 2,
    y: rect.top,
  }
}

// 事件委托：移出容器清理悬浮信息
const onGridMouseLeave = () => {
  hoveredDay.value = null
}

// 事件委托：容器级点击筛选
const onGridClick = (event: MouseEvent) => {
  const target = (event.target as HTMLElement).closest<HTMLElement>('button[data-date]')
  if (!target) return
  target.blur()
  const date = target.dataset.date
  if (!date) return
  const cell = cellByDateMap.value.get(date)
  if (!cell || cell.isFuture || cell.count === 0) return
  if (props.selectedDate === cell.date) {
    emit('selectDate', '')
  } else {
    emit('selectDate', cell.date)
  }
}

onMounted(() => {
  nextTick(() => {
    if (!scrollContainer.value) return
    const container = scrollContainer.value
    // 自动平滑滚动到最右侧（今天所在的位置）
    if (container.scrollWidth > container.clientWidth) {
      container.scrollTo({ left: container.scrollWidth, behavior: 'smooth' })
    }
  })
})
</script>

<template>
  <section class="py-10 border-b border-[var(--border-subtle)] text-left select-none relative">
    
    <!-- 标头与指标：对齐 GitHub Contribution 氛围并融入纸本刊印质感 -->
    <div class="flex flex-col sm:flex-row sm:items-end justify-between gap-4 pb-6">
      <div class="space-y-1.5">
        <div class="flex items-center gap-3">
          <h2 class="font-serif-editorial text-2xl sm:text-3xl font-medium tracking-tight text-[var(--ink-primary)]">
            生活刻度
          </h2>
          <span class="font-mono-archive text-[11px] tracking-widest text-[var(--ink-muted)]">
            编年生活刻度 · 最近一年
          </span>
        </div>
        <p class="font-serif-editorial text-xs sm:text-sm text-[var(--ink-secondary)]">
          参考 GitHub 图谱，记录截至今日（{{ todayDisplay }}）最近一年的生活印记。
        </p>
      </div>

      <!-- 右侧多维统计指标 -->
      <div class="font-mono-archive text-xs text-[var(--ink-muted)] flex flex-wrap items-center gap-x-4 gap-y-1">
        <span>已记录 <strong class="text-[var(--ink-primary)] font-medium">{{ totalPastYearEntries }}</strong> 个瞬间</span>
        <span>·</span>
        <span>覆盖 <strong class="text-[var(--ink-primary)] font-medium">{{ activeDaysCount }}</strong> 天</span>
        <span v-if="streaks.longest > 0">·</span>
        <span v-if="streaks.longest > 0">最长连续 <strong class="text-[var(--accent-warm)] font-medium">{{ streaks.longest }}</strong> 天</span>
      </div>
    </div>

    <!-- 热力图网格滚动区域 (最新时间在最右侧，自动对齐今天) -->
    <div ref="scrollContainer" class="overflow-x-auto pb-2 pt-1 scrollbar-none">
      <div class="inline-block min-w-full">
        
        <!-- 月份标头行 -->
        <div class="relative h-5 mb-1.5 font-mono-archive text-[11px] text-[var(--ink-muted)]">
          <span
            v-for="m in monthLabels"
            :key="m.label + m.weekIndex"
            class="absolute top-0 transform"
            :style="{ left: `${m.weekIndex * 15 + 28}px` }"
          >
            {{ m.label }}
          </span>
        </div>

        <!-- 网格主体：左侧星期标记 + 右侧 53 列 -->
        <div class="flex gap-2 items-start">
          
          <!-- 左侧星期标签 (周一、周三、周五) -->
          <div class="relative w-6 h-[98px] font-mono-archive text-[10px] text-[var(--ink-muted)] shrink-0 select-none">
            <span
              v-for="lbl in weekLabels"
              :key="lbl.index"
              class="absolute left-0 leading-none"
              :style="{ top: `${lbl.index * 14 + 1}px` }"
            >
              {{ lbl.label }}
            </span>
          </div>

          <!-- 53 周方格矩阵 (每列 7 天：周日到周六，容器级事件委托与预计算类名) -->
          <div
            class="flex gap-[3px] py-1.5 px-1"
            @mouseover="onGridMouseOver"
            @mouseleave="onGridMouseLeave"
            @click="onGridClick"
          >
            <div
              v-for="(week, wIdx) in calendarWeeks"
              :key="wIdx"
              class="flex flex-col gap-[3px]"
            >
              <button
                v-for="(day, dIdx) in week"
                :key="dIdx"
                :data-date="day.date"
                :disabled="day.isFuture"
                class="w-[11px] h-[11px] rounded-[1.5px] transition-transform duration-150 ease-out relative outline-none focus:outline-none focus:ring-0 active:outline-none select-none"
                :class="[
                  day.baseClass,
                  !day.isFuture ? (day.count > 0 ? 'cursor-pointer hover:scale-135 hover:z-20' : 'hover:scale-115 hover:z-10') : '',
                  selectedDate === day.date ? '!scale-150 z-30 shadow-xs' : ''
                ]"
                :aria-label="!day.isFuture ? `${day.date} (${day.dayOfWeekStr}): ${day.count} 条记录` : ''"
              />
            </div>
          </div>

        </div>

      </div>
    </div>

    <!-- 底部状态栏与图例解释 (四级色阶图例) -->
    <div class="pt-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs font-mono-archive text-[var(--ink-muted)]">
      
      <!-- 动态悬浮或筛选提示 -->
      <div class="flex items-center gap-3 min-h-[20px]">
        <template v-if="selectedDate">
          <span class="text-[var(--accent-warm)] font-medium">
            已筛选：{{ selectedDate }} 的生活印记
          </span>
          <button
            @click="emit('selectDate', '')"
            class="text-[var(--ink-secondary)] hover:text-[var(--ink-primary)] hover-underline cursor-pointer"
          >
            [清除筛选]
          </button>
        </template>
        <template v-else-if="hoveredDay && hoveredDay.count > 0">
          <span class="text-[var(--ink-primary)]">
            {{ hoveredDay.date }} ({{ hoveredDay.dayOfWeek }}) · <strong>{{ hoveredDay.count }}</strong> 条印记
            <span v-if="hoveredDay.entries.length > 0" class="font-serif-editorial text-[var(--ink-secondary)] ml-1">
              — {{ hoveredDay.entries.map(e => e.title).slice(0, 3).join('、') }}
              <span v-if="hoveredDay.entries.length > 3">等</span>
            </span>
          </span>
        </template>
        <template v-else-if="hoveredDay && hoveredDay.count === 0">
          <span class="text-[var(--ink-muted)]">
            {{ hoveredDay.date }} ({{ hoveredDay.dayOfWeek }}) · 暂无记录
          </span>
        </template>
        <template v-else>
          <span>点击任意有记录的格块，可向下筛选当天的生活时间线</span>
        </template>
      </div>

      <!-- GitHub 经典四级色阶图例 -->
      <div class="flex items-center gap-1.5 text-[11px] self-end sm:self-auto select-none">
        <span class="text-[var(--ink-muted)] mr-1">少</span>
        <span class="w-[11px] h-[11px] rounded-[1.5px] bg-[var(--activity-empty)] inline-block" title="0 条"></span>
        <span class="w-[11px] h-[11px] rounded-[1.5px] bg-[var(--activity-l1)] inline-block" title="1 条"></span>
        <span class="w-[11px] h-[11px] rounded-[1.5px] bg-[var(--activity-l2)] inline-block" title="2 条"></span>
        <span class="w-[11px] h-[11px] rounded-[1.5px] bg-[var(--activity-l3)] inline-block" title="3 条"></span>
        <span class="w-[11px] h-[11px] rounded-[1.5px] bg-[var(--activity-l4)] inline-block" title="4+ 条"></span>
        <span class="text-[var(--ink-muted)] ml-1">多</span>
      </div>

    </div>

  </section>
</template>
