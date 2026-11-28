<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import {
  X,
  Plus,
  Trash2,
  Check,
  Pencil,
  ArrowUp,
  ArrowDown,
  Sparkles,
  AlertTriangle,
} from 'lucide-vue-next'
import { useCategories, CATEGORY_SCOPE_META } from '../composables/useCategories'
import { useBodyScrollLock } from '../composables/useBodyScrollLock'
import { useEscapeClose } from '../composables/useEscapeClose'
import type { CategoryOption, CategoryScope } from '../types'

type ModalTab = CategoryScope | 'rules'

const {
  isCategoryManagerOpen,
  activeManagerScope,
  isLoadingCategories,
  isLoadingRules,
  categoryRules,
  expenseCategories,
  incomeCategories,
  getItemsByScope,
  loadCategoryRules,
  closeCategoryManager,
  addCategory,
  updateCategory,
  removeCategory,
  saveCategoryRule,
  removeCategoryRule,
} = useCategories()

const activeTab = ref<ModalTab>(activeManagerScope.value)

const newCategoryName = ref('')
const newKeywords = ref('')

// 行内编辑状态
const editingId = ref<number | null>(null)
const editName = ref('')
const editKeywords = ref('')

// 安全删除迁移状态（当 usage_count > 0 时）
const migratingItemId = ref<number | null>(null)
const migrateTarget = ref('')

// 自动归类规则表单
const newRuleType = ref<'expense' | 'income'>('expense')
const newRuleDisplayName = ref('')
const newRuleCategory = ref('餐饮')

const isSubmitting = ref(false)
const errorMsg = ref<string | null>(null)
const successMsg = ref<string | null>(null)

const handleClose = () => {
  if (isSubmitting.value) return
  closeCategoryManager()
}

useBodyScrollLock(() => isCategoryManagerOpen.value)
useEscapeClose(() => isCategoryManagerOpen.value, handleClose)

watch(
  () => activeManagerScope.value,
  (scope) => {
    activeTab.value = scope
  },
)

watch(
  () => isCategoryManagerOpen.value,
  (open) => {
    if (open) {
      activeTab.value = activeManagerScope.value
      errorMsg.value = null
      successMsg.value = null
      editingId.value = null
      migratingItemId.value = null
    }
  },
)

const isRulesTab = computed(() => activeTab.value === 'rules')
const currentScope = computed<CategoryScope>(() =>
  activeTab.value === 'rules' ? 'expense' : activeTab.value,
)

const currentScopeMeta = computed(() => {
  if (isRulesTab.value) {
    return {
      key: 'rules',
      label: '自动归类记忆',
      desc: '管理由修改分类自动学到或手动设置的商户/关键词规则，跨端同步生效',
    }
  }
  return (
    CATEGORY_SCOPE_META.find((m) => m.key === currentScope.value) ||
    CATEGORY_SCOPE_META[0]
  )
})

const currentScopeItems = computed<CategoryOption[]>(() => {
  return getItemsByScope(currentScope.value)
})

const ruleCategoriesForSelectedType = computed(() => {
  return newRuleType.value === 'income' ? incomeCategories.value : expenseCategories.value
})

watch(newRuleType, (nextType) => {
  const list = nextType === 'income' ? incomeCategories.value : expenseCategories.value
  if (!list.includes(newRuleCategory.value)) {
    newRuleCategory.value = list[0] || (nextType === 'income' ? '工资' : '餐饮')
  }
})

watch(activeTab, (tab) => {
  errorMsg.value = null
  successMsg.value = null
  editingId.value = null
  migratingItemId.value = null
  newCategoryName.value = ''
  newKeywords.value = ''
  if (tab === 'rules') {
    loadCategoryRules()
    if (!ruleCategoriesForSelectedType.value.includes(newRuleCategory.value)) {
      newRuleCategory.value = ruleCategoriesForSelectedType.value[0] || '餐饮'
    }
  } else {
    activeManagerScope.value = tab
  }
})

