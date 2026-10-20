<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted } from 'vue'
import { X, Check, Trash2, Plus, RotateCcw, Camera, Loader2, User } from 'lucide-vue-next'
import type { CuratorProfile } from '../types'
import { DEFAULT_PROFILE, saveCuratorProfile } from '../utils/profile'
import {
  uploadUnifiedFile,
  updateCuratorProfile,
  addGearAsset,
  sellGearAsset,
  deleteGearAsset,
} from '../utils/api'
import { useCategories } from '../composables/useCategories'
import { askConfirm } from '../composables/useConfirm'
import { getBeijingDateString } from '../utils/format'
import { matchCityFromLocation } from '../utils/cities'
import PaperSelect from './PaperSelect.vue'
import PaperDatePicker from './PaperDatePicker.vue'
import { useBodyScrollLock } from '../composables/useBodyScrollLock'

const props = defineProps<{
  isOpen: boolean
  profile: CuratorProfile
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'updated', profile: CuratorProfile): void
}>()

const { gearCategories: categories, paymentMethods, loadCategories, openCategoryManager } = useCategories()

const cloneProfile = (p: CuratorProfile): CuratorProfile => ({
  ...p,
  edc_gear: p.edc_gear ? p.edc_gear.map((item) => ({ ...item })) : [],
})

const form = ref<CuratorProfile>(cloneProfile(props.profile))
const activeTab = ref<'base' | 'gear'>('base')

// 头像上传与相对路径状态
const fileInputRef = ref<HTMLInputElement | null>(null)
const isUploadingAvatar = ref(false)
const avatarUploadProgress = ref(0)
const avatarUploadError = ref('')
const avatarKey = ref(props.profile.avatar_key || '')

// 保存状态
const isSaving = ref(false)
const saveError = ref('')

// 装备新增与操作状态 (RC-132 唯一写通道)
const newGearCategory = ref('影像与暗房')
const newGearName = ref('')
const newGearSpec = ref('')
const newGearPaymentMethod = ref('')
const newGearNote = ref('')
const newGearPrice = ref('')
const newGearPurchaseDate = ref(getBeijingDateString())
const syncBuyTransaction = ref(true)
const showAddGear = ref(false)
const isAddingGear = ref(false)
const gearErrorMsg = ref('')

// 仅在弹窗打开时同步并克隆表单状态，移除全局深监听与 JSON 频繁序列化开销 (FE-07)
watch(
  () => props.isOpen,
  (open) => {
    if (open) {
      loadCategories()
      form.value = cloneProfile(props.profile)
      if (!form.value.location && form.value.current_city) {
        form.value.location = form.value.current_city
      }
      avatarKey.value = props.profile.avatar_key || ''
      avatarUploadError.value = ''
      saveError.value = ''
      gearErrorMsg.value = ''
    }
  },
  { immediate: true }
)

watch(
  () => form.value.location,
  (loc) => {
    const trimmed = (loc || '').trim()
    const matched = matchCityFromLocation(trimmed)
    form.value.current_city = trimmed
      ? (matched?.name || trimmed.split('·')[1]?.trim() || trimmed)
      : ''
  }
)

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
    // 获得后端相对路径与有效访问 URL
    avatarKey.value = res.object_key
    form.value.avatar_url = res.url
    form.value.avatar_key = res.object_key
  } catch (err: any) {
    // 离线/未配置存储时优雅降级：FileReader 本地暂存
    const reader = new FileReader()
    reader.onload = (ev) => {
      if (ev.target?.result) {
        form.value.avatar_url = ev.target.result as string
      }
    }
    reader.readAsDataURL(file)
    avatarUploadError.value = err?.message || '后端直传失败，已自动转为本地暂存'
  } finally {
    isUploadingAvatar.value = false
  }
}

