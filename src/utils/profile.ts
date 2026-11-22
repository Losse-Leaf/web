import type { CuratorProfile, SiteConfig } from '../types'

const PROFILE_STORAGE_KEY = 'looseleaf_curator_profile'

/**
 * 刊物主品牌名提取（由后端配置单一驱动，缺省回落「散页」）
 */
export function getSiteBrandName(config?: Pick<SiteConfig, 'site_name'> | null): string {
  return config?.site_name?.split('·')?.[0]?.trim() || '散页'
}

/**
 * 主理人常驻城市展示名提取（优先 current_city，回落 location / default_location）
 */
export function getDisplayCity(
  profile?: Pick<CuratorProfile, 'current_city' | 'location'> | null,
  config?: Pick<SiteConfig, 'default_location'> | null,
): string {
  const extract = (raw?: string) => raw?.split('·')?.[1]?.trim() || raw?.trim() || ''
  return (
    profile?.current_city?.trim() ||
    extract(profile?.location) ||
    extract(config?.default_location) ||
    ''
  )
}

// 主理人初始默认资料 (纯净真实空态，无虚构假数据 RC-47)
export const DEFAULT_PROFILE: CuratorProfile = {
  name: '',
  title: '',
  avatar_url: '',
  avatar_key: '',
  location: '',
  current_city: '',
  motto: '',
  bio: '',
  email: '',
  github: '',
}

export function loadCuratorProfile(): CuratorProfile {
  try {
    const raw = localStorage.getItem(PROFILE_STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      const data = parsed?.data && typeof parsed.data === 'object' ? parsed.data : parsed
      return {
        ...DEFAULT_PROFILE,
        ...data,
        avatar_url: data.avatar_url || '',
        email: data.email || data.social_links?.email || '',
        github: data.github || data.social_links?.github || '',
      }
    }
  } catch {
    // ignore
  }
  return { ...DEFAULT_PROFILE }
}

export function saveCuratorProfile(profile: CuratorProfile): void {
  try {
    localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify({ cached_at: Date.now(), data: profile }))
    window.dispatchEvent(new CustomEvent('looseleaf-profile-updated', { detail: profile }))
  } catch (err) {
    console.error('Failed to save curator profile to localStorage:', err)
  }
}