const handleSelectTab = (tab: ModalTab) => {
  activeTab.value = tab
}

const parseKeywordPills = (raw?: string): string[] => {
  if (!raw) return []
  return raw
    .split(/[,，、;\n]+/)
    .map((s) => s.trim())
    .filter(Boolean)
}

const handleAdd = async () => {
  const name = newCategoryName.value.trim()
  if (!name) {
    errorMsg.value = '请输入要新增的分类名称'
    return
  }
  try {
    isSubmitting.value = true
    errorMsg.value = null
    successMsg.value = null
    await addCategory(currentScope.value, name, {
      keywords: currentScope.value === 'payment' ? undefined : newKeywords.value.trim() || undefined,
    })
    newCategoryName.value = ''
    newKeywords.value = ''
    successMsg.value = `已添加「${name}」`
  } catch (err: any) {
    errorMsg.value = err?.message || '添加分类失败'
  } finally {
    isSubmitting.value = false
  }
}

const startEdit = (item: CategoryOption) => {
  migratingItemId.value = null
  editingId.value = item.id
  editName.value = item.name
  editKeywords.value = item.keywords || ''
}

const cancelEdit = () => {
  editingId.value = null
}

const handleSaveEdit = async (item: CategoryOption) => {
  const trimmedName = editName.value.trim()
  if (!trimmedName) {
    errorMsg.value = '分类名称不能为空'
    return
  }
  try {
    isSubmitting.value = true
    errorMsg.value = null
    successMsg.value = null
    await updateCategory(item.id, {
      name: trimmedName,
      keywords: currentScope.value === 'payment' ? '' : editKeywords.value.trim(),
      rename_records: trimmedName !== item.name,
    })
    editingId.value = null
    successMsg.value = `已更新「${trimmedName}」`
  } catch (err: any) {
    errorMsg.value = err?.message || '更新分类失败'
  } finally {
    isSubmitting.value = false
  }
}

const handleMoveOrder = async (item: CategoryOption, direction: -1 | 1) => {
  const list = currentScopeItems.value
  const index = list.findIndex((x) => x.id === item.id)
  const targetIndex = index + direction
  if (index < 0 || targetIndex < 0 || targetIndex >= list.length) return
  const sibling = list[targetIndex]
  const currentSort = item.sort_order ?? (index + 1) * 10
  const siblingSort = sibling.sort_order ?? (targetIndex + 1) * 10
  const nextItemSort = siblingSort === currentSort ? currentSort + direction : siblingSort
  const nextSiblingSort = currentSort

  try {
    isSubmitting.value = true
    errorMsg.value = null
    await updateCategory(item.id, { sort_order: nextItemSort })
    await updateCategory(sibling.id, { sort_order: nextSiblingSort })
  } catch (err: any) {
    errorMsg.value = err?.message || '调整排序失败'
  } finally {
    isSubmitting.value = false
  }
}

const getMigrationCandidates = (item: CategoryOption) => {
  return currentScopeItems.value.filter((other) => other.id !== item.id && other.name !== item.name)
}

const requestDelete = (item: CategoryOption) => {
  if (currentScopeItems.value.length <= 1) {
    errorMsg.value = '当前分类模块至少需要保留 1 个选项'
    return
  }
  editingId.value = null
  const usage = item.usage_count ?? 0
  if (usage > 0) {
    const candidates = getMigrationCandidates(item)
    const fallback =
      candidates.find((c) => c.name === '其他')?.name ||
      candidates[0]?.name ||
      ''
    migrateTarget.value = fallback
    migratingItemId.value = item.id
    return
  }
  void executeDelete(item)
}

