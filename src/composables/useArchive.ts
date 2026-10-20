import { ref } from 'vue'
import type { LifeEntry, ArchiveCategory } from '../types'
import { entryMatchesCategory } from '../types'
import { fetchEntries, resetEntriesETag } from '../utils/api'

const ENTRIES_CACHE_KEY = 'looseleaf_cached_entries'

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
/** MOB-P1-70：本地缓存是否可用（配额耗尽 / 隐私模式时为 false） */
export const cacheAvailable = ref(true)
const currentCategory = ref<ArchiveCategory>('all')

// 节流写入本地存储并附带时间戳 (FE-06)
let saveTimer: number | null = null
function throttledSaveEntries(list: LifeEntry[]) {
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = window.setTimeout(() => {
    try {
      localStorage.setItem(ENTRIES_CACHE_KEY, JSON.stringify({ cached_at: Date.now(), data: list }))
    } catch (err) {
      // MOB-P1-70：配额耗尽 / Safari 私密模式会抛 QuotaExceededError / SecurityError，
      // 原先被空 catch 吞掉 —— 用户以为有离线缓存，其实并没有。
      // 这里至少把状态暴露出来，让界面能提示「离线缓存不可用」。
      console.warn('本地缓存写入失败（配额不足或隐私模式）:', err)
      cacheAvailable.value = false
    }
  }, 400)
}

// 纯前端全文搜索单一实现 (消除 RC-23 重复逻辑)
export function filterEntriesBySearch(entriesList: LifeEntry[], query: string): LifeEntry[] {
  const q = query.trim().toLowerCase()
  if (!q) return []

  return entriesList.filter((e) => {
    const inTitle = (e.title || '').toLowerCase().includes(q)
    const inContent = (e.content || '').toLowerCase().includes(q)
    const inLocation = (e.location || '').toLowerCase().includes(q)
    const inCity = (e.city_name || '').toLowerCase().includes(q)
    return inTitle || inContent || inLocation || inCity
  })
}

export function useArchive() {
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
    loadRemoteEntries,
    addEntry,
    updateEntry,
    removeEntry,
    entryMatchesCategory,
  }
}
