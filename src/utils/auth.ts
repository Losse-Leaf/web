const ENTERED_KEY = 'looseleaf_entered'

/**
 * 标记访客已开启/进入档案馆
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
 * 校验访客此前是否已进入过档案馆
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
