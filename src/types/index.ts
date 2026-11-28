export type EntryType =
  | 'life'
  | 'wish'
  | 'transaction'

/**
 * 散页原生分类（与后端 commit 0fc123c、Android v2.2.1 及 Vesper Space 四大展区 1:1 对齐）。
 * 空字符串表示默认「日常」；仅适用于 type === 'life' 的非账目散页。
 */
export type EntryGalleryCategory =
  | ''
  | 'Photography'
  | 'Travel'
  | 'Still Life'
  | 'Motion'

export interface EntryCategoryOption {
  code: EntryGalleryCategory
  label: string
  accent: string
}

export const ENTRY_CATEGORY_OPTIONS: readonly EntryCategoryOption[] = [
  { code: '', label: '日常', accent: 'var(--tag-daily)' },
  { code: 'Photography', label: '摄影', accent: 'var(--tag-photography)' },
  { code: 'Travel', label: '旅途', accent: 'var(--tag-travel)' },
  { code: 'Still Life', label: '静物', accent: 'var(--tag-still-life)' },
  { code: 'Motion', label: '影像', accent: 'var(--tag-motion)' },
] as const

export type ArchiveCategory =
  | 'all'
  | 'daily'
  | 'wish'
  | 'Photography'
  | 'Travel'
  | 'Still Life'
  | 'Motion'
  | 'transaction'

export const normalizeEntryCategory = (raw?: string): EntryGalleryCategory => {
  const trimmed = (raw || '').trim().toLowerCase()
  switch (trimmed) {
    case 'photography':
    case '摄影':
      return 'Photography'
    case 'travel':
    case '旅途':
    case '旅行':
      return 'Travel'
    case 'still life':
    case 'still_life':
    case 'still-life':
    case 'stilllife':
    case '静物':
    case '器物':
      return 'Still Life'
    case 'motion':
    case 'video':
    case '影像':
      return 'Motion'
    case '':
    case 'daily':
    case 'life':
    case '日常':
    case '日常随笔':
    default:
      return ''
  }
}

export const isTransactionEntry = (entry: LifeEntry): boolean =>
  Boolean(entry.is_transaction) || (entry.type || '').toLowerCase() === 'transaction'

export const isWishEntry = (entry: LifeEntry): boolean =>
  !isTransactionEntry(entry) && ((entry.type || '').toLowerCase() === 'wish' || Boolean(entry.wish_id))

export const isGalleryCategory = (
  category: ArchiveCategory,
): category is Exclude<EntryGalleryCategory, ''> =>
  category === 'Photography' ||
  category === 'Travel' ||
  category === 'Still Life' ||
  category === 'Motion'

export const getEntryCategory = (entry: LifeEntry): ArchiveCategory => {
  if (isTransactionEntry(entry)) {
    return 'transaction'
  }
  if (isWishEntry(entry)) {
    return 'wish'
  }
  const gallery = normalizeEntryCategory(entry.category)
  return gallery || 'daily'
}

export const getEntryDisplayCategoryLabel = (entry: LifeEntry): string => {
  if (isTransactionEntry(entry)) {
    return '账目'
  }
  if (isWishEntry(entry)) {
    return '心愿'
  }
  const normalized = normalizeEntryCategory(entry.category)
  const matched = ENTRY_CATEGORY_OPTIONS.find((opt) => opt.code === normalized)
  return matched ? matched.label : '日常'
}

export const getEntryCategoryAccent = (entry: LifeEntry): string => {
  if (isTransactionEntry(entry)) {
    return 'var(--accent-moss)'
  }
  if (isWishEntry(entry)) {
    return 'var(--accent-warm)'
  }
  const normalized = normalizeEntryCategory(entry.category)
  const matched = ENTRY_CATEGORY_OPTIONS.find((opt) => opt.code === normalized)
  return matched ? matched.accent : 'var(--tag-daily)'
}

const LEGACY_PLACEHOLDER_TITLES = new Set(['无题随笔', '无题'])
const LEGACY_PLACEHOLDER_PREFIXES = ['现场快门 · ', '现场记录 · ']

/**
 * 判断散页是否拥有值得单独渲染的独立标题（对齐 Android v2.2.1 hasDistinctTitle 规则）。
 * 空白、历史占位标题或正文首句自动派生标题返回 false，避免卡片与详情页重复渲染同一句话。
 */
export const hasDistinctEntryTitle = (entry: LifeEntry): boolean => {
  const t = (entry.title || '').trim()
  if (!t) return false
  if (LEGACY_PLACEHOLDER_TITLES.has(t)) return false
  if (LEGACY_PLACEHOLDER_PREFIXES.some((prefix) => t.startsWith(prefix))) return false
  const core = t.replace(/[…\.]+$/, '').trim()
  if (!core) return false
  const body = (entry.content || '').trim()
  if (body && body.startsWith(core)) return false
  return true
}

export const entryMatchesCategory = (entry: LifeEntry, category: ArchiveCategory): boolean => {
  if (category === 'all') return true
  const isTx = isTransactionEntry(entry)
  if (category === 'transaction') {
    return isTx
  }
  if (isTx) return false

  const isWish = isWishEntry(entry)
  if (category === 'wish') {
    return isWish
  }

  const t = (entry.type || '').toLowerCase()
  if (isGalleryCategory(category)) {
    return !isWish && t === 'life' && normalizeEntryCategory(entry.category) === category
  }

  if (category === 'daily') {
    return !isWish
  }

  return false
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
  /**
   * 散页原生分类（type === 'life' 且非账目投影时取值为 '' | 'Photography' | 'Travel' | 'Still Life' | 'Motion'）；
   * 账目投影（is_transaction === true 或 type === 'transaction'）时表示收支分类（如「餐饮」「购物」）。
   */
  category?: string
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
  group_name?: string
  keywords?: string
  sort_order: number
  is_builtin: boolean
  usage_count?: number
  created_at?: string
  updated_at?: string
}

export interface CategoriesResponse {
  items: CategoryOption[]
  by_scope: Record<CategoryScope, string[]>
}

export interface CategoryRule {
  id: number
  tx_type: 'expense' | 'income'
  match_key: string
  display_name: string
  category: string
  hit_count: number
  source: 'learned' | 'manual' | string
  created_at?: string
  updated_at?: string
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
