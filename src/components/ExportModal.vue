<script setup lang="ts">
import { ref } from 'vue'
import { X, Download, FileJson, FileText, FileSpreadsheet, ShieldCheck, Check } from 'lucide-vue-next'
import type { LifeEntry, Transaction, Project } from '../types'
import { useExport } from '../composables/useExport'
import { audio } from '../utils/audio'

const props = defineProps<{
  isOpen: boolean
  entries: LifeEntry[]
  transactions: Transaction[]
  projects: Project[]
}>()

const emit = defineEmits<{
  (e: 'close'): void
}>()

const { exportJSON, exportMarkdown, exportTransactionsCSV } = useExport()

const downloadedType = ref<string | null>(null)

const handleExportJSON = () => {
  audio.playPaperFlip()
  exportJSON({
    entries: props.entries,
    transactions: props.transactions,
    projects: props.projects,
  })
  flashSuccess('json')
}

const handleExportMarkdown = () => {
  audio.playPaperFlip()
  exportMarkdown(props.entries)
  flashSuccess('markdown')
}

const handleExportCSV = () => {
  audio.playPaperFlip()
  exportTransactionsCSV(props.transactions)
  flashSuccess('csv')
}

const flashSuccess = (type: string) => {
  downloadedType.value = type
  setTimeout(() => {
    downloadedType.value = null
  }, 3000)
}
</script>

