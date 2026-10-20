<script setup lang="ts">
import { ref, watch, nextTick } from 'vue'
import { X, KeyRound, Check, Eye, EyeOff } from 'lucide-vue-next'
import { verifyMasterPasscode } from '../utils/api'
import { audio } from '../utils/audio'
import { useBodyScrollLock } from '../composables/useBodyScrollLock'

const props = defineProps<{
  isOpen: boolean
  prompt?: string
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'authenticated'): void
}>()

const passcode = ref('')
const isSubmitting = ref(false)
const errorMsg = ref('')
const showPassword = ref(false)
const inputRef = ref<HTMLInputElement | null>(null)

watch(
  () => props.isOpen,
  (open) => {
    if (open) {
      passcode.value = ''
      errorMsg.value = ''
      showPassword.value = false
      nextTick(() => {
        inputRef.value?.focus()
      })
    }
  },
  { immediate: true }
)

const handleSubmit = async () => {
  const p = passcode.value.trim()
  if (!p) {
    errorMsg.value = '请输入管理员密钥'
    return
  }

  try {
    isSubmitting.value = true
    errorMsg.value = ''
    audio.playTink()
    await verifyMasterPasscode(p)
    audio.playShutter()
    emit('authenticated')
  } catch (err: any) {
    errorMsg.value = err?.message || '管理员密钥不正确，请重新核对'
  } finally {
    isSubmitting.value = false
  }
}

  // MOB-P1-66：弹窗打开期间锁定背景页面滚动（此前只有灯箱锁了）
  useBodyScrollLock(() => props.isOpen)
</script>

<template>
  <div
    v-if="isOpen"
    class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[var(--ink-primary)]/40 backdrop-blur-xs animate-in fade-in duration-200"
    @click.self="emit('close')"
  >
    <div
      class="bg-[var(--bg-archive)] border border-[var(--border-subtle)] w-full max-w-sm rounded-xs shadow-2xl p-6 sm:p-7 space-y-5 text-left pb-[max(1.5rem,env(safe-area-inset-bottom,1.5rem))]"
    >
      <div class="flex items-start justify-between pb-3 border-b border-[var(--border-subtle)]">
        <div class="flex items-center gap-2.5">
          <div class="w-8 h-8 rounded-full bg-[var(--bg-subtle)] flex items-center justify-center text-[var(--accent-warm)]">
            <KeyRound class="w-4 h-4" />
          </div>
          <div>
            <h2 class="font-serif-editorial text-lg font-medium text-[var(--ink-primary)]">
              主理人印鉴登录
            </h2>
            <p class="font-serif-editorial text-[11px] text-[var(--ink-muted)]">
              {{ prompt || '输入管理员密钥以授权发布与管理自留地' }}
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

      <div
        v-if="errorMsg"
        class="p-2.5 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800/40 text-red-700 dark:text-red-300 text-xs font-mono-archive rounded-xs"
      >
        {{ errorMsg }}
      </div>

      <form @submit.prevent="handleSubmit" class="space-y-4">
        <div class="space-y-1.5">
          <label class="block text-xs font-mono-archive text-[var(--ink-muted)]">管理员口令 *</label>
          <div class="relative">
            <input
              ref="inputRef"
              v-model="passcode"
              :type="showPassword ? 'text' : 'password'"
              placeholder="请输入管理员密钥..."
              required
              class="w-full pl-3 pr-10 py-2 bg-[var(--bg-subtle)]/40 border border-[var(--border-subtle)] focus:border-[var(--ink-primary)] rounded-xs outline-none text-sm text-[var(--ink-primary)] font-mono-archive"
            />
            <button
              type="button"
              @click="showPassword = !showPassword"
              class="absolute right-2.5 top-2.5 text-[var(--ink-muted)] hover:text-[var(--ink-primary)] cursor-pointer"
              tabindex="-1"
            >
              <EyeOff v-if="showPassword" class="w-4 h-4" />
              <Eye v-else class="w-4 h-4" />
            </button>
          </div>
        </div>

        <div class="pt-2 flex items-center justify-end gap-2 font-mono-archive text-xs">
          <button
            type="button"
            @click="emit('close')"
            class="px-3 py-1.5 text-[var(--ink-muted)] hover:text-[var(--ink-primary)] cursor-pointer"
          >
            取消
          </button>
          <button
            type="submit"
            :disabled="isSubmitting || !passcode.trim()"
            class="px-4 py-1.5 bg-[var(--ink-primary)] text-[var(--bg-archive)] rounded-xs hover:opacity-90 disabled:opacity-50 cursor-pointer flex items-center gap-1.5 font-medium transition-opacity"
          >
            <Check v-if="!isSubmitting" class="w-3.5 h-3.5" />
            <span>{{ isSubmitting ? '验证中...' : '印鉴确认' }}</span>
          </button>
        </div>
      </form>
    </div>
  </div>
</template>
