import type { UserProfile } from '../types'

const PROFILE_STORAGE_KEY = 'looseleaf_curator_profile'

// 主理人初始默认资料 (纯净真实空态，无外链头像与虚构清单 RC-38)
export const DEFAULT_PROFILE: UserProfile = {
  name: '迟暮',
  title: '独立开发者 · 胶片摄影与手冲咖啡学徒 · 城市漫游者',
  avatar: '',
  avatar_url: '',
  avatar_key: '',
  location: '中国 · 杭州',
  current_city: '杭州',
  philosophy: '生活大于项目，真实大于表演。',
  motto: '生活大于项目，真实大于表演。',
  bio: '我喜欢具体的、有体温的事物。清晨手冲咖啡时漫开的花果香气、骑着公路车穿过西湖杨公堤时迎面扑来的湿润晚风、老旁轴相机快门闭合时清脆的一声咔哒，以及在深夜书房里用 Go 雕琢出一套干净的并发状态机。生活终究是由一顿顿具体的饭、一趟趟具体的骑行、一次次真实的思索拼接而成的。',
  email: 'curator@looseleaf.me',
  github: 'https://github.com/YN1753',
  gearList: [],
}

export function loadCuratorProfile(): UserProfile {
  try {
    const raw = localStorage.getItem(PROFILE_STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      const data = parsed?.data && typeof parsed.data === 'object' ? parsed.data : parsed
      const gears = Array.isArray(data.edc_gear)
        ? data.edc_gear
        : Array.isArray(data.gearList)
        ? data.gearList
        : []
      return {
        ...DEFAULT_PROFILE,
        ...data,
        motto: data.motto || data.philosophy || DEFAULT_PROFILE.motto,
        philosophy: data.motto || data.philosophy || DEFAULT_PROFILE.philosophy,
        avatar_url: data.avatar_url || data.avatar || '',
        avatar: data.avatar_url || data.avatar || '',
        gearList: gears,
        edc_gear: gears,
      }
    }
  } catch {
    // ignore
  }
  return { ...DEFAULT_PROFILE }
}

export function saveCuratorProfile(profile: UserProfile): void {
  try {
    localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify({ cached_at: Date.now(), data: profile }))
    window.dispatchEvent(new CustomEvent('looseleaf-profile-updated', { detail: profile }))
  } catch (err) {
    console.error('Failed to save curator profile to localStorage:', err)
  }
}