<template>
  <div
    v-if="isOpen"
    class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/45 backdrop-blur-xs transition-opacity duration-200"
    @click.self="emit('close')"
  >
    <div
      class="w-full max-w-lg bg-[var(--bg-archive)] border border-[var(--border-subtle)] rounded-xs shadow-2xl p-4 sm:p-8 text-left space-y-6 max-h-[90dvh] overflow-y-auto animate-in fade-in zoom-in-95 duration-200"
    >
      <!-- 弹窗标题 -->
      <div class="flex items-center justify-between pb-4 border-b border-[var(--border-subtle)]">
        <div class="space-y-1">
          <div class="flex items-center gap-2">
            <h2 class="font-serif-editorial text-2xl text-[var(--ink-primary)] font-medium">
              数据主权与备份
            </h2>
            <ShieldCheck class="w-4 h-4 text-[var(--accent-moss)]" />
          </div>
          <p class="font-mono-archive text-xs text-[var(--ink-muted)]">
            本地优先与全量归档
          </p>
        </div>
        <button
          @click="emit('close')"
          class="p-1 text-[var(--ink-muted)] hover:text-[var(--ink-primary)] cursor-pointer"
        >
          <X class="w-5 h-5" />
        </button>
      </div>

      <!-- 档案馆现状概览 -->
      <div class="p-3.5 bg-[var(--bg-subtle)]/70 rounded-xs border border-[var(--border-subtle)] text-xs font-mono-archive space-y-1 text-[var(--ink-secondary)]">
        <div class="text-[var(--ink-primary)] font-medium">当前生活档案指标</div>
        <div class="grid grid-cols-3 gap-2 pt-1 text-center">
          <div class="p-2 border border-[var(--border-subtle)] rounded-xs bg-[var(--bg-archive)]">
            <div class="text-base text-[var(--accent-warm)] font-medium font-serif-editorial">{{ entries.length }}</div>
            <div class="text-[10px] text-[var(--ink-muted)]">生活印记</div>
          </div>
          <div class="p-2 border border-[var(--border-subtle)] rounded-xs bg-[var(--bg-archive)]">
            <div class="text-base text-[var(--ink-primary)] font-medium font-serif-editorial">{{ transactions.length }}</div>
            <div class="text-[10px] text-[var(--ink-muted)]">日常账目</div>
          </div>
          <div class="p-2 border border-[var(--border-subtle)] rounded-xs bg-[var(--bg-archive)]">
            <div class="text-base text-[var(--accent-moss)] font-medium font-serif-editorial">{{ projects.length }}</div>
            <div class="text-[10px] text-[var(--ink-muted)]">造物项目</div>
          </div>
        </div>
      </div>

      <!-- 三种格式导出选项卡 -->
      <div class="space-y-3">
        <!-- 1. JSON 完整备份 -->
        <div
          class="p-4 border border-[var(--border-subtle)] hover:border-[var(--ink-primary)]/40 rounded-xs bg-[var(--bg-archive)] transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-3 group"
        >
          <div class="space-y-0.5 max-w-full sm:max-w-[70%]">
            <div class="flex items-center gap-2 font-serif-editorial text-sm font-medium text-[var(--ink-primary)]">
              <FileJson class="w-4 h-4 text-[var(--accent-warm)]" />
              <span>全量数据 JSON 备份</span>
            </div>
            <p class="text-[11px] text-[var(--ink-muted)]">
              完整结构化对象（条目、附件、记账与个人配置），供数据库恢复或跨平台导入。
            </p>
          </div>
          <button
            @click="handleExportJSON"
            class="px-3 py-1.5 text-xs font-mono-archive border border-[var(--ink-primary)] bg-[var(--ink-primary)] text-[var(--bg-archive)] hover:opacity-90 rounded-xs cursor-pointer flex items-center justify-center gap-1.5 transition-all shadow-xs shrink-0 self-start sm:self-auto"
          >
            <component :is="downloadedType === 'json' ? Check : Download" class="w-3.5 h-3.5" />
            <span>{{ downloadedType === 'json' ? '已导出' : '导出 JSON' }}</span>
          </button>
        </div>

        <!-- 2. Markdown 日记文稿 -->
        <div
          class="p-4 border border-[var(--border-subtle)] hover:border-[var(--ink-primary)]/40 rounded-xs bg-[var(--bg-archive)] transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-3 group"
        >
          <div class="space-y-0.5 max-w-full sm:max-w-[70%]">
            <div class="flex items-center gap-2 font-serif-editorial text-sm font-medium text-[var(--ink-primary)]">
              <FileText class="w-4 h-4 text-[var(--accent-moss)]" />
              <span>生活档案 Markdown 文稿</span>
            </div>
            <p class="text-[11px] text-[var(--ink-muted)]">
              所有生活随笔、思考与胶片底片说明，格式化为纯文本 Markdown 实体书出版排版。
            </p>
          </div>
          <button
            @click="handleExportMarkdown"
            class="px-3 py-1.5 text-xs font-mono-archive border border-[var(--border-subtle)] hover:border-[var(--ink-primary)] rounded-xs cursor-pointer flex items-center justify-center gap-1.5 transition-all text-[var(--ink-primary)] shrink-0 self-start sm:self-auto"
          >
            <component :is="downloadedType === 'markdown' ? Check : Download" class="w-3.5 h-3.5" />
            <span>{{ downloadedType === 'markdown' ? '已导出' : '导出 .md' }}</span>
          </button>
        </div>

        <!-- 3. CSV 记账表格 -->
        <div
          class="p-4 border border-[var(--border-subtle)] hover:border-[var(--ink-primary)]/40 rounded-xs bg-[var(--bg-archive)] transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-3 group"
        >
          <div class="space-y-0.5 max-w-full sm:max-w-[70%]">
            <div class="flex items-center gap-2 font-serif-editorial text-sm font-medium text-[var(--ink-primary)]">
              <FileSpreadsheet class="w-4 h-4 text-amber-700" />
              <span>记账流水 CSV 表格</span>
            </div>
            <p class="text-[11px] text-[var(--ink-muted)]">
              UTF-8 BOM 编码，无中文乱码，可用 Excel / Numbers 直接打开进行月度财务复盘。
            </p>
          </div>
          <button
            @click="handleExportCSV"
            class="px-3 py-1.5 text-xs font-mono-archive border border-[var(--border-subtle)] hover:border-[var(--ink-primary)] rounded-xs cursor-pointer flex items-center justify-center gap-1.5 transition-all text-[var(--ink-primary)] shrink-0 self-start sm:self-auto"
          >
            <component :is="downloadedType === 'csv' ? Check : Download" class="w-3.5 h-3.5" />
            <span>{{ downloadedType === 'csv' ? '已导出' : '导出 CSV' }}</span>
          </button>
        </div>
      </div>

      <!-- 底部版权与数据自主权承诺 -->
      <div class="pt-3 border-t border-[var(--border-subtle)] text-[11px] font-mono-archive text-[var(--ink-muted)] text-center">
        “数据 100% 属于你，永远可导出，永远不被平台绑架。”
      </div>
    </div>
  </div>
</template>
