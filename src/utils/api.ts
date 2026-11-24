import { ref } from 'vue'
import type {
  LifeEntry,
  Transaction,
  TransactionSummary,
  StorageStatus,
  StorageConfigPayload,
  TrustedDevice,
  PairingTicketResult,
  SiteConfig,
  CuratorProfile,
  SystemStatus,
  ClaimPayload,
  ClaimResult,
  PairStatusResult,
  UnifiedUploadResult,
  Wish,
  CreditChannel,
  AnnualAlmanacSummary,
  UpdateCheckResult,
  CategoryOption,
  CategoriesResponse,
  CategoryScope,
  BackupItem,
  AttachmentBindPayload,
} from '../types'

const API_BASE = '/api/v1'
// MOB-P1-69：Cookie 会话标记 —— 不是凭据，只用来判断「当前是不是主人」
const ADMIN_SESSION_KEY = 'looseleaf_admin_session'

/** MOB-P1-69：是否已建立基于 HttpOnly Cookie 的会话 */
function hasCookieSession(): boolean {
  try {
    return localStorage.getItem(ADMIN_SESSION_KEY) === '1'
  } catch {
    return false
  }
}

/**
 * 响应式的会话态（真实凭据由同源 HttpOnly Cookie `looseleaf_session` 承载，JS 不可读）。
 */
const sessionActiveRef = ref<boolean>(hasCookieSession())

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key === ADMIN_SESSION_KEY || e.key === null) {
      sessionActiveRef.value = hasCookieSession()
    }
    // WEB-7：跨标签页同步每页 ETag。entriesPageETags 是模块级内存对象，
    // 别的标签页写入/清除该键后这里重新读回，否则仍持旧值命中 304、复用旧 pageCache。
    if (e.key === ENTRIES_ETAG_KEY) {
      try {
        const raw = localStorage.getItem(ENTRIES_ETAG_KEY) || ''
        const next: Record<number, string> = {}
        if (raw.trim().startsWith('{')) {
          const parsed = JSON.parse(raw)
          if (parsed && typeof parsed === 'object') {
            for (const [k, v] of Object.entries(parsed)) {
              const page = Number(k)
              if (Number.isFinite(page) && typeof v === 'string' && v) {
                next[page] = v
              }
            }
          }
        } else if (raw) {
          next[1] = raw
        }
        entriesPageETags = next
      } catch {
        // 解析失败：保持现有 entriesPageETags，不覆盖。
      }
    }
  })
}

export function hasAdminSession(): boolean {
  return sessionActiveRef.value
}

/**
 * 当前是否具备主理人权限（响应式依赖 sessionActiveRef，由同源 HttpOnly Cookie 承载鉴权）。
 */
export function getAdminToken(): boolean {
  return sessionActiveRef.value
}

/** 标记「已建立 Cookie 会话」 */
function markCookieSession(): void {
  try {
    localStorage.setItem(ADMIN_SESSION_KEY, '1')
  } catch {}
  sessionActiveRef.value = true
}

/**
 * 只清本地会话标记，不发登出请求（供 401 被动失效与主动登出共用）。
 */
function clearLocalCredential(): void {
  try {
    localStorage.removeItem(ADMIN_SESSION_KEY)
  } catch {}
  sessionActiveRef.value = false
}

export function removeAdminToken(): void {
  clearLocalCredential()
  // 让服务端把 HttpOnly Cookie 一并清掉（不吊销 devices 表里的设备令牌）。
  void fetch(`${API_BASE}/auth/logout`, { method: 'POST', credentials: 'same-origin' }).catch(() => {})
}

/**
 * MOB-P1-69：探测服务端是否认账当前浏览器带的 HttpOnly Cookie。
 * 只回传角色、不回传任何凭据，因此可以安全地在启动时调用。
 */
type SessionProbe =
  | { kind: 'admin' }
  | { kind: 'not-admin' }
  /** 探针本身失败（离线 / 网关 5xx）—— 不能据此判定会话失效 */
  | { kind: 'unknown' }

