import { ref } from 'vue'
import type {
  LifeEntry,
  Transaction,
  TransactionSummary,
  StorageStatus,
  StorageConfigPayload,
  GlobalStats,
  Project,
  TrustedDevice,
  PairingTicketResult,
  SiteConfig,
  CuratorProfile,
  SystemStatus,
  BootstrapPayload,
  BootstrapResult,
  PairConfirmPayload,
  PairConfirmResult,
  PairStatusResult,
  VerifyPasscodeResult,
  UnifiedUploadResult,
  Wish,
  AssetsOverview,
  CreditChannel,
  Footprint,
  FootprintsAtlasResponse,
  CityMemoryDrawerData,
  ProvinceMemoryDrawerData,
  AnnualAlmanacSummary,
  UpdateCheckResult,
  GearItem,
  CategoryOption,
  CategoriesResponse,
  CategoryScope,
  BackupItem,
} from '../types'

const API_BASE = '/api/v1'
// 旧版：明文令牌落盘（仅用于兼容**尚未下发 Cookie 的旧服务端**）
const ADMIN_TOKEN_KEY = 'looseleaf_admin_token'
// MOB-P1-69：Cookie 会话标记 —— **不是凭据**，只用来判断「当前是不是主人」
const ADMIN_SESSION_KEY = 'looseleaf_admin_session'
// MOB-P1-69：Cookie 会话模式下的占位符。绝不可当作令牌发送出去。
const COOKIE_SESSION_MARKER = '__cookie_session__'

function readStoredAdminToken(): string {
  try {
    return localStorage.getItem(ADMIN_TOKEN_KEY) || ''
  } catch {
    return ''
  }
}

/** MOB-P1-69：是否已建立基于 HttpOnly Cookie 的会话 */
function hasCookieSession(): boolean {
  try {
    return localStorage.getItem(ADMIN_SESSION_KEY) === '1'
  } catch {
    return false
  }
}

const adminTokenRef = ref<string>(hasCookieSession() ? COOKIE_SESSION_MARKER : readStoredAdminToken())

/**
 * MOB-P1-xx：**响应式**的会话态。
 *
 * 之前 `Boolean(getAdminToken())` 这类 computed 在 Cookie 会话模式下**永远不失效** ——
 * `getAdminToken()` 在 Cookie 分支里只**写** `adminTokenRef`、不**读**它，
 * 于是 computed 收集不到任何响应式依赖，缓存的 true 永远留着。
 * 结果：登出 / 401 之后，界面仍显示主人专属入口，点进去立刻再 401。
 *
 * 现在把「是否有会话」放进一个 ref，computed 读它就能正常建立依赖。
 */
const sessionActiveRef = ref<boolean>(hasCookieSession() || readStoredAdminToken() !== '')

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key === ADMIN_TOKEN_KEY || e.key === ADMIN_SESSION_KEY || e.key === null) {
      adminTokenRef.value = hasCookieSession() ? COOKIE_SESSION_MARKER : readStoredAdminToken()
    }
  })
}

/**
 * 当前是否具备主理人权限。
 *
 * MOB-P1-69：Cookie 会话模式下返回的是一个**占位符**而不是真实令牌 ——
 * 既有的 60 余处 `Boolean(getAdminToken())` 守卫语义一字不变，
 * 而真正发请求的地方会因为「这是占位符」而不去设置 Authorization 头
 * （浏览器会自动带上 HttpOnly Cookie，令牌从此不落在 JS 能读到的地方）。
 */
export function getAdminToken(): string {
  // 读一下响应式的会话态 —— 这一句是让 `Boolean(getAdminToken())` 形式的
  // computed 能正常失效的关键（见 sessionActiveRef 的说明）。
  void sessionActiveRef.value
  if (hasCookieSession()) {
    adminTokenRef.value = COOKIE_SESSION_MARKER
    return COOKIE_SESSION_MARKER
  }
  const stored = readStoredAdminToken()
  if (adminTokenRef.value !== stored) {
    adminTokenRef.value = stored
  }
  return adminTokenRef.value
}

/** 该「令牌」是否只是 Cookie 会话占位符（不可作为凭据发送） */
export function isCookieSessionOnly(token: string): boolean {
  return token === COOKIE_SESSION_MARKER
}

/** 兼容路径：服务端未下发 Cookie 时才落盘明文令牌 */
export function setAdminToken(token: string): void {
  const clean = token.trim()
  if (!clean || isCookieSessionOnly(clean)) return
  try {
    localStorage.setItem(ADMIN_TOKEN_KEY, clean)
  } catch {}
  adminTokenRef.value = clean
  sessionActiveRef.value = true
}

