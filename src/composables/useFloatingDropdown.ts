import { ref, watch, onMounted, onBeforeUnmount, nextTick, type Ref } from 'vue'
import { useEscapeClose } from './useEscapeClose'

export interface UseFloatingDropdownOptions {
  triggerRef: Ref<HTMLElement | null>
  panelRef: Ref<HTMLElement | null>
  isOpen: Ref<boolean>
  estimatedHeight: () => number
  fixedWidth?: number
  minWidth?: number
  offset?: number
  zIndex?: string
}

/**
 * 纸本自定义下拉浮层共享定位与交互中枢（供 PaperSelect / PaperDatePicker / CityPicker 复用）
 * - Teleport to="body" 固定定位，支持底部空间不足时向上翻转 + 左右视口边界防溢出钳制
 * - 打开期间同步监听 scroll(capture) 与 resize
 * - 点击外部区域关闭 + 接入 LIFO Escape 栈（仅关闭当前浮层，不穿透关闭父模态框）
 */
export function useFloatingDropdown(options: UseFloatingDropdownOptions) {
  const {
    triggerRef,
    panelRef,
    isOpen,
    estimatedHeight,
    fixedWidth,
    minWidth = 0,
    offset = 4,
    zIndex = '9999',
  } = options

  const floatingStyle = ref<Record<string, string>>({})

  const updatePosition = () => {
    if (!triggerRef.value || !isOpen.value) return
    const rect = triggerRef.value.getBoundingClientRect()
    const viewportHeight = window.innerHeight
    const viewportWidth = window.innerWidth
    const margin = 8

    const rawWidth = fixedWidth ?? Math.max(rect.width, minWidth)
    const width = Math.min(rawWidth, Math.max(120, viewportWidth - margin * 2))
    const panelHeight = panelRef.value?.offsetHeight || estimatedHeight()
    const spaceBelow = viewportHeight - rect.bottom
    const openUpward = spaceBelow < panelHeight && rect.top > panelHeight
    const left = Math.max(margin, Math.min(rect.left, viewportWidth - width - margin))

    floatingStyle.value = {
      position: 'fixed',
      left: `${left}px`,
      width: `${width}px`,
      zIndex,
      ...(openUpward
        ? { bottom: `${viewportHeight - rect.top + offset}px` }
        : { top: `${rect.bottom + offset}px` }),
    }
  }

  const removeWindowListeners = () => {
    window.removeEventListener('scroll', updatePosition, true)
    window.removeEventListener('resize', updatePosition)
  }

  const handleClickOutside = (e: MouseEvent) => {
    if (!isOpen.value) return
    const target = e.target as Node
    if (triggerRef.value?.contains(target) || panelRef.value?.contains(target)) {
      return
    }
    isOpen.value = false
  }

  useEscapeClose(
    () => isOpen.value,
    () => {
      isOpen.value = false
    },
  )

  watch(isOpen, async (open) => {
    if (open) {
      updatePosition()
      await nextTick()
      updatePosition()
      window.addEventListener('scroll', updatePosition, true)
      window.addEventListener('resize', updatePosition)
    } else {
      removeWindowListeners()
    }
  })

  onMounted(() => {
    document.addEventListener('mousedown', handleClickOutside)
  })

  onBeforeUnmount(() => {
    document.removeEventListener('mousedown', handleClickOutside)
    removeWindowListeners()
  })

  return {
    floatingStyle,
    updatePosition,
  }
}
