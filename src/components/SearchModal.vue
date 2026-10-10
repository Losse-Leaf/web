<script setup lang="ts">
import { ref, computed, watch, nextTick, onMounted, onUnmounted } from 'vue'
import { Search, X, Calendar, Tag, ArrowRight } from 'lucide-vue-next'
import type { LifeEntry } from '../types'
import { audio } from '../utils/audio'
import { extractAllTags } from '../composables/useArchive'

const props = defineProps<{
  isOpen: boolean
  entries: LifeEntry[]
  tags?: { name: string; count: number }[]
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'selectEntry', entry: LifeEntry): void
}>()

const query = ref('')
const debouncedQuery = ref('')
const selectedTag = ref('')
const inputRef = ref<HTMLInputElement | null>(null)
let debounceTimer: number | null = null

watch(query, (newQ) => {
  if (debounceTimer) clearTimeout(debounceTimer)
  debounceTimer = window.setTimeout(() => {
    debouncedQuery.value = newQ
  }, 180)
})

onUnmounted(() => {
  if (debounceTimer) clearTimeout(debounceTimer)
})

// 提取前 10 个高频标签 (优先复用父级传参或 useArchive.ts 中的单一实现，消除 RC-22 重复逻辑)
const popularTags = computed(() => {
  if (props.tags && props.tags.length > 0) {
    return props.tags.slice(0, 10)
  }
  return extractAllTags(props.entries).slice(0, 10)
})

// 带防抖的检索结果 (FE-05)
const results = computed(() => {
  const q = debouncedQuery.value.trim().toLowerCase()
  const tag = selectedTag.value.trim().toLowerCase()

  if (!q && !tag) {
    return []
  }

  return props.entries.filter((e) => {
    let matchQ = true
    if (q) {
      const title = (e.title || '').toLowerCase()
      const content = (e.content || '').toLowerCase()
      const location = (e.location || '').toLowerCase()
      const meta = (e.meta || '').toLowerCase()
      const tags = (e.tags || '').toLowerCase()
      matchQ = title.includes(q) || content.includes(q) || location.includes(q) || meta.includes(q) || tags.includes(q)
    }

    let matchTag = true
    if (tag) {
      const tags = (e.tags || '').toLowerCase()
      matchTag = tags.includes(tag)
    }

    return matchQ && matchTag
  })
})

const handleSelect = (entry: LifeEntry) => {
  audio.playPaperFlip()
  emit('selectEntry', entry)
  emit('close')
}

const toggleTag = (tagName: string) => {
  audio.playTink()
  if (selectedTag.value === tagName) {
    selectedTag.value = ''
  } else {
    selectedTag.value = tagName
  }
}