/** MOB-P1-69：标记「已建立 Cookie 会话」，并清掉历史遗留的明文令牌 */
function markCookieSession(): void {
  try {
    localStorage.setItem(ADMIN_SESSION_KEY, '1')
  } catch {}
  try {
    localStorage.removeItem(ADMIN_TOKEN_KEY)
  } catch {}
  adminTokenRef.value = COOKIE_SESSION_MARKER
  sessionActiveRef.value = true
}

export function removeAdminToken(): void {
  try {
    localStorage.removeItem(ADMIN_TOKEN_KEY)
  } catch {}
  try {
    localStorage.removeItem(ADMIN_SESSION_KEY)
  } catch {}
  adminTokenRef.value = ''
  sessionActiveRef.value = false
  // MOB-P1-69：让服务端把 HttpOnly Cookie 一并清掉。
  //
  // MOB-P1-xx：注意这里的语义 —— 清除本地态（token / 会话标记）已由上面完成，
  // 而服务端 LogoutSession 只清浏览器 Cookie、**不吊销** devices 表里的设备令牌
  // （后端注释里写明这是有意设计）。所以这次登出是「清浏览器里的凭据」，
  // 不是「吊销设备」。若把这两件事混为一谈，一个只读接口的偶发 401
  // 就会把用户整个踢出主人态。
  void fetch(`${API_BASE}/auth/logout`, { method: 'POST', credentials: 'same-origin' }).catch(() => {})
}

/**
 * MOB-P1-xx：只清**本地**凭据，不发登出请求。
 *
 * 401 只说明「这次请求没被认账」（令牌轮换、网关鉴权抖动……），
 * 不代表整个浏览器会话该被清掉 —— 之前 401 一律走 removeAdminToken()，
 * 而 removeAdminToken() 会连带 POST /auth/logout 把 HttpOnly Cookie 打死，
 * 于是一次只读接口的偶发 401 就把用户静默踢出主人态。
 */
export function clearLocalCredential(): void {
  try {
    localStorage.removeItem(ADMIN_TOKEN_KEY)
  } catch {}
  try {
    localStorage.removeItem(ADMIN_SESSION_KEY)
  } catch {}
  adminTokenRef.value = ''
  sessionActiveRef.value = false
}

/**
 * MOB-P1-69：探测服务端是否认账当前浏览器带的 HttpOnly Cookie。
 *
 * 只回传角色、不回传任何凭据，因此可以安全地在启动时调用。
 */
type SessionProbe =
  | { kind: 'admin' }
  | { kind: 'not-admin' }
  /** 探针本身失败（离线 / 网关 5xx / 旧服务端没这个路由）—— **不能**据此判定会话失效 */
  | { kind: 'unknown' }

async function probeSessionCookie(): Promise<SessionProbe> {
  try {
    const res = await fetch(`${API_BASE}/auth/session`, { credentials: 'same-origin' })
    // 401/403 才是「服务端明确说不认账」
    if (res.status === 401 || res.status === 403) return { kind: 'not-admin' }
    // 5xx / 404（旧服务端未实现该路由）属于「探针不可用」，不是「会话失效」
    if (!res.ok) return { kind: 'unknown' }
    const json = await res.json()
    const data = json && typeof json === 'object' && 'data' in json ? json.data : json
    return (data && (data as { is_admin?: boolean }).is_admin)
      ? { kind: 'admin' }
      : { kind: 'not-admin' }
  } catch {
    // 网络不可达 —— 探针没跑成，不代表 Cookie 失效
    return { kind: 'unknown' }
  }
}

/**
 * MOB-P1-69：登录 / 配对成功后建立会话。
 *
 * 优先使用服务端下发的 HttpOnly Cookie（令牌 JS 读不到 ⇒ 一次 XSS 也偷不走）；
 * 若服务端仍是旧版（不下发 Cookie），自动回落到旧的明文令牌路径，保证不兼容中断。
 */
export async function establishSession(token: string): Promise<void> {
  const clean = token.trim()
  if (!clean || isCookieSessionOnly(clean)) return
  const probe = await probeSessionCookie()
  if (probe.kind === 'admin') {
    markCookieSession()
    return
  }
  // 'unknown'（探针没跑成）与 'not-admin' 都先回落���明文令牌路径 ——
  // 登录动作本身说明服务端认这个密钥，先用它保证可用；
  // 下次 refreshSessionState 会按探针的真实结果校正。
  setAdminToken(clean)
}

