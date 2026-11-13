<script setup lang="ts">
import { ref, computed, watch, nextTick, onMounted, onUnmounted } from 'vue'
import { Search, X, Calendar, ArrowRight, MapPin, Sparkles, FolderGit2, Loader2 } from 'lucide-vue-next'
import type { LifeEntry, Footprint, Wish, Project } from '../types'
import { searchGlobalArchive } from '../utils/api'
import { filterEntriesBySearch } from '../composables/useArchive'
import { parseOccurredDate, formatMoney } from '../utils/format'
import { useBodyScrollLock } from '../composables/useBodyScrollLock'

const props = defineProps<{
  isOpen: boolean
  entries: LifeEntry[]
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'selectEntry', entry: LifeEntry): void
}>()

const query = ref('')
const debouncedQuery = ref('')
const inputRef = ref<HTMLInputElement | null>(null)
const isSearchingRemote = ref(false)
const remoteEntries = ref<LifeEntry[]>([])
const remoteFootprints = ref<Footprint[]>([])
const remoteWishes = ref<Wish[]>([])
const remoteProjects = ref<Project[]>([])
let debounceTimer: number | null = null
let activeSearchReqId = 0

watch(query, (newQ) => {
  activeIndex.value = 0
  if (debounceTimer) clearTimeout(debounceTimer)
  const trimmed = newQ.trim()
  if (!trimmed) {
    // 手动删空输入也作废旧请求，避免在途响应把上一条 query 的结果写回
    activeSearchReqId++
    debouncedQuery.value = ''
    remoteEntries.value = []
    remoteFootprints.value = []
    remoteWishes.value = []
    remoteProjects.value = []
    isSearchingRemote.value = false
    return
  }
  debounceTimer = window.setTimeout(async () => {
    debouncedQuery.value = newQ
    const reqId = ++activeSearchReqId
    isSearchingRemote.value = true
    try {
      const res = await searchGlobalArchive(trimmed, 30)
      if (reqId === activeSearchReqId) {
        remoteEntries.value = res.entries || []
        remoteFootprints.value = res.footprints || []
        remoteWishes.value = res.wishes || []
        remoteProjects.value = res.projects || []
      }
    } catch {
      // 远端检索失败时平滑回退至本地缓存过滤
    } finally {
      if (reqId === activeSearchReqId) {
        isSearchingRemote.value = false
      }
    }
  }, 250)
})

onUnmounted(() => {
  if (debounceTimer) clearTimeout(debounceTimer)
})

// 融合本地即时检索与服务端全量历史归档检索 (RC-23 / FE-05)
const results = computed<LifeEntry[]>(() => {
  const localMatches = filterEntriesBySearch(props.entries, debouncedQuery.value)
  if (remoteEntries.value.length === 0) return localMatches
  const seen = new Set<number>()
  const merged: LifeEntry[] = []
  for (const item of localMatches) {
    if (item && item.id) {
      seen.add(item.id)
      merged.push(item)
    }
  }
  for (const item of remoteEntries.value) {
    if (item && item.id && !seen.has(item.id)) {
      seen.add(item.id)
      merged.push(item)
    }
  }
  return merged
})

const hasAnyResults = computed(() => {
  return (
    results.value.length > 0 ||
    remoteFootprints.value.length > 0 ||
    remoteWishes.value.length > 0 ||
    remoteProjects.value.length > 0
  )
})

// 键盘导航：按显示顺序拍平四组结果（生活印记 → 山川足迹 → 心愿清单 → 造物项目）
type FlatResult =
  | { kind: 'entry'; item: LifeEntry }
  | { kind: 'footprint'; item: Footprint }
  | { kind: 'wish'; item: Wish }
  | { kind: 'project'; item: Project }

const flatResults = computed<FlatResult[]>(() => [
  ...results.value.map((item) => ({ kind: 'entry' as const, item })),
  ...remoteFootprints.value.map((item) => ({ kind: 'footprint' as const, item })),
  ...remoteWishes.value.map((item) => ({ kind: 'wish' as const, item })),
  ...remoteProjects.value.map((item) => ({ kind: 'project' as const, item })),
])

// 各组在 flatResults 中的起始偏移，用于把组内局部 index 映射回全局 index
const footprintOffset = computed(() => results.value.length)
const wishOffset = computed(() => footprintOffset.value + remoteFootprints.value.length)
const projectOffset = computed(() => wishOffset.value + remoteWishes.value.length)

