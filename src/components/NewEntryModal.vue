<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { X, Check } from 'lucide-vue-next'
import ImageUploader from './ImageUploader.vue'
import PaperSelect from './PaperSelect.vue'
import PaperDatePicker from './PaperDatePicker.vue'
import CityPicker from './CityPicker.vue'
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
import { getBeijingDateTimeString, getBeijingISOString } from '../utils/format'
import { audio } from '../utils/audio'
import type { LifeEntry, Transaction, Project, Wish, CreditChannel, Footprint } from '../types'
import { useBodyScrollLock } from '../composables/useBodyScrollLock'

export type EntryKind = 'life' | 'travel' | 'project' | 'wish' | 'transaction'

const props = defineProps<{
  isOpen: boolean
  storageConfigured: boolean
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
  (e: 'requestAuth', callback: () => void): void
}>()

const {
  expenseCategories,
  incomeCategories,
  gearCategories,
  paymentMethods,
  projectCategories,
  loadCategories,
  openCategoryManager,
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
const attachmentIds = ref<number[]>([])
const imageUploaderRef = ref<InstanceType<typeof ImageUploader> | null>(null)

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
    if (parsed.projectId !== undefined && !props.initialProjectId) {
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
  if (imageFiles.length > 0 && imageUploaderRef.value) {
    e.preventDefault()
    imageUploaderRef.value.uploadFiles(imageFiles)
  }
}

// 造物项目模式：'new' (立项新造物) | 'entry' (为已有项目写造物手记)
const projectMode = ref<'new' | 'entry'>('new')
const projTitle = ref('')
const projSubtitle = ref('')
const projCategory = ref('开源项目')
const projStatus = ref('Active')
const projDescription = ref('')
const projStory = ref('')
const projGithubUrl = ref('')

// 心愿模式专用状态
const wishKind = ref<'item' | 'travel' | 'milestone'>('item')
const wishBudgetYuan = ref('')
const wishSpec = ref('')
const wishTargetDate = ref('')

// 账目专用状态
const txAmount = ref<string>('')
const txType = ref<'expense' | 'income'>('expense')
const txCategory = ref<string>('餐饮')
const txPaymentMethod = ref<string>('')
const txNote = ref<string>('')
const syncToGear = ref(false)
const gearCategory = ref('数码器材')
const gearSpec = ref('')

// 心愿单、旅程足迹与分期付款支持
const availableWishes = ref<Wish[]>([])
const availableFootprints = ref<Footprint[]>([])
const creditChannels = ref<CreditChannel[]>([])
const selectedWishId = ref<number | null>(null)
const isInstallment = ref(false)
const installmentChannel = ref('huabei')
const installmentMonths = ref(12)
const customRepaymentDay = ref(15)

const defaultCreditChannels: CreditChannel[] = [
  { code: 'huabei', name: '花呗', repayment_day: 10 },
  { code: 'baitiao', name: '京东白条', repayment_day: 20 },
]

const displayCreditChannels = computed<CreditChannel[]>(() => {
  return creditChannels.value.length > 0 ? creditChannels.value : defaultCreditChannels
})

const currentTxCategories = computed(() => {
  return txType.value === 'income' ? incomeCategories.value : expenseCategories.value
})

watch(txType, (newType) => {
  if (newType === 'income' && !incomeCategories.value.includes(txCategory.value)) {
    txCategory.value = incomeCategories.value[0] || '工资收入'
  } else if (newType === 'expense' && !expenseCategories.value.includes(txCategory.value)) {
    txCategory.value = expenseCategories.value[0] || '餐饮'
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
    const list = await fetchWishes({ status: 'wanting' })
    availableWishes.value = list
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
  const startStr = (fp.visited_at || '').slice(0, 10)
  const endStr = fp.departed_at ? fp.departed_at.slice(0, 10) : ''
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
      if (
        installmentChannel.value !== 'custom' &&
        !list.some((c) => c.code === installmentChannel.value)
      ) {
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
      } else if (props.projects && props.projects.length > 0) {
        projectMode.value = 'entry'
        selectedProjectId.value = props.projects[0].id
      } else {
        projectMode.value = 'new'
        selectedProjectId.value = null
      }
      hasRestoredDraft.value = false
      restoreDraftFromStorage()
      errorMsg.value = null
    }
  },
  { immediate: true }
)

watch(
  [title, content, location, selectedCityCode, selectedCityName, selectedKind, selectedProjectId],
  () => {
    saveDraftToStorage()
  }
)

const onWishSelected = () => {
  if (!selectedWishId.value) return
  const wish = availableWishes.value.find((w) => w.id === selectedWishId.value)
  if (wish) {
    if (!title.value.trim()) {
      title.value = wish.title
    }
    if (!txAmount.value && wish.budget > 0) {
      txAmount.value = (wish.budget / 100).toFixed(2)
    }
    if (txCategory.value === '餐饮') {
      txCategory.value = '购物'
    }
  }
}

const calculatedMonthlyPay = computed(() => {
  const amtFloat = parseFloat(txAmount.value)
  if (isNaN(amtFloat) || amtFloat <= 0) return '0.00'
  return (amtFloat / (installmentMonths.value || 1)).toFixed(2)
})

const effectiveRepaymentDay = computed(() => {
  if (installmentChannel.value === 'custom') {
    return customRepaymentDay.value || 15
  }
  const matched = displayCreditChannels.value.find((c) => c.code === installmentChannel.value)
  if (matched) {
    return matched.repayment_day
  }
  if (installmentChannel.value === 'huabei') return 10
  if (installmentChannel.value === 'baitiao') return 20
  return customRepaymentDay.value || 15
})

const selectKind = (k: EntryKind) => {
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
  selectedProjectId.value = props.initialProjectId || (props.projects?.[0]?.id ?? null)
  selectedFootprintId.value = null
  projectMode.value = props.initialProjectId || (props.projects && props.projects.length > 0) ? 'entry' : 'new'
  attachmentIds.value = []
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
  installmentChannel.value = displayCreditChannels.value[0]?.code || 'huabei'
  installmentMonths.value = 12
  customRepaymentDay.value = 15
  projTitle.value = ''
  projSubtitle.value = ''
  projCategory.value = projectCategories.value[0] || '开源项目'
  projStatus.value = 'Active'
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

const handleClose = () => {
  // 提交中禁止关闭（含背景点击与取消按钮）：关闭会卸载弹窗并触发
  // ImageUploader 的 cleanupUploads，把条目正在引用的附件当孤儿回收 ⇒ 图片死链。
  if (isSubmitting.value) return
  forceClose()
}

// 创建成功路径专用：此时附件已 markCommitted、isSubmitting 尚未在 finally 里复位，
// 若走 handleClose 会被上面的守卫吞掉（弹窗永不关闭）。守卫只服务于用户侧入口。
const forceClose = () => {
  resetForm()
  emit('close')
}

const currentKindMeta = computed(() => {
  return kindOptions.find((o) => o.key === selectedKind.value) || kindOptions[0]
})

const contentPlaceholder = computed(() => '')

const handleSubmit = async () => {
  if (isSubmitting.value) return
  errorMsg.value = null

  // 若当前尚未登录主理人，呼出印鉴校验弹窗，校验成功后自动继续发布
  if (!Boolean(getAdminToken())) {
    emit('requestAuth', () => {
      handleSubmit()
    })
    return
  }

  // 1. 提交账目 (Transaction)
  if (selectedKind.value === 'transaction') {
    const amtFloat = parseFloat(txAmount.value)
    if (isNaN(amtFloat) || amtFloat <= 0) {
      errorMsg.value = '请输入有效的金额'
      return
    }
    const amountInCents = Math.round(amtFloat * 100)
    const repaymentDay = effectiveRepaymentDay.value
    // 关键：与后端 / mac 端**同口径**（整除截断，不四舍五入）。
    // 原先用 Math.round，而 Go 与 Swift 的整数除法都是向零截断 ——
    // 三端对同一笔账算出不同的 installment_monthly_pay，
    // 落库后两端负债口径分叉（总额 ¥9,169.00 分 12 期：
    // 截断 76,408 分 vs 四舍五入 76,409 分，差 1 分，
    // 还了 6 期就差 6 分）。
    const installmentPay = isInstallment.value
      ? Math.floor(amountInCents / (installmentMonths.value || 1))
      : undefined

    const matchedChannel = displayCreditChannels.value.find(
      (c) => c.code === installmentChannel.value
    )
    // 渠道名取自后端渠道字典，前端不再硬编码渠道显示名 (FE-20)
    const channelLabel = matchedChannel?.name || installmentChannel.value

    let noteText = txNote.value.trim()
    if (isInstallment.value && !noteText.includes('期')) {
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
        payment_method: isInstallment.value
          ? channelLabel
            ? `${channelLabel} (分期)`
            : txPaymentMethod.value
          : txPaymentMethod.value,
        occurred_at: getBeijingISOString(occurredAt.value),
        wish_id: selectedWishId.value || undefined,
        footprint_id: selectedFootprintId.value || undefined,
        city_code: selectedCityCode.value || undefined,
        is_installment: txType.value === 'expense' && isInstallment.value,
        installment_channel_code:
          txType.value === 'expense' && isInstallment.value ? installmentChannel.value : undefined,
        installment_total_amount:
          txType.value === 'expense' && isInstallment.value ? amountInCents : undefined,
        installment_months:
          txType.value === 'expense' && isInstallment.value ? installmentMonths.value : undefined,
        installment_monthly_pay:
          txType.value === 'expense' && isInstallment.value ? installmentPay : undefined,
        installment_remain_months:
          txType.value === 'expense' && isInstallment.value ? installmentMonths.value : undefined,
        repayment_day:
          txType.value === 'expense' && isInstallment.value ? repaymentDay : undefined,
        link_gear_asset: txType.value === 'expense' && syncToGear.value,
        gear_category:
          txType.value === 'expense' && syncToGear.value ? gearCategory.value : undefined,
        gear_spec:
          txType.value === 'expense' && syncToGear.value
            ? gearSpec.value.trim() || txNote.value.trim() || undefined
            : undefined,
      })

      audio.playShutter()
      emit('transactionCreated', createdTx)
      forceClose()
    } catch (err: any) {
      // 凭证在提交瞬间过期：统一交回印鉴登录并在成功后继续本次提交 (FE-22)
      if (!getAdminToken()) {
        emit('requestAuth', () => handleSubmit())
        return
      }
      errorMsg.value = err.message || '记账失败'
    } finally {
      isSubmitting.value = false
    }
    return
  }

  // 2. 提交心愿 (Wish · 自动伴生创建 wish 类型 LifeEntry)
  if (selectedKind.value === 'wish') {
    if (!title.value.trim()) {
      errorMsg.value = '请填写心愿名称'
      return
    }
    if (wishKind.value === 'travel' && !selectedCityCode.value) {
      errorMsg.value = '旅程心愿请选择目的地城市'
      return
    }
    const budgetFloat = parseFloat(wishBudgetYuan.value)
    const budgetCents = !isNaN(budgetFloat) && budgetFloat > 0 ? Math.round(budgetFloat * 100) : 0

    try {
      isSubmitting.value = true
      const createdWish = await createWish({
        title: title.value.trim(),
        kind: wishKind.value,
        note: content.value.trim(),
        spec: wishKind.value === 'item' ? wishSpec.value.trim() || undefined : undefined,
        city_code: wishKind.value === 'travel' ? selectedCityCode.value || undefined : undefined,
        city_name: wishKind.value === 'travel' ? selectedCityName.value || undefined : undefined,
        budget: budgetCents,
        target_date: wishTargetDate.value || undefined,
        attachment_ids: attachmentIds.value.length > 0 ? attachmentIds.value : undefined,
      })

      if (createdWish.life_entry_id) {
        try {
          const companionEntry = await fetchEntryById(createdWish.life_entry_id)
          emit('entryCreated', companionEntry)
        } catch {}
      }

      audio.playShutter()
      // 参考图已随心愿落库绑定，标记后上传器卸载不再回收这些文件
      imageUploaderRef.value?.markCommitted()
      clearSavedDraft()
      emit('wishCreated', createdWish)
      forceClose()
    } catch (err: any) {
      if (!getAdminToken()) {
        emit('requestAuth', () => {
          handleSubmit()
        })
        return
      }
      errorMsg.value = err.message || '创建心愿失败'
    } finally {
      isSubmitting.value = false
    }
    return
  }

  // 3. 提交造物 (Project：立项新造物 或 撰写已有项目进展手记)
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
          status: projStatus.value || 'Active',
          description: projDescription.value.trim(),
          story: projStory.value.trim(),
          github_url: projGithubUrl.value.trim(),
        })

        // 复用后端刚伴生创建的同项目记录并绑定附件与时间
        const createdEntry = await createLifeEntry({
          type: 'project',
          title: projTitle.value.trim(),
          content:
            projDescription.value.trim() ||
            projStory.value.trim() ||
            `立项开启造物项目「${projTitle.value.trim()}」。`,
          occurred_at: occurredAt.value,
          project_id: createdProj.id,
          attachment_ids: attachmentIds.value,
        })

        audio.playShutter()
        imageUploaderRef.value?.markCommitted()
        clearSavedDraft()
        emit('projectCreated', createdProj)
        emit('entryCreated', createdEntry)
        forceClose()
      } catch (err: any) {
        if (!getAdminToken()) {
          emit('requestAuth', () => handleSubmit())
          return
        }
        errorMsg.value = err.message || '创建造物项目失败'
      } finally {
        isSubmitting.value = false
      }
      return
    } else {
      // 为已有项目写进展手记
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
        })
        audio.playShutter()
        imageUploaderRef.value?.markCommitted()
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
      project_id: selectedProjectId.value,
      wish_id: selectedWishId.value,
      footprint_id: selectedFootprintId.value || undefined,
      attachment_ids: attachmentIds.value,
    })

    audio.playShutter()
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

  // MOB-P1-66：弹窗打开期间锁定背景页面滚动（此前只有灯箱锁了）
  useBodyScrollLock(() => props.isOpen)
