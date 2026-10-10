<script setup lang="ts">
import { X, Server, CheckCircle2 } from 'lucide-vue-next'
import type { StorageStatus } from '../types'

defineProps<{
  isOpen: boolean
  status: StorageStatus | null
}>()

const emit = defineEmits<{
  (e: 'close'): void
}>()
</script>

<template>
  <div
    v-if="isOpen"
    class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs animate-in fade-in duration-200"
    @click.self="emit('close')"
  >
    <div
      class="bg-[var(--bg-archive)] border border-[var(--border-subtle)] shadow-[0_16px_40px_rgba(0,0,0,0.1)] w-full max-w-md rounded-xs p-4 sm:p-8 text-left space-y-6 max-h-[90dvh] overflow-y-auto"
    >
      <div class="flex items-center justify-between pb-4 border-b border-[var(--border-subtle)]">
        <div class="flex items-center gap-2.5">
          <Server class="w-4 h-4 text-[var(--ink-secondary)]" />
          <h2 class="font-serif-editorial text-xl font-medium text-[var(--ink-primary)]">
            对象存储设置
          </h2>
        </div>
        <button
          @click="emit('close')"
          class="p-1 text-[var(--ink-muted)] hover:text-[var(--ink-primary)] cursor-pointer"
        >
          <X class="w-4 h-4" />
        </button>
      </div>

      <div class="space-y-4 font-serif-editorial">
        <div class="flex items-center justify-between py-2 border-b border-[var(--border-subtle)]/60 text-sm">
          <span class="text-[var(--ink-muted)]">存储模式</span>
          <span class="text-[var(--ink-primary)] font-mono-archive text-xs">
            {{ status?.configured ? 'Cloudflare R2 云存储' : '本地磁盘存储模式 (/media)' }}
          </span>
        </div>

        <div class="flex items-center justify-between py-2 border-b border-[var(--border-subtle)]/60 text-sm">
          <span class="text-[var(--ink-muted)]">运行状态</span>
          <div class="flex items-center gap-1.5 font-mono-archive text-xs">
            <span
              v-if="status?.configured"
              class="text-emerald-700 flex items-center gap-1"
            >
              <CheckCircle2 class="w-3.5 h-3.5" />
              <span>已连接 R2 云端</span>
            </span>
            <span
              v-else
              class="text-emerald-700 flex items-center gap-1"
            >
              <CheckCircle2 class="w-3.5 h-3.5" />
              <span>本地直存已就绪</span>
            </span>
          </div>
        </div>

        <div v-if="status?.configured" class="flex items-center justify-between py-2 border-b border-[var(--border-subtle)]/60 text-sm">
          <span class="text-[var(--ink-muted)]">存储桶 (Bucket)</span>
          <span class="text-[var(--ink-primary)] font-mono-archive text-xs">
            {{ status?.bucket || '—' }}
          </span>
        </div>

        <div class="flex items-center justify-between py-2 border-b border-[var(--border-subtle)]/60 text-sm">
          <span class="text-[var(--ink-muted)]">{{ status?.configured ? '公网域名 (Domain)' : '本地访问路径' }}</span>
          <span class="text-[var(--ink-primary)] font-mono-archive text-xs truncate max-w-[200px]">
            {{ status?.configured ? (status?.public_domain || '—') : '/media' }}
          </span>
        </div>
      </div>

      <div
        v-if="!status?.configured"
        class="p-3 bg-[var(--bg-subtle)] border border-[var(--border-subtle)] rounded-xs text-xs font-serif-editorial text-[var(--ink-secondary)] leading-relaxed space-y-1"
      >
        <p class="font-medium text-[var(--ink-primary)]">本地磁盘存储模式（已就绪 · /media）：</p>
        <p>当前未配置 Cloudflare R2，系统已自动启用服务端本地存储。生活记录照片与附件均直接保存在本地磁盘并通过 <code>/media</code> 正常消费，全部功能完整可用。</p>
        <p class="text-[11px] font-mono-archive text-[var(--ink-muted)] pt-1">
          若未来需要多端云存储或零出口费用直传，可在服务端环境变量中补充 R2 凭据。
        </p>
      </div>

      <div class="pt-2 flex justify-end">
        <button
          @click="emit('close')"
          class="px-4 py-1.5 text-xs font-mono-archive bg-[var(--ink-primary)] text-[var(--bg-archive)] rounded-xs cursor-pointer hover:opacity-90"
        >
          确定
        </button>
      </div>
    </div>
  </div>
</template>
