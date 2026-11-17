<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { X } from 'lucide-vue-next'
import { updateTransaction } from '../../utils/api'
import type { CreditChannel, Transaction } from '../../types'
import { useCategories } from '../../composables/useCategories'
import {
  centsToInputYuan,
  getBeijingISOString,
  getBeijingNow,
  parseOccurredDate,
  parseYuanToCents,
} from '../../utils/format'
import { useBodyScrollLock } from '../../composables/useBodyScrollLock'
import { useEscapeClose } from '../../composables/useEscapeClose'
import PaperSelect from '../PaperSelect.vue'
import PaperDatePicker from '../PaperDatePicker.vue'
import CityPicker from '../CityPicker.vue'

const props = defineProps<{
  transaction: Transaction | null
  creditChannels: CreditChannel[]
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'saved', tx: Transaction): void
}>()

const {
  expenseCategories,
  incomeCategories,
  paymentMethods: paymentMethodsList,
  openCategoryManager,
} = useCategories()

const editTitle = ref('')
const editAmount = ref('')
const editCategory = ref('餐饮')
const editType = ref<'expense' | 'income'>('expense')
const editNote = ref('')
const editPaymentMethod = ref('')
const editOccurredAt = ref('')
const editErrorMsg = ref('')
const editCityCode = ref('')
const editIsInstallment = ref(false)
const editInstallmentChannel = ref('huabei')
const editInstallmentMonths = ref(12)
const editInstallmentRemainMonths = ref(12)
const isSaving = ref(false)

watch(
  () => props.transaction,
  (tx) => {
    if (!tx) return
    editErrorMsg.value = ''
    editTitle.value = tx.title
    editAmount.value = centsToInputYuan(tx.amount)
    editCategory.value = tx.category
    editType.value = tx.type
    editNote.value = tx.note || ''
    editPaymentMethod.value = tx.payment_method || ''
    editOccurredAt.value = tx.occurred_at
      ? `${parseOccurredDate(tx.occurred_at).dateKey}T${parseOccurredDate(tx.occurred_at).time}`
      : ''
    editCityCode.value = tx.city_code || ''
    editIsInstallment.value = Boolean(tx.is_installment)
    editInstallmentChannel.value = tx.installment_channel_code || 'huabei'
    editInstallmentMonths.value = tx.installment_months || 12
    editInstallmentRemainMonths.value = tx.installment_remain_months ?? (tx.installment_months || 12)
  },
  { immediate: true },
)

const editCategoriesList = computed(() =>
  editType.value === 'income' ? incomeCategories.value : expenseCategories.value,
)

watch(editType, (t) => {
  const list = t === 'income' ? incomeCategories.value : expenseCategories.value
  if (!list.includes(editCategory.value)) {
    editCategory.value = list[0] || (t === 'income' ? '工资收入' : '餐饮')
  }
})

const editRepaymentDay = computed(() => {
  const matched = props.creditChannels.find((c) => c.code === editInstallmentChannel.value)
  if (matched && matched.repayment_day > 0) return matched.repayment_day
  return props.transaction?.repayment_day || 10
})

const calcAutoRemainMonths = (occurredAt: string, totalMonths: number, repaymentDay: number): number => {
  if (!Number.isFinite(totalMonths) || totalMonths <= 0) totalMonths = 12
  const day = Math.min(31, Math.max(1, Math.round(repaymentDay) || 10))
  if (!occurredAt) return totalMonths
  const parsed = parseOccurredDate(occurredAt)
  const purchase = Date.UTC(Number(parsed.year), Number(parsed.month) - 1, Number(parsed.day))
  const now = getBeijingNow()
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  if (today <= purchase) return totalMonths
  let y = Number(parsed.year)
  let m = Number(parsed.month)
  let paid = 0
  while (paid < totalMonths) {
    const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate()
    const repDate = Date.UTC(y, m - 1, Math.min(day, daysInMonth))
    if (repDate > today) break
    if (repDate > purchase) paid++
    m++
    if (m > 12) {
      m = 1
      y++
    }
  }
  return Math.max(0, totalMonths - Math.min(paid, totalMonths))
}

