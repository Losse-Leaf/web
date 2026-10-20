<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import type { LifeEntry, ArchiveCategory } from '../types'
import { getEntryCategory, entryMatchesCategory } from '../types'
import { ArrowUpRight, Maximize2 } from 'lucide-vue-next'
import EditorialLightbox from './EditorialLightbox.vue'
import { formatMoney, parseOccurredDate, renderEditorialContent } from '../utils/format'
import { getAdminToken } from '../utils/api'

const props = defineProps<{
  entries: LifeEntry[]
  limit?: number
  showFilters?: boolean
  dateFilter?: string
  currentCategory?: ArchiveCategory
}>()

const emit = defineEmits<{
  (e: 'clearDateFilter'): void
  (e: 'changeCategory', category: ArchiveCategory): void
  (e: 'selectEntry', entry: LifeEntry): void
  (e: 'openAdd'): void
}>()

const isAdmin = computed(() => Boolean(getAdminToken()))
const activeCategory = ref<ArchiveCategory>(props.currentCategory || 'all')

// 暗房灯箱状态
const isLightboxOpen = ref(false)
const lightboxPayload = ref({
  imageUrl: '',
  title: '',
  meta: '',
  location: '',
  date: '',
})

const getEntryFirstImage = (entry: LifeEntry): string => {
  if (entry.attachments && entry.attachments.length > 0 && entry.attachments[0].url) {
    return entry.attachments[0].url
  }
  return ''
}

// MOB-P1-67：附件列表记忆化 ——
// 模板里每条记录会调用 getEntryImages 3~5 次，每次都 filter 出新数组。
const imagesMemo = new WeakMap<LifeEntry, { id: number; url: string }[]>()

const getEntryImages = (entry: LifeEntry): { id: number; url: string }[] => {
  const cached = imagesMemo.get(entry)
  if (cached) return cached
  const list =
    entry.attachments && entry.attachments.length > 0
      ? (entry.attachments.filter((a) => Boolean(a.url)) as { id: number; url: string }[])
      : []
  imagesMemo.set(entry, list)
  return list
}

// MOB-P1-67：跨月封签判定同样每次都要解析日期 —— 解析结果按 occurred_at 缓存。
const dateKeyMemo = new Map<string, string>()

const getEntryMonthKey = (entry: LifeEntry): string => {
  const raw = entry.occurred_at || ''
  const cached = dateKeyMemo.get(raw)
  if (cached) return cached
  const { year, month } = parseOccurredDate(raw)
  const key = `${year}.${month}`
  if (dateKeyMemo.size > 500) dateKeyMemo.clear()
  dateKeyMemo.set(raw, key)
  return key
}

// MOB-P1-67：窗口化渲染 ——
// 原先一次性渲染全部条目（每条还带图片网格与 v-html 富文本），
// 几百条记录就会产生数千个 DOM 节点，移动端滚动持续掉帧。
// 现在只渲染「已展开」的窗口，滚动到底再展开下一批。
const INITIAL_WINDOW = 40
const WINDOW_STEP = 40
const visibleCount = ref(INITIAL_WINDOW)

const visibleEntries = computed(() =>
  filteredEntries.value.slice(0, visibleCount.value)
)

const hasMoreEntries = computed(() => visibleCount.value < filteredEntries.value.length)

const loadMoreEntries = () => {
  if (!hasMoreEntries.value) return
  visibleCount.value += WINDOW_STEP
}

// 切换分类 / 数据源变化后重置窗口
watch(
  () => [props.currentCategory, props.entries, props.dateFilter] as const,
  () => {
    visibleCount.value = INITIAL_WINDOW
  }
)

const isFirstEntryOfMonth = (index: number): boolean => {
  if (index === 0) return true
  const currentKey = getEntryMonthKey(filteredEntries.value[index])
  const prevKey = getEntryMonthKey(filteredEntries.value[index - 1])
  return currentKey !== prevKey
}

const formatMonthHeader = (entry: LifeEntry): string => {
  const { year, month } = parseOccurredDate(entry.occurred_at)
  return `${year} 年 ${Number(month)} 月`
}

