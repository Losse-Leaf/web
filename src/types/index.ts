export type EntryType =
  | 'life'
  | 'wish'
  | 'transaction'

export type ArchiveCategory =
  | 'all'
  | 'daily'
  | 'wish'
  | 'transaction'

export const getEntryCategory = (entry: LifeEntry): ArchiveCategory => {
  const t = (entry.type || '').toLowerCase()
  if (t === 'transaction' || entry.is_transaction) {
    return 'transaction'
  }
  if (t === 'wish' || Boolean(entry.wish_id)) {
    return 'wish'
  }
  return 'daily'
}

export const entryMatchesCategory = (entry: LifeEntry, category: ArchiveCategory): boolean => {
  if (category === 'all') return true
  const cat = getEntryCategory(entry)
  if (category === 'transaction') {
    return cat === 'transaction' || entry.type === 'transaction' || Boolean(entry.is_transaction)
  }
  if (category === 'wish') {
    return cat === 'wish' || Boolean(entry.wish_id)
  }
  return cat === category
}

export interface Attachment {
  id: number
  entry_id?: number
  object_key: string
  original_filename: string
  mime_type: string
  size: number
  width?: number
  height?: number
  url: string
  /**
   * 缩略图地址（中枢自己的路由，稳定可缓存）
   *
   * 关键：列表与详情用缩略图，**只有灯箱（点开大图）才用原图**。
   * 原图动辄 1.5MB，从对象存储拉一次要 4 秒；滚动列表时每张新卡片都在拉原图，
   * 网络与解码把主线程打满，表现为「滑动卡」「点开转圈」。
   */
  thumbnail_url?: string
  created_at?: string
}

export interface AttachmentBindPayload {
  attachment_ids?: number[]
  /**
   * 显式声明「本次要解除全部附件绑定」
   *
   * 关键：单传 `attachment_ids: []` **不足以**表达「解绑」——
   * 后端的新契约是「空数组但不带 clear_attachments → 保持原样」，
   * 因为已发布的老客户端（数组不可选，默认 []）压根不知道可以不传，
   * 于是在没有附件 UI 的编辑弹窗里改个标题也会把照片解绑。
   */
  clear_attachments?: boolean
}

export interface LifeEntry {
  id: number
  type: EntryType | string
  title: string
  content: string
  occurred_at?: string
  location?: string
  wish_id?: number
  wish?: Wish
  attachments?: Attachment[]
  is_private?: boolean

  // 记账投影支持
  amount?: number
  tx_type?: 'income' | 'expense'
  category?: string
  payment_method?: string
  is_transaction?: boolean
  transaction_id?: number

  created_at?: string
  updated_at?: string
}

export interface Transaction {
  id: number
  amount: number // 单位：分 (例如 1250 表示 12.50 元)
  type: 'income' | 'expense'
  category: string // 餐饮, 交通, 购物, 娱乐, 学习, 住房, 医疗, 二手回血, 其他
  title: string
  note?: string
  payment_method?: string
  occurred_at: string
  wish_id?: number
  is_installment?: boolean
  installment_channel_code?: string
  installment_total_amount?: number
  installment_months?: number
  installment_monthly_pay?: number
  installment_remain_months?: number
  repayment_day?: number
  created_at?: string
}

export interface TransactionSummary {
  year: number
  month: number
  total_expense: number // 分
  total_income: number  // 分
  balance: number       // 分
  category_breakdown: Record<string, number>
  count: number
}

export interface StorageStatus {
  provider: string
  configured: boolean
  account_id?: string
  bucket?: string
  public_domain?: string
  endpoint?: string
  access_key_id?: string
  has_secret_key?: boolean
  presign_expire_seconds?: number
  presign_expire_minutes?: number
  local_file_count?: number
  local_total_bytes?: number
}

export interface StorageConfigPayload {
  account_id?: string
  access_key_id: string
  secret_access_key?: string
  bucket_name: string
  endpoint?: string
  public_domain?: string
  presign_expire_seconds?: number
}

export interface SiteConfig {
  site_name: string
  site_subtitle?: string
  site_desc?: string
  curator_name?: string
  default_location?: string
  public_modules?: string[]
}

