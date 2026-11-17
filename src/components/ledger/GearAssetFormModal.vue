<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { X } from 'lucide-vue-next'
import { addGearAsset, fetchCreditChannels } from '../../utils/api'
import type { CreditChannel, GearItem } from '../../types'
import { useCategories } from '../../composables/useCategories'
import { getBeijingDateString, parseYuanToCents } from '../../utils/format'
import { useBodyScrollLock } from '../../composables/useBodyScrollLock'
import { useEscapeClose } from '../../composables/useEscapeClose'
import PaperSelect from '../PaperSelect.vue'
import PaperDatePicker from '../PaperDatePicker.vue'

const props = defineProps<{
  isOpen: boolean
  creditChannels?: CreditChannel[]
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'created', gear: GearItem): void
}>()

const {
  gearCategories,
  paymentMethods,
  loadCategories,
  openCategoryManager,
} = useCategories()

const localChannels = ref<CreditChannel[]>([])
const channels = computed<CreditChannel[]>(() =>
  props.creditChannels !== undefined ? props.creditChannels : localChannels.value,
)

const name = ref('')
const category = ref('数码器材')
const spec = ref('')
const priceYuan = ref('')
const purchaseDate = ref(getBeijingDateString())
const paymentMethod = ref('')
const note = ref('')
const createTx = ref(true)
const isInstallment = ref(false)
const installmentChannel = ref('huabei')
const installmentMonths = ref(12)

const isSubmitting = ref(false)
const errorMsg = ref<string | null>(null)

watch(
  () => props.isOpen,
  async (open) => {
    if (!open) return
    loadCategories()
    if (props.creditChannels === undefined) {
      try {
        localChannels.value = await fetchCreditChannels()
      } catch {
        localChannels.value = []
      }
    }
    name.value = ''
    category.value = gearCategories.value[0] || '数码器材'
    spec.value = ''
    priceYuan.value = ''
    purchaseDate.value = getBeijingDateString()
    paymentMethod.value = ''
    note.value = ''
    createTx.value = true
    isInstallment.value = false
    installmentChannel.value = channels.value[0]?.code || ''
    installmentMonths.value = 12
    errorMsg.value = null
  },
  { immediate: true },
)

watch(channels, (list) => {
  if (list.length > 0 && !installmentChannel.value) {
    installmentChannel.value = list[0].code
  }
})

const handleClose = () => {
  if (isSubmitting.value) return
  emit('close')
}

useBodyScrollLock(() => props.isOpen)
useEscapeClose(() => props.isOpen, handleClose)

