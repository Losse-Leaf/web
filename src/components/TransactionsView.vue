<script setup lang="ts">
import { ref, computed, onMounted, watch, defineAsyncComponent } from 'vue'
import {
  Plus,
  ChevronLeft,
  ChevronRight,
  Trash2,
  Edit2,
  Wallet,
  X,
  Settings,
  Laptop,
  ArrowRightLeft,
  SlidersHorizontal,
} from 'lucide-vue-next'
import {
  fetchTransactions,
  fetchTransactionSummary,
  deleteTransaction,
  updateTransaction,
  fetchAssetsOverview,
  fetchCreditChannels,
  updateInitialLiquidBalance,
  addGearAsset,
  sellGearAsset,
  deleteGearAsset,
} from '../utils/api'
import type {
  Transaction,
  TransactionSummary,
  CuratorProfile,
  AssetsOverview,
  CreditChannel,
  GearItem,
} from '../types'
import { useCategories } from '../composables/useCategories'
import { askConfirm, showAlert } from '../composables/useConfirm'
import { formatMoney, getBeijingDateString, getBeijingNow, parseOccurredDate, getBeijingISOString } from '../utils/format'
import { loadCuratorProfile } from '../utils/profile'
import PaperSelect from './PaperSelect.vue'
import PaperDatePicker from './PaperDatePicker.vue'
import CityPicker from './CityPicker.vue'

const CreditChannelsModal = defineAsyncComponent(() => import('./CreditChannelsModal.vue'))

const props = defineProps<{
  transactions?: Transaction[]
  profile?: CuratorProfile | null
  refreshKey?: number
}>()

const emit = defineEmits<{
  (e: 'openAdd'): void
  (e: 'transactionDeleted', id: number): void
  (e: 'transactionUpdated', tx: Transaction): void
  (e: 'gearChanged'): void
}>()

const {
  expenseCategories,
  incomeCategories,
  gearCategories,
  paymentMethods: paymentMethodsList,
  loadCategories,
  openCategoryManager,
} = useCategories()

// 伪 UTC 的北京墙上时间：月份切换与倒计时不受浏览器本地时区影响。
const currentDate = ref(getBeijingNow())
const transactionsList = ref<Transaction[]>([])
const summary = ref<TransactionSummary | null>(null)
const isLoading = ref(false)
const selectedCategoryFilter = ref<string>('')
const activeSubTab = ref<'ledger' | 'gear'>('ledger')

// 信贷渠道与资产大盘 (RC-53, FE-15, RG-20)
const isCreditModalOpen = ref(false)
const assetsOverview = ref<AssetsOverview | null>(null)
const creditChannels = ref<CreditChannel[]>([])

const defaultCreditChannels: CreditChannel[] = [
  { code: 'huabei', name: '花呗', repayment_day: 10 },
  { code: 'baitiao', name: '京东白条', repayment_day: 20 },
]

const displayCreditChannels = computed<CreditChannel[]>(() => {
  return creditChannels.value.length > 0 ? creditChannels.value : defaultCreditChannels
})

// 初始流动资金底数校准状态 (RG-20)
const isEditingLiquidBalance = ref(false)
const liquidBalanceInput = ref('')
const isSavingLiquidBalance = ref(false)

const openEditLiquidBalance = () => {
  const currentInitial = assetsOverview.value?.initial_liquid_balance ?? 0
  liquidBalanceInput.value = (currentInitial / 100).toFixed(2)
  isEditingLiquidBalance.value = true
}

const saveInitialLiquidBalance = async () => {
  const valFloat = parseFloat(liquidBalanceInput.value || '0')
  if (isNaN(valFloat)) return
  try {
    isSavingLiquidBalance.value = true
    const cents = Math.round(valFloat * 100)
    await updateInitialLiquidBalance(cents)
    isEditingLiquidBalance.value = false
    await loadAssetsOverview()
  } catch (err) {
    console.error('Failed to update initial liquid balance:', err)
  } finally {
    isSavingLiquidBalance.value = false
  }
}

// ==========================================
// 随身与桌面固定资产库 (Gear Assets Catalog)
// ==========================================
const gearFilter = ref<'active' | 'sold' | 'all'>('active')
const isAddGearModalOpen = ref(false)
const isSubmittingGear = ref(false)
const gearErrorMsg = ref<string | null>(null)

const newGearName = ref('')
const newGearCategory = ref('数码器材')
const newGearSpec = ref('')
const newGearPriceYuan = ref('')
const newGearPurchaseDate = ref(getBeijingDateString())
const newGearPaymentMethod = ref('')
const newGearNote = ref('')
const newGearCreateTx = ref(true)
const newGearIsInstallment = ref(false)
const newGearInstallmentChannel = ref('huabei')
const newGearInstallmentMonths = ref(12)
const newGearRepaymentDay = ref(10)

// 出二手回血模态框状态
const sellingGear = ref<GearItem | null>(null)
const sellPriceYuan = ref('')
const sellDate = ref(getBeijingDateString())
const sellNote = ref('')
const isSubmittingSell = ref(false)
const sellErrorMsg = ref<string | null>(null)

const allGearItems = computed<GearItem[]>(() => {
  if (assetsOverview.value?.gear_summary?.items) {
    return assetsOverview.value.gear_summary.items
  }
  const profile = props.profile || loadCuratorProfile()
  return profile.edc_gear || []
})

const filteredGearItems = computed<GearItem[]>(() => {
  return allGearItems.value.filter((g) => {
    const isSold = g.status === 'sold'
    if (gearFilter.value === 'active') return !isSold
    if (gearFilter.value === 'sold') return isSold
    return true
  })
})

const calcGearHoldingStats = (item: GearItem) => {
  if (!item.purchase_date) return null
  const start = new Date(item.purchase_date)
  if (isNaN(start.getTime())) return null
  const end = item.status === 'sold' && item.sold_date ? new Date(item.sold_date) : new Date()
  const diffMs = Math.max(0, end.getTime() - start.getTime())
  const days = Math.max(1, Math.ceil(diffMs / (1000 * 60 * 60 * 24)))
  const netCostCents =
    item.status === 'sold'
      ? Math.max(0, (item.price_cents || 0) - (item.sold_price_cents || 0))
      : item.price_cents || 0
  const dailyCents = Math.round(netCostCents / days)
  return {
    days,
    dailyCents,
    netCostCents,
  }
}

// 服役时长 / 日均成本预计算，避免模板内重复调用 (FE-21)
const gearHoldingStatsMap = computed<Map<string, { days: number; dailyCents: number; netCostCents: number } | null>>(() => {
  const map = new Map<string, { days: number; dailyCents: number; netCostCents: number } | null>()
  for (const item of allGearItems.value) {
    if (item.id) map.set(item.id, calcGearHoldingStats(item))
  }
  return map
})

const openAddGearModal = () => {
  newGearName.value = ''
  newGearCategory.value = gearCategories.value[0] || '数码器材'
  newGearSpec.value = ''
  newGearPriceYuan.value = ''
  newGearPurchaseDate.value = getBeijingDateString()
  newGearPaymentMethod.value = paymentMethodsList.value[0] || ''
  newGearNote.value = ''
  newGearCreateTx.value = true
  newGearIsInstallment.value = false
  newGearInstallmentChannel.value = displayCreditChannels.value[0]?.code || 'huabei'
  newGearInstallmentMonths.value = 12
  newGearRepaymentDay.value = displayCreditChannels.value[0]?.repayment_day || 10
  gearErrorMsg.value = null
  isAddGearModalOpen.value = true
}

const handleCreateGear = async () => {
  if (!newGearName.value.trim()) {
    gearErrorMsg.value = '请填写设备名称'
    return
  }
  const priceFloat = parseFloat(newGearPriceYuan.value || '0')
  const priceCents = !isNaN(priceFloat) && priceFloat > 0 ? Math.round(priceFloat * 100) : 0
  const matchedCh = displayCreditChannels.value.find(
    (c) => c.code === newGearInstallmentChannel.value
  )
  const repDay = matchedCh ? matchedCh.repayment_day : newGearRepaymentDay.value || 10

  try {
    isSubmittingGear.value = true
    gearErrorMsg.value = null
    await addGearAsset({
      name: newGearName.value.trim(),
      category: newGearCategory.value,
      spec: newGearSpec.value.trim() || undefined,
      price_cents: priceCents,
      purchase_date: newGearPurchaseDate.value || undefined,
      payment_method: newGearPaymentMethod.value,
      note: newGearNote.value.trim() || undefined,
      create_transaction: newGearCreateTx.value && priceCents > 0,
      is_installment: newGearCreateTx.value && newGearIsInstallment.value,
      installment_channel_code:
        newGearCreateTx.value && newGearIsInstallment.value
          ? newGearInstallmentChannel.value
          : undefined,
      installment_total_amount:
        newGearCreateTx.value && newGearIsInstallment.value ? priceCents : undefined,
      installment_months:
        newGearCreateTx.value && newGearIsInstallment.value
          ? newGearInstallmentMonths.value
          : undefined,
      repayment_day:
        newGearCreateTx.value && newGearIsInstallment.value ? repDay : undefined,
    })
    isAddGearModalOpen.value = false
    emit('gearChanged')
    await loadData()
  } catch (err: any) {
    gearErrorMsg.value = err.message || '录入设备失败'
  } finally {
    isSubmittingGear.value = false
  }
}

