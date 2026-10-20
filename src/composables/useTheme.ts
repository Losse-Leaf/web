import { ref, onMounted } from 'vue'
import { audio } from '../utils/audio'

export type ArchiveTheme = 'paper' | 'darkroom'

const THEME_STORAGE_KEY = 'looseleaf_theme_mode'

const currentTheme = ref<ArchiveTheme>('paper')

export function useTheme() {
  const applyTheme = (theme: ArchiveTheme) => {
    currentTheme.value = theme
    if (typeof document !== 'undefined') {
      const root = document.documentElement
      if (theme === 'darkroom') {
        root.classList.add('darkroom', 'dark')
      } else {
        root.classList.remove('darkroom', 'dark')
      }
      // MOB-P2-82：同步浏览器地址栏 / 状态栏的主题色 ——
      // 静态 <meta name="theme-color"> 只跟随系统深色，
      // 而 App 有自己的「暗房」开关，两者不同步时地址栏会与页面配色打架。
      const meta = document.querySelector('meta[name="theme-color"]:not([media])')
        || (() => {
            const created = document.createElement('meta')
            created.setAttribute('name', 'theme-color')
            document.head.appendChild(created)
            return created
          })()
      meta.setAttribute('content', theme === 'darkroom' ? '#141312' : '#f9f8f5')
    }
    try {
      localStorage.setItem(THEME_STORAGE_KEY, theme)
    } catch {}
  }

  const toggleTheme = () => {
    audio.playTink()
    const next: ArchiveTheme = currentTheme.value === 'paper' ? 'darkroom' : 'paper'
    applyTheme(next)
    return next
  }

  const initTheme = () => {
    try {
      const saved = localStorage.getItem(THEME_STORAGE_KEY) as ArchiveTheme | null
      if (saved === 'darkroom' || saved === 'paper') {
        applyTheme(saved)
        return
      }
      // 跟随系统深色偏好
      if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
        applyTheme('darkroom')
        return
      }
    } catch {}
    applyTheme('paper')
  }

  onMounted(() => {
    initTheme()
  })

  return {
    theme: currentTheme,
    toggleTheme,
    applyTheme,
    initTheme,
  }
}
