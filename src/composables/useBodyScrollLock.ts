/**
 * 弹窗滚动锁 (MOB-P1-66)
 *
 * 此前只有灯箱（EditorialLightbox）锁定了 body 滚动，
 * 其余 17 个弹窗打开时**背景页面仍可滑动** ——
 * 手机上在弹窗里滑到底会带着背后的页面一起滚（iOS 还会橡皮筋回弹），
 * 关闭弹窗后页面位置错乱，体验像「没点中」。
 *
 * 这里做成计数式的共享 composable：
 * - 多个弹窗叠加时，只有第一个锁、最后一个解锁；
 * - 采用 `position: fixed` + 记录滚动位置的方式锁定，恢复后位置不跳。
 */
import { onBeforeUnmount, watch } from 'vue'

let lockCount = 0
let savedScrollY = 0

function lockBodyScroll() {
  if (lockCount === 0) {
    savedScrollY = window.scrollY
    const body = document.body
    body.style.position = 'fixed'
    body.style.top = `-${savedScrollY}px`
    body.style.left = '0'
    body.style.right = '0'
    body.style.width = '100%'
    body.style.overflowY = 'scroll'
  }
  lockCount++
}

function unlockBodyScroll() {
  lockCount = Math.max(0, lockCount - 1)
  if (lockCount === 0) {
    const body = document.body
    body.style.position = ''
    body.style.top = ''
    body.style.left = ''
    body.style.right = ''
    body.style.width = ''
    body.style.overflowY = ''
    window.scrollTo(0, savedScrollY)
  }
}

/**
 * 在弹窗打开期间锁定背景滚动。
 * @param open 弹窗是否打开
 */
export function useBodyScrollLock(open: () => boolean) {
  let locked = false

  const sync = (value: boolean) => {
    if (value && !locked) {
      lockBodyScroll()
      locked = true
    } else if (!value && locked) {
      unlockBodyScroll()
      locked = false
    }
  }

  watch(open, (value) => sync(value), { immediate: true })

  onBeforeUnmount(() => {
    if (locked) {
      unlockBodyScroll()
      locked = false
    }
  })
}