const openSellGearModal = (item: GearItem) => {
  sellingGear.value = item
  sellPriceYuan.value = ''
  sellDate.value = getBeijingDateString()
  sellNote.value = ''
  sellErrorMsg.value = null
}

const handleSellGear = async () => {
  if (!sellingGear.value?.id) return
  const soldFloat = parseFloat(sellPriceYuan.value)
  if (isNaN(soldFloat) || soldFloat <= 0) {
    sellErrorMsg.value = '请填写有效的转售回血金额'
    return
  }
  try {
    isSubmittingSell.value = true
    sellErrorMsg.value = null
    await sellGearAsset(sellingGear.value.id, {
      sold_price_cents: Math.round(soldFloat * 100),
      sold_date: sellDate.value || undefined,
      note: sellNote.value.trim() || undefined,
    })
    sellingGear.value = null
    emit('gearChanged')
    await loadData()
  } catch (err: any) {
    sellErrorMsg.value = err.message || '设备转售回血失败'
  } finally {
    isSubmittingSell.value = false
  }
}

const handleRemoveGear = async (item: GearItem) => {
  if (!item.id) return
  const ok = await askConfirm({
    title: '移除设备',
    message: `确定从固定资产库中移除「${item.name}」？`,
    confirmText: '移除',
    danger: true,
  })
  if (!ok) return
  try {
    await deleteGearAsset(item.id)
    emit('gearChanged')
    await loadAssetsOverview()
  } catch (err: any) {
    await showAlert({ title: '删除失败', message: err.message || '删除设备失败', danger: true })
  }
}

// ==========================================
// 账目编辑态 (含分期参数、城市坐标与收支独立分类)
// ==========================================
const editingTx = ref<Transaction | null>(null)
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
const editRepaymentDay = ref(10)

const editCategoriesList = computed(() => {
  return editType.value === 'income' ? incomeCategories.value : expenseCategories.value
})

// 资产与信贷管理大盘 (RC-53, RG-19)
const totalFixedAssets = computed(() => {
  return allGearItems.value
    .filter((g) => g.status !== 'sold')
    .reduce((sum, g) => sum + (g.price_cents || 0), 0)
})

const activeGearCount = computed(() => {
  return allGearItems.value.filter((g) => g.status !== 'sold').length
})

const calcInstallmentRemainingDebt = (tx: Transaction): number => {
  const total = tx.installment_total_amount || tx.amount || 0
  const months = tx.installment_months || 12
  const remain = tx.installment_remain_months ?? months
  if (remain <= 0) return 0
  if (remain >= months) return total
  const paidMonths = months - remain
  const monthlyPay = tx.installment_monthly_pay || Math.floor(total / months)
  return Math.max(0, total - paidMonths * monthlyPay)
}

/**
 * 某一期**实际**要还多少
 *
 * 关键（DEC-02 口径 A）：尾差落在**最后一期** ——
 * 前 N-1 期取整除，最后一期吃掉余数。
 * 所以「每期 ¥76,408」这个说法在**最后一期**是不准确的（实际 ¥76,412）。
 * 这里的「每期」若照抄整除值，用户按它还款会在最后一期差几分钱。
 */
const calcInstallmentPeriodAmount = (tx: Transaction): number => {
  const total = tx.installment_total_amount || tx.amount || 0
  const months = tx.installment_months || 0
  const monthlyPay = tx.installment_monthly_pay || (months > 0 ? Math.floor(total / months) : 0)
  const remain = tx.installment_remain_months ?? months
  if (months > 0 && remain === 1) {
    // 最后一期：总额 − 已还的整除期 × 月供（含尾差）
    return Math.max(0, total - (months - 1) * monthlyPay)
  }
  return monthlyPay
}

const totalInstallmentLiabilities = computed(() => {
  return transactionsList.value
    .filter((t) => t.is_installment)
    .reduce((sum, t) => sum + calcInstallmentRemainingDebt(t), 0)
})

const estimatedNetWorth = computed(() => {
  const balance = summary.value?.balance || 0
  return totalFixedAssets.value + balance - totalInstallmentLiabilities.value
})

// 聚合在还分期项目列表
const activeInstallmentsList = computed(() => {
  if (assetsOverview.value?.channel_liabilities) {
    const items: Array<{ tx: Transaction; channelName: string; channelColor?: string }> = []
    for (const ch of assetsOverview.value.channel_liabilities) {
      for (const tx of ch.installments || []) {
        items.push({
          tx,
          channelName: ch.channel_name,
          channelColor: ch.color,
        })
      }
    }
    return items
  }
  return transactionsList.value
    .filter((t) => t.is_installment && (t.installment_remain_months ?? 1) > 0)
    .map((tx) => ({
      tx,
      // 渠道名取自后端渠道字典，避免前端硬编码与字典重复定义 (FE-20)
      channelName:
        displayCreditChannels.value.find((c) => c.code === tx.installment_channel_code)?.name ||
        tx.installment_channel_code || '信贷分期',
      channelColor: undefined,
    }))
})

const getDaysUntilDay = (targetDay: number) => {
  // 全部用 UTC 日历运算：currentDate 是「北京墙上时间」的伪 UTC Date。
  const now = getBeijingNow()
  const y = now.getUTCFullYear()
  const m = now.getUTCMonth()
  const d = now.getUTCDate()
  if (d <= targetDay) {
    return targetDay - d
  }
  const nextMonth = Date.UTC(y, m + 1, targetDay)
  const todayUtc = Date.UTC(y, m, d)
  return Math.ceil((nextMonth - todayUtc) / (1000 * 60 * 60 * 24))
}

const huabeiCountdown = computed(() => getDaysUntilDay(10))
const baitiaoCountdown = computed(() => getDaysUntilDay(20))

const year = computed(() => currentDate.value.getUTCFullYear())
const month = computed(() => currentDate.value.getUTCMonth() + 1)

const prevMonth = () => {
  currentDate.value = new Date(Date.UTC(year.value, month.value - 2, 1))
}

const nextMonth = () => {
  currentDate.value = new Date(Date.UTC(year.value, month.value, 1))
}

// 请求序号守卫：月份快速切换 / refreshKey 并发触发时，
// 只允许**最新一次**响应写入状态，慢的旧响应整体作废
// （否则标题显示 10 月、流水却是慢返回的 9 月数据）。
let dataLoadSeq = 0
let assetsLoadSeq = 0

const loadAssetsOverview = async () => {
  const seq = ++assetsLoadSeq
  try {
    const [overview, channels] = await Promise.all([
      fetchAssetsOverview().catch(() => null),
      fetchCreditChannels().catch(() => []),
    ])
    if (seq !== assetsLoadSeq) return
    if (overview) assetsOverview.value = overview
    creditChannels.value = channels
  } catch (err) {
    console.error('Failed to load assets overview:', err)
  }
}

const loadData = async () => {
  const seq = ++dataLoadSeq
  try {
    isLoading.value = true
    const [txs, sum] = await Promise.all([
      fetchTransactions({ year: year.value, month: month.value }),
      fetchTransactionSummary({ year: year.value, month: month.value }),
      loadAssetsOverview(),
    ])
    if (seq !== dataLoadSeq) return
    transactionsList.value = txs
    summary.value = sum
  } catch (err) {
    console.error('Failed to load transactions:', err)
  } finally {
    if (seq === dataLoadSeq) isLoading.value = false
  }
}

// 流动资金展示口径：资产大盘优先，**符号与数值必须同源**——
// 原先符号判断用 `?? 0`（恒非负、永不加负号）、数值却回退月度结余（可为负），
// 大盘请求失败时会负结余显示成正数。
const liquidBalanceDisplay = computed(() => {
  return assetsOverview.value?.liquid_balance ?? summary.value?.balance ?? 0
})

watch([year, month], () => {
  loadData()
})

// 刷新驱动改由 App 级 refreshKey 显式递增，避免 props 深监听引发的整页冗余重取 (FE-19)
watch(
  () => props.refreshKey,
  () => {
    loadData()
  }
)

onMounted(() => {
  loadCategories()
  loadData()
})

// 分组：按天汇聚
interface DayGroup {
  dateStr: string
  displayDay: string
  items: Transaction[]
  dayTotalExpense: number
}

const toggleCategoryFilter = (cat: string) => {
  if (selectedCategoryFilter.value === cat) {
    selectedCategoryFilter.value = ''
  } else {
    selectedCategoryFilter.value = cat
  }
}

