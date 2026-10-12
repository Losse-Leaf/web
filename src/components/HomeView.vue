<script setup lang="ts">
import { ref, computed } from 'vue'
import type { LifeEntry, ArchiveCategory, SiteConfig, CuratorProfile } from '../types'
import LifeActivityMap from './LifeActivityMap.vue'
import MiniAtlasWidget from './MiniAtlasWidget.vue'
import LifeStream from './LifeStream.vue'
import { getBeijingDotDate } from '../utils/format'
import { ArrowRight } from 'lucide-vue-next'

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

const todayDisplay = computed(() => getBeijingDotDate())

// 刊物品牌名（由后端配置单一驱动 RC-40）
const displaySiteName = computed(() => {
  return props.config?.site_name?.split('·')?.[0]?.trim() || '散页'
})

// 刊物副标题（由后端配置单一驱动 RC-40）
const displaySubtitle = computed(() => {
  return props.config?.site_subtitle || '时光手账与生活档案 · 记录真实可感的日子'
})

const heatmapEntries = computed(() => props.allEntries || props.entries)

const handleDateSelect = (date: string) => {
  selectedDate.value = date
  if (date) {
    const el = document.getElementById('timeline-section')
    if (el) {
      el.scrollIntoView({ behavior: 'smooth' })
    }
  }
}

const currentCategoryInfo = computed(() => {
  switch (props.currentCategory) {
    case 'daily':
      return {
        label: '日常',
        title: '日常 · 生活时间流',
        desc: '身边琐事与随笔思考：记录日常起居、片刻念头与定格光影',
      }
    case 'travel':
      return {
        label: '游历',
        title: '游历 · 生活时间流',
        desc: '山川行迹与漫游记忆：踏足远方城市、点亮足迹图谱的旅途印记',
      }
    case 'project':
      return {
        label: '造物',
        title: '造物 · 生活时间流',
        desc: '创造与探索：造物项目立项、进展手记、开源实践与长线创作',
      }
    case 'wish':
      return {
        label: '心愿',
        title: '心愿 · 生活时间流',
        desc: '期许与圆满：许下心愿、好物归册与理性拔草的时光流转',
      }
    case 'transaction':
      return {
        label: '账目',
        title: '账目 · 生活时间流',
        desc: '柴米油盐与资产变动：日常收支、心愿兑现与固定资产流转',
      }
    default:
      return {
        label: '全部记录',
        title: '全部记录 · 生活时间流',
        desc: '完整生活时间线：日常、游历、造物与心愿自然相融',
      }
  }
})
const showGraph = ref(true)
const graphTab = ref<'time' | 'space'>('time')
</script>

<template>
  <div class="max-w-4xl mx-auto px-4 sm:px-8 text-left">
    
    <!-- 开篇封面 (紧凑、静默、优雅的自白引言) -->
    <section class="pt-10 sm:pt-16 pb-8 border-b border-[var(--border-subtle)]">
      <div class="space-y-4">
        <div class="flex items-baseline justify-between">
          <h1 class="font-serif-editorial text-3xl sm:text-5xl font-medium tracking-tight text-[var(--ink-primary)]">
            {{ displaySiteName }}
          </h1>
          <span class="font-mono-archive text-xs text-[var(--ink-muted)]">
            {{ profile?.current_city || profile?.location?.split('·')?.[1]?.trim() || config?.default_location?.split('·')?.[1]?.trim() || '未知' }} · {{ todayDisplay }}
          </span>
        </div>

        <p class="font-serif-editorial text-xs sm:text-sm tracking-wider text-[var(--ink-muted)]">
          {{ displaySubtitle }}
        </p>

        <p class="font-serif-editorial text-base sm:text-lg text-[var(--ink-secondary)] leading-relaxed italic max-w-2xl pt-1">
          “{{ profile?.motto || '我做过的事，我看过的风景，我思考过的念头，和我不想遗忘的瞬间。' }}”
        </p>
      </div>
    </section>

    <!-- 生活图谱：时间热力 ⟷ 空间足迹 双 Tab 切换 (FE-12) -->
    <section class="py-4 border-b border-[var(--border-subtle)]">
      <div class="flex items-center justify-between text-xs font-mono-archive text-[var(--ink-muted)]">
        <div class="flex items-center gap-3">
          <button
            @click="graphTab = 'time'; showGraph = true"
            class="transition-colors cursor-pointer"
            :class="graphTab === 'time' && showGraph ? 'text-[var(--ink-primary)] font-bold border-b border-[var(--ink-primary)]' : 'text-[var(--ink-muted)] hover:text-[var(--ink-primary)]'"
          >
            时间热力 (在册 {{ heatmapEntries.length }} 条)
          </button>
          <span>·</span>
          <button
            @click="graphTab = 'space'; showGraph = true"
            class="transition-colors cursor-pointer"
            :class="graphTab === 'space' && showGraph ? 'text-[var(--ink-primary)] font-bold border-b border-[var(--ink-primary)]' : 'text-[var(--ink-muted)] hover:text-[var(--ink-primary)]'"
          >
            空间足迹
          </button>
        </div>
        <div class="flex items-center gap-3">
          <button
            v-if="graphTab === 'space' && showGraph"
            @click="emit('navigate', 'atlas')"
            class="hover:text-[var(--ink-primary)] cursor-pointer text-xs"
          >
            进入全图 ↗
          </button>
          <button
            @click="showGraph = !showGraph"
            class="hover:text-[var(--ink-primary)] cursor-pointer hover-underline text-xs"
          >
            {{ showGraph ? '收起图谱 ▲' : '展开图谱 ▼' }}
          </button>
        </div>
      </div>

      <div v-if="showGraph" class="pt-4 animate-in fade-in duration-200">
        <LifeActivityMap
          v-if="graphTab === 'time'"
          :entries="heatmapEntries"
          :selectedDate="selectedDate"
          @selectDate="handleDateSelect"
        />
        <MiniAtlasWidget
          v-else
          :refreshTrigger="heatmapEntries.length"
          @navigateAtlas="emit('navigate', 'atlas')"
        />
      </div>
    </section>

    <!-- 核心主角：纵向生活时间线 (Timeline / Life Stream) -->
    <section id="timeline-section" class="pt-10 sm:pt-14 pb-28">
      
      <!-- 动态标题与视角说明 -->
      <div class="flex items-baseline justify-between pb-6 mb-8 border-b border-[var(--border-subtle)]">
        <div class="space-y-1">
          <div class="flex items-center gap-2">
            <h2 class="text-lg font-serif-editorial font-medium tracking-tight text-[var(--ink-primary)]">
              {{ currentCategoryInfo.title }}
            </h2>
            <span class="text-xs font-mono-archive text-[var(--ink-muted)]">
              （当前视图 {{ entries.length }} 条）
            </span>
          </div>
          <p class="text-xs font-mono-archive text-[var(--ink-muted)]">
            {{ currentCategoryInfo.desc }}
          </p>
        </div>

        <button
          @click="emit('navigate', 'archive')"
          class="text-xs font-mono-archive text-[var(--ink-muted)] hover:text-[var(--ink-primary)] hover-underline cursor-pointer flex items-center gap-1"
        >
          <span>按年归档</span>
          <ArrowRight class="w-3.5 h-3.5" />
        </button>
      </div>

      <!-- 纵向时间线 (带 7 重视角切换) -->
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
