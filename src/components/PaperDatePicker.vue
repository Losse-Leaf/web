<script setup lang="ts">
import { ref, computed, watch, onMounted, onBeforeUnmount, nextTick } from 'vue'
import {
  Calendar as CalendarIcon,
  Clock,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  X,
} from 'lucide-vue-next'

const props = withDefaults(
  defineProps<{
    modelValue: string
    enableTime?: boolean
    placeholder?: string
    clearable?: boolean
    size?: 'xs' | 'sm' | 'md'
  }>(),
  {
    enableTime: false,
    placeholder: '',
    clearable: false,
    size: 'md',
  }
)

const emit = defineEmits<{
  (e: 'update:modelValue', val: string): void
}>()

const isOpen = ref(false)
const triggerRef = ref<HTMLElement | null>(null)
const popoverRef = ref<HTMLElement | null>(null)
const popoverStyle = ref<Record<string, string>>({})

const pad = (n: number) => String(n).padStart(2, '0')

// 解析当前 modelValue 为年/月/日/时/分
const parseValue = (raw: string) => {
  const now = new Date()
  if (!raw || !raw.trim()) {
    return {
      year: now.getFullYear(),
      month: now.getMonth() + 1,
      day: now.getDate(),
      hour: now.getHours(),
      minute: now.getMinutes(),
      hasValue: false,
    }
  }
  const clean = raw.trim().replace(' ', 'T')
  const [datePart, timePart] = clean.split('T')
  const dSegs = (datePart || '').split('-').map((x) => parseInt(x, 10))
  const year = dSegs[0] || now.getFullYear()
  const month = dSegs[1] || now.getMonth() + 1
  const day = dSegs[2] || now.getDate()

  let hour = now.getHours()
  let minute = now.getMinutes()
  if (timePart) {
    const tSegs = timePart.split(':').map((x) => parseInt(x, 10))
    if (!isNaN(tSegs[0])) hour = Math.min(23, Math.max(0, tSegs[0]))
    if (!isNaN(tSegs[1])) minute = Math.min(59, Math.max(0, tSegs[1]))
  }

  return { year, month, day, hour, minute, hasValue: true }
}

const initialParsed = parseValue(props.modelValue)
const viewYear = ref(initialParsed.year)
const viewMonth = ref(initialParsed.month) // 1~12
const selectedYear = ref(initialParsed.year)
const selectedMonth = ref(initialParsed.month)
const selectedDay = ref(initialParsed.day)
const selectedHour = ref(initialParsed.hour)
const selectedMinute = ref(initialParsed.minute)

watch(
  () => props.modelValue,
  (val) => {
    const p = parseValue(val)
    viewYear.value = p.year
    viewMonth.value = p.month
    selectedYear.value = p.year
    selectedMonth.value = p.month
    selectedDay.value = p.day
    selectedHour.value = p.hour
    selectedMinute.value = p.minute
  }
)

const displayText = computed(() => {
  if (!props.modelValue || !props.modelValue.trim()) {
    return props.placeholder || (props.enableTime ? '选择日期与时刻...' : '选择日期...')
  }
  const p = parseValue(props.modelValue)
  const dateStr = `${p.year}.${pad(p.month)}.${pad(p.day)}`
  if (props.enableTime) {
    return `${dateStr} ${pad(p.hour)}:${pad(p.minute)}`
  }
  return dateStr
})

const sizeClasses = computed(() => {
  switch (props.size) {
    case 'xs':
      return 'px-2 py-1 text-xs'
    case 'sm':
      return 'px-2.5 py-1.5 text-xs'
    default:
      return 'px-3 py-1.5 text-xs'
  }
})

interface CalendarCell {
  year: number
  month: number
  day: number
  isCurrentMonth: boolean
  isToday: boolean
  isSelected: boolean
}

