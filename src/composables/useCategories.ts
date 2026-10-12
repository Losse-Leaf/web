import { ref, computed } from 'vue'
import {
  fetchCategories,
  createCategoryOption,
  updateCategoryOption,
  deleteCategoryOption,
  resetCategoryOptions,
} from '../utils/api'
import type { CategoryOption, CategoryScope } from '../types'

export const DEFAULT_CATEGORIES_BY_SCOPE: Record<CategoryScope, string[]> = {
  expense: ['餐饮', '交通', '购物', '数码器材', '娱乐', '学习', '住房', '医疗', '旅行度假', '其他'],
  income: ['工资收入', '二手回血', '稿酬设计', '投资理财', '礼金红包', '退款报销', '其他收入'],
  gear: ['数码器材', '影像与暗房', '工作台与算力', '手冲咖啡工坊', '夜骑巡航', '纸笔与日常', '生活好物'],
  payment: ['微信支付', '支付宝', '银行卡', '现金', '其他'],
  project: ['开源项目', '独立开发', '硬件改造', '设计作品', '写作出版'],
}

export const CATEGORY_SCOPE_META: {
  key: CategoryScope
  label: string
  desc: string
}[] = [
  { key: 'expense', label: '支出分类', desc: '用于日常开销、大件分期与旅行消费的分类统计' },
  { key: 'income', label: '收入分类', desc: '用于薪资、二手回血与各类进账的分类归档' },
  { key: 'gear', label: '固定资产分类', desc: '用于随身与桌面固定资产库、主理人器物志分类' },
  { key: 'payment', label: '支付方式', desc: '用于记账与购入固定资产时的支付渠道选择' },
  { key: 'project', label: '造物项目分类', desc: '用于造物志立项与项目归类的领域标签' },
]

const categoryItems = ref<CategoryOption[]>([])
const byScope = ref<Record<CategoryScope, string[]>>({
  expense: [...DEFAULT_CATEGORIES_BY_SCOPE.expense],
  income: [...DEFAULT_CATEGORIES_BY_SCOPE.income],
  gear: [...DEFAULT_CATEGORIES_BY_SCOPE.gear],
  payment: [...DEFAULT_CATEGORIES_BY_SCOPE.payment],
  project: [...DEFAULT_CATEGORIES_BY_SCOPE.project],
})
const hasLoaded = ref(false)
const isLoadingCategories = ref(false)

// 全局分类管理弹窗状态，任意表单或视图可一键唤起并定位到对应 Tab
const isCategoryManagerOpen = ref(false)
const activeManagerScope = ref<CategoryScope>('expense')

export function useCategories() {
  const loadCategories = async (force = false) => {
    if (hasLoaded.value && !force) return
    try {
      isLoadingCategories.value = true
      const res = await fetchCategories()
      if (res && Array.isArray(res.items)) {
        categoryItems.value = res.items
      }
      if (res && res.by_scope) {
        byScope.value = {
          expense: res.by_scope.expense?.length ? res.by_scope.expense : [...DEFAULT_CATEGORIES_BY_SCOPE.expense],
          income: res.by_scope.income?.length ? res.by_scope.income : [...DEFAULT_CATEGORIES_BY_SCOPE.income],
          gear: res.by_scope.gear?.length ? res.by_scope.gear : [...DEFAULT_CATEGORIES_BY_SCOPE.gear],
          payment: res.by_scope.payment?.length ? res.by_scope.payment : [...DEFAULT_CATEGORIES_BY_SCOPE.payment],
          project: res.by_scope.project?.length ? res.by_scope.project : [...DEFAULT_CATEGORIES_BY_SCOPE.project],
        }
      }
      hasLoaded.value = true
    } catch (err) {
      console.warn('Failed to fetch custom categories, using defaults:', err)
    } finally {
      isLoadingCategories.value = false
    }
  }

  const expenseCategories = computed(() => byScope.value.expense)
  const incomeCategories = computed(() => byScope.value.income)
  const gearCategories = computed(() => byScope.value.gear)
  const paymentMethods = computed(() => byScope.value.payment)
  const projectCategories = computed(() => byScope.value.project)

  const getItemsByScope = (scope: CategoryScope) => {
    return categoryItems.value.filter((it) => it.scope === scope)
  }

  const openCategoryManager = (scope: CategoryScope = 'expense') => {
    activeManagerScope.value = scope
    isCategoryManagerOpen.value = true
    loadCategories(true)
  }

  const closeCategoryManager = () => {
    isCategoryManagerOpen.value = false
  }

  const addCategory = async (scope: CategoryScope, name: string) => {
    const trimmed = name.trim()
    if (!trimmed) return null
    const created = await createCategoryOption({ scope, name: trimmed })
    await loadCategories(true)
    return created
  }

  const renameCategory = async (id: number, newName: string) => {
    const trimmed = newName.trim()
    if (!trimmed) return null
    const updated = await updateCategoryOption(id, {
      name: trimmed,
      rename_records: true,
    })
    await loadCategories(true)
    return updated
  }

  const removeCategory = async (id: number) => {
    await deleteCategoryOption(id)
    await loadCategories(true)
  }

  const restoreDefaults = async (scope?: CategoryScope) => {
    await resetCategoryOptions(scope)
    await loadCategories(true)
  }

  return {
    categoryItems,
    byScope,
    isLoadingCategories,
    expenseCategories,
    incomeCategories,
    gearCategories,
    paymentMethods,
    projectCategories,
    isCategoryManagerOpen,
    activeManagerScope,
    loadCategories,
    getItemsByScope,
    openCategoryManager,
    closeCategoryManager,
    addCategory,
    renameCategory,
    removeCategory,
    restoreDefaults,
  }
}
