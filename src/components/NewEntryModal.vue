<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { X, ArrowLeft, Check } from 'lucide-vue-next'
import ImageUploader from './ImageUploader.vue'
import { createLifeEntry, createTransaction, createProject, updateCuratorProfile, fetchWishes, updateWish } from '../utils/api'
import { loadCuratorProfile, saveCuratorProfile } from '../utils/profile'
import { audio } from '../utils/audio'
import type { LifeEntry, Transaction, Project, GearItem, Wish } from '../types'

export type EntryKind = 'life' | 'thought' | 'photo' | 'project' | 'collection' | 'transaction'

const props = defineProps<{
  isOpen: boolean
  storageConfigured: boolean
  projects?: Project[]
  initialKind?: EntryKind
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'entryCreated', entry: LifeEntry): void
  (e: 'transactionCreated', tx: Transaction): void
  (e: 'projectCreated', proj: Project): void
}>()

const step = ref<'select' | 'form'>('select')
const selectedKind = ref<EntryKind>('life')
const isSubmitting = ref(false)
const errorMsg = ref<string | null>(null)

watch(
  [() => props.isOpen, () => props.initialKind],
  ([open, initKind]) => {
    if (open) {
      loadAvailableWishes()
      if (initKind) {
        selectedKind.value = initKind
        step.value = 'form'
      } else {
        step.value = 'select'
        selectedKind.value = 'life'
      }
      errorMsg.value = null
    }
  },
  { immediate: true }
)

// 基础表单状态
const title = ref('')
const content = ref('')
const location = ref('')
const tags = ref('')
const occurredAt = ref(getTodayDateTimeString())
const selectedProjectId = ref<number | null>(null)
const attachmentIds = ref<number[]>([])

// 造物项目专有状态 (RC-55 统一录入模型)
const projTitle = ref('')
const projSubtitle = ref('')
const projCategory = ref('开源项目')
const projStatus = ref('Active')
const projDescription = ref('')
const projStory = ref('')
const projTags = ref('')
const projGithubUrl = ref('')

// 记账专用状态
const txAmount = ref<string>('')
const txType = ref<'expense' | 'income'>('expense')
const txCategory = ref<string>('餐饮')
const txPaymentMethod = ref<string>('微信支付')
const txNote = ref<string>('')
const syncToGear = ref(false)
const gearCategory = ref('影像与暗房')

// 心愿单与分期付款支持 (RG-11, RC-53)
const availableWishes = ref<Wish[]>([])
const selectedWishId = ref<number | null>(null)
const isInstallment = ref(false)
const installmentChannel = ref('huabei')
const installmentMonths = ref(12)
const customRepaymentDay = ref(15)

const loadAvailableWishes = async () => {
  try {
    const list = await fetchWishes({ status: 'wanting' })
    availableWishes.value = list
  } catch {
    availableWishes.value = []
  }
}

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
  if (installmentChannel.value === 'huabei') return 10
  if (installmentChannel.value === 'baitiao') return 20
  return customRepaymentDay.value || 15
})

const txCategories = ['餐饮', '交通', '购物', '娱乐', '学习', '住房', '医疗', '其他']
const paymentMethods = ['微信支付', '支付宝', '银行卡', '现金', '其他']

const kindOptions: { key: EntryKind; label: string; desc: string }[] = [
  { key: 'life', label: '生活记录', desc: '出门、吃饭、旅行、行迹或今天发生的小事' },
  { key: 'thought', label: '想法', desc: '随笔、突发灵感、人生感悟与文字碎片' },
  { key: 'photo', label: '照片', desc: '胶卷底片、光影瞬间与视觉记忆' },
  { key: 'project', label: '项目', desc: '亲手创造的工具、设计实验与长线造物' },
  { key: 'collection', label: '收藏', desc: '喜欢的音乐唱片、书籍、游戏与长伴物件' },
  { key: 'transaction', label: '记账', desc: '记录一笔收支，把握日常真实开销' },
]