const calendarCells = computed<CalendarCell[]>(() => {
  const y = viewYear.value
  const m = viewMonth.value
  const firstDayWeek = new Date(y, m - 1, 1).getDay() // 0(Sun) ~ 6(Sat)
  const daysInMonth = new Date(y, m, 0).getDate()
  const daysInPrevMonth = new Date(y, m - 1, 0).getDate()

  const now = new Date()
  const todayY = now.getFullYear()
  const todayM = now.getMonth() + 1
  const todayD = now.getDate()

  const hasVal = Boolean(props.modelValue && props.modelValue.trim())
  const cells: CalendarCell[] = []

  // 上月補位
  const prevY = m === 1 ? y - 1 : y
  const prevM = m === 1 ? 12 : m - 1
  for (let i = firstDayWeek - 1; i >= 0; i--) {
    const d = daysInPrevMonth - i
    cells.push({
      year: prevY,
      month: prevM,
      day: d,
      isCurrentMonth: false,
      isToday: prevY === todayY && prevM === todayM && d === todayD,
      isSelected: hasVal && prevY === selectedYear.value && prevM === selectedMonth.value && d === selectedDay.value,
    })
  }

  // 当月日期
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({
      year: y,
      month: m,
      day: d,
      isCurrentMonth: true,
      isToday: y === todayY && m === todayM && d === todayD,
      isSelected: hasVal && y === selectedYear.value && m === selectedMonth.value && d === selectedDay.value,
    })
  }

  // 下月補位至 42 格
  const nextY = m === 12 ? y + 1 : y
  const nextM = m === 12 ? 1 : m + 1
  const remain = 42 - cells.length
  for (let d = 1; d <= remain; d++) {
    cells.push({
      year: nextY,
      month: nextM,
      day: d,
      isCurrentMonth: false,
      isToday: nextY === todayY && nextM === todayM && d === todayD,
      isSelected: hasVal && nextY === selectedYear.value && nextM === selectedMonth.value && d === selectedDay.value,
    })
  }

  return cells
})

const emitFormatted = () => {
  const datePart = `${selectedYear.value}-${pad(selectedMonth.value)}-${pad(selectedDay.value)}`
  if (props.enableTime) {
    emit('update:modelValue', `${datePart}T${pad(selectedHour.value)}:${pad(selectedMinute.value)}`)
  } else {
    emit('update:modelValue', datePart)
  }
}

const selectCell = (cell: CalendarCell) => {
  selectedYear.value = cell.year
  selectedMonth.value = cell.month
  selectedDay.value = cell.day
  viewYear.value = cell.year
  viewMonth.value = cell.month
  emitFormatted()
  if (!props.enableTime) {
    isOpen.value = false
  }
}

const changeMonth = (delta: number) => {
  let m = viewMonth.value + delta
  let y = viewYear.value
  if (m < 1) {
    m = 12
    y--
  } else if (m > 12) {
    m = 1
    y++
  }
  viewMonth.value = m
  viewYear.value = y
}

const changeYear = (delta: number) => {
  viewYear.value += delta
}

const adjustHour = (delta: number) => {
  selectedHour.value = (selectedHour.value + delta + 24) % 24
  emitFormatted()
}

const adjustMinute = (delta: number) => {
  selectedMinute.value = (selectedMinute.value + delta + 60) % 60
  emitFormatted()
}

const applyPresetTime = (h: number, m: number) => {
  selectedHour.value = h
  selectedMinute.value = m
  emitFormatted()
}

const selectTodayOrNow = () => {
  const now = new Date()
  viewYear.value = now.getFullYear()
  viewMonth.value = now.getMonth() + 1
  selectedYear.value = now.getFullYear()
  selectedMonth.value = now.getMonth() + 1
  selectedDay.value = now.getDate()
  selectedHour.value = now.getHours()
  selectedMinute.value = now.getMinutes()
  emitFormatted()
  if (!props.enableTime) {
    isOpen.value = false
  }
}

const clearValue = (e?: MouseEvent) => {
  if (e) e.stopPropagation()
  emit('update:modelValue', '')
  isOpen.value = false
}

const updatePosition = () => {
  if (!triggerRef.value || !isOpen.value) return
  const rect = triggerRef.value.getBoundingClientRect()
  const viewportHeight = window.innerHeight
  const viewportWidth = window.innerWidth
  const panelWidth = 288
  const panelHeight = props.enableTime ? 380 : 310

  const spaceBelow = viewportHeight - rect.bottom
  const openUpward = spaceBelow < panelHeight && rect.top > panelHeight
  const left = Math.min(Math.max(8, rect.left), viewportWidth - panelWidth - 8)

  popoverStyle.value = {
    position: 'fixed',
    left: `${left}px`,
    width: `${panelWidth}px`,
    zIndex: '9999',
    ...(openUpward
      ? { bottom: `${viewportHeight - rect.top + 6}px` }
      : { top: `${rect.bottom + 6}px` }),
  }
}

const togglePopover = async () => {
  isOpen.value = !isOpen.value
  if (isOpen.value) {
    const p = parseValue(props.modelValue)
    viewYear.value = p.year
    viewMonth.value = p.month
    await nextTick()
    updatePosition()
  }
}

const handleClickOutside = (e: MouseEvent) => {
  if (!isOpen.value) return
  const target = e.target as Node
  if (triggerRef.value?.contains(target) || popoverRef.value?.contains(target)) {
    return
  }
  isOpen.value = false
}