const openLightbox = (entry: LifeEntry, customUrl?: string) => {
  lightboxPayload.value = {
    imageUrl: customUrl || getEntryFirstImage(entry),
    title: entry.title || '',
    meta: entry.city_name || entry.location || '',
    location: entry.location || '',
    date: formatEntryDate(entry),
  }
  isLightboxOpen.value = true
}

watch(
  () => props.currentCategory,
  (newCat) => {
    if (newCat) {
      activeCategory.value = newCat
    }
  }
)

// 视图过滤分类 (4 大纯化形态 + 主理人可见账目投影)
const categoryFilters = computed<{ key: ArchiveCategory; label: string }[]>(() => {
  const base: { key: ArchiveCategory; label: string }[] = [
    { key: 'all', label: '全部记录' },
    { key: 'daily', label: '日常' },
    { key: 'travel', label: '游历' },
    { key: 'project', label: '造物' },
    { key: 'wish', label: '心愿' },
  ]
  if (isAdmin.value) {
    base.push({ key: 'transaction', label: '账目' })
  }
  return base
})

const filteredEntries = computed(() => {
  let list = props.entries

  // 1. 日期筛选 (RC-48)
  if (props.dateFilter) {
    const target = props.dateFilter.replace(/-/g, '.').trim()
    list = list.filter((e) => parseOccurredDate(e.occurred_at).dotDate === target)
  }

  // 2. 类别筛选
  if (activeCategory.value !== 'all') {
    list = list.filter((e) => entryMatchesCategory(e, activeCategory.value))
  }

  // 3. 数量限制
  if (props.limit && props.limit > 0 && !props.dateFilter && activeCategory.value === 'all') {
    return list.slice(0, props.limit)
  }

  return list
})

const handleCategoryClick = (cat: ArchiveCategory) => {
  activeCategory.value = cat
  emit('changeCategory', cat)
}

// 归一化条目显示归属
const getCategoryName = (entry: LifeEntry) => {
  const cat = getEntryCategory(entry)
  const map: Record<ArchiveCategory, string> = {
    all: '全部记录',
    daily: '日常',
    travel: '游历',
    project: '造物',
    wish: '心愿',
    transaction: '账目',
  }
  return map[cat] || '日常'
}

const formatEntryDate = (entry: LifeEntry) => {
  const { month, day } = parseOccurredDate(entry.occurred_at)
  return `${Number(month)}月${Number(day)}日`
}

const formatEntryTime = (entry: LifeEntry) => {
  return parseOccurredDate(entry.occurred_at).time
}

// 岁月留白刻度计算 (计算两篇相邻记录之间的空白跨度)
const getEntryTimestamp = (entry: LifeEntry): number => {
  return parseOccurredDate(entry.occurred_at).timestamp
}

const getGapDays = (index: number): number => {
  if (index === 0) return 0
  const current = filteredEntries.value[index]
  const prev = filteredEntries.value[index - 1]
  const tCurrent = getEntryTimestamp(current)
  const tPrev = getEntryTimestamp(prev)
  if (!tCurrent || !tPrev) return 0
  const diffMs = Math.abs(tPrev - tCurrent)
  return Math.round(diffMs / (1000 * 60 * 60 * 24))
}
</script>

