<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import { X, Sparkles, Check, ShieldCheck } from 'lucide-vue-next'
import { resolveWish, fetchCreditChannels, getAdminToken } from '../utils/api'
import { audio } from '../utils/audio'
import { getBeijingDateString, getBeijingISOString } from '../utils/format'
import type { Wish, CreditChannel } from '../types'
import PaperSelect from './PaperSelect.vue'
import PaperDatePicker from './PaperDatePicker.vue'
import { useBodyScrollLock } from '../composables/useBodyScrollLock'

const props = defineProps<{
  isOpen: boolean
  wish: Wish | null
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'resolved', wish: Wish): void
  (e: 'requestAuth', callback: () => void): void
}>()

// 归册路径: exact(原配原价) | altered(改选替代) | relinquished(理性拔草)
const resolutionType = ref<'exact' | 'altered' | 'relinquished'>('exact')

// 达成日期 (默认今天，严格 <= now)
const todayStr = getBeijingDateString()
const fulfilledDate = ref(todayStr)

// 实际开销与品名
const actualCostYuan = ref('')
const actualTitle = ref('')

// 感悟与动态
const entryContent = ref('')

// 联动开关
const linkTransaction = ref(true)
const linkGearAsset = ref(false)
const linkLifeEntry = ref(true)
const linkFootprint = ref(false)

// 分期付款支持
const isInstallment = ref(false)
const selectedChannelCode = ref('huabei')
const installmentMonths = ref(3)
const creditChannels = ref<CreditChannel[]>([])

const isSubmitting = ref(false)
const errorMsg = ref('')

// 动态初始化
watch(
  () => props.wish,
  (w) => {
    if (w) {
      resolutionType.value = 'exact'
      fulfilledDate.value = todayStr
      actualCostYuan.value = w.budget > 0 ? (w.budget / 100).toFixed(2) : '0.00'
      actualTitle.value = w.title
      entryContent.value = `圆满达成向往的心愿《${w.title}》，生活又多了一份确切的欣喜。`

      linkTransaction.value = true
      linkGearAsset.value = w.kind === 'item'
      linkLifeEntry.value = true
      linkFootprint.value = w.kind === 'travel'

      isInstallment.value = false
      selectedChannelCode.value = 'huabei'
      installmentMonths.value = 3
    }
    errorMsg.value = ''
  },
  { immediate: true }
)

onMounted(async () => {
  try {
    const list = await fetchCreditChannels()
    creditChannels.value = list
    if (list.length > 0 && !selectedChannelCode.value) {
      selectedChannelCode.value = list[0].code
    }
  } catch (err) {
    console.warn('Failed to load credit channels in wish resolution:', err)
  }
})

// 监听归册路径变化，自动适配开销与品名
watch(resolutionType, (type) => {
  if (!props.wish) return
  if (type === 'exact') {
    actualCostYuan.value = props.wish.budget > 0 ? (props.wish.budget / 100).toFixed(2) : '0.00'
    actualTitle.value = props.wish.title
    linkTransaction.value = true
    linkGearAsset.value = props.wish.kind === 'item'
  } else if (type === 'altered') {
    actualCostYuan.value = props.wish.budget > 0 ? (props.wish.budget / 100).toFixed(2) : '0.00'
    actualTitle.value = ''
    linkTransaction.value = true
    linkGearAsset.value = props.wish.kind === 'item'
  } else if (type === 'relinquished') {
    actualCostYuan.value = '0.00'
    actualTitle.value = props.wish.title
    linkTransaction.value = false
    linkGearAsset.value = false
    isInstallment.value = false
    entryContent.value = `经过一段时间的沉淀，放下了对《${props.wish.title}》的执念。克制物欲，省下 100% 预算，回归生活本质。`
  }
})

const savedBudgetYuan = computed(() => {
  if (!props.wish || props.wish.budget <= 0) return '0.00'
  if (resolutionType.value === 'relinquished') {
    return (props.wish.budget / 100).toFixed(2)
  }
  const act = parseFloat(actualCostYuan.value) || 0
  const diff = (props.wish.budget / 100) - act
  return diff > 0 ? diff.toFixed(2) : '0.00'
})

const selectedChannelRepaymentDay = computed(() => {
  const ch = creditChannels.value.find((c) => c.code === selectedChannelCode.value)
  return ch ? ch.repayment_day : 10
})

const monthlyPayEstimate = computed(() => {
  const act = parseFloat(actualCostYuan.value) || 0
  if (act <= 0 || installmentMonths.value <= 0) return '0.00'
  return (act / installmentMonths.value).toFixed(2)
})

