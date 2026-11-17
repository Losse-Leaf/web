<script setup lang="ts">
import { ref, computed } from 'vue'
import {
  AlertTriangle,
  Archive,
  Cloud,
  Download,
  FolderArchive,
  HardDrive,
  Loader2,
  RefreshCw,
  RotateCcw,
  Trash2,
  Upload,
} from 'lucide-vue-next'
import type { BackupItem, StorageStatus } from '../../types'
import { askConfirm } from '../../composables/useConfirm'
import { formatBytes } from '../../utils/format'
import {
  createBackupNow,
  deleteBackup,
  downloadBackup,
  restoreBackupByFile,
  restoreBackupByFilename,
} from '../../utils/api'

const props = defineProps<{
  backups: BackupItem[]
  storageStatus: StorageStatus | null
  isLoadingList: boolean
  loadError: string
  maxRetention: number
}>()

const emit = defineEmits<{
  (e: 'refresh'): void
  (e: 'update:backups', list: BackupItem[]): void
  (e: 'restored'): void
  (e: 'alert', payload: { type: 'success' | 'error'; text: string }): void
}>()

const isCreatingBackup = ref(false)
const isRestoring = ref(false)
const isDeleting = ref<string | null>(null)
const restoringTarget = ref<string | null>(null)
const downloadingFilename = ref<string | null>(null)
const uploadProgress = ref(0)
const selectedFile = ref<File | null>(null)
const fileInputRef = ref<HTMLInputElement | null>(null)
const isDragging = ref(false)

const totalBackupBytes = computed(() =>
  props.backups.reduce((acc, item) => acc + (item.size || 0), 0),
)

