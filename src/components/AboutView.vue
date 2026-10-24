<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch, defineAsyncComponent } from 'vue'
import {
  ArrowUpRight,
  BookOpen,
  Calendar,
  Edit3,
  MapPin,
  Mail,
  Github,
  X,
} from 'lucide-vue-next'
import type { CuratorProfile, LifeEntry } from '../types'
import { loadCuratorProfile } from '../utils/profile'
import { getAdminToken } from '../utils/api'
import { getBeijingYear, parseOccurredDate } from '../utils/format'
import EditorialLightbox from './EditorialLightbox.vue'
import LifeActivityMap from './LifeActivityMap.vue'

const ProfileEditModal = defineAsyncComponent(() => import('./ProfileEditModal.vue'))
const AlmanacModal = defineAsyncComponent(() => import('./AlmanacModal.vue'))

const props = defineProps<{
  profile?: CuratorProfile | null
  entries?: LifeEntry[]
}>()

const emit = defineEmits<{
  (e: 'profileUpdated', profile: CuratorProfile): void
  (e: 'requestAuth', callback: () => void): void
  (e: 'selectEntry', entry: LifeEntry): void
}>()

const isAdmin = computed(() => Boolean(getAdminToken()))

// 版权年份按北京时间基准 (RC-134)
const currentYear = getBeijingYear()

// 内部编辑用的主理人档案 (RC-29)
const localProfile = ref<CuratorProfile>(loadCuratorProfile())
const isEditOpen = ref(false)
const isLightboxOpen = ref(false)
const selectedCategory = ref<string>('all')

// 年度生活年鉴状态与年份列表
const isAlmanacOpen = ref(false)
const almanacYear = ref<number>(currentYear)
const selectedHeatmapDate = ref<string>('')

const allEntries = computed(() => props.entries || [])

const availableAlmanacYears = computed(() => {
  let minYear = currentYear
  allEntries.value.forEach((entry) => {
    const y = parseInt(parseOccurredDate(entry.occurred_at).year, 10)
    if (!isNaN(y) && y >= 2000 && y <= currentYear) {
      if (y < minYear) minYear = y
    }
  })
  const list: number[] = []
  for (let y = currentYear; y >= minYear; y--) {
    list.push(y)
  }
  return list
})

const selectedDateEntries = computed(() => {
  if (!selectedHeatmapDate.value) return []
  // 热力图日期是点号格式（2026.10.24），dateKey 是连字符（2026-10-24），
  // 统一成连字符再比较 —— 原先格式不匹配导致点任何日期速览恒为 0 条
  const selectedKey = selectedHeatmapDate.value.replace(/\./g, '-')
  return allEntries.value.filter(
    (entry) => parseOccurredDate(entry.occurred_at).dateKey === selectedKey
  )
})

const openAlmanacForYear = (year: number) => {
  almanacYear.value = year
  isAlmanacOpen.value = true
}

const handleOpenEdit = () => {
  if (!isAdmin.value) {
    emit('requestAuth', () => {
      isEditOpen.value = true
    })
    return
  }
  isEditOpen.value = true
}

// 当父组件传入的 profile prop 变化时，合并到 localProfile
watch(
  () => props.profile,
  (newP) => {
    if (newP) {
      localProfile.value = {
        ...localProfile.value,
        ...newP,
        email: newP.email ?? newP.social_links?.email ?? localProfile.value.email,
        github: newP.github ?? newP.social_links?.github ?? localProfile.value.github,
        edc_gear: newP.edc_gear ?? localProfile.value.edc_gear,
      }
    }
  },
  { immediate: true }
)

const categories = computed(() => {
  const set = new Set<string>()
  const gears = localProfile.value.edc_gear || []
  gears.forEach((g) => {
    if (g.category) set.add(g.category)
  })
  return Array.from(set)
})

const filteredGear = computed(() => {
  const gears = localProfile.value.edc_gear || []
  if (selectedCategory.value === 'all') return gears
  return gears.filter((g) => g.category === selectedCategory.value)
})

const handleProfileUpdated = (updated: CuratorProfile) => {
  localProfile.value = updated
  emit('profileUpdated', updated)
}

// GitHub 用户名提取
const githubUsername = computed(() => {
  const url = localProfile.value.github || localProfile.value.social_links?.github || ''
  const match = url.match(/github\.com\/([^/]+)/)
  return match ? match[1] : ''
})

// 城市提取
const cityDisplay = computed(() => {
  return (
    localProfile.value.current_city ||
    localProfile.value.location?.split('·')[1]?.trim() ||
    localProfile.value.location ||
    ''
  )
})

