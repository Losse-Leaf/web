<script setup lang="ts">
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import { MapPin } from 'lucide-vue-next'
import { searchCities, findCityByCode, type CityOption } from '../utils/cities'

const props = defineProps<{
  modelValue?: string
  placeholder?: string
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', code: string): void
  (e: 'select', city: { code: string; name: string }): void
}>()

const keyword = ref('')
const isOpen = ref(false)

watch(
  () => props.modelValue,
  (newCode) => {
    if (newCode) {
      const matched = findCityByCode(newCode)
      if (matched && keyword.value !== matched.name) {
        keyword.value = matched.name
      }
    } else if (!isOpen.value) {
      keyword.value = ''
    }
  },
  { immediate: true }
)

const filteredList = computed(() => searchCities(keyword.value))

const handleSelect = (city: CityOption) => {
  keyword.value = city.name
  emit('update:modelValue', city.code)
  emit('select', { code: city.code, name: city.name })
  isOpen.value = false
}

const handleInput = () => {
  isOpen.value = true
  const trimmed = keyword.value.trim()
  const exact = filteredList.value.find(
    (c) => c.name === trimmed || c.name.replace(/市$/, '') === trimmed.replace(/市$/, '')
  )
  emit('update:modelValue', exact ? exact.code : '')
  emit('select', { code: exact ? exact.code : '', name: exact ? exact.name : '' })
}

const handleBlur = () => {
  window.setTimeout(() => {
    isOpen.value = false
  }, 160)
}

// MOB-P1-104：下拉的固定定位坐标（跟随输入框）
const inputEl = ref<HTMLInputElement | null>(null)
const dropdownStyle = ref<Record<string, string>>({})

const updateDropdownPosition = () => {
  const el = inputEl.value
  if (!el) return
  const rect = el.getBoundingClientRect()
  dropdownStyle.value = {
    left: `${rect.left}px`,
    top: `${rect.bottom + 4}px`,
    width: `${rect.width}px`,
  }
}

const removeDropdownListeners = () => {
  window.removeEventListener('scroll', updateDropdownPosition, true)
  window.removeEventListener('resize', updateDropdownPosition)
}

// 下拉浮层引用：用于「点击外部关闭」判断点击是否落在浮层内（对齐 PaperSelect.vue）
const menuRef = ref<HTMLElement | null>(null)

const handleClickOutside = (e: MouseEvent) => {
  if (!isOpen.value) return
  const target = e.target as Node
  if (inputEl.value?.contains(target) || menuRef.value?.contains(target)) {
    return
  }
  isOpen.value = false
}

const handleKeydown = (e: KeyboardEvent) => {
  if (!isOpen.value) return
  if (e.key === 'Escape') {
    // capture 阶段拦截：只关下拉，不冒泡关闭父弹窗（对齐 PaperSelect.vue）
    e.stopPropagation()
    isOpen.value = false
  }
}

watch(isOpen, (open) => {
  if (!open) {
    removeDropdownListeners()
    return
  }
  updateDropdownPosition()
  window.addEventListener('scroll', updateDropdownPosition, true)
  window.addEventListener('resize', updateDropdownPosition)
})

onMounted(() => {
  document.addEventListener('mousedown', handleClickOutside)
  window.addEventListener('keydown', handleKeydown, true)
})

// 卸载兜底：下拉打开时父弹窗被关闭卸载，watch 的移除分支不会执行 ——
// 必须在这里移除，否则 window 上的 scroll/resize/document mousedown 监听随组件一起泄漏。
onBeforeUnmount(() => {
  document.removeEventListener('mousedown', handleClickOutside)
  window.removeEventListener('keydown', handleKeydown, true)
  removeDropdownListeners()
})
</script>

<template>
  <div class="relative w-full text-left font-mono-archive text-xs">
    <div class="relative">
      <MapPin class="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-[var(--ink-muted)] pointer-events-none" />
      <input
        ref="inputEl"
        v-model="keyword"
        type="text"
        :placeholder="placeholder || '输入城市名称或拼音进行检索...'"
        @focus="isOpen = true"
        @input="handleInput"
        @blur="handleBlur"
        class="w-full pl-8 pr-3 py-1.5 bg-[var(--bg-archive)] border border-[var(--border-subtle)] focus:border-[var(--ink-primary)] rounded-xs outline-none text-xs text-[var(--ink-primary)] font-mono-archive"
      />
    </div>

    <!-- 下拉联想纸签
         MOB-P1-104：原先是绝对定位在输入框下方，而父级（新建条目弹窗）是
         `overflow-y-auto` 的滚动容器 ⇒ 下拉被容器裁剪，靠下的候选根本看不到。
         这里 Teleport 到 body 并按输入框的实际位置做固定定位，彻底脱离裁剪链。 -->
    <Teleport to="body">
      <div
        v-if="isOpen"
        ref="menuRef"
        class="fixed z-[1100] bg-[var(--bg-archive)] border border-[var(--border-subtle)] rounded-xs shadow-lg max-h-56 overflow-y-auto divide-y divide-[var(--border-subtle)]/50"
        :style="dropdownStyle"
      >
        <!-- 空集反馈：固定高度，避免无匹配时候选层整体不渲染、用户看不到任何提示 -->
        <div
          v-if="filteredList.length === 0"
          class="h-12 flex items-center justify-center text-[var(--ink-muted)] text-center italic font-serif-editorial"
        >
          无匹配城市
        </div>
        <div
          v-for="city in filteredList"
          :key="city.code"
          @pointerdown.prevent="handleSelect(city)"
          class="px-3 py-2.5 hover:bg-[var(--bg-subtle)] cursor-pointer flex items-center justify-between transition-colors"
        >
          <div class="flex items-center gap-2">
            <span class="font-medium text-[var(--ink-primary)] font-serif-editorial">{{ city.name }}</span>
            <span class="text-[11px] text-[var(--ink-muted)]">({{ city.province }})</span>
          </div>
          <span class="text-[11px] text-[var(--ink-muted)]">{{ city.code }}</span>
        </div>
      </div>
    </Teleport>
  </div>
</template>
