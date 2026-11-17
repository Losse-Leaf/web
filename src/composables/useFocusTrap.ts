/**
 * 模态框焦点陷阱 (MOB-OPT-P1 · a11y)
 *
 * 弹窗打开时将 Tab 键导航限制在弹窗内部，
 * 关闭后自动恢复先前焦点，并统一接入 LIFO Escape 栈关闭。
 */
import { onBeforeUnmount, type Ref, watch, nextTick } from 'vue'
import { useEscapeClose } from './useEscapeClose'

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

  if (options?.onEscape) {
    useEscapeClose(isOpen, () => options.onEscape?.())
  }

  const getFocusableElements = (): HTMLElement[] => {
    if (!containerRef.value) return []
    return Array.from(containerRef.value.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
      (el) => el.offsetParent !== null,
    )
  }

  const handleKeydown = (e: KeyboardEvent) => {
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

  watch(
    isOpen,
    (open) => {
      if (open) activate()
      else deactivate()
    },
    { immediate: true },
  )

  onBeforeUnmount(() => {
    deactivate()
  })
}
