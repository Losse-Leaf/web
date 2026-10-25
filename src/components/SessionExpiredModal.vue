<script setup lang="ts">
import { X, ShieldAlert, ScanLine } from 'lucide-vue-next'
import { useBodyScrollLock } from '../composables/useBodyScrollLock'

const props = defineProps<{
  isOpen: boolean
}>()

const emit = defineEmits<{
  (e: 'close'): void
}>()

useBodyScrollLock(() => props.isOpen)
</script>

<template>
  <div
    v-if="isOpen"
    class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[var(--ink-primary)]/40 backdrop-blur-xs animate-in fade-in duration-200"
    @click.self="emit('close')"
  >
    <div
      class="bg-[var(--bg-archive)] border border-[var(--border-subtle)] w-full max-w-md rounded-xs shadow-2xl p-6 sm:p-7 space-y-5 text-left pb-[max(1.5rem,env(safe-area-inset-bottom,1.5rem))]"
    >
      <div class="flex items-start justify-between pb-3 border-b border-[var(--border-subtle)]">
        <div class="flex items-center gap-2.5">
          <div class="w-8 h-8 rounded-full bg-[var(--bg-subtle)] flex items-center justify-center text-[var(--accent-warm)]">
            <ShieldAlert class="w-4 h-4" />
          </div>
          <div>
            <h2 class="font-serif-editorial text-lg font-medium text-[var(--ink-primary)]">
              主理人会话已失效
            </h2>
            <p class="font-serif-editorial text-[11px] text-[var(--ink-muted)]">
              本浏览器需要重新配对后才能继续管理档案
            </p>
          </div>
        </div>
        <button
          type="button"
          @click="emit('close')"
          class="text-[var(--ink-muted)] hover:text-[var(--ink-primary)] p-1 cursor-pointer transition-colors"
        >
          <X class="w-4 h-4" />
        </button>
      </div>

      <div class="space-y-3 font-serif-editorial text-xs sm:text-sm text-[var(--ink-secondary)] leading-relaxed">
        <p class="flex items-start gap-2">
          <ScanLine class="w-4 h-4 mt-0.5 shrink-0 text-[var(--accent-warm)]" />
          <span>
            请在一台已配对的设备上打开「设置 → 设备配对」，生成新的配对二维码或链接，再用本浏览器扫码或粘贴接入。
          </span>
        </p>
        <p class="text-[11px] font-mono-archive text-[var(--ink-muted)] border-t border-[var(--border-subtle)] pt-3">
          若所有设备均已丢失，请删除服务器上的数据文件后重新开始。
        </p>
      </div>

      <div class="pt-1 flex items-center justify-end font-mono-archive text-xs">
        <button
          type="button"
          @click="emit('close')"
          class="px-4 py-1.5 bg-[var(--ink-primary)] text-[var(--bg-archive)] rounded-xs hover:opacity-90 cursor-pointer font-medium transition-opacity"
        >
          知道了
        </button>
      </div>
    </div>
  </div>
</template>
