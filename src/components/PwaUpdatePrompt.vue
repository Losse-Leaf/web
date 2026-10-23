<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue'
import { useRegisterSW } from 'virtual:pwa-register/vue'

/**
 * P0-5：PWA 新版本提示。
 *
 * - registerType 已改为 prompt，新 SW 只在用户点「立即更新」后 skipWaiting；
 * - 这里不再自己监听 controllerchange / 刷新页面，避免和插件的 controlling
 *   事件叠加造成无限刷新；
 * - 离线时即使已有一个 waiting SW，也不弹提示（避免把断网误报成新版本），
 *   恢复联网后再展示。
 */
const UPDATE_CHECK_INTERVAL = 60 * 60 * 1000

const isOnline = ref(typeof navigator === 'undefined' ? true : navigator.onLine)
const dismissed = ref(false)
const updating = ref(false)
const updateError = ref('')

let swRegistration: ServiceWorkerRegistration | undefined
let checkTimer: number | undefined

const checkForUpdate = () => {
  if (typeof navigator === 'undefined' || !navigator.onLine) return
  swRegistration?.update().catch(() => {
    // 网络抖动时静默失败，等下一轮或下次回到前台再查。
  })
}

const handleOnline = () => {
  isOnline.value = true
  checkForUpdate()
}

const handleOffline = () => {
  isOnline.value = false
}

const handleVisibilityChange = () => {
  if (document.visibilityState === 'visible') checkForUpdate()
}

const { needRefresh, updateServiceWorker } = useRegisterSW({
  immediate: true,
  onRegisteredSW(_swScriptUrl, registration) {
    if (!registration) return
    swRegistration = registration
    checkTimer = window.setInterval(checkForUpdate, UPDATE_CHECK_INTERVAL)
  },
  onRegisterError(error) {
    console.warn('Service Worker 注册失败：', error)
  },
})

if (typeof window !== 'undefined') {
  window.addEventListener('online', handleOnline)
  window.addEventListener('offline', handleOffline)
  document.addEventListener('visibilitychange', handleVisibilityChange)
}

const visible = computed(
  () => needRefresh.value && isOnline.value && !dismissed.value,
)

const applyUpdate = async () => {
  if (updating.value || !isOnline.value) return
  updating.value = true
  updateError.value = ''
  try {
    await updateServiceWorker(true)
    // 正常情况下 updateServiceWorker 会触发一次页面刷新；
    // 若浏览器没有触发 controlling（例如更新被系统取消），恢复按钮可再次尝试。
    updating.value = false
  } catch (error) {
    updating.value = false
    updateError.value = '换页未完成，请确认网络后再试。'
    console.warn('Service Worker 更新失败：', error)
  }
}

const dismiss = () => {
  dismissed.value = true
}

onBeforeUnmount(() => {
  window.removeEventListener('online', handleOnline)
  window.removeEventListener('offline', handleOffline)
  document.removeEventListener('visibilitychange', handleVisibilityChange)
  if (checkTimer !== undefined) window.clearInterval(checkTimer)
})
</script>

<template>
  <div
    v-if="visible"
    role="status"
    aria-live="polite"
    class="fixed inset-x-3 bottom-20 md:bottom-6 z-[1250] mx-auto max-w-lg bg-[var(--bg-archive)] border border-[var(--border-subtle)] rounded-xs shadow-2xl px-4 py-3.5"
  >
    <div class="flex items-start gap-3">
      <span
        class="mt-0.5 shrink-0 text-[10px] tracking-[0.18em] uppercase text-[var(--accent-warm)] border border-[var(--accent-warm)]/35 px-1.5 py-0.5 rounded-xs font-mono-archive"
      >
        新刊
      </span>

      <div class="flex-1 min-w-0">
        <p class="text-sm text-[var(--ink-primary)] font-serif-editorial mb-1">
          新一期已装订
        </p>
        <p class="text-[11px] leading-relaxed text-[var(--ink-muted)] font-mono-archive">
          纸页有更新。立即换页可读到最新内容；正在落笔的话，也可以稍后再说。
        </p>
        <p v-if="updateError" class="mt-1 text-[11px] text-[var(--accent-warm)] font-mono-archive">
          {{ updateError }}
        </p>
      </div>

      <div class="flex flex-col gap-1.5 shrink-0">
        <button
          type="button"
          :disabled="updating"
          class="px-3 py-1.5 text-xs bg-[var(--accent-warm)] text-white rounded-xs cursor-pointer transition-opacity disabled:opacity-60 disabled:cursor-wait"
          @click="applyUpdate"
        >
          {{ updating ? '换页中…' : '立即更新' }}
        </button>
        <button
          type="button"
          :disabled="updating"
          class="px-3 py-1.5 text-xs text-[var(--ink-muted)] hover:text-[var(--ink-primary)] rounded-xs cursor-pointer transition-colors disabled:opacity-60"
          @click="dismiss"
        >
          稍后
        </button>
      </div>
    </div>
  </div>
</template>
