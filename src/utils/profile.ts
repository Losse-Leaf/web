import type { CuratorProfile } from '../types'

const PROFILE_STORAGE_KEY = 'looseleaf_curator_profile'

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
  edc_gear: [],
}

export function loadCuratorProfile(): CuratorProfile {
  try {
    const raw = localStorage.getItem(PROFILE_STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      const data = parsed?.data && typeof parsed.data === 'object' ? parsed.data : parsed
      const gears = Array.isArray(data.edc_gear) ? data.edc_gear : []
      return {
        ...DEFAULT_PROFILE,
        ...data,
        avatar_url: data.avatar_url || '',
        edc_gear: gears,
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