const executeDelete = async (item: CategoryOption, target?: string) => {
  try {
    isSubmitting.value = true
    errorMsg.value = null
    successMsg.value = null
    await removeCategory(item.id, target)
    migratingItemId.value = null
    successMsg.value = target
      ? `已将账目迁移至「${target}」并移除「${item.name}」`
      : `已移除「${item.name}」`
  } catch (err: any) {
    errorMsg.value = err?.message || '删除分类失败'
  } finally {
    isSubmitting.value = false
  }
}

const handleAddRule = async () => {
  const merchant = newRuleDisplayName.value.trim()
  if (!merchant) {
    errorMsg.value = '请输入商户名或关键词'
    return
  }
  if (!newRuleCategory.value) {
    errorMsg.value = '请选择目标分类'
    return
  }
  try {
    isSubmitting.value = true
    errorMsg.value = null
    successMsg.value = null
    await saveCategoryRule({
      tx_type: newRuleType.value,
      display_name: merchant,
      category: newRuleCategory.value,
      source: 'manual',
    })
    newRuleDisplayName.value = ''
    successMsg.value = `已记住「${merchant}」→「${newRuleCategory.value}」`
  } catch (err: any) {
    errorMsg.value = err?.message || '保存归类规则失败'
  } finally {
    isSubmitting.value = false
  }
}

const handleDeleteRule = async (ruleId: number, displayName: string) => {
  try {
    isSubmitting.value = true
    errorMsg.value = null
    successMsg.value = null
    await removeCategoryRule(ruleId)
    successMsg.value = `已删除记忆规则「${displayName}」`
  } catch (err: any) {
    errorMsg.value = err?.message || '删除归类规则失败'
  } finally {
    isSubmitting.value = false
  }
}
</script>