const activeIndex = ref(0)

// 结果集变化时钳制越界的高亮位置；query 变化 / 清空时在下方 watch 与 clearSearch 中重置
watch(flatResults, () => {
  const count = flatResults.value.length
  if (activeIndex.value >= count) {
    activeIndex.value = count > 0 ? count - 1 : 0
  }
})

watch(activeIndex, () => {
  nextTick(() => {
    document
      .getElementById(`search-result-item-${activeIndex.value}`)
      ?.scrollIntoView({ block: 'nearest' })
  })
})

const handleSelect = (result: FlatResult) => {
  if (result.kind === 'entry') {
    emit('selectEntry', result.item)
  } else if (result.kind === 'footprint') {
    // 足迹视图不支持按城市聚焦定位，退化为仅切换到足迹页（hash 路由）
    window.location.hash = 'atlas'
  } else if (result.kind === 'wish') {
    window.location.hash = 'wishes'
  } else {
    window.location.hash = 'projects'
  }
  emit('close')
}

const clearSearch = () => {
  if (debounceTimer) clearTimeout(debounceTimer)
  activeIndex.value = 0
  activeSearchReqId++
  query.value = ''
  debouncedQuery.value = ''
  remoteEntries.value = []
  remoteFootprints.value = []
  remoteWishes.value = []
  remoteProjects.value = []
  isSearchingRemote.value = false
}

watch(
  () => props.isOpen,
  (open) => {
    if (open) {
      nextTick(() => {
        inputRef.value?.focus()
      })
    } else {
      clearSearch()
    }
  }
)

const handleKeyDown = (e: KeyboardEvent) => {
  if (!props.isOpen) return
  if (e.key === 'Escape') {
    emit('close')
    return
  }
  const count = flatResults.value.length
  if (count === 0) return
  if (e.key === 'ArrowDown') {
    e.preventDefault()
    activeIndex.value = (activeIndex.value + 1) % count
  } else if (e.key === 'ArrowUp') {
    e.preventDefault()
    activeIndex.value = (activeIndex.value - 1 + count) % count
  } else if (e.key === 'Enter') {
    e.preventDefault()
    const target = flatResults.value[activeIndex.value]
    if (target) handleSelect(target)
  }
}

onMounted(() => {
  window.addEventListener('keydown', handleKeyDown)
  if (props.isOpen) {
    nextTick(() => {
      inputRef.value?.focus()
    })
  }
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeyDown)
})

// MOB-P1-66：弹窗打开期间锁定背景页面滚动（此前只有灯箱锁了）
useBodyScrollLock(() => props.isOpen)
</script>