async function probeSessionCookie(): Promise<SessionProbe> {
  const controller = new AbortController()
  const timer = window.setTimeout(() => controller.abort(), 8000)
  try {
    const res = await fetch(`${API_BASE}/auth/session`, {
      credentials: 'same-origin',
      signal: controller.signal,
    })
    if (res.status === 401 || res.status === 403) return { kind: 'not-admin' }
    if (!res.ok) return { kind: 'unknown' }
    const json = await res.json()
    const data = json && typeof json === 'object' && 'data' in json ? json.data : json
    return (data && (data as { is_admin?: boolean }).is_admin)
      ? { kind: 'admin' }
      : { kind: 'not-admin' }
  } catch {
    return { kind: 'unknown' }
  } finally {
    clearTimeout(timer)
  }
}

/** MOB-P1-69：启动时确认 Cookie 会话是否仍然有效（刷新页面后恢复主理人视角） */
export async function refreshSessionState(): Promise<boolean> {
  const probe = await probeSessionCookie()

  if (probe.kind === 'admin') {
    markCookieSession()
    return true
  }

  if (probe.kind === 'unknown') {
    return sessionActiveRef.value
  }

  if (hasCookieSession() || sessionActiveRef.value) {
    clearLocalCredential()
  }
  return false
}

// 通用请求处理
const REQUEST_TIMEOUT_MS = 25_000
const UPLOAD_TIMEOUT_MS = 120_000

/** 兼容没有 AbortSignal.any 的老 Safari / 微信内核 */
function anyAbortSignal(signals: AbortSignal[]): AbortSignal {
  const anyFn = (AbortSignal as unknown as { any?: (s: AbortSignal[]) => AbortSignal }).any
  if (typeof anyFn === 'function') return anyFn(signals)
  const controller = new AbortController()
  const onAbort = () => controller.abort()
  for (const signal of signals) {
    if (signal.aborted) {
      controller.abort()
      break
    }
    signal.addEventListener('abort', onAbort, { once: true })
  }
  return controller.signal
}

function notifyUnauthorizedIfNeeded(url: string, status: number): void {
  if (status === 401 && !url.includes('/auth/claim')) {
    clearLocalCredential()
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('looseleaf-auth-expired'))
    }
  }
}

interface RawRequestOptions extends RequestInit {
  timeoutMs?: number
  allowNotModified?: boolean
  abortReturnsNull?: boolean
  errorPrefix?: string
}

async function rawRequest<T>(
  url: string,
  options: RawRequestOptions | undefined,
  parseResponse: (res: Response) => Promise<T>,
): Promise<T> {
  const timeoutMs = options?.timeoutMs ?? REQUEST_TIMEOUT_MS
  const timeoutController = new AbortController()
  const timer = setTimeout(() => timeoutController.abort(), timeoutMs)
  const signal: AbortSignal = options?.signal
    ? anyAbortSignal([options.signal, timeoutController.signal])
    : timeoutController.signal

  const { timeoutMs: _t, allowNotModified, abortReturnsNull, errorPrefix, ...fetchInit } = options || {}

  try {
    const res = await fetch(url, {
      credentials: 'same-origin',
      ...fetchInit,
      signal,
    })

    if (allowNotModified && res.status === 304) {
      return await parseResponse(res)
    }

    if (!res.ok) {
      notifyUnauthorizedIfNeeded(url, res.status)
      let msg = errorPrefix ? `${errorPrefix} (HTTP ${res.status})` : `HTTP error ${res.status}`
      try {
        const errJson = await res.json()
        if (errJson?.message) msg = errJson.message
      } catch {
        // ignore
      }
      throw new Error(msg)
    }

    // 响应体解析也留在计时器内，防止服务端缓慢吐 body 时无限挂起
    return await parseResponse(res)
  } catch (err: any) {
    if (err?.name === 'AbortError') {
      if (abortReturnsNull) {
        return null as T
      }
      throw new Error('请求超时，请检查网络后重试')
    }
    throw err
  } finally {
    clearTimeout(timer)
  }
}

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  return rawRequest<T>(
    url,
    {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(options?.headers as Record<string, string> | undefined),
      },
    },
    async (res) => {
      const json = await res.json()
      if (json && typeof json === 'object' && 'code' in json && 'data' in json) {
        return json.data as T
      }
      return json as T
    },
  )
}

