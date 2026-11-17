<script setup lang="ts">
import { ref } from 'vue'
import { Loader2, Save } from 'lucide-vue-next'
import type { SiteConfig } from '../../types'
import { updateSiteConfig } from '../../utils/api'

const PUBLIC_MODULE_OPTIONS = [
  { key: 'entries', label: '时间流（散页）', desc: '公开展示未标记私密的日常、游历与手记' },
  { key: 'projects', label: '造物与项目', desc: '公开展示未标记私密的项目卡片与故事' },
  { key: 'footprints', label: '山川足迹', desc: '公开展示未标记私密的行迹与城市/省份抽屉（不含消费金额）' },
  { key: 'wishes', label: '心愿单', desc: '公开展示未标记私密的心愿状态（不含实际花费与关联账目）' },
  { key: 'profile', label: '主理人档案', desc: '公开展示主理人简介、信条与随行装备清单（不含装备价格）' },
  { key: 'almanac', label: '年度生活年鉴', desc: '公开展示年度回顾画卷（不含私密记录与财务收支）' },
]

const props = defineProps<{
  publicModules: string[]
  isLoadingVisibility: boolean
}>()

const emit = defineEmits<{
  (e: 'update:publicModules', list: string[]): void
  (e: 'configUpdated', config: SiteConfig): void
  (e: 'alert', payload: { type: 'success' | 'error'; text: string }): void
}>()

const isSavingVisibility = ref(false)

const togglePublicModule = (key: string) => {
  if (props.publicModules.includes(key)) {
    emit(
      'update:publicModules',
      props.publicModules.filter((k) => k !== key),
    )
  } else {
    emit('update:publicModules', [...props.publicModules, key])
  }
}

const handleSaveVisibility = async () => {
  if (isSavingVisibility.value || props.isLoadingVisibility) return
  isSavingVisibility.value = true
  try {
    const updated = await updateSiteConfig({ public_modules: props.publicModules })
    const nextModules = Array.isArray(updated?.public_modules) ? [...updated.public_modules] : []
    emit('update:publicModules', nextModules)
    emit('configUpdated', updated)
    emit('alert', {
      type: 'success',
      text:
        nextModules.length === 0
          ? '已保存：当前为全站私有模式'
          : `已保存：已开放 ${nextModules.length} 个展厅板块`,
    })
  } catch (err: any) {
    emit('alert', { type: 'error', text: err?.message || '保存展厅公开设置失败' })
  } finally {
    isSavingVisibility.value = false
  }
}
</script>

<template>
  <div class="space-y-4">
    <div class="p-4 border border-[var(--border-subtle)] bg-[var(--bg-subtle)]/40 rounded-xs space-y-2">
      <div class="font-serif-editorial text-sm font-medium text-[var(--ink-primary)]">
        默认全站私有 · 按模块可选开放
      </div>
      <p class="text-xs text-[var(--ink-secondary)] leading-relaxed">
        未勾选任何板块时，未配对访客无法访问任何档案内容；即便某个板块对外开放，单条标记为「仅自己可见（私密）」的记录仍对访客完全不可见。记账、资产、信贷渠道、设备管理与分类字典永远仅限主理人可见。
      </p>
    </div>

    <div
      v-if="isLoadingVisibility"
      class="py-12 text-center text-xs font-serif-editorial text-[var(--ink-muted)] border border-dashed border-[var(--border-subtle)] rounded-xs space-y-2"
    >
      <Loader2 class="w-4 h-4 mx-auto animate-spin text-[var(--ink-muted)]" />
      <p>正在读取展厅公开配置...</p>
    </div>

    <div v-else class="space-y-2">
      <label
        v-for="mod in PUBLIC_MODULE_OPTIONS"
        :key="mod.key"
        class="flex items-start gap-3 p-3 border border-[var(--border-subtle)] rounded-xs hover:border-[var(--ink-primary)]/40 cursor-pointer transition-colors"
        :class="publicModules.includes(mod.key) ? 'bg-[var(--accent-moss)]/5 border-[var(--accent-moss)]/40' : 'bg-[var(--bg-archive)]'"
      >
        <input
          type="checkbox"
          :checked="publicModules.includes(mod.key)"
          @change="togglePublicModule(mod.key)"
          class="mt-0.5 accent-[var(--accent-moss)] cursor-pointer"
        />
        <div class="flex-1 min-w-0">
          <div class="font-serif-editorial text-sm font-medium text-[var(--ink-primary)]">
            {{ mod.label }}
          </div>
          <div class="text-xs text-[var(--ink-muted)] mt-0.5">
            {{ mod.desc }}
          </div>
        </div>
      </label>
    </div>

    <div class="flex items-center justify-end gap-2 pt-2">
      <button
        type="button"
        @click="emit('update:publicModules', [])"
        :disabled="isSavingVisibility || isLoadingVisibility"
        class="px-3 py-1.5 border border-[var(--border-subtle)] hover:border-[var(--ink-primary)] text-[var(--ink-secondary)] rounded-xs text-xs font-serif-editorial cursor-pointer disabled:opacity-50"
      >
        全部设为私有
      </button>
      <button
        type="button"
        @click="handleSaveVisibility"
        :disabled="isSavingVisibility || isLoadingVisibility"
        class="px-4 py-1.5 bg-[var(--ink-primary)] text-[var(--bg-archive)] hover:opacity-90 rounded-xs text-xs font-serif-editorial font-medium transition-opacity cursor-pointer flex items-center gap-1.5 disabled:opacity-50 shadow-xs"
      >
        <Save v-if="!isSavingVisibility" class="w-3.5 h-3.5" />
        <Loader2 v-else class="w-3.5 h-3.5 animate-spin" />
        <span>保存公开设置</span>
      </button>
    </div>
  </div>
</template>
