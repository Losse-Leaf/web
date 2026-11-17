<script setup lang="ts">
import { ref, watch } from 'vue'
import { X, Check, Trash2, Plus, RotateCcw, Camera, Loader2, User } from 'lucide-vue-next'
import type { CuratorProfile, GearItem } from '../types'
import { DEFAULT_PROFILE, saveCuratorProfile } from '../utils/profile'
import {
  uploadUnifiedFile,
  updateCuratorProfile,
  deleteGearAsset,
} from '../utils/api'
import { askConfirm } from '../composables/useConfirm'
import { formatMoney } from '../utils/format'
import { matchCityFromLocation } from '../utils/cities'
import { useBodyScrollLock } from '../composables/useBodyScrollLock'
import { useEscapeClose } from '../composables/useEscapeClose'
import GearAssetFormModal from './ledger/GearAssetFormModal.vue'
import GearSellModal, { type GearSoldPayload } from './ledger/GearSellModal.vue'

const props = defineProps<{
  isOpen: boolean
  profile: CuratorProfile
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'updated', profile: CuratorProfile): void
  (e: 'gearChanged'): void
}>()

const cloneProfile = (p: CuratorProfile): CuratorProfile => ({
  ...p,
  edc_gear: p.edc_gear ? p.edc_gear.map((item) => ({ ...item })) : [],
})

const form = ref<CuratorProfile>(cloneProfile(props.profile))
const activeTab = ref<'base' | 'gear'>('base')

const fileInputRef = ref<HTMLInputElement | null>(null)
const isUploadingAvatar = ref(false)
const avatarUploadProgress = ref(0)
const avatarUploadError = ref('')
const avatarKey = ref(props.profile.avatar_key || '')

const isSaving = ref(false)
const saveError = ref('')

const showAddGear = ref(false)
const sellingGearTarget = ref<GearItem | null>(null)
const gearErrorMsg = ref('')

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
      gearErrorMsg.value = ''
      showAddGear.value = false
      sellingGearTarget.value = null
    }
  },
  { immediate: true },
)

watch(
  () => form.value.location,
  (loc) => {
    const trimmed = (loc || '').trim()
    const matched = matchCityFromLocation(trimmed)
    form.value.current_city = trimmed
      ? (matched?.name || trimmed.split('·')[1]?.trim() || trimmed)
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
  const matchedCity = matchCityFromLocation(loc)
  form.value.location = loc
  form.value.current_city = loc
    ? (matchedCity?.name || loc.split('·')[1]?.trim() || loc)
    : ''

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
      edc_gear: updated?.edc_gear || form.value.edc_gear,
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
    message: '确定恢复为默认主理人基本资料？设备清单不会被清空。',
    confirmText: '恢复',
  })
  if (!ok) return
  const currentGear = form.value.edc_gear ? form.value.edc_gear.map((item) => ({ ...item })) : []
  form.value = {
    ...cloneProfile(DEFAULT_PROFILE),
    edc_gear: currentGear,
  }
}

const isGearSold = (status?: string) => status === 'sold'

const formatGearStatus = (status?: string) => {
  if (!status || status === 'active') return '日常自用'
  if (status === 'sold') return '已出二手'
  return status
}

const handleGearCreated = (createdGear: GearItem) => {
  if (createdGear && createdGear.id) {
    if (!form.value.edc_gear) form.value.edc_gear = []
    form.value.edc_gear.push(createdGear)
    saveCuratorProfile(form.value)
    emit('updated', { ...form.value })
  }
  emit('gearChanged')
}

const handleGearSold = (payload: GearSoldPayload) => {
  const target = form.value.edc_gear?.find((g) => g.id === payload.id)
  if (target) {
    target.status = 'sold'
    target.sold_price_cents = payload.sold_price_cents
    target.sold_date = payload.sold_date
    saveCuratorProfile(form.value)
    emit('updated', { ...form.value })
  }
  emit('gearChanged')
}

const removeGear = async (item: GearItem) => {
  if (!item?.id) {
    gearErrorMsg.value = '该设备缺少后端标识，无法删除'
    return
  }
  const ok = await askConfirm({
    title: '移除设备',
    message: `确定从固定资产库中移除「${item.name}」？其在时间流中的伴生散页将一并删除，此操作不可恢复。`,
    confirmText: '移除',
    danger: true,
  })
  if (!ok) return
  try {
    gearErrorMsg.value = ''
    await deleteGearAsset(item.id)
    const currentIdx = form.value.edc_gear?.findIndex((g) => g.id === item.id) ?? -1
    if (currentIdx >= 0) form.value.edc_gear?.splice(currentIdx, 1)
    saveCuratorProfile(form.value)
    emit('updated', { ...form.value })
    emit('gearChanged')
  } catch (err: any) {
    gearErrorMsg.value = err?.message || '删除设备失败，请稍后重试'
  }
}
</script>

