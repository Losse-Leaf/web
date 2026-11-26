<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { X, Check } from 'lucide-vue-next'
import ImageUploader from './ImageUploader.vue'
import PaperDatePicker from './PaperDatePicker.vue'
import PrivacyToggle from './PrivacyToggle.vue'
import EntryCategoryPicker from './EntryCategoryPicker.vue'
import EntryTransactionForm from './entry/EntryTransactionForm.vue'
import EntryWishForm from './entry/EntryWishForm.vue'
import {
  createLifeEntry,
  createTransaction,
  createWish,
  fetchEntryById,
  fetchWishes,
  fetchCreditChannels,
  getAdminToken,
} from '../utils/api'
import { useCategories } from '../composables/useCategories'
import {
  centsToInputYuan,
  getBeijingDateTimeString,
  getBeijingISOString,
  parseYuanToCents,
} from '../utils/format'
import {
  normalizeEntryCategory,
  type EntryGalleryCategory,
  type LifeEntry,
  type Transaction,
  type Wish,
  type CreditChannel,
} from '../types'
import { useBodyScrollLock } from '../composables/useBodyScrollLock'
import { useEscapeClose } from '../composables/useEscapeClose'

export type EntryKind = 'life' | 'wish' | 'transaction'

const props = defineProps<{
  isOpen: boolean
  initialKind?: EntryKind | string
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'entryCreated', entry: LifeEntry): void
  (e: 'transactionCreated', tx: Transaction): void
  (e: 'wishCreated', wish: Wish): void
  (e: 'requestAuth'): void
}>()

const {
  expenseCategories,
  incomeCategories,
  paymentMethods,
  loadCategories,
} = useCategories()

const selectedKind = ref<EntryKind>('life')
const isSubmitting = ref(false)
const errorMsg = ref<string | null>(null)

// 基础表单状态
const entryCategory = ref<EntryGalleryCategory>('')
const title = ref('')
const content = ref('')
const location = ref('')
const occurredAt = ref(getBeijingDateTimeString())
const isPrivate = ref(false)
const attachmentIds = ref<number[]>([])
const userEditedTime = ref(false)
const userEditedLocation = ref(false)

const handleExifExtracted = (meta: { occurredAt?: string; location?: string }) => {
  if (meta.occurredAt && !userEditedTime.value) {
    occurredAt.value = meta.occurredAt
  }
  if (meta.location && (!userEditedLocation.value || !location.value.trim())) {
    location.value = meta.location
  }
}

const imageUploaderRef = ref<InstanceType<typeof ImageUploader> | null>(null)
const wishFormRef = ref<InstanceType<typeof EntryWishForm> | null>(null)

const getActiveUploader = () => {
  if (selectedKind.value === 'wish') return wishFormRef.value
  return imageUploaderRef.value
}

// 自动草稿持久化 (looseleaf_entry_draft_v1)
const DRAFT_STORAGE_KEY = 'looseleaf_entry_draft_v1'
const hasRestoredDraft = ref(false)
let isResettingForm = false

interface EntryDraftPayload {
  title: string
  content: string
  location: string
  entryType: EntryKind
  category?: EntryGalleryCategory
}

const saveDraftToStorage = () => {
  if (!props.isOpen || isResettingForm) return
  if (selectedKind.value === 'transaction') return
  const hasContent = Boolean(title.value.trim() || content.value.trim())
  if (!hasContent) return
  const draft: EntryDraftPayload = {
    title: title.value,
    content: content.value,
    location: location.value,
    entryType: selectedKind.value,
    category: selectedKind.value === 'life' ? entryCategory.value : '',
  }
  try {
    localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(draft))
  } catch {}
}

