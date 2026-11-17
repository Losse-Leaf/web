<script setup lang="ts">
import { ref, computed, watch, nextTick, onMounted, onBeforeUnmount } from 'vue'
import { X, ShieldAlert, KeyRound, ArrowRight } from 'lucide-vue-next'
import { useBodyScrollLock } from '../composables/useBodyScrollLock'
import { useEscapeClose } from '../composables/useEscapeClose'
import { redirectToOIDCLogin } from '../utils/auth'
import type { SystemStatus } from '../types'

const props = defineProps<{
  isOpen: boolean
  systemStatus?: SystemStatus | null
}>()

const emit = defineEmits<{
  (e: 'close'): void
}>()

const isOIDCEnabled = computed(() => Boolean(props.systemStatus?.oidc_enabled))

const dialogRef = ref<HTMLElement | null>(null)
let previouslyFocused: HTMLElement | null = null

const focusDialog = () => {
  previouslyFocused = document.activeElement as HTMLElement | null
  nextTick(() => dialogRef.value?.focus())
}

const restoreFocus = () => {
  previouslyFocused?.focus?.()
  previouslyFocused = null
}

const closeDialog = () => {
  restoreFocus()
  emit('close')
}

const handleOIDCLogin = () => {
  redirectToOIDCLogin()
}

useBodyScrollLock(() => props.isOpen)
useEscapeClose(() => props.isOpen, closeDialog)

watch(
  () => props.isOpen,
  (open) => {
    if (open) focusDialog()
    else restoreFocus()
  },
)

onMounted(() => {
  focusDialog()
})

onBeforeUnmount(() => {
  restoreFocus()
})
</script>

<template>
  <div
    v-if="isOpen"
    ref="dialogRef"
    tabindex="-1"
    role="alertdialog"
    aria-modal="true"
    aria-labelledby="session-expired-title"
    class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[var(--ink-primary)]/40 backdrop-blur-xs animate-in fade-in duration-200"
    @click.self="closeDialog"
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
            <h2 id="session-expired-title" class="font-serif-editorial text-lg font-medium text-[var(--ink-primary)]">
              {{ isOIDCEnabled ? '需要验证主理人通行证' : '需要主理人会话权限' }}
            </h2>
            <p class="font-serif-editorial text-[11px] text-[var(--ink-muted)]">
              {{ isOIDCEnabled ? '核验统一通行证以恢复或建立受信任会话' : '当前浏览器未持有有效的主理人会话凭证' }}
            </p>
          </div>
        </div>
        <button
          type="button"
          aria-label="关闭"
          @click="closeDialog"
          class="text-[var(--ink-muted)] hover:text-[var(--ink-primary)] p-1 cursor-pointer transition-colors"
        >
          <X class="w-4 h-4" />
        </button>
      </div>

      <div
        v-if="isOIDCEnabled"
        class="space-y-4 font-serif-editorial text-xs sm:text-sm text-[var(--ink-secondary)] leading-relaxed"
      >
        <p>
          当前浏览器尚未建立有效的主理人会话，或原会话凭证已过期。点击下方按钮通过 Vesper Auth 完成身份核验，即可直接恢复管理权限。
        </p>

        <div class="space-y-2.5 font-mono-archive text-xs pt-1">
          <button
            type="button"
            @click="handleOIDCLogin"
            class="w-full min-h-[44px] py-2.5 px-4 bg-[var(--accent-warm)] text-white rounded-xs hover:opacity-90 cursor-pointer font-medium transition-opacity flex items-center justify-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-warm)]"
          >
            <KeyRound class="w-3.5 h-3.5" />
            <span>通过 Vesper Auth 通行证进入</span>
            <ArrowRight class="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            @click="closeDialog"
            class="w-full py-2 text-[var(--ink-muted)] hover:text-[var(--ink-primary)] cursor-pointer transition-colors text-center"
          >
            暂以访客身份浏览
          </button>
        </div>
      </div>

      <template v-else>
        <div class="space-y-3 font-serif-editorial text-xs sm:text-sm text-[var(--ink-secondary)] leading-relaxed">
          <p class="flex items-start gap-2">
            <KeyRound class="w-4 h-4 mt-0.5 shrink-0 text-[var(--accent-warm)]" />
            <span>
              离线模式下，Web 浏览器的管理权限由首次认领签发的受保护 Cookie 会话承载（设备配对二维码仅供移动端与桌面客户端绑定使用）。
            </span>
          </p>
          <p class="text-[11px] font-mono-archive text-[var(--ink-muted)] border-t border-[var(--border-subtle)] pt-3">
            若本浏览器会话已过期或被清除，可通过服务端恢复参数重新开启首次认领入口以重签会话。
          </p>
        </div>

        <div class="pt-1 flex items-center justify-end font-mono-archive text-xs">
          <button
            type="button"
            @click="closeDialog"
            class="px-4 py-1.5 bg-[var(--ink-primary)] text-[var(--bg-archive)] rounded-xs hover:opacity-90 cursor-pointer font-medium transition-opacity"
          >
            知道了
          </button>
        </div>
      </template>
    </div>
  </div>
</template>
