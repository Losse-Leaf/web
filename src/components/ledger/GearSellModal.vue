<script setup lang="ts">
import { ref, watch } from 'vue'
import { X } from 'lucide-vue-next'
import { sellGearAsset } from '../../utils/api'
import type { GearItem } from '../../types'
import { formatMoney, getBeijingDateString, parseYuanToCents } from '../../utils/format'
import { useBodyScrollLock } from '../../composables/useBodyScrollLock'
import { useEscapeClose } from '../../composables/useEscapeClose'
import PaperDatePicker from '../PaperDatePicker.vue'

export interface GearSoldPayload {
  id: string
  sold_price_cents: number
  sold_date: string
  note?: string
  gear?: GearItem
}

const props = defineProps<{
  gear: GearItem | null
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'sold', payload: GearSoldPayload): void
}>()

const sellPriceYuan = ref('')
const sellDate = ref(getBeijingDateString())
const sellNote = ref('')
const isSubmitting = ref(false)
const errorMsg = ref<string | null>(null)

watch(
  () => props.gear,
  (item) => {
    if (!item) return
    sellPriceYuan.value = ''
    sellDate.value = getBeijingDateString()
    sellNote.value = ''
    errorMsg.value = null
  },
  { immediate: true },
)

const handleClose = () => {
  if (isSubmitting.value) return
  emit('close')
}

useBodyScrollLock(() => Boolean(props.gear))
useEscapeClose(() => Boolean(props.gear), handleClose)

const handleSubmit = async () => {
  if (!props.gear?.id) {
    errorMsg.value = '该设备缺少后端标识，无法执行转售结算'
    return
  }

  const parsedPrice = parseYuanToCents(sellPriceYuan.value, {
    fieldLabel: '转售回血金额',
  })
  if (!parsedPrice.ok) {
    errorMsg.value = parsedPrice.error
    return
  }

  const finalDate = sellDate.value || getBeijingDateString()
  const finalNote = sellNote.value.trim() || undefined

  try {
    isSubmitting.value = true
    errorMsg.value = null
    const res = await sellGearAsset(props.gear.id, {
      sold_price_cents: parsedPrice.cents,
      sold_date: finalDate,
      note: finalNote,
    })
    const updatedGear = ((res as any)?.gear || res) as GearItem | undefined
    emit('sold', {
      id: props.gear.id,
      sold_price_cents: parsedPrice.cents,
      sold_date: finalDate,
      note: finalNote,
      gear: updatedGear,
    })
    emit('close')
  } catch (err: any) {
    errorMsg.value = err?.message || '设备转售回血失败'
  } finally {
    isSubmitting.value = false
  }
}
</script>

<template>
  <div
    v-if="gear"
    role="dialog"
    aria-modal="true"
    aria-label="设备转售回血"
    class="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/45 backdrop-blur-xs animate-in fade-in duration-200"
    @click.self="handleClose"
  >
    <div class="bg-[var(--bg-archive)] border border-[var(--border-subtle)] p-6 rounded-xs w-full max-w-md space-y-4 text-left">
      <div class="flex items-center justify-between pb-3 border-b border-[var(--border-subtle)]">
        <div>
          <h3 class="font-serif-editorial text-lg font-medium text-[var(--ink-primary)]">
            出二手回血 · {{ gear.name }}
          </h3>
          <p class="font-mono-archive text-[11px] text-[var(--ink-muted)]">
            原值 ¥{{ formatMoney(gear.price_cents || 0) }} · 自动转为已售状态并记入「二手回血」收入
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
        <div>
          <label class="block text-[var(--ink-muted)] mb-1">转售回血金额 (¥) *</label>
          <input
            v-model="sellPriceYuan"
            type="number"
            step="0.01"
            min="0.01"
            placeholder="0.00"
            class="w-full px-3 py-2 text-base border border-[var(--border-subtle)] focus:border-[var(--ink-primary)] rounded-xs outline-none bg-transparent text-[var(--ink-primary)]"
            autofocus
          />
        </div>

        <div>
          <label class="block text-[var(--ink-muted)] mb-1">出手日期</label>
          <PaperDatePicker v-model="sellDate" />
        </div>

        <div>
          <label class="block text-[var(--ink-muted)] mb-1">流转备注</label>
          <input
            v-model="sellNote"
            type="text"
            class="w-full px-3 py-2 text-xs border border-[var(--border-subtle)] focus:border-[var(--ink-primary)] rounded-xs outline-none bg-transparent text-[var(--ink-primary)] font-serif-editorial"
          />
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
          {{ isSubmitting ? '处理中...' : '确认回血入账' }}
        </button>
      </div>
    </div>
  </div>
</template>
