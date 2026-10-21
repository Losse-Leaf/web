export type EntryType =
  | 'life'
  | 'travel'
  | 'project'
  | 'wish'
  | 'transaction'
  | 'gear'

export type ArchiveCategory =
  | 'all'
  | 'daily'
  | 'travel'
  | 'project'
  | 'wish'
  | 'transaction'
  | 'gear'

export const getEntryCategory = (entry: LifeEntry): ArchiveCategory => {
  const t = (entry.type || '').toLowerCase()
  if (t === 'transaction' || entry.is_transaction) {
    return 'transaction'
  }
  // RC-128 四母体收敛后不再识别旧类型值（thought/collection/code/craft 等一律归位为 life）
  if (t === 'project' || Boolean(entry.project_id)) {
    return 'project'
  }
  if (t === 'wish' || Boolean(entry.wish_id)) {
    return 'wish'
  }
  if (t === 'gear' || Boolean(entry.gear_id)) {
    return 'gear'
  }
  if (t === 'travel' || Boolean(entry.city_code)) {
    return 'travel'
  }
  return 'daily'
}

export const entryMatchesCategory = (entry: LifeEntry, category: ArchiveCategory): boolean => {
  if (category === 'all') return true
  const cat = getEntryCategory(entry)
  if (category === 'transaction') {
    return cat === 'transaction' || entry.type === 'transaction' || Boolean(entry.is_transaction)
  }
  if (category === 'travel') {
    return cat === 'travel' || Boolean(entry.city_code)
  }
  if (category === 'project') {
    return cat === 'project' || Boolean(entry.project_id)
  }
  if (category === 'wish') {
    return cat === 'wish' || Boolean(entry.wish_id)
  }
  if (category === 'gear') {
    return cat === 'gear' || Boolean(entry.gear_id)
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
  created_at?: string
}

export interface LifeEntry {
  id: number
  type: EntryType | string
  title: string
  content: string
  occurred_at?: string
  location?: string
  city_code?: string
  city_name?: string
  project_id?: number
  project?: Project
  wish_id?: number
  wish?: Wish
  /** 器物伴生散页（器物 id 为字符串） */
  gear_id?: string
  footprint_id?: number
  attachments?: Attachment[]

  featured?: boolean

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
  footprint_id?: number
  city_code?: string
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
}

export interface GearItem {
  id?: string
  name: string
  spec?: string
  category: string
  status?: string
  note?: string
  price_cents?: number
  purchase_date?: string
  sold_price_cents?: number
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
  has_passcode_set?: boolean
  site_name: string
  curator_name?: string
}

export interface BootstrapPayload {
  curator_name: string
  location?: string
  master_passcode: string
  confirm_passcode: string
  hub_url?: string
}

export interface BootstrapResult {
  curator_name: string
  location: string
  ticket: string
  hub_url?: string
  qr_payload: string
  qr_code_data_url?: string
  expires_at: string
  expires_in_seconds: number
  candidates?: NetworkCandidate[]
}

export interface PairConfirmPayload {
  ticket: string
  device_name: string
  platform: 'ios' | 'macos' | 'android' | 'web' | string
  device_model?: string
}

export interface PairConfirmResult {
  device_id: string
  device_name: string
  platform: string
  paired_at: string
  device_token: string
  initialized?: boolean
  hub_url?: string
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
  web_token?: string
}

export interface VerifyPasscodeResult {
  token: string
  device_id?: string
  device_name?: string
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
  /** 许下心愿的时刻（可回填为过去日期以支撑「补档」） */
  planted_at?: string | null
  status: 'wanting' | 'fulfilled' | 'shelved' | 'relinquished'
  fulfilled_at?: string | null
  transaction_id?: number
  life_entry_id?: number
  footprint_id?: number
  gear_id?: string
  attachments?: Attachment[]
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
  net_worth: number               // 分
  liquid_balance: number          // 分
  initial_liquid_balance?: number // 分 (BE-15, RG-20)
  fixed_assets: number            // 分
  total_liabilities: number       // 分
  monthly_liabilities: number     // 分
  gear_summary: GearSummary
  channel_liabilities: ChannelLiabilitySummary[]
}

export interface Footprint {
  id: number
  city_code: string
  city_name: string
  title?: string
  visited_at: string
  departed_at?: string | null
  note?: string
  life_entry_id?: number
  wish_id?: number
  attachments?: Attachment[]
  entries_count?: number
  total_spent?: number
  transaction_count?: number
  created_at?: string
  updated_at?: string
}

export type CategoryScope = 'expense' | 'income' | 'gear' | 'payment' | 'project'

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

export interface ProvinceMemoryDrawerData {
  adcode?: string
  province_adcode?: string
  province_name: string
  total_cities?: number
  visit_stats: {
    city_count?: number
    total_visits: number
    first_visited_at: string
    latest_visited_at: string
  }
  visited_cities?: Array<{
    city_code: string
    city_name: string
    visit_count: number
    latest_visited_at?: string
  }>
  cities_summary?: Array<{
    city_code: string
    city_name: string
    visit_count: number
    latest_visited_at?: string
  }>
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
    active_days: number
    total_words: number
    first_date: string
    last_date: string
    wishes_fulfilled?: number
    cities_visited?: number
    tx_count?: number
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



