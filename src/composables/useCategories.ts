import { ref, computed } from 'vue'
import {
  fetchCategories,
  createCategoryOption,
  updateCategoryOption,
  deleteCategoryOption,
  fetchCategoryRules,
  upsertCategoryRule,
  deleteCategoryRule,
} from '../utils/api'
import type { CategoryOption, CategoryRule, CategoryScope } from '../types'

const HIDDEN_EXPENSE_CATEGORIES = new Set(['好物购置', '利息手续费'])

export const DEFAULT_CATEGORIES_BY_SCOPE: Record<CategoryScope, string[]> = {
  expense: ['餐饮', '交通', '购物', '居家', '订阅', '娱乐', '医疗', '学习', '其他'],
  income: ['工资', '副业', '理财', '退款', '其他'],
  payment: ['微信支付', '支付宝', '银行卡', '信用卡', '现金', '其他'],
}

export const CATEGORY_SCOPE_META: {
  key: CategoryScope
  label: string
  desc: string
}[] = [
  { key: 'expense', label: '支出分类', desc: '简洁 2 字大类，可配置自动匹配关键词，也可按需增删改排序' },
  { key: 'income', label: '收入分类', desc: '用于薪资、副业、理财与退款等进账分类管理' },
  { key: 'payment', label: '支付方式', desc: '用于记账时的支付渠道与账户选择' },
]

const categoryItems = ref<CategoryOption[]>([])
const byScope = ref<Record<CategoryScope, string[]>>({
  expense: [...DEFAULT_CATEGORIES_BY_SCOPE.expense],
  income: [...DEFAULT_CATEGORIES_BY_SCOPE.income],
  payment: [...DEFAULT_CATEGORIES_BY_SCOPE.payment],
})
const hasLoaded = ref(false)
const isLoadingCategories = ref(false)
let categoriesFetchSeq = 0

// 自动归类记忆规则状态
const categoryRules = ref<CategoryRule[]>([])
const isLoadingRules = ref(false)

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
        categoryItems.value = res.items.filter(
          (it) => !(it.scope === 'expense' && HIDDEN_EXPENSE_CATEGORIES.has(it.name)),
        )
      }
      if (res && res.by_scope) {
        const filteredExpense = (res.by_scope.expense || []).filter(
          (name) => !HIDDEN_EXPENSE_CATEGORIES.has(name),
        )
        byScope.value = {
          expense: filteredExpense.length ? filteredExpense : [...DEFAULT_CATEGORIES_BY_SCOPE.expense],
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

  const loadCategoryRules = async () => {
    try {
      isLoadingRules.value = true
      const list = await fetchCategoryRules()
      categoryRules.value = Array.isArray(list) ? list : []
    } catch (err) {
      console.warn('Failed to fetch category rules:', err)
    } finally {
      isLoadingRules.value = false
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

  const addCategory = async (
    scope: CategoryScope,
    name: string,
    options?: { keywords?: string },
  ) => {
    const trimmed = name.trim()
    if (!trimmed) return null
    const created = await createCategoryOption({
      scope,
      name: trimmed,
      keywords: options?.keywords?.trim() || undefined,
    })
    await loadCategories(true)
    return created
  }

  const updateCategory = async (
    id: number,
    payload: {
      name?: string
      keywords?: string
      sort_order?: number
      rename_records?: boolean
    },
  ) => {
    const updated = await updateCategoryOption(id, payload)
    await loadCategories(true)
    return updated
  }

  const removeCategory = async (id: number, migrateTo?: string) => {
    await deleteCategoryOption(id, migrateTo)
    await loadCategories(true)
  }

  const saveCategoryRule = async (payload: {
    tx_type: 'expense' | 'income'
    display_name: string
    category: string
    match_key?: string
    source?: 'learned' | 'manual'
  }) => {
    const saved = await upsertCategoryRule(payload)
    await loadCategoryRules()
    return saved
  }

  const removeCategoryRule = async (id: number) => {
    await deleteCategoryRule(id)
    categoryRules.value = categoryRules.value.filter((r) => r.id !== id)
  }

  return {
    isLoadingCategories,
    isLoadingRules,
    categoryItems,
    categoryRules,
    expenseCategories,
    incomeCategories,
    paymentMethods,
    isCategoryManagerOpen,
    activeManagerScope,
    loadCategories,
    loadCategoryRules,
    getItemsByScope,
    openCategoryManager,
    closeCategoryManager,
    addCategory,
    updateCategory,
    removeCategory,
    saveCategoryRule,
    removeCategoryRule,
  }
}
