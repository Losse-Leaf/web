<script setup lang="ts">
import { ref, computed, watch, nextTick } from 'vue'
import { MapPin } from 'lucide-vue-next'
import { searchCities, findCityByCode, type CityOption } from '../utils/cities'
import { useFloatingDropdown } from '../composables/useFloatingDropdown'

const props = defineProps<{
  modelValue?: string
  placeholder?: string
  disabled?: boolean
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', code: string): void
  (e: 'select', city: { code: string; name: string }): void
}>()

const keyword = ref('')
const isOpen = ref(false)
const inputEl = ref<HTMLInputElement | null>(null)
const menuRef = ref<HTMLElement | null>(null)

const filteredList = computed(() => searchCities(keyword.value))

const { floatingStyle: dropdownStyle, updatePosition } = useFloatingDropdown({
  triggerRef: inputEl,
  panelRef: menuRef,
  isOpen,
  estimatedHeight: () => Math.min(Math.max(filteredList.value.length * 40, 48), 224),
  offset: 4,
})

watch(
  () => filteredList.value.length,
  () => {
    if (isOpen.value) {
      nextTick(updatePosition)
    }
  },
)

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
  { immediate: true },
)

const handleSelect = (city: CityOption) => {
  keyword.value = city.name
  emit('update:modelValue', city.code)
  emit('select', { code: city.code, name: city.name })
  isOpen.value = false
}

const handleFocus = () => {
  if (props.disabled) return
  isOpen.value = true
}

const handleInput = () => {
  isOpen.value = true
  const trimmed = keyword.value.trim()
  const exact = filteredList.value.find(
    (c) => c.name === trimmed || c.name.replace(/市$/, '') === trimmed.replace(/市$/, ''),
  )
  emit('update:modelValue', exact ? exact.code : '')
  emit('select', { code: exact ? exact.code : '', name: exact ? exact.name : '' })
}

const handleBlur = () => {
  window.setTimeout(() => {
    isOpen.value = false
  }, 160)
}
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
        :disabled="disabled"
        @focus="handleFocus"
        @input="handleInput"
        @blur="handleBlur"
        class="w-full pl-8 pr-3 py-1.5 bg-[var(--bg-archive)] border border-[var(--border-subtle)] focus:border-[var(--ink-primary)] rounded-xs outline-none text-xs text-[var(--ink-primary)] font-mono-archive"
      />
    </div>

    <Teleport to="body">
      <div
        v-if="isOpen"
        ref="menuRef"
        class="bg-[var(--bg-archive)] border border-[var(--border-subtle)] rounded-xs shadow-lg max-h-56 overflow-y-auto divide-y divide-[var(--border-subtle)]/50 animate-in fade-in duration-150"
        :style="dropdownStyle"
      >
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