const restoreDraftFromStorage = (): boolean => {
  try {
    const raw = localStorage.getItem(DRAFT_STORAGE_KEY)
    if (!raw) return false
    const parsed = JSON.parse(raw) as Partial<EntryDraftPayload>
    if (!parsed || (!parsed.title?.trim() && !parsed.content?.trim())) {
      return false
    }
    isResettingForm = true
    if (parsed.entryType && !props.initialKind) {
      selectedKind.value = normalizeKind(parsed.entryType)
    }
    entryCategory.value = normalizeEntryCategory(parsed.category)
    title.value = parsed.title || ''
    content.value = parsed.content || ''
    if (parsed.location) location.value = parsed.location
    hasRestoredDraft.value = true
    isResettingForm = false
    return true
  } catch {
    isResettingForm = false
    return false
  }
}

const clearSavedDraft = (resetFields = false) => {
  try {
    localStorage.removeItem(DRAFT_STORAGE_KEY)
  } catch {}
  hasRestoredDraft.value = false
  if (resetFields) {
    isResettingForm = true
    entryCategory.value = ''
    title.value = ''
    content.value = ''
    isResettingForm = false
  }
}

const handleModalPaste = (e: ClipboardEvent) => {
  if (e.defaultPrevented || selectedKind.value === 'transaction') return
  const clipboardItems = e.clipboardData?.items
  if (!clipboardItems) return
  const imageFiles: File[] = []
  for (let i = 0; i < clipboardItems.length; i++) {
    const item = clipboardItems[i]
    if (item.type.startsWith('image/')) {
      const f = item.getAsFile()
      if (f) imageFiles.push(f)
    }
  }
  const uploader = getActiveUploader()
  if (imageFiles.length > 0 && uploader) {
    e.preventDefault()
    uploader.uploadFiles(imageFiles)
  }
}

// 心愿模式状态
const wishKind = ref<'item' | 'travel' | 'milestone'>('item')
const wishBudgetYuan = ref('')
const wishSpec = ref('')
const wishTargetDate = ref('')

// 账目模式状态
const txAmount = ref<string>('')
const txType = ref<'expense' | 'income'>('expense')
const txCategory = ref<string>('餐饮')
const txPaymentMethod = ref<string>('')
const txNote = ref<string>('')

// 关联数据
const availableWishes = ref<Wish[]>([])
const creditChannels = ref<CreditChannel[]>([])
const selectedWishId = ref<number | null>(null)
const isInstallment = ref(false)
const installmentChannel = ref('huabei')
const installmentMonths = ref(12)

watch(txType, (newType) => {
  if (newType === 'income' && !incomeCategories.value.includes(txCategory.value)) {
    txCategory.value = incomeCategories.value[0] || '工资收入'
  } else if (newType === 'expense' && !expenseCategories.value.includes(txCategory.value)) {
    txCategory.value = expenseCategories.value[0] || '餐饮'
  }
  if (newType === 'income') {
    selectedWishId.value = null
    isInstallment.value = false
  }
})

const kindOptions: { key: EntryKind; label: string; desc: string }[] = [
  { key: 'life', label: '日常', desc: '身边小事、随笔思考与定格光影' },
  { key: 'wish', label: '心愿', desc: '许下好物、远方旅程或阶段里程碑心愿' },
  { key: 'transaction', label: '账目', desc: '记录日常收支与信贷分期' },
]

function normalizeKind(raw?: string): EntryKind {
  if (!raw) return 'life'
  if (raw === 'wish') return 'wish'
  if (raw === 'transaction') return 'transaction'
  return 'life'
}

const loadAvailableWishes = async () => {
  try {
    availableWishes.value = await fetchWishes({ status: 'wanting' })
  } catch (err) {
    console.error('Failed to load available wishes:', err)
    availableWishes.value = []
  }
}

const loadCreditChannelsList = async () => {
  if (!getAdminToken()) return
  try {
    const list = await fetchCreditChannels()
    if (Array.isArray(list) && list.length > 0) {
      creditChannels.value = list
      if (!list.some((c) => c.code === installmentChannel.value)) {
        installmentChannel.value = list[0].code
      }
    }
  } catch (err) {
    console.warn('Failed to load credit channels list:', err)
  }
}