export interface UnifiedUploadResult {
  object_key: string
  url: string
  filename?: string
  mime_type?: string
  size?: number
  attachment_id?: number
  expires_in?: number
}

export interface CuratorProfile {
  name: string
  title: string
  bio: string
  location: string
  current_city?: string
  avatar_url?: string
  avatar_key?: string
  motto?: string
  manifesto?: string
  social_links?: Record<string, string>
  email?: string
  github?: string
  updated_at?: string
}

export interface TrustedDevice {
  id: number
  device_id: string
  name: string
  platform: 'ios' | 'macos' | 'android' | 'web' | string
  device_model?: string
  paired_at: string
  last_active_at: string
  status: 'active' | 'revoked' | string
  is_current?: boolean
}

export interface NetworkCandidate {
  type: 'tailscale' | 'lan' | 'origin' | string
  label: string
  ip: string
  url: string
  is_default?: boolean
}

export interface PairingTicketResult {
  ticket: string
  hub_url?: string
  expires_at: string
  expires_in_seconds: number
  qr_payload: string
  qr_code_data_url?: string
  candidates?: NetworkCandidate[]
}

export interface SystemStatus {
  initialized: boolean
  site_name: string
  curator_name?: string
  oidc_enabled?: boolean
  oidc_provider_name?: string
}

export interface ClaimPayload {
  code: string
  device_name?: string
  platform?: string
  device_model?: string
}

export interface ClaimResult {
  device_id: string
  device_name: string
  platform: string
  paired_at?: string
  device_token: string
  initialized: boolean
}

export interface PairStatusResult {
  status: 'pending' | 'paired' | 'expired'
  initialized: boolean
  device?: {
    device_id: string
    name: string
    platform: string
    paired_at: string
  }
}

export interface Wish {
  id: number
  title: string
  kind: 'item' | 'travel' | 'milestone'
  note?: string
  spec?: string
  budget: number // 分
  actual_cost: number // 分
  resolution_type?: 'exact' | 'altered' | 'relinquished' | string
  actual_title?: string
  target_date?: string | null
  /** 许下心愿的时刻（可回填为过去日期以支撑「补档」） */
  planted_at?: string | null
  status: 'wanting' | 'fulfilled' | 'shelved' | 'relinquished'
  fulfilled_at?: string | null
  transaction_id?: number
  life_entry_id?: number
  attachments?: Attachment[]
  is_private?: boolean
  created_at?: string
  updated_at?: string
}

export interface CreditChannel {
  id?: number
  code: string
  name: string
  repayment_day: number // 1~31
  is_builtin?: boolean
  color?: string
}

export type CategoryScope = 'expense' | 'income' | 'payment'

export interface CategoryOption {
  id: number
  scope: CategoryScope
  name: string
  sort_order: number
  is_builtin: boolean
  created_at?: string
  updated_at?: string
}

export interface CategoriesResponse {
  items: CategoryOption[]
  by_scope: Record<CategoryScope, string[]>
}

export interface AnnualAlmanacSummary {
  year: number
  prologue: {
    total_entries: number
    active_days: number
    total_words: number
    first_date: string
    last_date: string
    wishes_fulfilled?: number
    tx_count?: number
  }
  wishes: {
    fulfilled_count: number
    wanting_count: number
    total_budget: number
    total_actual: number
    wishes: Wish[]
  }
  highlights: {
    spring?: LifeEntry
    summer?: LifeEntry
    autumn?: LifeEntry
    winter?: LifeEntry
    photos: Attachment[]
  }
  finances: {
    total_expense: number
    total_income: number
    balance: number
    wish_expenses?: number
    wish_spending_ratio: number
    categories: { name: string; amount: number }[]
  }
}

export interface UpdateCheckResult {
  current_version: string
  latest_version: string
  has_update: boolean
  release_url?: string
  published_at?: string
  checked_at?: string
  check_error?: string
}

export interface BackupItem {
  filename: string
  size: number
  created_at: string
  storage_type: 'r2' | 'local' | string
}