const dayGroups = computed(() => {
  const map = new Map<string, Transaction[]>()
  const listToGroup = selectedCategoryFilter.value
    ? transactionsList.value.filter((t) => t.category === selectedCategoryFilter.value)
    : transactionsList.value

  listToGroup.forEach((tx) => {
    // 时区口径统一：按北京时间归日，避免 UTC 串导致跨日错位 (RC-134)
    const { month, day, year } = parseOccurredDate(tx.occurred_at)
    const key = tx.occurred_at ? `${Number(month)}月${Number(day)}日` : '近期'
    const list = map.get(`${year}-${key}`) || []
    list.push(tx)
    map.set(`${year}-${key}`, list)
  })

  const groups: DayGroup[] = []
  map.forEach((items, displayDay) => {
    let dayTotal = 0
    items.forEach((it) => {
      if (it.type === 'expense') dayTotal += it.amount
    })
    groups.push({
      dateStr: displayDay.split('-').slice(1).join('-'),
      displayDay: displayDay.split('-').slice(1).join('-'),
      items,
      dayTotalExpense: dayTotal,
    })
  })

  return groups
})

const startEdit = (tx: Transaction) => {
  editErrorMsg.value = ''
  editingTx.value = tx
  editTitle.value = tx.title
  editAmount.value = (tx.amount / 100).toFixed(2)
  editCategory.value = tx.category
  editType.value = tx.type
  editNote.value = tx.note || ''
  editPaymentMethod.value = tx.payment_method || ''
  editOccurredAt.value = tx.occurred_at ? tx.occurred_at.slice(0, 16) : ''
  editCityCode.value = tx.city_code || ''
  editIsInstallment.value = Boolean(tx.is_installment)
  editInstallmentChannel.value = tx.installment_channel_code || 'huabei'
  editInstallmentMonths.value = tx.installment_months || 12
  editInstallmentRemainMonths.value = tx.installment_remain_months ?? (tx.installment_months || 12)
  editRepaymentDay.value = tx.repayment_day || 10
}

const saveEdit = async () => {
  if (!editingTx.value) return
  editErrorMsg.value = ''
  const amtFloat = parseFloat(editAmount.value)
  if (isNaN(amtFloat) || amtFloat <= 0) {
    editErrorMsg.value = '请输入大于 0 的有效金额'
    return
  }
  const amountCents = Math.round(amtFloat * 100)
  // ── 分期参数提交前校验（与输入框 min/max 呼应，拦住手输越界值）──
  // 总期数 1~60；剩余期数 0~总期数。否则 0 期会触发除零 / 月供 undefined，
  // 剩余 > 总期数则待还金额恒为全额，账面口径自相矛盾。
  const wantInstallmentNow = editType.value === 'expense' && editIsInstallment.value
  if (wantInstallmentNow) {
    const months = Math.round(Number(editInstallmentMonths.value))
    const remain = Math.round(Number(editInstallmentRemainMonths.value))
    if (!Number.isFinite(months) || months < 1 || months > 60) {
      editErrorMsg.value = '分期总期数必须在 1 至 60 期之间'
      return
    }
    if (!Number.isFinite(remain) || remain < 0 || remain > months) {
      editErrorMsg.value = `剩余期数必须在 0 至 ${months} 期之间`
      return
    }
    editInstallmentMonths.value = months
    editInstallmentRemainMonths.value = remain
  }
  // ── 分期三态（后端契约）──────────────────────────────────
  // 关键：原先的判定是 `editType === 'expense' && !editIsInstallment`，
  // 于是「把一笔分期支出改成收入」时 clear_installment 变成 false ——
  // 服务端收到 is_installment=false 但没有显式声明 ⇒ 走「保持原值」分支
  // ⇒ **这笔账依然挂着分期标记**，只是一条「分期收入」，荒谬。
  //
  // 现在按三态分别处理：
  //   仍是分期   → is_installment: true
  //   取消分期   → is_installment: false + clear_installment: true
  //   与分期无关 → is_installment: false 且不带 clear_installment（服务端保持原值）
  const wasInstallment = Boolean(editingTx.value?.is_installment)
  const wantInstallment = editType.value === 'expense' && editIsInstallment.value
  const cancelInstallment = !wantInstallment && wasInstallment
  const monthlyPay =
    editIsInstallment.value && editInstallmentMonths.value > 0
      ? Math.round(amountCents / editInstallmentMonths.value)
      : undefined

  try {
    const updated = await updateTransaction(editingTx.value.id, {
      title: editTitle.value.trim() || editCategory.value,
      amount: amountCents,
      type: editType.value,
      category: editCategory.value,
      note: editNote.value.trim(),
      payment_method: editPaymentMethod.value.trim() || undefined,
      occurred_at: editOccurredAt.value ? getBeijingISOString(editOccurredAt.value) : undefined,
      city_code: editCityCode.value || undefined,
      is_installment: wantInstallment,
      // 关键：**显式声明**「本次要取消分期」。
      // 后端的新契约是「is_installment=false 且不带 clear_installment → 保持原值」，
      // 因为已发布的老客户端（Bool 不可选，必定发 false）压根不知道可以不传 ——
      // 若把 false 直接当成「取消分期」，老用户编辑一次账目就会毁掉分期负债。
      // 这里是 web 端**唯一**能真正取消分期的入口，所以必须带上这个信号。
      clear_installment: cancelInstallment,
      installment_channel_code:
        editType.value === 'expense' && editIsInstallment.value
          ? editInstallmentChannel.value
          : undefined,
      installment_total_amount:
        editType.value === 'expense' && editIsInstallment.value ? amountCents : undefined,
      installment_months:
        editType.value === 'expense' && editIsInstallment.value
          ? editInstallmentMonths.value
          : undefined,
      installment_monthly_pay:
        editType.value === 'expense' && editIsInstallment.value ? monthlyPay : undefined,
      installment_remain_months:
        editType.value === 'expense' && editIsInstallment.value
          ? editInstallmentRemainMonths.value
          : undefined,
      repayment_day:
        editType.value === 'expense' && editIsInstallment.value
          ? editRepaymentDay.value
          : undefined,
    })

    const idx = transactionsList.value.findIndex((t) => t.id === updated.id)
    if (idx !== -1) {
      transactionsList.value[idx] = updated
    }
    emit('transactionUpdated', updated)
    editingTx.value = null
    await Promise.all([
      fetchTransactionSummary({ year: year.value, month: month.value }).then((sum) => {
        if (sum) summary.value = sum
      }),
      loadAssetsOverview(),
    ]).catch(() => {})
  } catch (err: any) {
    // 保存失败：保留弹窗与已填内容，给出可感知的错误（原先 unhandled rejection、静默无反馈）
    editErrorMsg.value = err?.message || '保存账目失败，请稍后重试'
  }
}

const removeTx = async (id: number) => {
  const ok = await askConfirm({
    title: '删除账目',
    message: '确定删除这笔账目记录？此操作不可恢复。',
    confirmText: '删除',
    danger: true,
  })
  if (!ok) return
  try {
    await deleteTransaction(id)
  } catch (err: any) {
    await showAlert({ title: '删除失败', message: err?.message || '删除账目失败', danger: true })
    return
  }
  transactionsList.value = transactionsList.value.filter((t) => t.id !== id)
  emit('transactionDeleted', id)
  await Promise.all([
    fetchTransactionSummary({ year: year.value, month: month.value }).then((sum) => {
      if (sum) summary.value = sum
    }),
    loadAssetsOverview(),
  ]).catch(() => {})
}

// 支出光谱细线条颜色与占比 (Earthy publication film palette)
const CATEGORY_COLORS: Record<string, string> = {
  餐饮: '#a24f2b',
  交通: '#4a6b82',
  购物: '#8c6d46',
  数码器材: '#3a5a6b',
  娱乐: '#7a5980',
  住房: '#3f5a4a',
  学习: '#5c6773',
  医疗: '#b35c5c',
  旅行度假: '#b57c3c',
  其他: '#8a857b',
}

const FALLBACK_PALETTE = ['#6b7b5c', '#9c6644', '#586f7c', '#7f5539', '#6d597a', '#b56576', '#4a5759']

const getCategoryColor = (cat: string) => {
  if (CATEGORY_COLORS[cat]) return CATEGORY_COLORS[cat]
  let hash = 0
  for (let i = 0; i < cat.length; i++) {
    hash = (hash * 31 + cat.charCodeAt(i)) >>> 0
  }
  return FALLBACK_PALETTE[hash % FALLBACK_PALETTE.length]
}

const spectrumItems = computed(() => {
  if (!summary.value || !summary.value.total_expense || summary.value.total_expense <= 0) return []
  const breakdown = summary.value.category_breakdown || {}
  const total = summary.value.total_expense
  return Object.entries(breakdown)
    .filter(([_, amt]) => amt > 0)
    .map(([cat, amt]) => {
      const percentage = Math.round((amt / total) * 1000) / 10
      return {
        category: cat,
        amount: amt,
        percentage,
        color: getCategoryColor(cat),
      }
    })
    .sort((a, b) => b.amount - a.amount)
})
</script>

