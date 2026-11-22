<script setup lang="ts">
import { ref, watch } from 'vue'
import { X, Check, RotateCcw, Camera, Loader2, User } from 'lucide-vue-next'
import type { CuratorProfile } from '../types'
import { DEFAULT_PROFILE, saveCuratorProfile } from '../utils/profile'
import {
  uploadUnifiedFile,
  updateCuratorProfile,
} from '../utils/api'
import { askConfirm } from '../composables/useConfirm'
import { useBodyScrollLock } from '../composables/useBodyScrollLock'
import { useEscapeClose } from '../composables/useEscapeClose'

const props = defineProps<{
  isOpen: boolean
  profile: CuratorProfile
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'updated', profile: CuratorProfile): void
}>()

const cloneProfile = (p: CuratorProfile): CuratorProfile => ({
  ...p,
})

const form = ref<CuratorProfile>(cloneProfile(props.profile))

const fileInputRef = ref<HTMLInputElement | null>(null)
const isUploadingAvatar = ref(false)
const avatarUploadProgress = ref(0)
const avatarUploadError = ref('')
const avatarKey = ref(props.profile.avatar_key || '')

const isSaving = ref(false)
const saveError = ref('')

watch(
  () => props.isOpen,
  (open) => {
    if (open) {
      form.value = cloneProfile(props.profile)
      if (!form.value.location && form.value.current_city) {
        form.value.location = form.value.current_city
      }
      avatarKey.value = props.profile.avatar_key || ''
      avatarUploadError.value = ''
      saveError.value = ''
    }
  },
  { immediate: true },
)

watch(
  () => form.value.location,
  (loc) => {
    const trimmed = (loc || '').trim()
    form.value.current_city = trimmed
      ? (trimmed.split('·')[1]?.trim() || trimmed)
      : ''
  },
)

const handleClose = () => {
  if (isSaving.value || isUploadingAvatar.value) return
  emit('close')
}

useBodyScrollLock(() => props.isOpen)
useEscapeClose(() => props.isOpen, handleClose)

const triggerSelectAvatar = () => {
  fileInputRef.value?.click()
}

const handleAvatarFileChange = async (e: Event) => {
  const target = e.target as HTMLInputElement
  const file = target.files?.[0]
  if (!file) return
  await processAvatarUpload(file)
  target.value = ''
}

const handleAvatarDrop = async (e: DragEvent) => {
  const file = e.dataTransfer?.files?.[0]
  if (file && file.type.startsWith('image/')) {
    await processAvatarUpload(file)
  }
}

const processAvatarUpload = async (file: File) => {
  if (file.size > 50 * 1024 * 1024) {
    avatarUploadError.value = '图片大小不能超过 50MB'
    return
  }

  isUploadingAvatar.value = true
  avatarUploadProgress.value = 10
  avatarUploadError.value = ''

  try {
    const res = await uploadUnifiedFile(file, 'avatar', (pct) => {
      avatarUploadProgress.value = Math.max(10, pct)
    })
    avatarKey.value = res.object_key
    form.value.avatar_url = res.url
    form.value.avatar_key = res.object_key
  } catch (err: any) {
    const reader = new FileReader()
    reader.onload = (ev) => {
      if (ev.target?.result) {
        form.value.avatar_url = ev.target.result as string
      }
    }
    reader.readAsDataURL(file)
    avatarUploadError.value = err?.message || '后端直传失败，头像暂仅本地预览，保存后仍使用原头像'
  } finally {
    isUploadingAvatar.value = false
  }
}

const handleSave = async () => {
  isSaving.value = true
  saveError.value = ''

  const loc = (form.value.location || '').trim()
  form.value.location = loc
  form.value.current_city = loc ? (loc.split('·')[1]?.trim() || loc) : ''

  try {
    const avatarUrlInput = form.value.avatar_url || ''
    const avatarUrlToSave = avatarUrlInput.startsWith('data:')
      ? (props.profile.avatar_url || undefined)
      : avatarUrlInput
    const updated = await updateCuratorProfile({
      name: form.value.name,
      title: form.value.title,
      bio: form.value.bio,
      location: form.value.location,
      current_city: form.value.current_city,
      avatar_key: avatarKey.value || form.value.avatar_key || undefined,
      avatar_url: avatarUrlToSave,
      motto: form.value.motto,
      email: form.value.email,
      github: form.value.github,
      social_links: {
        email: form.value.email || '',
        github: form.value.github || '',
      },
    })
    form.value = cloneProfile({
      ...form.value,
      ...updated,
    })
    saveCuratorProfile(form.value)
    emit('updated', form.value)
    emit('close')
  } catch (err: any) {
    saveError.value = err?.message || '保存主理人资料失败，请稍后重试'
  } finally {
    isSaving.value = false
  }
}

