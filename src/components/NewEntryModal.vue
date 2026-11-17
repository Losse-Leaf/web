<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { X, Check } from 'lucide-vue-next'
import ImageUploader from './ImageUploader.vue'
import PaperSelect from './PaperSelect.vue'
import PaperDatePicker from './PaperDatePicker.vue'
import CityPicker from './CityPicker.vue'
import PrivacyToggle from './PrivacyToggle.vue'
import EntryTransactionForm from './entry/EntryTransactionForm.vue'
import EntryProjectForm from './entry/EntryProjectForm.vue'
import EntryWishForm from './entry/EntryWishForm.vue'
import {
  matchCityFromLocation,
  getFallbackDefaultCity,
  resolveDefaultCity,
  saveLastUsedCity,
} from '../utils/cities'
import {
  createLifeEntry,
  createTransaction,
  createProject,
  createWish,
  fetchEntryById,
  fetchWishes,
  fetchFootprints,
  fetchCreditChannels,
  getAdminToken,
} from '../utils/api'
import { useCategories } from '../composables/useCategories'
import {
  centsToInputYuan,
  getBeijingDateTimeString,
  getBeijingISOString,
  parseOccurredDate,
  parseYuanToCents,
} from '../utils/format'
import type { LifeEntry, Transaction, Project, Wish, CreditChannel, Footprint } from '../types'
import { useBodyScrollLock } from '../composables/useBodyScrollLock'
import { useEscapeClose } from '../composables/useEscapeClose'

export type EntryKind = 'life' | 'travel' | 'project' | 'wish' | 'transaction'

const props = defineProps<{
  isOpen: boolean
  projects?: Project[]
  initialKind?: EntryKind | string
  initialProjectId?: number | null
  initialCityCode?: string
  initialCityName?: string
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'entryCreated', entry: LifeEntry): void
  (e: 'transactionCreated', tx: Transaction): void
  (e: 'projectCreated', proj: Project): void
  (e: 'wishCreated', wish: Wish): void
  (e: 'requestAuth'): void
}>()

const {
  expenseCategories,
  incomeCategories,
  gearCategories,
  paymentMethods,
  projectCategories,
  loadCategories,
} = useCategories()

const selectedKind = ref<EntryKind>('life')
const isSubmitting = ref(false)
const errorMsg = ref<string | null>(null)

// 基础表单状态
const title = ref('')
const content = ref('')
const location = ref('')
const selectedCityCode = ref('')
const selectedCityName = ref('')
const userManuallyChangedCity = ref(false)
const occurredAt = ref(getBeijingDateTimeString())
const selectedProjectId = ref<number | null>(null)
const selectedFootprintId = ref<number | null>(null)
const isPrivate = ref(false)
const attachmentIds = ref<number[]>([])

const imageUploaderRef = ref<InstanceType<typeof ImageUploader> | null>(null)
const projectFormRef = ref<InstanceType<typeof EntryProjectForm> | null>(null)
const wishFormRef = ref<InstanceType<typeof EntryWishForm> | null>(null)

const getActiveUploader = () => {
  if (selectedKind.value === 'project') return projectFormRef.value
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
  city_code: string
  city_name: string
  entryType: EntryKind
  projectId: number | null
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
    city_code: selectedCityCode.value,
    city_name: selectedCityName.value,
    entryType: selectedKind.value,
    projectId: selectedProjectId.value,
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
    title.value = parsed.title || ''
    content.value = parsed.content || ''
    if (parsed.location) location.value = parsed.location
    if (parsed.city_code) {
      selectedCityCode.value = parsed.city_code
      userManuallyChangedCity.value = true
    }
    if (parsed.city_name) {
      selectedCityName.value = parsed.city_name
    }
    if (parsed.projectId !== undefined && selectedKind.value === 'project' && !props.initialProjectId) {
      selectedProjectId.value = parsed.projectId
    }
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

// 造物项目模式
const projectMode = ref<'new' | 'entry'>('new')
const projTitle = ref('')
const projSubtitle = ref('')
const projCategory = ref('开源项目')
const projStatus = ref('进行中')
const projDescription = ref('')
const projStory = ref('')
const projGithubUrl = ref('')

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
const syncToGear = ref(false)
const gearCategory = ref('数码器材')
const gearSpec = ref('')

// 关联数据
const availableWishes = ref<Wish[]>([])
const availableFootprints = ref<Footprint[]>([])
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
    selectedFootprintId.value = null
    isInstallment.value = false
  }
})