watch(
  [() => props.isOpen, () => props.initialKind],
  ([open, initKind]) => {
    if (open) {
      loadCategories()
      loadAvailableWishes()
      loadCreditChannelsList()
      selectedKind.value = normalizeKind(initKind)
      hasRestoredDraft.value = false
      restoreDraftFromStorage()
      errorMsg.value = null
    }
  },
  { immediate: true },
)

let draftSaveTimer: number | null = null
const scheduleSaveDraft = () => {
  if (draftSaveTimer !== null) {
    window.clearTimeout(draftSaveTimer)
  }
  draftSaveTimer = window.setTimeout(() => {
    draftSaveTimer = null
    saveDraftToStorage()
  }, 250)
}

watch(
  [title, content, location, selectedKind, entryCategory],
  () => {
    scheduleSaveDraft()
  },
)

const onWishSelected = () => {
  if (!selectedWishId.value) return
  const wish = availableWishes.value.find((w) => w.id === selectedWishId.value)
  if (wish) {
    if (!title.value.trim()) {
      title.value = wish.title
    }
    if (!txAmount.value && wish.budget > 0) {
      txAmount.value = centsToInputYuan(wish.budget)
    }
    if (txCategory.value === '餐饮') {
      txCategory.value = '购物'
    }
  }
}

const effectiveRepaymentDay = computed(() => {
  const matched = creditChannels.value.find((c) => c.code === installmentChannel.value)
  return matched && matched.repayment_day > 0 ? matched.repayment_day : 10
})

const selectKind = (k: EntryKind) => {
  if (selectedKind.value === k) return
  if (k !== 'transaction') {
    selectedWishId.value = null
  }
  attachmentIds.value = []
  selectedKind.value = k
  errorMsg.value = null
}

const resetForm = () => {
  isResettingForm = true
  selectedKind.value = normalizeKind(props.initialKind)
  entryCategory.value = ''
  title.value = ''
  content.value = ''
  location.value = ''
  occurredAt.value = getBeijingDateTimeString()
  attachmentIds.value = []
  userEditedTime.value = false
  userEditedLocation.value = false
  isPrivate.value = false
  txAmount.value = ''
  txType.value = 'expense'
  txCategory.value = expenseCategories.value[0] || '餐饮'
  txPaymentMethod.value = paymentMethods.value[0] || ''
  txNote.value = ''
  selectedWishId.value = null
  isInstallment.value = false
  installmentChannel.value = creditChannels.value[0]?.code || 'huabei'
  installmentMonths.value = 12
  wishKind.value = 'item'
  wishBudgetYuan.value = ''
  wishSpec.value = ''
  wishTargetDate.value = ''
  errorMsg.value = null
  isSubmitting.value = false
  isResettingForm = false
}

const forceClose = () => {
  resetForm()
  emit('close')
}

const handleClose = () => {
  if (isSubmitting.value) return
  forceClose()
}

useBodyScrollLock(() => props.isOpen)
useEscapeClose(() => props.isOpen, handleClose)

const currentKindMeta = computed(() => {
  return kindOptions.find((o) => o.key === selectedKind.value) || kindOptions[0]
})

