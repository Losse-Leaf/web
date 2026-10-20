<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { X, Plus, Trash2, Check } from 'lucide-vue-next'
import { useCategories, CATEGORY_SCOPE_META } from '../composables/useCategories'
import type { CategoryOption, CategoryScope } from '../types'

const {
  isCategoryManagerOpen,
  activeManagerScope,
  isLoadingCategories,
  getItemsByScope,
  closeCategoryManager,
  addCategory,
  removeCategory,
} = useCategories()

const newCategoryName = ref('')
const isSubmitting = ref(false)
const errorMsg = ref<string | null>(null)
const successMsg = ref<string | null>(null)

const currentScopeMeta = computed(() => {
  return (
    CATEGORY_SCOPE_META.find((m) => m.key === activeManagerScope.value) ||
    CATEGORY_SCOPE_META[0]
  )
})

const currentScopeItems = computed<CategoryOption[]>(() => {
  return getItemsByScope(activeManagerScope.value)
})

watch(activeManagerScope, () => {
  errorMsg.value = null
  successMsg.value = null
  newCategoryName.value = ''
})

const handleSelectScope = (scope: CategoryScope) => {
  activeManagerScope.value = scope
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
    await addCategory(activeManagerScope.value, name)
    newCategoryName.value = ''
    successMsg.value = `已添加「${name}」`
  } catch (err: any) {
    errorMsg.value = err?.message || '添加分类失败'
  } finally {
    isSubmitting.value = false
  }
}

const handleDelete = async (item: CategoryOption) => {
  if (currentScopeItems.value.length <= 1) {
    errorMsg.value = '当前分类模块至少需要保留 1 个选项'
    return
  }
  try {
    isSubmitting.value = true
    errorMsg.value = null
    successMsg.value = null
    await removeCategory(item.id)
    successMsg.value = `已移除「${item.name}」`
  } catch (err: any) {
    errorMsg.value = err?.message || '删除分类失败'
  } finally {
    isSubmitting.value = false
  }
}
</script>

