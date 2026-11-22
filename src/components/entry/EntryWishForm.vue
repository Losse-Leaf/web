<script setup lang="ts">
import { ref } from 'vue'
import ImageUploader from '../ImageUploader.vue'
import PaperDatePicker from '../PaperDatePicker.vue'

defineProps<{
  wishKind: 'item' | 'travel' | 'milestone'
  title: string
  wishBudgetYuan: string
  wishSpec: string
  wishTargetDate: string
  content: string
}>()

const emit = defineEmits<{
  (e: 'update:wishKind', val: 'item' | 'travel' | 'milestone'): void
  (e: 'update:title', val: string): void
  (e: 'update:wishBudgetYuan', val: string): void
  (e: 'update:wishSpec', val: string): void
  (e: 'update:wishTargetDate', val: string): void
  (e: 'update:content', val: string): void
  (e: 'update:attachmentIds', ids: number[]): void
}>()

const imageUploaderRef = ref<InstanceType<typeof ImageUploader> | null>(null)

defineExpose({
  uploadFiles: (files: File[]) => imageUploaderRef.value?.uploadFiles(files),
  markCommitted: () => imageUploaderRef.value?.markCommitted(),
})
</script>

<template>
  <div class="space-y-5">
    <div class="grid grid-cols-3 gap-2">
      <button
        type="button"
        @click="emit('update:wishKind', 'item')"
        class="py-2 text-xs font-serif-editorial rounded-xs border transition-colors cursor-pointer"
        :class="wishKind === 'item' ? 'border-[var(--ink-primary)] bg-[var(--bg-subtle)] font-semibold text-[var(--ink-primary)]' : 'border-[var(--border-subtle)] text-[var(--ink-muted)]'"
      >
        好物心愿
      </button>
      <button
        type="button"
        @click="emit('update:wishKind', 'travel')"
        class="py-2 text-xs font-serif-editorial rounded-xs border transition-colors cursor-pointer"
        :class="wishKind === 'travel' ? 'border-[var(--ink-primary)] bg-[var(--bg-subtle)] font-semibold text-[var(--ink-primary)]' : 'border-[var(--border-subtle)] text-[var(--ink-muted)]'"
      >
        远方旅程
      </button>
      <button
        type="button"
        @click="emit('update:wishKind', 'milestone')"
        class="py-2 text-xs font-serif-editorial rounded-xs border transition-colors cursor-pointer"
        :class="wishKind === 'milestone' ? 'border-[var(--ink-primary)] bg-[var(--bg-subtle)] font-semibold text-[var(--ink-primary)]' : 'border-[var(--border-subtle)] text-[var(--ink-muted)]'"
      >
        阶段里程碑
      </button>
    </div>

    <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <div class="space-y-1.5">
        <label class="block text-xs font-mono-archive text-[var(--ink-muted)]">心愿名称 *</label>
        <input
          :value="title"
          @input="emit('update:title', ($event.target as HTMLInputElement).value)"
          type="text"
          class="w-full px-3 py-2 text-base font-serif-editorial bg-transparent border border-[var(--border-subtle)] focus:border-[var(--ink-primary)] rounded-xs outline-none"
        />
      </div>
      <div class="space-y-1.5">
        <label class="block text-xs font-mono-archive text-[var(--ink-muted)]">预估预算 (¥)</label>
        <input
          :value="wishBudgetYuan"
          @input="emit('update:wishBudgetYuan', ($event.target as HTMLInputElement).value)"
          type="number"
          step="0.01"
          min="0"
          placeholder="0.00"
          class="w-full px-3 py-2 text-base font-mono-archive bg-transparent border border-[var(--border-subtle)] focus:border-[var(--ink-primary)] rounded-xs outline-none"
        />
      </div>
    </div>

    <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <div v-if="wishKind === 'item'" class="space-y-1.5">
        <label class="block text-xs font-mono-archive text-[var(--ink-muted)]">规格型号</label>
        <input
          :value="wishSpec"
          @input="emit('update:wishSpec', ($event.target as HTMLInputElement).value)"
          type="text"
          class="w-full px-3 py-2 text-xs font-serif-editorial bg-transparent border border-[var(--border-subtle)] focus:border-[var(--ink-primary)] rounded-xs outline-none"
        />
      </div>
      <div class="space-y-1.5">
        <label class="block text-xs font-mono-archive text-[var(--ink-muted)]">期许达成日期</label>
        <PaperDatePicker
          :modelValue="wishTargetDate"
          @update:modelValue="emit('update:wishTargetDate', $event)"
        />
      </div>
    </div>

    <div class="space-y-1.5">
      <label class="block text-xs font-mono-archive text-[var(--ink-muted)]">心愿寄语</label>
      <textarea
        :value="content"
        @input="emit('update:content', ($event.target as HTMLTextAreaElement).value)"
        rows="4"
        class="w-full px-3 py-2 text-base font-serif-editorial leading-relaxed bg-transparent border border-[var(--border-subtle)] focus:border-[var(--ink-primary)] rounded-xs outline-none resize-none"
      ></textarea>
    </div>

    <ImageUploader
      ref="imageUploaderRef"
      @update:attachments="emit('update:attachmentIds', $event)"
    />
  </div>
</template>