/** MOB-P1-69：启动时确认 Cookie 会话是否仍然有效（刷新页面后恢复主理人视角） */
export async function refreshSessionState(): Promise<boolean> {
  const probe = await probeSessionCookie()

  if (probe.kind === 'admin') {
    markCookieSession()
    return true
  }

  // MOB-P1-xx：探针**没跑成**（离线 / 网关 5xx / 旧服务端没有这个路由）
  // 不等于「会话已失效」。
  // 之前一律当作失效 ⇒ 一次网络抖动就把主理人视角清掉，
  // 而 HttpOnly Cookie 其实还在、服务端仍然认账 ⇒ 网络一恢复主人态又凭空回来，
  // 行为来回跳变。
  if (probe.kind === 'unknown') {
    // 保留现状（不增不减），让 UI 维持当前认知，等网络恢复后自然校正。
    return hasCookieSession() || readStoredAdminToken() !== ''
  }

  // 服务端**明确**说不认账（401/403，或返回了 is_admin=false）
  // ⇒ 这时必须把标记清掉，否则 UI 会一直以为「还是主人」，
  // 直到下一次请求 401 才反应过来 —— 主理人视角会挂在不该出现的界面上。
  if (hasCookieSession()) {
    try {
      localStorage.removeItem(ADMIN_SESSION_KEY)
    } catch {}
    adminTokenRef.value = readStoredAdminToken()
    sessionActiveRef.value = adminTokenRef.value !== ''
  }
  return false
}

// 通用请求处理
// MOB-P1-101：移动网络断连时 fetch 可能挂起数分钟（iOS 默认 ~300s），
// 这里为所有 JSON 请求加上统一超时，避免页面永远转圈。
const REQUEST_TIMEOUT_MS = 25_000

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const token = getAdminToken()
  const authHeaders: Record<string, string> = {}
  // MOB-P1-69：Cookie 会话模式下不发送令牌头 —— 同源请求会自动带上 HttpOnly Cookie
  if (token && !isCookieSessionOnly(token)) {
    authHeaders['Authorization'] = `Bearer ${token}`
    authHeaders['X-Device-Token'] = token
  }

  const timeoutController = new AbortController()
  const timer = setTimeout(() => timeoutController.abort(), REQUEST_TIMEOUT_MS)
  let signal: AbortSignal | undefined = timeoutController.signal
  if (options?.signal) {
    signal =
      typeof AbortSignal !== 'undefined' && typeof AbortSignal.any === 'function'
        ? AbortSignal.any([options.signal, timeoutController.signal])
        : options.signal
  }

  let res: Response
  try {
    res = await fetch(url, {
      ...options,
      signal,
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders,
        ...(options?.headers as Record<string, string> | undefined),
      },
    })
  } catch (err: any) {
    if (err?.name === 'AbortError') {
      throw new Error('请求超时，请检查网络后重试')
    }
    throw err
  } finally {
    clearTimeout(timer)
  }

  if (!res.ok) {
    if (res.status === 401 && !url.includes('/auth/verify')) {
      // MOB-P1-xx：401 只清**本地**凭据，不做全局登出。
      //
      // 之前这里走 removeAdminToken()，而它会连带 POST /auth/logout 把 HttpOnly Cookie 打死
      // ⇒ 任何一次只读接口的偶发 401（令牌轮换、网关鉴权抖动）都会把用户静默踢出主人态。
      // 服务端的 LogoutSession 只清浏览器 Cookie、并不吊销 devices 表里的设备令牌，
      // 所以那次「登出」既粗暴又没真正吊销任何东西。
      clearLocalCredential()
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('looseleaf-auth-expired'))
      }
    }
    let msg = `HTTP error ${res.status}`
    try {
      const errJson = await res.json()
      if (errJson.message) msg = errJson.message
    } catch {
      // ignore
    }
    throw new Error(msg)
  }

  const json = await res.json()
  // 兼容标准结构 { code: 200, message: "success", data: ... }
  if (json && typeof json === 'object' && 'code' in json && 'data' in json) {
    return json.data as T
  }
  return json as T
}

// 1. Life Entries
// MOB-P0-17：原先所有 fetchEntries 调用共用一个模块级 AbortController，
// 归档页（按年分页）会连带 abort 掉首页时间流的请求，导致首页被清空。
// 现在按「查询作用域」隔离控制器，不同作用域互不干扰。
const entriesAbortControllers = new Map<string, AbortController>()

