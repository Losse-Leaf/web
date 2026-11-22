<script setup lang="ts">
import { computed } from 'vue'
import type { CreditChannel, Wish } from '../../types'
import { useCategories } from '../../composables/useCategories'
import { formatMoney } from '../../utils/format'
import PaperSelect from '../PaperSelect.vue'
import PaperDatePicker from '../PaperDatePicker.vue'

const props = defineProps<{
  txAmount: string
  txType: 'expense' | 'income'
  txCategory: string
  title: string
  txPaymentMethod: string
  txNote: string
  selectedWishId: number | null
  isInstallment: boolean
  installmentChannel: string
  installmentMonths: number
  occurredAt: string
  availableWishes: Wish[]
  creditChannels: CreditChannel[]
  effectiveRepaymentDay: number
}>()

const emit = defineEmits<{
  (e: 'update:txAmount', val: string): void
  (e: 'update:txType', val: 'expense' | 'income'): void
  (e: 'update:txCategory', val: string): void
  (e: 'update:title', val: string): void
  (e: 'update:txPaymentMethod', val: string): void
  (e: 'update:txNote', val: string): void
  (e: 'update:selectedWishId', val: number | null): void
  (e: 'update:isInstallment', val: boolean): void
  (e: 'update:installmentChannel', val: string): void
  (e: 'update:installmentMonths', val: number): void
  (e: 'update:occurredAt', val: string): void
  (e: 'wishSelected'): void
}>()

const {
  expenseCategories,
  incomeCategories,
  paymentMethods,
  openCategoryManager,
} = useCategories()

const currentTxCategories = computed(() =>
  props.txType === 'income' ? incomeCategories.value : expenseCategories.value,
)

const calculatedMonthlyPay = computed(() => {
  const amtFloat = parseFloat(props.txAmount)
  if (isNaN(amtFloat) || amtFloat <= 0) return '0.00'
  const cents = Math.floor((amtFloat * 100) / (props.installmentMonths || 1))
  return (cents / 100).toFixed(2)
})
</script>

