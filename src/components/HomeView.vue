<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import type { LifeEntry, ArchiveCategory, SiteConfig, CuratorProfile } from '../types'
import LifeStream from './LifeStream.vue'
// MOB-P2-77：足迹宫格只在有足迹数据时才渲染，
// 而它静态 import 的城市字典（375 城 / 34KB）会把字典拖进首屏 chunk。
// 这里改为异步组件，让字典随该组件按需加载。
import { defineAsyncComponent } from 'vue'
const MiniAtlasWidget = defineAsyncComponent(() => import('./MiniAtlasWidget.vue'))
import { fetchOnThisDayEntries } from '../utils/api'
import { getBeijingDotDate, getBeijingYear, parseOccurredDate } from '../utils/format'

const props = defineProps<{
  entries: LifeEntry[]
  allEntries?: LifeEntry[]
  currentCategory?: ArchiveCategory
  config?: SiteConfig | null
  profile?: CuratorProfile | null
}>()

const emit = defineEmits<{
  (e: 'navigate', view: string): void
  (e: 'changeCategory', category: ArchiveCategory): void
  (e: 'selectEntry', entry: LifeEntry): void
  (e: 'openAdd'): void
}>()

const selectedDate = ref<string>('')
const remoteOnThisDay = ref<LifeEntry[]>([])

const todayDisplay = computed(() => getBeijingDotDate())

const onThisDayEntries = computed<LifeEntry[]>(() => {
  const currentYear = getBeijingYear()
  const [, todayMonth, todayDay] = todayDisplay.value.split('.')
  const map = new Map<number, LifeEntry>()

  for (const item of remoteOnThisDay.value) {
    if (item && item.id && !item.is_transaction) {
      map.set(item.id, item)
    }
  }

  const localSource = props.allEntries && props.allEntries.length > 0 ? props.allEntries : props.entries
  for (const item of localSource) {
    if (!item || !item.id || item.is_transaction || item.type === 'transaction') continue
    const parsed = parseOccurredDate(item.occurred_at)
    if (
      parsed.month === todayMonth &&
      parsed.day === todayDay &&
      Number(parsed.year) > 0 &&
      Number(parsed.year) < currentYear
    ) {
      if (!map.has(item.id)) {
        map.set(item.id, item)
      }
    }
  }

  return Array.from(map.values()).sort(
    (a, b) => parseOccurredDate(b.occurred_at).timestamp - parseOccurredDate(a.occurred_at).timestamp
  )
})

const formatYearsAgoLabel = (entry: LifeEntry): string => {
  const parsed = parseOccurredDate(entry.occurred_at)
  const yearsAgo = Math.max(1, getBeijingYear() - Number(parsed.year))
  return `${yearsAgo} 年前 · ${parsed.dotDate}`
}

onMounted(async () => {
  try {
    const res = await fetchOnThisDayEntries()
    if (res && Array.isArray(res.entries)) {
      remoteOnThisDay.value = res.entries
    }
  } catch {
    // 静默回退至本地 entries 历史同月同日筛选
  }
})

// 刊物品牌名（由后端配置单一驱动 RC-40）
const displaySiteName = computed(() => {
  return props.config?.site_name?.split('·')?.[0]?.trim() || '散页'
})

// 刊物副标题（由后端配置驱动，若为旧版时光手账口号则升级为全维度副标）
const displaySubtitle = computed(() => {
  const raw = props.config?.site_subtitle
  if (!raw || raw.includes('时光手账')) {
    return '日常 · 资产 · 心愿 · 行迹 · 造物'
  }
  return raw
})

// 顶部常驻城市展示（无配置时不显示“未知”，仅显示日期）
const headerLocation = computed(() => {
  return (
    props.profile?.current_city ||
    props.profile?.location?.split('·')?.[1]?.trim() ||
    props.profile?.location?.trim() ||
    props.config?.default_location?.split('·')?.[1]?.trim() ||
    props.config?.default_location?.trim() ||
    ''
  )
})
</script>

