<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import type { LifeEntry, ArchiveCategory } from '../types'
import { getEntryCategory, entryMatchesCategory } from '../types'
import { ArrowUpRight, Maximize2 } from 'lucide-vue-next'
import EditorialLightbox from './EditorialLightbox.vue'
import { formatMoney, parseOccurredDate } from '../utils/format'

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

// 视图过滤分类 (4 大纯化形态 + 账目投影)
const categoryFilters: { key: ArchiveCategory; label: string }[] = [
  { key: 'all', label: '全部记录' },
  { key: 'daily', label: '日常' },
  { key: 'travel', label: '游历' },
  { key: 'project', label: '造物' },
  { key: 'wish', label: '心愿' },
  { key: 'transaction', label: '账目' },
]

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
    <!-- 视角分类筛选栏 (极简呼吸感) -->
    <div
      v-if="showFilters"
      class="flex flex-wrap items-center gap-x-6 gap-y-2 mb-12 text-xs font-mono-archive text-[var(--ink-muted)] border-b border-[var(--border-subtle)] pb-4"
    >
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

    <!-- 空状态 -->
    <div v-if="filteredEntries.length === 0" class="py-20 text-center space-y-4">
      <div class="space-y-1.5 font-serif-editorial">
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
              : '还没有记录'
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

    <!-- 核心：纵向时间线 (Vertical Spine Timeline) -->
    <div
      v-else
      class="relative pl-6 sm:pl-10 border-l border-[var(--border-subtle)] ml-3 sm:ml-5 space-y-12 sm:space-y-16 py-2"
    >
      <template v-for="(entry, index) in filteredEntries" :key="entry.id">
        <!-- 岁月留白刻度 (跨越 >= 14 天的静默时段) -->
        <div
          v-if="getGapDays(index) >= 14"
          class="relative py-2 flex items-center gap-3 sm:gap-4 text-xs font-mono-archive text-[var(--ink-muted)] select-none -my-4 sm:-my-6"
        >
          <!-- 标尺切线点 -->
          <div class="absolute -left-[30px] sm:-left-[46px] w-2.5 h-px bg-[var(--ink-muted)]/60"></div>
          <span class="tracking-widest text-[11px] text-[var(--ink-muted)]/80">
            跨越 {{ getGapDays(index) }} 天的时光留白
          </span>
          <span class="flex-grow h-px bg-[var(--border-subtle)]/70 max-w-xs"></span>
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

          <!-- 顶部元信息行：日期 · 时间 · 类型标签 · 地点 -->
          <div class="flex items-center gap-2 text-xs font-mono-archive text-[var(--ink-muted)] mb-2.5">
            <span class="font-semibold text-[var(--ink-primary)]">
              {{ formatEntryDate(entry) }}
            </span>
            <span v-if="formatEntryTime(entry)">· {{ formatEntryTime(entry) }}</span>
            <span>·</span>
            <span
              class="text-[var(--ink-secondary)]"
              :class="{
                'text-[var(--accent-warm)] font-medium': getEntryCategory(entry) === 'wish' || getEntryCategory(entry) === 'travel',
                'text-emerald-700 font-medium': entry.type === 'transaction' || entry.is_transaction,
              }"
            >
              {{ getCategoryName(entry) }}
            </span>
            <span v-if="entry.city_name || entry.location" class="hidden sm:inline text-[var(--ink-muted)]">
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
              <span class="text-[10px] font-mono-archive tracking-widest text-[var(--accent-warm)]">
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
              />
            </div>
            <p class="text-sm sm:text-base text-[var(--ink-secondary)] leading-relaxed font-serif-editorial whitespace-pre-line">
              {{ entry.content }}
            </p>
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
            <div class="flex items-center justify-between text-[10px] font-mono-archive tracking-widest text-[var(--accent-warm)]">
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
              />
            </div>
            <p class="text-sm sm:text-base text-[var(--ink-secondary)] leading-relaxed font-serif-editorial whitespace-pre-line">
              {{ entry.content }}
            </p>
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
          <div v-else class="space-y-3">
            <h3
              v-if="entry.title"
              class="text-xl sm:text-2xl font-serif-editorial font-medium tracking-tight text-[var(--ink-primary)] leading-snug group-hover:text-[var(--accent-warm)] transition-colors"
            >
              {{ entry.title }}
            </h3>

            <!-- 胶片装裱暗房底片框 -->
            <div
              v-if="getEntryFirstImage(entry)"
              class="film-frame bg-[var(--bg-subtle)]/80 p-2.5 sm:p-3 rounded-xs border border-[var(--border-subtle)] max-w-2xl cursor-zoom-in group/img space-y-2"
              @click.stop="openLightbox(entry)"
              title="点击在暗房灯箱中放大"
            >
              <div class="relative w-full overflow-hidden rounded-xs bg-[var(--bg-archive)]">
                <img
                  :src="getEntryFirstImage(entry)"
                  :alt="entry.title"
                  class="w-full max-h-[520px] object-cover editorial-image group-hover/img:scale-[1.01] transition-transform duration-500"
                  loading="lazy"
                />
                <div class="absolute bottom-2 right-2 px-2 py-1 bg-black/60 backdrop-blur-xs text-white text-[10px] font-mono-archive rounded-xs opacity-0 group-hover/img:opacity-100 transition-opacity flex items-center gap-1">
                  <Maximize2 class="w-3 h-3" />
                  <span>暗房灯箱</span>
                </div>
              </div>

              <!-- 暗房相纸底款：EXP 编号与地点坐标 -->
              <div class="px-1 flex items-center justify-between text-[11px] font-mono-archive text-[var(--ink-muted)]">
                <span class="tracking-widest">EXP. {{ String(index + 1).padStart(2, '0') }} · 胶片装裱</span>
                <span v-if="entry.city_name || entry.location">{{ entry.city_name || entry.location }}</span>
              </div>
            </div>

            <p
              class="text-base sm:text-lg text-[var(--ink-secondary)] leading-relaxed font-normal whitespace-pre-line max-w-2xl font-serif-editorial"
            >
              {{ entry.content }}
            </p>
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

    <!-- 空状态提示 (RC-38) -->
    <div
      v-if="entries.length === 0"
      class="py-24 text-center space-y-3 font-serif-editorial text-[var(--ink-muted)]"
    >
      <p class="text-xl text-[var(--ink-primary)]">
        暂无生活印记收录
      </p>
      <p class="font-mono-archive text-xs tracking-wider">
        每一刻具体的日常都值得定格。点击右下角「+」写下第一篇档案。
      </p>
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