</script>

<template>
  <div
    v-if="isOpen"
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
        <!-- 错误提示 -->
        <div v-if="errorMsg" class="p-3 bg-red-50 text-red-700 text-xs rounded-xs border border-red-200">
          {{ errorMsg }}
        </div>

        <!-- ==================== 分支 A：账目 (transaction) ==================== -->
        <template v-if="selectedKind === 'transaction'">
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div class="space-y-1.5">
              <label class="block text-xs font-mono-archive text-[var(--ink-muted)]">金额 (¥) *</label>
              <div class="relative">
                <span class="absolute left-3 top-2.5 text-sm font-mono-archive text-[var(--ink-muted)]">¥</span>
                <input
                  v-model="txAmount"
                  type="number"
                  step="0.01"
                  min="0.01"
                  required
                  placeholder="0.00"
                  class="w-full pl-7 pr-3 py-2 text-lg font-mono-archive bg-transparent border border-[var(--border-subtle)] focus:border-[var(--ink-primary)] rounded-xs outline-none"
                  autofocus
                />
              </div>
            </div>

            <div class="space-y-1.5">
              <label class="block text-xs font-mono-archive text-[var(--ink-muted)]">收支类型</label>
              <div class="flex gap-2 pt-0.5">
                <button
                  type="button"
                  @click="txType = 'expense'"
                  class="flex-1 py-2 text-xs font-serif-editorial rounded-xs border transition-colors cursor-pointer"
                  :class="txType === 'expense' ? 'border-[var(--ink-primary)] font-bold text-[var(--ink-primary)] bg-[var(--bg-subtle)]' : 'border-[var(--border-subtle)] text-[var(--ink-muted)]'"
                >
                  支出
                </button>
                <button
                  type="button"
                  @click="txType = 'income'"
                  class="flex-1 py-2 text-xs font-serif-editorial rounded-xs border transition-colors cursor-pointer"
                  :class="txType === 'income' ? 'border-[var(--ink-primary)] font-bold text-[var(--ink-primary)] bg-[var(--bg-subtle)]' : 'border-[var(--border-subtle)] text-[var(--ink-muted)]'"
                >
                  收入
                </button>
              </div>
            </div>
          </div>

          <!-- 分类标签选择 -->
          <div class="space-y-1.5">
            <div class="flex items-center justify-between">
              <label class="block text-xs font-mono-archive text-[var(--ink-muted)]">
                {{ txType === 'income' ? '收入分类' : '支出分类' }}
              </label>
              <button
                type="button"
                @click="openCategoryManager(txType === 'income' ? 'income' : 'expense')"
                class="text-[11px] font-mono-archive text-[var(--ink-secondary)] hover:text-[var(--ink-primary)] underline underline-offset-4 cursor-pointer"
              >
                管理分类
              </button>
            </div>
            <div class="flex flex-wrap gap-2">
              <button
                v-for="cat in currentTxCategories"
                :key="cat"
                type="button"
                @click="txCategory = cat"
                class="px-2.5 py-1 text-xs font-serif-editorial rounded-xs border transition-colors cursor-pointer"
                :class="txCategory === cat ? 'border-[var(--ink-primary)] font-medium text-[var(--ink-primary)] bg-[var(--bg-subtle)]' : 'border-[var(--border-subtle)] text-[var(--ink-muted)]'"
              >
                {{ cat }}
              </button>
            </div>
          </div>

          <!-- 账目名称与支付方式 -->
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div class="space-y-1.5">
              <label class="block text-xs font-mono-archive text-[var(--ink-muted)]">事项名称</label>
              <input
                v-model="title"
                type="text"
                class="w-full px-3 py-2 text-sm bg-transparent border border-[var(--border-subtle)] focus:border-[var(--ink-primary)] rounded-xs outline-none font-serif-editorial"
              />
            </div>

            <div class="space-y-1.5">
              <div class="flex items-center justify-between">
                <label class="block text-xs font-mono-archive text-[var(--ink-muted)]">支付渠道</label>
                <button
                  type="button"
                  @click="openCategoryManager('payment')"
                  class="text-[11px] font-mono-archive text-[var(--ink-secondary)] hover:text-[var(--ink-primary)] underline underline-offset-4 cursor-pointer"
                >
                  管理渠道
                </button>
              </div>
              <PaperSelect
                v-model="txPaymentMethod"
                :options="paymentMethods.map((m) => ({ value: m, label: m }))"
              />
            </div>
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div class="space-y-1.5">
              <label class="block text-xs font-mono-archive text-[var(--ink-muted)]">备注说明</label>
              <input
                v-model="txNote"
                type="text"
                class="w-full px-3 py-2 text-sm bg-transparent border border-[var(--border-subtle)] focus:border-[var(--ink-primary)] rounded-xs outline-none font-serif-editorial"
              />
            </div>
            <div class="space-y-1.5">
              <label class="block text-xs font-mono-archive text-[var(--ink-muted)]">所在城市</label>
              <CityPicker
                v-model="selectedCityCode"
                @select="handleEntryCitySelect"
              />
            </div>
          </div>

          <!-- 关联旅程足迹 (支持一次旅程归集多笔账单) -->
          <div v-if="availableFootprints.length > 0" class="space-y-1.5">
            <label class="block text-xs font-mono-archive text-[var(--ink-muted)]">
              关联旅程足迹
            </label>
            <PaperSelect
              v-model="selectedFootprintId"
              @change="onFootprintSelected"
              :options="[
                { value: null, label: '-- 自动匹配同城近期旅程 / 不指定 --' },
                ...availableFootprints.map((fp) => ({
                  value: fp.id,
                  label: formatFootprintOptionLabel(fp),
                })),
              ]"
            />
          </div>

          <!-- 联动心愿单 -->
          <div v-if="txType === 'expense' && availableWishes.length > 0" class="space-y-1.5">
            <label class="block text-xs font-mono-archive text-[var(--ink-muted)]">关联心愿清单 (自动达成归册)</label>
            <PaperSelect
              v-model="selectedWishId"
              @change="onWishSelected"
              :options="[
                { value: null, label: '-- 不关联心愿 --' },
                ...availableWishes.map((w) => ({
                  value: w.id,
                  label: `${w.title} (预算: ¥${(w.budget / 100).toFixed(2)})`,
                })),
              ]"
            />
          </div>

          <!-- 分期付款支持 -->
          <div v-if="txType === 'expense'" class="p-3 rounded-xs border border-[var(--border-subtle)] bg-[var(--bg-subtle)]/30 space-y-2.5">
            <div class="flex items-center gap-2">
              <input
                id="isInstallmentCheckbox"
                v-model="isInstallment"
                type="checkbox"
                class="rounded-xs cursor-pointer accent-[var(--ink-primary)]"
              />
              <label for="isInstallmentCheckbox" class="text-xs font-mono-archive text-[var(--ink-primary)] cursor-pointer select-none">
                分期付款 (花呗 / 京东白条 / 信用卡分期)
              </label>
            </div>

            <div v-if="isInstallment" class="space-y-3 pt-1 text-xs font-mono-archive">
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label class="block text-[var(--ink-muted)] mb-1">分期渠道</label>
                  <PaperSelect
                    v-model="installmentChannel"
                    size="sm"
                    :options="[
                      ...displayCreditChannels.map((ch) => ({
                        value: ch.code,
                        label: `${ch.name} (每月 ${ch.repayment_day} 日还款)`,
                      })),
                      { value: 'custom', label: '信用卡 / 自定义分期' },
                    ]"
                  />
                </div>
                <div>
                  <label class="block text-[var(--ink-muted)] mb-1">分期期数</label>
                  <div class="flex gap-1.5">
                    <button
                      v-for="m in [3, 6, 12, 24]"
                      :key="m"
                      type="button"
                      @click="installmentMonths = m"
                      class="flex-1 py-1 text-xs border rounded-xs transition-colors cursor-pointer text-center"
                      :class="installmentMonths === m ? 'border-[var(--ink-primary)] bg-[var(--ink-primary)] text-[var(--bg-archive)] font-medium' : 'border-[var(--border-subtle)] text-[var(--ink-muted)]'"
                    >
                      {{ m }}期
                    </button>
                  </div>
                </div>
              </div>

              <div v-if="installmentChannel === 'custom'" class="space-y-1">
                <label class="block text-[var(--ink-muted)]">每月独立还款日 (1~31)</label>
                <input
                  v-model.number="customRepaymentDay"
                  type="number"
                  min="1"
                  max="31"
                  class="w-32 px-2 py-1 text-xs border border-[var(--border-subtle)] rounded-xs outline-none bg-transparent"
                />
              </div>

              <div class="p-2 rounded-xs bg-[var(--bg-archive)] border border-[var(--border-subtle)] text-[11px] text-[var(--ink-secondary)] flex items-center justify-between">
                <span>每期月供测算：<strong class="text-[var(--ink-primary)]">¥{{ calculatedMonthlyPay }}</strong> / 期</span>
                <span>绑定还款日：<strong>每月 {{ effectiveRepaymentDay }} 日</strong></span>
              </div>
            </div>
          </div>

          <!-- 同步收录至随身与桌面固定资产库 -->
          <div v-if="txType === 'expense'" class="p-3 rounded-xs border border-[var(--border-subtle)] bg-[var(--bg-subtle)]/30 space-y-2.5">
            <div class="flex items-center gap-2">
              <input
                id="syncToGearCheckbox"
                v-model="syncToGear"
                type="checkbox"
                class="rounded-xs cursor-pointer accent-[var(--ink-primary)]"
              />
              <label for="syncToGearCheckbox" class="text-xs font-mono-archive text-[var(--ink-primary)] cursor-pointer select-none">
                同步收录至随身与桌面设备库 (固定资产沉淀)
              </label>
            </div>

            <div v-if="syncToGear" class="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1 text-xs font-mono-archive">
              <div>
                <div class="flex items-center justify-between mb-1">
                  <label class="block text-[var(--ink-muted)]">设备类别</label>
                  <button
                    type="button"
                    @click="openCategoryManager('gear')"
                    class="text-[11px] text-[var(--ink-secondary)] hover:text-[var(--ink-primary)] underline underline-offset-4 cursor-pointer"
                  >
                    管理分类
                  </button>
                </div>
                <PaperSelect
                  v-model="gearCategory"
                  size="sm"
                  :options="gearCategories.map((c) => ({ value: c, label: c }))"
                />
              </div>
              <div>
                <label class="block text-[var(--ink-muted)] mb-1">规格型号</label>
                <input
                  v-model="gearSpec"
                  type="text"
                  class="w-full px-2.5 py-1.5 text-xs bg-transparent border border-[var(--border-subtle)] focus:border-[var(--ink-primary)] rounded-xs outline-none"
                />
              </div>
            </div>
          </div>

          <div class="space-y-1.5">
            <label class="block text-xs font-mono-archive text-[var(--ink-muted)]">入账时间</label>
            <PaperDatePicker
              v-model="occurredAt"
              enableTime
            />
          </div>
        </template>

        <!-- ==================== 分支 B：造物 (project) ==================== -->
        <template v-else-if="selectedKind === 'project'">
          <!-- 子模式切换：写造物进展手记 vs 立项新造物 -->
          <div v-if="projects && projects.length > 0" class="flex items-center gap-2 pb-1">
            <button
              type="button"
              @click="projectMode = 'entry'"
              class="px-3 py-1.5 text-xs font-mono-archive rounded-xs border transition-colors cursor-pointer"
              :class="projectMode === 'entry' ? 'border-[var(--ink-primary)] bg-[var(--bg-subtle)] text-[var(--ink-primary)] font-semibold' : 'border-[var(--border-subtle)] text-[var(--ink-muted)]'"
            >
              撰写已有项目进展手记
            </button>
            <button
              type="button"
              @click="projectMode = 'new'"
              class="px-3 py-1.5 text-xs font-mono-archive rounded-xs border transition-colors cursor-pointer"
              :class="projectMode === 'new' ? 'border-[var(--ink-primary)] bg-[var(--bg-subtle)] text-[var(--ink-primary)] font-semibold' : 'border-[var(--border-subtle)] text-[var(--ink-muted)]'"
            >
              ＋ 立项新造物项目
            </button>
          </div>

          <!-- B1: 撰写已有项目的造物进展手记 -->
          <div v-if="projectMode === 'entry' && projects && projects.length > 0" class="space-y-4">
            <div class="space-y-1.5">
              <label class="block text-xs font-mono-archive text-[var(--ink-muted)]">选择造物项目 *</label>
              <PaperSelect
                v-model="selectedProjectId"
                :options="projects.map((p) => ({ value: p.id, label: `${p.title} (${p.status || 'Active'})` }))"
              />
            </div>

            <div class="space-y-1.5">
              <label class="block text-xs font-mono-archive text-[var(--ink-muted)]">手记标题</label>
              <input
                v-model="title"
                type="text"
                class="w-full px-3 py-2 text-base font-serif-editorial bg-transparent border border-[var(--border-subtle)] focus:border-[var(--ink-primary)] rounded-xs outline-none"
              />
            </div>

            <div class="space-y-1.5">
              <label class="block text-xs font-mono-archive text-[var(--ink-muted)]">进展内容 *</label>
              <textarea
                v-model="content"
                rows="5"
                :placeholder="contentPlaceholder"
                class="w-full px-3 py-2 text-base font-serif-editorial leading-relaxed bg-transparent border border-[var(--border-subtle)] focus:border-[var(--ink-primary)] rounded-xs outline-none resize-y"
              ></textarea>
            </div>

            <ImageUploader
              ref="imageUploaderRef"
              :storageConfigured="storageConfigured"
              @update:attachments="attachmentIds = $event"
            />

            <div class="space-y-1.5">
              <label class="block text-xs font-mono-archive text-[var(--ink-muted)]">记录时间</label>
              <PaperDatePicker
                v-model="occurredAt"
                enableTime
              />
            </div>
          </div>

          <!-- B2: 立项新造物项目 -->
          <div v-else class="space-y-4">
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div class="space-y-1.5">
                <label class="block text-xs font-mono-archive text-[var(--ink-muted)]">造物名称 *</label>
                <input
                  v-model="projTitle"
                  type="text"
                  class="w-full px-3 py-2 text-base font-serif-editorial bg-transparent border border-[var(--border-subtle)] focus:border-[var(--ink-primary)] rounded-xs outline-none"
                />
              </div>
              <div class="space-y-1.5">
                <label class="block text-xs font-mono-archive text-[var(--ink-muted)]">副标题</label>
                <input
                  v-model="projSubtitle"
                  type="text"
                  class="w-full px-3 py-2 text-sm font-serif-editorial bg-transparent border border-[var(--border-subtle)] focus:border-[var(--ink-primary)] rounded-xs outline-none"
                />
              </div>
            </div>

            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div class="space-y-1.5">
                <div class="flex items-center justify-between">
                  <label class="block text-xs font-mono-archive text-[var(--ink-muted)]">造物分类</label>
                  <button
                    type="button"
                    @click="openCategoryManager('project')"
                    class="text-[11px] font-mono-archive text-[var(--ink-secondary)] hover:text-[var(--ink-primary)] underline underline-offset-4 cursor-pointer"
                  >
                    管理分类
                  </button>
                </div>
                <PaperSelect
                  v-model="projCategory"
                  :options="projectCategories.map((c) => ({ value: c, label: c }))"
                />
              </div>
              <div class="space-y-1.5">
                <label class="block text-xs font-mono-archive text-[var(--ink-muted)]">运行状态</label>
                <PaperSelect
                  v-model="projStatus"
                  :options="[
                    { value: 'Active', label: '活跃' },
                    { value: 'Maintained', label: '维护' },
                    { value: 'WIP', label: '构思试验' },
                    { value: 'Archived', label: '归档' },
                  ]"
                />
              </div>
            </div>

            <div class="space-y-1.5">
              <label class="block text-xs font-mono-archive text-[var(--ink-muted)]">项目简介 *</label>
              <textarea
                v-model="projDescription"
                rows="2"
                class="w-full px-3 py-2 text-sm font-serif-editorial bg-transparent border border-[var(--border-subtle)] focus:border-[var(--ink-primary)] rounded-xs outline-none resize-none"
              ></textarea>
            </div>

            <div class="space-y-1.5">
              <label class="block text-xs font-mono-archive text-[var(--ink-muted)]">立项初衷</label>
              <textarea
                v-model="projStory"
                rows="3"
                class="w-full px-3 py-2 text-sm font-serif-editorial bg-transparent border border-[var(--border-subtle)] focus:border-[var(--ink-primary)] rounded-xs outline-none resize-y"
              ></textarea>
            </div>

            <div class="space-y-1.5">
              <label class="block text-xs font-mono-archive text-[var(--ink-muted)]">仓库链接</label>
              <input
                v-model="projGithubUrl"
                type="url"
                placeholder="https://github.com/..."
                class="w-full px-3 py-2 text-xs font-mono-archive bg-transparent border border-[var(--border-subtle)] focus:border-[var(--ink-primary)] rounded-xs outline-none"
              />
            </div>

            <ImageUploader
              ref="imageUploaderRef"
              :storageConfigured="storageConfigured"
              @update:attachments="attachmentIds = $event"
            />
          </div>
        </template>

        <!-- ==================== 分支 C：心愿 (wish) ==================== -->
        <template v-else-if="selectedKind === 'wish'">
          <div class="grid grid-cols-3 gap-2">
            <button
              type="button"
              @click="wishKind = 'item'"
              class="py-2 text-xs font-serif-editorial rounded-xs border transition-colors cursor-pointer"
              :class="wishKind === 'item' ? 'border-[var(--ink-primary)] bg-[var(--bg-subtle)] font-semibold text-[var(--ink-primary)]' : 'border-[var(--border-subtle)] text-[var(--ink-muted)]'"
            >
              好物心愿
            </button>
            <button
              type="button"
              @click="wishKind = 'travel'"
              class="py-2 text-xs font-serif-editorial rounded-xs border transition-colors cursor-pointer"
              :class="wishKind === 'travel' ? 'border-[var(--ink-primary)] bg-[var(--bg-subtle)] font-semibold text-[var(--ink-primary)]' : 'border-[var(--border-subtle)] text-[var(--ink-muted)]'"
            >
              远方旅程
            </button>
            <button
              type="button"
              @click="wishKind = 'milestone'"
              class="py-2 text-xs font-serif-editorial rounded-xs border transition-colors cursor-pointer"
              :class="wishKind === 'milestone' ? 'border-[var(--ink-primary)] bg-[var(--bg-subtle)] font-semibold text-[var(--ink-primary)]' : 'border-[var(--border-subtle)] text-[var(--ink-muted)]'"
            >
              阶段里程碑
            </button>
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div class="space-y-1.5">
              <label class="block text-xs font-mono-archive text-[var(--ink-muted)]">心愿名称 *</label>
              <input
                v-model="title"
                type="text"
                class="w-full px-3 py-2 text-base font-serif-editorial bg-transparent border border-[var(--border-subtle)] focus:border-[var(--ink-primary)] rounded-xs outline-none"
              />
            </div>
            <div class="space-y-1.5">
              <label class="block text-xs font-mono-archive text-[var(--ink-muted)]">预估预算 (¥)</label>
              <input
                v-model="wishBudgetYuan"
                type="number"
                step="0.01"
                min="0"
                placeholder="0.00"
                class="w-full px-3 py-2 text-base font-mono-archive bg-transparent border border-[var(--border-subtle)] focus:border-[var(--ink-primary)] rounded-xs outline-none"
              />
            </div>
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div v-if="wishKind === 'item'" class="space-y-1.5">
              <label class="block text-xs font-mono-archive text-[var(--ink-muted)]">规格型号</label>
              <input
                v-model="wishSpec"
                type="text"
                class="w-full px-3 py-2 text-xs font-serif-editorial bg-transparent border border-[var(--border-subtle)] focus:border-[var(--ink-primary)] rounded-xs outline-none"
              />
            </div>
            <div v-if="wishKind === 'travel'" class="space-y-1.5">
              <label class="block text-xs font-mono-archive text-[var(--ink-muted)]">目的地城市 *</label>
              <CityPicker
                v-model="selectedCityCode"
                @select="handleEntryCitySelect"
              />
            </div>
            <div class="space-y-1.5">
              <label class="block text-xs font-mono-archive text-[var(--ink-muted)]">期许达成日期</label>
              <PaperDatePicker
                v-model="wishTargetDate"
              />
            </div>
          </div>

          <div class="space-y-1.5">
            <label class="block text-xs font-mono-archive text-[var(--ink-muted)]">心愿寄语</label>
            <textarea
              v-model="content"
              rows="4"
              :placeholder="contentPlaceholder"
              class="w-full px-3 py-2 text-base font-serif-editorial leading-relaxed bg-transparent border border-[var(--border-subtle)] focus:border-[var(--ink-primary)] rounded-xs outline-none resize-y"
            ></textarea>
          </div>

          <ImageUploader
            ref="imageUploaderRef"
            :storageConfigured="storageConfigured"
            @update:attachments="attachmentIds = $event"
          />
        </template>

        <!-- ==================== 分支 D：日常 (life) 与 游历 (travel) ==================== -->
        <template v-else>
          <!-- 游历专属：城市必选高亮置于顶部 + 关联多日旅程足迹 -->
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

            <!-- 关联已有旅程足迹 (支持一次多日旅游挂载多条游记手记) -->
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

          <!-- 标题 -->
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

          <!-- 内容主体 -->
          <div class="space-y-1.5">
            <label class="block text-xs font-mono-archive text-[var(--ink-muted)]">
              记录内容 *
            </label>
            <textarea
              v-model="content"
              rows="5"
              :placeholder="contentPlaceholder"
              class="w-full px-3 py-2 text-base font-serif-editorial leading-relaxed bg-transparent border border-[var(--border-subtle)] focus:border-[var(--ink-primary)] rounded-xs outline-none resize-y"
            ></textarea>
          </div>

          <!-- 照片上传组件 -->
          <ImageUploader
            ref="imageUploaderRef"
            :storageConfigured="storageConfigured"
            @update:attachments="attachmentIds = $event"
          />

          <!-- 发生时间与驻足城市 (日常模式下可选) -->
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

        <!-- 底部错误提示与操作按钮 -->
        <div v-if="errorMsg" class="p-3 bg-red-50 text-red-700 text-xs rounded-xs border border-red-200">
          {{ errorMsg }}
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
            <Check v-if="!isSubmitting" class="w-3.5 h-3.5" />
            <span>{{ isSubmitting ? '保存中...' : '记录到生活档案' }}</span>
          </button>
        </div>
      </form>
    </div>
  </div>
</template>