const editRemainMax = computed(() => {
  if (!props.transaction) return 60
  const months = Math.max(1, Math.round(Number(editInstallmentMonths.value)) || 12)
  const auto = calcAutoRemainMonths(
    props.transaction.occurred_at || '',
    months,
    editRepaymentDay.value,
  )
  return Math.max(0, Math.min(months, auto))
})

const handleClose = () => {
  if (isSaving.value) return
  emit('close')
}

useBodyScrollLock(() => Boolean(props.transaction))
useEscapeClose(() => Boolean(props.transaction), handleClose)

const saveEdit = async () => {
  if (!props.transaction || isSaving.value) return
  editErrorMsg.value = ''

  const parsedAmount = parseYuanToCents(editAmount.value, { fieldLabel: '金额' })
  if (!parsedAmount.ok) {
    editErrorMsg.value = parsedAmount.error
    return
  }
  const amountCents = parsedAmount.cents

  const wantInstallmentNow = editType.value === 'expense' && editIsInstallment.value
  if (wantInstallmentNow) {
    const months = Math.round(Number(editInstallmentMonths.value))
    const remainRaw = String(editInstallmentRemainMonths.value ?? '').trim()
    if (remainRaw === '') {
      editErrorMsg.value = '请填写剩余期数'
      return
    }
    const remain = Math.round(Number(remainRaw))
    if (!Number.isFinite(months) || months < 1 || months > 60) {
      editErrorMsg.value = '分期总期数必须在 1 至 60 期之间'
      return
    }
    if (!Number.isFinite(remain) || remain < 0 || remain > editRemainMax.value) {
      editErrorMsg.value = `剩余期数必须在 0 至 ${editRemainMax.value} 期之间（服务端按时间推算，只允许向下校准）`
      return
    }
    editInstallmentMonths.value = months
    editInstallmentRemainMonths.value = remain
  }

  const wasInstallment = Boolean(props.transaction.is_installment)
  const wantInstallment = editType.value === 'expense' && editIsInstallment.value
  const cancelInstallment = !wantInstallment && wasInstallment
  const monthlyPay =
    wantInstallment && editInstallmentMonths.value > 0
      ? Math.floor(amountCents / editInstallmentMonths.value)
      : undefined
  const clearCity = !editCityCode.value && Boolean(props.transaction.city_code)

  try {
    isSaving.value = true
    const payload: Parameters<typeof updateTransaction>[1] = {
      title: editTitle.value.trim() || editCategory.value,
      amount: amountCents,
      type: editType.value,
      category: editCategory.value,
      note: editNote.value.trim(),
      payment_method: editPaymentMethod.value.trim() || undefined,
      occurred_at: editOccurredAt.value ? getBeijingISOString(editOccurredAt.value) : undefined,
      city_code: editCityCode.value || undefined,
      clear_city: clearCity || undefined,
      is_installment: wantInstallment,
      installment_channel_code: wantInstallment ? editInstallmentChannel.value : undefined,
      installment_total_amount: wantInstallment ? amountCents : undefined,
      installment_months: wantInstallment ? editInstallmentMonths.value : undefined,
      installment_monthly_pay: wantInstallment ? monthlyPay : undefined,
      installment_remain_months: wantInstallment ? editInstallmentRemainMonths.value : undefined,
      repayment_day: wantInstallment ? editRepaymentDay.value : undefined,
    }
    if (cancelInstallment) payload.clear_installment = true

    const updated = await updateTransaction(props.transaction.id, payload)
    emit('saved', updated)
    emit('close')
  } catch (err: any) {
    editErrorMsg.value = err?.message || '保存账目失败，请稍后重试'
  } finally {
    isSaving.value = false
  }
}
</script>