<template>
  <div class="space-y-5">
    <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <div class="space-y-1.5">
        <label class="block text-xs font-mono-archive text-[var(--ink-muted)]">金额 (¥) *</label>
        <div class="relative">
          <span class="absolute left-3 top-2.5 text-sm font-mono-archive text-[var(--ink-muted)]">¥</span>
          <input
            :value="txAmount"
            @input="emit('update:txAmount', ($event.target as HTMLInputElement).value)"
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
            @click="emit('update:txType', 'expense')"
            class="flex-1 py-2 text-xs font-serif-editorial rounded-xs border transition-colors cursor-pointer"
            :class="txType === 'expense' ? 'border-[var(--ink-primary)] font-bold text-[var(--ink-primary)] bg-[var(--bg-subtle)]' : 'border-[var(--border-subtle)] text-[var(--ink-muted)]'"
          >
            支出
          </button>
          <button
            type="button"
            @click="emit('update:txType', 'income')"
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
          @click="emit('update:txCategory', cat)"
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
          :value="title"
          @input="emit('update:title', ($event.target as HTMLInputElement).value)"
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
          :modelValue="txPaymentMethod"
          @update:modelValue="emit('update:txPaymentMethod', $event)"
          :options="paymentMethods.map((m) => ({ value: m, label: m }))"
          :disabled="isInstallment"
        />
        <p class="mt-1 text-[10px] font-mono-archive text-[var(--ink-muted)] transition-opacity" :class="isInstallment ? 'opacity-100' : 'opacity-0'">
          分期账目由所选信贷渠道代扣，支付方式随分期渠道生效，不再单独记录
        </p>
      </div>
    </div>

    <div class="space-y-1.5">
      <label class="block text-xs font-mono-archive text-[var(--ink-muted)]">备注说明</label>
      <input
        :value="txNote"
        @input="emit('update:txNote', ($event.target as HTMLInputElement).value)"
        type="text"
        class="w-full px-3 py-2 text-sm bg-transparent border border-[var(--border-subtle)] focus:border-[var(--ink-primary)] rounded-xs outline-none font-serif-editorial"
      />
    </div>

    <!-- 联动心愿单 -->
    <div class="space-y-1.5 transition-opacity" :class="txType === 'expense' && availableWishes.length > 0 ? '' : 'opacity-50 pointer-events-none'">
      <label class="block text-xs font-mono-archive text-[var(--ink-muted)]">关联心愿清单 (自动达成归册)</label>
      <PaperSelect
        :modelValue="selectedWishId"
        @update:modelValue="emit('update:selectedWishId', $event)"
        @change="emit('wishSelected')"
        :disabled="txType !== 'expense' || availableWishes.length === 0"
        :options="[
          { value: null, label: '-- 不关联心愿 --' },
          ...availableWishes.map((w) => ({
            value: w.id,
            label: `${w.title} (预算: ¥${formatMoney(w.budget)})`,
          })),
        ]"
      />
    </div>

    <!-- 分期付款支持 -->
    <div class="p-3 rounded-xs border border-[var(--border-subtle)] bg-[var(--bg-subtle)]/30 space-y-2.5 transition-opacity" :class="txType === 'expense' ? '' : 'opacity-50 pointer-events-none'">
      <div class="flex items-center gap-2">
        <input
          id="isInstallmentCheckbox"
          :checked="isInstallment"
          @change="emit('update:isInstallment', ($event.target as HTMLInputElement).checked)"
          type="checkbox"
          :disabled="txType !== 'expense' || creditChannels.length === 0"
          class="rounded-xs cursor-pointer accent-[var(--ink-primary)] disabled:opacity-40 disabled:cursor-not-allowed"
        />
        <label for="isInstallmentCheckbox" class="text-xs font-mono-archive text-[var(--ink-primary)] cursor-pointer select-none" :class="creditChannels.length === 0 ? 'opacity-40' : ''">
          分期付款 (花呗 / 京东白条 / 信用卡等信贷渠道)
        </label>
      </div>

      <p v-if="creditChannels.length === 0" class="text-[10px] font-mono-archive text-[var(--ink-muted)]">
        请先在信贷渠道管理添加分期渠道
      </p>

      <div class="space-y-3 pt-1 text-xs font-mono-archive transition-opacity" :class="txType === 'expense' && isInstallment && creditChannels.length > 0 ? '' : 'opacity-50 pointer-events-none'">
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label class="block text-[var(--ink-muted)] mb-1">分期渠道</label>
            <PaperSelect
              :modelValue="installmentChannel"
              @update:modelValue="emit('update:installmentChannel', $event)"
              size="sm"
              :disabled="txType !== 'expense' || !isInstallment || creditChannels.length === 0"
              :options="
                creditChannels.map((ch) => ({
                  value: ch.code,
                  label: `${ch.name} (每月 ${ch.repayment_day} 日还款)`,
                }))
              "
            />
          </div>
          <div>
            <label class="block text-[var(--ink-muted)] mb-1">分期期数</label>
            <div class="flex gap-1.5">
              <button
                v-for="m in [3, 6, 12, 24]"
                :key="m"
                type="button"
                @click="emit('update:installmentMonths', m)"
                :disabled="txType !== 'expense' || !isInstallment || creditChannels.length === 0"
                class="flex-1 py-1 text-xs border rounded-xs transition-colors cursor-pointer text-center"
                :class="installmentMonths === m ? 'border-[var(--ink-primary)] bg-[var(--ink-primary)] text-[var(--bg-archive)] font-medium' : 'border-[var(--border-subtle)] text-[var(--ink-muted)]'"
              >
                {{ m }}期
              </button>
            </div>
          </div>
        </div>

        <div class="p-2 rounded-xs bg-[var(--bg-archive)] border border-[var(--border-subtle)] text-[11px] text-[var(--ink-secondary)] flex items-center justify-between">
          <span>每期月供测算（整除口径，末期含尾差）：<strong class="text-[var(--ink-primary)] tabular-nums inline-block min-w-[6rem] text-right">¥{{ calculatedMonthlyPay }}</strong> / 期</span>
          <span>绑定还款日：<strong>每月 {{ effectiveRepaymentDay }} 日</strong></span>
        </div>
      </div>
    </div>

    <div class="space-y-1.5">
      <label class="block text-xs font-mono-archive text-[var(--ink-muted)]">入账时间</label>
      <PaperDatePicker
        :modelValue="occurredAt"
        @update:modelValue="emit('update:occurredAt', $event)"
        enableTime
      />
    </div>
  </div>
</template>
