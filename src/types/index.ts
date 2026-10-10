export type EntryType =
  | 'life'
  | 'thought'
  | 'photo'
  | 'moment'
  | 'place'
  | 'music'
  | 'book'
  | 'game'
  | 'project'
  | 'purchase'
  | 'coffee'

export type ArchiveCategory =
  | 'all'
  | 'daily'
  | 'thought'
  | 'project'
  | 'collection'
  | 'photo'
  | 'transaction'

export const getEntryCategory = (entry: LifeEntry): ArchiveCategory => {
  const t = (entry.type || '').toLowerCase()
  if (t === 'transaction' || entry.is_transaction) {
    return 'transaction'
  }
  if (t === 'thought' || t === 'idea' || t === 'note' || t === 'essay') {
    return 'thought'
  }
  if (t === 'project' || t === 'code' || t === 'craft') {
    return 'project'
  }
  if (t === 'music' || t === 'book' || t === 'game' || t === 'purchase' || t === 'gear' || t === 'movie' || t === 'device') {
    return 'collection'
  }
  if (t === 'photo') {
    return 'photo'
  }
  return 'daily'
}

export const entryMatchesCategory = (entry: LifeEntry, category: ArchiveCategory): boolean => {
  if (category === 'all') return true
  const cat = getEntryCategory(entry)
  if (category === 'transaction') {
    return cat === 'transaction' || entry.type === 'transaction' || Boolean(entry.is_transaction)
  }
  if (category === 'photo') {
    return cat === 'photo' || Boolean(entry.attachments && entry.attachments.length > 0)
  }
  if (category === 'daily') {
    return cat === 'daily' || cat === 'photo'
  }
  return cat === category
}

export const getCategoryDisplayName = (cat: ArchiveCategory): string => {
  const map: Record<ArchiveCategory, string> = {
    all: '全部记录',
    daily: '日常',
    thought: '想法',
    project: '项目',
    collection: '收藏',
    photo: '照片',
    transaction: '记账',
  }
  return map[cat] || '全部记录'
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
  created_at?: string
}

export interface LifeEntry {
  id: number
  type: EntryType | string
  title: string
  content: string
  occurred_at?: string
  location?: string
  project_id?: number
  project?: Project
  attachments?: Attachment[]

  meta?: string
  tags?: string
  link?: string
  featured?: boolean

  // 记账支持
  amount?: number
  tx_type?: 'income' | 'expense'
  category?: string
  payment_method?: string
  is_transaction?: boolean

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
  bucket: string
  public_domain: string
  endpoint: string
}

export interface GlobalStats {
  total_entries: number
  total_photos: number
  total_projects: number
  month_expense: number
  current_year: number
  current_month: number
}

export interface Project {
  id: number
  title: string
  subtitle?: string
  description: string
  story?: string
  category: string
  tags: string
  github_url: string
  status: string
  featured?: boolean
  order?: number
}

export interface SiteConfig {
  site_name: string
  site_subtitle?: string
  site_desc?: string
  curator_name?: string
  default_location?: string
  domain: string
  icp_number?: string
  icp_link?: string
  police_number?: string
  police_code?: string
}

export interface GearItem {
  id?: string
  name: string
  spec?: string
  category: string
  status?: string
  note?: string
  link?: string
  price_cents?: number
  purchase_date?: string
  sold_price?: number
  sold_date?: string
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
  edc_gear?: GearItem[]
  updated_at?: string
}

// 统一主理人档案模型契约，清除 UserProfile / philosophy / gearList 冗余 (RC-29, RC-31, RC-32)
export type UserProfile = CuratorProfile

export interface TrustedDevice {
  id: number
  device_id: string
  name: string
  platform: 'ios' | 'macos' | 'android' | 'web' | string
  device_model?: string
  paired_at: string
  last_active_at: string
  status: 'active' | 'revoked' | string
}

export interface PairingTicketResult {
  ticket: string
  pin_code: string
  expires_at: string
  expires_in_seconds: number
  qr_payload: string
  qr_code_data_url?: string
}

export interface SystemStatus {
  initialized: boolean
  site_name: string
  curator_name?: string
  has_master_key_configured?: boolean
}

export interface BootstrapPayload {
  curator_name: string
  location?: string
  master_passcode: string
  master_key?: string
}

export interface BootstrapResult {
  token: string
  curator_name: string
  location: string
}

export interface QRLoginSession {
  session_id: string
  qr_payload: string
  expires_in_seconds: number
  qr_code_data_url?: string
}

export interface QRLoginPollResult {
  status: 'pending' | 'authorized' | 'expired'
  token?: string
}

export interface Wish {
  id: number
  title: string
  kind: 'item' | 'travel' | 'milestone'
  note?: string
  spec?: string
  city_code?: string
  city_name?: string
  budget: number // 分
  actual_cost: number // 分
  target_date?: string | null
  status: 'wanting' | 'fulfilled' | 'shelved' | 'relinquished'
  fulfilled_at?: string | null
  transaction_id?: number
  life_entry_id?: number
  footprint_id?: number
  gear_id?: string
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

export interface ChannelLiabilitySummary {
  channel_code: string
  channel_name: string
  repayment_day: number
  color: string
  total_debt: number          // 分
  monthly_pay: number         // 分
  days_until_repayment: number
  active_count: number
  installments?: Transaction[]
}

export interface GearSummary {
  total_count: number
  active_count: number
  active_value: number         // 分
  sold_count: number
  sold_recovered_value: number // 分
  items?: GearItem[]
}

export interface AssetsOverview {
  net_worth: number           // 分
  liquid_balance: number      // 分
  fixed_assets: number        // 分
  total_liabilities: number   // 分
  monthly_liabilities: number // 分
  gear_summary: GearSummary
  channel_liabilities: ChannelLiabilitySummary[]
}

export interface Footprint {
  id: number
  city_code: string
  city_name: string
  visited_at: string
  note?: string
  life_entry_id?: number
  wish_id?: number
  latitude?: number
  longitude?: number
  attachments?: Attachment[]
  created_at?: string
  updated_at?: string
}

export interface AtlasCitySummary {
  city_code: string
  city_name: string
  visit_count: number
  first_visited_at: string
  latest_visited_at: string
}

export interface FootprintsAtlasResponse {
  total_footprints: number
  total_cities: number
  cities: AtlasCitySummary[]
}

export interface CityMemoryDrawerData {
  city_code: string
  city_name: string
  visit_stats: {
    total_visits: number
    first_visited_at: string
    latest_visited_at: string
  }
  footprints: Footprint[]
  entries: LifeEntry[]
  ledger_summary: {
    total_spent: number
    transaction_count: number
    categories: { name: string; amount: number }[]
  }
}

export interface AnnualAlmanacSummary {
  year: number
  prologue: {
    total_entries: number
    distinct_days: number
    total_words: number
    first_date: string
    last_date: string
  }
  atlas: {
    total_cities: number
    cities: { city_code: string; city_name: string }[]
    footprints: Footprint[]
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
    wish_spending_ratio: number
    categories: { name: string; amount: number }[]
  }
}