<template>
  <div
    v-if="transaction"
    role="dialog"
    aria-modal="true"
    aria-label="修改账目"
    class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/45 backdrop-blur-xs animate-in fade-in duration-200"
    @click.self="handleClose"
  >
    <div class="bg-[var(--bg-archive)] border border-[var(--border-subtle)] p-6 rounded-xs w-full max-w-lg space-y-4 max-h-[90dvh] overflow-y-auto text-left">
      <div class="flex items-center justify-between pb-2 border-b border-[var(--border-subtle)]">
        <h3 class="font-serif-editorial text-lg font-medium text-[var(--ink-primary)]">
          修改账目
        </h3>
        <button
          type="button"
          @click="handleClose"
          aria-label="关闭"
          class="text-[var(--ink-muted)] hover:text-[var(--ink-primary)] cursor-pointer"
        >
          <X class="w-4 h-4" />
        </button>
      </div>

      <div class="space-y-4 text-xs font-mono-archive">
        <!-- 收支类型切换 -->
        <div class="flex items-center gap-2">
          <button
            type="button"
            @click="editType = 'expense'"
            class="flex-1 py-1.5 rounded-xs border text-center transition-all cursor-pointer"
            :class="editType === 'expense'
              ? 'border-[var(--accent-warm)] bg-[var(--accent-warm)] text-white font-medium shadow-xs'
              : 'border-[var(--border-subtle)] text-[var(--ink-muted)] hover:border-[var(--border-divider)]'"
          >
            支出
          </button>
          <button
            type="button"
            @click="editType = 'income'"
            class="flex-1 py-1.5 rounded-xs border text-center transition-all cursor-pointer"
            :class="editType === 'income'
              ? 'border-emerald-700 bg-emerald-700 text-white font-medium shadow-xs'
              : 'border-[var(--border-subtle)] text-[var(--ink-muted)] hover:border-[var(--border-divider)]'"
          >
            收入
          </button>
        </div>

        <!-- 金额与事项名称 -->
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="block text-[var(--ink-muted)] mb-1">金额 (¥) *</label>
            <input
              v-model="editAmount"
              type="number"
              step="0.01"
              placeholder="0.00"
              class="w-full px-3 py-1.5 text-sm border border-[var(--border-subtle)] focus:border-[var(--ink-primary)] rounded-xs outline-none bg-transparent text-[var(--ink-primary)]"
            />
            <p
              class="mt-1 min-h-[18px] truncate text-[11px] text-[var(--accent-vermilion)] transition-opacity"
              :class="editErrorMsg ? '' : 'opacity-0 pointer-events-none'"
            >
              {{ editErrorMsg }}
            </p>
          </div>
          <div>
            <label class="block text-[var(--ink-muted)] mb-1">事项名称 *</label>
            <input
              v-model="editTitle"
              type="text"
              class="w-full px-3 py-1.5 text-sm border border-[var(--border-subtle)] focus:border-[var(--ink-primary)] rounded-xs outline-none bg-transparent text-[var(--ink-primary)] font-serif-editorial"
            />
          </div>
        </div>

        <!-- 分类胶囊选择 -->
        <div>
          <div class="flex items-center justify-between mb-1.5">
            <label class="block text-[var(--ink-muted)]">分类</label>
            <button
              type="button"
              @click="openCategoryManager(editType === 'income' ? 'income' : 'expense')"
              class="text-[11px] text-[var(--ink-secondary)] hover:text-[var(--ink-primary)] underline underline-offset-4 cursor-pointer"
            >
              管理分类
            </button>
          </div>
          <div class="flex flex-wrap gap-1.5">
            <button
              v-for="cat in editCategoriesList"
              :key="cat"
              type="button"
              @click="editCategory = cat"
              class="px-2.5 py-1 rounded-xs border text-[11px] transition-all cursor-pointer"
              :class="editCategory === cat
                ? 'border-[var(--ink-primary)] bg-[var(--ink-primary)] text-[var(--bg-archive)] font-medium shadow-xs'
                : 'border-[var(--border-subtle)] text-[var(--ink-secondary)] hover:border-[var(--border-divider)]'"
            >
              {{ cat }}
            </button>
          </div>
        </div>

        <!-- 支付方式与发生时间 -->
        <div class="grid grid-cols-2 gap-3">
          <div>
            <div class="flex items-center justify-between mb-1">
              <label class="block text-[var(--ink-muted)]">支付方式</label>
              <button
                type="button"
                @click="openCategoryManager('payment')"
                class="text-[11px] text-[var(--ink-secondary)] hover:text-[var(--ink-primary)] underline underline-offset-4 cursor-pointer"
              >
                管理渠道
              </button>
            </div>
            <PaperSelect
              v-model="editPaymentMethod"
              size="sm"
              :options="paymentMethodsList.map((pm) => ({ value: pm, label: pm }))"
            />
          </div>
          <div>
            <label class="block text-[var(--ink-muted)] mb-1">记录时间</label>
            <PaperDatePicker
              v-model="editOccurredAt"
              enableTime
              size="sm"
            />
          </div>
        </div>

        <!-- 城市坐标与备注 -->
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label class="block text-[var(--ink-muted)] mb-1">关联城市</label>
            <CityPicker v-model="editCityCode" />
          </div>
          <div>
            <label class="block text-[var(--ink-muted)] mb-1">备注说明</label>
            <input
              v-model="editNote"
              type="text"
              class="w-full px-3 py-1.5 text-xs border border-[var(--border-subtle)] focus:border-[var(--ink-primary)] rounded-xs outline-none bg-transparent text-[var(--ink-primary)]"
            />
          </div>
        </div>

        <!-- 分期付款参数校准 -->
        <div
          class="p-3 rounded-xs border border-[var(--border-subtle)] bg-[var(--bg-subtle)]/30 space-y-3 transition-opacity"
          :class="editType === 'expense' ? '' : 'opacity-50 pointer-events-none'"
        >
          <div class="flex items-center gap-2">
            <input
              id="editTxInstallmentCheck"
              v-model="editIsInstallment"
              type="checkbox"
              :disabled="editType !== 'expense'"
              class="rounded-xs cursor-pointer accent-[var(--ink-primary)] disabled:opacity-40 disabled:cursor-not-allowed"
            />
            <label for="editTxInstallmentCheck" class="text-[var(--ink-primary)] cursor-pointer select-none">
              信贷分期账目 (校准总期数与剩余待还期数)
            </label>
          </div>

          <div
            class="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-1 transition-opacity"
            :class="editIsInstallment ? '' : 'opacity-50 pointer-events-none'"
          >
            <div class="col-span-2">
              <label class="block text-[var(--ink-muted)] mb-1">分期渠道</label>
              <PaperSelect
                v-model="editInstallmentChannel"
                size="sm"
                :disabled="!editIsInstallment || creditChannels.length === 0"
                :options="creditChannels.map((c) => ({ value: c.code, label: c.name }))"
              />
              <p class="mt-1 text-[10px] text-[var(--ink-muted)]">
                还款日随渠道配置：每月 {{ editRepaymentDay }} 日
              </p>
              <p
                class="mt-1 min-h-[14px] text-[10px] text-[var(--ink-muted)] transition-opacity"
                :class="creditChannels.length === 0 ? '' : 'opacity-0 pointer-events-none'"
              >
                渠道列表未加载，保存将保留原渠道与还款日
              </p>
            </div>
            <div>
              <label class="block text-[var(--ink-muted)] mb-1">总期数</label>
              <input
                v-model.number="editInstallmentMonths"
                type="number"
                min="1"
                max="60"
                :disabled="!editIsInstallment"
                class="w-full px-2 py-1 text-xs border border-[var(--border-subtle)] rounded-xs bg-transparent"
              />
            </div>
            <div>
              <label class="block text-[var(--ink-muted)] mb-1">剩余期数</label>
              <input
                v-model.number="editInstallmentRemainMonths"
                type="number"
                min="0"
                :max="editRemainMax"
                :disabled="!editIsInstallment"
                class="w-full px-2 py-1 text-xs border border-[var(--border-subtle)] rounded-xs bg-transparent"
              />
              <p class="mt-1 text-[10px] text-[var(--ink-muted)]">
                上限 {{ editRemainMax }} 期，服务端按时间推算、只允许向下校准
              </p>
            </div>
          </div>
        </div>
      </div>

      <div class="flex items-center justify-end gap-3 pt-3 border-t border-[var(--border-subtle)]">
        <button
          type="button"
          @click="handleClose"
          class="px-3 py-1.5 text-xs font-mono-archive text-[var(--ink-muted)] hover:text-[var(--ink-primary)] cursor-pointer"
        >
          取消
        </button>
        <button
          type="button"
          @click="saveEdit"
          :disabled="isSaving"
          class="px-4 py-1.5 text-xs font-mono-archive bg-[var(--ink-primary)] text-[var(--bg-archive)] rounded-xs cursor-pointer hover:opacity-90 disabled:opacity-50"
        >
          {{ isSaving ? '保存中...' : '保存修改' }}
        </button>
      </div>
    </div>
  </div>
</template>
