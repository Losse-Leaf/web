import { ref, onMounted } from 'vue'

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
    const next: ArchiveTheme = currentTheme.value === 'paper' ? 'darkroom' : 'paper'
    // MOB-OPT-P0: 只在主题切换时临时开启 body 过渡，
    // 过渡结束自动移除，平时不占重绘开销
    if (typeof document !== 'undefined') {
      document.body.classList.add('theme-transitioning')
      const cleanup = () => {
        document.body.classList.remove('theme-transitioning')
        document.body.removeEventListener('transitionend', cleanup)
      }
      document.body.addEventListener('transitionend', cleanup, { once: true })
      // 安全兜底：400ms 后强制移除（以防 transitionend 不触发）
      setTimeout(cleanup, 400)
    }
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
  }
}
