import { ref } from 'vue'
import type { LifeEntry, ArchiveCategory } from '../types'
import { entryMatchesCategory } from '../types'
import { fetchEntries, resetEntriesETag } from '../utils/api'
import { parseOccurredDate } from '../utils/format'

const ENTRIES_CACHE_KEY = 'looseleaf_cached_entries'
const PAGE_SIZE = 100
const MAX_PAGES = 50
// WEB-7：有界并发。4 路既能摊平 7 页的串行 RTT，又不会在移动网络下
// 同时开 7 个连接把带宽与主线程打满。
const PAGE_CONCURRENCY = 4

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

function persistEntries(list: LifeEntry[]) {
  try {
    localStorage.setItem(ENTRIES_CACHE_KEY, JSON.stringify({ cached_at: Date.now(), data: list }))
  } catch (err) {
    // MOB-P1-70：配额耗尽 / Safari 私密模式会抛 QuotaExceededError / SecurityError，
    // 原先被空 catch 吞掉 —— 用户以为有离线缓存，其实并没有。
    // 这里至少把状态暴露出来，让界面能提示「离线缓存不可用」。
    console.warn('本地缓存写入失败（配额不足或隐私模式）:', err)
    cacheAvailable.value = false
  }
}

// 节流写入本地存储并附带时间戳 (FE-06)
let saveTimer: number | null = null
function throttledSaveEntries(list: LifeEntry[]) {
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = window.setTimeout(() => {
    saveTimer = null
    persistEntries(list)
  }, 400)
}