const handleKeydown = (e: KeyboardEvent) => {
  if (!isOpen.value) return
  if (e.key === 'Escape') {
    e.stopPropagation()
    isOpen.value = false
  }
}

watch(isOpen, (open) => {
  if (open) {
    window.addEventListener('scroll', updatePosition, true)
    window.addEventListener('resize', updatePosition)
  } else {
    window.removeEventListener('scroll', updatePosition, true)
    window.removeEventListener('resize', updatePosition)
  }
})

onMounted(() => {
  document.addEventListener('mousedown', handleClickOutside)
  window.addEventListener('keydown', handleKeydown, true)
})

onBeforeUnmount(() => {
  document.removeEventListener('mousedown', handleClickOutside)
  window.removeEventListener('keydown', handleKeydown, true)
  window.removeEventListener('scroll', updatePosition, true)
  window.removeEventListener('resize', updatePosition)
})
</script>

<template>
  <div class="relative inline-block w-full text-left font-mono-archive">
    <!-- 纸本日期印章触发器 (彻底替代系统原生 input[type=date/datetime-local]) -->
    <button
      ref="triggerRef"
      type="button"
      @click="togglePopover"
      class="w-full bg-[var(--bg-archive)] border rounded-xs flex items-center justify-between gap-2 transition-colors outline-none cursor-pointer select-none"
      :class="[
        sizeClasses,
        isOpen
          ? 'border-[var(--ink-primary)] text-[var(--ink-primary)]'
          : 'border-[var(--border-subtle)] hover:border-[var(--ink-primary)]/70 text-[var(--ink-primary)]',
      ]"
    >
      <div class="flex items-center gap-2 truncate">
        <CalendarIcon class="w-3.5 h-3.5 text-[var(--accent-warm)] shrink-0" />
        <span
          class="truncate"
          :class="modelValue ? 'text-[var(--ink-primary)]' : 'text-[var(--ink-muted)]'"
        >
          {{ displayText }}
        </span>
      </div>

      <span
        v-if="clearable && modelValue"
        @click.stop="clearValue"
        class="p-0.5 text-[var(--ink-muted)] hover:text-[var(--ink-primary)] rounded-xs transition-colors"
        title="清除日期"
      >
        <X class="w-3 h-3" />
      </span>
    </button>

    <!-- 纸本万年历与时刻浮层 -->
    <Teleport to="body">
      <div
        v-if="isOpen"
        ref="popoverRef"
        :style="popoverStyle"
        class="bg-[var(--bg-archive)] border border-[var(--border-subtle)] rounded-xs shadow-[0_12px_36px_rgba(0,0,0,0.16)] p-3.5 space-y-3 font-mono-archive text-xs select-none animate-in fade-in duration-120"
      >
        <!-- 顶栏年月切换器 -->
        <div class="flex items-center justify-between pb-2 border-b border-[var(--border-subtle)]">
          <div class="flex items-center gap-1">
            <button
              type="button"
              @click="changeYear(-1)"
              class="p-1 text-[var(--ink-muted)] hover:text-[var(--ink-primary)] cursor-pointer transition-colors"
              title="上一年"
            >
              <ChevronsLeft class="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              @click="changeMonth(-1)"
              class="p-1 text-[var(--ink-muted)] hover:text-[var(--ink-primary)] cursor-pointer transition-colors"
              title="上一月"
            >
              <ChevronLeft class="w-3.5 h-3.5" />
            </button>
          </div>

          <span class="font-serif-editorial text-sm font-medium text-[var(--ink-primary)]">
            {{ viewYear }} 年 {{ pad(viewMonth) }} 月
          </span>

          <div class="flex items-center gap-1">
            <button
              type="button"
              @click="changeMonth(1)"
              class="p-1 text-[var(--ink-muted)] hover:text-[var(--ink-primary)] cursor-pointer transition-colors"
              title="下一月"
            >
              <ChevronRight class="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              @click="changeYear(1)"
              class="p-1 text-[var(--ink-muted)] hover:text-[var(--ink-primary)] cursor-pointer transition-colors"
              title="下一年"
            >
              <ChevronsRight class="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        <!-- 星期表头 -->
        <div class="grid grid-cols-7 text-center text-[11px] text-[var(--ink-muted)]">
          <span v-for="w in ['日', '一', '二', '三', '四', '五', '六']" :key="w" class="py-0.5">
            {{ w }}
          </span>
        </div>

        <!-- 42格纸本日历矩阵 -->
        <div class="grid grid-cols-7 gap-1 text-center">
          <button
            v-for="(cell, idx) in calendarCells"
            :key="`${cell.year}-${cell.month}-${cell.day}-${idx}`"
            type="button"
            @click="selectCell(cell)"
            class="h-7 rounded-xs text-[11px] flex items-center justify-center transition-colors cursor-pointer relative"
            :class="[
              cell.isSelected
                ? 'bg-[var(--ink-primary)] text-[var(--bg-archive)] font-semibold'
                : cell.isCurrentMonth
                  ? 'text-[var(--ink-primary)] hover:bg-[var(--bg-subtle)]'
                  : 'text-[var(--ink-muted)]/45 hover:bg-[var(--bg-subtle)]/50',
              cell.isToday && !cell.isSelected
                ? 'border border-[var(--accent-warm)] text-[var(--accent-warm)] font-medium'
                : '',
            ]"
          >
            {{ cell.day }}
          </button>
        </div>

        <!-- 时刻刻度盘 (仅当 enableTime 为 true 时显示) -->
        <div
          v-if="enableTime"
          class="pt-2.5 border-t border-[var(--border-subtle)] space-y-2"
        >
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-1.5 text-[11px] text-[var(--ink-muted)]">
              <Clock class="w-3 h-3 text-[var(--accent-warm)]" />
              <span>时刻刻度</span>
            </div>

            <div class="flex items-center gap-1">
              <!-- 小时微调 -->
              <div class="flex items-center border border-[var(--border-subtle)] rounded-xs bg-[var(--bg-subtle)]/40">
                <button
                  type="button"
                  @click="adjustHour(-1)"
                  class="px-1.5 py-0.5 text-[var(--ink-muted)] hover:text-[var(--ink-primary)] cursor-pointer"
                >
                  -
                </button>
                <span class="px-1.5 text-xs font-medium text-[var(--ink-primary)]">
                  {{ pad(selectedHour) }}
                </span>
                <button
                  type="button"
                  @click="adjustHour(1)"
                  class="px-1.5 py-0.5 text-[var(--ink-muted)] hover:text-[var(--ink-primary)] cursor-pointer"
                >
                  +
                </button>
              </div>
              <span class="text-[var(--ink-muted)]">:</span>
              <!-- 分钟微调 -->
              <div class="flex items-center border border-[var(--border-subtle)] rounded-xs bg-[var(--bg-subtle)]/40">
                <button
                  type="button"
                  @click="adjustMinute(-5)"
                  class="px-1.5 py-0.5 text-[var(--ink-muted)] hover:text-[var(--ink-primary)] cursor-pointer"
                >
                  -
                </button>
                <span class="px-1.5 text-xs font-medium text-[var(--ink-primary)]">
                  {{ pad(selectedMinute) }}
                </span>
                <button
                  type="button"
                  @click="adjustMinute(5)"
                  class="px-1.5 py-0.5 text-[var(--ink-muted)] hover:text-[var(--ink-primary)] cursor-pointer"
                >
                  +
                </button>
              </div>
            </div>
          </div>

          <!-- 快捷时刻纸签 -->
          <div class="flex items-center justify-between gap-1 text-[11px]">
            <button
              v-for="preset in [
                { label: '晨 09:00', h: 9, m: 0 },
                { label: '午 12:30', h: 12, m: 30 },
                { label: '暮 18:00', h: 18, m: 0 },
                { label: '夜 22:00', h: 22, m: 0 },
              ]"
              :key="preset.label"
              type="button"
              @click="applyPresetTime(preset.h, preset.m)"
              class="flex-1 py-0.5 border border-[var(--border-subtle)] hover:border-[var(--ink-primary)] rounded-xs text-[var(--ink-muted)] hover:text-[var(--ink-primary)] cursor-pointer transition-colors"
            >
              {{ preset.label }}
            </button>
          </div>
        </div>

        <!-- 底部操作栏 -->
        <div class="pt-2 border-t border-[var(--border-subtle)] flex items-center justify-between text-[11px]">
          <div class="flex items-center gap-2">
            <button
              type="button"
              @click="selectTodayOrNow"
              class="text-[var(--accent-warm)] hover:underline cursor-pointer"
            >
              {{ enableTime ? '此刻' : '今天' }}
            </button>
            <button
              v-if="clearable && modelValue"
              type="button"
              @click="clearValue()"
              class="text-[var(--ink-muted)] hover:text-[var(--ink-primary)] cursor-pointer"
            >
              清除
            </button>
          </div>

          <button
            type="button"
            @click="isOpen = false"
            class="px-2.5 py-0.5 bg-[var(--ink-primary)] text-[var(--bg-archive)] rounded-xs cursor-pointer hover:opacity-90 transition-opacity"
          >
            确定
          </button>
        </div>
      </div>
    </Teleport>
  </div>
</template>