<template>
  <div
    v-if="isOpen"
    role="dialog"
    aria-modal="true"
    aria-label="编辑主理人档案"
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
            编辑主理人档案与设备
          </h2>
          <span class="font-mono-archive text-[11px] text-[var(--ink-muted)]">
            主理人档案与随身装备管理
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

      <!-- 分页切换：基础资料 · 设备清单 -->
      <div class="flex items-center gap-6 text-xs font-mono-archive border-b border-[var(--border-subtle)] pb-2">
        <button
          type="button"
          @click="activeTab = 'base'"
          class="py-1 cursor-pointer transition-colors"
          :class="activeTab === 'base' ? 'text-[var(--ink-primary)] font-semibold border-b-2 border-[var(--ink-primary)]' : 'text-[var(--ink-muted)] hover:text-[var(--ink-primary)]'"
        >
          主理人基本资料
        </button>
        <button
          type="button"
          @click="activeTab = 'gear'"
          class="py-1 cursor-pointer transition-colors"
          :class="activeTab === 'gear' ? 'text-[var(--ink-primary)] font-semibold border-b-2 border-[var(--ink-primary)]' : 'text-[var(--ink-muted)] hover:text-[var(--ink-primary)]'"
        >
          随身与桌面设备 ({{ (form.edc_gear || []).length }})
        </button>
      </div>

      <!-- 1. 基础资料表单 -->
      <div v-if="activeTab === 'base'" class="space-y-6">
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

      <!-- 2. 设备清单管理（复用共享固定资产入库与转售回血模态框） -->
      <div v-else-if="activeTab === 'gear'" class="space-y-4">
        <div class="flex items-center justify-between">
          <span class="text-xs font-mono-archive text-[var(--ink-muted)]">
            已收录 {{ (form.edc_gear || []).length }} 项设备器物
          </span>

          <button
            @click="showAddGear = true"
            type="button"
            class="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono-archive bg-[var(--ink-primary)] text-[var(--bg-archive)] hover:opacity-90 rounded-xs cursor-pointer transition-opacity"
          >
            <Plus class="w-3.5 h-3.5" />
            <span>录入新设备</span>
          </button>
        </div>

        <div class="min-h-[24px] flex items-center" role="alert" aria-live="polite">
          <div
            v-if="gearErrorMsg"
            class="w-full p-2.5 text-xs font-mono-archive text-red-600 bg-red-500/5 border border-red-600/20 rounded-xs truncate"
          >
            {{ gearErrorMsg }}
          </div>
        </div>

        <div
          v-if="(form.edc_gear || []).length === 0"
          class="py-12 px-4 text-center border border-dashed border-[var(--border-subtle)] rounded-xs font-serif-editorial text-sm text-[var(--ink-muted)]"
        >
          暂无收录设备，点击右上角录入长伴身边的器物。
        </div>

        <div v-else class="divide-y divide-[var(--border-subtle)]/70 max-h-[52vh] overflow-y-auto pr-1">
          <div
            v-for="(item, idx) in (form.edc_gear || [])"
            :key="item.id || idx"
            class="py-3 space-y-2 group relative"
          >
            <div class="flex items-start justify-between gap-4">
              <div class="space-y-1">
                <div class="flex flex-wrap items-center gap-2">
                  <span class="text-[11px] font-mono-archive px-1.5 py-0.2 rounded-xs border border-[var(--border-subtle)] text-[var(--ink-muted)]">
                    {{ item.category }}
                  </span>
                  <span class="font-serif-editorial text-base text-[var(--ink-primary)] font-medium">
                    {{ item.name }}
                  </span>
                  <span v-if="item.status" class="text-[11px] font-mono-archive" :class="isGearSold(item.status) ? 'text-amber-600' : 'text-[var(--accent-warm)]'">
                    · {{ formatGearStatus(item.status) }}
                  </span>
                  <span v-if="item.price_cents" class="text-[11px] font-mono-archive text-[var(--ink-muted)]">
                    (购入 ¥{{ formatMoney(item.price_cents) }})
                  </span>
                  <span v-if="item.sold_price_cents" class="text-[11px] font-mono-archive text-emerald-700">
                    (回血 ¥{{ formatMoney(item.sold_price_cents) }})
                  </span>
                </div>
                <p v-if="item.spec" class="text-xs font-mono-archive text-[var(--ink-muted)]">
                  {{ item.spec }}
                </p>
                <p v-if="item.note" class="text-xs font-serif-editorial text-[var(--ink-secondary)] italic">
                  “{{ item.note }}”
                </p>
              </div>

              <div class="flex items-center gap-2 shrink-0">
                <button
                  v-if="!isGearSold(item.status) && item.id"
                  @click="sellingGearTarget = item"
                  type="button"
                  class="text-[11px] font-mono-archive px-2 py-0.5 border border-[var(--border-subtle)] hover:border-[var(--ink-primary)] rounded-xs cursor-pointer transition-colors text-[var(--ink-secondary)] hover:text-[var(--ink-primary)]"
                >
                  出二手回血
                </button>

                <button
                  type="button"
                  @click="removeGear(item)"
                  class="text-[var(--ink-muted)] hover:text-red-700 p-1 cursor-pointer opacity-70 group-hover:opacity-100 transition-opacity"
                  title="删除此项"
                >
                  <Trash2 class="w-3.5 h-3.5" />
                </button>
              </div>
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

      <!-- 共享固定资产录入与转售回血模态框 (z-60 叠层 + LIFO Escape) -->
      <GearAssetFormModal
        :isOpen="showAddGear"
        @close="showAddGear = false"
        @created="handleGearCreated"
      />

      <GearSellModal
        :gear="sellingGearTarget"
        @close="sellingGearTarget = null"
        @sold="handleGearSold"
      />
    </div>
  </div>
</template>