function xhrUploadFormData<T>(params: {
  url: string
  formData: FormData
  onProgress?: (percent: number) => void
  signal?: AbortSignal
  errorPrefix: string
  networkErrorMessage: string
  parseErrorMessage: string
}): Promise<T> {
  const { url, formData, onProgress, signal, errorPrefix, networkErrorMessage, parseErrorMessage } = params
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    let settled = false
    const fail = (message: string) => {
      if (settled) return
      settled = true
      reject(new Error(message))
    }

    if (signal) {
      if (signal.aborted) {
        fail('上传已取消')
        return
      }
      signal.addEventListener('abort', () => {
        try {
          xhr.abort()
        } catch {
          // ignore
        }
        fail('上传已取消')
      })
    }

    if (xhr.upload && onProgress) {
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) {
          const percent = Math.round((e.loaded / e.total) * 100)
          onProgress(percent)
        }
      }
    }

    xhr.onload = () => {
      if (settled) return
      settled = true
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const res = JSON.parse(xhr.responseText)
          if (res && typeof res === 'object' && 'data' in res && res.data) {
            resolve(res.data as T)
          } else {
            resolve(res as T)
          }
        } catch {
          reject(new Error(parseErrorMessage))
        }
      } else {
        notifyUnauthorizedIfNeeded(url, xhr.status)
        try {
          const errRes = JSON.parse(xhr.responseText)
          reject(new Error(errRes.message || `${errorPrefix} (HTTP ${xhr.status})`))
        } catch {
          reject(new Error(`${errorPrefix} (HTTP ${xhr.status})`))
        }
      }
    }

    xhr.onerror = () => fail(networkErrorMessage)
    xhr.ontimeout = () => fail('上传超时，请检查网络后重试')
    xhr.onabort = () => fail('上传已取消')

    xhr.timeout = UPLOAD_TIMEOUT_MS
    xhr.open('POST', url, true)
    xhr.send(formData)
  })
}

// 1. Life Entries
const ENTRIES_ETAG_KEY = 'looseleaf_entries_etag'
let entriesPageETags: Record<number, string> = {}
try {
  const raw = localStorage.getItem(ENTRIES_ETAG_KEY) || ''
  if (raw.trim().startsWith('{')) {
    const parsed = JSON.parse(raw)
    if (parsed && typeof parsed === 'object') {
      for (const [k, v] of Object.entries(parsed)) {
        const page = Number(k)
        if (Number.isFinite(page) && typeof v === 'string' && v) {
          entriesPageETags[page] = v
        }
      }
    }
  }
} catch {}

function persistEntriesPageETags(): void {
  try {
    localStorage.setItem(ENTRIES_ETAG_KEY, JSON.stringify(entriesPageETags))
  } catch {}
}

export function resetEntriesETag(): void {
  entriesPageETags = {}
  try {
    localStorage.removeItem(ENTRIES_ETAG_KEY)
  } catch {}
}

/**
 * 清空 localStorage 中的 API 快照，并删除 Workbox 运行时缓存。
 */
export async function clearApiCache(): Promise<void> {
  resetEntriesETag()
  try {
    localStorage.removeItem('looseleaf_cached_entries_v2')
    localStorage.removeItem('looseleaf_cached_transactions_v2')
    localStorage.removeItem('looseleaf_curator_profile')
  } catch {}

  if (typeof caches === 'undefined') return

  try {
    const cacheNames = await caches.keys()
    await Promise.all(
      cacheNames
        .filter((name) => name.startsWith('looseleaf-'))
        .map((name) => caches.delete(name)),
    )
  } catch {
    // 隐私模式 / 无 Cache Storage 权限时静默失败，不阻塞恢复或登出。
  }
}

