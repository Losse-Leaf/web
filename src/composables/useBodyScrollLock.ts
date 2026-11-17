/**
 * 弹窗滚动锁与全局打开层计数 (MOB-P1-66)
 *
 * 计数式共享 composable：
 * - 多个弹窗叠加时，只有第一个锁、最后一个解锁；
 * - 采用 `position: fixed` + 记录滚动位置的方式锁定，恢复后位置不跳；
 * - 同步暴露响应式 `openModalCount`，供 App.vue 隐藏移动端底栏/FAB 并拦截 Cmd+K。
 */
import { onBeforeUnmount, readonly, ref, watch } from 'vue'

let lockCount = 0
let savedScrollY = 0
const activeModalCount = ref(0)

export const openModalCount = readonly(activeModalCount)

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
  activeModalCount.value = lockCount
}

function unlockBodyScroll() {
  lockCount = Math.max(0, lockCount - 1)
  activeModalCount.value = lockCount
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
 * 在弹窗打开期间锁定背景滚动并计入全局打开弹窗计数。
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
