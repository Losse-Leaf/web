import { ref, computed } from 'vue'
import type { LifeEntry, ArchiveCategory } from '../types'
import { entryMatchesCategory } from '../types'
import { fetchEntries, resetEntriesETag } from '../utils/api'

const ENTRIES_CACHE_KEY = 'looseleaf_cached_entries'

// 生活档案数据统一管理 (真实空态，遵循单一事实来源 RC-38)
export const DEFAULT_ENTRIES: LifeEntry[] = []

function getInitialEntries(): LifeEntry[] {
  try {
    const raw = localStorage.getItem(ENTRIES_CACHE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      const list = Array.isArray(parsed) ? parsed : parsed?.data
      if (Array.isArray(list)) {
        return list
      }
    }
  } catch {}
  return []
}

const entries = ref<LifeEntry[]>(getInitialEntries())
const currentCategory = ref<ArchiveCategory>('all')

// 节流写入本地存储并附带时间戳 (FE-06)
let saveTimer: number | null = null
function throttledSaveEntries(list: LifeEntry[]) {
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = window.setTimeout(() => {
    try {
      localStorage.setItem(ENTRIES_CACHE_KEY, JSON.stringify({ cached_at: Date.now(), data: list }))
    } catch {}
  }, 400)
}

// 提取全局所有独有标签与其频次 (复用单一实现，消除 RC-22 重复逻辑)
export function extractAllTags(entriesList: LifeEntry[]): { name: string; count: number }[] {
  const tagCountMap = new Map<string, number>()
  entriesList.forEach((e) => {
    if (!e.tags) return
    const splits = e.tags.split(/[,，\s]+/).filter(Boolean)
    splits.forEach((t) => {
      const clean = t.trim()
      if (clean) {
        tagCountMap.set(clean, (tagCountMap.get(clean) || 0) + 1)
      }
    })
  })
  return Array.from(tagCountMap.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
}

// 纯前端全文搜索与标签过滤单一实现 (复用单一实现，消除 RC-23 重复逻辑)
export function filterEntriesBySearch(entriesList: LifeEntry[], query: string, tag: string): LifeEntry[] {
  const q = query.trim().toLowerCase()
  const t = tag.trim().toLowerCase()

  if (!q && !t) return []

  return entriesList.filter((e) => {
    let matchQuery = true
    if (q) {
      const inTitle = (e.title || '').toLowerCase().includes(q)
      const inContent = (e.content || '').toLowerCase().includes(q)
      const inLocation = (e.location || '').toLowerCase().includes(q)
      const inMeta = (e.meta || '').toLowerCase().includes(q)
      const inTags = (e.tags || '').toLowerCase().includes(q)
      matchQuery = inTitle || inContent || inLocation || inMeta || inTags
    }

    let matchTag = true
    if (t) {
      const inTags = (e.tags || '').toLowerCase()
      matchTag = inTags.includes(t)
    }

    return matchQuery && matchTag
  })
}

export function useArchive() {
  const allTags = computed(() => extractAllTags(entries.value))

  let entriesFetchSeq = 0

  // 刷新拉取后端数据 (Stale-While-Revalidate，带竞态防御与请求时序保护 FE-08, FE-10)
  const loadRemoteEntries = async () => {
    const seq = ++entriesFetchSeq
    try {
      const data = await fetchEntries({ page: 1, page_size: 100 })
      if (seq !== entriesFetchSeq) return
      // 命中 304 缓存协商：保持已有数据引用，跳过重渲染与磁盘写入 (FE-10)
      if (data === null) return
      if (Array.isArray(data)) {
        entries.value = data
        throttledSaveEntries(data)
      }
    } catch (err: any) {
      if (err?.name === 'AbortError') return
      console.warn('Backend entries unreachable, serving local cache:', err)
    }
  }

  const addEntry = (newEntry: LifeEntry) => {
    resetEntriesETag()
    entries.value = [newEntry, ...entries.value.filter((e) => e.id !== newEntry.id)]
    throttledSaveEntries(entries.value)
  }

  const updateEntry = (updated: LifeEntry) => {
    resetEntriesETag()
    const idx = entries.value.findIndex((e) => e.id === updated.id)
    if (idx !== -1) {
      entries.value[idx] = updated
    }
    throttledSaveEntries(entries.value)
  }

  const removeEntry = (id: number) => {
    resetEntriesETag()
    entries.value = entries.value.filter((e) => e.id !== id)
    throttledSaveEntries(entries.value)
  }

  return {
    entries,
    currentCategory,
    allTags,
    loadRemoteEntries,
    addEntry,
    updateEntry,
    removeEntry,
    entryMatchesCategory,
  }
}