const formatDateTime = (dateStr: string): string => {
  if (!dateStr) return '-'
  try {
    const d = new Date(dateStr)
    if (isNaN(d.getTime())) return dateStr
    return d.toLocaleString('zh-CN', {
      timeZone: 'Asia/Shanghai',
      hour12: false,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
  } catch {
    return dateStr
  }
}

const formatRelativeTime = (dateStr: string): string => {
  if (!dateStr) return ''
  try {
    const d = new Date(dateStr)
    const now = new Date()
    const diffSec = Math.floor((now.getTime() - d.getTime()) / 1000)
    if (diffSec < 60) return '刚刚'
    if (diffSec < 3600) return `${Math.floor(diffSec / 60)} 分钟前`
    if (diffSec < 86400) return `${Math.floor(diffSec / 3600)} 小时前`
    if (diffSec < 86400 * 30) return `${Math.floor(diffSec / 86400)} 天前`
    return ''
  } catch {
    return ''
  }
}

const handleCreateBackup = async () => {
  if (isCreatingBackup.value) return
  isCreatingBackup.value = true
  try {
    const item = await createBackupNow()
    emit('alert', {
      type: 'success',
      text: `全量备份「${item.filename}」已生成并归档 (${formatBytes(item.size)})`,
    })
    emit('refresh')
  } catch (err: any) {
    emit('alert', { type: 'error', text: err?.message || '生成备份失败' })
  } finally {
    isCreatingBackup.value = false
  }
}

const handleDownload = async (filename: string) => {
  if (downloadingFilename.value) return
  downloadingFilename.value = filename
  try {
    await downloadBackup(filename)
  } catch (err: any) {
    emit('alert', { type: 'error', text: err?.message || '下载备份失败' })
  } finally {
    downloadingFilename.value = null
  }
}

const handleDeleteBackup = async (filename: string) => {
  if (isDeleting.value) return
  const confirmed = await askConfirm({
    title: '确认删除备份快照',
    message: `确定要永久删除历史快照「${filename}」吗？\n删除后该历史版本将从云端及本地归档中彻底移除，不可恢复。`,
    confirmText: '确认删除',
    cancelText: '取消',
    danger: true,
  })
  if (!confirmed) return

  isDeleting.value = filename
  try {
    const remaining = await deleteBackup(filename)
    emit('update:backups', remaining)
    emit('alert', { type: 'success', text: `快照「${filename}」已成功移除` })
  } catch (err: any) {
    emit('alert', { type: 'error', text: err?.message || '删除快照失败' })
  } finally {
    isDeleting.value = null
  }
}

const handleRestoreFromList = async (item: BackupItem) => {
  if (isRestoring.value) return
  const confirmed = await askConfirm({
    title: '确认回滚系统快照',
    message: `确定要将系统回滚至备份「${item.filename}」吗？\n当前数据库及媒体库将被该版本完整替换。系统在开始回滚前会自动创建一份安全应急快照保存在服务端。`,
    confirmText: '确认执行回滚',
    cancelText: '取消',
    danger: true,
  })
  if (!confirmed) return

  isRestoring.value = true
  restoringTarget.value = item.filename
  try {
    const res = await restoreBackupByFilename(item.filename)
    emit('alert', { type: 'success', text: res.message || '系统已成功恢复至指定快照' })
    setTimeout(() => {
      emit('restored')
    }, 1200)
  } catch (err: any) {
    emit('alert', { type: 'error', text: err?.message || '回滚快照失败' })
  } finally {
    isRestoring.value = false
    restoringTarget.value = null
  }
}

const onFileSelected = (e: Event) => {
  const target = e.target as HTMLInputElement
  if (target.files && target.files[0]) {
    const file = target.files[0]
    if (!file.name.toLowerCase().endsWith('.zip')) {
      emit('alert', { type: 'error', text: '仅支持恢复 .zip 格式的归档文件' })
      if (fileInputRef.value) fileInputRef.value.value = ''
      selectedFile.value = null
      return
    }
    selectedFile.value = file
  }
}

const onFileDrop = (e: DragEvent) => {
  isDragging.value = false
  if (e.dataTransfer?.files && e.dataTransfer.files[0]) {
    const file = e.dataTransfer.files[0]
    if (!file.name.toLowerCase().endsWith('.zip')) {
      emit('alert', { type: 'error', text: '仅支持恢复 .zip 格式的归档文件' })
      return
    }
    selectedFile.value = file
  }
}

const clearSelectedFile = () => {
  selectedFile.value = null
  if (fileInputRef.value) fileInputRef.value.value = ''
}

const handleRestoreUpload = async () => {
  if (!selectedFile.value || isRestoring.value) return
  const confirmed = await askConfirm({
    title: '确认上传并恢复快照',
    message: `确定要使用上传的文件「${selectedFile.value.name}」(${formatBytes(selectedFile.value.size)}) 进行整库恢复吗？\n当前数据库及媒体库将被替换。系统在执行前会自动生成一份应急快照。`,
    confirmText: '确认恢复',
    cancelText: '取消',
    danger: true,
  })
  if (!confirmed) return

  isRestoring.value = true
  restoringTarget.value = 'upload'
  uploadProgress.value = 0
  try {
    const res = await restoreBackupByFile(selectedFile.value, (percent) => {
      uploadProgress.value = percent
    })
    emit('alert', { type: 'success', text: res.message || '已成功恢复上传的备份文件' })
    clearSelectedFile()
    setTimeout(() => {
      emit('restored')
    }, 1200)
  } catch (err: any) {
    emit('alert', { type: 'error', text: err?.message || '上传恢复失败' })
  } finally {
    isRestoring.value = false
    restoringTarget.value = null
    uploadProgress.value = 0
  }
}
</script>

<template>
  <div class="space-y-5">
    <!-- 策略状态简报与操作条 -->
    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3.5 p-4 bg-[var(--bg-subtle)]/50 border border-[var(--border-subtle)] rounded-xs">
      <div class="space-y-1">
        <div class="flex items-center gap-2">
          <span class="font-serif-editorial text-sm font-medium text-[var(--ink-primary)]">
            全量数据快照归档
          </span>
          <span class="px-1.5 py-0.2 rounded-xs text-[11px] font-mono-archive bg-[var(--bg-archive)] border border-[var(--border-subtle)] text-[var(--ink-muted)]">
            {{ backups.length }}/{{ maxRetention }} 份
          </span>
        </div>
        <p class="text-xs text-[var(--ink-muted)] leading-relaxed font-serif-editorial">
          每 6 小时自动备份 · 累计占用 {{ formatBytes(totalBackupBytes) }} · 目的地：{{ storageStatus?.configured ? 'Cloudflare R2' : '本地存储' }}
        </p>
      </div>
      <div class="flex items-center gap-2 shrink-0">
        <button
          type="button"
          @click="emit('refresh')"
          :disabled="isLoadingList"
          class="px-3 py-1.5 text-xs font-serif-editorial border border-[var(--border-subtle)] hover:border-[var(--ink-primary)] rounded-xs cursor-pointer flex items-center gap-1.5 text-[var(--ink-secondary)] hover:text-[var(--ink-primary)] transition-colors"
          title="刷新快照列表"
        >
          <RefreshCw class="w-3.5 h-3.5" :class="isLoadingList ? 'animate-spin' : ''" />
          <span>刷新</span>
        </button>
        <button
          type="button"
          @click="handleCreateBackup"
          :disabled="isCreatingBackup"
          class="px-4 py-1.5 text-xs font-serif-editorial font-medium border border-[var(--ink-primary)] bg-[var(--ink-primary)] text-[var(--bg-archive)] hover:opacity-90 rounded-xs cursor-pointer flex items-center gap-1.5 transition-all shadow-xs disabled:opacity-50"
        >
          <span class="w-3.5 h-3.5 inline-flex items-center justify-center shrink-0">
            <Loader2 v-if="isCreatingBackup" class="w-3.5 h-3.5 animate-spin" />
            <Archive v-else class="w-3.5 h-3.5" />
          </span>
          <span class="min-w-[7em] text-center">{{ isCreatingBackup ? '正在生成...' : '立即生成快照' }}</span>
        </button>
      </div>
    </div>

    <!-- 现有快照清单列表 -->
    <div class="space-y-3">
      <div class="flex items-center justify-between text-xs text-[var(--ink-muted)]">
        <span class="font-serif-editorial font-medium text-[var(--ink-primary)]">
          历史快照归档清单 ({{ backups.length }}/{{ maxRetention }})
        </span>
        <span class="font-serif-editorial text-[11px]">按时间倒序 · 独立可移植</span>
      </div>

      <div class="min-h-[44px] flex items-center" role="alert" aria-live="polite">
        <div
          v-if="loadError"
          class="w-full p-3 rounded-xs border border-rose-500/30 bg-rose-500/10 text-xs text-rose-800 dark:text-rose-300 flex items-center gap-2"
        >
          <AlertTriangle class="w-4 h-4 shrink-0" />
          <span class="flex-1 min-w-0 truncate">{{ loadError }}</span>
          <button type="button" class="underline cursor-pointer shrink-0" @click="emit('refresh')">重试</button>
        </div>
      </div>

      <div v-if="isLoadingList && backups.length === 0" class="py-12 text-center text-xs font-serif-editorial text-[var(--ink-muted)] space-y-2">
        <Loader2 class="w-5 h-5 mx-auto animate-spin text-[var(--ink-muted)]" />
        <p>正在读取快照归档列表...</p>
      </div>

      <div
        v-else-if="backups.length === 0"
        class="p-8 border border-dashed border-[var(--border-subtle)] rounded-xs text-center space-y-2 bg-[var(--bg-subtle)]/20"
      >
        <div class="w-10 h-10 rounded-full bg-[var(--bg-subtle)] flex items-center justify-center mx-auto text-[var(--ink-muted)]">
          <FolderArchive class="w-5 h-5" />
        </div>
        <div class="font-serif-editorial text-sm font-medium text-[var(--ink-primary)]">
          暂无历史归档快照
        </div>
        <div class="text-xs text-[var(--ink-muted)] max-w-sm mx-auto leading-relaxed">
          可点击上方「立即生成快照」创建首份完整全量备份，或静候系统每 6 小时自动打包归档。
        </div>
      </div>

      <div v-else class="space-y-2.5 max-h-60 overflow-y-auto pr-1">
        <div
          v-for="item in backups"
          :key="item.filename"
          class="p-3 border border-[var(--border-subtle)] hover:border-[var(--ink-primary)]/50 rounded-xs bg-[var(--bg-archive)] transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3 group"
        >
          <div class="space-y-1 min-w-0 flex-1">
            <div class="flex items-center gap-2 flex-wrap">
              <span class="font-mono-archive text-xs font-medium text-[var(--ink-primary)] truncate" :title="item.filename">
                {{ item.filename }}
              </span>
              <span
                class="inline-flex items-center gap-1 px-1.5 py-0.2 rounded-xs text-[11px] font-mono-archive border"
                :class="
                  item.storage_type === 'r2'
                    ? 'border-blue-500/30 text-blue-700 dark:text-blue-300 bg-blue-500/5'
                    : 'border-[var(--border-subtle)] text-[var(--ink-muted)] bg-[var(--bg-subtle)]'
                "
              >
                <component :is="item.storage_type === 'r2' ? Cloud : HardDrive" class="w-3 h-3" />
                <span>{{ item.storage_type === 'r2' ? 'Cloudflare R2' : '本地存储' }}</span>
              </span>
            </div>
            <div class="flex items-center gap-3 text-xs text-[var(--ink-muted)] font-serif-editorial">
              <span class="font-mono-archive text-[11px]">{{ formatBytes(item.size) }}</span>
              <span>·</span>
              <span class="font-mono-archive text-[11px]">{{ formatDateTime(item.created_at) }}</span>
              <span v-if="formatRelativeTime(item.created_at)" class="text-[11px] text-[var(--accent-warm)]">
                ({{ formatRelativeTime(item.created_at) }})
              </span>
            </div>
          </div>

          <div class="flex items-center gap-2 shrink-0 self-end sm:self-auto">
            <button
              type="button"
              @click="handleDownload(item.filename)"
              :disabled="downloadingFilename === item.filename"
              class="px-2.5 py-1 text-xs font-serif-editorial border border-[var(--border-subtle)] hover:border-[var(--ink-primary)] rounded-xs cursor-pointer flex items-center gap-1 text-[var(--ink-secondary)] hover:text-[var(--ink-primary)] transition-colors disabled:opacity-50"
              title="下载备份压缩包"
            >
              <Loader2 v-if="downloadingFilename === item.filename" class="w-3 h-3 animate-spin" />
              <Download v-else class="w-3 h-3" />
              <span>下载</span>
            </button>

            <button
              type="button"
              @click="handleRestoreFromList(item)"
              :disabled="isRestoring"
              class="px-2.5 py-1 text-xs font-serif-editorial border border-amber-600/30 hover:border-amber-600 text-amber-800 dark:text-amber-400 hover:bg-amber-500/10 rounded-xs cursor-pointer flex items-center gap-1 transition-colors disabled:opacity-50"
              title="恢复系统至此快照状态"
            >
              <Loader2 v-if="isRestoring && restoringTarget === item.filename" class="w-3 h-3 animate-spin" />
              <RotateCcw v-else class="w-3 h-3" />
              <span>回滚</span>
            </button>

            <button
              type="button"
              @click="handleDeleteBackup(item.filename)"
              :disabled="isDeleting === item.filename"
              class="p-1 text-xs text-[var(--ink-muted)] hover:text-rose-600 rounded-xs cursor-pointer transition-colors"
              title="删除此备份快照"
            >
              <Loader2 v-if="isDeleting === item.filename" class="w-3.5 h-3.5 animate-spin text-rose-600" />
              <Trash2 v-else class="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- 本地上传并整库还原 -->
    <div class="pt-3 border-t border-[var(--border-subtle)] space-y-2.5">
      <div class="flex items-center justify-between text-xs font-serif-editorial">
        <span class="text-[var(--ink-primary)] font-medium flex items-center gap-1.5">
          <Upload class="w-3.5 h-3.5 text-[var(--accent-warm)]" />
          <span>从本地 ZIP 压缩包还原</span>
        </span>
        <span class="text-[11px] text-[var(--ink-muted)]">
          上传先前导出的 .zip 快照覆盖恢复
        </span>
      </div>

      <input
        ref="fileInputRef"
        type="file"
        accept=".zip"
        class="hidden"
        @change="onFileSelected"
      />

      <div
        @dragover.prevent="isDragging = true"
        @dragleave.prevent="isDragging = false"
        @drop.prevent="onFileDrop"
        class="p-3.5 border rounded-xs transition-all min-h-[120px]"
        :class="[
          isDragging ? 'border-[var(--ink-primary)] bg-[var(--bg-subtle)]' : 'border-dashed border-[var(--border-subtle)] bg-[var(--bg-subtle)]/30',
        ]"
      >
        <div v-if="!selectedFile" class="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div class="text-[11px] text-[var(--ink-muted)] font-serif-editorial">
            拖拽 .zip 备份文件至此，或点击右侧按钮选择文件
          </div>
          <button
            @click="fileInputRef?.click()"
            type="button"
            class="px-3 py-1 text-xs font-serif-editorial border border-[var(--border-subtle)] hover:border-[var(--ink-primary)] rounded-xs cursor-pointer flex items-center gap-1.5 bg-[var(--bg-archive)] text-[var(--ink-primary)] shrink-0 transition-colors self-start sm:self-auto"
          >
            <Upload class="w-3 h-3" />
            <span>选择 ZIP 文件</span>
          </button>
        </div>

        <div v-else class="space-y-3">
          <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 bg-[var(--bg-archive)] border border-[var(--border-subtle)] rounded-xs">
            <div class="space-y-1 min-w-0">
              <div class="flex items-center gap-2">
                <span class="px-1.5 py-0.2 rounded-xs text-[11px] font-mono-archive bg-[var(--accent-warm)]/10 text-[var(--accent-warm)] border border-[var(--accent-warm)]/20">
                  待恢复归档
                </span>
                <span class="font-mono-archive text-xs font-medium text-[var(--ink-primary)] truncate">
                  {{ selectedFile.name }}
                </span>
              </div>
              <div class="text-[11px] text-[var(--ink-muted)] font-mono-archive">
                文件大小：{{ formatBytes(selectedFile.size) }}
              </div>
            </div>

            <div class="flex items-center gap-2 shrink-0">
              <button
                type="button"
                @click="clearSelectedFile"
                :disabled="isRestoring"
                class="px-2.5 py-1 text-xs font-serif-editorial text-[var(--ink-muted)] hover:text-[var(--ink-primary)] cursor-pointer"
              >
                取消重选
              </button>
              <button
                type="button"
                @click="handleRestoreUpload"
                :disabled="isRestoring"
                class="px-3.5 py-1.5 text-xs font-serif-editorial font-medium border border-amber-600 bg-amber-600 text-white hover:bg-amber-700 rounded-xs cursor-pointer flex items-center gap-1.5 transition-all shadow-xs disabled:opacity-50"
              >
                <Loader2 v-if="isRestoring && restoringTarget === 'upload'" class="w-3.5 h-3.5 animate-spin" />
                <RotateCcw v-else class="w-3.5 h-3.5" />
                <span>{{ isRestoring ? `正在恢复 (${uploadProgress}%)` : '确认整库恢复' }}</span>
              </button>
            </div>
          </div>

          <div class="w-full bg-[var(--border-subtle)] h-1.5 rounded-full overflow-hidden">
            <div
              class="bg-amber-600 h-full transition-all duration-150"
              :style="{ width: `${isRestoring && uploadProgress > 0 && uploadProgress < 100 ? uploadProgress : 0}%` }"
            ></div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