<template>
  <div class="max-w-5xl mx-auto px-4 sm:px-8 py-10 sm:py-20 text-left space-y-10">
    <!-- 标头与操作栏 -->
    <header class="pb-10 border-b border-[var(--border-subtle)] space-y-4">
      <div class="flex flex-wrap items-center justify-between gap-4">
        <div class="flex flex-wrap items-baseline gap-3">
          <h1 class="font-serif-editorial text-4xl sm:text-5xl font-normal text-[var(--ink-primary)]">
            资产
          </h1>
          <span class="font-mono-archive text-xs tracking-widest text-[var(--ink-muted)]">
            净资产大盘 · 收支台账 · 固定设备库
          </span>
        </div>

        <div class="flex flex-wrap items-center gap-2.5">
          <button
            @click="openCategoryManager('expense')"
            class="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono-archive border border-[var(--border-subtle)] hover:border-[var(--ink-primary)] rounded-xs transition-colors cursor-pointer text-[var(--ink-secondary)] hover:text-[var(--ink-primary)]"
          >
            <SlidersHorizontal class="w-3.5 h-3.5" />
            <span>分类管理</span>
          </button>

          <button
            @click="emit('openAdd')"
            class="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-mono-archive bg-[var(--ink-primary)] text-[var(--bg-archive)] rounded-xs hover:opacity-90 transition-opacity cursor-pointer shadow-xs"
          >
            <Plus class="w-3.5 h-3.5" />
            <span>记一笔</span>
          </button>
        </div>
      </div>
    </header>

    <!-- 1. 个人资产负债总览表 (Balance Sheet + Integrated Credit Ledger) -->
    <section class="rounded-xs border border-[var(--border-subtle)] bg-[var(--bg-subtle)]/25 overflow-hidden">
      <!-- 四列核心资产指标网格 -->
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-[var(--border-subtle)]">
        <!-- 01 个人净资产 -->
        <div class="p-5 sm:p-6 space-y-2">
          <div class="flex items-center justify-between text-[11px] font-mono-archive text-[var(--ink-muted)]">
            <span>01 · 个人净资产</span>
            <span class="text-[11px]">实时核算</span>
          </div>
          <div class="font-serif-editorial text-2xl sm:text-3xl font-semibold tracking-tight text-[var(--ink-primary)]">
            {{ (assetsOverview?.net_worth ?? estimatedNetWorth) < 0 ? '-' : '' }}¥{{ formatMoney(Math.abs(assetsOverview?.net_worth ?? estimatedNetWorth)) }}
          </div>
          <p class="text-[11px] font-mono-archive text-[var(--ink-muted)]">
            流动资金 + 固资 − 待还负债
          </p>
        </div>

        <!-- 02 流动资金池 -->
        <div
          @click="!isEditingLiquidBalance && (activeSubTab = 'ledger')"
          class="p-5 sm:p-6 space-y-2 transition-colors cursor-pointer"
          :class="activeSubTab === 'ledger' ? 'bg-[var(--bg-archive)]/60' : 'hover:bg-[var(--bg-subtle)]/40'"
        >
          <div class="flex items-center justify-between text-[11px] font-mono-archive text-[var(--ink-muted)]">
            <span>02 · 流动资金池</span>
            <button
              v-if="!isEditingLiquidBalance"
              @click.stop="openEditLiquidBalance"
              type="button"
              class="text-[11px] text-[var(--ink-secondary)] hover:text-[var(--ink-primary)] underline underline-offset-2 cursor-pointer transition-colors"
            >
              校准底数
            </button>
          </div>

          <div v-if="!isEditingLiquidBalance" class="font-serif-editorial text-2xl sm:text-3xl font-medium tracking-tight" :class="liquidBalanceDisplay >= 0 ? 'text-[var(--ink-primary)]' : 'text-red-700'">
            {{ liquidBalanceDisplay < 0 ? '-' : '' }}¥{{ formatMoney(Math.abs(liquidBalanceDisplay)) }}
          </div>

          <div v-else @click.stop class="flex items-center gap-1.5 pt-0.5 font-mono-archive">
            <span class="text-xs text-[var(--ink-muted)]">¥</span>
            <input
              v-model="liquidBalanceInput"
              type="number"
              step="0.01"
              placeholder="0.00"
              class="w-24 px-2 py-1 text-xs bg-[var(--bg-archive)] border border-[var(--border-subtle)] focus:border-[var(--ink-primary)] rounded-xs outline-none text-[var(--ink-primary)]"
            />
            <button
              @click="saveInitialLiquidBalance"
              type="button"
              :disabled="isSavingLiquidBalance"
              class="px-2 py-1 text-[11px] bg-[var(--ink-primary)] text-[var(--bg-archive)] rounded-xs cursor-pointer hover:opacity-90 shrink-0"
            >
              保存
            </button>
            <button
              @click="isEditingLiquidBalance = false"
              type="button"
              class="px-1.5 py-1 text-[11px] text-[var(--ink-muted)] hover:text-[var(--ink-primary)] cursor-pointer shrink-0"
            >
              取消
            </button>
          </div>

          <p class="text-[11px] font-mono-archive text-[var(--ink-muted)] truncate">
            <template v-if="assetsOverview?.initial_liquid_balance">
              初始底数 ¥{{ formatMoney(assetsOverview.initial_liquid_balance) }}
            </template>
            <template v-else>
              储蓄底数与日常收支结余
            </template>
          </p>
        </div>

        <!-- 03 固定资产沉淀 -->
        <div
          @click="activeSubTab = 'gear'"
          class="p-5 sm:p-6 space-y-2 transition-colors cursor-pointer"
          :class="activeSubTab === 'gear' ? 'bg-[var(--bg-archive)]/60' : 'hover:bg-[var(--bg-subtle)]/40'"
        >
          <div class="flex items-center justify-between text-[11px] font-mono-archive text-[var(--ink-muted)]">
            <span>03 · 固定资产沉淀</span>
            <span>{{ assetsOverview?.gear_summary?.active_count ?? activeGearCount }} 件在役</span>
          </div>
          <div class="font-serif-editorial text-2xl sm:text-3xl font-medium tracking-tight text-[var(--ink-primary)]">
            ¥{{ formatMoney(assetsOverview?.fixed_assets ?? totalFixedAssets) }}
          </div>
          <p class="text-[11px] font-mono-archive text-[var(--ink-muted)]">
            <template v-if="(assetsOverview?.gear_summary?.sold_recovered_value ?? 0) > 0">
              累计二手回血 +¥{{ formatMoney(assetsOverview?.gear_summary?.sold_recovered_value || 0) }}
            </template>
            <template v-else>
              在用生产力设备
            </template>
          </p>
        </div>

        <!-- 04 待还信贷分期 -->
        <div class="p-5 sm:p-6 space-y-2">
          <div class="flex items-center justify-between text-[11px] font-mono-archive text-[var(--ink-muted)]">
            <span>04 · 待还信贷分期</span>
            <span>{{ activeInstallmentsList.length }} 笔在还</span>
          </div>
          <div
            class="font-serif-editorial text-2xl sm:text-3xl font-medium tracking-tight"
            :class="(assetsOverview?.total_liabilities ?? totalInstallmentLiabilities) > 0 ? 'text-[var(--accent-warm)]' : 'text-[var(--ink-primary)]'"
          >
            {{ (assetsOverview?.total_liabilities ?? totalInstallmentLiabilities) > 0 ? '-' : '' }}¥{{ formatMoney(assetsOverview?.total_liabilities ?? totalInstallmentLiabilities) }}
          </div>
          <p class="text-[11px] font-mono-archive text-[var(--ink-muted)]">
            <template v-if="(assetsOverview?.monthly_liabilities ?? 0) > 0">
              月供合计 ¥{{ formatMoney(assetsOverview?.monthly_liabilities || 0) }} / 月
            </template>
            <template v-else>
              当前无待还分期负债
            </template>
          </p>
        </div>
      </div>

      <!-- 信贷渠道倒计时底栏 -->
      <div class="px-5 sm:px-6 py-3 border-t border-[var(--border-subtle)] bg-[var(--bg-subtle)]/45 flex flex-wrap items-center justify-between gap-3 font-mono-archive text-xs">
        <div class="flex flex-wrap items-center gap-2.5">
          <span class="text-[11px] text-[var(--ink-muted)] mr-1">信贷还款日历</span>
          <template v-if="assetsOverview?.channel_liabilities && assetsOverview.channel_liabilities.length > 0">
            <div
              v-for="ch in assetsOverview.channel_liabilities"
              :key="ch.channel_code"
              class="px-2.5 py-1 rounded-xs border border-[var(--border-subtle)] bg-[var(--bg-archive)] inline-flex items-center gap-2 text-[11px]"
            >
              <span class="w-1.5 h-1.5 rounded-full shrink-0" :style="{ backgroundColor: ch.color || 'var(--accent-warm)' }" />
              <span class="text-[var(--ink-secondary)]">{{ ch.channel_name }}</span>
              <span class="text-[var(--ink-primary)] font-medium">
                {{ ch.days_until_repayment === 0 ? '今日还款' : `${ch.days_until_repayment} 天后 (每月${ch.repayment_day}日)` }}
              </span>
              <span v-if="ch.total_debt > 0" class="text-[var(--accent-warm)] border-l border-[var(--border-subtle)] pl-2">
                待还 ¥{{ formatMoney(ch.total_debt) }}
              </span>
            </div>
          </template>
          <template v-else>
            <div class="px-2.5 py-1 rounded-xs border border-[var(--border-subtle)] bg-[var(--bg-archive)] inline-flex items-center gap-2 text-[11px]">
              <span class="w-1.5 h-1.5 rounded-full bg-[var(--accent-warm)]" />
              <span class="text-[var(--ink-secondary)]">花呗</span>
              <span class="text-[var(--ink-primary)] font-medium">{{ huabeiCountdown === 0 ? '今日到期' : `${huabeiCountdown} 天后 (每月10日)` }}</span>
            </div>
            <div class="px-2.5 py-1 rounded-xs border border-[var(--border-subtle)] bg-[var(--bg-archive)] inline-flex items-center gap-2 text-[11px]">
              <span class="w-1.5 h-1.5 rounded-full bg-[var(--accent-vermilion)]" />
              <span class="text-[var(--ink-secondary)]">京东白条</span>
              <span class="text-[var(--ink-primary)] font-medium">{{ baitiaoCountdown === 0 ? '今日到期' : `${baitiaoCountdown} 天后 (每月20日)` }}</span>
            </div>
          </template>
        </div>

        <button
          @click="isCreditModalOpen = true"
          type="button"
          class="px-2.5 py-1 rounded-xs border border-[var(--border-subtle)] hover:border-[var(--ink-primary)] bg-[var(--bg-archive)] text-[var(--ink-secondary)] hover:text-[var(--ink-primary)] transition-colors cursor-pointer inline-flex items-center gap-1.5 text-[11px] shrink-0"
        >
          <Settings class="w-3 h-3" />
          <span>管理信贷渠道</span>
        </button>
      </div>

      <!-- 内嵌式在还分期进度明细条 (紧贴资产负债表底部，杜绝页面中部冗余大块割裂) -->
      <div
        v-if="activeInstallmentsList.length > 0"
        class="divide-y divide-[var(--border-subtle)]/60 border-t border-[var(--border-subtle)] bg-[var(--bg-archive)]/60"
      >
        <div
          v-for="item in activeInstallmentsList"
          :key="item.tx.id"
          class="px-5 sm:px-6 py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs font-mono-archive hover:bg-[var(--bg-subtle)]/35 transition-colors"
        >
          <div class="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span class="px-1.5 py-0.5 text-[11px] rounded-xs border border-[var(--accent-warm)]/35 text-[var(--accent-warm)] bg-[var(--accent-warm)]/5 shrink-0">
              {{ item.channelName }} · 每月 {{ item.tx.repayment_day || 10 }} 日
            </span>
            <span class="font-serif-editorial text-sm font-medium text-[var(--ink-primary)]">
              {{ item.tx.title }}
            </span>
            <span class="text-[11px] text-[var(--ink-muted)]">
              总额 ¥{{ formatMoney(item.tx.installment_total_amount || item.tx.amount) }} · 每期 ¥{{ formatMoney(calcInstallmentPeriodAmount(item.tx)) }}
            </span>
          </div>

          <div class="flex items-center justify-between sm:justify-end gap-4 shrink-0">
            <!-- 期数进度条 -->
            <div class="flex items-center gap-2.5">
              <div class="w-20 h-1.5 rounded-full bg-[var(--border-subtle)] overflow-hidden hidden sm:block">
                <div
                  class="h-full bg-[var(--accent-warm)] transition-all duration-300"
                  :style="{
                    width: `${Math.min(100, Math.max(5, Math.round((((item.tx.installment_months || 12) - (item.tx.installment_remain_months || 0)) / (item.tx.installment_months || 12)) * 100)))}%`,
                  }"
                />
              </div>
              <span class="text-[11px] text-[var(--ink-secondary)] whitespace-nowrap">
                已还 {{ (item.tx.installment_months || 12) - (item.tx.installment_remain_months || 0) }}/{{ item.tx.installment_months || 12 }} 期 · 剩 {{ item.tx.installment_remain_months }} 期
              </span>
            </div>

            <div class="flex items-center gap-2.5">
              <span class="text-sm font-serif-editorial font-semibold text-[var(--accent-warm)] whitespace-nowrap">
                待还 ¥{{ formatMoney(calcInstallmentRemainingDebt(item.tx)) }}
              </span>
              <button
                type="button"
                @click="startEdit(item.tx)"
                class="px-2 py-0.5 text-[11px] rounded-xs border border-[var(--border-subtle)] hover:border-[var(--ink-primary)] text-[var(--ink-secondary)] hover:text-[var(--ink-primary)] cursor-pointer transition-colors whitespace-nowrap shrink-0"
              >
                校准期数
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- 2. 二级子视图切换栏：月度收支台账 ⟷ 固定资产设备库 -->
    <div class="flex flex-wrap items-center justify-between gap-4 border-b border-[var(--border-subtle)] pb-4">
      <div class="flex items-center gap-6 text-sm font-serif-editorial">
        <button
          type="button"
          @click="activeSubTab = 'ledger'"
          class="pb-1.5 transition-colors cursor-pointer flex items-center gap-2"
          :class="
            activeSubTab === 'ledger'
              ? 'text-[var(--ink-primary)] font-medium border-b-2 border-[var(--ink-primary)]'
              : 'text-[var(--ink-muted)] hover:text-[var(--ink-primary)]'
          "
        >
          <span>月度收支台账</span>
          <span class="font-mono-archive text-xs text-[var(--ink-muted)]">({{ transactionsList.length }})</span>
        </button>

        <button
          type="button"
          @click="activeSubTab = 'gear'"
          class="pb-1.5 transition-colors cursor-pointer flex items-center gap-2"
          :class="
            activeSubTab === 'gear'
              ? 'text-[var(--ink-primary)] font-medium border-b-2 border-[var(--ink-primary)]'
              : 'text-[var(--ink-muted)] hover:text-[var(--ink-primary)]'
          "
        >
          <span>固定资产设备库</span>
          <span class="font-mono-archive text-xs text-[var(--ink-muted)]">
            (在役 {{ assetsOverview?.gear_summary?.active_count ?? activeGearCount }})
          </span>
        </button>
      </div>

      <!-- 右侧联动操作区：台账视图显示月份切换与导出，设备视图显示筛选与录入 -->
      <div v-if="activeSubTab === 'ledger'" class="flex flex-wrap items-center gap-3 font-mono-archive text-xs">
        <div class="inline-flex items-center gap-1 border border-[var(--border-subtle)] rounded-xs px-2 py-1 bg-[var(--bg-subtle)]/30">
          <button
            @click="prevMonth"
            class="p-0.5 hover:text-[var(--ink-primary)] text-[var(--ink-muted)] cursor-pointer"
            title="上个月"
          >
            <ChevronLeft class="w-3.5 h-3.5" />
          </button>
          <span class="px-2 text-[var(--ink-primary)] font-medium">
            {{ year }} 年 {{ month }} 月
          </span>
          <button
            @click="nextMonth"
            class="p-0.5 hover:text-[var(--ink-primary)] text-[var(--ink-muted)] cursor-pointer"
            title="下个月"
          >
            <ChevronRight class="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <div v-else class="flex flex-wrap items-center gap-2.5 text-xs font-mono-archive">
        <div class="inline-flex items-center rounded-xs border border-[var(--border-subtle)] p-0.5 bg-[var(--bg-subtle)]/40">
          <button
            type="button"
            @click="gearFilter = 'active'"
            class="px-2.5 py-1 rounded-xs transition-colors cursor-pointer whitespace-nowrap"
            :class="gearFilter === 'active' ? 'bg-[var(--ink-primary)] text-[var(--bg-archive)] font-medium' : 'text-[var(--ink-muted)] hover:text-[var(--ink-primary)]'"
          >
            在役 ({{ allGearItems.filter((g) => g.status !== 'sold').length }})
          </button>
          <button
            type="button"
            @click="gearFilter = 'sold'"
            class="px-2.5 py-1 rounded-xs transition-colors cursor-pointer whitespace-nowrap"
            :class="gearFilter === 'sold' ? 'bg-[var(--ink-primary)] text-[var(--bg-archive)] font-medium' : 'text-[var(--ink-muted)] hover:text-[var(--ink-primary)]'"
          >
            已转售 ({{ allGearItems.filter((g) => g.status === 'sold').length }})
          </button>
          <button
            type="button"
            @click="gearFilter = 'all'"
            class="px-2.5 py-1 rounded-xs transition-colors cursor-pointer whitespace-nowrap"
            :class="gearFilter === 'all' ? 'bg-[var(--ink-primary)] text-[var(--bg-archive)] font-medium' : 'text-[var(--ink-muted)] hover:text-[var(--ink-primary)]'"
          >
            全部
          </button>
        </div>

        <button
          type="button"
          @click="openAddGearModal"
          class="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xs border border-[var(--ink-primary)] bg-[var(--ink-primary)] text-[var(--bg-archive)] hover:opacity-90 transition-opacity cursor-pointer whitespace-nowrap shrink-0"
        >
          <Laptop class="w-3.5 h-3.5" />
          <span>录入新设备</span>
        </button>
      </div>
    </div>

    <!-- 视图 A：月度收支概览与流水台账（默认主视图） -->
    <section v-if="activeSubTab === 'ledger'" class="space-y-8">
      <!-- 框体化月度核心收支三联表 + 支出光谱分布 -->
      <div class="rounded-xs border border-[var(--border-subtle)] bg-[var(--bg-subtle)]/20 overflow-hidden">
        <div class="grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-[var(--border-subtle)] font-serif-editorial">
          <div class="p-5 sm:p-6 space-y-1">
            <span class="font-mono-archive text-xs tracking-wider text-[var(--ink-muted)] block">
              {{ month }} 月支出合计
            </span>
            <div class="text-2xl sm:text-3xl font-medium tracking-tight text-[var(--ink-primary)]">
              ¥{{ formatMoney(summary?.total_expense || 0) }}
            </div>
          </div>

          <div class="p-5 sm:p-6 space-y-1">
            <span class="font-mono-archive text-xs tracking-wider text-[var(--ink-muted)] block">
              {{ month }} 月收入合计
            </span>
            <div class="text-2xl sm:text-3xl font-medium tracking-tight text-[var(--accent-moss)]">
              ¥{{ formatMoney(summary?.total_income || 0) }}
            </div>
          </div>

          <div class="p-5 sm:p-6 space-y-1">
            <span class="font-mono-archive text-xs tracking-wider text-[var(--ink-muted)] block">
              当月净结余
            </span>
            <div
              class="text-2xl sm:text-3xl font-medium tracking-tight"
              :class="(summary?.balance || 0) >= 0 ? 'text-[var(--ink-primary)]' : 'text-red-700'"
            >
              {{ (summary?.balance || 0) < 0 ? '-' : '' }}¥{{ formatMoney(Math.abs(summary?.balance || 0)) }}
            </div>
          </div>
        </div>

        <!-- 支出光谱细线条（内嵌于月度总览框底部） -->
        <div
          v-if="summary && summary.total_expense > 0 && spectrumItems.length > 0"
          class="p-5 sm:p-6 border-t border-[var(--border-subtle)] bg-[var(--bg-archive)]/50 space-y-3.5"
        >
          <div class="flex items-center justify-between text-xs font-mono-archive text-[var(--ink-muted)]">
            <span class="tracking-wider">支出类目分布</span>
            <span>{{ spectrumItems.length }} 个支出类目</span>
          </div>

          <div class="h-2 w-full rounded-full bg-[var(--bg-subtle)] overflow-hidden flex">
            <div
              v-for="item in spectrumItems"
              :key="item.category"
              :style="{ width: `${item.percentage}%`, backgroundColor: item.color }"
              class="h-full transition-all duration-300 relative group cursor-pointer"
              :title="`${item.category}: ¥${formatMoney(item.amount)} (${item.percentage}%)`"
            ></div>
          </div>

          <div class="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs font-mono-archive">
            <button
              v-for="item in spectrumItems"
              :key="item.category"
              @click="toggleCategoryFilter(item.category)"
              class="flex items-center gap-2 py-0.5 px-1.5 rounded-xs transition-colors cursor-pointer border"
              :class="selectedCategoryFilter === item.category
                ? 'border-[var(--ink-primary)] bg-[var(--bg-subtle)] text-[var(--ink-primary)] font-semibold'
                : 'border-transparent text-[var(--ink-secondary)] hover:text-[var(--ink-primary)]'"
            >
              <span class="w-2 h-2 rounded-full shrink-0" :style="{ backgroundColor: item.color }"></span>
              <span>{{ item.category }}</span>
              <span class="text-[var(--ink-muted)]">{{ item.percentage }}%</span>
              <span class="font-mono-archive text-[var(--ink-primary)]">¥{{ formatMoney(item.amount) }}</span>
            </button>

            <button
              v-if="selectedCategoryFilter"
              @click="selectedCategoryFilter = ''"
              class="text-[11px] text-[var(--accent-warm)] hover-underline cursor-pointer ml-auto"
            >
              清空类目筛选（显示全部）
            </button>
          </div>
        </div>
      </div>

      <!-- 记账列表 (按日汇聚) -->
      <div
        v-if="dayGroups.length === 0"
        class="py-14 px-6 rounded-xs border border-dashed border-[var(--border-subtle)] bg-[var(--bg-subtle)]/15 text-center space-y-4"
      >
        <div class="w-10 h-10 rounded-full border border-[var(--border-subtle)] flex items-center justify-center mx-auto text-[var(--ink-muted)]">
          <Wallet class="w-4 h-4" />
        </div>
        <div class="space-y-1 font-serif-editorial">
          <h3 class="text-base text-[var(--ink-primary)]">{{ year }} 年 {{ month }} 月尚无收支流水</h3>
          <p class="text-xs text-[var(--ink-muted)]">
            从一顿具体的餐食、一件器物或一笔回血开始，记录真实的资产变动。
          </p>
        </div>
        <button
          @click="emit('openAdd')"
          class="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-mono-archive border border-[var(--border-subtle)] hover:border-[var(--ink-primary)] rounded-xs cursor-pointer transition-colors"
        >
          <Plus class="w-3.5 h-3.5" />
          <span>添加本月第一笔账目</span>
        </button>
      </div>

      <div v-else class="space-y-8">
        <section
          v-for="group in dayGroups"
          :key="group.dateStr"
          class="space-y-2"
        >
          <!-- 复式账簿日表头：双细线与日合计 -->
          <div class="flex items-baseline justify-between border-b-2 border-double border-[var(--border-divider)] pb-1.5 text-xs font-mono-archive text-[var(--ink-muted)]">
            <div class="flex items-center gap-2">
              <span class="w-1.5 h-1.5 rounded-full bg-[var(--accent-warm)]"></span>
              <span class="text-sm font-serif-editorial text-[var(--ink-primary)] font-medium tracking-wide">
                {{ group.displayDay }}
              </span>
            </div>
            <span v-if="group.dayTotalExpense > 0" class="tracking-wide">
              支出小计：<span class="text-[var(--ink-primary)] font-medium tabular-nums">-¥{{ formatMoney(group.dayTotalExpense) }}</span>
            </span>
          </div>

          <div class="divide-y divide-[var(--border-subtle)]/50">
            <div
              v-for="tx in group.items"
              :key="tx.id"
              class="py-2.5 flex items-center justify-between group hover:bg-[var(--bg-subtle)]/40 px-2 rounded-xs transition-colors"
            >
              <div class="flex items-center gap-2.5 min-w-0 flex-1 mr-3">
                <span class="text-[11px] font-mono-archive tracking-wider text-[var(--ink-muted)] border border-[var(--border-subtle)] bg-[var(--bg-archive)] px-1.5 py-0.5 rounded-xs shrink-0 select-none">
                  {{ tx.category }}
                </span>
                <span class="font-serif-editorial text-sm sm:text-base text-[var(--ink-primary)] truncate">
                  {{ tx.title }}
                </span>
                <span
                  v-if="tx.is_installment"
                  class="text-[11px] font-mono-archive tracking-wider text-[var(--accent-warm)] border border-[var(--accent-warm)]/40 px-1.5 py-0.2 rounded-xs bg-[var(--accent-warm)]/5 shrink-0 select-none"
                >
                  分期
                </span>
                <span v-if="tx.payment_method" class="text-[11px] font-mono-archive text-[var(--ink-muted)] hidden lg:inline shrink-0">
                  [{{ tx.payment_method }}]
                </span>
                <span v-if="tx.note" class="text-xs font-serif-editorial text-[var(--ink-muted)] truncate hidden md:inline">
                  — {{ tx.note }}
                </span>
                <!-- 日式账簿点导引线 -->
                <div class="dot-leader hidden sm:block"></div>
              </div>

              <div class="flex items-center gap-3 font-mono-archive text-sm shrink-0">
                <span
                  class="tabular-nums font-medium"
                  :class="tx.type === 'expense' ? 'text-[var(--ink-primary)]' : 'text-[var(--accent-moss)]'"
                >
                  {{ tx.type === 'expense' ? '-' : '+' }}¥{{ formatMoney(tx.amount) }}
                </span>

                <div class="flex sm:hidden sm:group-hover:flex items-center gap-1.5 text-xs text-[var(--ink-muted)]">
                  <button
                    @click="startEdit(tx)"
                    class="p-1 hover:text-[var(--ink-primary)] cursor-pointer transition-colors"
                    title="修改账目"
                  >
                    <Edit2 class="w-3.5 h-3.5" />
                  </button>
                  <button
                    @click="removeTx(tx.id)"
                    class="p-1 hover:text-red-700 cursor-pointer transition-colors"
                    title="删除账目"
                  >
                    <Trash2 class="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>
    </section>

    <!-- 视图 B：随身与桌面固定资产设备库（固定双列网格，告别单件全屏拉伸） -->
    <section v-else class="space-y-6">
      <div
        v-if="filteredGearItems.length === 0"
        class="p-12 rounded-xs border border-dashed border-[var(--border-subtle)] bg-[var(--bg-subtle)]/15 text-center space-y-3"
      >
        <p class="font-serif-editorial text-base text-[var(--ink-secondary)]">
          {{ gearFilter === 'sold' ? '尚无转售回血的设备记录' : '固定资产设备库暂无在役单品' }}
        </p>
        <p class="font-mono-archive text-xs text-[var(--ink-muted)]">
          可录入新设备或在达成心愿时沉淀至固定资产库。
        </p>
      </div>

      <div
        v-else
        class="grid grid-cols-1 md:grid-cols-2 gap-5"
      >
        <article
          v-for="(gear, idx) in filteredGearItems"
          :key="gear.id || gear.name"
          class="p-5 sm:p-6 rounded-xs border border-[var(--border-subtle)] bg-[var(--bg-subtle)]/30 hover:border-[var(--border-divider)] transition-all flex flex-col justify-between gap-4 group"
        >
          <!-- 卡片顶栏：编号 + 类目 + 状态与动作按钮 -->
          <div class="flex items-center justify-between gap-3 text-[11px] font-mono-archive">
            <div class="flex items-center gap-2 min-w-0">
              <span class="text-[var(--ink-muted)] shrink-0">NO. {{ String(idx + 1).padStart(2, '0') }}</span>
              <span class="text-[var(--border-divider)] shrink-0">/</span>
              <span class="text-[var(--ink-secondary)] truncate">{{ gear.category || '固定资产' }}</span>
              <span
                v-if="gear.status === 'sold'"
                class="vermilion-seal px-1.5 py-0.2 text-[11px] shrink-0 font-mono-archive"
              >
                已回血
              </span>
              <span
                v-else
                class="px-1.5 py-0.5 rounded-xs text-[11px] shrink-0 border bg-emerald-900/10 text-[var(--accent-moss)] border-[var(--accent-moss)]/30 font-mono-archive"
              >
                在役自用
              </span>
            </div>

            <div class="flex items-center gap-2 shrink-0">
              <button
                v-if="gear.status !== 'sold' && gear.id"
                type="button"
                @click="openSellGearModal(gear)"
                class="px-2.5 py-1 text-[11px] rounded-xs border border-[var(--border-subtle)] hover:border-[var(--ink-primary)] bg-[var(--bg-archive)] text-[var(--ink-secondary)] hover:text-[var(--ink-primary)] transition-colors cursor-pointer inline-flex items-center gap-1 whitespace-nowrap shrink-0"
                title="转售出二手"
              >
                <ArrowRightLeft class="w-3 h-3 shrink-0" />
                <span>出二手回血</span>
              </button>
              <button
                v-if="gear.id"
                type="button"
                @click="handleRemoveGear(gear)"
                class="p-1 text-[var(--ink-muted)] hover:text-red-700 transition-colors cursor-pointer shrink-0"
                title="移除设备"
              >
                <Trash2 class="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          <!-- 卡片中部：设备名称、规格与使用注记 -->
          <div class="space-y-1.5">
            <div class="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <h3 class="font-serif-editorial text-xl font-medium text-[var(--ink-primary)] tracking-tight">
                {{ gear.name }}
              </h3>
              <span v-if="gear.spec" class="font-mono-archive text-xs text-[var(--ink-muted)]">
                {{ gear.spec }}
              </span>
            </div>
            <p v-if="gear.note" class="font-serif-editorial text-sm text-[var(--ink-secondary)] italic leading-relaxed">
              “{{ gear.note }}”
            </p>
          </div>

          <!-- 卡片底栏：三栏式资产指标底款（购入原值 · 服役时长 · 日均成本/回血） -->
          <div class="pt-3.5 border-t border-[var(--border-subtle)]/70 grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4 font-mono-archive text-xs">
            <div class="space-y-0.5">
              <span class="block text-[11px] text-[var(--ink-muted)]">购入原值</span>
              <span class="font-serif-editorial text-base font-medium text-[var(--ink-primary)]">
                ¥{{ formatMoney(gear.price_cents || 0) }}
              </span>
            </div>

            <div class="space-y-0.5">
              <span class="block text-[11px] text-[var(--ink-muted)]">
                {{ gear.purchase_date ? `购于 ${gear.purchase_date}` : '服役时长' }}
              </span>
              <span class="font-serif-editorial text-base font-medium text-[var(--ink-primary)]">
                <template v-if="gearHoldingStatsMap.get(gear.id || '')">
                  {{ gearHoldingStatsMap.get(gear.id || '')?.days }} 天
                </template>
                <template v-else>—</template>
              </span>
            </div>

            <div class="space-y-0.5">
              <template v-if="gear.status === 'sold' && gear.sold_price_cents">
                <span class="block text-[11px] text-[var(--ink-muted)]">二手回血</span>
                <span class="font-serif-editorial text-base font-medium text-[var(--accent-moss)]">
                  +¥{{ formatMoney(gear.sold_price_cents) }}
                </span>
              </template>
              <template v-else>
                <span class="block text-[11px] text-[var(--ink-muted)]">日均持有成本</span>
                <span class="font-serif-editorial text-base font-medium text-[var(--ink-primary)]">
                  <template v-if="gearHoldingStatsMap.get(gear.id || '')">
                    ¥{{ formatMoney(gearHoldingStatsMap.get(gear.id || '')?.dailyCents || 0) }}<span class="text-[11px] font-normal text-[var(--ink-muted)]">/天</span>
                  </template>
                  <template v-else>—</template>
                </span>
              </template>
            </div>
          </div>
        </article>
      </div>
    </section>

    <!-- 模态框 A：录入新固定资产设备 -->
    <div
      v-if="isAddGearModalOpen"
      class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/45 backdrop-blur-xs animate-in fade-in duration-200"
      @click.self="isAddGearModalOpen = false"
    >
      <div class="bg-[var(--bg-archive)] border border-[var(--border-subtle)] p-6 rounded-xs w-full max-w-lg space-y-4 max-h-[90dvh] overflow-y-auto pb-[max(1.5rem,env(safe-area-inset-bottom,1.5rem))]">
        <div class="flex items-center justify-between pb-3 border-b border-[var(--border-subtle)]">
          <div>
            <h3 class="font-serif-editorial text-lg font-medium text-[var(--ink-primary)]">
              录入随身与固定资产设备
            </h3>
            <p class="font-mono-archive text-[11px] text-[var(--ink-muted)]">
              沉淀长伴身边的硬件器材，支持同步生成购置支出或分期账单
            </p>
          </div>
          <button @click="isAddGearModalOpen = false" class="text-[var(--ink-muted)] hover:text-[var(--ink-primary)] cursor-pointer">
            <X class="w-4 h-4" />
          </button>
        </div>

        <div v-if="gearErrorMsg" class="p-2.5 bg-red-50 text-red-700 text-xs rounded-xs border border-red-200">
          {{ gearErrorMsg }}
        </div>

        <div class="space-y-4 text-xs font-mono-archive">
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label class="block text-[var(--ink-muted)] mb-1">设备名称 *</label>
              <input
                v-model="newGearName"
                type="text"
                class="w-full px-3 py-2 text-sm border border-[var(--border-subtle)] rounded-xs outline-none bg-transparent text-[var(--ink-primary)] font-serif-editorial"
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
                v-model="newGearCategory"
                :options="gearCategories.map((c) => ({ value: c, label: c }))"
              />
            </div>
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label class="block text-[var(--ink-muted)] mb-1">购入原值 (¥)</label>
              <input
                v-model="newGearPriceYuan"
                type="number"
                step="0.01"
                min="0"
                placeholder="0.00"
                class="w-full px-3 py-2 text-sm border border-[var(--border-subtle)] rounded-xs outline-none bg-transparent text-[var(--ink-primary)]"
              />
            </div>
            <div>
              <label class="block text-[var(--ink-muted)] mb-1">购入日期</label>
              <PaperDatePicker
                v-model="newGearPurchaseDate"
              />
            </div>
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label class="block text-[var(--ink-muted)] mb-1">规格型号</label>
              <input
                v-model="newGearSpec"
                type="text"
                class="w-full px-3 py-2 text-xs border border-[var(--border-subtle)] rounded-xs outline-none bg-transparent text-[var(--ink-primary)]"
              />
            </div>
            <div>
              <label class="block text-[var(--ink-muted)] mb-1">体验随记</label>
              <input
                v-model="newGearNote"
                type="text"
                class="w-full px-3 py-2 text-xs border border-[var(--border-subtle)] rounded-xs outline-none bg-transparent text-[var(--ink-primary)] font-serif-editorial"
              />
            </div>
          </div>

          <div class="p-3 rounded-xs border border-[var(--border-subtle)] bg-[var(--bg-subtle)]/30 space-y-3">
            <div class="flex items-center gap-2">
              <input
                id="newGearCreateTxCheck"
                v-model="newGearCreateTx"
                type="checkbox"
                class="rounded-xs cursor-pointer accent-[var(--ink-primary)]"
              />
              <label for="newGearCreateTxCheck" class="text-[var(--ink-primary)] cursor-pointer select-none">
                同步生成一笔「设备购置」支出账目流水
              </label>
            </div>

            <div v-if="newGearCreateTx" class="space-y-3 pt-1">
              <div class="flex items-center gap-2">
                <input
                  id="newGearInstallmentCheck"
                  v-model="newGearIsInstallment"
                  type="checkbox"
                  class="rounded-xs cursor-pointer accent-[var(--ink-primary)]"
                />
                <label for="newGearInstallmentCheck" class="text-[var(--ink-secondary)] cursor-pointer select-none">
                  该设备使用信贷分期购入
                </label>
              </div>

              <div v-if="newGearIsInstallment" class="grid grid-cols-2 gap-3">
                <div>
                  <label class="block text-[var(--ink-muted)] mb-1">分期渠道</label>
                  <PaperSelect
                    v-model="newGearInstallmentChannel"
                    size="sm"
                    :options="displayCreditChannels.map((c) => ({ value: c.code, label: `${c.name} (${c.repayment_day}日)` }))"
                  />
                </div>
                <div>
                  <label class="block text-[var(--ink-muted)] mb-1">分期期数</label>
                  <PaperSelect
                    v-model="newGearInstallmentMonths"
                    size="sm"
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
            @click="isAddGearModalOpen = false"
            class="px-3 py-1.5 text-xs font-mono-archive text-[var(--ink-muted)] hover:text-[var(--ink-primary)] cursor-pointer"
          >
            取消
          </button>
          <button
            type="button"
            :disabled="isSubmittingGear"
            @click="handleCreateGear"
            class="px-4 py-1.5 text-xs font-mono-archive bg-[var(--ink-primary)] text-[var(--bg-archive)] rounded-xs cursor-pointer hover:opacity-90 disabled:opacity-50"
          >
            {{ isSubmittingGear ? '录入中...' : '确认入库' }}
          </button>
        </div>
      </div>
    </div>

    <!-- 模态框 B：设备转售出二手回血 -->
    <div
      v-if="sellingGear"
      class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/45 backdrop-blur-xs animate-in fade-in duration-200"
      @click.self="sellingGear = null"
    >
      <div class="bg-[var(--bg-archive)] border border-[var(--border-subtle)] p-6 rounded-xs w-full max-w-md space-y-4">
        <div class="flex items-center justify-between pb-3 border-b border-[var(--border-subtle)]">
          <div>
            <h3 class="font-serif-editorial text-lg font-medium text-[var(--ink-primary)]">
              出二手回血 · {{ sellingGear.name }}
            </h3>
            <p class="font-mono-archive text-[11px] text-[var(--ink-muted)]">
              原值 ¥{{ formatMoney(sellingGear.price_cents || 0) }} · 自动转为已售状态并记入「二手回血」收入
            </p>
          </div>
          <button @click="sellingGear = null" class="text-[var(--ink-muted)] hover:text-[var(--ink-primary)] cursor-pointer">
            <X class="w-4 h-4" />
          </button>
        </div>

        <div v-if="sellErrorMsg" class="p-2.5 bg-red-50 text-red-700 text-xs rounded-xs border border-red-200">
          {{ sellErrorMsg }}
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
              class="w-full px-3 py-2 text-base border border-[var(--border-subtle)] rounded-xs outline-none bg-transparent text-[var(--ink-primary)]"
              autofocus
            />
          </div>

          <div>
            <label class="block text-[var(--ink-muted)] mb-1">出手日期</label>
            <PaperDatePicker
              v-model="sellDate"
            />
          </div>

          <div>
            <label class="block text-[var(--ink-muted)] mb-1">流转备注</label>
            <input
              v-model="sellNote"
              type="text"
              class="w-full px-3 py-2 text-xs border border-[var(--border-subtle)] rounded-xs outline-none bg-transparent text-[var(--ink-primary)] font-serif-editorial"
            />
          </div>
        </div>

        <div class="flex items-center justify-end gap-3 pt-3 border-t border-[var(--border-subtle)]">
          <button
            type="button"
            @click="sellingGear = null"
            class="px-3 py-1.5 text-xs font-mono-archive text-[var(--ink-muted)] hover:text-[var(--ink-primary)] cursor-pointer"
          >
            取消
          </button>
          <button
            type="button"
            :disabled="isSubmittingSell"
            @click="handleSellGear"
            class="px-4 py-1.5 text-xs font-mono-archive bg-[var(--ink-primary)] text-[var(--bg-archive)] rounded-xs cursor-pointer hover:opacity-90 disabled:opacity-50"
          >
            {{ isSubmittingSell ? '处理中...' : '确认回血入账' }}
          </button>
        </div>
      </div>
    </div>

    <!-- 模态框 C：修改账目 (支持完整分期参数与城市关联) -->
    <div
      v-if="editingTx"
      class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/45 backdrop-blur-xs animate-in fade-in duration-200"
      @click.self="editingTx = null"
    >
      <div class="bg-[var(--bg-archive)] border border-[var(--border-subtle)] p-6 rounded-xs w-full max-w-lg space-y-4 max-h-[90dvh] overflow-y-auto">
        <div class="flex items-center justify-between pb-2 border-b border-[var(--border-subtle)]">
          <h3 class="font-serif-editorial text-lg font-medium text-[var(--ink-primary)]">
            修改账目
          </h3>
          <button @click="editingTx = null" class="text-[var(--ink-muted)] hover:text-[var(--ink-primary)] cursor-pointer">
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
                class="w-full px-3 py-1.5 text-sm border border-[var(--border-subtle)] rounded-xs outline-none bg-transparent text-[var(--ink-primary)]"
              />
              <p v-if="editErrorMsg" class="mt-1 text-[11px] text-[var(--accent-vermilion)]">
                {{ editErrorMsg }}
              </p>
            </div>
            <div>
              <label class="block text-[var(--ink-muted)] mb-1">事项名称 *</label>
              <input
                v-model="editTitle"
                type="text"
                class="w-full px-3 py-1.5 text-sm border border-[var(--border-subtle)] rounded-xs outline-none bg-transparent text-[var(--ink-primary)] font-serif-editorial"
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
              <CityPicker
                v-model="editCityCode"
              />
            </div>
            <div>
              <label class="block text-[var(--ink-muted)] mb-1">备注说明</label>
              <input
                v-model="editNote"
                type="text"
                class="w-full px-3 py-1.5 text-xs border border-[var(--border-subtle)] rounded-xs outline-none bg-transparent text-[var(--ink-primary)]"
              />
            </div>
          </div>

          <!-- 分期付款参数校准 -->
          <div v-if="editType === 'expense'" class="p-3 rounded-xs border border-[var(--border-subtle)] bg-[var(--bg-subtle)]/30 space-y-3">
            <div class="flex items-center gap-2">
              <input
                id="editTxInstallmentCheck"
                v-model="editIsInstallment"
                type="checkbox"
                class="rounded-xs cursor-pointer accent-[var(--ink-primary)]"
              />
              <label for="editTxInstallmentCheck" class="text-[var(--ink-primary)] cursor-pointer select-none">
                信贷分期账目 (校准总期数与剩余待还期数)
              </label>
            </div>

            <div v-if="editIsInstallment" class="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-1">
              <div class="col-span-2">
                <label class="block text-[var(--ink-muted)] mb-1">分期渠道</label>
                <PaperSelect
                  v-model="editInstallmentChannel"
                  size="sm"
                  :options="[
                    ...displayCreditChannels.map((c) => ({ value: c.code, label: c.name })),
                    { value: 'custom', label: '自定义分期' },
                  ]"
                />
              </div>
              <div>
                <label class="block text-[var(--ink-muted)] mb-1">总期数</label>
                <input
                  v-model.number="editInstallmentMonths"
                  type="number"
                  min="1"
                  max="60"
                  class="w-full px-2 py-1 text-xs border border-[var(--border-subtle)] rounded-xs bg-transparent"
                />
              </div>
              <div>
                <label class="block text-[var(--ink-muted)] mb-1">剩余期数</label>
                <input
                  v-model.number="editInstallmentRemainMonths"
                  type="number"
                  min="0"
                  max="60"
                  class="w-full px-2 py-1 text-xs border border-[var(--border-subtle)] rounded-xs bg-transparent"
                />
              </div>
            </div>
          </div>
        </div>

        <div class="flex items-center justify-end gap-3 pt-3 border-t border-[var(--border-subtle)]">
          <button @click="editingTx = null" class="px-3 py-1.5 text-xs font-mono-archive text-[var(--ink-muted)] hover:text-[var(--ink-primary)] cursor-pointer">
            取消
          </button>
          <button @click="saveEdit" class="px-4 py-1.5 text-xs font-mono-archive bg-[var(--ink-primary)] text-[var(--bg-archive)] rounded-xs cursor-pointer hover:opacity-90">
            保存修改
          </button>
        </div>
      </div>
    </div>

    <!-- 信贷渠道与独立还款日管理抽屉 (FE-15) -->
    <CreditChannelsModal
      v-if="isCreditModalOpen"
      :isOpen="isCreditModalOpen"
      @close="isCreditModalOpen = false"
      @channelsUpdated="loadAssetsOverview"
    />
  </div>
</template>