const clearSearch = () => {
  if (debounceTimer) clearTimeout(debounceTimer)
  query.value = ''
  debouncedQuery.value = ''
  selectedTag.value = ''
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
  if (e.key === 'Escape' && props.isOpen) {
    emit('close')
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
</script>

<template>
  <div
    v-if="isOpen"
    class="fixed inset-0 z-50 flex items-start justify-center pt-4 sm:pt-20 px-3 sm:px-4 bg-black/45 backdrop-blur-xs transition-opacity duration-200"
    style="padding-top: max(1rem, env(safe-area-inset-top, 0px));"
    @click.self="emit('close')"
  >
    <div
      class="w-full max-w-2xl bg-[var(--bg-archive)] border border-[var(--border-subtle)] rounded-xs shadow-2xl overflow-hidden flex flex-col max-h-[88dvh] sm:max-h-[80vh] text-left animate-in fade-in zoom-in-95 duration-200"
    >
      <!-- 搜索输入栏 -->
      <div class="p-4 border-b border-[var(--border-subtle)] flex items-center gap-3">
        <Search class="w-5 h-5 text-[var(--ink-muted)] shrink-0" />
        <input
          ref="inputRef"
          v-model="query"
          type="text"
          placeholder="搜索生活记录、随笔思考、器材底片、地点或标签..."
          class="w-full bg-transparent text-sm sm:text-base text-[var(--ink-primary)] placeholder-[var(--ink-muted)] focus:outline-hidden font-serif-editorial"
        />
        <button
          v-if="query || selectedTag"
          @click="clearSearch"
          class="text-xs text-[var(--ink-muted)] hover:text-[var(--ink-primary)] px-1.5 py-0.5 border border-[var(--border-subtle)] rounded-xs cursor-pointer"
        >
          清空
        </button>
        <button
          @click="emit('close')"
          class="p-1 text-[var(--ink-muted)] hover:text-[var(--ink-primary)] cursor-pointer"
        >
          <X class="w-5 h-5" />
        </button>
      </div>

      <!-- 快捷标签胶囊推荐 -->
      <div class="px-4 py-2.5 bg-[var(--bg-subtle)]/50 border-b border-[var(--border-subtle)] flex flex-wrap items-center gap-1.5 text-xs font-mono-archive">
        <span class="text-[var(--ink-muted)] flex items-center gap-1 mr-1">
          <Tag class="w-3 h-3" />
          <span>常用标签:</span>
        </span>
        <button
          v-for="t in popularTags"
          :key="t.name"
          @click="toggleTag(t.name)"
          class="px-2 py-0.5 rounded-xs border transition-colors cursor-pointer text-[11px]"
          :class="selectedTag === t.name
            ? 'border-[var(--accent-warm)] bg-[var(--accent-warm)] text-white'
            : 'border-[var(--border-subtle)] text-[var(--ink-secondary)] hover:border-[var(--ink-muted)]'"
        >
          #{{ t.name }} <span class="opacity-60 text-[10px]">({{ t.count }})</span>
        </button>
      </div>

      <!-- 搜索结果列表区 -->
      <div class="flex-grow overflow-y-auto p-4 divide-y divide-[var(--border-subtle)]/60">
        <div v-if="!query && !selectedTag" class="py-12 text-center text-xs font-mono-archive text-[var(--ink-muted)] space-y-2">
          <p>输入关键词，或点击上方标签开始检索档案</p>
          <p class="text-[11px] opacity-70">支持模糊搜索标题、正文、地点、拍摄器材与感悟</p>
        </div>

        <div v-else-if="results.length === 0" class="py-12 text-center text-xs font-mono-archive text-[var(--ink-muted)]">
          <p>没有找到匹配的生活碎片</p>
          <p class="text-[11px] opacity-70 pt-1">换个关键词试试，生活总有些未曾命名的瞬间</p>
        </div>

        <div
          v-for="item in results"
          :key="item.id"
          @click="handleSelect(item)"
          class="py-3 px-2 hover:bg-[var(--bg-subtle)]/80 rounded-xs cursor-pointer transition-colors group space-y-1.5"
        >
          <div class="flex items-center justify-between text-xs font-mono-archive text-[var(--ink-muted)]">
            <span class="text-[var(--accent-warm)] uppercase tracking-wider text-[11px]">
              [{{ item.type || 'LIFE' }}]
            </span>
            <span class="flex items-center gap-1">
              <Calendar class="w-3 h-3" />
              {{ item.date || item.occurred_at?.slice(0, 10) }}
            </span>
          </div>

          <h3 class="font-serif-editorial text-base text-[var(--ink-primary)] group-hover:text-[var(--accent-warm)] transition-colors">
            {{ item.title || '无题记事' }}
          </h3>

          <p class="text-xs text-[var(--ink-secondary)] line-clamp-2 leading-relaxed">
            {{ item.content }}
          </p>

          <div class="flex items-center justify-between pt-1 text-[11px] font-mono-archive text-[var(--ink-muted)]">
            <span>{{ item.location || item.meta || '' }}</span>
            <span class="group-hover:translate-x-1 transition-transform text-[var(--ink-primary)] flex items-center gap-1">
              查看详情 <ArrowRight class="w-3 h-3" />
            </span>
          </div>
        </div>
      </div>

      <!-- 底部快捷操作说明 -->
      <div class="px-4 py-2 border-t border-[var(--border-subtle)] bg-[var(--bg-subtle)]/30 flex items-center justify-between text-[11px] font-mono-archive text-[var(--ink-muted)]">
        <span>已收录 {{ entries.length }} 条生活印记</span>
        <span>ESC 关闭 / ↵ 打开</span>
      </div>
    </div>
  </div>
</template>