const handleResetDefault = async () => {
  const ok = await askConfirm({
    title: '恢复默认资料',
    message: '确定恢复为默认主理人基本资料？',
    confirmText: '恢复',
  })
  if (!ok) return
  form.value = cloneProfile(DEFAULT_PROFILE)
}
</script>

<template>
  <div
    v-if="isOpen"
    role="dialog"
    aria-modal="true"
    aria-label="编辑主理人资料"
    class="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/45 backdrop-blur-xs animate-in fade-in duration-200"
    @click.self="handleClose"
  >
    <div
      class="bg-[var(--bg-archive)] border border-[var(--border-subtle)] shadow-[0_20px_60px_rgba(0,0,0,0.15)] w-full max-w-2xl max-h-[88dvh] sm:max-h-[92vh] overflow-y-auto rounded-xs p-4 sm:p-8 text-left space-y-6 pb-[max(1.5rem,env(safe-area-inset-bottom,1.5rem))]"
    >
      <!-- 弹窗顶栏 -->
      <div class="flex items-center justify-between border-b border-[var(--border-subtle)] pb-4">
        <div>
          <h2 class="font-serif-editorial text-2xl font-medium text-[var(--ink-primary)]">
            编辑主理人资料
          </h2>
          <span class="font-mono-archive text-[11px] text-[var(--ink-muted)]">
            主理人肖像、称谓与题记管理
          </span>
        </div>

        <button
          type="button"
          @click="handleClose"
          aria-label="关闭"
          class="p-1 text-[var(--ink-muted)] hover:text-[var(--ink-primary)] cursor-pointer"
        >
          <X class="w-5 h-5" />
        </button>
      </div>

      <!-- 基础资料表单 -->
      <div class="space-y-6">
        <input
          ref="fileInputRef"
          type="file"
          accept="image/*"
          class="hidden"
          @change="handleAvatarFileChange"
        />

        <div class="p-4 rounded-xs border border-[var(--border-subtle)] bg-[var(--bg-subtle)]/30 space-y-3">
          <div class="flex items-center justify-between text-[11px] font-mono-archive text-[var(--ink-muted)] border-b border-[var(--border-subtle)]/60 pb-2">
            <span>01 肖像印记</span>
            <span v-if="avatarKey" class="text-emerald-600 text-[11px]">
              已就绪
            </span>
          </div>

          <div class="flex flex-col sm:flex-row items-center sm:items-start gap-5">
            <div
              @click="triggerSelectAvatar"
              @dragover.prevent
              @drop.prevent="handleAvatarDrop"
              class="w-24 h-24 rounded-xs bg-[var(--bg-archive)] border-2 border-dashed border-[var(--border-subtle)] hover:border-[var(--ink-primary)] overflow-hidden shrink-0 relative cursor-pointer group transition-colors shadow-xs"
            >
              <img
                v-if="form.avatar_url"
                :src="form.avatar_url"
                alt="头像预览"
                class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                loading="lazy"
                decoding="async"
              />
              <div
                v-else
                class="w-full h-full flex flex-col items-center justify-center bg-[var(--bg-subtle)] text-[var(--ink-muted)] space-y-1 select-none"
              >
                <User class="w-8 h-8 stroke-1" />
                <span class="text-[11px] font-mono-archive">选择肖像</span>
              </div>

              <div class="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center text-white text-[11px] font-mono-archive gap-1">
                <Camera class="w-4 h-4" />
                <span>更换肖像</span>
              </div>

              <div
                v-if="isUploadingAvatar"
                class="absolute inset-0 bg-black/75 backdrop-blur-xs flex flex-col items-center justify-center text-white text-[11px] font-mono-archive p-2 text-center"
              >
                <Loader2 class="w-4 h-4 animate-spin text-[var(--accent-warm)] mb-1" />
                <span>{{ avatarUploadProgress }}%</span>
              </div>
            </div>

            <div class="flex-grow space-y-2 text-center sm:text-left">
              <div class="flex flex-wrap items-center justify-center sm:justify-start gap-3">
                <button
                  @click="triggerSelectAvatar"
                  :disabled="isUploadingAvatar"
                  type="button"
                  class="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono-archive bg-[var(--ink-primary)] text-[var(--bg-archive)] hover:opacity-90 disabled:opacity-50 rounded-xs cursor-pointer transition-opacity"
                >
                  <Camera class="w-3.5 h-3.5" />
                  <span>选择本地照片上传</span>
                </button>
                <span class="text-[11px] font-mono-archive text-[var(--ink-muted)]">
                  支持 JPG / PNG / WebP（最大 20MB）
                </span>
              </div>

              <p class="text-xs font-serif-editorial text-[var(--ink-secondary)] leading-relaxed">
                直接选择你的真实照片或拖入画框，保存后自动同步。
              </p>

              <div class="min-h-[18px] flex items-center" role="alert" aria-live="polite">
                <div v-if="avatarUploadError" class="text-xs font-mono-archive text-amber-600 truncate">
                  {{ avatarUploadError }}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div class="space-y-3">
          <div class="text-[11px] font-mono-archive text-[var(--ink-muted)] uppercase tracking-wider">
            02 印信与称谓
          </div>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div class="space-y-1">
              <label class="block text-xs font-mono-archive text-[var(--ink-muted)]">主理人称谓 *</label>
              <input
                v-model="form.name"
                type="text"
                class="w-full px-3 py-2 text-sm font-serif-editorial bg-transparent border border-[var(--border-subtle)] focus:border-[var(--ink-primary)] rounded-xs outline-none"
              />
            </div>

            <div class="space-y-1">
              <label class="block text-xs font-mono-archive text-[var(--ink-muted)]">常居城市 *</label>
              <input
                v-model="form.location"
                type="text"
                class="w-full px-3 py-2 text-sm font-serif-editorial bg-transparent border border-[var(--border-subtle)] focus:border-[var(--ink-primary)] rounded-xs outline-none"
              />
            </div>
          </div>
        </div>

        <div class="space-y-3">
          <div class="text-[11px] font-mono-archive text-[var(--ink-muted)] uppercase tracking-wider">
            03 题记与近况
          </div>

          <div class="space-y-1">
            <label class="block text-xs font-mono-archive text-[var(--ink-muted)]">副标题</label>
            <input
              v-model="form.title"
              type="text"
              class="w-full px-3 py-2 text-sm font-serif-editorial bg-transparent border border-[var(--border-subtle)] focus:border-[var(--ink-primary)] rounded-xs outline-none"
            />
          </div>

          <div class="space-y-1">
            <label class="block text-xs font-mono-archive text-[var(--ink-muted)]">近况题记</label>
            <input
              v-model="form.motto"
              type="text"
              class="w-full px-3 py-2 text-sm font-serif-editorial bg-transparent border border-[var(--border-subtle)] focus:border-[var(--ink-primary)] rounded-xs outline-none"
            />
          </div>
        </div>

        <div class="space-y-3">
          <div class="text-[11px] font-mono-archive text-[var(--ink-muted)] uppercase tracking-wider">
            04 外部公开联络通道
          </div>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div class="space-y-1">
              <label class="block text-xs font-mono-archive text-[var(--ink-muted)]">公开联络邮箱</label>
              <input
                v-model="form.email"
                type="text"
                class="w-full px-3 py-2 text-xs font-mono-archive bg-transparent border border-[var(--border-subtle)] focus:border-[var(--ink-primary)] rounded-xs outline-none"
              />
            </div>

            <div class="space-y-1">
              <label class="block text-xs font-mono-archive text-[var(--ink-muted)]">GitHub 主页链接</label>
              <input
                v-model="form.github"
                type="text"
                class="w-full px-3 py-2 text-xs font-mono-archive bg-transparent border border-[var(--border-subtle)] focus:border-[var(--ink-primary)] rounded-xs outline-none"
              />
            </div>
          </div>
        </div>
      </div>

      <!-- 保存错误 -->
      <div class="min-h-[18px] flex items-center" role="alert" aria-live="polite">
        <div v-if="saveError" class="text-xs font-mono-archive text-red-600 truncate">
          {{ saveError }}
        </div>
      </div>

      <!-- 底部控制栏 -->
      <div class="pt-4 border-t border-[var(--border-subtle)] flex items-center justify-between">
        <button
          @click="handleResetDefault"
          type="button"
          class="inline-flex items-center gap-1 text-xs font-mono-archive text-[var(--ink-muted)] hover:text-[var(--ink-primary)] cursor-pointer"
        >
          <RotateCcw class="w-3.5 h-3.5" />
          <span>恢复默认资料</span>
        </button>

        <div class="flex items-center gap-3">
          <button
            @click="handleClose"
            type="button"
            class="px-4 py-2 text-xs font-mono-archive text-[var(--ink-muted)] hover:text-[var(--ink-primary)] cursor-pointer"
          >
            取消
          </button>
          <button
            @click="handleSave"
            :disabled="isSaving || isUploadingAvatar"
            type="button"
            class="px-5 py-2 text-xs font-mono-archive bg-[var(--ink-primary)] text-[var(--bg-archive)] hover:opacity-90 disabled:opacity-50 rounded-xs transition-opacity cursor-pointer flex items-center gap-1.5"
          >
            <span class="w-3.5 h-3.5 inline-flex items-center justify-center shrink-0">
              <Loader2 v-if="isSaving" class="w-3.5 h-3.5 animate-spin" />
              <Check v-else class="w-3.5 h-3.5" />
            </span>
            <span class="min-w-[7em] text-center">{{ isSaving ? '保存与同步中...' : '保存资料' }}</span>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
