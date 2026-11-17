/**
 * 模态框焦点陷阱 (MOB-OPT-P1 · a11y)
 *
 * 弹窗打开时将 Tab 键导航限制在弹窗内部，
 * 关闭后自动恢复先前焦点，同时支持 Escape 关闭。
 */
import { onBeforeUnmount, type Ref, watch, nextTick } from 'vue'

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'textarea:not([disabled])',
  'select:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ')

export function useFocusTrap(
  containerRef: Ref<HTMLElement | null>,
  isOpen: () => boolean,
  options?: { onEscape?: () => void },
) {
  let previouslyFocused: HTMLElement | null = null

  const getFocusableElements = (): HTMLElement[] => {
    if (!containerRef.value) return []
    return Array.from(containerRef.value.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
      .filter((el) => el.offsetParent !== null) // 只选可见元素
  }

  const handleKeydown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      options?.onEscape?.()
      return
    }

    if (e.key !== 'Tab') return

    const focusable = getFocusableElements()
    if (focusable.length === 0) return

    const first = focusable[0]
    const last = focusable[focusable.length - 1]

    if (e.shiftKey) {
      if (document.activeElement === first || !containerRef.value?.contains(document.activeElement)) {
        e.preventDefault()
        last.focus()
      }
    } else {
      if (document.activeElement === last || !containerRef.value?.contains(document.activeElement)) {
        e.preventDefault()
        first.focus()
      }
    }
  }

  const activate = () => {
    previouslyFocused = document.activeElement as HTMLElement | null
    document.addEventListener('keydown', handleKeydown)
    // 延迟到 DOM 渲染完成后聚焦第一个可操作元素
    nextTick(() => {
      const focusable = getFocusableElements()
      if (focusable.length > 0) {
        focusable[0].focus()
      }
    })
  }

  const deactivate = () => {
    document.removeEventListener('keydown', handleKeydown)
    if (previouslyFocused && typeof previouslyFocused.focus === 'function') {
      previouslyFocused.focus()
    }
    previouslyFocused = null
  }

  watch(isOpen, (open) => {
    if (open) activate()
    else deactivate()
  }, { immediate: true })

  onBeforeUnmount(() => {
    deactivate()
  })
}
