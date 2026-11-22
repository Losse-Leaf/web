import { ref, computed } from 'vue'
import {
  fetchCategories,
  createCategoryOption,
  deleteCategoryOption,
} from '../utils/api'
import type { CategoryOption, CategoryScope } from '../types'

const DEFAULT_CATEGORIES_BY_SCOPE: Record<CategoryScope, string[]> = {
  expense: ['餐饮', '交通', '购物', '数码器材', '娱乐', '学习', '住房', '医疗', '旅行度假', '其他'],
  income: ['工资收入', '二手回血', '稿酬设计', '投资理财', '礼金红包', '退款报销', '其他收入'],
  payment: ['微信支付', '支付宝', '银行卡', '现金', '其他'],
}

export const CATEGORY_SCOPE_META: {
  key: CategoryScope
  label: string
  desc: string
}[] = [
  { key: 'expense', label: '支出分类', desc: '用于日常开销、大件分期与心愿消费的分类统计' },
  { key: 'income', label: '收入分类', desc: '用于薪资、二手回血与各类进账的分类归档' },
  { key: 'payment', label: '支付方式', desc: '用于记账时的支付渠道选择' },
]

const categoryItems = ref<CategoryOption[]>([])
const byScope = ref<Record<CategoryScope, string[]>>({
  expense: [...DEFAULT_CATEGORIES_BY_SCOPE.expense],
  income: [...DEFAULT_CATEGORIES_BY_SCOPE.income],
  payment: [...DEFAULT_CATEGORIES_BY_SCOPE.payment],
})
const hasLoaded = ref(false)
const isLoadingCategories = ref(false)
// WEB 第2批：全局版本戳，仅最新一次 loadCategories 可写回字典并复位 loading。
let categoriesFetchSeq = 0

// 全局分类管理弹窗状态，任意表单或视图可一键唤起并定位到对应 Tab
const isCategoryManagerOpen = ref(false)
const activeManagerScope = ref<CategoryScope>('expense')

export function useCategories() {
  const loadCategories = async (force = false) => {
    if (hasLoaded.value && !force) return
    const seq = ++categoriesFetchSeq
    try {
      isLoadingCategories.value = true
      const res = await fetchCategories()
      if (seq !== categoriesFetchSeq) return
      if (res && Array.isArray(res.items)) {
        categoryItems.value = res.items
      }
      if (res && res.by_scope) {
        byScope.value = {
          expense: res.by_scope.expense?.length ? res.by_scope.expense : [...DEFAULT_CATEGORIES_BY_SCOPE.expense],
          income: res.by_scope.income?.length ? res.by_scope.income : [...DEFAULT_CATEGORIES_BY_SCOPE.income],
          payment: res.by_scope.payment?.length ? res.by_scope.payment : [...DEFAULT_CATEGORIES_BY_SCOPE.payment],
        }
      }
      hasLoaded.value = true
    } catch (err) {
      console.warn('Failed to fetch custom categories, using defaults:', err)
    } finally {
      if (seq === categoriesFetchSeq) {
        isLoadingCategories.value = false
      }
    }
  }

  const expenseCategories = computed(() => byScope.value.expense)
  const incomeCategories = computed(() => byScope.value.income)
  const paymentMethods = computed(() => byScope.value.payment)

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

  const removeCategory = async (id: number) => {
    await deleteCategoryOption(id)
    await loadCategories(true)
  }

  return {
    isLoadingCategories,
    expenseCategories,
    incomeCategories,
    paymentMethods,
    isCategoryManagerOpen,
    activeManagerScope,
    loadCategories,
    getItemsByScope,
    openCategoryManager,
    closeCategoryManager,
    addCategory,
    removeCategory,
  }
}