// 印章首字提取（未上传头像时显示雅致方印，而非巨幅空白占位框）
const sealChar = computed(() => {
  const raw = (localProfile.value.name || '').trim()
  return raw ? raw.charAt(0) : '散'
})

// 全局档案更新事件：具名 handler ＋ 卸载时清理
const handleProfileUpdatedEvent = (e: Event) => {
  const detail = (e as CustomEvent<CuratorProfile>).detail
  if (detail) localProfile.value = detail
}

onMounted(() => {
  window.addEventListener('looseleaf-profile-updated', handleProfileUpdatedEvent)
})

onUnmounted(() => {
  window.removeEventListener('looseleaf-profile-updated', handleProfileUpdatedEvent)
})
</script>

<template>
  <div class="max-w-5xl mx-auto px-4 sm:px-8 py-10 sm:py-20 text-left space-y-12">
    
    <!-- 顶部个人抬头：小巧印章/头像 + 个人状态 + 年鉴与编辑入口 -->
    <header class="pb-10 border-b border-[var(--border-subtle)] flex flex-col md:flex-row md:items-center justify-between gap-6">
      <div class="flex items-start sm:items-center gap-4 sm:gap-5">
        <!-- 紧凑头像或朱砂方印 -->
        <button
          v-if="localProfile.avatar_url"
          @click="isLightboxOpen = true"
          class="w-14 h-14 sm:w-16 sm:h-16 rounded-xs overflow-hidden border border-[var(--border-subtle)] bg-[var(--bg-subtle)] shrink-0 cursor-zoom-in group"
        >
          <img
            :src="localProfile.avatar_url"
            :alt="localProfile.name || '主理人'"
            class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
           loading="lazy" decoding="async">
        </button>
        <div
          v-else
          class="w-12 h-12 sm:w-14 sm:h-14 rounded-xs border-2 border-[#b94a3b]/80 bg-[#b94a3b]/10 text-[#b94a3b] flex items-center justify-center font-serif-editorial text-xl sm:text-2xl font-medium shrink-0 select-none"
        >
          {{ sealChar }}
        </div>

        <div class="space-y-1.5 min-w-0">
          <div class="flex flex-wrap items-baseline gap-3">
            <h1 class="type-page-heading text-[var(--ink-primary)]">
              {{ localProfile.name || '主理人' }}
            </h1>
            <span class="type-mono-meta tracking-widest text-[var(--ink-muted)]">
              {{ localProfile.title || '岁月总览 · 生活刻度 · 随身器物' }}
            </span>
          </div>

          <!-- 坐标、一句话近况与外链微标 -->
          <div class="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs font-mono-archive text-[var(--ink-muted)]">
            <span v-if="cityDisplay" class="inline-flex items-center gap-1 text-[var(--ink-secondary)]">
              <MapPin class="w-3.5 h-3.5 text-[var(--accent-warm)]" />
              <span>{{ cityDisplay }}</span>
            </span>

            <span v-if="localProfile.motto" class="font-serif-editorial italic text-[var(--ink-secondary)]">
              “{{ localProfile.motto }}”
            </span>

            <a
              v-if="localProfile.email"
              :href="`mailto:${localProfile.email}`"
              class="inline-flex items-center gap-1 hover:text-[var(--ink-primary)] hover-underline"
            >
              <Mail class="w-3 h-3" />
              <span>{{ localProfile.email }}</span>
            </a>

            <a
              v-if="localProfile.github"
              :href="localProfile.github"
              target="_blank"
              rel="noopener noreferrer"
              class="inline-flex items-center gap-0.5 hover:text-[var(--ink-primary)] hover-underline"
            >
              <Github class="w-3 h-3" />
              <span>{{ githubUsername ? `@${githubUsername}` : 'GitHub' }}</span>
              <ArrowUpRight class="w-3 h-3" />
            </a>
          </div>
        </div>
      </div>

      <!-- 右侧操作按钮组 -->
      <div class="flex flex-wrap items-center gap-3 shrink-0">
        <button
          @click="openAlmanacForYear(almanacYear)"
          class="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xs bg-[var(--ink-primary)] text-[var(--bg-archive)] text-xs font-mono-archive hover:opacity-90 transition-opacity cursor-pointer shadow-xs"
        >
          <BookOpen class="w-3.5 h-3.5" />
          <span>{{ almanacYear }} 年度年鉴</span>
        </button>

        <button
          @click="handleOpenEdit"
          class="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono-archive border border-[var(--border-subtle)] hover:border-[var(--ink-primary)] rounded-xs transition-colors cursor-pointer text-[var(--ink-secondary)] hover:text-[var(--ink-primary)]"
        >
          <Edit3 class="w-3.5 h-3.5" />
          <span>{{ isAdmin ? '编辑个人资料' : '编辑资料 (需登录)' }}</span>
        </button>
      </div>
    </header>

    <!-- 第一板块：生活刻度 · 编年时间热力图与年度卷宗 -->
    <section class="space-y-5">
      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div class="space-y-1">
          <div class="flex items-center gap-2.5">
            <h2 class="font-serif-editorial text-xl sm:text-2xl font-normal text-[var(--ink-primary)]">
              生活刻度 · 时间热力图
            </h2>
            <span class="font-mono-archive text-xs text-[var(--ink-muted)]">
              （累计在册 {{ allEntries.length }} 篇记录）
            </span>
          </div>
          <p class="font-mono-archive text-xs text-[var(--ink-muted)]">
            编年刻度与年度总结画报
          </p>
        </div>

        <!-- 年份年鉴快捷切换签 -->
        <div class="flex flex-wrap items-center gap-1.5 font-mono-archive text-xs">
          <span class="text-[var(--ink-muted)] mr-1">年度卷宗：</span>
          <button
            v-for="year in availableAlmanacYears"
            :key="year"
            @click="openAlmanacForYear(year)"
            class="px-2.5 py-1 rounded-xs border transition-colors cursor-pointer"
            :class="
              almanacYear === year
                ? 'border-[var(--accent-warm)] bg-[var(--accent-warm)]/10 text-[var(--accent-warm)] font-medium'
                : 'border-[var(--border-subtle)] text-[var(--ink-secondary)] hover:border-[var(--ink-primary)] hover:text-[var(--ink-primary)]'
            "
          >
            {{ year }} 卷
          </button>
        </div>
      </div>

      <div class="p-5 sm:p-6 rounded-xs border border-[var(--border-subtle)] bg-[var(--bg-subtle)]/30 space-y-5">
        <LifeActivityMap
          :entries="allEntries"
          :selectedDate="selectedHeatmapDate"
          @selectDate="selectedHeatmapDate = $event"
        />

        <!-- 点击具体日期后展开当日手记速览抽屉 -->
        <div
          v-if="selectedHeatmapDate"
          class="pt-4 border-t border-[var(--border-subtle)] space-y-3 animate-in fade-in duration-200"
        >
          <div class="flex items-center justify-between text-xs font-mono-archive">
            <div class="flex items-center gap-2 text-[var(--ink-primary)]">
              <Calendar class="w-3.5 h-3.5 text-[var(--accent-warm)]" />
              <span>{{ selectedHeatmapDate }} 当日记录 ({{ selectedDateEntries.length }} 条)</span>
            </div>
            <button
              @click="selectedHeatmapDate = ''"
              class="inline-flex items-center gap-1 text-[var(--ink-muted)] hover:text-[var(--ink-primary)] cursor-pointer"
            >
              <X class="w-3.5 h-3.5" />
              <span>关闭速览</span>
            </button>
          </div>

          <div
            v-if="selectedDateEntries.length === 0"
            class="text-xs font-serif-editorial text-[var(--ink-muted)] py-2"
          >
            该日未留下公开或私密手记。
          </div>
          <div v-else class="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <button
              v-for="item in selectedDateEntries"
              :key="item.id"
              @click="emit('selectEntry', item)"
              class="p-3 rounded-xs border border-[var(--border-subtle)] bg-[var(--bg-archive)] hover:border-[var(--ink-primary)] text-left transition-colors cursor-pointer space-y-1 group"
            >
              <div class="flex items-center justify-between gap-2">
                <span class="font-serif-editorial text-sm font-medium text-[var(--ink-primary)] group-hover:text-[var(--accent-warm)] truncate">
                  {{ item.title }}
                </span>
                <span class="font-mono-archive text-[11px] text-[var(--ink-muted)] shrink-0">
                  {{ parseOccurredDate(item.occurred_at).time }}
                </span>
              </div>
              <p v-if="item.content" class="font-serif-editorial text-xs text-[var(--ink-secondary)] line-clamp-1">
                {{ item.content }}
              </p>
            </button>
          </div>
        </div>
      </div>
    </section>

    <!-- 随身与桌面器物展示 -->
    <section
      v-if="(localProfile.edc_gear || []).length > 0"
      class="space-y-6 pt-8 border-t border-[var(--border-subtle)]"
    >
      <div class="flex flex-col sm:flex-row sm:items-baseline justify-between gap-3">
        <div class="space-y-1">
          <div class="flex items-center gap-2.5">
            <h2 class="font-serif-editorial text-xl sm:text-2xl font-normal text-[var(--ink-primary)]">
              随身与桌面器物
            </h2>
            <span class="font-mono-archive text-xs text-[var(--ink-muted)]">
              （已收录 {{ (localProfile.edc_gear || []).length }} 件器物）
            </span>
          </div>
        </div>

        <div
          v-if="categories.length > 1"
          class="flex flex-wrap items-center gap-1.5 text-xs font-mono-archive"
        >
          <button
            @click="selectedCategory = 'all'"
            class="px-2.5 py-1 rounded-xs border transition-all cursor-pointer"
            :class="
              selectedCategory === 'all'
                ? 'border-[var(--ink-primary)] bg-[var(--ink-primary)] text-[var(--bg-archive)] font-medium'
                : 'border-[var(--border-subtle)] text-[var(--ink-secondary)] hover:border-[var(--ink-primary)] hover:text-[var(--ink-primary)]'
            "
          >
            全部 ({{ (localProfile.edc_gear || []).length }})
          </button>

          <button
            v-for="cat in categories"
            :key="cat"
            @click="selectedCategory = cat"
            class="px-2.5 py-1 rounded-xs border transition-all cursor-pointer"
            :class="
              selectedCategory === cat
                ? 'border-[var(--ink-primary)] bg-[var(--ink-primary)] text-[var(--bg-archive)] font-medium'
                : 'border-[var(--border-subtle)] text-[var(--ink-secondary)] hover:border-[var(--ink-primary)] hover:text-[var(--ink-primary)]'
            "
          >
            {{ cat }} ({{ (localProfile.edc_gear || []).filter(g => g.category === cat).length }})
          </button>
        </div>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-2 gap-5">
        <article
          v-for="(gear, idx) in filteredGear"
          :key="gear.id || gear.name"
          class="p-5 rounded-xs border border-[var(--border-subtle)] bg-[var(--bg-subtle)]/35 hover:border-[var(--border-divider)] transition-all space-y-3 relative group"
        >
          <div class="flex items-center justify-between text-[11px] font-mono-archive">
            <div class="flex items-center gap-2">
              <span class="text-[var(--ink-muted)]">NO. {{ String(idx + 1).padStart(2, '0') }}</span>
              <span class="text-[var(--border-divider)]">/</span>
              <span class="text-[var(--ink-secondary)] uppercase tracking-wider font-medium">
                {{ gear.category }}
              </span>
            </div>

            <span
              v-if="gear.status"
              class="px-2 py-0.5 rounded-xs text-[11px] font-medium border"
              :class="
                gear.status === 'sold'
                  ? 'border-amber-600/30 bg-amber-600/5 text-amber-600'
                  : 'border-[var(--accent-warm)]/30 bg-[var(--accent-warm)]/5 text-[var(--accent-warm)]'
              "
            >
              {{ gear.status === 'active' ? '日常自用' : gear.status === 'sold' ? '已出二手' : gear.status }}
            </span>
          </div>

          <div class="space-y-1">
            <h3 class="font-serif-editorial text-lg font-medium text-[var(--ink-primary)] tracking-tight">
              {{ gear.name }}
            </h3>
            <p v-if="gear.spec" class="font-mono-archive text-xs text-[var(--ink-muted)] leading-relaxed">
              {{ gear.spec }}
            </p>
          </div>

          <div v-if="gear.note" class="pt-2 border-t border-[var(--border-subtle)]/60">
            <p class="font-serif-editorial text-xs text-[var(--ink-secondary)] italic leading-relaxed">
              “{{ gear.note }}”
            </p>
          </div>
        </article>
      </div>
    </section>

    <!-- 编辑资料与器物弹窗 -->
    <ProfileEditModal
      v-if="isEditOpen"
      :isOpen="isEditOpen"
      :profile="localProfile"
      @close="isEditOpen = false"
      @updated="handleProfileUpdated"
    />

    <!-- 头像大图灯箱 -->
    <EditorialLightbox
      :isOpen="isLightboxOpen"
      :imageUrl="localProfile.avatar_url || ''"
      :title="`${localProfile.name || '主理人'} · 肖像`"
      :meta="'PORTRAIT ARCHIVE'"
      :location="localProfile.location"
      :date="`${currentYear} 档案收录`"
      @close="isLightboxOpen = false"
    />

    <!-- 年度生活年鉴画报弹窗 -->
    <AlmanacModal
      v-if="isAlmanacOpen"
      :isOpen="isAlmanacOpen"
      :initialYear="almanacYear"
      :availableYears="availableAlmanacYears"
      @close="isAlmanacOpen = false"
    />

  </div>
</template>