<template>
  <div
    v-if="isCategoryManagerOpen"
    role="dialog"
    aria-modal="true"
    aria-label="管理分类"
    class="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-in fade-in duration-200"
    @click.self="handleClose"
  >
    <div
      class="bg-[var(--bg-archive)] border border-[var(--border-subtle)] shadow-2xl w-full max-w-2xl rounded-xs p-5 sm:p-7 text-left space-y-5 max-h-[88dvh] flex flex-col pb-[max(1.25rem,env(safe-area-inset-bottom,1.25rem))]"
    >
      <!-- 弹窗标头 -->
      <div class="flex items-start justify-between pb-3.5 border-b border-[var(--border-subtle)] shrink-0">
        <div>
          <span class="font-mono-archive text-[11px] tracking-[0.2em] uppercase text-[var(--ink-muted)] block mb-1">
            TAXONOMY &amp; AUTO-CATEGORIZATION
          </span>
          <h3 class="font-serif-editorial text-2xl font-normal text-[var(--ink-primary)]">
            分类字典与自动归类管理
          </h3>
          <p class="font-serif-editorial text-xs text-[var(--ink-muted)] mt-1">
            管理分类、自动匹配关键词与跨端商户记忆，修改后实时生效。
          </p>
        </div>
        <button
          @click="handleClose"
          class="text-[var(--ink-muted)] hover:text-[var(--ink-primary)] p-1 cursor-pointer transition-colors"
        >
          <X class="w-4 h-4" />
        </button>
      </div>

      <!-- 模块切换栏 -->
      <div class="flex flex-wrap items-center gap-1.5 pb-2 border-b border-[var(--border-subtle)]/60 shrink-0">
        <button
          v-for="meta in CATEGORY_SCOPE_META"
          :key="meta.key"
          type="button"
          @click="handleSelectTab(meta.key)"
          class="px-3 py-1.5 text-xs font-mono-archive rounded-xs border transition-colors cursor-pointer"
          :class="
            activeTab === meta.key
              ? 'bg-[var(--ink-primary)] text-[var(--bg-archive)] border-[var(--ink-primary)] font-medium'
              : 'bg-[var(--bg-subtle)]/40 text-[var(--ink-secondary)] border-[var(--border-subtle)] hover:border-[var(--ink-primary)] hover:text-[var(--ink-primary)]'
          "
        >
          {{ meta.label }}
        </button>

        <button
          type="button"
          @click="handleSelectTab('rules')"
          class="px-3 py-1.5 text-xs font-mono-archive rounded-xs border transition-colors cursor-pointer inline-flex items-center gap-1.5"
          :class="
            isRulesTab
              ? 'bg-[var(--ink-primary)] text-[var(--bg-archive)] border-[var(--ink-primary)] font-medium'
              : 'bg-[var(--bg-subtle)]/40 text-[var(--ink-secondary)] border-[var(--border-subtle)] hover:border-[var(--ink-primary)] hover:text-[var(--ink-primary)]'
          "
        >
          <Sparkles class="w-3 h-3" />
          <span>自动归类记忆</span>
        </button>
      </div>

      <!-- 当前模块说明与新增表单 -->
      <div class="space-y-2.5 shrink-0">
        <div class="flex items-center justify-between text-xs font-mono-archive gap-2">
          <span class="text-[var(--ink-secondary)]">{{ currentScopeMeta.desc }}</span>
          <span class="text-[11px] text-[var(--ink-muted)] shrink-0">
            {{ isRulesTab ? `共 ${categoryRules.length} 条记忆` : `共 ${currentScopeItems.length} 项` }}
          </span>
        </div>

        <!-- 分类新增表单 -->
        <form v-if="!isRulesTab" @submit.prevent="handleAdd" class="grid grid-cols-1 sm:grid-cols-12 gap-2">
          <input
            v-model="newCategoryName"
            type="text"
            :placeholder="`新增${currentScopeMeta.label}名称...`"
            :class="currentScope === 'payment' ? 'sm:col-span-9' : 'sm:col-span-4'"
            class="px-3 py-2 bg-[var(--bg-subtle)]/50 border border-[var(--border-subtle)] focus:border-[var(--ink-primary)] rounded-xs text-xs font-serif-editorial text-[var(--ink-primary)] outline-none"
          />
          <input
            v-if="currentScope !== 'payment'"
            v-model="newKeywords"
            type="text"
            placeholder="自动匹配关键词（逗号分隔，可选）"
            class="sm:col-span-5 px-3 py-2 bg-[var(--bg-subtle)]/50 border border-[var(--border-subtle)] focus:border-[var(--ink-primary)] rounded-xs text-xs font-serif-editorial text-[var(--ink-primary)] outline-none"
          />
          <button
            type="submit"
            :disabled="isSubmitting"
            class="sm:col-span-3 px-3.5 py-2 bg-[var(--ink-primary)] text-[var(--bg-archive)] rounded-xs text-xs font-mono-archive inline-flex items-center justify-center gap-1.5 hover:opacity-90 disabled:opacity-50 cursor-pointer shrink-0 transition-opacity"
          >
            <Plus class="w-3.5 h-3.5" />
            <span>新增</span>
          </button>
        </form>

        <!-- 自动归类规则新增表单 -->
        <form v-else @submit.prevent="handleAddRule" class="grid grid-cols-1 sm:grid-cols-12 gap-2">
          <select
            v-model="newRuleType"
            class="sm:col-span-2 px-2.5 py-2 bg-[var(--bg-subtle)]/50 border border-[var(--border-subtle)] focus:border-[var(--ink-primary)] rounded-xs text-xs font-mono-archive text-[var(--ink-primary)] outline-none"
          >
            <option value="expense">支出</option>
            <option value="income">收入</option>
          </select>
          <input
            v-model="newRuleDisplayName"
            type="text"
            placeholder="商户名或关键词（如：楼下张记）"
            class="sm:col-span-5 px-3 py-2 bg-[var(--bg-subtle)]/50 border border-[var(--border-subtle)] focus:border-[var(--ink-primary)] rounded-xs text-xs font-serif-editorial text-[var(--ink-primary)] outline-none"
          />
          <select
            v-model="newRuleCategory"
            class="sm:col-span-3 px-2.5 py-2 bg-[var(--bg-subtle)]/50 border border-[var(--border-subtle)] focus:border-[var(--ink-primary)] rounded-xs text-xs font-serif-editorial text-[var(--ink-primary)] outline-none"
          >
            <option v-for="cat in ruleCategoriesForSelectedType" :key="cat" :value="cat">
              {{ cat }}
            </option>
          </select>
          <button
            type="submit"
            :disabled="isSubmitting"
            class="sm:col-span-2 px-3.5 py-2 bg-[var(--ink-primary)] text-[var(--bg-archive)] rounded-xs text-xs font-mono-archive inline-flex items-center justify-center gap-1.5 hover:opacity-90 disabled:opacity-50 cursor-pointer transition-opacity"
          >
            <Plus class="w-3.5 h-3.5" />
            <span>记住</span>
          </button>
        </form>

        <!-- 状态提示槽 -->
        <div class="min-h-[38px] flex items-center" role="alert" aria-live="polite">
          <div
            class="w-full px-3 py-2 text-xs font-mono-archive rounded-xs border transition-opacity truncate"
            :class="
              errorMsg
                ? 'bg-red-500/10 border-red-500/20 text-red-600 opacity-100'
                : successMsg
                  ? 'bg-[var(--accent-moss)]/10 border-[var(--accent-moss)]/30 text-[var(--accent-moss)] opacity-100'
                  : 'border-transparent opacity-0'
            "
          >
            {{ errorMsg || successMsg }}
          </div>
        </div>
      </div>

      <!-- 主列表区 -->
      <div class="flex-1 overflow-y-auto pr-1 min-h-[180px] space-y-2">
        <!-- Tab 4: 自动归类记忆列表 -->
        <template v-if="isRulesTab">
          <div
            v-if="isLoadingRules && categoryRules.length === 0"
            class="py-12 text-center text-xs font-mono-archive text-[var(--ink-muted)]"
          >
            正在同步自动归类记忆...
          </div>
          <div
            v-else-if="categoryRules.length === 0"
            class="py-12 text-center text-xs font-serif-editorial text-[var(--ink-muted)]"
          >
            还没有学习到商户记忆。在编辑流水修改分类时，系统会自动记住对应商户的偏好。
          </div>
          <div v-else class="space-y-2">
            <div
              v-for="rule in categoryRules"
              :key="rule.id"
              class="px-3.5 py-2.5 bg-[var(--bg-subtle)]/35 border border-[var(--border-subtle)] rounded-xs flex items-center justify-between gap-3"
            >
              <div class="flex flex-wrap items-center gap-2 min-w-0">
                <span
                  class="px-1.5 py-0.5 text-[10px] font-mono-archive rounded-xs border"
                  :class="
                    rule.tx_type === 'income'
                      ? 'border-[var(--accent-moss)]/40 text-[var(--accent-moss)]'
                      : 'border-[var(--border-divider)] text-[var(--ink-muted)]'
                  "
                >
                  {{ rule.tx_type === 'income' ? '收入' : '支出' }}
                </span>
                <span class="font-serif-editorial text-sm text-[var(--ink-primary)] truncate">
                  {{ rule.display_name }}
                </span>
                <span class="text-xs font-mono-archive text-[var(--ink-muted)]">→</span>
                <span class="px-2 py-0.5 text-xs font-serif-editorial bg-[var(--bg-archive)] border border-[var(--border-subtle)] text-[var(--ink-primary)] rounded-xs">
                  {{ rule.category }}
                </span>
                <span class="text-[11px] font-mono-archive text-[var(--ink-muted)]">
                  {{ rule.source === 'manual' ? '手动' : '学习' }} · 命中 {{ rule.hit_count }} 次
                </span>
              </div>

              <button
                type="button"
                @click="handleDeleteRule(rule.id, rule.display_name)"
                class="p-1.5 text-[var(--ink-muted)] hover:text-[var(--accent-vermilion)] transition-colors cursor-pointer shrink-0"
                title="移除此规则"
              >
                <Trash2 class="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </template>

        <!-- Tab 1~3: 扁平分类列表 -->
        <template v-else>
          <div
            v-if="isLoadingCategories && currentScopeItems.length === 0"
            class="py-12 text-center text-xs font-mono-archive text-[var(--ink-muted)]"
          >
            正在读取分类字典...
          </div>

          <div v-else class="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <div
              v-for="(item, idx) in currentScopeItems"
              :key="item.id"
              class="px-3.5 py-2.5 bg-[var(--bg-subtle)]/35 border border-[var(--border-subtle)] hover:border-[var(--ink-primary)]/40 rounded-xs space-y-2 transition-colors"
            >
              <!-- 正常展示态 -->
              <template v-if="editingId !== item.id">
                <div class="flex items-start justify-between gap-2">
                  <div class="min-w-0 space-y-1">
                    <div class="flex flex-wrap items-center gap-1.5">
                      <span class="font-mono-archive text-[11px] text-[var(--ink-muted)] shrink-0">
                        {{ String(idx + 1).padStart(2, '0') }}
                      </span>
                      <span class="font-serif-editorial text-sm text-[var(--ink-primary)] truncate">
                        {{ item.name }}
                      </span>
                      <span
                        v-if="!item.is_builtin"
                        class="px-1.5 py-0.5 text-[10px] font-mono-archive border border-[var(--accent-warm)]/40 text-[var(--accent-warm)] rounded-xs"
                      >
                        自定义
                      </span>
                      <span
                        v-if="(item.usage_count ?? 0) > 0"
                        class="px-1.5 py-0.5 text-[10px] font-mono-archive bg-[var(--bg-archive)] border border-[var(--border-subtle)] text-[var(--ink-muted)] rounded-xs"
                      >
                        {{ item.usage_count }} 笔
                      </span>
                    </div>

                    <div
                      v-if="parseKeywordPills(item.keywords).length > 0"
                      class="flex flex-wrap gap-1"
                    >
                      <span
                        v-for="kw in parseKeywordPills(item.keywords)"
                        :key="kw"
                        class="px-1.5 py-0.5 text-[10px] font-mono-archive bg-[var(--bg-archive)]/80 text-[var(--ink-secondary)] border border-[var(--border-subtle)]/80 rounded-xs"
                      >
                        #{{ kw }}
                      </span>
                    </div>
                  </div>

                  <div class="flex items-center gap-0.5 shrink-0">
                    <button
                      type="button"
                      @click="handleMoveOrder(item, -1)"
                      :disabled="isSubmitting || idx === 0"
                      class="p-1 text-[var(--ink-muted)] hover:text-[var(--ink-primary)] disabled:opacity-25 cursor-pointer"
                      title="上移排序"
                    >
                      <ArrowUp class="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      @click="handleMoveOrder(item, 1)"
                      :disabled="isSubmitting || idx === currentScopeItems.length - 1"
                      class="p-1 text-[var(--ink-muted)] hover:text-[var(--ink-primary)] disabled:opacity-25 cursor-pointer"
                      title="下移排序"
                    >
                      <ArrowDown class="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      @click="startEdit(item)"
                      :disabled="isSubmitting"
                      class="p-1 text-[var(--ink-muted)] hover:text-[var(--ink-primary)] cursor-pointer"
                      title="编辑名称与关键词"
                    >
                      <Pencil class="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      @click="requestDelete(item)"
                      :disabled="isSubmitting || currentScopeItems.length <= 1"
                      class="p-1 text-[var(--ink-muted)] hover:text-[var(--accent-vermilion)] disabled:opacity-25 transition-colors cursor-pointer"
                      title="删除该分类"
                    >
                      <Trash2 class="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                <!-- 删除迁移确认条 -->
                <div
                  v-if="migratingItemId === item.id"
                  class="p-2.5 bg-[var(--bg-archive)] border border-[var(--accent-warm)]/40 rounded-xs space-y-2 text-xs"
                >
                  <div class="flex items-center gap-1.5 text-[var(--accent-warm)] font-mono-archive">
                    <AlertTriangle class="w-3.5 h-3.5 shrink-0" />
                    <span>已有 {{ item.usage_count }} 条账目使用该分类，请选择迁移目标：</span>
                  </div>
                  <div class="flex flex-wrap items-center gap-2">
                    <select
                      v-model="migrateTarget"
                      class="flex-1 min-w-[120px] px-2 py-1 bg-[var(--bg-subtle)] border border-[var(--border-subtle)] rounded-xs text-xs text-[var(--ink-primary)]"
                    >
                      <option
                        v-for="cand in getMigrationCandidates(item)"
                        :key="cand.id"
                        :value="cand.name"
                      >
                        {{ cand.name }}
                      </option>
                    </select>
                    <button
                      type="button"
                      @click="executeDelete(item, migrateTarget)"
                      :disabled="!migrateTarget || isSubmitting"
                      class="px-2.5 py-1 bg-[var(--accent-vermilion)] text-white rounded-xs font-mono-archive cursor-pointer disabled:opacity-50"
                    >
                      迁移并删除
                    </button>
                    <button
                      type="button"
                      @click="migratingItemId = null"
                      class="px-2 py-1 border border-[var(--border-subtle)] text-[var(--ink-secondary)] rounded-xs font-mono-archive cursor-pointer"
                    >
                      取消
                    </button>
                  </div>
                </div>
              </template>

              <!-- 行内编辑态 -->
              <template v-else>
                <div class="space-y-2">
                  <input
                    v-model="editName"
                    type="text"
                    placeholder="分类名称"
                    class="w-full px-2.5 py-1.5 bg-[var(--bg-archive)] border border-[var(--border-subtle)] rounded-xs text-xs text-[var(--ink-primary)] outline-none"
                  />
                  <input
                    v-if="currentScope !== 'payment'"
                    v-model="editKeywords"
                    type="text"
                    placeholder="自动归类关键词（逗号分隔，例如：瑞幸,星巴克,拿铁）"
                    class="w-full px-2.5 py-1.5 bg-[var(--bg-archive)] border border-[var(--border-subtle)] rounded-xs text-xs text-[var(--ink-primary)] outline-none"
                  />
                  <div class="flex items-center justify-end gap-1.5 text-xs font-mono-archive">
                    <button
                      type="button"
                      @click="cancelEdit"
                      class="px-2.5 py-1 border border-[var(--border-subtle)] text-[var(--ink-secondary)] rounded-xs cursor-pointer"
                    >
                      取消
                    </button>
                    <button
                      type="button"
                      @click="handleSaveEdit(item)"
                      :disabled="isSubmitting"
                      class="px-3 py-1 bg-[var(--ink-primary)] text-[var(--bg-archive)] rounded-xs cursor-pointer disabled:opacity-50"
                    >
                      保存
                    </button>
                  </div>
                </div>
              </template>
            </div>
          </div>
        </template>
      </div>

      <!-- 底部操作栏 -->
      <div class="flex items-center justify-end pt-3.5 border-t border-[var(--border-subtle)] shrink-0 font-mono-archive text-xs">
        <button
          type="button"
          @click="handleClose"
          class="px-5 py-1.5 bg-[var(--ink-primary)] text-[var(--bg-archive)] rounded-xs hover:opacity-90 transition-opacity cursor-pointer inline-flex items-center gap-1.5"
        >
          <Check class="w-3.5 h-3.5" />
          <span>完成</span>
        </button>
      </div>
    </div>
  </div>
</template>
