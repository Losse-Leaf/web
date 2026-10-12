<script setup lang="ts">
import { X, AlertTriangle } from 'lucide-vue-next'
import { useConfirm } from '../composables/useConfirm'

// 全站确认 / 提示弹窗（单一实例，在 App.vue 根部挂载一次）
const { confirmRequest, respond } = useConfirm()
</script>

<template>
  <Teleport to="body">
    <div
      v-if="confirmRequest"
      class="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-[var(--ink-primary)]/40 backdrop-blur-xs animate-in fade-in duration-200"
      @click.self="respond(false)"
    >
      <div
        class="w-full max-w-sm bg-[var(--bg-archive)] border border-[var(--border-subtle)] shadow-2xl rounded-xs p-5 sm:p-6 text-left"
        role="alertdialog"
        aria-modal="true"
      >
        <!-- 标题 -->
        <div class="flex items-start justify-between gap-3 pb-3 border-b border-[var(--border-subtle)]">
          <div class="flex items-center gap-2">
            <AlertTriangle
              v-if="confirmRequest.danger"
              class="w-4 h-4 text-[var(--accent-vermilion)]"
            />
            <h3 class="font-serif-editorial text-lg text-[var(--ink-primary)] leading-snug">
              {{ confirmRequest.title }}
            </h3>
          </div>
          <button
            v-if="confirmRequest.mode === 'confirm'"
            type="button"
            @click="respond(false)"
            class="p-1 text-[var(--ink-muted)] hover:text-[var(--ink-primary)] cursor-pointer transition-colors"
            aria-label="关闭"
          >
            <X class="w-4 h-4" />
          </button>
        </div>

        <!-- 正文 -->
        <p class="py-4 text-sm font-serif-editorial text-[var(--ink-secondary)] leading-relaxed break-words">
          {{ confirmRequest.message }}
        </p>

        <!-- 操作 -->
        <div class="pt-1 flex items-center justify-end gap-2 font-mono-archive text-xs">
          <button
            v-if="confirmRequest.mode === 'confirm'"
            type="button"
            @click="respond(false)"
            class="px-3 py-1.5 text-[var(--ink-muted)] hover:text-[var(--ink-primary)] cursor-pointer transition-colors"
          >
            {{ confirmRequest.cancelText }}
          </button>
          <button
            type="button"
            @click="respond(true)"
            class="px-4 py-1.5 rounded-xs cursor-pointer transition-opacity hover:opacity-90"
            :class="confirmRequest.danger
              ? 'bg-[var(--accent-vermilion)] text-[var(--bg-archive)]'
              : 'bg-[var(--ink-primary)] text-[var(--bg-archive)]'"
          >
            {{ confirmRequest.confirmText }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>