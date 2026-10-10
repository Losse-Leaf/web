<script setup lang="ts">
import { ref, computed, watch, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { ChevronDown, Check } from 'lucide-vue-next'

export interface PaperSelectOption {
  value: string | number | null
  label: string
  sublabel?: string
  badge?: string
}

const props = withDefaults(
  defineProps<{
    modelValue: string | number | null | undefined
    options: PaperSelectOption[]
    placeholder?: string
    size?: 'xs' | 'sm' | 'md'
    disabled?: boolean
  }>(),
  {
    placeholder: '请选择...',
    size: 'md',
    disabled: false,
  }
)

const emit = defineEmits<{
  (e: 'update:modelValue', val: any): void
  (e: 'change', val: any): void
}>()

const isOpen = ref(false)
const triggerRef = ref<HTMLElement | null>(null)
const menuRef = ref<HTMLElement | null>(null)
const dropdownStyle = ref<Record<string, string>>({})

const selectedOption = computed(() => {
  return props.options.find((o) => o.value === props.modelValue) || null
})

const displayLabel = computed(() => {
  if (selectedOption.value) {
    return selectedOption.value.label
  }
  return props.placeholder
})

const sizeClasses = computed(() => {
  switch (props.size) {
    case 'xs':
      return 'px-2 py-1 text-xs'
    case 'sm':
      return 'px-2.5 py-1.5 text-xs'
    default:
      return 'px-3 py-2 text-xs'
  }
})

const updatePosition = () => {
  if (!triggerRef.value || !isOpen.value) return
  const rect = triggerRef.value.getBoundingClientRect()
  const viewportHeight = window.innerHeight
  const spaceBelow = viewportHeight - rect.bottom
  const estimatedHeight = Math.min(props.options.length * 36 + 12, 240)
  const openUpward = spaceBelow < estimatedHeight && rect.top > estimatedHeight

  dropdownStyle.value = {
    position: 'fixed',
    left: `${rect.left}px`,
    width: `${Math.max(rect.width, 140)}px`,
    zIndex: '9999',
    ...(openUpward
      ? { bottom: `${viewportHeight - rect.top + 4}px` }
      : { top: `${rect.bottom + 4}px` }),
  }
}

const toggleDropdown = async () => {
  if (props.disabled) return
  isOpen.value = !isOpen.value
  if (isOpen.value) {
    await nextTick()
    updatePosition()
  }
}

const selectOption = (opt: PaperSelectOption) => {
  emit('update:modelValue', opt.value)
  emit('change', opt.value)
  isOpen.value = false
}

const handleClickOutside = (e: MouseEvent) => {
  if (!isOpen.value) return
  const target = e.target as Node
  if (triggerRef.value?.contains(target) || menuRef.value?.contains(target)) {
    return
  }
  isOpen.value = false
}

const handleKeydown = (e: KeyboardEvent) => {
  if (!isOpen.value) return
  if (e.key === 'Escape') {
    e.stopPropagation()
    isOpen.value = false
  }
}

watch(isOpen, (open) => {
  if (open) {
    window.addEventListener('scroll', updatePosition, true)
    window.addEventListener('resize', updatePosition)
  } else {
    window.removeEventListener('scroll', updatePosition, true)
    window.removeEventListener('resize', updatePosition)
  }
})

onMounted(() => {
  document.addEventListener('mousedown', handleClickOutside)
  window.addEventListener('keydown', handleKeydown, true)
})

onBeforeUnmount(() => {
  document.removeEventListener('mousedown', handleClickOutside)
  window.removeEventListener('keydown', handleKeydown, true)
  window.removeEventListener('scroll', updatePosition, true)
  window.removeEventListener('resize', updatePosition)
})
</script>

<template>
  <div class="relative inline-block w-full text-left font-mono-archive">
    <!-- 纸本触发器按钮 (彻底替代系统原生 select) -->
    <button
      ref="triggerRef"
      type="button"
      :disabled="disabled"
      @click="toggleDropdown"
      class="w-full bg-[var(--bg-archive)] border rounded-xs flex items-center justify-between gap-2 transition-colors outline-none cursor-pointer select-none"
      :class="[
        sizeClasses,
        isOpen
          ? 'border-[var(--ink-primary)] text-[var(--ink-primary)]'
          : 'border-[var(--border-subtle)] hover:border-[var(--ink-primary)]/70 text-[var(--ink-primary)]',
        disabled ? 'opacity-50 cursor-not-allowed' : '',
      ]"
    >
      <span
        class="truncate"
        :class="selectedOption ? 'text-[var(--ink-primary)]' : 'text-[var(--ink-muted)]'"
      >
        {{ displayLabel }}
      </span>
      <ChevronDown
        class="w-3.5 h-3.5 text-[var(--ink-muted)] shrink-0 transition-transform duration-200"
        :class="isOpen ? 'rotate-180 text-[var(--ink-primary)]' : ''"
      />
    </button>

    <!-- 纸本浮层菜单 (Teleport 至 body 避免被弹窗 overflow 裁剪，杜绝苹果液态玻璃原生菜单) -->
    <Teleport to="body">
      <div
        v-if="isOpen"
        ref="menuRef"
        :style="dropdownStyle"
        class="bg-[var(--bg-archive)] border border-[var(--border-subtle)] rounded-xs shadow-[0_10px_30px_rgba(0,0,0,0.14)] max-h-60 overflow-y-auto divide-y divide-[var(--border-subtle)]/40 font-mono-archive text-xs animate-in fade-in duration-120"
      >
        <div
          v-if="options.length === 0"
          class="px-3 py-2.5 text-[var(--ink-muted)] text-center italic font-serif-editorial"
        >
          暂无可选项
        </div>
        <button
          v-for="(opt, idx) in options"
          :key="opt.value !== null ? String(opt.value) : `null-${idx}`"
          type="button"
          @click="selectOption(opt)"
          class="w-full px-3 py-2 text-left flex items-center justify-between gap-2 transition-colors cursor-pointer"
          :class="
            opt.value === modelValue
              ? 'bg-[var(--bg-subtle)] text-[var(--ink-primary)] font-medium'
              : 'text-[var(--ink-secondary)] hover:bg-[var(--bg-subtle)]/60 hover:text-[var(--ink-primary)]'
          "
        >
          <div class="truncate flex items-center gap-1.5">
            <span class="truncate">{{ opt.label }}</span>
            <span v-if="opt.sublabel" class="text-[10px] text-[var(--ink-muted)] truncate">
              {{ opt.sublabel }}
            </span>
          </div>
          <div class="flex items-center gap-1.5 shrink-0">
            <span
              v-if="opt.badge"
              class="text-[10px] px-1.5 py-0.2 rounded-xs border border-[var(--border-subtle)] text-[var(--ink-muted)]"
            >
              {{ opt.badge }}
            </span>
            <Check
              v-if="opt.value === modelValue"
              class="w-3.5 h-3.5 text-[var(--accent-warm)] shrink-0"
            />
          </div>
        </button>
      </div>
    </Teleport>
  </div>
</template>