const handleSubmit = async () => {
  if (!props.wish) return

  // 日期校验: 严格 <= now
  if (!fulfilledDate.value) {
    errorMsg.value = '请选择达成日期'
    return
  }
  const selTime = new Date(fulfilledDate.value).getTime()
  const nowTime = new Date().getTime()
  if (selTime > nowTime) {
    errorMsg.value = '达成时间不能晚于当前时间（拒绝时间穿越）'
    return
  }

  let costCents = 0
  if (resolutionType.value !== 'relinquished') {
    const costVal = parseFloat(actualCostYuan.value)
    if (isNaN(costVal) || costVal < 0) {
      errorMsg.value = '请输入有效实际支出金额'
      return
    }
    costCents = Math.round(costVal * 100)
  }

  const finalTitle = resolutionType.value === 'altered'
    ? (actualTitle.value.trim() || props.wish.title)
    : props.wish.title

  if (!getAdminToken()) {
    emit('requestAuth', () => handleSubmit())
    return
  }

  try {
    isSubmitting.value = true
    errorMsg.value = ''

    const resolved = await resolveWish(props.wish.id, {
      resolution_type: resolutionType.value,
      actual_cost: costCents,
      actual_title: finalTitle,
      fulfilled_at: getBeijingISOString(fulfilledDate.value),
      create_transaction: linkTransaction.value && costCents > 0,
      create_gear_asset: linkGearAsset.value && props.wish.kind === 'item',
      create_life_entry: linkLifeEntry.value,
      create_footprint: linkFootprint.value && props.wish.kind === 'travel',
      entry_content: entryContent.value.trim() || undefined,
      is_installment: isInstallment.value && costCents > 0,
      installment_channel_code: isInstallment.value ? selectedChannelCode.value : undefined,
      installment_months: isInstallment.value ? installmentMonths.value : undefined,
      repayment_day: isInstallment.value ? selectedChannelRepaymentDay.value : undefined,
    })

    audio.playShutter()
    emit('resolved', resolved)
    emit('close')
  } catch (err: any) {
    if (!getAdminToken()) {
      emit('requestAuth', () => handleSubmit())
      return
    }
    errorMsg.value = err.message || '心愿归册仪式提交失败'
  } finally {
    isSubmitting.value = false
  }
}

  // MOB-P1-66：弹窗打开期间锁定背景页面滚动（此前只有灯箱锁了）
  useBodyScrollLock(() => (props.isOpen && !!props.wish))
</script>