const handleSubmit = async () => {
  if (isSubmitting.value) return
  errorMsg.value = null

  if (!getAdminToken()) {
    emit('requestAuth')
    return
  }

  // 1. 提交账目 (Transaction)
  if (selectedKind.value === 'transaction') {
    const parsedAmt = parseYuanToCents(txAmount.value, { fieldLabel: '金额' })
    if (!parsedAmt.ok) {
      errorMsg.value = parsedAmt.error
      return
    }
    const amountInCents = parsedAmt.cents
    const repaymentDay = effectiveRepaymentDay.value
    const useInstallment = txType.value === 'expense' && isInstallment.value
    const installmentPay = useInstallment
      ? Math.floor(amountInCents / (installmentMonths.value || 1))
      : undefined

    const matchedChannel = creditChannels.value.find(
      (c) => c.code === installmentChannel.value,
    )
    const channelLabel = matchedChannel?.name || installmentChannel.value

    let noteText = txNote.value.trim()
    if (useInstallment && !noteText.includes('期')) {
      const monthlyYuan = ((installmentPay || 0) / 100).toFixed(2)
      const installmentTag = `[${channelLabel} ${installmentMonths.value}期 · 每月${repaymentDay}日还款 · 每期¥${monthlyYuan}]`
      noteText = noteText ? `${noteText} ${installmentTag}` : installmentTag
    }

    try {
      isSubmitting.value = true
      const createdTx = await createTransaction({
        amount: amountInCents,
        type: txType.value,
        category: txCategory.value,
        title: title.value.trim() || txCategory.value,
        note: noteText,
        payment_method: useInstallment ? undefined : txPaymentMethod.value,
        occurred_at: getBeijingISOString(occurredAt.value),
        wish_id: selectedWishId.value || undefined,
        is_installment: useInstallment,
        installment_channel_code: useInstallment ? installmentChannel.value : undefined,
        installment_total_amount: useInstallment ? amountInCents : undefined,
        installment_months: useInstallment ? installmentMonths.value : undefined,
        installment_monthly_pay: useInstallment ? installmentPay : undefined,
        installment_remain_months: useInstallment ? installmentMonths.value : undefined,
        repayment_day: useInstallment ? repaymentDay : undefined,
      })

      emit('transactionCreated', createdTx)
      forceClose()
    } catch (err: any) {
      errorMsg.value = err.message || '记账失败'
    } finally {
      isSubmitting.value = false
    }
    return
  }

  // 2. 提交心愿 (Wish)
  if (selectedKind.value === 'wish') {
    if (!title.value.trim()) {
      errorMsg.value = '请填写心愿名称'
      return
    }
    const parsedBudget = parseYuanToCents(wishBudgetYuan.value, {
      allowEmpty: true,
      allowZero: true,
      fieldLabel: '预估预算',
    })
    if (!parsedBudget.ok) {
      errorMsg.value = parsedBudget.error
      return
    }

    try {
      isSubmitting.value = true
      const createdWish = await createWish({
        title: title.value.trim(),
        kind: wishKind.value,
        note: content.value.trim(),
        spec: wishKind.value === 'item' ? wishSpec.value.trim() || undefined : undefined,
        budget: parsedBudget.cents,
        target_date: wishTargetDate.value || undefined,
        attachment_ids: attachmentIds.value.length > 0 ? attachmentIds.value : undefined,
        is_private: isPrivate.value,
      })

      if (createdWish.life_entry_id) {
        try {
          const companionEntry = await fetchEntryById(createdWish.life_entry_id)
          emit('entryCreated', companionEntry)
        } catch {}
      }

      wishFormRef.value?.markCommitted()
      clearSavedDraft()
      emit('wishCreated', createdWish)
      forceClose()
    } catch (err: any) {
      errorMsg.value = err.message || '创建心愿失败'
    } finally {
      isSubmitting.value = false
    }
    return
  }

  // 3. 提交日常 (life)：标题、正文或照片三者至少有一项即可（支持纯图留白）
  if (!title.value.trim() && !content.value.trim() && attachmentIds.value.length === 0) {
    errorMsg.value = '请填写记录内容、标题或上传至少一张照片'
    return
  }

  try {
    isSubmitting.value = true
    const created = await createLifeEntry({
      type: 'life',
      category: entryCategory.value,
      title: title.value.trim(),
      content: content.value.trim(),
      occurred_at: getBeijingISOString(occurredAt.value),
      location: location.value.trim(),
      attachment_ids: attachmentIds.value,
      is_private: isPrivate.value,
    })

    imageUploaderRef.value?.markCommitted()
    clearSavedDraft()
    emit('entryCreated', created)
    forceClose()
  } catch (err: any) {
    errorMsg.value = err.message || '保存失败'
  } finally {
    isSubmitting.value = false
  }
}
</script>