export async function fetchEntries(params?: {
  page?: number
  page_size?: number
  type?: string
  category?: string
  year?: string
  signal?: AbortSignal
  /** WEB-7：跳过 If-None-Match，用于「304 但没有本地页缓存」时强制取回该页 */
  noCache?: boolean
}): Promise<LifeEntry[] | null> {
  const query = new URLSearchParams()
  if (params?.page) query.set('page', String(params.page))
  if (params?.page_size) query.set('page_size', String(params.page_size))
  if (params?.type && params.type !== 'all') query.set('type', params.type)
  if (params?.category && params.category !== 'all') query.set('category', params.category)
  if (params?.year && params.year !== 'all') query.set('year', params.year)

  const url = `${API_BASE}/entries?${query.toString()}`
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }

  const page = params?.page || 1
  const isDefaultList = !params?.type && !params?.category && !params?.year
  if (isDefaultList && !params?.noCache && entriesPageETags[page]) {
    headers['If-None-Match'] = entriesPageETags[page]
  }

  return rawRequest<LifeEntry[] | null>(
    url,
    {
      headers,
      signal: params?.signal,
      allowNotModified: true,
      abortReturnsNull: true,
    },
    async (res) => {
      if (res.status === 304) {
        return null
      }

      const newEtag = res.headers.get('ETag')
      if (isDefaultList && newEtag) {
        entriesPageETags[page] = newEtag
        persistEntriesPageETags()
      }

      const json = await res.json()
      const data = json && typeof json === 'object' && 'code' in json && 'data' in json ? json.data : json
      if (!Array.isArray(data?.entries)) {
        throw new Error('fetchEntries: 响应缺少 entries 数组')
      }
      return data.entries
    },
  )
}

export async function fetchEntryById(id: number): Promise<LifeEntry> {
  return request<LifeEntry>(`${API_BASE}/entries/${id}`)
}

export async function fetchOnThisDayEntries(): Promise<{
  month: number
  day: number
  entries: LifeEntry[]
}> {
  const res = await request<{
    month?: number
    day?: number
    entries?: LifeEntry[]
  }>(`${API_BASE}/entries/on-this-day`)
  return {
    month: Number(res?.month || 0),
    day: Number(res?.day || 0),
    entries: Array.isArray(res?.entries) ? res.entries : [],
  }
}

export async function searchGlobalArchive(
  q: string,
  limit = 30,
): Promise<{
  query: string
  entries: LifeEntry[]
  wishes: Wish[]
}> {
  const params = new URLSearchParams()
  params.set('q', q)
  params.set('limit', String(limit))
  const res = await request<{
    query?: string
    entries?: LifeEntry[]
    wishes?: Wish[]
  }>(`${API_BASE}/search?${params.toString()}`)
  return {
    query: res?.query ?? q,
    entries: Array.isArray(res?.entries) ? res.entries : [],
    wishes: Array.isArray(res?.wishes) ? res.wishes : [],
  }
}

/**
 * 从正文派生标题（朋友圈式发布：只填正文，标题取首行），与后端、mac 端一致。
 */
function deriveTitleFromContent(content: string, maxLength = 40): string {
  if (!content) return ''
  const firstLine = content.split('\n')[0] ?? ''
  const trimmed = firstLine.trim()
  if (!trimmed) return ''
  const chars = Array.from(trimmed)
  if (chars.length > maxLength) return chars.slice(0, maxLength).join('') + '…'
  return trimmed
}

export async function createLifeEntry(
  data: {
    type: string
    category?: string
    title?: string
    content: string
    occurred_at?: string
    location?: string
    wish_id?: number | null
    is_private?: boolean
  } & AttachmentBindPayload,
): Promise<LifeEntry> {
  const payload = {
    ...data,
    category: data.category ?? '',
    title: (data.title ?? '').trim() || deriveTitleFromContent(data.content ?? ''),
  }
  const result = await request<LifeEntry>(`${API_BASE}/entries`, {
    method: 'POST',
    body: JSON.stringify(payload),
  })
  resetEntriesETag()
  return result
}