function entriesScope(params?: {
  type?: string
  category?: string
  year?: string
}): string {
  if (params?.year && params.year !== 'all') return `year:${params.year}`
  if (params?.category && params.category !== 'all') return `category:${params.category}`
  if (params?.type && params.type !== 'all') return `type:${params.type}`
  return 'default'
}

const ENTRIES_ETAG_KEY = 'looseleaf_entries_etag'
let entriesETag = ''
try {
  entriesETag = localStorage.getItem(ENTRIES_ETAG_KEY) || ''
} catch {}

export function resetEntriesETag(): void {
  entriesETag = ''
  try {
    localStorage.removeItem(ENTRIES_ETAG_KEY)
  } catch {}
}

export function clearApiCache(): void {
  resetEntriesETag()
  try {
    localStorage.removeItem('looseleaf_cached_entries')
    localStorage.removeItem('looseleaf_cached_transactions')
    localStorage.removeItem('looseleaf_entries_cache')
    localStorage.removeItem('looseleaf_transactions_cache')
    localStorage.removeItem('looseleaf_curator_profile')
  } catch {}
}

export async function fetchEntries(params?: {
  page?: number
  page_size?: number
  type?: string
  category?: string
  year?: string
  signal?: AbortSignal
}): Promise<LifeEntry[] | null> {
  // 竞态保护：同一作用域内的上一次未完成请求会被终止；不同作用域互不影响。
  const scope = entriesScope(params)
  let signal = params?.signal
  if (!signal) {
    const previous = entriesAbortControllers.get(scope)
    if (previous) {
      previous.abort()
    }
    const controller = new AbortController()
    entriesAbortControllers.set(scope, controller)
    signal = controller.signal
  }

  const query = new URLSearchParams()
  if (params?.page) query.set('page', String(params.page))
  if (params?.page_size) query.set('page_size', String(params.page_size))
  if (params?.type && params.type !== 'all') query.set('type', params.type)
  if (params?.category && params.category !== 'all') query.set('category', params.category)
  if (params?.year && params.year !== 'all') query.set('year', params.year)

  const url = `${API_BASE}/entries?${query.toString()}`

  const token = getAdminToken()
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }
  // MOB-P1-69：Cookie 会话模式下不发送令牌头
  if (token && !isCookieSessionOnly(token)) {
    headers['Authorization'] = `Bearer ${token}`
  }

  // 默认首页无过滤列表启用 If-None-Match 缓存协商 (FE-10)
  const isDefaultList = !params?.type && !params?.category && !params?.year && (params?.page || 1) === 1
  if (isDefaultList && entriesETag) {
    headers['If-None-Match'] = entriesETag
  }

  try {
    const res = await fetch(url, {
      headers,
      signal,
    })

    // 命中 304 缓存协商：返回 null 告知调用方保持现有引用，跳过重渲染 (FE-10)
    if (res.status === 304) {
      return null
    }

    if (!res.ok) {
      let msg = `HTTP error ${res.status}`
      try {
        const errJson = await res.json()
        if (errJson.message) msg = errJson.message
      } catch {}
      throw new Error(msg)
    }

    const newEtag = res.headers.get('ETag')
    if (isDefaultList && newEtag) {
      entriesETag = newEtag
      try {
        localStorage.setItem(ENTRIES_ETAG_KEY, newEtag)
      } catch {}
    }

    const json = await res.json()
    const data = (json && typeof json === 'object' && 'code' in json && 'data' in json) ? json.data : json
    return data?.entries || []
  } catch (err: any) {
    if (err?.name === 'AbortError') {
      // MOB-P0-17：中断表示「本次结果作废」，必须返回 null（与 304 同义），
      // 绝不能返回 [] —— 否则调用方会把既有时间流整片清空。
      return null
    }
    throw err
  }
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
  limit = 30
): Promise<{
  query: string
  entries: LifeEntry[]
  footprints: Footprint[]
  wishes: Wish[]
  projects: Project[]
}> {
  const params = new URLSearchParams()
  params.set('q', q)
  params.set('limit', String(limit))
  const res = await request<{
    query?: string
    entries?: LifeEntry[]
    footprints?: Footprint[]
    wishes?: Wish[]
    projects?: Project[]
  }>(`${API_BASE}/search?${params.toString()}`)
  return {
    query: res?.query ?? q,
    entries: Array.isArray(res?.entries) ? res.entries : [],
    footprints: Array.isArray(res?.footprints) ? res.footprints : [],
    wishes: Array.isArray(res?.wishes) ? res.wishes : [],
    projects: Array.isArray(res?.projects) ? res.projects : [],
  }
}

