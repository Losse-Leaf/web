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
    return cat === 'photo' || Boolean(entry.images) || Boolean(entry.attachments && entry.attachments.length > 0)
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

  // 兼容老版本
  date?: string
  year?: string
  month?: string
  day?: string
  time?: string
  images?: string
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
  category: string // 餐饮, 交通, 购物, 娱乐, 学习, 住房, 医疗, 其他
  title: string
  note?: string
  payment_method?: string
  occurred_at: string
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
  avatar?: string
  avatar_key?: string
  motto?: string
  philosophy?: string
  manifesto?: string
  social_links?: Record<string, string>
  email?: string
  github?: string
  edc_gear?: GearItem[]
  gearList?: GearItem[]
  updated_at?: string
}

// 统一主理人档案模型 (RC-29 ~ RC-32)
export interface UserProfile extends CuratorProfile {
  avatar: string
  philosophy: string
  gearList: GearItem[]
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

export interface PairingTicketResult {
  ticket: string
  pin_code: string
  expires_at: string
  expires_in_seconds: number
  qr_payload: string
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
}

export interface QRLoginPollResult {
  status: 'pending' | 'authorized' | 'expired'
  token?: string
}


