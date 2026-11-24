<script setup lang="ts">
import { useId } from 'vue'

withDefaults(
  defineProps<{
    modelValue: boolean
    label?: string
    description?: string
  }>(),
  {
    label: '仅自己可见（私密）',
    description: '开启后仅主理人登录可见，不对外公开，也不会自动同步至 Vesper Space',
  },
)

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void
}>()

const labelId = useId()
const descId = useId()
</script>

<template>
  <div class="flex items-center justify-between gap-3 px-3 py-2.5 rounded-xs border border-[var(--border-subtle)] bg-[var(--bg-surface)]/40">
    <div>
      <div :id="labelId" class="text-xs font-serif-editorial text-[var(--ink-primary)]">
        {{ label }}
      </div>
      <div :id="descId" class="text-[11px] font-mono-archive text-[var(--ink-faint)]">
        {{ description }}
      </div>
    </div>
    <button
      type="button"
      role="switch"
      :aria-checked="modelValue"
      :aria-labelledby="labelId"
      :aria-describedby="descId"
      @click="emit('update:modelValue', !modelValue)"
      class="w-10 h-5 rounded-full transition-colors p-0.5 cursor-pointer shrink-0"
      :class="modelValue ? 'bg-[var(--ink-primary)]' : 'bg-[var(--border-strong)]'"
    >
      <span
        class="block w-4 h-4 rounded-full bg-[var(--bg-archive)] transition-transform"
        :class="modelValue ? 'translate-x-5' : 'translate-x-0'"
      />
    </button>
  </div>
</template>