export async function createLifeEntry(data: {
  type: string
  title?: string
  content: string
  occurred_at?: string
  location?: string
  city_code?: string
  city_name?: string
  project_id?: number | null
  wish_id?: number | null
  footprint_id?: number | null
  featured?: boolean
  attachment_ids?: number[]
}): Promise<LifeEntry> {
  const result = await request<LifeEntry>(`${API_BASE}/entries`, {
    method: 'POST',
    body: JSON.stringify(data),
  })
  resetEntriesETag()
  return result
}

export async function updateLifeEntry(
  id: number,
  data: {
    type?: string
    title?: string
    content?: string
    occurred_at?: string
    location?: string
    city_code?: string
    city_name?: string
    project_id?: number | null
    wish_id?: number | null
    footprint_id?: number | null
    featured?: boolean
    attachment_ids?: number[]
  }
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

// 2. R2 Presigned Upload
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

export async function testStorageConfig(payload: StorageConfigPayload): Promise<{ status: string; message: string; latency_ms?: number }> {
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

// 统一文件上传接口：上传物理文件至后端 POST /api/v1/files/upload，返回相对路径 object_key 与临时签名 URL
// MOB-P0-16：补上超时与取消能力 —— 移动网络下弱网上传会无限挂起，
// 进度条永远停在某个百分比，用户既看不到错误也无法放弃。
const UPLOAD_TIMEOUT_MS = 120_000

export async function uploadUnifiedFile(
  file: File,
  folder: string = 'avatar',
  onProgress?: (percent: number) => void,
  signal?: AbortSignal
): Promise<UnifiedUploadResult> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    const formData = new FormData()
    formData.append('file', file)
    formData.append('folder', folder)

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
          if (res.data) {
            resolve(res.data)
          } else {
            resolve(res)
          }
        } catch {
          reject(new Error('解析上传响应失败'))
        }
      } else {
        try {
          const errRes = JSON.parse(xhr.responseText)
          reject(new Error(errRes.message || `上传失败 (HTTP ${xhr.status})`))
        } catch {
          reject(new Error(`上传失败 (HTTP ${xhr.status})`))
        }
      }
    }

    xhr.onerror = () => {
      fail('网络中断，上传请求失败')
    }

    xhr.ontimeout = () => {
      fail('上传超时，请检查网络后重试')
    }

    xhr.onabort = () => {
      fail('上传已取消')
    }

    xhr.timeout = UPLOAD_TIMEOUT_MS
    xhr.open('POST', `${API_BASE}/files/upload`, true)
    const token = getAdminToken()
    // MOB-P1-69：Cookie 会话模式下不发送令牌头（同源 XHR 会自动带上 Cookie）
    if (token && !isCookieSessionOnly(token)) {
      xhr.setRequestHeader('Authorization', `Bearer ${token}`)
      xhr.setRequestHeader('X-Admin-Key', token)
    }
    xhr.send(formData)
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
  footprint_id?: number | null
  city_code?: string
  is_installment?: boolean
  installment_channel_code?: string
  installment_total_amount?: number
  installment_months?: number
  installment_monthly_pay?: number
  installment_remain_months?: number
  repayment_day?: number
  link_gear_asset?: boolean
  gear_category?: string
  gear_spec?: string
}): Promise<Transaction> {
  return request<Transaction>(`${API_BASE}/transactions`, {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

// 3.1 Wishes (心愿单，公开只读与联动)
export async function fetchWishes(params?: { kind?: string; status?: string }): Promise<Wish[]> {
  const query = new URLSearchParams()
  if (params?.kind) query.set('kind', params.kind)
  if (params?.status) query.set('status', params.status)
  const qs = query.toString()
  const res = await request<Wish[] | { wishes?: Wish[] }>(`${API_BASE}/wishes${qs ? '?' + qs : ''}`)
  return Array.isArray(res) ? res : (res?.wishes || [])
}

export async function createWish(data: {
  title: string
  kind: 'item' | 'travel' | 'milestone'
  note?: string
  spec?: string
  city_code?: string
  city_name?: string
  budget?: number
  target_date?: string
  /** 许下心愿的时刻（可选，支持补录过去的心愿） */
  planted_at?: string
  attachment_ids?: number[]
}): Promise<Wish> {
  return request<Wish>(`${API_BASE}/wishes`, {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

export async function updateWish(id: number, data: Partial<Wish> & { attachment_ids?: number[] }): Promise<Wish> {
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
    create_gear_asset?: boolean
    create_life_entry?: boolean
    create_footprint?: boolean
    entry_content?: string
    attachment_ids?: number[]
    is_installment?: boolean
    installment_channel_code?: string
    installment_months?: number
    repayment_day?: number
  }
): Promise<Wish> {
  return request<Wish>(`${API_BASE}/wishes/${id}/resolve`, {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

export async function updateTransaction(
  id: number,
  data: Partial<Transaction>
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

// 4. Projects
export async function fetchProjects(): Promise<Project[]> {
  return request<Project[]>(`${API_BASE}/projects`)
}

export async function createProject(data: {
  title: string
  subtitle?: string
  description?: string
  story?: string
  category?: string
  github_url?: string
  status?: string
  featured?: boolean
  order?: number
}): Promise<Project> {
  return request<Project>(`${API_BASE}/projects`, {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

export async function updateProject(
  id: number,
  data: {
    title?: string
    subtitle?: string
    description?: string
    story?: string
    category?: string
    github_url?: string
    status?: string
    featured?: boolean
    order?: number
  }
): Promise<Project> {
  return request<Project>(`${API_BASE}/projects/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  })
}

export async function deleteProject(id: number): Promise<boolean> {
  await request(`${API_BASE}/projects/${id}`, {
    method: 'DELETE',
  })
  return true
}

// 5. Global Stats
export async function fetchGlobalStats(): Promise<GlobalStats> {
  return request<GlobalStats>(`${API_BASE}/stats`)
}

// 6. Device Pairing & Trusted Devices (设备免密配对与管理)
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

export async function confirmPairingTicket(data: PairConfirmPayload): Promise<PairConfirmResult> {
  const res = await request<PairConfirmResult>(`${API_BASE}/auth/pair/confirm`, {
    method: 'POST',
    body: JSON.stringify(data),
  })
  if (res.device_token) {
    // MOB-P1-69：优先建立 HttpOnly Cookie 会话
    await establishSession(res.device_token)
  }
  return res
}

export async function pollPairingTicketStatus(ticket: string): Promise<PairStatusResult> {
  const res = await request<PairStatusResult>(
    `${API_BASE}/auth/pair/status?ticket=${encodeURIComponent(ticket)}`
  )
  if (res.web_token) {
    // MOB-P1-69：优先建立 HttpOnly Cookie 会话
    await establishSession(res.web_token)
  }
  return res
}

export async function fetchPairQRCode(hubUrl: string, ticket: string): Promise<{
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
  name: string
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

// 10. 系统生命周期与冷启动两步装帧 (System Lifecycle & Two-Step Bootstrap RC-59)
export async function fetchSystemStatus(): Promise<SystemStatus> {
  return request<SystemStatus>(`${API_BASE}/system/status`)
}

export async function bootstrapSystem(data: BootstrapPayload): Promise<BootstrapResult> {
  const payload: BootstrapPayload = {
    ...data,
    hub_url: data.hub_url || (typeof window !== 'undefined' ? window.location.origin : ''),
  }
  return request<BootstrapResult>(`${API_BASE}/system/bootstrap`, {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

// 11. 浏览器设备名识别与扉页管理员密钥验证 (Admin Key Sign-In RC-60)
export function detectBrowserDeviceName(): string {
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

export async function verifyMasterPasscode(
  passcode: string,
  deviceName?: string
): Promise<VerifyPasscodeResult> {
  const res = await request<VerifyPasscodeResult>(`${API_BASE}/auth/verify`, {
    method: 'POST',
    body: JSON.stringify({
      passcode,
      device_name: deviceName || detectBrowserDeviceName(),
    }),
  })
  if (res.token) {
    // MOB-P1-69：优先建立 HttpOnly Cookie 会话
    await establishSession(res.token)
  }
  return res
}

// 12. 资产管理中枢、固定设备库与信贷渠道 (Assets, Gear & Credit Channels RC-53, FE-15, RG-20)
export async function fetchAssetsOverview(): Promise<AssetsOverview> {
  return request<AssetsOverview>(`${API_BASE}/assets/overview`)
}

export async function updateInitialLiquidBalance(
  initial_liquid_balance: number
): Promise<{ initial_liquid_balance: number }> {
  return request<{ initial_liquid_balance: number }>(`${API_BASE}/assets/liquid-balance`, {
    method: 'PUT',
    body: JSON.stringify({ initial_liquid_balance }),
  })
}

export async function addGearAsset(data: {
  name: string
  category: string
  spec?: string
  price_cents?: number
  purchase_date?: string
  payment_method?: string
  note?: string
  create_transaction?: boolean
  is_installment?: boolean
  installment_channel_code?: string
  installment_total_amount?: number
  installment_months?: number
  repayment_day?: number
}): Promise<GearItem> {
  return request<GearItem>(`${API_BASE}/assets/gear`, {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

export async function sellGearAsset(
  id: string,
  data: {
    sold_price_cents: number
    sold_date?: string
    note?: string
  }
): Promise<GearItem> {
  return request<GearItem>(
    `${API_BASE}/assets/gear/${encodeURIComponent(id)}/sell`,
    {
      method: 'POST',
      body: JSON.stringify(data),
    }
  )
}

export async function deleteGearAsset(
  id: string
): Promise<{ id: string; deleted: boolean }> {
  return request<{ id: string; deleted: boolean }>(
    `${API_BASE}/assets/gear/${encodeURIComponent(id)}`,
    {
      method: 'DELETE',
    }
  )
}

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
  data: Partial<CreditChannel>
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

// 13. 空间旅游足迹与城市回忆抽屉 (Footprints & Atlas & Memory Drawer FE-12, FE-13)
export async function fetchFootprints(params?: {
  city_code?: string
  year?: number
  since?: string
}): Promise<Footprint[]> {
  const query = new URLSearchParams()
  if (params?.city_code) query.set('city_code', params.city_code)
  if (params?.year) query.set('year', String(params.year))
  if (params?.since) query.set('since', params.since)
  const qs = query.toString()
  return request<Footprint[]>(`${API_BASE}/footprints${qs ? '?' + qs : ''}`)
}

export async function fetchFootprintsAtlas(): Promise<FootprintsAtlasResponse> {
  return request<FootprintsAtlasResponse>(`${API_BASE}/footprints/atlas`)
}

export async function fetchCityMemoryDrawer(cityCode: string): Promise<CityMemoryDrawerData> {
  return request<CityMemoryDrawerData>(`${API_BASE}/footprints/cities/${cityCode}/drawer`)
}

export async function fetchProvinceMemoryDrawer(adcode: string): Promise<ProvinceMemoryDrawerData> {
  return request<ProvinceMemoryDrawerData>(`${API_BASE}/footprints/provinces/${adcode}/drawer`)
}

export async function createFootprint(data: {
  city_code: string
  city_name: string
  visited_at: string
  departed_at?: string
  title?: string
  note?: string
  life_entry_id?: number
  wish_id?: number
  attachment_ids?: number[]
}): Promise<Footprint> {
  return request<Footprint>(`${API_BASE}/footprints`, {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

export async function updateFootprint(
  id: number,
  data: Partial<{
    city_code: string
    city_name: string
    title: string
    visited_at: string
    departed_at: string
    note: string
    life_entry_id: number | null
    wish_id: number | null
    attachment_ids: number[]
  }>
): Promise<Footprint> {
  return request<Footprint>(`${API_BASE}/footprints/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  })
}

export async function deleteFootprint(id: number, purge?: boolean): Promise<boolean> {
  await request(`${API_BASE}/footprints/${id}${purge ? '?purge=true' : ''}`, {
    method: 'DELETE',
  })
  return true
}

// 14. 年度生活年鉴画卷 (Annual Almanac Summary FE-14)
export async function fetchAnnualAlmanacSummary(year: number): Promise<AnnualAlmanacSummary> {
  const raw = await request<any>(`${API_BASE}/almanac/summary?year=${year}`)

  const rawPrologue = raw?.prologue || {}
  const rawAtlas = raw?.atlas || {}
  const rawWishes = raw?.wishes || {}
  const rawHighlights = raw?.highlights || {}
  const rawFinances = raw?.finances || {}

  const cities: { city_code: string; city_name: string }[] = Array.isArray(rawAtlas.cities)
    ? rawAtlas.cities
    : []

  const footprints: Footprint[] = Array.isArray(rawAtlas.footprints) ? rawAtlas.footprints : []

  const fulfilledWishes: Wish[] = Array.isArray(rawWishes.wishes)
    ? rawWishes.wishes
    : []

  const photos = Array.isArray(rawHighlights.photos)
    ? rawHighlights.photos
    : []

  const activeDays = Number(rawPrologue.active_days ?? rawPrologue.distinct_days ?? 0)
  const totalBudget = Number(rawWishes.total_budget ?? 0)
  const totalActual = Number(rawWishes.total_actual ?? 0)
  const wantingCount = Number(rawWishes.wanting_count ?? 0)

  // 后端唯一权威键为百分比口径 wish_spending_ratio (BE-38 去除同义双键)
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
      cities_visited: Number(rawPrologue.cities_visited ?? cities.length),
      tx_count: Number(rawPrologue.tx_count ?? 0),
    },
    atlas: {
      total_cities: Number(rawAtlas.total_cities ?? cities.length),
      cities,
      footprints,
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

// 15. 系统版本检测 (System Update Check · 管理端专用 RC-97)
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

export async function updateCategoryOption(
  id: number,
  data: {
    name?: string
    sort_order?: number
    rename_records?: boolean
  }
): Promise<CategoryOption> {
  return request<CategoryOption>(`${API_BASE}/categories/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  })
}

export async function deleteCategoryOption(id: number): Promise<boolean> {
  await request(`${API_BASE}/categories/${id}`, {
    method: 'DELETE',
  })
  return true
}

export async function resetCategoryOptions(scope?: CategoryScope): Promise<CategoriesResponse> {
  return request<CategoriesResponse>(`${API_BASE}/categories/reset`, {
    method: 'POST',
    body: JSON.stringify({ scope: scope || '' }),
  })
}

// 17. 全量 ZIP 备份与灾难恢复 (System Backup & Disaster Recovery)
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
  const res = await request<BackupItem[]>(`${API_BASE}/system/backup/${encodeURIComponent(filename)}`, {
    method: 'DELETE',
  })
  return Array.isArray(res) ? res : []
}

export async function restoreBackupByFilename(
  filename: string
): Promise<{ message: string; filename: string; size: number }> {
  const res = await request<{ message: string; filename: string; size: number }>(
    `${API_BASE}/system/backup/restore`,
    {
      method: 'POST',
      body: JSON.stringify({ filename }),
    }
  )
  clearApiCache()
  return res
}

export async function restoreBackupByFile(
  file: File,
  onProgress?: (percent: number) => void
): Promise<{ message: string; filename: string; size: number }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    const formData = new FormData()
    formData.append('file', file)

    if (xhr.upload && onProgress) {
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) {
          const percent = Math.round((e.loaded / e.total) * 100)
          onProgress(percent)
        }
      }
    }

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const res = JSON.parse(xhr.responseText)
          clearApiCache()
          if (res.data) {
            resolve(res.data)
          } else {
            resolve(res)
          }
        } catch {
          reject(new Error('解析还原响应失败'))
        }
      } else {
        try {
          const errRes = JSON.parse(xhr.responseText)
          reject(new Error(errRes.message || `恢复失败 (HTTP ${xhr.status})`))
        } catch {
          reject(new Error(`恢复失败 (HTTP ${xhr.status})`))
        }
      }
    }

    xhr.onerror = () => {
      reject(new Error('网络中断，上传恢复文件失败'))
    }

    xhr.open('POST', `${API_BASE}/system/backup/restore`, true)
    const token = getAdminToken()
    // MOB-P1-69：Cookie 会话模式下不发送令牌头
    if (token && !isCookieSessionOnly(token)) {
      xhr.setRequestHeader('Authorization', `Bearer ${token}`)
      xhr.setRequestHeader('X-Device-Token', token)
    }
    xhr.send(formData)
  })
}

export async function downloadBackup(filename: string): Promise<void> {
  const token = getAdminToken()
  const authHeaders: Record<string, string> = {}
  // MOB-P1-69：Cookie 会话模式下不发送令牌头
  if (token && !isCookieSessionOnly(token)) {
    authHeaders['Authorization'] = `Bearer ${token}`
    authHeaders['X-Device-Token'] = token
  }
  const res = await fetch(`${API_BASE}/system/backup/download/${encodeURIComponent(filename)}`, {
    headers: authHeaders,
  })
  if (!res.ok) {
    let msg = `下载备份失败 (HTTP ${res.status})`
    try {
      const err = await res.json()
      if (err.message) msg = err.message
    } catch {}
    throw new Error(msg)
  }
  const blob = await res.blob()
  const url = window.URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  window.URL.revokeObjectURL(url)
}





