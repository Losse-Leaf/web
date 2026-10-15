<script setup lang="ts">
import { ref, onMounted } from 'vue'
import {
  X,
  RefreshCw,
  ExternalLink,
  AlertCircle,
  CheckCircle2,
  Sparkles,
} from 'lucide-vue-next'
import { checkSystemUpdate } from '../utils/api'
import { audio } from '../utils/audio'
import type { UpdateCheckResult } from '../types'

defineProps<{
  isOpen: boolean
}>()

const emit = defineEmits<{
  (e: 'close'): void
}>()

const checking = ref(false)
const checkResult = ref<UpdateCheckResult | null>(null)
const checkError = ref('')

const runUpdateCheck = async (force = false) => {
  checking.value = true
  checkError.value = ''
  audio.playTink()
  try {
    const res = await checkSystemUpdate(force)
    checkResult.value = res
  } catch (err: any) {
    checkError.value = err?.message || '检查更新请求失败，请检查网络连接或服务端状态'
  } finally {
    checking.value = false
  }
}

onMounted(() => {
  runUpdateCheck(false)
})
</script>

<template>
  <div
    v-if="isOpen"
    class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/45 backdrop-blur-xs transition-opacity duration-200"
    @click.self="emit('close')"
  >
    <div
      class="w-full max-w-md bg-[var(--bg-archive)] border border-[var(--border-subtle)] rounded-xs shadow-2xl p-4 sm:p-6 text-left space-y-5 animate-in fade-in zoom-in-95 duration-200"
    >
      <!-- 弹窗标题 -->
      <div class="flex items-center justify-between pb-3.5 border-b border-[var(--border-subtle)]">
        <div class="space-y-0.5">
          <div class="flex items-center gap-2">
            <h2 class="font-serif-editorial text-xl text-[var(--ink-primary)] font-medium">
              系统版本检测
            </h2>
            <Sparkles class="w-4 h-4 text-[var(--accent-warm)]" />
          </div>
          <p class="font-mono-archive text-xs text-[var(--ink-muted)]">
            实时比对 GitHub Releases 官方版本
          </p>
        </div>
        <button
          @click="emit('close')"
          class="p-1 text-[var(--ink-muted)] hover:text-[var(--ink-primary)] cursor-pointer"
        >
          <X class="w-5 h-5" />
        </button>
      </div>

      <!-- 版本比对卡片 -->
      <div class="space-y-3 font-mono-archive text-xs">
        <div class="grid grid-cols-2 gap-3">
          <div class="p-3 bg-[var(--bg-subtle)]/70 border border-[var(--border-subtle)] rounded-xs space-y-1">
            <div class="text-[11px] text-[var(--ink-muted)]">当前运行版本</div>
            <div class="text-base text-[var(--ink-primary)] font-serif-editorial font-medium">
              {{ checkResult?.current_version || 'dev' }}
            </div>
          </div>
          <div class="p-3 bg-[var(--bg-subtle)]/70 border border-[var(--border-subtle)] rounded-xs space-y-1">
            <div class="text-[11px] text-[var(--ink-muted)]">最新发布版本</div>
            <div class="text-base font-serif-editorial font-medium" :class="checkResult?.has_update ? 'text-amber-700 dark:text-amber-400' : 'text-[var(--ink-primary)]'">
              {{ checking ? '检测中...' : (checkResult?.latest_version || '—') }}
            </div>
          </div>
        </div>

        <!-- 检测状态反馈 -->
        <div
          v-if="checkError"
          class="p-3 rounded-xs border border-rose-500/30 bg-rose-500/10 text-rose-800 dark:text-rose-300 flex items-start gap-2"
        >
          <AlertCircle class="w-4 h-4 shrink-0 text-rose-600 mt-0.5" />
          <div class="space-y-1">
            <div class="font-medium">检查更新异常</div>
            <div class="text-[11px] leading-relaxed">{{ checkError }}</div>
          </div>
        </div>

        <div
          v-else-if="checkResult?.check_error"
          class="p-3 rounded-xs border border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-300 flex items-start gap-2"
        >
          <AlertCircle class="w-4 h-4 shrink-0 text-amber-600 mt-0.5" />
          <div class="text-[11px] leading-relaxed">
            {{ checkResult.check_error }}
          </div>
        </div>

        <div
          v-else-if="checkResult?.has_update"
          class="p-3.5 rounded-xs border border-amber-500/30 bg-amber-500/10 space-y-2"
        >
          <div class="flex items-center gap-1.5 text-amber-800 dark:text-amber-300 font-medium">
            <Sparkles class="w-4 h-4 text-amber-600" />
            <span>发现新版本 {{ checkResult.latest_version }}</span>
          </div>
          <p class="text-[11px] text-[var(--ink-secondary)] leading-relaxed">
            官方仓库已发布新版本。散页采用单二进制无停机部署，可前往 GitHub Releases 下载最新二进制替换升级。
          </p>
          <a
            v-if="checkResult.release_url"
            :href="checkResult.release_url"
            target="_blank"
            rel="noopener noreferrer"
            class="inline-flex items-center gap-1 text-xs text-amber-700 dark:text-amber-400 font-medium hover:underline pt-1"
          >
            <span>查看发布页与更新内容</span>
            <ExternalLink class="w-3.5 h-3.5" />
          </a>
        </div>

        <div
          v-else-if="checkResult && !checking"
          class="p-3 rounded-xs border border-emerald-500/30 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300 flex items-center gap-2"
        >
          <CheckCircle2 class="w-4 h-4 shrink-0 text-emerald-600" />
          <span>当前已是最新版本，系统运行平稳。</span>
        </div>
      </div>

      <!-- 底部操作按钮 -->
      <div class="pt-2 flex items-center justify-between border-t border-[var(--border-subtle)] text-xs font-mono-archive">
        <span class="text-[11px] text-[var(--ink-muted)]">
          {{ checkResult?.checked_at ? `上次检测: ${new Date(checkResult.checked_at).toLocaleTimeString()}` : '' }}
        </span>
        <div class="flex items-center gap-2">
          <button
            @click="runUpdateCheck(true)"
            :disabled="checking"
            class="px-3 py-1.5 border border-[var(--border-subtle)] hover:border-[var(--ink-primary)] rounded-xs cursor-pointer flex items-center gap-1.5 text-[var(--ink-secondary)] hover:text-[var(--ink-primary)] transition-colors disabled:opacity-50"
          >
            <RefreshCw class="w-3.5 h-3.5" :class="checking ? 'animate-spin' : ''" />
            <span>{{ checking ? '检查中...' : '重新检查' }}</span>
          </button>
          <button
            @click="emit('close')"
            class="px-4 py-1.5 border border-[var(--ink-primary)] bg-[var(--ink-primary)] text-[var(--bg-archive)] hover:opacity-90 rounded-xs cursor-pointer transition-all shadow-xs"
          >
            关闭
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
