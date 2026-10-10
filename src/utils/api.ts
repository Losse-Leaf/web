import type {
  LifeEntry,
  Transaction,
  TransactionSummary,
  StorageStatus,
  GlobalStats,
  Project,
  TrustedDevice,
  PairingTicketResult,
  SiteConfig,
  CuratorProfile,
  SystemStatus,
  BootstrapPayload,
  BootstrapResult,
  QRLoginSession,
  QRLoginPollResult,
  UnifiedUploadResult,
  Wish,
} from '../types'

const API_BASE = '/api/v1'
const ADMIN_TOKEN_KEY = 'looseleaf_admin_token'

export function getAdminToken(): string {
  try {
    return localStorage.getItem(ADMIN_TOKEN_KEY) || ''
  } catch {
    return ''
  }
}

export function setAdminToken(token: string): void {
  try {
    localStorage.setItem(ADMIN_TOKEN_KEY, token.trim())
  } catch {}
}

export function removeAdminToken(): void {
  try {
    localStorage.removeItem(ADMIN_TOKEN_KEY)
  } catch {}
}

// 通用请求处理
async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const token = getAdminToken()
  const authHeaders: Record<string, string> = {}
  if (token) {
    authHeaders['Authorization'] = `Bearer ${token}`
  }

  const res = await fetch(url, {
    headers: {
      'Content-Type': 'application/json',
      'X-Client-Platform': 'web',
      'X-Client-Version': '1.1.0',
      ...authHeaders,
      ...options?.headers,
    },
    ...options,
  })

  if (!res.ok) {
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
let entriesAbortController: AbortController | null = null

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

export async function fetchEntries(params?: {
  page?: number
  page_size?: number
  type?: string
  category?: string
  year?: string
  signal?: AbortSignal
}): Promise<LifeEntry[] | null> {
  // 竞态保护：未指定外部 signal 时自动终止上一次未完成的请求 (FE-08)
  if (!params?.signal) {
    if (entriesAbortController) {
      entriesAbortController.abort()
    }
    entriesAbortController = new AbortController()
  }

  const query = new URLSearchParams()
  if (params?.page) query.set('page', String(params.page))
  if (params?.page_size) query.set('page_size', String(params.page_size))
  if (params?.type && params.type !== 'all') query.set('type', params.type)
  if (params?.category && params.category !== 'all') query.set('category', params.category)
  if (params?.year && params.year !== 'all') query.set('year', params.year)

  const url = `${API_BASE}/entries?${query.toString()}`
  const signal = params?.signal || entriesAbortController?.signal

  const token = getAdminToken()
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Client-Platform': 'web',
    'X-Client-Version': '1.1.0',
  }
  if (token) {
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
      return []
    }
    throw err
  }
}

export async function fetchEntryById(id: number): Promise<LifeEntry> {
  return request<LifeEntry>(`${API_BASE}/entries/${id}`)
}

export async function createLifeEntry(data: {
  type: string
  title?: string
  content: string
  occurred_at?: string
  location?: string
  tags?: string
  project_id?: number | null
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
    tags?: string
    project_id?: number | null
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
  } catch {
    // 忽略静默清理失败
  }
}

export async function fetchStorageStatus(): Promise<StorageStatus> {
  return request<StorageStatus>(`${API_BASE}/storage/status`)
}

// 统一文件上传接口：上传物理文件至后端 POST /api/v1/files/upload，返回相对路径 object_key 与临时签名 URL
export async function uploadUnifiedFile(
  file: File,
  folder: string = 'avatar',
  onProgress?: (percent: number) => void
): Promise<UnifiedUploadResult> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    const formData = new FormData()
    formData.append('file', file)
    formData.append('folder', folder)

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
      reject(new Error('网络中断，上传请求失败'))
    }

    xhr.open('POST', `${API_BASE}/files/upload`, true)
    const token = getAdminToken()
    if (token) {
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
export async function fetchWishes(params?: { kind?: string; status?: string }): Promise<Wish[]> {
  const query = new URLSearchParams()
  if (params?.kind) query.set('kind', params.kind)
  if (params?.status) query.set('status', params.status)
  const qs = query.toString()
  try {
    return await request<Wish[]>(`${API_BASE}/wishes${qs ? '?' + qs : ''}`)
  } catch {
    return []
  }
}

export async function updateWish(id: number, data: Partial<Wish>): Promise<Wish> {
  return request<Wish>(`${API_BASE}/wishes/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  })
}

export async function resolveWish(
  id: number,
  data: {
    resolution_type?: 'exact' | 'altered' | 'relinquished'
    actual_cost?: number
    actual_title?: string
    fulfilled_at?: string
    create_transaction?: boolean
    transaction_id?: number
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
  tags?: string
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
    tags?: string
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
export async function initPairingTicket(): Promise<PairingTicketResult> {
  return request<PairingTicketResult>(`${API_BASE}/auth/pair/init`, {
    method: 'POST',
  })
}

export async function fetchTrustedDevices(): Promise<TrustedDevice[]> {
  try {
    return await request<TrustedDevice[]>(`${API_BASE}/auth/devices`)
  } catch {
    return []
  }
}

export async function revokeTrustedDevice(id: number): Promise<boolean> {
  await request(`${API_BASE}/auth/devices/${id}`, {
    method: 'DELETE',
  })
  return true
}

// 7. Site Config (站点配置，全端动态驱动)
export async function fetchSiteConfig(): Promise<SiteConfig> {
  return request<SiteConfig>(`${API_BASE}/config`)
}

// 9. Curator Profile (主理人身份档案中枢，全端动态驱动)
export async function fetchCuratorProfile(): Promise<CuratorProfile | null> {
  try {
    return await request<CuratorProfile>(`${API_BASE}/profile`)
  } catch {
    return null
  }
}

export async function updateCuratorProfile(data: Partial<CuratorProfile>): Promise<CuratorProfile> {
  return request<CuratorProfile>(`${API_BASE}/profile`, {
    method: 'PUT',
    body: JSON.stringify(data),
  })
}

// 10. 系统生命周期与冷启动装帧 (System Lifecycle & Bootstrap)
export async function fetchSystemStatus(): Promise<SystemStatus> {
  return request<SystemStatus>(`${API_BASE}/system/status`)
}

export async function bootstrapSystem(data: BootstrapPayload): Promise<BootstrapResult> {
  const result = await request<BootstrapResult>(`${API_BASE}/system/bootstrap`, {
    method: 'POST',
    body: JSON.stringify(data),
  })
  if (result.token) {
    setAdminToken(result.token)
  }
  return result
}

// 11. 网页反向扫码与口令快速登入 (Reverse QR Login & Passcode Verify)
export async function createQRLoginSession(): Promise<QRLoginSession> {
  return request<QRLoginSession>(`${API_BASE}/auth/qr/create`, {
    method: 'POST',
  })
}

export async function pollQRLoginSession(sessionId: string): Promise<QRLoginPollResult> {
  try {
    const res = await request<QRLoginPollResult>(`${API_BASE}/auth/qr/poll/${sessionId}`)
    if (res.status === 'authorized' && res.token) {
      setAdminToken(res.token)
    }
    return res
  } catch {
    return { status: 'pending' }
  }
}

export async function verifyMasterPasscode(passcode: string): Promise<{ token: string }> {
  const res = await request<{ token: string }>(`${API_BASE}/auth/verify`, {
    method: 'POST',
    body: JSON.stringify({ passcode }),
  })
  if (res.token) {
    setAdminToken(res.token)
  }
  return res
}