export async function updateLifeEntry(
  id: number,
  data: {
    type?: string
    category?: string
    title?: string
    content?: string
    occurred_at?: string
    location?: string
    wish_id?: number | null
    is_private?: boolean
  } & AttachmentBindPayload,
): Promise<LifeEntry> {
  const result = await request<LifeEntry>(`${API_BASE}/entries/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  })
  resetEntriesETag()
  return result
}

export async function deleteLifeEntry(id: number): Promise<boolean> {
  await request(`${API_BASE}/entries/${id}`, {
    method: 'DELETE',
  })
  resetEntriesETag()
  return true
}

// 2. Storage & Unified File Upload
export async function cleanupUploads(objectKeys: string[]): Promise<void> {
  if (objectKeys.length === 0) return
  try {
    await request(`${API_BASE}/uploads/cleanup`, {
      method: 'POST',
      body: JSON.stringify({ object_keys: objectKeys }),
    })
  } catch (err) {
    console.warn('Upload cleanup request failed:', err)
  }
}

export async function fetchStorageStatus(): Promise<StorageStatus> {
  return request<StorageStatus>(`${API_BASE}/storage/status`)
}

export async function testStorageConfig(
  payload: StorageConfigPayload,
): Promise<{ status: string; message: string; latency_ms?: number }> {
  return request<{ status: string; message: string; latency_ms?: number }>(`${API_BASE}/storage/test`, {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export async function updateStorageConfig(payload: StorageConfigPayload): Promise<StorageStatus> {
  return request<StorageStatus>(`${API_BASE}/storage/config`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  })
}

export async function resetStorageConfig(): Promise<StorageStatus> {
  return request<StorageStatus>(`${API_BASE}/storage/config`, {
    method: 'DELETE',
  })
}

export async function migrateStorageMedia(): Promise<{
  uploaded_to_r2: number
  downloaded_to_local: number
  message: string
}> {
  return request<{
    uploaded_to_r2: number
    downloaded_to_local: number
    message: string
  }>(`${API_BASE}/storage/migrate`, {
    method: 'POST',
  })
}

export async function uploadUnifiedFile(
  file: File,
  folder: string = 'avatar',
  onProgress?: (percent: number) => void,
  signal?: AbortSignal,
): Promise<UnifiedUploadResult> {
  const formData = new FormData()
  formData.append('file', file)
  formData.append('folder', folder)
  return xhrUploadFormData<UnifiedUploadResult>({
    url: `${API_BASE}/files/upload`,
    formData,
    onProgress,
    signal,
    errorPrefix: '上传失败',
    networkErrorMessage: '网络中断，上传请求失败',
    parseErrorMessage: '解析上传响应失败',
  })
}

// 3. Transactions (记账)
export async function fetchTransactions(params?: {
  year?: number
  month?: number
}): Promise<Transaction[]> {
  const query = new URLSearchParams()
  if (params?.year) query.set('year', String(params.year))
  if (params?.month) query.set('month', String(params.month))
  return request<Transaction[]>(`${API_BASE}/transactions?${query.toString()}`)
}

export async function fetchTransactionSummary(params?: {
  year?: number
  month?: number
}): Promise<TransactionSummary> {
  const query = new URLSearchParams()
  if (params?.year) query.set('year', String(params.year))
  if (params?.month) query.set('month', String(params.month))
  return request<TransactionSummary>(`${API_BASE}/transactions/summary?${query.toString()}`)
}

export async function createTransaction(data: {
  amount: number
  type: 'income' | 'expense'
  category: string
  title: string
  note?: string
  payment_method?: string
  occurred_at?: string
  wish_id?: number
  is_installment?: boolean
  installment_channel_code?: string
  installment_total_amount?: number
  installment_months?: number
  installment_monthly_pay?: number
  installment_remain_months?: number
  repayment_day?: number
}): Promise<Transaction> {
  return request<Transaction>(`${API_BASE}/transactions`, {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

// 3.1 Wishes (心愿单，公开只读与联动)
export async function fetchWishes(
  params?: { kind?: string; status?: string },
  signal?: AbortSignal,
): Promise<Wish[]> {
  const pageSize = 100
  let page = 1
  const all: Wish[] = []
  while (page <= 50) {
    const query = new URLSearchParams()
    if (params?.kind) query.set('kind', params.kind)
    if (params?.status) query.set('status', params.status)
    query.set('page', String(page))
    query.set('page_size', String(pageSize))
    const res = await request<Wish[] | { wishes?: Wish[] }>(`${API_BASE}/wishes?${query.toString()}`, { signal })
    const batch = Array.isArray(res) ? res : res?.wishes
    if (!Array.isArray(batch)) {
      throw new Error('fetchWishes: 响应缺少 wishes 数组')
    }
    all.push(...batch)
    if (batch.length < pageSize) break
    page++
  }
  return all
}

export async function createWish(
  data: {
    title: string
    kind: 'item' | 'travel' | 'milestone'
    note?: string
    spec?: string
    budget?: number
    target_date?: string
    planted_at?: string
    is_private?: boolean
  } & AttachmentBindPayload,
): Promise<Wish> {
  return request<Wish>(`${API_BASE}/wishes`, {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

export async function updateWish(
  id: number,
  data: Partial<Wish> & AttachmentBindPayload,
): Promise<Wish> {
  return request<Wish>(`${API_BASE}/wishes/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  })
}