<template>
  <div
    v-if="isCategoryManagerOpen"
    class="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-in fade-in duration-200"
    @click.self="closeCategoryManager"
  >
    <div
      class="bg-[var(--bg-archive)] border border-[var(--border-subtle)] shadow-2xl w-full max-w-2xl rounded-xs p-6 sm:p-8 text-left space-y-6 max-h-[88dvh] flex flex-col pb-[max(1.5rem,env(safe-area-inset-bottom,1.5rem))]"
    >
      <!-- 弹窗标头 -->
      <div class="flex items-start justify-between pb-4 border-b border-[var(--border-subtle)] shrink-0">
        <div>
          <span class="font-mono-archive text-[11px] tracking-[0.2em] uppercase text-[var(--ink-muted)] block mb-1">
            TAXONOMY &amp; CUSTOM CATEGORIES
          </span>
          <h3 class="font-serif-editorial text-2xl font-normal text-[var(--ink-primary)]">
            自定义类型与分类管理
          </h3>
          <p class="font-serif-editorial text-xs text-[var(--ink-muted)] mt-1">
            统一管理收支分类、固定资产器物类型、支付方式与造物项目分类。
          </p>
        </div>
        <button
          @click="closeCategoryManager"
          class="text-[var(--ink-muted)] hover:text-[var(--ink-primary)] p-1 cursor-pointer transition-colors"
        >
          <X class="w-4 h-4" />
        </button>
      </div>

      <!-- 五大模块切换栏 -->
      <div class="flex flex-wrap items-center gap-1.5 pb-2 border-b border-[var(--border-subtle)]/60 shrink-0">
        <button
          v-for="meta in CATEGORY_SCOPE_META"
          :key="meta.key"
          type="button"
          @click="handleSelectScope(meta.key)"
          class="px-3 py-1.5 text-xs font-mono-archive rounded-xs border transition-colors cursor-pointer"
          :class="
            activeManagerScope === meta.key
              ? 'bg-[var(--ink-primary)] text-[var(--bg-archive)] border-[var(--ink-primary)] font-medium'
              : 'bg-[var(--bg-subtle)]/40 text-[var(--ink-secondary)] border-[var(--border-subtle)] hover:border-[var(--ink-primary)] hover:text-[var(--ink-primary)]'
          "
        >
          {{ meta.label }}
        </button>
      </div>

      <!-- 当前模块说明与新增输入框 -->
      <div class="space-y-3 shrink-0">
        <div class="flex items-center justify-between text-xs font-mono-archive">
          <span class="text-[var(--ink-secondary)]">{{ currentScopeMeta.desc }}</span>
          <span class="text-[11px] text-[var(--ink-muted)] shrink-0">
            共 {{ currentScopeItems.length }} 项
          </span>
        </div>

        <form @submit.prevent="handleAdd" class="flex items-center gap-2">
          <input
            v-model="newCategoryName"
            type="text"
            :placeholder="`输入新的${currentScopeMeta.label}名称...`"
            class="flex-1 px-3 py-2 bg-[var(--bg-subtle)]/50 border border-[var(--border-subtle)] focus:border-[var(--ink-primary)] rounded-xs text-xs font-serif-editorial text-[var(--ink-primary)] outline-none"
          />
          <button
            type="submit"
            :disabled="isSubmitting"
            class="px-4 py-2 bg-[var(--ink-primary)] text-[var(--bg-archive)] rounded-xs text-xs font-mono-archive inline-flex items-center gap-1.5 hover:opacity-90 disabled:opacity-50 cursor-pointer shrink-0 transition-opacity"
          >
            <Plus class="w-3.5 h-3.5" />
            <span>新增分类</span>
          </button>
        </form>

        <!-- 状态提示 -->
        <div
          v-if="errorMsg"
          class="p-2.5 bg-red-500/10 border border-red-500/20 text-red-600 text-xs font-mono-archive rounded-xs"
        >
          {{ errorMsg }}
        </div>
        <div
          v-else-if="successMsg"
          class="p-2.5 bg-[var(--accent-moss)]/10 border border-[var(--accent-moss)]/30 text-[var(--accent-moss)] text-xs font-mono-archive rounded-xs"
        >
          {{ successMsg }}
        </div>
      </div>

      <!-- 分类项列表 -->
      <div class="flex-1 overflow-y-auto pr-1 space-y-2 min-h-[180px]">
        <div
          v-if="isLoadingCategories && currentScopeItems.length === 0"
          class="py-12 text-center text-xs font-mono-archive text-[var(--ink-muted)]"
        >
          正在读取分类字典...
        </div>

        <div
          v-else
          class="grid grid-cols-1 sm:grid-cols-2 gap-2.5"
        >
          <div
            v-for="(item, idx) in currentScopeItems"
            :key="item.id"
            class="px-3.5 py-2.5 bg-[var(--bg-subtle)]/35 border border-[var(--border-subtle)] hover:border-[var(--ink-primary)]/50 rounded-xs flex items-center justify-between gap-2 transition-colors"
          >
            <div class="flex items-center gap-2.5 min-w-0">
              <span class="font-mono-archive text-[11px] text-[var(--ink-muted)] shrink-0">
                {{ String(idx + 1).padStart(2, '0') }}
              </span>
              <span class="font-serif-editorial text-sm text-[var(--ink-primary)] truncate">
                {{ item.name }}
              </span>
              <span
                v-if="!item.is_builtin"
                class="px-1.5 py-0.5 text-[11px] font-mono-archive border border-[var(--accent-warm)]/40 text-[var(--accent-warm)] rounded-xs shrink-0"
              >
                自定义
              </span>
            </div>

            <div class="flex items-center gap-1 shrink-0">
              <button
                type="button"
                @click="handleDelete(item)"
                :disabled="currentScopeItems.length <= 1"
                class="p-1 text-[var(--ink-muted)] hover:text-[var(--accent-vermilion)] disabled:opacity-30 transition-colors cursor-pointer"
                title="删除该分类"
              >
                <Trash2 class="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- 底部操作栏 -->
      <div class="flex items-center justify-end pt-4 border-t border-[var(--border-subtle)] shrink-0 font-mono-archive text-xs">
        <button
          type="button"
          @click="closeCategoryManager"
          class="px-5 py-1.5 bg-[var(--ink-primary)] text-[var(--bg-archive)] rounded-xs hover:opacity-90 transition-opacity cursor-pointer inline-flex items-center gap-1.5"
        >
          <Check class="w-3.5 h-3.5" />
          <span>完成</span>
        </button>
      </div>
    </div>
  </div>
</template>