<template>
  <div
    v-if="isOpen && wish"
    class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[var(--ink-primary)]/40 backdrop-blur-xs animate-in fade-in duration-200"
    @click.self="emit('close')"
  >
    <div
      class="bg-[var(--bg-archive)] border border-[var(--border-subtle)] w-full max-w-xl rounded-xs shadow-2xl p-6 sm:p-8 space-y-6 max-h-[90vh] overflow-y-auto text-left pb-[max(2rem,env(safe-area-inset-bottom,2rem))]"
    >
      <!-- 弹窗标头 -->
      <div class="flex items-start justify-between pb-4 border-b border-[var(--border-subtle)]">
        <div>
          <div class="flex items-center gap-2">
            <Sparkles class="w-5 h-5 text-[var(--accent-warm)]" />
            <h2 class="font-serif-editorial text-2xl text-[var(--ink-primary)] font-medium">
              心愿归册仪式
            </h2>
          </div>
          <p class="font-serif-editorial text-xs text-[var(--ink-muted)] mt-1">
            《{{ wish.title }}》· 预算 ¥{{ (wish.budget / 100).toFixed(2) }} · 将期冀定格为生活记忆。
          </p>
        </div>
        <button
          @click="emit('close')"
          class="text-[var(--ink-muted)] hover:text-[var(--ink-primary)] p-1 cursor-pointer transition-colors"
        >
          <X class="w-4 h-4" />
        </button>
      </div>

      <!-- 错误提示 -->
      <div v-if="errorMsg" class="p-3 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800/40 text-red-700 dark:text-red-300 text-xs font-mono-archive rounded-xs">
        {{ errorMsg }}
      </div>

      <form @submit.prevent="handleSubmit" class="space-y-6 font-mono-archive text-xs">
        <!-- 1. 三大归册决策路径 -->
        <div>
          <label class="block text-[11px] text-[var(--ink-muted)] mb-2">归册路径决策 *</label>
          <div class="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            <!-- 路径一 -->
            <button
              type="button"
              @click="resolutionType = 'exact'"
              class="p-3 border rounded-xs text-left cursor-pointer transition-all flex flex-col justify-center"
              :class="resolutionType === 'exact' ? 'border-[var(--ink-primary)] bg-[var(--bg-subtle)] text-[var(--ink-primary)] ring-1 ring-[var(--ink-primary)]' : 'border-[var(--border-subtle)] hover:border-[var(--ink-primary)] text-[var(--ink-secondary)]'"
            >
              <span class="block font-medium font-serif-editorial text-sm text-[var(--ink-primary)]">原计划达成</span>
            </button>

            <!-- 路径二 -->
            <button
              type="button"
              @click="resolutionType = 'altered'"
              class="p-3 border rounded-xs text-left cursor-pointer transition-all flex flex-col justify-center"
              :class="resolutionType === 'altered' ? 'border-[var(--ink-primary)] bg-[var(--bg-subtle)] text-[var(--ink-primary)] ring-1 ring-[var(--ink-primary)]' : 'border-[var(--border-subtle)] hover:border-[var(--ink-primary)] text-[var(--ink-secondary)]'"
            >
              <span class="block font-medium font-serif-editorial text-sm text-[var(--ink-primary)]">改选替代方案</span>
            </button>

            <!-- 路径三 -->
            <button
              type="button"
              @click="resolutionType = 'relinquished'"
              class="p-3 border rounded-xs text-left cursor-pointer transition-all flex flex-col justify-center"
              :class="resolutionType === 'relinquished' ? 'border-[var(--ink-primary)] bg-[var(--bg-subtle)] text-[var(--ink-primary)] ring-1 ring-[var(--ink-primary)]' : 'border-[var(--border-subtle)] hover:border-[var(--ink-primary)] text-[var(--ink-secondary)]'"
            >
              <span class="block font-medium font-serif-editorial text-sm text-[var(--accent-moss)]">理性拔草释怀</span>
            </button>
          </div>
        </div>

        <!-- 拔草释怀印记勋章 (路径三专属) -->
        <div
          v-if="resolutionType === 'relinquished'"
          class="p-3.5 bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800/40 rounded-xs flex items-center justify-between text-emerald-800 dark:text-emerald-200 font-mono-archive"
        >
          <div class="flex items-center gap-2">
            <ShieldCheck class="w-4 h-4 text-emerald-600" />
            <span class="font-medium">已为你省下 100% 预算</span>
          </div>
          <span class="font-serif-editorial text-base font-semibold">
            ¥{{ savedBudgetYuan }}
          </span>
        </div>

        <!-- 2. 金额与品名细节 (路径一与二) -->
        <div v-if="resolutionType !== 'relinquished'" class="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label class="block text-[11px] text-[var(--ink-muted)] mb-1">
              {{ resolutionType === 'exact' ? '实际支出金额 (¥)' : '替代方案实付金额 (¥)' }} *
            </label>
            <div class="relative">
              <span class="absolute left-2.5 top-1.5 text-[var(--ink-muted)]">¥</span>
              <input
                v-model="actualCostYuan"
                type="number"
                step="0.01"
                required
                class="w-full pl-6 pr-3 py-1.5 bg-[var(--bg-archive)] border border-[var(--border-subtle)] focus:border-[var(--ink-primary)] rounded-xs outline-none text-xs text-[var(--ink-primary)] font-mono-archive"
              />
            </div>
          </div>

          <div v-if="resolutionType === 'altered'">
            <label class="block text-[11px] text-[var(--ink-muted)] mb-1">最终购买实际品名 *</label>
            <input
              v-model="actualTitle"
              type="text"
              required
              class="w-full px-3 py-1.5 bg-[var(--bg-archive)] border border-[var(--border-subtle)] focus:border-[var(--ink-primary)] rounded-xs outline-none text-xs text-[var(--ink-primary)]"
            />
          </div>
        </div>

        <!-- 3. 达成归册日期 (支持自选历史时间，严格 <= now) -->
        <div>
          <label class="block text-[11px] text-[var(--ink-muted)] mb-1">达成归册日期 *</label>
          <PaperDatePicker
            v-model="fulfilledDate"
          />
        </div>

        <!-- 4. 信贷分期选项 (当有支出时) -->
        <div v-if="resolutionType !== 'relinquished' && parseFloat(actualCostYuan) > 0" class="p-3 bg-[var(--bg-subtle)]/50 border border-[var(--border-subtle)] rounded-xs space-y-3">
          <label class="flex items-center gap-2 cursor-pointer">
            <input
              v-model="isInstallment"
              type="checkbox"
              class="rounded-xs text-[var(--ink-primary)]"
            />
            <span class="font-medium text-[var(--ink-primary)]">使用信贷分期付款</span>
          </label>

          <div v-if="isInstallment" class="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-[var(--border-subtle)]">
            <div>
              <label class="block text-[11px] text-[var(--ink-muted)] mb-1">分期渠道</label>
              <PaperSelect
                v-model="selectedChannelCode"
                size="sm"
                :options="
                  creditChannels.map((ch) => ({
                    value: ch.code,
                    label: `${ch.name} (每月${ch.repayment_day}日还款)`,
                  }))
                "
              />
            </div>
            <div>
              <label class="block text-[11px] text-[var(--ink-muted)] mb-1">分期期数</label>
              <PaperSelect
                v-model="installmentMonths"
                size="sm"
                :options="[
                  { value: 3, label: `3 期 (约 ¥${monthlyPayEstimate}/月)` },
                  { value: 6, label: `6 期 (约 ¥${monthlyPayEstimate}/月)` },
                  { value: 12, label: `12 期 (约 ¥${monthlyPayEstimate}/月)` },
                  { value: 24, label: `24 期 (约 ¥${monthlyPayEstimate}/月)` },
                ]"
              />
            </div>
          </div>
        </div>

        <!-- 5. 方案 B 多模块联动勾选 -->
        <div class="space-y-2.5">
          <label class="block text-[11px] text-[var(--ink-muted)]">联动记录</label>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
            <label
              v-if="resolutionType !== 'relinquished'"
              class="flex items-center gap-2 p-2 bg-[var(--bg-archive)] border border-[var(--border-subtle)] rounded-xs cursor-pointer hover:border-[var(--ink-primary)] transition-colors"
            >
              <input v-model="linkTransaction" type="checkbox" />
              <span>记入收支账目</span>
            </label>

            <label
              v-if="wish.kind === 'item' && resolutionType !== 'relinquished'"
              class="flex items-center gap-2 p-2 bg-[var(--bg-archive)] border border-[var(--border-subtle)] rounded-xs cursor-pointer hover:border-[var(--ink-primary)] transition-colors"
            >
              <input v-model="linkGearAsset" type="checkbox" />
              <span>沉淀至固定资产库</span>
            </label>

            <label class="flex items-center gap-2 p-2 bg-[var(--bg-archive)] border border-[var(--border-subtle)] rounded-xs cursor-pointer hover:border-[var(--ink-primary)] transition-colors">
              <input v-model="linkLifeEntry" type="checkbox" />
              <span>记入生活散页</span>
            </label>

            <label
              v-if="wish.kind === 'travel'"
              class="flex items-center gap-2 p-2 bg-[var(--bg-archive)] border border-[var(--border-subtle)] rounded-xs cursor-pointer hover:border-[var(--ink-primary)] transition-colors"
            >
              <input v-model="linkFootprint" type="checkbox" />
              <span>点亮山川足迹</span>
            </label>
          </div>
        </div>

        <!-- 6. 感言与生活随笔内容 -->
        <div v-if="linkLifeEntry">
          <label class="block text-[11px] text-[var(--ink-muted)] mb-1">达成随笔感言</label>
          <textarea
            v-model="entryContent"
            rows="2"
            class="w-full px-3 py-2 bg-[var(--bg-archive)] border border-[var(--border-subtle)] focus:border-[var(--ink-primary)] rounded-xs outline-none text-xs text-[var(--ink-primary)] font-serif-editorial leading-relaxed"
          ></textarea>
        </div>

        <!-- 底部提交操作 -->
        <div class="flex items-center justify-end gap-3 pt-4 border-t border-[var(--border-subtle)]">
          <button
            @click="emit('close')"
            type="button"
            class="px-3.5 py-1.5 text-xs border border-[var(--border-subtle)] hover:border-[var(--ink-primary)] rounded-xs text-[var(--ink-muted)] hover:text-[var(--ink-primary)] cursor-pointer transition-colors"
          >
            取消
          </button>
          <button
            type="submit"
            :disabled="isSubmitting"
            class="px-5 py-1.5 text-xs bg-[var(--ink-primary)] text-[var(--bg-archive)] rounded-xs hover:opacity-90 transition-opacity cursor-pointer font-serif-editorial inline-flex items-center gap-1.5"
          >
            <Check class="w-3.5 h-3.5" />
            <span>{{ isSubmitting ? '正在归册...' : '完成归册仪式' }}</span>
          </button>
        </div>
      </form>
    </div>
  </div>
</template>