function getTodayDateTimeString(): string {
  const now = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`
}

const selectKind = (k: EntryKind) => {
  selectedKind.value = k
  step.value = 'form'
  errorMsg.value = null
}

const resetForm = () => {
  if (props.initialKind) {
    selectedKind.value = props.initialKind
    step.value = 'form'
  } else {
    step.value = 'select'
    selectedKind.value = 'life'
  }
  title.value = ''
  content.value = ''
  location.value = ''
  tags.value = ''
  occurredAt.value = getTodayDateTimeString()
  selectedProjectId.value = null
  attachmentIds.value = []
  txAmount.value = ''
  txType.value = 'expense'
  txCategory.value = '餐饮'
  txPaymentMethod.value = '微信支付'
  txNote.value = ''
  syncToGear.value = false
  gearCategory.value = '影像与暗房'
  selectedWishId.value = null
  isInstallment.value = false
  installmentChannel.value = 'huabei'
  installmentMonths.value = 12
  customRepaymentDay.value = 15
  projTitle.value = ''
  projSubtitle.value = ''
  projCategory.value = '开源项目'
  projStatus.value = 'Active'
  projDescription.value = ''
  projStory.value = ''
  projTags.value = ''
  projGithubUrl.value = ''
  errorMsg.value = null
  isSubmitting.value = false
}

const handleClose = () => {
  resetForm()
  emit('close')
}

const kindTitle = computed(() => {
  const match = kindOptions.find((o) => o.key === selectedKind.value)
  return match ? match.label : '记录'
})

const contentPlaceholder = computed(() => {
  switch (selectedKind.value) {
    case 'thought':
      return '写下此刻脑海里的念头、感触或片段……'
    case 'photo':
      return '为这些照片写几句注脚或拍摄时的心境……'
    case 'collection':
      return '记录这张唱片、这本书、这款游戏或这件好物吸引你的地方……'
    default:
      return '记录今天真实发生的一件事、迎面的微风、味道或琐碎日常……'
  }
})

const handleSubmit = async () => {
  errorMsg.value = null

  if (selectedKind.value === 'transaction') {
    // 提交记账
    const amtFloat = parseFloat(txAmount.value)
    if (isNaN(amtFloat) || amtFloat <= 0) {
      errorMsg.value = '请输入有效的金额'
      return
    }
    const amountInCents = Math.round(amtFloat * 100)

    const repaymentDay = effectiveRepaymentDay.value
    const installmentPay = isInstallment.value
      ? Math.round(amountInCents / (installmentMonths.value || 1))
      : undefined

    let noteText = txNote.value.trim()
    if (isInstallment.value && !noteText.includes('期')) {
      const channelLabel = installmentChannel.value === 'huabei'
        ? '花呗'
        : installmentChannel.value === 'baitiao'
          ? '京东白条'
          : '信贷分期'
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
          ? (installmentChannel.value === 'huabei'
              ? '支付宝 (花呗分期)'
              : installmentChannel.value === 'baitiao'
                ? '京东支付 (白条分期)'
                : txPaymentMethod.value)
          : txPaymentMethod.value,
        occurred_at: occurredAt.value,
        wish_id: selectedWishId.value || undefined,
        is_installment: isInstallment.value,
        installment_channel_code: isInstallment.value ? installmentChannel.value : undefined,
        installment_total_amount: isInstallment.value ? amountInCents : undefined,
        installment_months: isInstallment.value ? installmentMonths.value : undefined,
        installment_monthly_pay: isInstallment.value ? installmentPay : undefined,
        installment_remain_months: isInstallment.value ? installmentMonths.value : undefined,
        repayment_day: isInstallment.value ? repaymentDay : undefined,
      })

      // 路径 B：记账大件同步收录至随身设备库 (RC-53)
      if (txType.value === 'expense' && syncToGear.value && title.value.trim()) {
        try {
          const profile = loadCuratorProfile()
          const newGear: GearItem = {
            id: `gear-${Date.now()}`,
            name: title.value.trim(),
            category: gearCategory.value,
            spec: txNote.value.trim() || undefined,
            status: '日常自用',
            note: `记账同步收录，购于 ${occurredAt.value.slice(0, 10)}`,
            price_cents: amountInCents,
            purchase_date: occurredAt.value.slice(0, 10),
          }
          const updatedGear = [newGear, ...(profile.edc_gear || [])]
          saveCuratorProfile({ ...profile, edc_gear: updatedGear })
          updateCuratorProfile({ edc_gear: updatedGear }).catch(() => {})
        } catch (err) {
          console.warn('同步收录设备库失败:', err)
        }
      }

      // 路径 C：关联心愿单时同步调用归册接口闭环 (RG-14)
      if (selectedWishId.value) {
        try {
          await updateWish(selectedWishId.value, {
            status: 'fulfilled',
            actual_cost: amountInCents,
          })
        } catch (err) {
          console.warn('同步更新心愿归册状态失败:', err)
        }
      }

      emit('transactionCreated', createdTx)
      handleClose()
    } catch (err: any) {
      errorMsg.value = err.message || '记账失败'
    } finally {
      isSubmitting.value = false
    }
    return
  }

  // 提交造物项目 (RC-55 统一造物录入表单)
  if (selectedKind.value === 'project') {
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
        tags: projTags.value.trim(),
        github_url: projGithubUrl.value.trim(),
      })

      // 同时在时间流生成关联项目散页
      const createdEntry = await createLifeEntry({
        type: 'project',
        title: projTitle.value.trim(),
        content: projDescription.value.trim() || projStory.value.trim() || '亲手创造的作品。',
        occurred_at: occurredAt.value,
        tags: projTags.value.trim(),
        project_id: createdProj.id,
      })

      audio.playShutter()
      emit('projectCreated', createdProj)
      emit('entryCreated', createdEntry)
      handleClose()
    } catch (err: any) {
      errorMsg.value = err.message || '创建造物项目失败'
    } finally {
      isSubmitting.value = false
    }
    return
  }

  // 提交 Life Entry
  if (!content.value.trim() && selectedKind.value !== 'photo') {
    errorMsg.value = '请填写记录内容'
    return
  }
  if (selectedKind.value === 'photo' && attachmentIds.value.length === 0 && !content.value.trim()) {
    errorMsg.value = '请上传至少一张照片或填写文字记录'
    return
  }

  try {
    isSubmitting.value = true
    let projId = selectedProjectId.value

    const created = await createLifeEntry({
      type: selectedKind.value,
      title: title.value.trim(),
      content: content.value.trim() || (selectedKind.value === 'photo' ? '定格的照片。' : ''),
      occurred_at: occurredAt.value,
      location: location.value.trim(),
      tags: tags.value.trim(),
      project_id: projId,
      attachment_ids: attachmentIds.value,
    })

    audio.playShutter()
    emit('entryCreated', created)
    handleClose()
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
    class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs animate-in fade-in duration-200"
    @click.self="handleClose"
  >
    <div
      class="bg-[var(--bg-archive)] border border-[var(--border-subtle)] shadow-[0_16px_50px_rgba(0,0,0,0.12)] w-full max-w-xl max-h-[88dvh] sm:max-h-[90vh] overflow-y-auto rounded-xs p-4 sm:p-8 text-left transition-all duration-200 relative"
    >
      <!-- 顶部轻量标头 -->
      <div class="flex items-center justify-between pb-6 border-b border-[var(--border-subtle)] mb-6">
        <div class="flex items-center gap-3">
          <button
            v-if="step === 'form'"
            @click="step = 'select'"
            class="text-[var(--ink-muted)] hover:text-[var(--ink-primary)] cursor-pointer p-1 -ml-1 transition-colors"
            title="返回类型选择"
          >
            <ArrowLeft class="w-4 h-4" />
          </button>
          <div>
            <h2 class="font-serif-editorial text-xl sm:text-2xl font-medium tracking-tight text-[var(--ink-primary)]">
              {{ step === 'select' ? '记录一点什么' : `新建 · ${kindTitle}` }}
            </h2>
            <p class="font-mono-archive text-[11px] text-[var(--ink-muted)] mt-0.5">
              {{ step === 'select' ? '选择你想记录的生活形态' : '沉淀真实的生活记忆' }}
            </p>
          </div>
        </div>

        <button
          @click="handleClose"
          class="p-1 text-[var(--ink-muted)] hover:text-[var(--ink-primary)] cursor-pointer transition-colors"
          title="关闭"
        >
          <X class="w-5 h-5" />
        </button>
      </div>

      <!-- 第一步：轻量选择菜单 -->
      <div v-if="step === 'select'" class="space-y-3 py-2">
        <button
          v-for="opt in kindOptions"
          :key="opt.key"
          @click="selectKind(opt.key)"
          class="w-full text-left p-4 rounded-xs border border-[var(--border-subtle)] hover:border-[var(--ink-secondary)] hover:bg-[var(--bg-subtle)]/40 transition-all cursor-pointer group flex items-start justify-between"
        >
          <div class="space-y-1">
            <span class="font-serif-editorial text-base text-[var(--ink-primary)] group-hover:text-[var(--accent-warm)] transition-colors block font-medium">
              {{ opt.label }}
            </span>
            <p class="text-xs text-[var(--ink-muted)] font-serif-editorial">
              {{ opt.desc }}
            </p>
          </div>
          <span class="text-xs font-mono-archive text-[var(--ink-muted)] opacity-40 group-hover:opacity-100 transition-opacity">
            →
          </span>
        </button>
      </div>

      <!-- 第二步：克制清晰的表单 -->
      <form v-else @submit.prevent="handleSubmit" class="space-y-6">
        
        <!-- 错误提示 -->
        <div v-if="errorMsg" class="p-3 bg-red-50 text-red-700 text-xs rounded-xs border border-red-200">
          {{ errorMsg }}
        </div>

        <!-- 记账表单分支 -->
        <template v-if="selectedKind === 'transaction'">
          <!-- 金额与类型 -->
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
                  :class="txType === 'expense' ? 'border-[var(--ink-primary)] font-bold text-[var(--ink-primary)]' : 'border-[var(--border-subtle)] text-[var(--ink-muted)]'"
                >
                  支出
                </button>
                <button
                  type="button"
                  @click="txType = 'income'"
                  class="flex-1 py-2 text-xs font-serif-editorial rounded-xs border transition-colors cursor-pointer"
                  :class="txType === 'income' ? 'border-[var(--ink-primary)] font-bold text-[var(--ink-primary)]' : 'border-[var(--border-subtle)] text-[var(--ink-muted)]'"
                >
                  收入
                </button>
              </div>
            </div>
          </div>

          <!-- 分类标签选择 -->
          <div class="space-y-1.5">
            <label class="block text-xs font-mono-archive text-[var(--ink-muted)]">消费分类</label>
            <div class="flex flex-wrap gap-2">
              <button
                v-for="cat in txCategories"
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
                placeholder="例如：午饭、咖啡豆、键盘"
                class="w-full px-3 py-2 text-sm bg-transparent border border-[var(--border-subtle)] focus:border-[var(--ink-primary)] rounded-xs outline-none font-serif-editorial"
              />
            </div>

            <div class="space-y-1.5">
              <label class="block text-xs font-mono-archive text-[var(--ink-muted)]">支付渠道</label>
              <select
                v-model="txPaymentMethod"
                class="w-full px-3 py-2 text-sm bg-transparent border border-[var(--border-subtle)] focus:border-[var(--ink-primary)] rounded-xs outline-none font-serif-editorial"
              >
                <option v-for="m in paymentMethods" :key="m" :value="m">{{ m }}</option>
              </select>
            </div>
          </div>

          <!-- 备注 -->
          <div class="space-y-1.5">
            <label class="block text-xs font-mono-archive text-[var(--ink-muted)]">备注说明 (可选)</label>
            <input
              v-model="txNote"
              type="text"
              placeholder="添加细节或心情批注……"
              class="w-full px-3 py-2 text-sm bg-transparent border border-[var(--border-subtle)] focus:border-[var(--ink-primary)] rounded-xs outline-none font-serif-editorial"
            />
          </div>

          <!-- 联动心愿单 (RG-11, RC-53) -->
          <div v-if="txType === 'expense' && availableWishes.length > 0" class="space-y-1.5">
            <label class="block text-xs font-mono-archive text-[var(--ink-muted)]">关联心愿清单 (可选)</label>
            <select
              v-model="selectedWishId"
              @change="onWishSelected"
              class="w-full px-3 py-2 text-sm bg-transparent border border-[var(--border-subtle)] focus:border-[var(--ink-primary)] rounded-xs outline-none font-serif-editorial"
            >
              <option :value="null">-- 不关联心愿 --</option>
              <option v-for="w in availableWishes" :key="w.id" :value="w.id">
                {{ w.title }} (预算: ¥{{ (w.budget / 100).toFixed(2) }})
              </option>
            </select>
          </div>

          <!-- 分期付款支持 (RG-11, RC-53) -->
          <div v-if="txType === 'expense'" class="p-3 rounded-xs border border-[var(--border-subtle)] bg-[var(--bg-subtle)]/30 space-y-2.5">
            <div class="flex items-center gap-2">
              <input
                id="isInstallmentCheckbox"
                v-model="isInstallment"
                type="checkbox"
                class="rounded-xs cursor-pointer accent-[var(--ink-primary)]"
              />
              <label for="isInstallmentCheckbox" class="text-xs font-mono-archive text-[var(--ink-primary)] cursor-pointer select-none">
                分期付款 (花呗 / 京东白条 / 信贷分期)
              </label>
            </div>

            <div v-if="isInstallment" class="space-y-3 pt-1 text-xs font-mono-archive">
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label class="block text-[var(--ink-muted)] mb-1">分期渠道</label>
                  <select
                    v-model="installmentChannel"
                    class="w-full px-2.5 py-1.5 text-xs bg-[var(--bg-archive)] border border-[var(--border-subtle)] rounded-xs outline-none font-mono-archive"
                  >
                    <option value="huabei">花呗 (每月 10 日还款)</option>
                    <option value="baitiao">京东白条 (每月 20 日还款)</option>
                    <option value="custom">信用卡 / 自定义分期</option>
                  </select>
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

          <!-- 同步收录至随身设备库 (RC-53) -->
          <div v-if="txType === 'expense'" class="p-3 rounded-xs border border-[var(--border-subtle)] bg-[var(--bg-subtle)]/30 space-y-2">
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
                <label class="block text-[var(--ink-muted)] mb-1">设备类别</label>
                <select
                  v-model="gearCategory"
                  class="w-full px-2.5 py-1.5 text-xs bg-[var(--bg-archive)] border border-[var(--border-subtle)] rounded-xs outline-none font-mono-archive"
                >
                  <option value="影像与暗房">影像与暗房</option>
                  <option value="工作台与算力">工作台与算力</option>
                  <option value="手冲咖啡工坊">手冲咖啡工坊</option>
                  <option value="夜骑巡航">夜骑巡航</option>
                  <option value="纸笔与日常">纸笔与日常</option>
                </select>
              </div>
              <div class="flex items-end">
                <span class="text-[11px] text-[var(--ink-muted)] pb-1.5">
                  将以「日常自用」状态收录，原值 ¥{{ txAmount || '0.00' }}
                </span>
              </div>
            </div>
          </div>
        </template>

        <!-- 造物专有表单分支 (RC-55 统一录入模型) -->
        <template v-else-if="selectedKind === 'project'">
          <div class="space-y-4">
            <!-- 项目标题与副标题 -->
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div class="space-y-1.5">
                <label class="block text-xs font-mono-archive text-[var(--ink-muted)]">造物名称 *</label>
                <input
                  v-model="projTitle"
                  type="text"
                  placeholder="项目名称 (例如: 散页)"
                  class="w-full px-3 py-2 text-base font-serif-editorial bg-transparent border border-[var(--border-subtle)] focus:border-[var(--ink-primary)] rounded-xs outline-none"
                />
              </div>
              <div class="space-y-1.5">
                <label class="block text-xs font-mono-archive text-[var(--ink-muted)]">副标题 (简明定位)</label>
                <input
                  v-model="projSubtitle"
                  type="text"
                  placeholder="例如: 个人生活档案馆与数据中枢"
                  class="w-full px-3 py-2 text-sm font-serif-editorial bg-transparent border border-[var(--border-subtle)] focus:border-[var(--ink-primary)] rounded-xs outline-none"
                />
              </div>
            </div>

            <!-- 分类与状态 -->
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div class="space-y-1.5">
                <label class="block text-xs font-mono-archive text-[var(--ink-muted)]">造物分类</label>
                <input
                  v-model="projCategory"
                  type="text"
                  placeholder="例如: 开源项目 / 效率工具 / 生活手艺"
                  class="w-full px-3 py-2 text-xs font-mono-archive bg-transparent border border-[var(--border-subtle)] focus:border-[var(--ink-primary)] rounded-xs outline-none"
                />
              </div>
              <div class="space-y-1.5">
                <label class="block text-xs font-mono-archive text-[var(--ink-muted)]">运行状态</label>
                <select
                  v-model="projStatus"
                  class="w-full px-3 py-2 text-xs font-mono-archive bg-transparent border border-[var(--border-subtle)] focus:border-[var(--ink-primary)] rounded-xs outline-none"
                >
                  <option value="Active">活跃 (Active)</option>
                  <option value="Maintained">维护 (Maintained)</option>
                  <option value="WIP">构思试验 (WIP)</option>
                  <option value="Archived">归档 (Archived)</option>
                </select>
              </div>
            </div>

            <!-- 项目简介 -->
            <div class="space-y-1.5">
              <label class="block text-xs font-mono-archive text-[var(--ink-muted)]">项目简介 (一两句话) *</label>
              <textarea
                v-model="projDescription"
                rows="2"
                placeholder="简明阐述该造物的核心价值与用途……"
                class="w-full px-3 py-2 text-sm font-serif-editorial bg-transparent border border-[var(--border-subtle)] focus:border-[var(--ink-primary)] rounded-xs outline-none resize-none"
              ></textarea>
            </div>

            <!-- 背后的故事 -->
            <div class="space-y-1.5">
              <label class="block text-xs font-mono-archive text-[var(--ink-muted)]">背后的故事 / 实践历程 (可选)</label>
              <textarea
                v-model="projStory"
                rows="4"
                placeholder="记录为何萌生创造它的念头、遇到的挑战或有趣的手艺经历……"
                class="w-full px-3 py-2 text-sm font-serif-editorial bg-transparent border border-[var(--border-subtle)] focus:border-[var(--ink-primary)] rounded-xs outline-none resize-y"
              ></textarea>
            </div>

            <!-- 标签与代码仓链接 -->
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div class="space-y-1.5">
                <label class="block text-xs font-mono-archive text-[var(--ink-muted)]">标签 (逗号分隔)</label>
                <input
                  v-model="projTags"
                  type="text"
                  placeholder="例如: Vue, Go, SQLite"
                  class="w-full px-3 py-2 text-xs font-serif-editorial bg-transparent border border-[var(--border-subtle)] focus:border-[var(--ink-primary)] rounded-xs outline-none"
                />
              </div>
              <div class="space-y-1.5">
                <label class="block text-xs font-mono-archive text-[var(--ink-muted)]">代码仓 / 访问外链 (可选)</label>
                <input
                  v-model="projGithubUrl"
                  type="url"
                  placeholder="https://github.com/..."
                  class="w-full px-3 py-2 text-xs font-mono-archive bg-transparent border border-[var(--border-subtle)] focus:border-[var(--ink-primary)] rounded-xs outline-none"
                />
              </div>
            </div>
          </div>
        </template>

        <!-- 普通 Life Entry 表单分支 (生活 / 想法 / 照片 / 收藏) -->
        <template v-else>
          <!-- 标题 (可选) -->
          <div class="space-y-1.5">
            <label class="block text-xs font-mono-archive text-[var(--ink-muted)]">
              标题 (可选)
            </label>
            <input
              v-model="title"
              type="text"
              placeholder="给这条记录一个简短标题……"
              class="w-full px-3 py-2 text-base font-serif-editorial bg-transparent border border-[var(--border-subtle)] focus:border-[var(--ink-primary)] rounded-xs outline-none"
            />
          </div>

          <!-- 内容主体 (必填) -->
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
            :storageConfigured="storageConfigured"
            @update:attachments="attachmentIds = $event"
          />

          <!-- 发生时间与地点 -->
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div class="space-y-1.5">
              <label class="block text-xs font-mono-archive text-[var(--ink-muted)]">发生时间</label>
              <input
                v-model="occurredAt"
                type="datetime-local"
                class="w-full px-3 py-2 text-xs font-mono-archive bg-transparent border border-[var(--border-subtle)] focus:border-[var(--ink-primary)] rounded-xs outline-none"
              />
            </div>

            <div class="space-y-1.5">
              <label class="block text-xs font-mono-archive text-[var(--ink-muted)]">地点 (可选)</label>
              <input
                v-model="location"
                type="text"
                placeholder="例如：城市 · 地点"
                class="w-full px-3 py-2 text-xs font-serif-editorial bg-transparent border border-[var(--border-subtle)] focus:border-[var(--ink-primary)] rounded-xs outline-none"
              />
            </div>
          </div>

          <!-- 标签 (可选) -->
          <div class="space-y-1.5">
            <label class="block text-xs font-mono-archive text-[var(--ink-muted)]">
              标签 (可选，逗号分隔)
            </label>
            <input
              v-model="tags"
              type="text"
              placeholder="例如：胶片, 摄影, 秋天, 漫游"
              class="w-full px-3 py-2 text-xs font-serif-editorial bg-transparent border border-[var(--border-subtle)] focus:border-[var(--ink-primary)] rounded-xs outline-none"
            />
          </div>

          <!-- 项目关联 (可选) -->
          <div v-if="projects && projects.length > 0" class="space-y-1.5">
            <label class="block text-xs font-mono-archive text-[var(--ink-muted)]">关联造物项目 (可选)</label>
            <select
              v-model="selectedProjectId"
              class="w-full px-3 py-2 text-xs font-serif-editorial bg-transparent border border-[var(--border-subtle)] focus:border-[var(--ink-primary)] rounded-xs outline-none"
            >
              <option :value="null">不关联项目</option>
              <option v-for="p in projects" :key="p.id" :value="p.id">{{ p.title }}</option>
            </select>
          </div>
        </template>

        <!-- 发生时间 (记账时置底) -->
        <div v-if="selectedKind === 'transaction'" class="space-y-1.5">
          <label class="block text-xs font-mono-archive text-[var(--ink-muted)]">记录时间</label>
          <input
            v-model="occurredAt"
            type="datetime-local"
            class="w-full px-3 py-2 text-xs font-mono-archive bg-transparent border border-[var(--border-subtle)] focus:border-[var(--ink-primary)] rounded-xs outline-none"
          />
        </div>

        <!-- 操作按钮 -->
        <div class="pt-6 border-t border-[var(--border-subtle)] flex items-center justify-end gap-3">
          <button
            type="button"
            @click="handleClose"
            class="px-4 py-2 text-xs font-mono-archive text-[var(--ink-muted)] hover:text-[var(--ink-primary)] transition-colors cursor-pointer"
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