export async function deleteWish(id: number, purge?: boolean): Promise<boolean> {
  await request(`${API_BASE}/wishes/${id}${purge ? '?purge=true' : ''}`, {
    method: 'DELETE',
  })
  return true
}

export async function resolveWish(
  id: number,
  data: {
    resolution_type?: 'exact' | 'altered' | 'relinquished'
    actual_cost?: number
    actual_title?: string
    fulfilled_at?: string
    create_transaction?: boolean
    create_life_entry?: boolean
    entry_content?: string
    is_installment?: boolean
    installment_channel_code?: string
    installment_months?: number
    repayment_day?: number
  } & AttachmentBindPayload,
): Promise<Wish> {
  return request<Wish>(`${API_BASE}/wishes/${id}/resolve`, {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

export async function updateTransaction(
  id: number,
  data: Partial<Transaction> & {
    /** 显式声明「本次要取消分期」（三态契约） */
    clear_installment?: boolean
  },
): Promise<Transaction> {
  return request<Transaction>(`${API_BASE}/transactions/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  })
}

export async function deleteTransaction(id: number): Promise<boolean> {
  await request(`${API_BASE}/transactions/${id}`, {
    method: 'DELETE',
  })
  return true
}

// 5. Device Pairing & Trusted Devices (设备免密配对与管理)
export async function initPairingTicket(params?: {
  hub_url?: string
  device_hint?: string
}): Promise<PairingTicketResult> {
  return request<PairingTicketResult>(`${API_BASE}/auth/pair/init`, {
    method: 'POST',
    body: JSON.stringify({
      hub_url: params?.hub_url || (typeof window !== 'undefined' ? window.location.origin : ''),
      device_hint: params?.device_hint,
    }),
  })
}

export async function pollPairingTicketStatus(ticket: string): Promise<PairStatusResult> {
  return request<PairStatusResult>(
    `${API_BASE}/auth/pair/status?ticket=${encodeURIComponent(ticket)}`,
  )
}

export async function fetchPairQRCode(
  hubUrl: string,
  ticket: string,
): Promise<{
  hub_url: string
  ticket: string
  qr_payload: string
  qr_code_data_url: string
}> {
  const query = new URLSearchParams({ hub: hubUrl, ticket })
  return request<{
    hub_url: string
    ticket: string
    qr_payload: string
    qr_code_data_url: string
  }>(`${API_BASE}/auth/pair/qr?${query.toString()}`)
}

export async function fetchTrustedDevices(): Promise<TrustedDevice[]> {
  return request<TrustedDevice[]>(`${API_BASE}/auth/devices`)
}

export async function revokeTrustedDevice(id: number): Promise<boolean> {
  await request(`${API_BASE}/auth/devices/${id}`, {
    method: 'DELETE',
  })
  return true
}

export async function updateTrustedDeviceName(
  id: string | number,
  name: string,
): Promise<TrustedDevice> {
  return request<TrustedDevice>(`${API_BASE}/auth/devices/${encodeURIComponent(String(id))}`, {
    method: 'PUT',
    body: JSON.stringify({ name }),
  })
}

// 7. Site Config (站点配置，全端动态驱动)
export async function fetchSiteConfig(): Promise<SiteConfig> {
  return request<SiteConfig>(`${API_BASE}/config`)
}

export async function updateSiteConfig(data: Partial<SiteConfig>): Promise<SiteConfig> {
  return request<SiteConfig>(`${API_BASE}/config`, {
    method: 'PUT',
    body: JSON.stringify(data),
  })
}

// 9. Curator Profile (主理人身份档案中枢，全端动态驱动)
export async function fetchCuratorProfile(): Promise<CuratorProfile | null> {
  try {
    return await request<CuratorProfile>(`${API_BASE}/profile`)
  } catch (err) {
    console.error('Failed to fetch curator profile:', err)
    return null
  }
}

export async function updateCuratorProfile(data: Partial<CuratorProfile>): Promise<CuratorProfile> {
  return request<CuratorProfile>(`${API_BASE}/profile`, {
    method: 'PUT',
    body: JSON.stringify(data),
  })
}

// 10. 系统生命周期与首台设备认领
export async function fetchSystemStatus(): Promise<SystemStatus> {
  return request<SystemStatus>(`${API_BASE}/system/status`)
}

function detectBrowserDeviceName(): string {
  if (typeof navigator === 'undefined') return 'Web Browser'
  const ua = navigator.userAgent || ''
  let browser = 'Browser'
  if (ua.includes('Edg/')) browser = 'Edge'
  else if (ua.includes('Chrome/') && !ua.includes('Edg/')) browser = 'Chrome'
  else if (ua.includes('Firefox/')) browser = 'Firefox'
  else if (ua.includes('Safari/') && !ua.includes('Chrome/')) browser = 'Safari'

  let os = 'Web'
  if (ua.includes('Macintosh') || ua.includes('Mac OS X')) os = 'macOS'
  else if (ua.includes('iPhone') || ua.includes('iPad')) os = 'iOS'
  else if (ua.includes('Android')) os = 'Android'
  else if (ua.includes('Windows')) os = 'Windows'
  else if (ua.includes('Linux')) os = 'Linux'

  return `${browser} · ${os}`
}

export async function claimDevice(data: ClaimPayload): Promise<ClaimResult> {
  const res = await request<ClaimResult>(`${API_BASE}/auth/claim`, {
    method: 'POST',
    body: JSON.stringify({
      ...data,
      device_name: data.device_name || detectBrowserDeviceName(),
      platform: data.platform || 'web',
    }),
  })
  markCookieSession()
  return res
}

// 12. 信贷渠道管理
export async function fetchCreditChannels(): Promise<CreditChannel[]> {
  return request<CreditChannel[]>(`${API_BASE}/credit-channels`)
}

export async function createCreditChannel(data: {
  name: string
  repayment_day: number
  code?: string
  color?: string
}): Promise<CreditChannel> {
  return request<CreditChannel>(`${API_BASE}/credit-channels`, {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

export async function updateCreditChannel(
  id: number,
  data: Partial<CreditChannel>,
): Promise<CreditChannel> {
  return request<CreditChannel>(`${API_BASE}/credit-channels/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  })
}

export async function deleteCreditChannel(id: number): Promise<boolean> {
  await request(`${API_BASE}/credit-channels/${id}`, {
    method: 'DELETE',
  })
  return true
}

// 14. 年度生活年鉴画卷
export async function fetchAnnualAlmanacSummary(year: number): Promise<AnnualAlmanacSummary> {
  const raw = await request<any>(`${API_BASE}/almanac/summary?year=${year}`)

  const rawPrologue = raw?.prologue || {}
  const rawWishes = raw?.wishes || {}
  const rawHighlights = raw?.highlights || {}
  const rawFinances = raw?.finances || {}

  const fulfilledWishes: Wish[] = Array.isArray(rawWishes.wishes) ? rawWishes.wishes : []
  const photos = Array.isArray(rawHighlights.photos) ? rawHighlights.photos : []

  const activeDays = Number(rawPrologue.active_days ?? rawPrologue.distinct_days ?? 0)
  const totalBudget = Number(rawWishes.total_budget ?? 0)
  const totalActual = Number(rawWishes.total_actual ?? 0)
  const wantingCount = Number(rawWishes.wanting_count ?? 0)
  const wishSpendingPercent = Number(rawFinances.wish_spending_ratio ?? 0)
  const categories = Array.isArray(rawFinances.categories) ? rawFinances.categories : []

  return {
    year: Number(raw?.year || year),
    prologue: {
      total_entries: Number(rawPrologue.total_entries || 0),
      active_days: activeDays,
      total_words: Number(rawPrologue.total_words || 0),
      first_date: rawPrologue.first_date || '',
      last_date: rawPrologue.last_date || '',
      wishes_fulfilled: Number(rawPrologue.wishes_fulfilled ?? fulfilledWishes.length),
      tx_count: Number(rawPrologue.tx_count ?? 0),
    },
    wishes: {
      fulfilled_count: Number(rawWishes.fulfilled_count ?? fulfilledWishes.length),
      wanting_count: wantingCount,
      total_budget: totalBudget,
      total_actual: totalActual,
      wishes: fulfilledWishes,
    },
    highlights: {
      spring: rawHighlights.spring || undefined,
      summer: rawHighlights.summer || undefined,
      autumn: rawHighlights.autumn || undefined,
      winter: rawHighlights.winter || undefined,
      photos,
    },
    finances: {
      total_expense: Number(rawFinances.total_expense || 0),
      total_income: Number(rawFinances.total_income || 0),
      balance: Number(rawFinances.balance || 0),
      wish_expenses: Number(rawFinances.wish_expenses || 0),
      wish_spending_ratio: wishSpendingPercent,
      categories,
    },
  }
}

// 15. 系统版本检测 (管理端专用)
export async function checkSystemUpdate(force?: boolean): Promise<UpdateCheckResult> {
  return request<UpdateCheckResult>(`${API_BASE}/system/update-check${force ? '?force=true' : ''}`)
}

// 16. 全局自定义分类字典 (Custom Categories CRUD)
export async function fetchCategories(scope?: CategoryScope): Promise<CategoriesResponse> {
  const qs = scope ? `?scope=${encodeURIComponent(scope)}` : ''
  return request<CategoriesResponse>(`${API_BASE}/categories${qs}`)
}

export async function createCategoryOption(data: {
  scope: CategoryScope
  name: string
  sort_order?: number
}): Promise<CategoryOption> {
  return request<CategoryOption>(`${API_BASE}/categories`, {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

export async function deleteCategoryOption(id: number): Promise<boolean> {
  await request(`${API_BASE}/categories/${id}`, {
    method: 'DELETE',
  })
  return true
}

// 17. 全量 ZIP 备份与灾难恢复
export async function fetchBackupList(): Promise<BackupItem[]> {
  const res = await request<BackupItem[]>(`${API_BASE}/system/backup/list`)
  return Array.isArray(res) ? res : []
}

export async function createBackupNow(): Promise<BackupItem> {
  return request<BackupItem>(`${API_BASE}/system/backup/now`, {
    method: 'POST',
  })
}

export async function deleteBackup(filename: string): Promise<BackupItem[]> {
  const res = await request<BackupItem[]>(
    `${API_BASE}/system/backup/${encodeURIComponent(filename)}`,
    {
      method: 'DELETE',
    },
  )
  return Array.isArray(res) ? res : []
}

export async function restoreBackupByFilename(
  filename: string,
): Promise<{ message: string; filename: string; size: number }> {
  const res = await request<{ message: string; filename: string; size: number }>(
    `${API_BASE}/system/backup/restore`,
    {
      method: 'POST',
      body: JSON.stringify({ filename }),
    },
  )
  await clearApiCache()
  return res
}

export async function restoreBackupByFile(
  file: File,
  onProgress?: (percent: number) => void,
): Promise<{ message: string; filename: string; size: number }> {
  const formData = new FormData()
  formData.append('file', file)
  const res = await xhrUploadFormData<{ message: string; filename: string; size: number }>({
    url: `${API_BASE}/system/backup/restore`,
    formData,
    onProgress,
    errorPrefix: '恢复失败',
    networkErrorMessage: '网络中断，上传恢复文件失败',
    parseErrorMessage: '解析还原响应失败',
  })
  await clearApiCache()
  return res
}

export async function downloadBackup(filename: string): Promise<void> {
  const blob = await rawRequest<Blob>(
    `${API_BASE}/system/backup/download/${encodeURIComponent(filename)}`,
    {
      timeoutMs: UPLOAD_TIMEOUT_MS,
      errorPrefix: '下载备份失败',
    },
    (res) => res.blob(),
  )
  const url = window.URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  window.URL.revokeObjectURL(url)
}
