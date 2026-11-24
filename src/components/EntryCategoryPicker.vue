<script setup lang="ts">
import { useId } from 'vue'
import { ENTRY_CATEGORY_OPTIONS, type EntryGalleryCategory } from '../types'

withDefaults(
  defineProps<{
    modelValue: EntryGalleryCategory
    label?: string
    hint?: string
  }>(),
  {
    label: '散页分类',
    hint: '公开带图散页将按所选分类自动同步至 Vesper Space',
  },
)

const emit = defineEmits<{
  (e: 'update:modelValue', value: EntryGalleryCategory): void
}>()

const groupId = useId()
const hintId = useId()

const getOptionId = (code: EntryGalleryCategory): string =>
  `${groupId}-${code ? code.toLowerCase().replace(/\s+/g, '-') : 'daily'}`
</script>

<template>
  <fieldset
    class="space-y-1.5 border-0 p-0 m-0 min-w-0"
    :aria-describedby="hint ? hintId : undefined"
  >
    <legend class="block text-xs font-mono-archive text-[var(--ink-muted)] mb-1.5">
      {{ label }}
    </legend>

    <div class="flex flex-wrap gap-2">
      <label
        v-for="opt in ENTRY_CATEGORY_OPTIONS"
        :key="opt.code || 'daily'"
        :for="getOptionId(opt.code)"
        class="relative inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-serif-editorial rounded-full border transition-all cursor-pointer select-none has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-[var(--accent-warm)] has-[:focus-visible]:outline-offset-2 [@media(pointer:coarse)]:min-h-[44px] [@media(pointer:coarse)]:px-3.5"
        :class="
          modelValue === opt.code
            ? 'bg-[var(--ink-primary)] text-[var(--bg-archive)] border-[var(--ink-primary)] font-medium shadow-2xs'
            : 'bg-transparent text-[var(--ink-secondary)] border-[var(--border-subtle)] hover:border-[var(--ink-primary)]/45 hover:text-[var(--ink-primary)]'
        "
      >
        <input
          :id="getOptionId(opt.code)"
          type="radio"
          :name="groupId"
          :value="opt.code"
          :checked="modelValue === opt.code"
          @change="emit('update:modelValue', opt.code)"
          class="sr-only"
        />
        <span
          aria-hidden="true"
          class="w-2 h-2 rounded-full shrink-0 transition-transform"
          :class="modelValue === opt.code ? 'ring-1 ring-[var(--bg-archive)]/45 scale-110' : ''"
          :style="{ backgroundColor: opt.accent }"
        ></span>
        <span>{{ opt.label }}</span>
      </label>
    </div>

    <p
      v-if="hint"
      :id="hintId"
      class="text-[11px] font-mono-archive text-[var(--ink-muted)] leading-relaxed pt-0.5"
    >
      {{ hint }}
    </p>
  </fieldset>
</template>
