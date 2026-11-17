/**
 * 通用 Escape 键关闭弹窗 (MOB-OPT-P2 · a11y)
 *
 * 在弹窗打开期间监听 Escape 键并触发关闭回调。
 * 多个弹窗叠加时只有最顶层响应（后注册的优先）。
 */
import { onBeforeUnmount, watch } from 'vue'

export function useEscapeClose(isOpen: () => boolean, onClose: () => void) {
  const handleKeydown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.stopPropagation()
      onClose()
    }
  }

  let listening = false
  const start = () => {
    if (listening) return
    // capture 阶段注册，确保比其它 keydown 监听先触发
    window.addEventListener('keydown', handleKeydown, true)
    listening = true
  }
  const stop = () => {
    if (!listening) return
    window.removeEventListener('keydown', handleKeydown, true)
    listening = false
  }

  watch(isOpen, (open) => {
    if (open) start()
    else stop()
  }, { immediate: true })

  onBeforeUnmount(stop)
}
