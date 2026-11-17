<script setup lang="ts">
import { Plus } from 'lucide-vue-next'

defineProps<{
  mode: 'region' | 'timeline'
  isAdmin: boolean
}>()

const emit = defineEmits<{
  (e: 'add'): void
}>()
</script>

<template>
  <div
    @click="isAdmin ? emit('add') : undefined"
    class="relative bg-[var(--bg-archive)]/50 border-2 border-dashed border-[var(--border-subtle)] hover:border-[var(--ink-primary)] rounded-xs p-6 flex flex-col items-center justify-center text-center space-y-3 group transition-all"
    :class="{ 'cursor-pointer': isAdmin }"
  >
    <div class="w-12 h-12 rounded-full bg-[var(--bg-subtle)] flex items-center justify-center text-[var(--ink-muted)] group-hover:text-[var(--ink-primary)] group-hover:scale-105 transition-all">
      <Plus class="w-5 h-5" />
    </div>
    <div class="space-y-1">
      <h4 class="font-serif-editorial text-base font-medium text-[var(--ink-primary)]">
        {{ mode === 'region' ? '下一站山川 · 待启程插槽' : '下一站行历 · 虚位以待' }}
      </h4>
      <p class="font-serif-editorial text-xs text-[var(--ink-muted)] max-w-xs">
        <template v-if="mode === 'region'">
          {{ isAdmin ? '“山川尚远，步履不停。点击录入新一站行迹，装订专属车票。”' : '“山川尚远，步履不停。岁序常新，静候下一次出发。”' }}
        </template>
        <template v-else>
          {{ isAdmin ? '“记录岁序流转，新的远方即将在此钤印。”' : '“岁序常新，记录下一站时光故事。”' }}
        </template>
      </p>
    </div>
    <span v-if="isAdmin" class="text-xs font-serif-editorial text-[var(--ink-secondary)] group-hover:text-[var(--ink-primary)]">
      ＋ 装订下一站车票
    </span>
    <span v-else class="text-xs font-serif-editorial text-[var(--ink-muted)]">
      静候下一段山海旅程
    </span>
  </div>
</template>
