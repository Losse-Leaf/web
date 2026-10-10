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