<template>
  <div class="max-w-5xl mx-auto px-4 sm:px-8 text-left">
    
    <!-- 开篇抬头 (紧凑、静默、干净) -->
    <section class="pt-10 sm:pt-16 pb-8 border-b border-[var(--border-subtle)]">
      <div class="space-y-3">
        <div class="flex items-baseline justify-between gap-4">
          <div class="flex flex-wrap items-baseline gap-3.5">
            <h1 class="type-page-heading text-[var(--ink-primary)]">
              {{ displaySiteName }}
            </h1>
            <span class="type-mono-meta tracking-widest text-[var(--ink-muted)]">
              {{ displaySubtitle }}
            </span>
          </div>
          <span class="type-mono-meta text-[var(--ink-muted)] shrink-0">
            <template v-if="headerLocation">{{ headerLocation }} · </template>{{ todayDisplay }}
          </span>
        </div>

        <p
          v-if="profile?.motto"
          class="font-serif-editorial text-sm sm:text-base text-[var(--ink-secondary)] leading-relaxed italic max-w-2xl pt-1 prose-editorial"
        >
          “{{ profile.motto }}”
        </p>
      </div>
    </section>

    <!-- 那年今日 · 岁月回响 (On This Day 历史同日旧信笺卡片) -->
    <section
      v-if="onThisDayEntries.length > 0"
      class="relative mt-6 p-4 sm:p-5 rounded-xs border border-[var(--accent-warm)]/35 bg-[var(--bg-subtle)]/65 space-y-3.5 shadow-2xs"
    >
      <!-- 四角复古裁切基准线 -->
      <span class="pointer-events-none select-none absolute top-1.5 left-2 text-[11px] text-[var(--accent-warm)]/50 font-mono-archive">⌜</span>
      <span class="pointer-events-none select-none absolute top-1.5 right-2 text-[11px] text-[var(--accent-warm)]/50 font-mono-archive">⌝</span>
      <span class="pointer-events-none select-none absolute bottom-1.5 left-2 text-[11px] text-[var(--accent-warm)]/50 font-mono-archive">⌞</span>
      <span class="pointer-events-none select-none absolute bottom-1.5 right-2 text-[11px] text-[var(--accent-warm)]/50 font-mono-archive">⌟</span>

      <div class="flex items-center justify-between text-xs font-mono-archive px-1">
        <div class="flex items-center gap-2.5 text-[var(--accent-warm)]">
          <span class="vermilion-seal px-1.5 py-0.5 text-[11px] tracking-widest font-semibold">岁月回响</span>
          <span class="tracking-widest font-medium">那年今日 · ON THIS DAY</span>
        </div>
        <span class="text-[11px] text-[var(--ink-muted)]">
          共 {{ onThisDayEntries.length }} 篇往年同日印记
        </span>
      </div>

      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div
          v-for="item in onThisDayEntries.slice(0, 4)"
          :key="item.id"
          @click="emit('selectEntry', item)"
          class="p-3.5 rounded-xs border border-[var(--border-subtle)] bg-[var(--bg-archive)]/90 hover:bg-[var(--bg-archive)] hover:border-[var(--accent-warm)]/65 hover:shadow-xs transition-all duration-300 cursor-pointer group space-y-1.5"
        >
          <div class="flex items-center justify-between text-[11px] font-mono-archive text-[var(--ink-muted)]">
            <span class="text-[var(--accent-warm)] font-medium">{{ formatYearsAgoLabel(item) }}</span>
            <span v-if="item.city_name || item.location" class="truncate max-w-[120px]">
              {{ item.city_name || item.location }}
            </span>
          </div>
          <h4
            v-if="item.title"
            class="font-serif-editorial text-sm sm:text-base font-medium text-[var(--ink-primary)] group-hover:text-[var(--accent-warm)] transition-colors truncate"
          >
            {{ item.title }}
          </h4>
          <p class="font-serif-editorial text-xs sm:text-sm text-[var(--ink-secondary)] line-clamp-2 leading-relaxed">
            {{ item.content }}
          </p>
        </div>
      </div>
    </section>

    <!-- 迷你山河印谱概览 (Mini Atlas Widget RC-130) -->
    <section class="mt-6">
      <MiniAtlasWidget
        @navigateAtlas="emit('navigate', 'atlas')"
      />
    </section>

    <!-- 核心主角：纵向生活时间线 (Timeline / Life Stream) -->
    <section id="timeline-section" class="pt-6 pb-28">
      <LifeStream
        :entries="entries"
        :limit="0"
        :showFilters="true"
        :dateFilter="selectedDate"
        :currentCategory="currentCategory"
        @clearDateFilter="selectedDate = ''"
        @changeCategory="emit('changeCategory', $event)"
        @selectEntry="emit('selectEntry', $event)"
        @openAdd="emit('openAdd')"
      />
    </section>

  </div>
</template>