const handleSubmit = async () => {
  if (!name.value.trim()) {
    errorMsg.value = '请填写设备名称'
    return
  }

  const parsedPrice = parseYuanToCents(priceYuan.value, {
    allowEmpty: true,
    allowZero: true,
    fieldLabel: '购入原值',
  })
  if (!parsedPrice.ok) {
    errorMsg.value = parsedPrice.error
    return
  }
  const priceCents = parsedPrice.cents
  const shouldCreateTx = createTx.value && priceCents > 0
  const useInstallment = shouldCreateTx && isInstallment.value && channels.value.length > 0

  const matchedCh = channels.value.find((c) => c.code === installmentChannel.value)
  const repDay = matchedCh ? matchedCh.repayment_day : 10

  try {
    isSubmitting.value = true
    errorMsg.value = null
    const res = await addGearAsset({
      name: name.value.trim(),
      category: category.value,
      spec: spec.value.trim() || undefined,
      price_cents: priceCents > 0 ? priceCents : undefined,
      purchase_date: purchaseDate.value || undefined,
      payment_method:
        shouldCreateTx && !useInstallment && paymentMethod.value
          ? paymentMethod.value
          : undefined,
      note: note.value.trim() || undefined,
      create_transaction: shouldCreateTx,
      is_installment: useInstallment,
      installment_channel_code: useInstallment ? installmentChannel.value : undefined,
      installment_total_amount: useInstallment ? priceCents : undefined,
      installment_months: useInstallment ? installmentMonths.value : undefined,
      repayment_day: useInstallment ? repDay : undefined,
    })
    const createdGear = ((res as any)?.gear || res) as GearItem
    emit('created', createdGear)
    emit('close')
  } catch (err: any) {
    errorMsg.value = err?.message || '录入设备失败'
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
    aria-label="录入固定资产设备"
    class="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/45 backdrop-blur-xs animate-in fade-in duration-200"
    @click.self="handleClose"
  >
    <div class="bg-[var(--bg-archive)] border border-[var(--border-subtle)] p-6 rounded-xs w-full max-w-lg space-y-4 max-h-[90dvh] overflow-y-auto text-left pb-[max(1.5rem,env(safe-area-inset-bottom,1.5rem))]">
      <div class="flex items-center justify-between pb-3 border-b border-[var(--border-subtle)]">
        <div>
          <h3 class="font-serif-editorial text-lg font-medium text-[var(--ink-primary)]">
            录入随身与固定资产设备
          </h3>
          <p class="font-mono-archive text-[11px] text-[var(--ink-muted)]">
            沉淀长伴身边的硬件器材，支持同步生成购置支出或分期账单
          </p>
        </div>
        <button
          type="button"
          @click="handleClose"
          aria-label="关闭"
          class="text-[var(--ink-muted)] hover:text-[var(--ink-primary)] cursor-pointer"
        >
          <X class="w-4 h-4" />
        </button>
      </div>

      <div v-if="errorMsg" class="p-2.5 bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-300 text-xs font-mono-archive rounded-xs border border-red-200 dark:border-red-800/40">
        {{ errorMsg }}
      </div>

      <div class="space-y-4 text-xs font-mono-archive">
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label class="block text-[var(--ink-muted)] mb-1">设备名称 *</label>
            <input
              v-model="name"
              type="text"
              class="w-full px-3 py-2 text-sm border border-[var(--border-subtle)] focus:border-[var(--ink-primary)] rounded-xs outline-none bg-transparent text-[var(--ink-primary)] font-serif-editorial"
            />
          </div>
          <div>
            <div class="flex items-center justify-between mb-1">
              <label class="block text-[var(--ink-muted)]">所属分类 *</label>
              <button
                type="button"
                @click="openCategoryManager('gear')"
                class="text-[11px] text-[var(--ink-secondary)] hover:text-[var(--ink-primary)] underline underline-offset-4 cursor-pointer"
              >
                管理分类
              </button>
            </div>
            <PaperSelect
              v-model="category"
              :options="gearCategories.map((c) => ({ value: c, label: c }))"
            />
          </div>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label class="block text-[var(--ink-muted)] mb-1">购入原值 (¥)</label>
            <input
              v-model="priceYuan"
              type="number"
              step="0.01"
              min="0"
              placeholder="0.00"
              class="w-full px-3 py-2 text-sm border border-[var(--border-subtle)] focus:border-[var(--ink-primary)] rounded-xs outline-none bg-transparent text-[var(--ink-primary)]"
            />
          </div>
          <div>
            <label class="block text-[var(--ink-muted)] mb-1">购入日期</label>
            <PaperDatePicker v-model="purchaseDate" />
          </div>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label class="block text-[var(--ink-muted)] mb-1">规格型号</label>
            <input
              v-model="spec"
              type="text"
              class="w-full px-3 py-2 text-xs border border-[var(--border-subtle)] focus:border-[var(--ink-primary)] rounded-xs outline-none bg-transparent text-[var(--ink-primary)]"
            />
          </div>
          <div>
            <label class="block text-[var(--ink-muted)] mb-1">体验随记</label>
            <input
              v-model="note"
              type="text"
              class="w-full px-3 py-2 text-xs border border-[var(--border-subtle)] focus:border-[var(--ink-primary)] rounded-xs outline-none bg-transparent text-[var(--ink-primary)] font-serif-editorial"
            />
          </div>
        </div>

        <div class="p-3 rounded-xs border border-[var(--border-subtle)] bg-[var(--bg-subtle)]/30 space-y-3">
          <label class="flex items-center gap-2 cursor-pointer select-none">
            <input
              v-model="createTx"
              type="checkbox"
              class="rounded-xs cursor-pointer accent-[var(--ink-primary)]"
            />
            <span class="text-[var(--ink-primary)]">
              同步生成一笔「设备购置」支出账目流水
            </span>
          </label>

          <div
            class="space-y-3 pt-1 transition-opacity"
            :class="createTx ? '' : 'opacity-50 pointer-events-none'"
          >
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
                v-model="paymentMethod"
                size="sm"
                :disabled="!createTx || isInstallment"
                :options="[
                  { value: '', label: '默认（设备购置）' },
                  ...paymentMethods.map((pm) => ({ value: pm, label: pm })),
                ]"
              />
            </div>

            <label class="flex items-center gap-2 cursor-pointer select-none">
              <input
                v-model="isInstallment"
                type="checkbox"
                :disabled="!createTx || channels.length === 0"
                class="rounded-xs cursor-pointer accent-[var(--ink-primary)] disabled:opacity-40 disabled:cursor-not-allowed"
              />
              <span class="text-[var(--ink-secondary)]" :class="channels.length === 0 ? 'opacity-40' : ''">
                该设备使用信贷分期购入
              </span>
            </label>

            <p
              class="min-h-[14px] text-[10px] text-[var(--ink-muted)] transition-opacity"
              :class="channels.length === 0 ? '' : 'opacity-0 pointer-events-none'"
            >
              请先在信贷渠道管理添加分期渠道
            </p>

            <div
              class="grid grid-cols-2 gap-3 transition-opacity"
              :class="isInstallment && channels.length > 0 ? '' : 'opacity-50 pointer-events-none'"
            >
              <div>
                <label class="block text-[var(--ink-muted)] mb-1">分期渠道</label>
                <PaperSelect
                  v-model="installmentChannel"
                  size="sm"
                  :disabled="!(isInstallment && channels.length > 0)"
                  :options="channels.map((c) => ({ value: c.code, label: `${c.name} (${c.repayment_day}日)` }))"
                />
              </div>
              <div>
                <label class="block text-[var(--ink-muted)] mb-1">分期期数</label>
                <PaperSelect
                  v-model="installmentMonths"
                  size="sm"
                  :disabled="!(isInstallment && channels.length > 0)"
                  :options="[3, 6, 12, 24].map((m) => ({ value: m, label: `${m} 期` }))"
                />
              </div>
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
          :disabled="isSubmitting"
          @click="handleSubmit"
          class="px-4 py-1.5 text-xs font-mono-archive bg-[var(--ink-primary)] text-[var(--bg-archive)] rounded-xs cursor-pointer hover:opacity-90 disabled:opacity-50"
        >
          {{ isSubmitting ? '录入中...' : '确认入库' }}
        </button>
      </div>
    </div>
  </div>
</template>