const kindOptions: { key: EntryKind; label: string; desc: string }[] = [
  { key: 'life', label: '日常', desc: '身边小事、随笔思考与定格光影' },
  { key: 'travel', label: '游历', desc: '山川行迹与漫游记忆，自动点亮或归并足迹图谱' },
  { key: 'project', label: '造物', desc: '立项新造物或为进行中的项目撰写进展手记' },
  { key: 'wish', label: '心愿', desc: '许下好物、远方旅程或阶段里程碑心愿' },
  { key: 'transaction', label: '账目', desc: '记录日常收支、旅行花销、信贷分期或固定资产' },
]

function normalizeKind(raw?: string): EntryKind {
  if (!raw) return 'life'
  if (raw === 'travel') return 'travel'
  if (raw === 'project') return 'project'
  if (raw === 'wish') return 'wish'
  if (raw === 'transaction') return 'transaction'
  return 'life'
}

const applyDefaultCity = () => {
  if (props.initialCityCode && props.initialCityName) {
    userManuallyChangedCity.value = true
    selectedCityCode.value = props.initialCityCode
    selectedCityName.value = props.initialCityName
    if (!location.value.trim()) {
      location.value = props.initialCityName
    }
    return
  }
  userManuallyChangedCity.value = false
  const fallback = getFallbackDefaultCity()
  if (fallback) {
    selectedCityCode.value = fallback.code
    selectedCityName.value = fallback.name
    if (!location.value.trim()) {
      location.value = fallback.name
    }
  } else {
    selectedCityCode.value = ''
    selectedCityName.value = ''
  }

  resolveDefaultCity().then((resolved) => {
    if (!userManuallyChangedCity.value && resolved) {
      const prevName = selectedCityName.value
      selectedCityCode.value = resolved.code
      selectedCityName.value = resolved.name
      if (!location.value.trim() || location.value.trim() === prevName) {
        location.value = resolved.name
      }
    }
  })
}

const loadAvailableWishes = async () => {
  try {
    availableWishes.value = await fetchWishes({ status: 'wanting' })
  } catch (err) {
    console.error('Failed to load available wishes:', err)
    availableWishes.value = []
  }
}

const loadAvailableFootprints = async () => {
  try {
    const list = await fetchFootprints()
    availableFootprints.value = Array.isArray(list) ? list.slice(0, 30) : []
  } catch (err) {
    console.warn('Failed to load available footprints:', err)
    availableFootprints.value = []
  }
}

const formatFootprintOptionLabel = (fp: Footprint) => {
  const startStr = fp.visited_at ? parseOccurredDate(fp.visited_at).dateKey : ''
  const endStr = fp.departed_at ? parseOccurredDate(fp.departed_at).dateKey : ''
  const datePart = endStr && endStr !== startStr ? `${startStr} ~ ${endStr}` : startStr
  const tripTitle = fp.title || (fp.note ? fp.note.slice(0, 16) : '旅程打卡')
  return `${fp.city_name} · ${tripTitle} (${datePart})`
}

