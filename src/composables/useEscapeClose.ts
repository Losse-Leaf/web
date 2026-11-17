/**
 * 通用 Escape 键关闭栈 (LIFO)
 *
 * 全局仅挂载单一 capture 阶段 keydown 监听器，维护后进先出栈：
 * 当多层浮层叠加（如弹窗内展开下拉菜单、抽屉内点开灯箱、弹窗上弹出确认框）时，
 * 按下 Escape 仅关闭最顶层激活项，绝不穿透误关底层弹窗。
 */
import { onBeforeUnmount, watch } from 'vue'

interface EscapeEntry {
  id: symbol
  onClose: () => void
}

const escapeStack: EscapeEntry[] = []
let listenerAttached = false

function onGlobalKeydown(e: KeyboardEvent) {
  if (e.key !== 'Escape' || e.isComposing || e.keyCode === 229) return
  const top = escapeStack[escapeStack.length - 1]
  if (!top) return
  e.preventDefault()
  e.stopPropagation()
  top.onClose()
}

function syncGlobalListener() {
  if (typeof window === 'undefined') return
  if (escapeStack.length > 0 && !listenerAttached) {
    window.addEventListener('keydown', onGlobalKeydown, true)
    listenerAttached = true
  } else if (escapeStack.length === 0 && listenerAttached) {
    window.removeEventListener('keydown', onGlobalKeydown, true)
    listenerAttached = false
  }
}

export function useEscapeClose(isOpen: () => boolean, onClose: () => void) {
  const id = Symbol('escape-layer')

  const push = () => {
    const existingIdx = escapeStack.findIndex((item) => item.id === id)
    if (existingIdx !== -1) {
      escapeStack.splice(existingIdx, 1)
    }
    escapeStack.push({ id, onClose })
    syncGlobalListener()
  }

  const remove = () => {
    const idx = escapeStack.findIndex((item) => item.id === id)
    if (idx !== -1) {
      escapeStack.splice(idx, 1)
      syncGlobalListener()
    }
  }

  watch(
    isOpen,
    (open) => {
      if (open) push()
      else remove()
    },
    { immediate: true },
  )

  onBeforeUnmount(remove)
}