<template>
  <div
    v-if="isOpen"
    role="dialog"
    aria-modal="true"
    aria-label="记录生活档案"
    class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs animate-in fade-in duration-200"
    @click.self="handleClose"
  >
    <div
      class="bg-[var(--bg-archive)] border border-[var(--border-subtle)] shadow-[0_16px_50px_rgba(0,0,0,0.12)] w-full max-w-xl max-h-[88dvh] sm:max-h-[90vh] overflow-y-auto rounded-xs p-4 sm:p-8 text-left transition-all duration-200 relative pb-[max(1.5rem,env(safe-area-inset-bottom,1.5rem))]"
      @paste="handleModalPaste"
    >
      <!-- 顶部轻量标头 -->
      <div class="flex items-center justify-between pb-4 border-b border-[var(--border-subtle)] mb-5">
        <div>
          <div class="flex flex-wrap items-center gap-2.5">
            <h2 class="font-serif-editorial text-xl sm:text-2xl font-medium tracking-tight text-[var(--ink-primary)]">
              记录 · {{ currentKindMeta.label }}
            </h2>
            <span
              v-if="hasRestoredDraft"
              class="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-xs border border-[var(--accent-warm)]/40 bg-[var(--accent-warm)]/8 text-[11px] font-mono-archive text-[var(--accent-warm)]"
            >
              <span>已恢复未发手稿 ·</span>
              <button
                type="button"
                @click="clearSavedDraft(true)"
                class="underline underline-offset-2 hover:text-[var(--ink-primary)] cursor-pointer"
              >
                [清空草稿]
              </button>
            </span>
          </div>
          <p class="font-mono-archive text-[11px] text-[var(--ink-muted)] mt-0.5">
            {{ currentKindMeta.desc }}
          </p>
        </div>

        <button
          type="button"
          @click="handleClose"
          :disabled="isSubmitting"
          class="p-1 text-[var(--ink-muted)] hover:text-[var(--ink-primary)] cursor-pointer transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          title="关闭"
        >
          <X class="w-5 h-5" />
        </button>
      </div>

      <!-- 顶部一步式形态切换栏 (日常 / 心愿 / 账目) -->
      <div class="grid grid-cols-3 gap-1.5 p-1 bg-[var(--bg-subtle)]/60 border border-[var(--border-subtle)] rounded-xs mb-6">
        <button
          v-for="opt in kindOptions"
          :key="opt.key"
          type="button"
          @click="selectKind(opt.key)"
          class="py-1.5 px-2 text-xs font-serif-editorial rounded-xs transition-all cursor-pointer text-center truncate"
          :class="
            selectedKind === opt.key
              ? 'bg-[var(--ink-primary)] text-[var(--bg-archive)] font-medium shadow-2xs'
              : 'text-[var(--ink-secondary)] hover:text-[var(--ink-primary)]'
          "
        >
          {{ opt.label }}
        </button>
      </div>

      <!-- 统一发布表单 -->
      <form @submit.prevent="handleSubmit" class="space-y-5">
        <!-- 分支 A：账目 -->
        <EntryTransactionForm
          v-if="selectedKind === 'transaction'"
          v-model:txAmount="txAmount"
          v-model:txType="txType"
          v-model:txCategory="txCategory"
          v-model:title="title"
          v-model:txPaymentMethod="txPaymentMethod"
          v-model:txNote="txNote"
          v-model:selectedWishId="selectedWishId"
          v-model:isInstallment="isInstallment"
          v-model:installmentChannel="installmentChannel"
          v-model:installmentMonths="installmentMonths"
          v-model:occurredAt="occurredAt"
          :availableWishes="availableWishes"
          :creditChannels="creditChannels"
          :effectiveRepaymentDay="effectiveRepaymentDay"
          @wishSelected="onWishSelected"
        />

        <!-- 分支 B：心愿 -->
        <EntryWishForm
          v-else-if="selectedKind === 'wish'"
          ref="wishFormRef"
          v-model:wishKind="wishKind"
          v-model:title="title"
          v-model:wishBudgetYuan="wishBudgetYuan"
          v-model:wishSpec="wishSpec"
          v-model:wishTargetDate="wishTargetDate"
          v-model:content="content"
          @update:attachmentIds="attachmentIds = $event"
        />

        <!-- 分支 C：日常 (life) -->
        <template v-else>
          <EntryCategoryPicker v-model="entryCategory" />

          <div class="space-y-1.5">
            <label class="block text-xs font-mono-archive text-[var(--ink-muted)]">
              标题
            </label>
            <input
              v-model="title"
              type="text"
              class="w-full px-3 py-2 text-base font-serif-editorial bg-transparent border border-[var(--border-subtle)] focus:border-[var(--ink-primary)] rounded-xs outline-none"
            />
          </div>

          <div class="space-y-1.5">
            <label class="block text-xs font-mono-archive text-[var(--ink-muted)]">
              记录内容
            </label>
            <textarea
              v-model="content"
              rows="5"
              class="w-full px-3 py-2 text-base font-serif-editorial leading-relaxed bg-transparent border border-[var(--border-subtle)] focus:border-[var(--ink-primary)] rounded-xs outline-none resize-none"
            ></textarea>
          </div>

          <ImageUploader
            ref="imageUploaderRef"
            @update:attachments="attachmentIds = $event"
            @exifExtracted="handleExifExtracted"
          />

          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div class="space-y-1.5">
              <label class="block text-xs font-mono-archive text-[var(--ink-muted)]">发生时间</label>
              <PaperDatePicker
                :modelValue="occurredAt"
                enableTime
                @update:modelValue="occurredAt = $event; userEditedTime = true"
              />
            </div>

            <div class="space-y-1.5">
              <label class="block text-xs font-mono-archive text-[var(--ink-muted)]">
                地点
              </label>
              <input
                v-model="location"
                @input="userEditedLocation = Boolean(location.trim())"
                type="text"
                class="w-full px-3 py-2 text-xs font-serif-editorial bg-transparent border border-[var(--border-subtle)] focus:border-[var(--ink-primary)] rounded-xs outline-none"
              />
            </div>
          </div>
        </template>

        <PrivacyToggle
          v-if="selectedKind !== 'transaction'"
          v-model="isPrivate"
        />

        <!-- 底部错误提示与操作按钮 -->
        <div class="min-h-[44px] flex items-center" role="alert" aria-live="polite">
          <div v-if="errorMsg" class="w-full p-3 bg-red-50 text-red-700 text-xs rounded-xs border border-red-200 truncate">
            {{ errorMsg }}
          </div>
        </div>
        <div class="pt-5 border-t border-[var(--border-subtle)] flex items-center justify-end gap-3">
          <button
            type="button"
            @click="handleClose"
            :disabled="isSubmitting"
            class="px-4 py-2 text-xs font-mono-archive text-[var(--ink-muted)] hover:text-[var(--ink-primary)] transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          >
            取消
          </button>
          <button
            type="submit"
            :disabled="isSubmitting"
            class="px-5 py-2 text-xs font-mono-archive bg-[var(--ink-primary)] text-[var(--bg-archive)] hover:opacity-90 rounded-xs transition-opacity cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
          >
            <span class="w-3.5 h-3.5 inline-flex items-center justify-center shrink-0">
              <Check v-if="!isSubmitting" class="w-3.5 h-3.5" />
            </span>
            <span class="min-w-[7em] text-center">{{ isSubmitting ? '保存中...' : '记录到生活档案' }}</span>
          </button>
        </div>
      </form>
    </div>
  </div>
</template>