const onFootprintSelected = () => {
  if (!selectedFootprintId.value) return
  const fp = availableFootprints.value.find((f) => f.id === selectedFootprintId.value)
  if (fp) {
    userManuallyChangedCity.value = true
    selectedCityCode.value = fp.city_code
    selectedCityName.value = fp.city_name
    if (!location.value.trim()) {
      location.value = fp.city_name
    }
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
  [() => props.isOpen, () => props.initialKind, () => props.initialProjectId],
  ([open, initKind, initProjId]) => {
    if (open) {
      loadCategories()
      loadAvailableWishes()
      loadAvailableFootprints()
      loadCreditChannelsList()
      applyDefaultCity()
      selectedKind.value = normalizeKind(initKind)
      if (initProjId) {
        selectedKind.value = 'project'
        projectMode.value = 'entry'
        selectedProjectId.value = initProjId
      } else if (props.projects && props.projects.length > 0 && selectedKind.value === 'project') {
        projectMode.value = 'entry'
        selectedProjectId.value = props.projects[0].id
      } else if (props.projects && props.projects.length > 0) {
        projectMode.value = 'entry'
        selectedProjectId.value = null
      } else {
        projectMode.value = 'new'
        selectedProjectId.value = null
      }
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
  [title, content, location, selectedCityCode, selectedCityName, selectedKind, selectedProjectId],
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

watch(selectedWishId, (val) => {
  if (val && selectedFootprintId.value) {
    selectedFootprintId.value = null
  }
})

watch(selectedFootprintId, (val) => {
  if (val && selectedWishId.value) {
    selectedWishId.value = null
  }
})

const effectiveRepaymentDay = computed(() => {
  const matched = creditChannels.value.find((c) => c.code === installmentChannel.value)
  return matched && matched.repayment_day > 0 ? matched.repayment_day : 10
})

const selectKind = (k: EntryKind) => {
  if (selectedKind.value === k) return
  if (k !== 'transaction') {
    selectedWishId.value = null
  }
  if (k !== 'travel' && k !== 'transaction') {
    selectedFootprintId.value = null
  }
  if (k === 'project') {
    projectMode.value = props.projects && props.projects.length > 0 ? 'entry' : 'new'
    if (!selectedProjectId.value && props.projects && props.projects.length > 0) {
      selectedProjectId.value = props.projects[0].id
    }
  } else if (selectedKind.value === 'project' && !props.initialProjectId) {
    selectedProjectId.value = null
  }
  attachmentIds.value = []
  selectedKind.value = k
  errorMsg.value = null
}

const handleEntryCitySelect = (city: { code: string; name: string }) => {
  userManuallyChangedCity.value = true
  const prevName = selectedCityName.value
  selectedCityCode.value = city.code
  selectedCityName.value = city.name
  if (city.name && (!location.value.trim() || location.value.trim() === prevName)) {
    location.value = city.name
  }
  if (city.code && city.name) {
    saveLastUsedCity(city)
  }
}

const resetForm = () => {
  isResettingForm = true
  selectedKind.value = normalizeKind(props.initialKind)
  title.value = ''
  content.value = ''
  if (props.initialCityCode && props.initialCityName) {
    userManuallyChangedCity.value = true
    selectedCityCode.value = props.initialCityCode
    selectedCityName.value = props.initialCityName
    location.value = props.initialCityName
  } else {
    location.value = ''
    selectedCityCode.value = ''
    selectedCityName.value = ''
  }
  occurredAt.value = getBeijingDateTimeString()
  selectedFootprintId.value = null
  projectMode.value = props.initialProjectId || (props.projects && props.projects.length > 0) ? 'entry' : 'new'
  selectedProjectId.value =
    props.initialProjectId ||
    (selectedKind.value === 'project' && props.projects?.length ? props.projects[0].id : null)
  attachmentIds.value = []
  isPrivate.value = false
  txAmount.value = ''
  txType.value = 'expense'
  txCategory.value = expenseCategories.value[0] || '餐饮'
  txPaymentMethod.value = paymentMethods.value[0] || ''
  txNote.value = ''
  syncToGear.value = false
  gearCategory.value = gearCategories.value[0] || '数码器材'
  gearSpec.value = ''
  selectedWishId.value = null
  isInstallment.value = false
  installmentChannel.value = creditChannels.value[0]?.code || 'huabei'
  installmentMonths.value = 12
  projTitle.value = ''
  projSubtitle.value = ''
  projCategory.value = projectCategories.value[0] || '开源项目'
  projStatus.value = '进行中'
  projDescription.value = ''
  projStory.value = ''
  projGithubUrl.value = ''
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
        footprint_id: selectedFootprintId.value || undefined,
        city_code: selectedCityCode.value || undefined,
        is_installment: useInstallment,
        installment_channel_code: useInstallment ? installmentChannel.value : undefined,
        installment_total_amount: useInstallment ? amountInCents : undefined,
        installment_months: useInstallment ? installmentMonths.value : undefined,
        installment_monthly_pay: useInstallment ? installmentPay : undefined,
        installment_remain_months: useInstallment ? installmentMonths.value : undefined,
        repayment_day: useInstallment ? repaymentDay : undefined,
        link_gear_asset: txType.value === 'expense' && syncToGear.value,
        gear_category:
          txType.value === 'expense' && syncToGear.value ? gearCategory.value : undefined,
        gear_spec:
          txType.value === 'expense' && syncToGear.value
            ? gearSpec.value.trim() || undefined
            : undefined,
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
    if (wishKind.value === 'travel' && !selectedCityCode.value) {
      errorMsg.value = '旅程心愿请选择目的地城市'
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
        city_code: wishKind.value === 'travel' ? selectedCityCode.value || undefined : undefined,
        city_name: wishKind.value === 'travel' ? selectedCityName.value || undefined : undefined,
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

  // 3. 提交造物 (Project)
  if (selectedKind.value === 'project') {
    if (projectMode.value === 'new') {
      if (!projTitle.value.trim()) {
        errorMsg.value = '造物项目名称不能为空'
        return
      }
      try {
        isSubmitting.value = true
        const createdProj = await createProject({
          title: projTitle.value.trim(),
          subtitle: projSubtitle.value.trim(),
          category: projCategory.value.trim() || '开源项目',
          status: projStatus.value || '进行中',
          description: projDescription.value.trim(),
          story: projStory.value.trim(),
          github_url: projGithubUrl.value.trim(),
          is_private: isPrivate.value,
        })

        let createdEntry: LifeEntry | null = null
        if (attachmentIds.value.length > 0) {
          createdEntry = await createLifeEntry({
            type: 'project',
            title: projTitle.value.trim(),
            content:
              projDescription.value.trim() ||
              projStory.value.trim() ||
              `立项开启造物项目「${projTitle.value.trim()}」。`,
            occurred_at: occurredAt.value,
            project_id: createdProj.id,
            attachment_ids: attachmentIds.value,
            is_private: isPrivate.value,
          })
        }

        projectFormRef.value?.markCommitted()
        clearSavedDraft()
        emit('projectCreated', createdProj)
        if (createdEntry) {
          emit('entryCreated', createdEntry)
        }
        forceClose()
      } catch (err: any) {
        errorMsg.value = err.message || '创建造物项目失败'
      } finally {
        isSubmitting.value = false
      }
      return
    } else {
      if (!selectedProjectId.value) {
        errorMsg.value = '请选择关联的造物项目'
        return
      }
      if (!content.value.trim() && attachmentIds.value.length === 0) {
        errorMsg.value = '请填写造物手记内容或上传照片'
        return
      }
      const targetProj = props.projects?.find((p) => p.id === selectedProjectId.value)
      const defaultTitle = targetProj ? `${targetProj.title} · 造物手记` : '造物手记'
      try {
        isSubmitting.value = true
        const createdEntry = await createLifeEntry({
          type: 'project',
          title: title.value.trim() || defaultTitle,
          content: content.value.trim() || '记录造物阶段性进展。',
          occurred_at: occurredAt.value,
          project_id: selectedProjectId.value,
          attachment_ids: attachmentIds.value,
          is_private: isPrivate.value,
        })
        projectFormRef.value?.markCommitted()
        clearSavedDraft()
        emit('entryCreated', createdEntry)
        forceClose()
      } catch (err: any) {
        errorMsg.value = err.message || '保存造物手记失败'
      } finally {
        isSubmitting.value = false
      }
      return
    }
  }

  // 4. 提交日常 (life) 或 游历 (travel)
  if (!content.value.trim() && attachmentIds.value.length === 0) {
    errorMsg.value = '请填写记录内容或上传至少一张照片'
    return
  }

  const matchedCity = !selectedCityCode.value ? matchCityFromLocation(location.value) : null
  const finalCityCode = selectedCityCode.value || matchedCity?.code || undefined
  const finalCityName = selectedCityName.value || matchedCity?.name || undefined
  const finalLocation = location.value.trim() || finalCityName || ''

  if (selectedKind.value === 'travel' && !finalCityCode) {
    errorMsg.value = '游历记录请选择到访城市，以便点亮山川足迹图谱'
    return
  }

  try {
    isSubmitting.value = true
    if (finalCityCode && finalCityName) {
      saveLastUsedCity({ code: finalCityCode, name: finalCityName })
    }

    const defaultTravelTitle = finalCityName ? `行迹 · ${finalCityName}` : ''
    const created = await createLifeEntry({
      type: selectedKind.value,
      title: title.value.trim() || (selectedKind.value === 'travel' ? defaultTravelTitle : ''),
      content: content.value.trim() || '定格的瞬间。',
      occurred_at: getBeijingISOString(occurredAt.value),
      location: finalLocation,
      city_code: finalCityCode,
      city_name: finalCityName,
      footprint_id:
        selectedKind.value === 'travel' ? selectedFootprintId.value || undefined : undefined,
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

      <!-- 顶部一步式形态切换栏 (日常 / 游历 / 造物 / 心愿 / 账目) -->
      <div class="grid grid-cols-5 gap-1 sm:gap-1.5 p-1 bg-[var(--bg-subtle)]/60 border border-[var(--border-subtle)] rounded-xs mb-6">
        <button
          v-for="opt in kindOptions"
          :key="opt.key"
          type="button"
          @click="selectKind(opt.key)"
          class="py-1.5 px-0.5 sm:px-2 text-[11px] sm:text-xs font-serif-editorial rounded-xs transition-all cursor-pointer text-center truncate"
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
          v-model:selectedCityCode="selectedCityCode"
          v-model:selectedFootprintId="selectedFootprintId"
          v-model:selectedWishId="selectedWishId"
          v-model:isInstallment="isInstallment"
          v-model:installmentChannel="installmentChannel"
          v-model:installmentMonths="installmentMonths"
          v-model:syncToGear="syncToGear"
          v-model:gearCategory="gearCategory"
          v-model:gearSpec="gearSpec"
          v-model:occurredAt="occurredAt"
          :availableFootprints="availableFootprints"
          :availableWishes="availableWishes"
          :creditChannels="creditChannels"
          :effectiveRepaymentDay="effectiveRepaymentDay"
          @selectCity="handleEntryCitySelect"
          @footprintSelected="onFootprintSelected"
          @wishSelected="onWishSelected"
        />

        <!-- 分支 B：造物 -->
        <EntryProjectForm
          v-else-if="selectedKind === 'project'"
          ref="projectFormRef"
          :projects="projects"
          v-model:projectMode="projectMode"
          v-model:selectedProjectId="selectedProjectId"
          v-model:title="title"
          v-model:content="content"
          v-model:occurredAt="occurredAt"
          v-model:projTitle="projTitle"
          v-model:projSubtitle="projSubtitle"
          v-model:projCategory="projCategory"
          v-model:projStatus="projStatus"
          v-model:projDescription="projDescription"
          v-model:projStory="projStory"
          v-model:projGithubUrl="projGithubUrl"
          @update:attachmentIds="attachmentIds = $event"
        />

        <!-- 分支 C：心愿 -->
        <EntryWishForm
          v-else-if="selectedKind === 'wish'"
          ref="wishFormRef"
          v-model:wishKind="wishKind"
          v-model:title="title"
          v-model:wishBudgetYuan="wishBudgetYuan"
          v-model:wishSpec="wishSpec"
          v-model:selectedCityCode="selectedCityCode"
          v-model:wishTargetDate="wishTargetDate"
          v-model:content="content"
          @selectCity="handleEntryCitySelect"
          @update:attachmentIds="attachmentIds = $event"
        />

        <!-- 分支 D：日常 (life) 与 游历 (travel) -->
        <template v-else>
          <div v-if="selectedKind === 'travel'" class="p-3.5 rounded-xs border border-[var(--accent-warm)]/40 bg-[var(--bg-subtle)]/40 space-y-3">
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div class="space-y-1.5">
                <label class="block text-xs font-mono-archive text-[var(--ink-primary)] font-medium">
                  到访城市 *
                </label>
                <CityPicker
                  v-model="selectedCityCode"
                  @select="handleEntryCitySelect"
                />
              </div>
              <div class="space-y-1.5">
                <label class="block text-xs font-mono-archive text-[var(--ink-muted)]">
                  具体地点
                </label>
                <input
                  v-model="location"
                  type="text"
                  class="w-full px-3 py-2 text-xs font-serif-editorial bg-transparent border border-[var(--border-subtle)] focus:border-[var(--ink-primary)] rounded-xs outline-none"
                />
              </div>
            </div>

            <div v-if="availableFootprints.length > 0" class="space-y-1.5 pt-1 border-t border-[var(--border-subtle)]/60">
              <label class="block text-xs font-mono-archive text-[var(--ink-secondary)]">
                归属旅程足迹
              </label>
              <PaperSelect
                v-model="selectedFootprintId"
                size="sm"
                @change="onFootprintSelected"
                :options="[
                  { value: null, label: '-- 自动聚合至同城近期旅程 / 开启新旅程 --' },
                  ...availableFootprints.map((fp) => ({
                    value: fp.id,
                    label: formatFootprintOptionLabel(fp),
                  })),
                ]"
              />
            </div>
          </div>

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
              记录内容 *
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
          />

          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div class="space-y-1.5">
              <label class="block text-xs font-mono-archive text-[var(--ink-muted)]">发生时间</label>
              <PaperDatePicker
                v-model="occurredAt"
                enableTime
              />
            </div>

            <div v-if="selectedKind === 'life'" class="space-y-1.5">
              <label class="block text-xs font-mono-archive text-[var(--ink-muted)]">
                所在城市
              </label>
              <CityPicker
                v-model="selectedCityCode"
                @select="handleEntryCitySelect"
              />
            </div>
          </div>

          <div v-if="selectedKind === 'life'" class="space-y-1.5">
            <label class="block text-xs font-mono-archive text-[var(--ink-muted)]">
              具体地点
            </label>
            <input
              v-model="location"
              type="text"
              class="w-full px-3 py-2 text-xs font-serif-editorial bg-transparent border border-[var(--border-subtle)] focus:border-[var(--ink-primary)] rounded-xs outline-none"
            />
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