// 全量拉取结束后立即落盘：分页 ETag 是逐页即时写入 localStorage 的，
// 若档案本体还在 400ms 防抖窗口里就关掉标签页，下次启动会出现
// 「ETag 有 7 页、本地只有 3 页」，于是第 4 页以后永远不会被请求。
function saveEntriesNow(list: LifeEntry[]) {
  if (saveTimer) {
    clearTimeout(saveTimer)
    saveTimer = null
  }
  persistEntries(list)
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
  // 上一轮成功拉取的「按页快照」。第 N 页命中 304 时直接复用这一页，
  // 因此第 1 页 304 不会再让整次刷新提前 return（WEB-7）。
  let pageCache: LifeEntry[][] = []
  let entriesAbort: AbortController | null = null

  const seedPageCache = () => {
    if (pageCache.length > 0) return
    for (let i = 0; i < entries.value.length; i += PAGE_SIZE) {
      pageCache.push(entries.value.slice(i, i + PAGE_SIZE))
    }
  }

  const delay = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms))

  // 只重试失败的那一页；重试仍失败就抛出，由上层保留旧数据（绝不清空）。
  const fetchPageWithRetry = async (
    page: number,
    params: { year?: string; signal: AbortSignal; noCache?: boolean },
  ): Promise<LifeEntry[] | null> => {
    let lastErr: unknown
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        return await fetchEntries({
          page,
          page_size: PAGE_SIZE,
          year: params.year,
          signal: params.signal,
          noCache: params.noCache,
        })
      } catch (err) {
        lastErr = err
        if (params.signal.aborted) return null
        if (attempt === 0) await delay(250)
      }
    }
    throw lastErr
  }

  // 刷新拉取后端数据 (Stale-While-Revalidate，带竞态防御与请求时序保护 FE-08, FE-10)
  //
  // 关键：必须**分页拉全量**。原先只拉第 1 页 100 条，档案一旦超过 100 条，
  // 时间流就会被静默截断 —— 而「心愿 / 造物 / 器物」的伴生散页恰好排在时间流末尾，
  // 用户会看到「刚创建的心愿不在时间流里」。
  //
  // WEB-7：每 4 页一批并发，结果按页序拼装；每页独立 ETag / 独立重试。
  const loadRemoteEntries = async () => {
    const seq = ++entriesFetchSeq
    entriesAbort?.abort()
    const controller = new AbortController()
    entriesAbort = controller
    seedPageCache()

    try {
      const pages: LifeEntry[][] = []
      let anyFresh = false
      let page = 1
      // 已知页数优先：若本地缓存有 7 页，就先只检查 7 页；
      // 第 7 页仍是满页时再向后扩 1 页，避免每次多打一个空页。
      let upperBound = Math.max(pageCache.length, 1)
      let done = false

      while (page <= upperBound && page <= MAX_PAGES && !done) {
        const batch: number[] = []
        for (let p = page; p < page + PAGE_CONCURRENCY && p <= upperBound && p <= MAX_PAGES; p++) {
          batch.push(p)
        }

        const results = await Promise.all(
          batch.map(async (p) => {
            let data = await fetchPageWithRetry(p, { signal: controller.signal })
            if (controller.signal.aborted) return { page: p, data: null, fresh: false, aborted: true }

            let fresh = true
            if (data === null) {
              // 304：复用这一页的本地快照；没有快照才强制回源。
              const cachedPage = pageCache[p - 1]
              if (cachedPage) {
                data = cachedPage
                fresh = false
              } else {
                data = await fetchPageWithRetry(p, { signal: controller.signal, noCache: true })
              }
            }
            return { page: p, data, fresh, aborted: false }
          }),
        )

        if (controller.signal.aborted || seq !== entriesFetchSeq) return
        if (results.some((r) => r.aborted || !Array.isArray(r.data))) {
          done = true
          break
        }

        for (const result of results) {
          const data = result.data as LifeEntry[]
          pages.push(data)
          if (result.fresh) anyFresh = true
          if (data.length < PAGE_SIZE) {
            done = true
            break
          }
        }

        const lastResult = results[results.length - 1]
        if (
          !done &&
          lastResult &&
          (lastResult.data as LifeEntry[]).length === PAGE_SIZE &&
          batch[batch.length - 1] === upperBound
        ) {
          // 数据在增长：首次发现还有下一页时直接扩到 4 页并发，
          // 之后逐页探测末端（避免每次首屏 7 页排成 7 次串行 RTT）。
          upperBound = Math.min(
            Math.max(upperBound + 1, PAGE_CONCURRENCY),
            MAX_PAGES,
          )
        }
        page = batch[batch.length - 1] + 1
      }

      if (seq !== entriesFetchSeq) return
      // 全部 304：保持现有数组引用，跳过重渲染与磁盘写入。
      if (!anyFresh) return

      pageCache = pages
      const collected = pages.flat()
      entries.value = collected
      saveEntriesNow(collected)
    } catch (err: any) {
      if (err?.name === 'AbortError') return
      console.warn('Backend entries unreachable, serving local cache:', err)
    }
  }

  // WEB-7：单年失效。项目 / 心愿的伴生散页由后端生成，
  // 只回源发生变化的年份，其他年份继续用内存数据。
  const refreshEntriesForYear = async (yearOrYears: string | string[]) => {
    const years = Array.from(
      new Set((Array.isArray(yearOrYears) ? yearOrYears : [yearOrYears]).filter(Boolean)),
    )
    if (years.length === 0) return
    const seq = ++entriesFetchSeq
    entriesAbort?.abort()
    const controller = new AbortController()
    entriesAbort = controller
    // 年份数据变了，全量列表的 ETag 也不能再信。
    resetEntriesETag()

    try {
      const collected: LifeEntry[] = []
      for (const year of years) {
        let page = 1
        let done = false
        while (page <= MAX_PAGES && !done) {
          const batch: number[] = []
          for (let p = page; p < page + PAGE_CONCURRENCY && p <= MAX_PAGES; p++) {
            batch.push(p)
          }
          const results = await Promise.all(
            batch.map((p) => fetchPageWithRetry(p, { year, signal: controller.signal })),
          )
          if (controller.signal.aborted || seq !== entriesFetchSeq) return
          for (const data of results) {
            if (!Array.isArray(data)) {
              done = true
              break
            }
            collected.push(...data)
            if (data.length < PAGE_SIZE) {
              done = true
              break
            }
          }
          page = batch[batch.length - 1] + 1
        }
      }

      if (seq !== entriesFetchSeq) return
      const others = entries.value.filter(
        (e) => !years.includes(parseOccurredDate(e.occurred_at).year),
      )
      const merged = [...others, ...collected].sort((a, b) => {
        const ta = parseOccurredDate(a.occurred_at).timestamp
        const tb = parseOccurredDate(b.occurred_at).timestamp
        return tb - ta
      })
      entries.value = merged
      pageCache = []
      saveEntriesNow(merged)
    } catch (err: any) {
      if (err?.name === 'AbortError') return
      console.warn(`Backend entries for year ${years.join(', ')} unreachable, keeping local cache:`, err)
    }
  }

  const invalidateLocalPages = () => {
    pageCache = []
  }

  // 本地写之前先作废在途的全量刷新：否则启动/同步的旧响应回来时会整体
  // 覆盖 entries.value，把用户刚保存的增删改静默擦掉（App 已不再补一次全量重拉）。
  const cancelPendingFetch = () => {
    entriesFetchSeq += 1
    entriesAbort?.abort()
    entriesAbort = null
  }

  // 乐观写入的插入位置：按 occurred_at 时间戳降序（新→旧，与全量刷新后的排序同构）。
  // 原先 addEntry 恒插队首，补录过去日期的条目会浮在最顶，直到下次全量刷新才归位。
  const insertEntryByTime = (list: LifeEntry[], entry: LifeEntry): LifeEntry[] => {
    const ts = parseOccurredDate(entry.occurred_at).timestamp
    let insertAt = list.length
    for (let i = 0; i < list.length; i++) {
      if (ts >= parseOccurredDate(list[i].occurred_at).timestamp) {
        insertAt = i
        break
      }
    }
    const next = [...list]
    next.splice(insertAt, 0, entry)
    return next
  }

  const addEntry = (newEntry: LifeEntry) => {
    cancelPendingFetch()
    resetEntriesETag()
    invalidateLocalPages()
    entries.value = insertEntryByTime(
      entries.value.filter((e) => e.id !== newEntry.id),
      newEntry
    )
    throttledSaveEntries(entries.value)
  }

  const updateEntry = (updated: LifeEntry) => {
    cancelPendingFetch()
    resetEntriesETag()
    invalidateLocalPages()
    const idx = entries.value.findIndex((e) => e.id === updated.id)
    if (idx === -1) {
      // 列表中无此条目：维持原语义，不主动添加
      return
    }
    // 时间可能被编辑修改，移除后按新时间重新归位（原先是原位替换，改完时间不挪窝）
    entries.value = insertEntryByTime(
      entries.value.filter((e) => e.id !== updated.id),
      updated
    )
    throttledSaveEntries(entries.value)
  }

  const removeEntry = (id: number) => {
    cancelPendingFetch()
    resetEntriesETag()
    invalidateLocalPages()
    entries.value = entries.value.filter((e) => e.id !== id)
    throttledSaveEntries(entries.value)
  }

  return {
    entries,
    currentCategory,
    loadRemoteEntries,
    refreshEntriesForYear,
    addEntry,
    updateEntry,
    removeEntry,
    entryMatchesCategory,
  }
}