const handleSave = async () => {
  isSaving.value = true
  saveError.value = ''

  // 1. 规范清洗字段：彻底杜绝英文名，信条与座右铭合一，城市与坐标合一 (RC-31, RC-52)
  if (!form.value.motto?.trim()) {
    form.value.motto = DEFAULT_PROFILE.motto
  }
  const loc = (form.value.location || '').trim()
  const matchedCity = matchCityFromLocation(loc)
  form.value.location = loc
  form.value.current_city = loc
    ? (matchedCity?.name || loc.split('·')[1]?.trim() || loc)
    : ''

  // 2. 向后端更新持久化主理人基本资料，不携带 edc_gear 以杜绝双写互踩 (RC-132)
  try {
    const updated = await updateCuratorProfile({
      name: form.value.name,
      title: form.value.title,
      bio: form.value.bio,
      location: form.value.location,
      current_city: form.value.current_city,
      avatar_key: avatarKey.value || form.value.avatar_key || undefined,
      avatar_url: form.value.avatar_url,
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

const handleAddGear = async () => {
  if (!newGearName.value.trim()) {
    gearErrorMsg.value = '请填写设备名称'
    return
  }
  const priceFloat = parseFloat(newGearPrice.value)
  const priceCents = !isNaN(priceFloat) && priceFloat > 0 ? Math.round(priceFloat * 100) : undefined
  const purchaseDate = newGearPurchaseDate.value || getBeijingDateString()
  const shouldCreateTx = Boolean(syncBuyTransaction.value && priceCents && priceCents > 0)

  try {
    isAddingGear.value = true
    gearErrorMsg.value = ''
    const res = await addGearAsset({
      category: newGearCategory.value,
      name: newGearName.value.trim(),
      spec: newGearSpec.value.trim() || undefined,
      note: newGearNote.value.trim() || undefined,
      price_cents: priceCents,
      purchase_date: purchaseDate,
      create_transaction: shouldCreateTx,
      payment_method: shouldCreateTx && newGearPaymentMethod.value ? newGearPaymentMethod.value : undefined,
    })
    const createdGear = (res as any)?.gear || res
    if (createdGear && createdGear.id) {
      if (!form.value.edc_gear) form.value.edc_gear = []
      form.value.edc_gear.push(createdGear)
      saveCuratorProfile(form.value)
      emit('updated', { ...form.value })
    }
    newGearName.value = ''
    newGearSpec.value = ''
    newGearPaymentMethod.value = ''
    newGearNote.value = ''
    newGearPrice.value = ''
    newGearPurchaseDate.value = getBeijingDateString()
    syncBuyTransaction.value = true
    showAddGear.value = false
  } catch (err: any) {
    gearErrorMsg.value = err?.message || '录入设备失败，请稍后重试'
  } finally {
    isAddingGear.value = false
  }
}

// 设备状态判断与中文映射 (RC-90)
const isGearSold = (status?: string) => status === 'sold'

const formatGearStatus = (status?: string) => {
  if (!status || status === 'active') return '日常自用'
  if (status === 'sold') return '已出二手'
  return status
}

// 出二手回血内联结算抽屉 (RC-54, RG-19, RC-132)
const sellingGearIndex = ref<number | null>(null)
const sellingPriceInput = ref('')
const sellingDateInput = ref('')
const sellingErrorMsg = ref('')
const isSellingSubmitting = ref(false)

const openSellDrawer = (idx: number) => {
  const item = form.value.edc_gear?.[idx]
  if (!item) return
  sellingGearIndex.value = idx
  sellingPriceInput.value = item.price_cents ? (item.price_cents / 100).toFixed(2) : ''
  sellingDateInput.value = getBeijingDateString()
  sellingErrorMsg.value = ''
}

const cancelSellDrawer = () => {
  sellingGearIndex.value = null
  sellingPriceInput.value = ''
  sellingDateInput.value = ''
  sellingErrorMsg.value = ''
}

const confirmSellGear = async () => {
  if (sellingGearIndex.value === null) return
  const item = form.value.edc_gear?.[sellingGearIndex.value]
  if (!item) return

  if (!item.id) {
    sellingErrorMsg.value = '该设备缺少后端标识，无法执行转售结算'
    return
  }

  const soldFloat = parseFloat(sellingPriceInput.value)
  if (isNaN(soldFloat) || soldFloat <= 0) {
    sellingErrorMsg.value = '请输入大于 0 的转让回血金额'
    return
  }

  const soldCents = Math.round(soldFloat * 100)
  const soldDate = sellingDateInput.value || getBeijingDateString()

  try {
    isSellingSubmitting.value = true
    sellingErrorMsg.value = ''
    await sellGearAsset(item.id, {
      sold_price_cents: soldCents,
      sold_date: soldDate,
    })
    item.status = 'sold'
    item.sold_price_cents = soldCents
    item.sold_date = soldDate
    saveCuratorProfile(form.value)
    emit('updated', { ...form.value })
    cancelSellDrawer()
  } catch (err: any) {
    sellingErrorMsg.value = err?.message || '设备转售回血结算失败，请重试'
  } finally {
    isSellingSubmitting.value = false
  }
}

const removeGear = async (idx: number) => {
  const item = form.value.edc_gear?.[idx]
  if (!item?.id) {
    gearErrorMsg.value = '该设备缺少后端标识，无法删除'
    return
  }
  try {
    gearErrorMsg.value = ''
    await deleteGearAsset(item.id)
    form.value.edc_gear?.splice(idx, 1)
    saveCuratorProfile(form.value)
    emit('updated', { ...form.value })
  } catch (err: any) {
    gearErrorMsg.value = err?.message || '删除设备失败，请稍后重试'
  }
}

const handleKeydown = (e: KeyboardEvent) => {
  if (e.key === 'Escape' && props.isOpen) {
    emit('close')
  }
}

// 仅在弹窗开启期间监听 Esc，关闭即移除；卸载兜底清理 (FE-18)
onMounted(() => {
  watch(
    () => props.isOpen,
    (open) => {
      if (open) {
        window.addEventListener('keydown', handleKeydown)
      } else {
        window.removeEventListener('keydown', handleKeydown)
      }
    },
    { immediate: true }
  )
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeydown)
})

  // MOB-P1-66：弹窗打开期间锁定背景页面滚动（此前只有灯箱锁了）
  useBodyScrollLock(() => props.isOpen)
</script>

<template>
  <div
    v-if="isOpen"
    class="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/45 backdrop-blur-xs animate-in fade-in duration-200"
    @click.self="emit('close')"
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
          @click="emit('close')"
          class="p-1 text-[var(--ink-muted)] hover:text-[var(--ink-primary)] cursor-pointer"
        >
          <X class="w-5 h-5" />
        </button>
      </div>

      <!-- 分页切换：基础资料 · 设备清单 -->
      <div class="flex items-center gap-6 text-xs font-mono-archive border-b border-[var(--border-subtle)] pb-2">
        <button
          @click="activeTab = 'base'"
          class="py-1 cursor-pointer transition-colors"
          :class="activeTab === 'base' ? 'text-[var(--ink-primary)] font-semibold border-b-2 border-[var(--ink-primary)]' : 'text-[var(--ink-muted)] hover:text-[var(--ink-primary)]'"
        >
          主理人基本资料
        </button>
        <button
          @click="activeTab = 'gear'"
          class="py-1 cursor-pointer transition-colors"
          :class="activeTab === 'gear' ? 'text-[var(--ink-primary)] font-semibold border-b-2 border-[var(--ink-primary)]' : 'text-[var(--ink-muted)] hover:text-[var(--ink-primary)]'"
        >
          随身与桌面设备 ({{ (form.edc_gear || []).length }})
        </button>
      </div>

      <!-- 1. 基础资料表单 (纯文件上传 + 精简 7 项) -->
      <div v-if="activeTab === 'base'" class="space-y-6">
        
        <!-- 肖像文件上传与暗房装裱画框 (告别手工填 URL，纯本地选图/拖拽) -->
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
            <!-- 肖像画框（支持点击选择与拖拽） -->
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
               loading="lazy" decoding="async">
              <div
                v-else
                class="w-full h-full flex flex-col items-center justify-center bg-[var(--bg-subtle)] text-[var(--ink-muted)] space-y-1 select-none"
              >
                <User class="w-8 h-8 stroke-1" />
                <span class="text-[11px] font-mono-archive">选择肖像</span>
              </div>

              <!-- 悬浮蒙版 -->
              <div class="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center text-white text-[11px] font-mono-archive gap-1">
                <Camera class="w-4 h-4" />
                <span>更换肖像</span>
              </div>

              <!-- 上传中进度覆盖层 -->
              <div
                v-if="isUploadingAvatar"
                class="absolute inset-0 bg-black/75 backdrop-blur-xs flex flex-col items-center justify-center text-white text-[11px] font-mono-archive p-2 text-center"
              >
                <Loader2 class="w-4 h-4 animate-spin text-[var(--accent-warm)] mb-1" />
                <span>{{ avatarUploadProgress }}%</span>
              </div>
            </div>

            <!-- 右侧说明与动作按钮 -->
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

              <div v-if="avatarUploadError" class="text-xs font-mono-archive text-amber-600">
                {{ avatarUploadError }}
              </div>
            </div>
          </div>
        </div>

        <!-- 印信与身份 (称谓 + 城市坐标) -->
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

        <!-- 签名与一句话近况 -->
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

        <!-- 外部公开联络通道 -->
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

      <!-- 2. 设备清单表单 -->
      <div v-else-if="activeTab === 'gear'" class="space-y-6">
        <!-- 顶部操作栏 -->
        <div class="flex items-center justify-between">
          <span class="text-xs font-mono-archive text-[var(--ink-muted)]">
            已收录 {{ (form.edc_gear || []).length }} 项设备器物
          </span>

          <button
            @click="showAddGear = !showAddGear"
            type="button"
            class="inline-flex items-center gap-1.5 px-3 py-1 text-xs font-mono-archive border border-[var(--border-subtle)] hover:border-[var(--ink-primary)] rounded-xs cursor-pointer transition-colors"
          >
            <Plus class="w-3.5 h-3.5" />
            <span>{{ showAddGear ? '取消添加' : '＋ 添加新设备' }}</span>
          </button>
        </div>

        <!-- 错误提示条 -->
        <div
          v-if="gearErrorMsg"
          class="p-2.5 text-xs font-mono-archive text-red-600 bg-red-500/5 border border-red-600/20 rounded-xs"
        >
          {{ gearErrorMsg }}
        </div>

        <!-- 展开的添加设备小抽屉 -->
        <div
          v-if="showAddGear"
          class="p-4 rounded-xs border border-[var(--border-subtle)] bg-[var(--bg-subtle)]/40 space-y-3"
        >
          <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <div class="flex items-center justify-between mb-1">
                <label class="block text-[11px] font-mono-archive text-[var(--ink-muted)]">类目</label>
                <button
                  type="button"
                  @click="openCategoryManager('gear')"
                  class="text-[11px] font-mono-archive text-[var(--ink-secondary)] hover:text-[var(--ink-primary)] underline underline-offset-4 cursor-pointer"
                >
                  管理分类
                </button>
              </div>
              <PaperSelect
                v-model="newGearCategory"
                size="sm"
                :options="categories.map((cat) => ({ value: cat, label: cat }))"
              />
            </div>

            <div>
              <label class="block text-[11px] font-mono-archive text-[var(--ink-muted)] mb-1">设备名称 *</label>
              <input
                v-model="newGearName"
                type="text"
                class="w-full px-2.5 py-1.5 text-xs font-mono-archive bg-[var(--bg-archive)] border border-[var(--border-subtle)] rounded-xs outline-none"
              />
            </div>

            <div>
              <div class="flex items-center justify-between mb-1">
                <label class="block text-[11px] font-mono-archive text-[var(--ink-muted)]">支付方式</label>
                <button
                  type="button"
                  @click="openCategoryManager('payment')"
                  class="text-[11px] font-mono-archive text-[var(--ink-secondary)] hover:text-[var(--ink-primary)] underline underline-offset-4 cursor-pointer"
                >
                  管理渠道
                </button>
              </div>
              <PaperSelect
                v-model="newGearPaymentMethod"
                size="sm"
                :options="[
                  { value: '', label: '默认（设备购置）' },
                  ...paymentMethods.map((pm) => ({ value: pm, label: pm })),
                ]"
              />
            </div>
          </div>

          <div>
            <label class="block text-[11px] font-mono-archive text-[var(--ink-muted)] mb-1">规格型号</label>
            <input
              v-model="newGearSpec"
              type="text"
              class="w-full px-2.5 py-1.5 text-xs font-mono-archive bg-[var(--bg-archive)] border border-[var(--border-subtle)] rounded-xs outline-none"
            />
          </div>

          <div>
            <label class="block text-[11px] font-mono-archive text-[var(--ink-muted)] mb-1">体验随记</label>
            <input
              v-model="newGearNote"
              type="text"
              class="w-full px-2.5 py-1.5 text-xs font-mono-archive bg-[var(--bg-archive)] border border-[var(--border-subtle)] rounded-xs outline-none"
            />
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label class="block text-[11px] font-mono-archive text-[var(--ink-muted)] mb-1">购入金额 (¥)</label>
              <input
                v-model="newGearPrice"
                type="number"
                step="0.01"
                placeholder="0.00"
                class="w-full px-2.5 py-1.5 text-xs font-mono-archive bg-[var(--bg-archive)] border border-[var(--border-subtle)] rounded-xs outline-none"
              />
            </div>

            <div>
              <label class="block text-[11px] font-mono-archive text-[var(--ink-muted)] mb-1">购置日期</label>
              <PaperDatePicker
                v-model="newGearPurchaseDate"
                size="sm"
              />
            </div>
          </div>

          <div class="flex items-center gap-2 pt-1">
            <input
              id="syncBuyTx"
              v-model="syncBuyTransaction"
              type="checkbox"
              class="rounded-xs cursor-pointer accent-[var(--ink-primary)]"
            />
            <label for="syncBuyTx" class="text-xs font-mono-archive text-[var(--ink-secondary)] cursor-pointer select-none">
              同步在账本中生成一条支出账单（金额与购入日期对应）
            </label>
          </div>

          <div class="flex justify-end pt-2">
            <button
              @click="handleAddGear"
              :disabled="isAddingGear"
              type="button"
              class="px-4 py-1.5 text-xs font-mono-archive bg-[var(--ink-primary)] text-[var(--bg-archive)] rounded-xs cursor-pointer hover:opacity-90 disabled:opacity-50"
            >
              {{ isAddingGear ? '正在录入...' : '确认添入列表' }}
            </button>
          </div>
        </div>

        <!-- 设备列表渲染 -->
        <div class="divide-y divide-[var(--border-subtle)]/70 max-h-[46vh] overflow-y-auto pr-1">
          <div
            v-for="(item, idx) in (form.edc_gear || [])"
            :key="item.id || idx"
            class="py-3 space-y-2 group"
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
                    (购入 ¥{{ (item.price_cents / 100).toFixed(2) }})
                  </span>
                  <span v-if="item.sold_price_cents" class="text-[11px] font-mono-archive text-emerald-700">
                    (回血 ¥{{ ((item.sold_price_cents || 0) / 100).toFixed(2) }})
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
                  v-if="!isGearSold(item.status)"
                  @click="openSellDrawer(idx)"
                  type="button"
                  class="text-[11px] font-mono-archive px-2 py-0.5 border border-[var(--border-subtle)] hover:border-[var(--ink-primary)] rounded-xs cursor-pointer transition-colors"
                  :class="sellingGearIndex === idx ? 'bg-[var(--ink-primary)] text-[var(--bg-archive)]' : 'text-[var(--ink-secondary)] hover:text-[var(--ink-primary)]'"
                >
                  出二手回血
                </button>

                <button
                  @click="removeGear(idx)"
                  class="text-[var(--ink-muted)] hover:text-red-700 p-1 cursor-pointer opacity-70 group-hover:opacity-100 transition-opacity"
                  title="删除此项"
                >
                  <Trash2 class="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            <!-- 内联出二手回血纸卡确认面板 (RC-54，彻底替代原生 prompt/alert) -->
            <div
              v-if="sellingGearIndex === idx"
              class="p-3 bg-[var(--bg-subtle)] border border-[var(--border-subtle)] rounded-xs space-y-2.5 font-mono-archive text-xs animate-in fade-in duration-150"
            >
              <div class="flex items-center justify-between pb-1 border-b border-[var(--border-subtle)]/60">
                <span class="font-medium text-[var(--ink-primary)]">设备转让与出二手回血结算</span>
                <span class="text-[11px] text-[var(--ink-muted)]">《{{ item.name }}》</span>
              </div>

              <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label class="block text-[11px] text-[var(--ink-muted)] mb-1">回血金额 (¥) *</label>
                  <input
                    v-model="sellingPriceInput"
                    type="number"
                    step="0.01"
                    placeholder="0.00"
                    class="w-full px-2.5 py-1.5 text-xs bg-[var(--bg-archive)] border border-[var(--border-subtle)] focus:border-[var(--ink-primary)] rounded-xs outline-none"
                  />
                </div>
                <div>
                  <label class="block text-[11px] text-[var(--ink-muted)] mb-1">转让日期</label>
                  <PaperDatePicker
                    v-model="sellingDateInput"
                    size="sm"
                  />
                </div>
              </div>

              <div v-if="sellingErrorMsg" class="text-[11px] text-red-600">
                {{ sellingErrorMsg }}
              </div>

              <div class="flex items-center justify-end gap-2 pt-1">
                <button
                  @click="cancelSellDrawer"
                  type="button"
                  class="px-2.5 py-1 text-xs border border-[var(--border-subtle)] rounded-xs hover:border-[var(--ink-primary)] cursor-pointer text-[var(--ink-muted)] hover:text-[var(--ink-primary)] transition-colors"
                >
                  取消
                </button>
                <button
                  @click="confirmSellGear"
                  type="button"
                  :disabled="isSellingSubmitting"
                  class="px-3 py-1 text-xs bg-[var(--ink-primary)] text-[var(--bg-archive)] rounded-xs cursor-pointer hover:opacity-90 transition-opacity"
                >
                  {{ isSellingSubmitting ? '正在结算...' : '确认回血并生成收入账单' }}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- 底部控制栏 -->
      <div v-if="saveError" class="text-xs font-mono-archive text-red-600">
        {{ saveError }}
      </div>
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
            @click="emit('close')"
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
            <Loader2 v-if="isSaving" class="w-3.5 h-3.5 animate-spin" />
            <Check v-else class="w-3.5 h-3.5" />
            <span>{{ isSaving ? '保存与同步中...' : '保存资料' }}</span>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
