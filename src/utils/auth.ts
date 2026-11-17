import { removeAdminToken, clearApiCache } from './api'

const ENTERED_KEY = 'looseleaf_entered'

/**
 * 标记访客或主理人已开启并进入档案馆
 */
export function markEnteredArchive(): void {
  try {
    sessionStorage.setItem(ENTERED_KEY, 'true')
    localStorage.setItem(ENTERED_KEY, 'true')
  } catch {}
}

/**
 * 清除已进入档案馆状态（退出登录或返回封面时）
 */
export function clearEnteredArchive(): void {
  try {
    sessionStorage.removeItem(ENTERED_KEY)
    localStorage.removeItem(ENTERED_KEY)
  } catch {}
}

/**
 * 校验此前是否已进入过档案馆
 */
export function hasEnteredArchiveSession(): boolean {
  try {
    return (
      localStorage.getItem(ENTERED_KEY) === 'true' ||
      sessionStorage.getItem(ENTERED_KEY) === 'true'
    )
  } catch {
    return false
  }
}

/**
 * 规范化站内回跳路径，严格只允许单斜杠开头的同源相对路径
 */
export function resolveSafeReturnTo(candidate?: string): string {
  if (typeof window === 'undefined') return '/'
  const raw = (
    candidate ?? `${window.location.pathname}${window.location.search}${window.location.hash}`
  ).trim()
  if (!raw || !raw.startsWith('/') || raw.startsWith('//') || raw.includes('\\')) {
    return '/'
  }
  return raw
}

/**
 * 构造 Vesper Auth OIDC 统一登录地址
 */
export function buildOIDCLoginURL(returnTo?: string): string {
  const safeReturnTo = resolveSafeReturnTo(returnTo)
  const params = new URLSearchParams({
    platform: 'web',
    return_to: safeReturnTo,
  })
  return `/api/v1/auth/oidc/login?${params.toString()}`
}

/**
 * 整页跳转至 Vesper Auth 统一通行证登录
 */
export function redirectToOIDCLogin(returnTo?: string): void {
  if (typeof window === 'undefined') return
  window.location.assign(buildOIDCLoginURL(returnTo))
}

/**
 * 统一退出主理人身份：清除会话、进馆状态与本地 API 快照缓存后重载页面
 */
export async function logoutAndReload(): Promise<void> {
  removeAdminToken()
  clearEnteredArchive()
  await clearApiCache()
  window.location.reload()
}