<template>
  <div class="w-full text-left">
    <!-- 单行视角分类筛选与条目计数栏 -->
    <div
      v-if="showFilters"
      class="flex flex-wrap items-center justify-between gap-4 mb-10 text-xs font-mono-archive text-[var(--ink-muted)] border-b border-[var(--border-subtle)] pb-4"
    >
      <div class="flex flex-wrap items-center gap-x-6 gap-y-2">
        <span class="text-[var(--ink-secondary)] mr-1">视角：</span>
        <button
          v-for="f in categoryFilters"
          :key="f.key"
          @click="handleCategoryClick(f.key)"
          class="transition-colors cursor-pointer py-1 hover:text-[var(--ink-primary)]"
          :class="{
            'text-[var(--ink-primary)] font-semibold border-b border-[var(--ink-primary)]':
              activeCategory === f.key,
          }"
        >
          {{ f.label }}
        </button>
      </div>

      <span class="text-[11px] text-[var(--ink-muted)] shrink-0">
        共 {{ filteredEntries.length }} 条记录
      </span>
    </div>

    <!-- 日期筛选提醒 -->
    <div
      v-if="dateFilter"
      class="mb-10 pb-4 border-b border-[var(--border-subtle)] flex items-center justify-between text-xs font-mono-archive"
    >
      <div class="flex items-center gap-2">
        <span class="text-[var(--accent-warm)] font-medium">聚焦日期：{{ dateFilter }}</span>
        <span class="text-[var(--ink-muted)]">（共 {{ filteredEntries.length }} 条生活印记）</span>
      </div>
      <button
        @click="emit('clearDateFilter')"
        class="text-[var(--ink-secondary)] hover:text-[var(--ink-primary)] hover-underline cursor-pointer"
      >
        [显示全部日期记录]
      </button>
    </div>

    <!-- 空状态：散页藏书票 (Ex-Libris Bookplate) -->
    <div v-if="filteredEntries.length === 0" class="py-16 flex justify-center">
      <div class="relative max-w-md w-full px-8 py-10 text-center space-y-4 border border-[var(--border-subtle)] bg-[var(--bg-subtle)]/40 rounded-xs">
        <span class="pointer-events-none select-none absolute top-2 left-2.5 text-xs text-[var(--ink-muted)]/60 font-mono-archive">⌜</span>
        <span class="pointer-events-none select-none absolute top-2 right-2.5 text-xs text-[var(--ink-muted)]/60 font-mono-archive">⌝</span>
        <span class="pointer-events-none select-none absolute bottom-2 left-2.5 text-xs text-[var(--ink-muted)]/60 font-mono-archive">⌞</span>
        <span class="pointer-events-none select-none absolute bottom-2 right-2.5 text-xs text-[var(--ink-muted)]/60 font-mono-archive">⌟</span>

        <div class="inline-flex items-center gap-1.5 px-2.5 py-0.5 text-[11px] font-mono-archive tracking-widest uppercase vermilion-seal">
          <span>EX LIBRIS · 散页藏书票</span>
        </div>

        <div class="space-y-1.5 font-serif-editorial pt-1">
          <h3 class="text-lg text-[var(--ink-primary)]">
            {{
              activeCategory === 'travel'
                ? '还没有游历足迹记录'
                : activeCategory === 'project'
                ? '还没有造物手记'
                : activeCategory === 'wish'
                ? '还没有心愿印记'
                : activeCategory === 'transaction'
                ? '这个月还没有账目流水'
                : '尚待落笔的空白散页'
            }}
          </h3>
          <p class="text-xs text-[var(--ink-muted)] leading-relaxed">
            从今天开始，<br />
            记录一些你不想忘记的事情。
          </p>
        </div>
        <button
          @click="emit('openAdd')"
          class="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-mono-archive border border-[var(--border-subtle)] hover:border-[var(--ink-primary)] rounded-xs cursor-pointer transition-colors"
        >
          <span>＋ 添加第一条记录</span>
        </button>
      </div>
    </div>

    <!-- 核心：纵向时间线 (Vertical Spine Timeline) -->
    <div
      v-else
      class="relative pl-6 sm:pl-10 border-l border-[var(--border-subtle)] ml-3 sm:ml-5 space-y-12 sm:space-y-16 py-2"
    >
      <template v-for="(entry, index) in visibleEntries" :key="entry.id">
        <!-- 跨月自然物候封签 (Month Tab) -->
        <div
          v-if="isFirstEntryOfMonth(index)"
          class="relative -ml-6 sm:-ml-10 pt-4 pb-2 flex items-center gap-3 select-none"
        >
          <div class="px-3 py-1 bg-[var(--bg-subtle)] text-[var(--ink-primary)] border border-[var(--border-subtle)] rounded-xs font-serif-editorial text-xs font-medium tracking-wider shadow-2xs flex items-center gap-2">
            <span class="w-1.5 h-1.5 rounded-full bg-[var(--accent-warm)]"></span>
            <span>{{ formatMonthHeader(entry) }}</span>
          </div>
          <div class="flex-grow h-px bg-[var(--border-subtle)]/60 max-w-sm"></div>
        </div>

        <!-- 岁月留白刻度 (跨越 >= 14 天的静默时段，实体装订缝线效果) -->
        <div
          v-if="getGapDays(index) >= 14"
          class="relative py-2 flex items-center gap-3 sm:gap-4 text-xs font-mono-archive text-[var(--ink-muted)] select-none -my-3 sm:-my-4"
        >
          <!-- 标尺切线点 -->
          <div class="absolute -left-[30px] sm:-left-[46px] w-2.5 h-px bg-[var(--ink-muted)]/60"></div>
          <span class="tracking-widest text-[11px] text-[var(--ink-muted)]/80 flex items-center gap-1.5">
            <span>· · · 跨越 {{ getGapDays(index) }} 天的时光留白 · · ·</span>
          </span>
          <span class="flex-grow border-b border-dashed border-[var(--border-divider)] max-w-xs"></span>
        </div>

        <article
          @click="emit('selectEntry', entry)"
          class="relative group cursor-pointer transition-all"
        >
          <!-- 纵向主轨锚点圆点 (Timeline Node) -->
          <div
            class="absolute -left-[31px] sm:-left-[47px] top-1.5 flex items-center justify-center"
          >
            <div
              class="w-2.5 h-2.5 rounded-full bg-[var(--bg-archive)] border-2 border-[var(--ink-secondary)] group-hover:border-[var(--accent-warm)] group-hover:scale-125 transition-all"
              :class="{
                'border-[var(--accent-warm)] bg-[var(--accent-warm)]/20': entry.featured || getEntryCategory(entry) === 'wish',
                'border-emerald-600': entry.type === 'transaction' || entry.is_transaction,
              }"
            ></div>
          </div>

          <!-- 顶部元信息行：日期 · 时间 · 类型纸签 · 地点 -->
          <div class="flex flex-wrap items-center gap-2 text-xs font-mono-archive text-[var(--ink-muted)] mb-3">
            <span class="font-semibold text-[var(--ink-primary)] tracking-wide">
              {{ formatEntryDate(entry) }}
            </span>
            <span v-if="formatEntryTime(entry)" class="text-[var(--ink-muted)]">{{ formatEntryTime(entry) }}</span>
            <span class="text-[var(--border-divider)] select-none">/</span>
            <span
              class="px-1.5 py-0.2 rounded-xs border text-[11px] font-medium transition-colors"
              :class="{
                'border-[var(--accent-warm)]/40 bg-[var(--accent-warm)]/8 text-[var(--accent-warm)]': getEntryCategory(entry) === 'wish' || getEntryCategory(entry) === 'travel',
                'border-emerald-700/40 bg-emerald-700/8 text-emerald-700': entry.type === 'transaction' || entry.is_transaction,
                'border-[var(--border-subtle)] text-[var(--ink-secondary)]': !entry.is_transaction && getEntryCategory(entry) !== 'wish' && getEntryCategory(entry) !== 'travel',
              }"
            >
              {{ getCategoryName(entry) }}
            </span>
            <span v-if="entry.city_name || entry.location" class="text-[var(--ink-secondary)]">
              · {{ entry.city_name || entry.location }}
            </span>
          </div>

          <!-- 多态内容排版 (Polymorphic Layouts) -->

          <!-- 1. 账目形态 (Transaction)：单行账本微卡片，柴米油盐融入时间流 -->
          <div
            v-if="entry.type === 'transaction' || entry.is_transaction"
            class="inline-flex flex-wrap items-center gap-3 py-2.5 px-4 bg-[var(--bg-subtle)]/60 rounded-xs border border-[var(--border-subtle)] group-hover:border-[var(--border-divider)] transition-colors"
          >
            <span
              class="text-[11px] font-mono-archive text-[var(--ink-muted)] px-1.5 py-0.2 rounded-xs border border-[var(--border-subtle)]"
            >
              {{ entry.category || '日常' }}
            </span>
            <span class="font-serif-editorial text-base text-[var(--ink-primary)] font-medium">
              {{ entry.title }}
            </span>
            <span
              class="font-mono-archive text-base font-semibold"
              :class="entry.tx_type === 'income' ? 'text-[var(--accent-moss)]' : 'text-[var(--ink-primary)]'"
            >
              {{ entry.tx_type === 'income' ? '+' : '-' }}¥{{ formatMoney(entry.amount || 0) }}
            </span>
            <span v-if="entry.content" class="text-xs font-serif-editorial text-[var(--ink-muted)]">
              — {{ entry.content }}
            </span>
            <span
              v-if="entry.payment_method"
              class="text-[11px] font-mono-archive text-[var(--ink-muted)] hidden sm:inline"
            >
              ({{ entry.payment_method }})
            </span>
          </div>

          <!-- 2. 造物形态 (Project)：手艺与进展手记，关联母项目与仓库直链 -->
          <div
            v-else-if="getEntryCategory(entry) === 'project'"
            class="space-y-3 p-4 sm:p-5 rounded-xs border border-[var(--border-subtle)] bg-[var(--bg-subtle)]/30 group-hover:border-[var(--border-divider)] transition-colors max-w-2xl"
          >
            <div class="flex items-center justify-between">
              <span class="text-[11px] font-mono-archive tracking-widest text-[var(--accent-warm)]">
                造物手记 · {{ entry.project?.title || '长期创造' }}
              </span>
              <span v-if="entry.project?.status" class="text-[11px] font-mono-archive text-[var(--ink-muted)]">
                {{ entry.project.status }}
              </span>
            </div>
            <h3
              v-if="entry.title"
              class="text-xl font-serif-editorial font-medium text-[var(--ink-primary)] group-hover:text-[var(--accent-warm)] transition-colors"
            >
              {{ entry.title }}
            </h3>
            <div
              v-if="getEntryFirstImage(entry)"
              class="overflow-hidden rounded-xs border border-[var(--border-subtle)] bg-[var(--bg-archive)] max-w-xl"
              @click.stop="openLightbox(entry)"
            >
              <img
                :src="getEntryFirstImage(entry)"
                :alt="entry.title"
                class="w-full max-h-[420px] object-cover editorial-image"
                loading="lazy"
               decoding="async">
            </div>
            <div
              class="text-sm sm:text-base text-[var(--ink-secondary)] leading-relaxed font-serif-editorial"
              v-html="renderEditorialContent(entry.content)"
            ></div>
            <div v-if="entry.project?.github_url" class="pt-1">
              <a
                :href="entry.project.github_url"
                target="_blank"
                rel="noopener noreferrer"
                @click.stop
                class="inline-flex items-center gap-1.5 text-xs text-[var(--ink-primary)] hover-underline font-mono-archive"
              >
                <span>查看代码与项目仓库</span>
                <ArrowUpRight class="w-3.5 h-3.5" />
              </a>
            </div>
          </div>

          <!-- 3. 心愿形态 (Wish)：许愿、归册与拔草印记 -->
          <div
            v-else-if="getEntryCategory(entry) === 'wish'"
            class="space-y-3 p-4 sm:p-5 rounded-xs border border-[var(--border-subtle)] bg-[var(--bg-subtle)]/25 group-hover:border-[var(--accent-warm)]/60 transition-colors max-w-2xl"
          >
            <div class="flex items-center justify-between text-[11px] font-mono-archive tracking-widest text-[var(--accent-warm)]">
              <span>心愿印记 · {{ entry.wish?.kind === 'travel' ? '远方旅程' : entry.wish?.kind === 'milestone' ? '阶段目标' : '心仪好物' }}</span>
              <span v-if="entry.wish?.status" class="text-[var(--ink-muted)]">
                {{ entry.wish.status === 'fulfilled' ? '已圆满归册' : entry.wish.status === 'relinquished' ? '已理性拔草' : '期许中' }}
              </span>
            </div>
            <h3
              v-if="entry.title"
              class="text-xl font-serif-editorial font-medium text-[var(--ink-primary)] group-hover:text-[var(--accent-warm)] transition-colors"
            >
              {{ entry.title }}
            </h3>
            <div
              v-if="getEntryFirstImage(entry)"
              class="overflow-hidden rounded-xs border border-[var(--border-subtle)] bg-[var(--bg-archive)] max-w-xl cursor-zoom-in"
              @click.stop="openLightbox(entry)"
            >
              <img
                :src="getEntryFirstImage(entry)"
                :alt="entry.title"
                class="w-full max-h-[420px] object-cover editorial-image"
                loading="lazy"
               decoding="async">
            </div>
            <div
              class="text-sm sm:text-base text-[var(--ink-secondary)] leading-relaxed font-serif-editorial"
              v-html="renderEditorialContent(entry.content)"
            ></div>
          </div>

          <!-- 4. 无标题短随笔形态 (兼容轻量想法引言展示) -->
          <div v-else-if="!entry.title && !getEntryFirstImage(entry)" class="space-y-2">
            <blockquote
              class="font-serif-editorial text-lg sm:text-xl text-[var(--ink-primary)] leading-relaxed italic border-l-2 border-[var(--ink-muted)]/30 pl-4 py-1 group-hover:border-[var(--accent-warm)] transition-colors"
            >
              “{{ entry.content }}”
            </blockquote>
          </div>

          <!-- 5. 日常与游历形态 (Daily / Travel)：图文散页与胶片装裱 -->
          <div v-else class="space-y-3.5">
            <h3
              v-if="entry.title"
              class="text-xl sm:text-2xl font-serif-editorial font-medium tracking-tight text-[var(--ink-primary)] leading-snug group-hover:text-[var(--accent-warm)] transition-colors"
            >
              {{ entry.title }}
            </h3>

            <!-- 胶片装裱暗房底片框 (支持单图宽幅 / 双图并列 / 多图画廊拼版) -->
            <div
              v-if="getEntryImages(entry).length > 0"
              class="film-frame bg-[var(--bg-subtle)]/70 p-2 sm:p-3 rounded-xs border border-[var(--border-subtle)] max-w-2xl group/img space-y-2.5"
            >
              <!-- 单图宽幅：带哑光内框留白与画幅自适应 -->
              <div
                v-if="getEntryImages(entry).length === 1"
                class="relative w-full overflow-hidden rounded-xs bg-[var(--bg-archive)] cursor-zoom-in border border-[var(--border-subtle)]/70 p-1.5 sm:p-2"
                @click.stop="openLightbox(entry, getEntryImages(entry)[0].url)"
              >
                <img
                  :src="getEntryImages(entry)[0].url"
                  :alt="entry.title"
                  class="w-full max-h-[580px] object-contain sm:object-cover rounded-xs editorial-image group-hover/img:scale-[1.008] transition-transform duration-500 mx-auto"
                  loading="lazy"
                 decoding="async">
                <div class="absolute bottom-3 right-3 px-2 py-0.5 bg-black/60 backdrop-blur-xs text-white text-[11px] font-mono-archive rounded-xs opacity-0 group-hover/img:opacity-100 transition-opacity flex items-center gap-1 shadow-xs">
                  <Maximize2 class="w-3 h-3" />
                  <span>暗房灯箱</span>
                </div>
              </div>

              <!-- 双图对称拼版：画幅自适应与独立边框 -->
              <div
                v-else-if="getEntryImages(entry).length === 2"
                class="grid grid-cols-1 sm:grid-cols-2 gap-2.5 p-1 bg-[var(--bg-archive)]/60 rounded-xs border border-[var(--border-subtle)]/70"
              >
                <div
                  v-for="(img, imgIdx) in getEntryImages(entry)"
                  :key="img.id || imgIdx"
                  class="relative overflow-hidden rounded-xs bg-[var(--bg-archive)] cursor-zoom-in aspect-[4/3] group/single border border-[var(--border-subtle)]/50"
                  @click.stop="openLightbox(entry, img.url)"
                >
                  <img
                    :src="img.url"
                    :alt="entry.title"
                    class="w-full h-full object-cover editorial-image group-hover/single:scale-105 transition-transform duration-300"
                    loading="lazy"
                   decoding="async">
                  <div class="absolute bottom-2 right-2 px-1.5 py-0.5 bg-black/60 backdrop-blur-xs text-white text-[11px] font-mono-archive rounded-xs opacity-0 group-hover/single:opacity-100 transition-opacity">
                    EXP. {{ String(imgIdx + 1).padStart(2, '0') }}
                  </div>
                </div>
              </div>

              <!-- 3+ 多图画廊拼版：自然网格比例与帧号标示 -->
              <div
                v-else
                class="grid grid-cols-2 sm:grid-cols-3 gap-2.5 p-1 bg-[var(--bg-archive)]/60 rounded-xs border border-[var(--border-subtle)]/70"
              >
                <div
                  v-for="(img, imgIdx) in getEntryImages(entry)"
                  :key="img.id || imgIdx"
                  class="relative overflow-hidden rounded-xs bg-[var(--bg-archive)] cursor-zoom-in aspect-[4/3] group/single border border-[var(--border-subtle)]/50"
                  @click.stop="openLightbox(entry, img.url)"
                >
                  <img
                    :src="img.url"
                    :alt="entry.title"
                    class="w-full h-full object-cover editorial-image group-hover/single:scale-105 transition-transform duration-300"
                    loading="lazy"
                   decoding="async">
                  <div class="absolute bottom-1.5 right-1.5 px-1.5 py-0.5 bg-black/60 backdrop-blur-xs text-white text-[11px] font-mono-archive rounded-xs opacity-0 group-hover/single:opacity-100 transition-opacity">
                    EXP. {{ String(imgIdx + 1).padStart(2, '0') }}
                  </div>
                </div>
              </div>

              <!-- 暗房相纸底款：EXP 编号、相纸张数与地点坐标 -->
              <div class="px-1.5 pt-1 flex items-center justify-between text-[11px] font-mono-archive text-[var(--ink-muted)]">
                <span class="tracking-wider flex items-center gap-1.5">
                  <span class="inline-block w-1.5 h-1.5 rounded-full bg-[var(--accent-warm)]/70"></span>
                  <span>EXP. {{ String(index + 1).padStart(2, '0') }} · {{ getEntryImages(entry).length }} 张相纸装裱</span>
                </span>
                <span v-if="entry.city_name || entry.location" class="tracking-wide text-[var(--ink-secondary)]">
                  {{ entry.city_name || entry.location }}
                </span>
              </div>
            </div>

            <div
              class="text-base sm:text-lg text-[var(--ink-secondary)] leading-[1.8] font-normal max-w-2xl font-serif-editorial prose-editorial"
              v-html="renderEditorialContent(entry.content)"
            ></div>
          </div>

          <!-- 悬浮显露轻量操作提示 -->
          <div
            class="pt-1 text-[11px] font-mono-archive text-[var(--ink-muted)] opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1"
          >
            <span>查看详情 / 编辑 →</span>
          </div>
        </article>
      </template>
    </div>

    <!-- MOB-P1-67：窗口化加载更多 -->
    <div v-if="hasMoreEntries" class="flex flex-col items-center gap-3 py-8">
      <button
        type="button"
        @click="loadMoreEntries"
        class="px-5 py-2.5 border border-[var(--border-subtle)] hover:border-[var(--ink-primary)] text-[var(--ink-secondary)] hover:text-[var(--ink-primary)] rounded-xs transition-colors cursor-pointer font-mono-archive text-xs"
      >
        继续翻阅更早的记录（已展开 {{ visibleCount }} / {{ filteredEntries.length }}）
      </button>
      <span class="text-[11px] text-[var(--ink-muted)] font-mono-archive">
        更早的记录会按需展开，避免一次性铺满整页
      </span>
    </div>

    <!-- 暗房底片灯箱 -->
    <EditorialLightbox
      :isOpen="isLightboxOpen"
      :imageUrl="lightboxPayload.imageUrl"
      :title="lightboxPayload.title"
      :meta="lightboxPayload.meta"
      :location="lightboxPayload.location"
      :date="lightboxPayload.date"
      @close="isLightboxOpen = false"
    />
  </div>
</template>