<template>
  <div
    v-if="isOpen"
    role="dialog"
    aria-modal="true"
    aria-label="全站检索"
    class="fixed inset-0 z-50 flex items-start justify-center pt-4 sm:pt-20 px-3 sm:px-4 bg-black/45 backdrop-blur-xs transition-opacity duration-200"
    style="padding-top: max(1rem, env(safe-area-inset-top, 0px));"
    @click.self="emit('close')"
  >
    <div
      class="w-full max-w-2xl bg-[var(--bg-archive)] border border-[var(--border-subtle)] rounded-xs shadow-2xl overflow-hidden flex flex-col h-[min(88dvh,720px)] sm:h-[min(80dvh,720px)] max-h-[88dvh] sm:max-h-[80vh] text-left animate-in fade-in zoom-in-95 duration-200 pb-[max(1rem,env(safe-area-inset-bottom,1rem))]"
    >
      <!-- 搜索输入栏 -->
      <div class="p-4 border-b border-[var(--border-subtle)] flex items-center gap-3">
        <Search class="w-5 h-5 text-[var(--ink-muted)] shrink-0" />
        <input
          ref="inputRef"
          v-model="query"
          type="text"
          placeholder="搜索……"
          class="w-full bg-transparent text-sm sm:text-base text-[var(--ink-primary)] placeholder-[var(--ink-muted)] focus:outline-hidden font-serif-editorial"
        />
        <span class="w-4 h-4 shrink-0 flex items-center justify-center">
          <Loader2
            v-if="isSearchingRemote"
            class="w-3.5 h-3.5 animate-spin text-[var(--accent-warm)]"
            title="正在检索全量历史归档..."
          />
        </span>
        <button
          type="button"
          :disabled="!query"
          @click="clearSearch"
          class="text-xs text-[var(--ink-muted)] hover:text-[var(--ink-primary)] px-1.5 py-0.5 border border-[var(--border-subtle)] rounded-xs cursor-pointer shrink-0 transition-opacity"
          :class="query ? 'opacity-100' : 'opacity-0 pointer-events-none'"
        >
          清空
        </button>
        <button
          @click="emit('close')"
          class="p-1 text-[var(--ink-muted)] hover:text-[var(--ink-primary)] cursor-pointer shrink-0"
        >
          <X class="w-5 h-5" />
        </button>
      </div>

      <!-- 搜索结果列表区 -->
      <div class="flex-grow min-h-0 overflow-y-auto p-4 space-y-5">
        <div v-if="!query" class="py-12 text-center text-xs font-mono-archive text-[var(--ink-muted)] space-y-2">
          <p>输入关键词开始检索生活档案</p>
          <p class="text-[11px] opacity-70">支持跨年份全库检索生活记录、山川足迹、心愿清单与造物项目</p>
        </div>

        <div v-else-if="!hasAnyResults && !isSearchingRemote" class="py-12 text-center text-xs font-mono-archive text-[var(--ink-muted)]">
          <p>没有找到匹配的生活碎片</p>
          <p class="text-[11px] opacity-70 pt-1">换个关键词试试，生活总有些未曾命名的瞬间</p>
        </div>

        <!-- 1. 生活记录匹配结果 -->
        <div v-if="results.length > 0" class="space-y-2">
          <div class="px-2 text-[11px] font-mono-archive text-[var(--ink-muted)] flex items-center justify-between">
            <span>生活印记 ({{ results.length }})</span>
          </div>
          <div class="divide-y divide-[var(--border-subtle)]/60">
            <div
              v-for="(item, idx) in results"
              :id="`search-result-item-${idx}`"
              :key="item.id"
              @click="handleSelect({ kind: 'entry', item })"
              @mouseenter="activeIndex = idx"
              class="py-3 px-2 hover:bg-[var(--bg-subtle)]/80 rounded-xs cursor-pointer transition-colors group space-y-1.5"
              :class="activeIndex === idx ? 'bg-[var(--bg-subtle)]/80' : ''"
            >
              <div class="flex items-center justify-between text-xs font-mono-archive text-[var(--ink-muted)]">
                <span class="text-[var(--accent-warm)] uppercase tracking-wider text-[11px]">
                  [{{ item.type || 'LIFE' }}]
                </span>
                <span class="flex items-center gap-1">
                  <Calendar class="w-3 h-3" />
                  {{ parseOccurredDate(item.occurred_at).dotDate }}
                </span>
              </div>

              <h3 class="font-serif-editorial text-base text-[var(--ink-primary)] group-hover:text-[var(--accent-warm)] transition-colors truncate">
                {{ item.title || '无题记事' }}
              </h3>

              <p class="text-xs text-[var(--ink-secondary)] line-clamp-2 leading-relaxed">
                {{ item.content }}
              </p>

              <div class="flex items-center justify-between pt-1 text-[11px] font-mono-archive text-[var(--ink-muted)]">
                <span>{{ item.location || item.city_name || '' }}</span>
                <span class="group-hover:translate-x-1 transition-transform text-[var(--ink-primary)] flex items-center gap-1">
                  查看详情 <ArrowRight class="w-3 h-3" />
                </span>
              </div>
            </div>
          </div>
        </div>

        <!-- 2. 山川足迹匹配结果 -->
        <div v-if="remoteFootprints.length > 0" class="space-y-2 pt-2 border-t border-[var(--border-subtle)]">
          <div class="px-2 text-[11px] font-mono-archive text-[var(--ink-muted)] flex items-center gap-1.5">
            <MapPin class="w-3.5 h-3.5 text-[var(--accent-warm)]" />
            <span>山川足迹 ({{ remoteFootprints.length }})</span>
          </div>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-2 px-2">
            <div
              v-for="(fp, idx) in remoteFootprints"
              :id="`search-result-item-${footprintOffset + idx}`"
              :key="fp.id"
              @click="handleSelect({ kind: 'footprint', item: fp })"
              @mouseenter="activeIndex = footprintOffset + idx"
              class="p-2.5 rounded-xs border border-[var(--border-subtle)] space-y-1 cursor-pointer hover:bg-[var(--bg-subtle)]/80 transition-colors"
              :class="activeIndex === footprintOffset + idx ? 'bg-[var(--bg-subtle)]/80' : 'bg-[var(--bg-subtle)]/40'"
            >
              <div class="flex items-center justify-between text-xs font-serif-editorial font-medium text-[var(--ink-primary)]">
                <span>{{ fp.city_name }} · {{ fp.title || '旅程足迹' }}</span>
                <span class="text-[11px] font-mono-archive text-[var(--ink-muted)]">
                  {{ fp.visited_at ? parseOccurredDate(fp.visited_at).dateKey : '' }}
                </span>
              </div>
              <p v-if="fp.note" class="text-[11px] text-[var(--ink-secondary)] line-clamp-1 font-serif-editorial">
                {{ fp.note }}
              </p>
            </div>
          </div>
        </div>

        <!-- 3. 心愿清单匹配结果 -->
        <div v-if="remoteWishes.length > 0" class="space-y-2 pt-2 border-t border-[var(--border-subtle)]">
          <div class="px-2 text-[11px] font-mono-archive text-[var(--ink-muted)] flex items-center gap-1.5">
            <Sparkles class="w-3.5 h-3.5 text-[var(--accent-warm)]" />
            <span>心愿清单 ({{ remoteWishes.length }})</span>
          </div>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-2 px-2">
            <div
              v-for="(w, idx) in remoteWishes"
              :id="`search-result-item-${wishOffset + idx}`"
              :key="w.id"
              @click="handleSelect({ kind: 'wish', item: w })"
              @mouseenter="activeIndex = wishOffset + idx"
              class="p-2.5 rounded-xs border border-[var(--border-subtle)] space-y-1 cursor-pointer hover:bg-[var(--bg-subtle)]/80 transition-colors"
              :class="activeIndex === wishOffset + idx ? 'bg-[var(--bg-subtle)]/80' : 'bg-[var(--bg-subtle)]/40'"
            >
              <div class="flex items-center justify-between text-xs font-serif-editorial font-medium text-[var(--ink-primary)]">
                <span class="truncate">{{ w.title }}</span>
                <span v-if="w.budget > 0" class="text-[11px] font-mono-archive text-[var(--accent-warm)] shrink-0">
                  ¥{{ formatMoney(w.budget) }}
                </span>
              </div>
              <p v-if="w.note" class="text-[11px] text-[var(--ink-secondary)] line-clamp-1 font-serif-editorial">
                {{ w.note }}
              </p>
            </div>
          </div>
        </div>

        <!-- 4. 造物项目匹配结果 -->
        <div v-if="remoteProjects.length > 0" class="space-y-2 pt-2 border-t border-[var(--border-subtle)]">
          <div class="px-2 text-[11px] font-mono-archive text-[var(--ink-muted)] flex items-center gap-1.5">
            <FolderGit2 class="w-3.5 h-3.5 text-[var(--accent-moss)]" />
            <span>造物项目 ({{ remoteProjects.length }})</span>
          </div>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-2 px-2">
            <div
              v-for="(proj, idx) in remoteProjects"
              :id="`search-result-item-${projectOffset + idx}`"
              :key="proj.id"
              @click="handleSelect({ kind: 'project', item: proj })"
              @mouseenter="activeIndex = projectOffset + idx"
              class="p-2.5 rounded-xs border border-[var(--border-subtle)] space-y-1 cursor-pointer hover:bg-[var(--bg-subtle)]/80 transition-colors"
              :class="activeIndex === projectOffset + idx ? 'bg-[var(--bg-subtle)]/80' : 'bg-[var(--bg-subtle)]/40'"
            >
              <div class="flex items-center justify-between text-xs font-serif-editorial font-medium text-[var(--ink-primary)]">
                <span class="truncate">{{ proj.title }}</span>
                <span class="text-[11px] font-mono-archive text-[var(--ink-muted)]">{{ proj.status }}</span>
              </div>
              <p v-if="proj.description" class="text-[11px] text-[var(--ink-secondary)] line-clamp-1 font-serif-editorial">
                {{ proj.description }}
              </p>
            </div>
          </div>
        </div>
      </div>

      <!-- 底部快捷操作说明 -->
      <div class="px-4 py-2 border-t border-[var(--border-subtle)] bg-[var(--bg-subtle)]/30 flex items-center justify-between text-[11px] font-mono-archive text-[var(--ink-muted)]">
        <span>已收录 {{ entries.length }} 条生活印记</span>
        <span>↑↓ 选择 · ↵ 打开 · ESC 关闭</span>
      </div>
    </div>
  </div>
</template>
