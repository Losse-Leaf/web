<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import {
  X,
  Download,
  FileJson,
  FileText,
  FileSpreadsheet,
  ShieldCheck,
  Check,
  Archive,
  RotateCcw,
  Upload,
  RefreshCw,
  Cloud,
  HardDrive,
  Clock,
  Loader2,
  AlertTriangle,
  Server,
  CheckCircle2,
  Eye,
  EyeOff,
  Save,
  Plug,
  Trash2,
  HelpCircle,
  ChevronDown,
  ChevronUp,
  FolderArchive,
  Sparkles,
} from 'lucide-vue-next'
import type { LifeEntry, Transaction, Project, BackupItem, StorageStatus, StorageConfigPayload } from '../types'
import { useExport } from '../composables/useExport'
import { askConfirm } from '../composables/useConfirm'
import { audio } from '../utils/audio'
import PaperSelect, { type PaperSelectOption } from './PaperSelect.vue'
import {
  fetchBackupList,
  createBackupNow,
  deleteBackup,
  restoreBackupByFilename,
  restoreBackupByFile,
  downloadBackup,
  fetchStorageStatus,
  testStorageConfig,
  updateStorageConfig,
  resetStorageConfig,
  migrateStorageMedia,
  clearApiCache,
  getAdminToken,
} from '../utils/api'

const props = withDefaults(
  defineProps<{
    isOpen: boolean
    initialTab?: 'backup' | 'storage' | 'export'
    entries: LifeEntry[]
    transactions: Transaction[]
    projects: Project[]
    storageStatus?: StorageStatus | null
  }>(),
  {
    initialTab: 'backup',
  }
)

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'restored'): void
  (e: 'requestAuth', callback?: () => void, prompt?: string): void
}>()

// 激活选项卡：'backup' (全量快照与灾备) | 'storage' (对象存储设置) | 'export' (文稿与数据导出)
const activeTab = ref<'backup' | 'storage' | 'export'>(props.initialTab)

watch(
  () => props.initialTab,
  (newTab) => {
    if (newTab) activeTab.value = newTab
  }
)

// 1. 客户端文稿与表格导出
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

// 2. 灾备状态与列表
const backups = ref<BackupItem[]>([])
const localStorageStatus = ref<StorageStatus | null>(props.storageStatus || null)
const isLoadingList = ref(false)
const isCreatingBackup = ref(false)
const isRestoring = ref(false)
const isDeleting = ref<string | null>(null)
const restoringTarget = ref<string | null>(null)
const downloadingFilename = ref<string | null>(null)
const uploadProgress = ref(0)
const selectedFile = ref<File | null>(null)
const fileInputRef = ref<HTMLInputElement | null>(null)
const isDragging = ref(false)
const alertMessage = ref<{ type: 'success' | 'error'; text: string } | null>(null)

// 现有历史备份总容量统计
const totalBackupBytes = computed(() => {
  return backups.value.reduce((acc, item) => acc + (item.size || 0), 0)
})

const showAlertMsg = (type: 'success' | 'error', text: string) => {
  alertMessage.value = { type, text }
  setTimeout(() => {
    if (alertMessage.value?.text === text) {
      alertMessage.value = null
    }
  }, 5000)
}

// 格式化辅助
const formatBytes = (bytes: number): string => {
  if (!bytes || bytes <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(1024))
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`
}

const formatDateTime = (dateStr: string): string => {
  if (!dateStr) return '-'
  try {
    const d = new Date(dateStr)
    if (isNaN(d.getTime())) return dateStr
    return d.toLocaleString('zh-CN', {
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

// 计算相对时间（刚刚、几分钟前、几天前）
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

// 读取数据
const loadData = async () => {
  isLoadingList.value = true
  try {
    const [listRes, statusRes] = await Promise.allSettled([
      fetchBackupList(),
      fetchStorageStatus(),
    ])
    if (listRes.status === 'fulfilled') {
      backups.value = listRes.value
    }
    if (statusRes.status === 'fulfilled') {
      localStorageStatus.value = statusRes.value
    }
  } catch (err: any) {
    console.error('Failed to load backup data:', err)
  } finally {
    isLoadingList.value = false
  }
}

// 手动生成全量备份快照
const handleCreateBackup = async () => {
  if (isCreatingBackup.value) return
  isCreatingBackup.value = true
  audio.playTink()
  try {
    const item = await createBackupNow()
    audio.playPaperFlip()
    showAlertMsg('success', `全量备份「${item.filename}」已生成并归档 (${formatBytes(item.size)})`)
    await loadData()
  } catch (err: any) {
    showAlertMsg('error', err?.message || '生成备份失败')
  } finally {
    isCreatingBackup.value = false
  }
}

// 下载备份
const handleDownload = async (filename: string) => {
  if (downloadingFilename.value) return
  downloadingFilename.value = filename
  audio.playTink()
  try {
    await downloadBackup(filename)
    audio.playPaperFlip()
  } catch (err: any) {
    showAlertMsg('error', err?.message || '下载备份失败')
  } finally {
    downloadingFilename.value = null
  }
}

// 删除指定历史备份
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
  audio.playTink()
  try {
    const remaining = await deleteBackup(filename)
    backups.value = remaining
    showAlertMsg('success', `快照「${filename}」已成功移除`)
    audio.playPaperFlip()
  } catch (err: any) {
    showAlertMsg('error', err?.message || '删除快照失败')
  } finally {
    isDeleting.value = null
  }
}

// 从已有归档回滚
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
  audio.playTink()
  try {
    const res = await restoreBackupByFilename(item.filename)
    clearApiCache()
    audio.playPaperFlip()
    showAlertMsg('success', res.message || '系统已成功恢复至指定快照')
    setTimeout(() => {
      emit('restored')
    }, 1200)
  } catch (err: any) {
    showAlertMsg('error', err?.message || '回滚快照失败')
  } finally {
    isRestoring.value = false
    restoringTarget.value = null
  }
}

// 选择本地备份文件
const onFileSelected = (e: Event) => {
  const target = e.target as HTMLInputElement
  if (target.files && target.files[0]) {
    const file = target.files[0]
    if (!file.name.toLowerCase().endsWith('.zip')) {
      showAlertMsg('error', '仅支持恢复 .zip 格式的归档文件')
      if (fileInputRef.value) fileInputRef.value.value = ''
      selectedFile.value = null
      return
    }
    selectedFile.value = file
    audio.playTink()
  }
}

// 拖拽文件进入
const onFileDrop = (e: DragEvent) => {
  isDragging.value = false
  if (e.dataTransfer?.files && e.dataTransfer.files[0]) {
    const file = e.dataTransfer.files[0]
    if (!file.name.toLowerCase().endsWith('.zip')) {
      showAlertMsg('error', '仅支持恢复 .zip 格式的归档文件')
      return
    }
    selectedFile.value = file
    audio.playTink()
  }
}

const clearSelectedFile = () => {
  selectedFile.value = null
  if (fileInputRef.value) fileInputRef.value.value = ''
}

// 上传本地文件恢复
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
  audio.playTink()
  try {
    const res = await restoreBackupByFile(selectedFile.value, (percent) => {
      uploadProgress.value = percent
    })
    clearApiCache()
    audio.playPaperFlip()
    showAlertMsg('success', res.message || '已成功恢复上传的备份文件')
    clearSelectedFile()
    setTimeout(() => {
      emit('restored')
    }, 1200)
  } catch (err: any) {
    showAlertMsg('error', err?.message || '上传恢复失败')
  } finally {
    isRestoring.value = false
    restoringTarget.value = null
    uploadProgress.value = 0
  }
}

// 3. 对象存储配置交互
const storageProviderType = ref<'r2' | 's3'>('r2')
const showSecretKey = ref(false)
const showR2Guide = ref(false)
const isTestingStorage = ref(false)
const isSavingStorage = ref(false)
const isResettingStorage = ref(false)
const isMigratingMedia = ref(false)
const storageTestResult = ref<{ success: boolean; message: string; latency_ms?: number } | null>(null)
const mediaSyncResult = ref<{ uploaded_to_r2: number; downloaded_to_local: number; message: string } | null>(null)

const handleMigrateStorageMedia = async () => {
  if (isMigratingMedia.value) return
  isMigratingMedia.value = true
  mediaSyncResult.value = null
  audio.playTink()
  try {
    const res = await migrateStorageMedia()
    mediaSyncResult.value = res
    const summaryText = `已上传 ${res.uploaded_to_r2 ?? 0} 项至云端，已拉取 ${res.downloaded_to_local ?? 0} 项至本地`
    showAlertMsg('success', summaryText)
    audio.playPaperFlip()
    try {
      localStorageStatus.value = await fetchStorageStatus()
    } catch {}
  } catch (err: any) {
    showAlertMsg('error', err?.message || '双向同步媒体失败')
  } finally {
    isMigratingMedia.value = false
  }
}

const storageForm = ref<StorageConfigPayload>({
  account_id: '',
  access_key_id: '',
  secret_access_key: '',
  bucket_name: '',
  endpoint: '',
  public_domain: '',
  presign_expire_seconds: 1800,
})

const presignExpireOptions: PaperSelectOption[] = [
  { value: 900, label: '15 分钟', sublabel: '高安全推荐', badge: '推荐' },
  { value: 1800, label: '30 分钟', sublabel: '默认推荐', badge: '常用' },
  { value: 3600, label: '1 小时', sublabel: '常规会话', badge: '1h' },
  { value: 21600, label: '6 小时', sublabel: '长效展示', badge: '6h' },
  { value: 86400, label: '24 小时', sublabel: '全天时效', badge: '1d' },
  { value: 604800, label: '7 天', sublabel: '最长上限', badge: '7d' },
]

// S3 服务商预设模版快捷填入
const applyS3Preset = (preset: 'minio' | 'cos' | 'oss' | 'aws') => {
  audio.playTink()
  if (preset === 'minio') {
    storageForm.value.endpoint = 'http://localhost:9000'
  } else if (preset === 'cos') {
    storageForm.value.endpoint = 'https://cos.ap-guangzhou.myqcloud.com'
  } else if (preset === 'oss') {
    storageForm.value.endpoint = 'https://oss-cn-hangzhou.aliyuncs.com'
  } else if (preset === 'aws') {
    storageForm.value.endpoint = 'https://s3.ap-northeast-1.amazonaws.com'
  }
}

const syncFormWithStatus = (status: StorageStatus | null) => {
  if (!status) return
  storageForm.value.account_id = status.account_id || ''
  storageForm.value.bucket_name = status.bucket || ''
  storageForm.value.endpoint = status.endpoint || ''
  storageForm.value.access_key_id = status.access_key_id || ''
  storageForm.value.public_domain = status.public_domain || ''
  storageForm.value.secret_access_key = ''
  storageForm.value.presign_expire_seconds = status.presign_expire_seconds || 1800

  if (status.endpoint && !status.endpoint.includes('.r2.cloudflarestorage.com')) {
    storageProviderType.value = 's3'
  } else {
    storageProviderType.value = 'r2'
  }
}

watch(
  localStorageStatus,
  (newVal) => {
    if (newVal) {
      syncFormWithStatus(newVal)
    }
  },
  { immediate: true }
)

const handleTestStorage = async () => {
  if (isTestingStorage.value) return
  if (!getAdminToken()) {
    emit('requestAuth', () => handleTestStorage(), '请输入管理员密钥以测试对象存储连接')
    return
  }
  storageTestResult.value = null

  if (!storageForm.value.bucket_name?.trim()) {
    showAlertMsg('error', '请填写存储桶名称 (Bucket Name)')
    return
  }
  if (!storageForm.value.access_key_id?.trim()) {
    showAlertMsg('error', '请填写 Access Key ID')
    return
  }
  if (storageProviderType.value === 'r2' && !storageForm.value.account_id?.trim() && !storageForm.value.endpoint?.trim()) {
    showAlertMsg('error', '请填写 Cloudflare Account ID 或自定义 Endpoint')
    return
  }
  if (storageProviderType.value === 's3' && !storageForm.value.endpoint?.trim()) {
    showAlertMsg('error', '请填写 S3 Endpoint 服务端点')
    return
  }
  if (!storageForm.value.secret_access_key?.trim() && !localStorageStatus.value?.has_secret_key) {
    showAlertMsg('error', '请填写 Secret Access Key')
    return
  }

  isTestingStorage.value = true
  try {
    const payload: StorageConfigPayload = {
      ...storageForm.value,
      account_id: storageForm.value.account_id?.trim(),
      access_key_id: storageForm.value.access_key_id?.trim(),
      secret_access_key: storageForm.value.secret_access_key?.trim(),
      bucket_name: storageForm.value.bucket_name?.trim(),
      endpoint:
        storageProviderType.value === 'r2' && storageForm.value.account_id?.trim() && !storageForm.value.endpoint?.trim()
          ? `https://${storageForm.value.account_id.trim()}.r2.cloudflarestorage.com`
          : storageForm.value.endpoint?.trim(),
      public_domain: storageForm.value.public_domain?.trim(),
      presign_expire_seconds: Number(storageForm.value.presign_expire_seconds) || 1800,
    }
    const res = await testStorageConfig(payload)
    const latencyInfo = res.latency_ms ? ` · 往返延迟 ${res.latency_ms}ms` : ''
    storageTestResult.value = {
      success: true,
      message: `${res.message || '握手测试成功，读写校验正常'}${latencyInfo}`,
      latency_ms: res.latency_ms,
    }
    audio.playTink()
  } catch (err: any) {
    storageTestResult.value = {
      success: false,
      message: err?.message || '连接测试失败，请检查 Endpoint、凭据及存储桶名称',
    }
    audio.playTink()
  } finally {
    isTestingStorage.value = false
  }
}

const handleSaveStorage = async () => {
  if (isSavingStorage.value) return
  if (!getAdminToken()) {
    emit('requestAuth', () => handleSaveStorage(), '请输入管理员密钥以保存对象存储配置')
    return
  }

  if (!storageForm.value.bucket_name?.trim()) {
    showAlertMsg('error', '请填写存储桶名称 (Bucket Name)')
    return
  }
  if (!storageForm.value.access_key_id?.trim()) {
    showAlertMsg('error', '请填写 Access Key ID')
    return
  }
  if (storageProviderType.value === 'r2' && !storageForm.value.account_id?.trim() && !storageForm.value.endpoint?.trim()) {
    showAlertMsg('error', '请填写 Cloudflare Account ID 或自定义 Endpoint')
    return
  }
  if (storageProviderType.value === 's3' && !storageForm.value.endpoint?.trim()) {
    showAlertMsg('error', '请填写 S3 Endpoint 服务端点')
    return
  }
  if (!storageForm.value.secret_access_key?.trim() && !localStorageStatus.value?.has_secret_key) {
    showAlertMsg('error', '请填写 Secret Access Key')
    return
  }

  isSavingStorage.value = true
  try {
    const payload: StorageConfigPayload = {
      ...storageForm.value,
      account_id: storageForm.value.account_id?.trim(),
      access_key_id: storageForm.value.access_key_id?.trim(),
      secret_access_key: storageForm.value.secret_access_key?.trim(),
      bucket_name: storageForm.value.bucket_name?.trim(),
      endpoint:
        storageProviderType.value === 'r2' && storageForm.value.account_id?.trim() && !storageForm.value.endpoint?.trim()
          ? `https://${storageForm.value.account_id.trim()}.r2.cloudflarestorage.com`
          : storageForm.value.endpoint?.trim(),
      public_domain: storageForm.value.public_domain?.trim(),
      presign_expire_seconds: Number(storageForm.value.presign_expire_seconds) || 1800,
    }
    const updatedStatus = await updateStorageConfig(payload)
    localStorageStatus.value = updatedStatus
    storageForm.value.secret_access_key = ''
    storageTestResult.value = { success: true, message: '配置已保存并生效，对象存储已成功热重载挂载' }
    showAlertMsg('success', '对象存储配置已保存并生效')
    audio.playPaperFlip()
  } catch (err: any) {
    showAlertMsg('error', err?.message || '保存配置失败')
    audio.playTink()
  } finally {
    isSavingStorage.value = false
  }
}

const handleResetStorage = async () => {
  const confirmed = await askConfirm({
    title: '切换为本地磁盘存储',
    message: '确定要关闭云端对象存储并恢复为本地磁盘存储模式吗？新上传的文件将直接保存在服务端本地磁盘 (/media)。',
    confirmText: '确认恢复本地存储',
    cancelText: '取消',
    danger: true,
  })
  if (!confirmed) return

  isResettingStorage.value = true
  try {
    const updatedStatus = await resetStorageConfig()
    localStorageStatus.value = updatedStatus
    storageForm.value.secret_access_key = ''
    storageTestResult.value = null
    showAlertMsg('success', '已恢复为本地磁盘存储模式')
    audio.playTink()
  } catch (err: any) {
    showAlertMsg('error', err?.message || '重置失败')
    audio.playTink()
  } finally {
    isResettingStorage.value = false
  }
}

onMounted(() => {
  loadData()
})
</script>

<template>
  <div
    v-if="isOpen"
    class="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/55 backdrop-blur-xs transition-opacity duration-200"
    @click.self="emit('close')"
  >
    <div
      class="w-full max-w-3xl bg-[var(--bg-archive)] border border-[var(--border-subtle)] rounded-xs shadow-2xl p-5 sm:p-7 text-left space-y-6 max-h-[92dvh] overflow-y-auto animate-in fade-in zoom-in-95 duration-200"
    >
      <!-- 弹窗顶栏 -->
      <div class="flex items-center justify-between pb-4 border-b border-[var(--border-subtle)]">
        <div class="space-y-1">
          <div class="flex items-center gap-2.5">
            <h2 class="font-serif-editorial text-2xl text-[var(--ink-primary)] font-medium tracking-tight">
              存储与数据灾备
            </h2>
            <span
              v-if="localStorageStatus?.configured"
              class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-mono-archive bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20"
            >
              <span class="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
              <span>R2 联动中</span>
            </span>
            <span
              v-else
              class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-mono-archive bg-[var(--bg-subtle)] text-[var(--ink-secondary)] border border-[var(--border-subtle)]"
            >
              <HardDrive class="w-3 h-3 text-[var(--accent-warm)]" />
              <span>本地存储</span>
            </span>
          </div>
          <p class="font-serif-editorial text-xs text-[var(--ink-secondary)]">
            全量 ZIP 灾备快照 · 多端对象存储挂载 · 出版级数据自主掌控
          </p>
        </div>
        <button
          @click="emit('close')"
          class="p-1.5 text-[var(--ink-muted)] hover:text-[var(--ink-primary)] hover:bg-[var(--bg-subtle)] rounded-xs transition-colors cursor-pointer"
        >
          <X class="w-5 h-5" />
        </button>
      </div>

      <!-- 三大选项卡导航切换 -->
      <div class="flex items-center gap-1 sm:gap-2 border-b border-[var(--border-subtle)] pb-2 overflow-x-auto text-xs">
        <button
          @click="activeTab = 'backup'"
          class="px-3.5 py-2 rounded-xs border transition-all cursor-pointer flex items-center gap-2 shrink-0 font-serif-editorial"
          :class="
            activeTab === 'backup'
              ? 'border-[var(--ink-primary)] bg-[var(--ink-primary)] text-[var(--bg-archive)] font-medium shadow-xs'
              : 'border-transparent text-[var(--ink-secondary)] hover:border-[var(--border-subtle)] hover:bg-[var(--bg-subtle)]'
          "
        >
          <Archive class="w-3.5 h-3.5" />
          <span>全量快照与灾备</span>
          <span
            class="px-1.5 py-0.2 rounded-xs text-[10px] font-mono-archive"
            :class="activeTab === 'backup' ? 'bg-white/20 text-white' : 'bg-[var(--bg-subtle)] text-[var(--ink-muted)]'"
          >
            {{ backups.length }}/7
          </span>
        </button>

        <button
          @click="activeTab = 'storage'"
          class="px-3.5 py-2 rounded-xs border transition-all cursor-pointer flex items-center gap-2 shrink-0 font-serif-editorial"
          :class="
            activeTab === 'storage'
              ? 'border-[var(--ink-primary)] bg-[var(--ink-primary)] text-[var(--bg-archive)] font-medium shadow-xs'
              : 'border-transparent text-[var(--ink-secondary)] hover:border-[var(--border-subtle)] hover:bg-[var(--bg-subtle)]'
          "
        >
          <Server class="w-3.5 h-3.5" />
          <span>对象存储设置</span>
          <span
            class="w-2 h-2 rounded-full"
            :class="localStorageStatus?.configured ? 'bg-emerald-500' : 'bg-[var(--ink-muted)]/40'"
          ></span>
        </button>

        <button
          @click="activeTab = 'export'"
          class="px-3.5 py-2 rounded-xs border transition-all cursor-pointer flex items-center gap-2 shrink-0 font-serif-editorial"
          :class="
            activeTab === 'export'
              ? 'border-[var(--ink-primary)] bg-[var(--ink-primary)] text-[var(--bg-archive)] font-medium shadow-xs'
              : 'border-transparent text-[var(--ink-secondary)] hover:border-[var(--border-subtle)] hover:bg-[var(--bg-subtle)]'
          "
        >
          <FileText class="w-3.5 h-3.5" />
          <span>文稿与数据导出</span>
        </button>
      </div>

      <!-- 操作反馈提示条 -->
      <div
        v-if="alertMessage"
        class="p-3 rounded-xs border text-xs font-serif-editorial flex items-start gap-2.5 transition-all"
        :class="
          alertMessage.type === 'success'
            ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-800 dark:text-emerald-300'
            : 'bg-rose-500/10 border-rose-500/30 text-rose-800 dark:text-rose-300'
        "
      >
        <Check v-if="alertMessage.type === 'success'" class="w-4 h-4 shrink-0 text-emerald-600 mt-0.5" />
        <AlertTriangle v-else class="w-4 h-4 shrink-0 text-rose-600 mt-0.5" />
        <span class="flex-1 leading-relaxed">{{ alertMessage.text }}</span>
      </div>

      <!-- ========================================== -->
      <!-- 选项卡 1：全量 ZIP 快照与灾备 -->
      <!-- ========================================== -->
      <div v-if="activeTab === 'backup'" class="space-y-6">
        <!-- 3 大状态策略指标卡 -->
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <!-- 卡片 1：定时计划 -->
          <div class="p-3.5 bg-[var(--bg-subtle)]/70 border border-[var(--border-subtle)] rounded-xs space-y-1.5 transition-all">
            <div class="flex items-center justify-between text-[var(--ink-muted)] text-xs">
              <span class="flex items-center gap-1.5">
                <Clock class="w-3.5 h-3.5 text-[var(--accent-warm)]" />
                <span>定时备份计划</span>
              </span>
              <span class="flex items-center gap-1 text-[10px] text-emerald-600 dark:text-emerald-400 font-mono-archive">
                <span class="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                <span>运行中</span>
              </span>
            </div>
            <div class="text-[var(--ink-primary)] font-serif-editorial text-base font-medium">
              每日 03:30 (北京时间)
            </div>
            <div class="text-[11px] text-[var(--ink-muted)]">
              后台原子快照 · 零停机热打包
            </div>
          </div>

          <!-- 卡片 2：存储目的地 -->
          <div class="p-3.5 bg-[var(--bg-subtle)]/70 border border-[var(--border-subtle)] rounded-xs space-y-1.5 transition-all">
            <div class="flex items-center justify-between text-[var(--ink-muted)] text-xs">
              <span class="flex items-center gap-1.5">
                <component
                  :is="localStorageStatus?.configured ? Cloud : HardDrive"
                  class="w-3.5 h-3.5"
                  :class="localStorageStatus?.configured ? 'text-blue-600' : 'text-[var(--accent-warm)]'"
                />
                <span>灾备目的地</span>
              </span>
              <span
                class="px-1.5 py-0.2 rounded-xs text-[10px] font-mono-archive"
                :class="localStorageStatus?.configured ? 'bg-blue-500/10 text-blue-700 dark:text-blue-300' : 'bg-[var(--bg-subtle)] text-[var(--ink-muted)]'"
              >
                {{ localStorageStatus?.configured ? '云端多活' : '本地留存' }}
              </span>
            </div>
            <div class="text-[var(--ink-primary)] font-serif-editorial text-base font-medium truncate">
              {{ localStorageStatus?.configured ? 'Cloudflare R2' : '本地磁盘存储' }}
            </div>
            <div class="text-[11px] text-[var(--ink-muted)] truncate font-mono-archive">
              {{ localStorageStatus?.configured ? (localStorageStatus.bucket || '已挂载云存储桶') : 'data/backups/ 目录' }}
            </div>
          </div>

          <!-- 卡片 3：保留配额与总容量 -->
          <div class="p-3.5 bg-[var(--bg-subtle)]/70 border border-[var(--border-subtle)] rounded-xs space-y-1.5 transition-all">
            <div class="flex items-center justify-between text-[var(--ink-muted)] text-xs">
              <span class="flex items-center gap-1.5">
                <ShieldCheck class="w-3.5 h-3.5 text-[var(--accent-moss)]" />
                <span>滑动保留配额</span>
              </span>
              <span class="text-[10px] text-[var(--ink-muted)] font-mono-archive">
                {{ backups.length }}/7 份
              </span>
            </div>
            <div class="text-[var(--ink-primary)] font-serif-editorial text-base font-medium">
              最多保留 7 份
            </div>
            <div class="text-[11px] text-[var(--ink-muted)] font-mono-archive">
              累计占用 {{ formatBytes(totalBackupBytes) }} · 滚动淘汰
            </div>
          </div>
        </div>

        <!-- 立即生成快照操作条 -->
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3.5 p-4 bg-[var(--bg-subtle)]/40 border border-[var(--border-subtle)] rounded-xs">
          <div class="space-y-0.5">
            <div class="font-serif-editorial text-sm font-medium text-[var(--ink-primary)] flex items-center gap-1.5">
              <Sparkles class="w-3.5 h-3.5 text-[var(--accent-warm)]" />
              <span>即时全量快照归档</span>
            </div>
            <p class="text-xs text-[var(--ink-muted)] leading-relaxed">
              基于 SQLite VACUUM INTO 原子快照，打包全量生活档案、日常账目及媒体底片为独立 .zip 归档。
            </p>
          </div>
          <div class="flex items-center gap-2 shrink-0">
            <button
              @click="loadData"
              :disabled="isLoadingList"
              class="px-3 py-1.5 text-xs font-serif-editorial border border-[var(--border-subtle)] hover:border-[var(--ink-primary)] rounded-xs cursor-pointer flex items-center gap-1.5 text-[var(--ink-secondary)] hover:text-[var(--ink-primary)] transition-colors"
              title="刷新快照列表"
            >
              <RefreshCw class="w-3.5 h-3.5" :class="isLoadingList ? 'animate-spin' : ''" />
              <span>刷新</span>
            </button>
            <button
              @click="handleCreateBackup"
              :disabled="isCreatingBackup"
              class="px-4 py-1.5 text-xs font-serif-editorial font-medium border border-[var(--ink-primary)] bg-[var(--ink-primary)] text-[var(--bg-archive)] hover:opacity-90 rounded-xs cursor-pointer flex items-center gap-1.5 transition-all shadow-xs disabled:opacity-50"
            >
              <Loader2 v-if="isCreatingBackup" class="w-3.5 h-3.5 animate-spin" />
              <Archive v-else class="w-3.5 h-3.5" />
              <span>{{ isCreatingBackup ? '正在原子打包...' : '立即生成快照' }}</span>
            </button>
          </div>
        </div>

        <!-- 现有快照清单列表 -->
        <div class="space-y-3">
          <div class="flex items-center justify-between text-xs text-[var(--ink-muted)]">
            <span class="font-serif-editorial font-medium text-[var(--ink-primary)]">
              历史快照归档清单 ({{ backups.length }}/7)
            </span>
            <span class="font-serif-editorial text-[11px]">按时间倒序 · 独立可移植</span>
          </div>

          <div v-if="isLoadingList && backups.length === 0" class="py-12 text-center text-xs font-serif-editorial text-[var(--ink-muted)] space-y-2">
            <Loader2 class="w-5 h-5 mx-auto animate-spin text-[var(--ink-muted)]" />
            <p>正在读取快照归档列表...</p>
          </div>

          <!-- 空状态 -->
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
              可点击上方「立即生成快照」创建首份完整全量备份，或静候每日 03:30 系统自动打包归档。
            </div>
          </div>

          <!-- 快照条目列表 -->
          <div v-else class="space-y-2.5 max-h-64 overflow-y-auto pr-1">
            <div
              v-for="item in backups"
              :key="item.filename"
              class="p-3.5 border border-[var(--border-subtle)] hover:border-[var(--ink-primary)]/50 rounded-xs bg-[var(--bg-archive)] transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3 group"
            >
              <div class="space-y-1.5 min-w-0 flex-1">
                <div class="flex items-center gap-2 flex-wrap">
                  <span class="font-mono-archive text-xs font-medium text-[var(--ink-primary)] truncate" :title="item.filename">
                    {{ item.filename }}
                  </span>
                  <span
                    class="inline-flex items-center gap-1 px-1.5 py-0.2 rounded-xs text-[10px] font-mono-archive border"
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

              <!-- 操作按钮组 -->
              <div class="flex items-center gap-2 shrink-0 self-end sm:self-auto">
                <button
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

        <!-- 本地上传并整库还原 (Dropzone) -->
        <div class="pt-4 border-t border-[var(--border-subtle)] space-y-3">
          <div class="space-y-0.5">
            <div class="font-serif-editorial text-sm font-medium text-[var(--ink-primary)] flex items-center gap-1.5">
              <Upload class="w-4 h-4 text-[var(--accent-warm)]" />
              <span>从本地 ZIP 压缩包还原</span>
            </div>
            <p class="text-xs text-[var(--ink-muted)] font-serif-editorial">
              支持上传散页导出的 .zip 完整快照一键覆盖恢复。执行前系统将自动生成前置应急快照，保障数据绝对安全。
            </p>
          </div>

          <input
            ref="fileInputRef"
            type="file"
            accept=".zip"
            class="hidden"
            @change="onFileSelected"
          />

          <!-- 拖拽上传与选定展示区 -->
          <div
            @dragover.prevent="isDragging = true"
            @dragleave.prevent="isDragging = false"
            @drop.prevent="onFileDrop"
            class="p-4 border rounded-xs transition-all"
            :class="[
              isDragging ? 'border-[var(--ink-primary)] bg-[var(--bg-subtle)]' : 'border-dashed border-[var(--border-subtle)] bg-[var(--bg-subtle)]/30',
            ]"
          >
            <!-- 尚未选择文件状态 -->
            <div v-if="!selectedFile" class="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div class="space-y-1">
                <div class="font-serif-editorial text-xs text-[var(--ink-primary)] font-medium">
                  拖拽 .zip 备份文件至此，或通过系统文件选择器导入
                </div>
                <div class="text-[11px] text-[var(--ink-muted)] font-serif-editorial">
                  包含 database/looseleaf.db 与媒体附件的完整压缩包
                </div>
              </div>
              <button
                @click="fileInputRef?.click()"
                type="button"
                class="px-3.5 py-1.5 text-xs font-serif-editorial border border-[var(--border-subtle)] hover:border-[var(--ink-primary)] rounded-xs cursor-pointer flex items-center gap-1.5 bg-[var(--bg-archive)] text-[var(--ink-primary)] shrink-0 transition-colors self-start sm:self-auto"
              >
                <Upload class="w-3.5 h-3.5" />
                <span>选择 ZIP 文件</span>
              </button>
            </div>

            <!-- 已选定待恢复文件预览 -->
            <div v-else class="space-y-3">
              <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 bg-[var(--bg-archive)] border border-[var(--border-subtle)] rounded-xs">
                <div class="space-y-1 min-w-0">
                  <div class="flex items-center gap-2">
                    <span class="px-1.5 py-0.2 rounded-xs text-[10px] font-mono-archive bg-[var(--accent-warm)]/10 text-[var(--accent-warm)] border border-[var(--accent-warm)]/20">
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
                    @click="clearSelectedFile"
                    :disabled="isRestoring"
                    class="px-2.5 py-1 text-xs font-serif-editorial text-[var(--ink-muted)] hover:text-[var(--ink-primary)] cursor-pointer"
                  >
                    取消重选
                  </button>
                  <button
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

              <!-- 上传进度条 -->
              <div v-if="isRestoring && uploadProgress > 0 && uploadProgress < 100" class="w-full bg-[var(--border-subtle)] h-1.5 rounded-full overflow-hidden">
                <div
                  class="bg-amber-600 h-full transition-all duration-150"
                  :style="{ width: `${uploadProgress}%` }"
                ></div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- ========================================== -->
      <!-- 选项卡 2：对象存储设置 -->
      <!-- ========================================== -->
      <div v-else-if="activeTab === 'storage'" class="space-y-6">
        <!-- 运行模式现状看板 -->
        <div class="p-4 bg-[var(--bg-subtle)]/70 rounded-xs border border-[var(--border-subtle)] space-y-3 font-serif-editorial">
          <div class="flex items-center justify-between pb-2.5 border-b border-[var(--border-subtle)]/60 text-xs">
            <span class="text-[var(--ink-muted)]">存储架构模式</span>
            <div class="flex items-center gap-1.5">
              <span
                v-if="localStorageStatus?.configured"
                class="text-emerald-700 dark:text-emerald-400 flex items-center gap-1 font-medium"
              >
                <CheckCircle2 class="w-3.5 h-3.5" />
                <span>{{ localStorageStatus?.provider || 'Cloudflare R2' }} (已挂载联动)</span>
              </span>
              <span
                v-else
                class="text-[var(--ink-secondary)] flex items-center gap-1 font-medium"
              >
                <HardDrive class="w-3.5 h-3.5 text-[var(--accent-warm)]" />
                <span>本地磁盘自主存储模式 (/media)</span>
              </span>
            </div>
          </div>

          <!-- 4 维指标网格 -->
          <div class="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs font-serif-editorial">
            <div class="p-2.5 bg-[var(--bg-archive)] rounded-xs border border-[var(--border-subtle)]/60 space-y-1">
              <span class="text-[11px] text-[var(--ink-muted)] block">存储桶 (Bucket)</span>
              <span class="text-[var(--ink-primary)] font-mono-archive text-xs font-medium block truncate">
                {{ localStorageStatus?.configured ? (localStorageStatus.bucket || '—') : '本地 data/uploads' }}
              </span>
            </div>

            <div class="p-2.5 bg-[var(--bg-archive)] rounded-xs border border-[var(--border-subtle)]/60 space-y-1">
              <span class="text-[11px] text-[var(--ink-muted)] block">访问接入端点</span>
              <span class="text-[var(--ink-primary)] font-mono-archive text-xs font-medium block truncate">
                {{ localStorageStatus?.configured ? (localStorageStatus.endpoint || '—') : '/media' }}
              </span>
            </div>

            <div class="p-2.5 bg-[var(--bg-archive)] rounded-xs border border-[var(--border-subtle)]/60 space-y-1">
              <span class="text-[11px] text-[var(--ink-muted)] block">公网加速域名</span>
              <span class="text-[var(--ink-primary)] font-mono-archive text-xs font-medium block truncate">
                {{ localStorageStatus?.configured ? (localStorageStatus.public_domain || '临时签名直传') : '本地同源静态' }}
              </span>
            </div>

            <div class="p-2.5 bg-[var(--bg-archive)] rounded-xs border border-[var(--border-subtle)]/60 space-y-1">
              <span class="text-[11px] text-[var(--ink-muted)] block">本地已有媒体</span>
              <span class="text-[var(--ink-primary)] font-mono-archive text-xs font-medium block truncate">
                {{ localStorageStatus?.local_file_count || 0 }} 件 · {{ formatBytes(localStorageStatus?.local_total_bytes || 0) }}
              </span>
            </div>
          </div>

          <p class="text-xs text-[var(--ink-muted)] leading-relaxed pt-1">
            {{
              localStorageStatus?.configured
                ? '系统已与对象存储建立直传通道，新上传的底片与附件直传云端，全量快照每日自动推送至该桶。'
                : '当前运行于服务端本地磁盘存储模式，照片与底片安全持久化于本机，无需依赖外部云厂商，完全保障私密数据主权。'
            }}
          </p>

          <!-- 双向同步本地与云端媒体 -->
          <div
            v-if="localStorageStatus?.configured"
            class="pt-2.5 border-t border-[var(--border-subtle)]/60 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-xs"
          >
            <div class="space-y-0.5">
              <div class="text-[var(--ink-primary)] font-medium">本地与云端媒体对齐</div>
              <div v-if="mediaSyncResult" class="text-[11px] font-mono-archive text-emerald-700 dark:text-emerald-400">
                已上传 {{ mediaSyncResult.uploaded_to_r2 ?? 0 }} 项至云端，已拉取 {{ mediaSyncResult.downloaded_to_local ?? 0 }} 项至本地
              </div>
              <div v-else class="text-[11px] text-[var(--ink-muted)]">
                将历史本地残留附件补传至 R2，或将云端缺失附件拉取回本地缓存
              </div>
            </div>
            <button
              type="button"
              @click="handleMigrateStorageMedia"
              :disabled="isMigratingMedia"
              class="px-3.5 py-1.5 border border-[var(--border-subtle)] hover:border-[var(--ink-primary)] bg-[var(--bg-archive)] text-[var(--ink-primary)] rounded-xs text-xs font-serif-editorial transition-colors cursor-pointer flex items-center gap-1.5 shrink-0 self-start sm:self-auto disabled:opacity-50"
            >
              <RefreshCw class="w-3.5 h-3.5 text-[var(--accent-warm)]" :class="{ 'animate-spin': isMigratingMedia }" />
              <span>{{ isMigratingMedia ? '正在双向同步媒体...' : '双向同步本地与云端媒体' }}</span>
            </button>
          </div>
        </div>

        <!-- 在线配置控制台 -->
        <div class="p-5 bg-[var(--bg-subtle)]/40 rounded-xs border border-[var(--border-subtle)] space-y-5">
          <div class="flex items-center justify-between">
            <div class="space-y-0.5">
              <div class="font-serif-editorial text-sm font-medium text-[var(--ink-primary)]">
                对象存储接入凭据
              </div>
              <div class="text-xs text-[var(--ink-muted)] font-serif-editorial">
                支持 Cloudflare R2 及兼容 S3 协议存储。保存后即刻热重载生效，无需重启服务。
              </div>
            </div>

            <!-- Cloudflare R2 指南折叠按钮 -->
            <button
              type="button"
              @click="showR2Guide = !showR2Guide"
              class="text-xs font-serif-editorial text-[var(--ink-secondary)] hover:text-[var(--ink-primary)] flex items-center gap-1 cursor-pointer"
            >
              <HelpCircle class="w-3.5 h-3.5 text-[var(--accent-warm)]" />
              <span>获取指南</span>
              <component :is="showR2Guide ? ChevronUp : ChevronDown" class="w-3 h-3" />
            </button>
          </div>

          <!-- R2 配置简明指引展开卡片 -->
          <div
            v-if="showR2Guide"
            class="p-3.5 bg-[var(--bg-archive)] border border-[var(--border-subtle)] rounded-xs text-xs font-serif-editorial text-[var(--ink-secondary)] space-y-1.5 leading-relaxed"
          >
            <div class="font-medium text-[var(--ink-primary)]">3 步快速获取 Cloudflare R2 凭据：</div>
            <ol class="list-decimal list-inside space-y-1 text-[var(--ink-secondary)] pl-1">
              <li>登录 Cloudflare 仪表盘，进入左侧「R2 对象存储」控制台；</li>
              <li>在右侧「账户详细信息」中复制 32 位「账户 ID (Account ID)」，并创建一个存储桶（例如 loose-leaf）；</li>
              <li>点击「管理 R2 API 令牌」->「创建 API 令牌」，权限选择「对象读写」，获取 Access Key ID 与 Secret Access Key。</li>
            </ol>
          </div>

          <!-- 提供商协议切换 -->
          <div class="flex items-center gap-2 p-1 bg-[var(--bg-subtle)] border border-[var(--border-subtle)] rounded-xs text-xs font-serif-editorial">
            <button
              type="button"
              @click="storageProviderType = 'r2'"
              class="flex-1 py-1.5 px-3 rounded-xs transition-all text-center cursor-pointer font-medium"
              :class="
                storageProviderType === 'r2'
                  ? 'bg-[var(--ink-primary)] text-[var(--bg-archive)] shadow-xs'
                  : 'text-[var(--ink-secondary)] hover:text-[var(--ink-primary)]'
              "
            >
              Cloudflare R2 (推荐 · 零出口流量费)
            </button>
            <button
              type="button"
              @click="storageProviderType = 's3'"
              class="flex-1 py-1.5 px-3 rounded-xs transition-all text-center cursor-pointer font-medium"
              :class="
                storageProviderType === 's3'
                  ? 'bg-[var(--ink-primary)] text-[var(--bg-archive)] shadow-xs'
                  : 'text-[var(--ink-secondary)] hover:text-[var(--ink-primary)]'
              "
            >
              自定义 S3 兼容协议 (MinIO / COS / OSS / AWS)
            </button>
          </div>

          <!-- 自定义 S3 常用快捷填充模板 -->
          <div v-if="storageProviderType === 's3'" class="flex items-center gap-1.5 flex-wrap text-xs font-serif-editorial">
            <span class="text-[var(--ink-muted)] text-[11px]">快捷填入预设模板：</span>
            <button
              type="button"
              @click="applyS3Preset('minio')"
              class="px-2 py-0.5 rounded-xs border border-[var(--border-subtle)] hover:border-[var(--ink-primary)] text-[11px] text-[var(--ink-secondary)] cursor-pointer"
            >
              MinIO 本地自建
            </button>
            <button
              type="button"
              @click="applyS3Preset('cos')"
              class="px-2 py-0.5 rounded-xs border border-[var(--border-subtle)] hover:border-[var(--ink-primary)] text-[11px] text-[var(--ink-secondary)] cursor-pointer"
            >
              腾讯云 COS
            </button>
            <button
              type="button"
              @click="applyS3Preset('oss')"
              class="px-2 py-0.5 rounded-xs border border-[var(--border-subtle)] hover:border-[var(--ink-primary)] text-[11px] text-[var(--ink-secondary)] cursor-pointer"
            >
              阿里云 OSS
            </button>
            <button
              type="button"
              @click="applyS3Preset('aws')"
              class="px-2 py-0.5 rounded-xs border border-[var(--border-subtle)] hover:border-[var(--ink-primary)] text-[11px] text-[var(--ink-secondary)] cursor-pointer"
            >
              AWS S3
            </button>
          </div>

          <!-- 表单网格 (2列响应式布局) -->
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 font-serif-editorial">
            <!-- Col 1: Cloudflare Account ID / S3 Endpoint -->
            <div v-if="storageProviderType === 'r2'">
              <label class="block text-xs font-medium text-[var(--ink-secondary)] mb-1">
                Cloudflare 账户 ID (Account ID) <span class="text-rose-600">*</span>
              </label>
              <input
                v-model="storageForm.account_id"
                type="text"
                placeholder="例如 0123456789abcdef0123456789abcdef"
                class="w-full px-3 py-2 bg-[var(--bg-archive)] border border-[var(--border-subtle)] rounded-xs text-xs font-mono-archive text-[var(--ink-primary)] placeholder-[var(--ink-muted)] focus:outline-none focus:border-[var(--ink-primary)] transition-colors"
              />
              <p class="text-[11px] text-[var(--ink-muted)] mt-1 truncate font-mono-archive">
                端点: https://{{ storageForm.account_id || '<账户ID>' }}.r2.cloudflarestorage.com
              </p>
            </div>

            <div v-else>
              <label class="block text-xs font-medium text-[var(--ink-secondary)] mb-1">
                S3 服务端点 (Endpoint) <span class="text-rose-600">*</span>
              </label>
              <input
                v-model="storageForm.endpoint"
                type="text"
                placeholder="例如 https://s3.ap-northeast-1.amazonaws.com"
                class="w-full px-3 py-2 bg-[var(--bg-archive)] border border-[var(--border-subtle)] rounded-xs text-xs font-mono-archive text-[var(--ink-primary)] placeholder-[var(--ink-muted)] focus:outline-none focus:border-[var(--ink-primary)] transition-colors"
              />
              <p class="text-[11px] text-[var(--ink-muted)] mt-1">
                兼容 S3 协议端点（需包含 http:// 或 https:// 协议头）
              </p>
            </div>

            <!-- Col 2: 存储桶名称 -->
            <div>
              <label class="block text-xs font-medium text-[var(--ink-secondary)] mb-1">
                存储桶名称 (Bucket Name) <span class="text-rose-600">*</span>
              </label>
              <input
                v-model="storageForm.bucket_name"
                type="text"
                placeholder="例如 loose-leaf"
                class="w-full px-3 py-2 bg-[var(--bg-archive)] border border-[var(--border-subtle)] rounded-xs text-xs font-mono-archive text-[var(--ink-primary)] placeholder-[var(--ink-muted)] focus:outline-none focus:border-[var(--ink-primary)] transition-colors"
              />
              <p class="text-[11px] text-[var(--ink-muted)] mt-1">
                存储桶名称需全局唯一且符合 S3 命名规范
              </p>
            </div>

            <!-- Col 3: 访问密钥 ID -->
            <div>
              <label class="block text-xs font-medium text-[var(--ink-secondary)] mb-1">
                访问密钥 ID (Access Key ID) <span class="text-rose-600">*</span>
              </label>
              <input
                v-model="storageForm.access_key_id"
                type="text"
                placeholder="例如 0123456789abcdef..."
                class="w-full px-3 py-2 bg-[var(--bg-archive)] border border-[var(--border-subtle)] rounded-xs text-xs font-mono-archive text-[var(--ink-primary)] placeholder-[var(--ink-muted)] focus:outline-none focus:border-[var(--ink-primary)] transition-colors"
              />
            </div>

            <!-- Col 4: 私有访问密钥 (带显隐与已存储安全提示) -->
            <div>
              <div class="flex items-center justify-between mb-1">
                <label class="text-xs font-medium text-[var(--ink-secondary)]">
                  私有访问密钥 (Secret Access Key)
                  <span v-if="!localStorageStatus?.has_secret_key" class="text-rose-600">*</span>
                </label>
                <span v-if="localStorageStatus?.has_secret_key" class="text-[10px] text-emerald-700 dark:text-emerald-400 font-mono-archive">
                  已安全存储
                </span>
              </div>
              <div class="relative">
                <input
                  v-model="storageForm.secret_access_key"
                  :type="showSecretKey ? 'text' : 'password'"
                  :placeholder="localStorageStatus?.has_secret_key ? '已安全存储 (留空表示沿用现有密钥)' : '请输入 Secret Access Key'"
                  class="w-full px-3 py-2 pr-9 bg-[var(--bg-archive)] border border-[var(--border-subtle)] rounded-xs text-xs font-mono-archive text-[var(--ink-primary)] placeholder-[var(--ink-muted)] focus:outline-none focus:border-[var(--ink-primary)] transition-colors"
                />
                <button
                  type="button"
                  @click="showSecretKey = !showSecretKey"
                  class="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--ink-muted)] hover:text-[var(--ink-primary)] transition-colors cursor-pointer"
                  tabindex="-1"
                >
                  <EyeOff v-if="showSecretKey" class="w-3.5 h-3.5" />
                  <Eye v-else class="w-3.5 h-3.5" />
                </button>
              </div>
              <p class="text-[11px] text-[var(--ink-muted)] mt-1">
                密钥仅在服务端安全落盘，API 响应绝不回传明文
              </p>
            </div>

            <!-- Col 5: 公网域名 / 自定义 CDN -->
            <div>
              <label class="block text-xs font-medium text-[var(--ink-secondary)] mb-1">
                公网加速域名 / 自定义 CDN (选填)
              </label>
              <input
                v-model="storageForm.public_domain"
                type="text"
                placeholder="例如 https://media.example.com"
                class="w-full px-3 py-2 bg-[var(--bg-archive)] border border-[var(--border-subtle)] rounded-xs text-xs font-mono-archive text-[var(--ink-primary)] placeholder-[var(--ink-muted)] focus:outline-none focus:border-[var(--ink-primary)] transition-colors"
              />
              <p class="text-[11px] text-[var(--ink-muted)] mt-1">
                若存储桶绑定了自定义域名或开启了公开直链，填入后直链消费；留空则使用临时签名
              </p>
            </div>

            <!-- Col 6: 预签名凭证有效期 -->
            <div>
              <label class="block text-xs font-medium text-[var(--ink-secondary)] mb-1">
                临时预签名访问有效期
              </label>
              <PaperSelect
                v-model="storageForm.presign_expire_seconds"
                :options="presignExpireOptions"
                font="serif"
              />
              <p class="text-[11px] text-[var(--ink-muted)] mt-1">
                各端访问私有多媒体时动态生成的临时访问凭证时效
              </p>
            </div>
          </div>

          <!-- 测试结果与延迟反馈卡片 -->
          <div
            v-if="storageTestResult"
            class="p-3 rounded-xs border text-xs font-serif-editorial flex items-start gap-2.5 transition-all"
            :class="
              storageTestResult.success
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-800 dark:text-emerald-300'
                : 'bg-rose-500/10 border-rose-500/30 text-rose-800 dark:text-rose-300'
            "
          >
            <CheckCircle2 v-if="storageTestResult.success" class="w-4 h-4 shrink-0 text-emerald-600 mt-0.5" />
            <AlertTriangle v-else class="w-4 h-4 shrink-0 text-rose-600 mt-0.5" />
            <div class="flex-1 space-y-0.5 leading-relaxed">
              <div class="font-medium">
                {{ storageTestResult.success ? '对象存储连接握手成功' : '对象存储握手测试未通过' }}
              </div>
              <p class="text-[11px] opacity-90">{{ storageTestResult.message }}</p>
            </div>
          </div>

          <!-- 操作按钮栏 -->
          <div class="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-3 pt-3 border-t border-[var(--border-subtle)]">
            <div>
              <button
                v-if="localStorageStatus?.configured"
                type="button"
                @click="handleResetStorage"
                :disabled="isResettingStorage || isSavingStorage || isTestingStorage"
                class="px-3.5 py-2 border border-rose-500/30 text-rose-700 dark:text-rose-400 hover:bg-rose-500/10 rounded-xs text-xs font-serif-editorial transition-colors cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
              >
                <RotateCcw v-if="!isResettingStorage" class="w-3.5 h-3.5" />
                <Loader2 v-else class="w-3.5 h-3.5 animate-spin" />
                <span>恢复为本地磁盘存储</span>
              </button>
            </div>

            <div class="flex items-center gap-2 justify-end">
              <button
                type="button"
                @click="handleTestStorage"
                :disabled="isTestingStorage || isSavingStorage || isResettingStorage"
                class="px-4 py-2 border border-[var(--border-subtle)] hover:border-[var(--ink-primary)] text-[var(--ink-primary)] rounded-xs text-xs font-serif-editorial transition-colors cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
              >
                <Plug v-if="!isTestingStorage" class="w-3.5 h-3.5 text-[var(--accent-warm)]" />
                <Loader2 v-else class="w-3.5 h-3.5 animate-spin text-[var(--accent-warm)]" />
                <span>测试连通性</span>
              </button>

              <button
                type="button"
                @click="handleSaveStorage"
                :disabled="isSavingStorage || isTestingStorage || isResettingStorage"
                class="px-5 py-2 bg-[var(--ink-primary)] text-[var(--bg-archive)] hover:opacity-90 rounded-xs text-xs font-serif-editorial font-medium transition-opacity cursor-pointer flex items-center gap-1.5 disabled:opacity-50 shadow-xs"
              >
                <Save v-if="!isSavingStorage" class="w-3.5 h-3.5" />
                <Loader2 v-else class="w-3.5 h-3.5 animate-spin" />
                <span>保存并应用</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- ========================================== -->
      <!-- 选项卡 3：文稿与数据导出 (JSON / MD / CSV) -->
      <!-- ========================================== -->
      <div v-else-if="activeTab === 'export'" class="space-y-5">
        <!-- 档案馆现状概览 -->
        <div class="p-4 bg-[var(--bg-subtle)]/70 rounded-xs border border-[var(--border-subtle)] space-y-2 text-xs font-serif-editorial text-[var(--ink-secondary)]">
          <div class="text-[var(--ink-primary)] font-medium">当前生活档案资产指标</div>
          <div class="grid grid-cols-3 gap-2.5 pt-1 text-center">
            <div class="p-3 border border-[var(--border-subtle)] rounded-xs bg-[var(--bg-archive)]">
              <div class="text-lg text-[var(--accent-warm)] font-medium font-serif-editorial">{{ entries.length }}</div>
              <div class="text-[11px] text-[var(--ink-muted)]">生活印记</div>
            </div>
            <div class="p-3 border border-[var(--border-subtle)] rounded-xs bg-[var(--bg-archive)]">
              <div class="text-lg text-[var(--ink-primary)] font-medium font-serif-editorial">{{ transactions.length }}</div>
              <div class="text-[11px] text-[var(--ink-muted)]">日常账目</div>
            </div>
            <div class="p-3 border border-[var(--border-subtle)] rounded-xs bg-[var(--bg-archive)]">
              <div class="text-lg text-[var(--accent-moss)] font-medium font-serif-editorial">{{ projects.length }}</div>
              <div class="text-[11px] text-[var(--ink-muted)]">造物项目</div>
            </div>
          </div>
        </div>

        <!-- 三种格式导出选项卡 -->
        <div class="space-y-3">
          <!-- 1. JSON 完整备份 -->
          <div
            class="p-4 border border-[var(--border-subtle)] hover:border-[var(--ink-primary)]/50 rounded-xs bg-[var(--bg-archive)] transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-3 group"
          >
            <div class="space-y-1 max-w-full sm:max-w-[70%]">
              <div class="flex items-center gap-2 font-serif-editorial text-sm font-medium text-[var(--ink-primary)]">
                <FileJson class="w-4 h-4 text-[var(--accent-warm)]" />
                <span>全量结构化 JSON 数据备份</span>
              </div>
              <p class="text-xs text-[var(--ink-muted)] font-serif-editorial leading-relaxed">
                包含条目、附件列表、记账、项目与主理人配置的完整结构化对象，供二次开发或跨平台导入。
              </p>
            </div>
            <button
              @click="handleExportJSON"
              class="px-4 py-2 text-xs font-serif-editorial font-medium border border-[var(--ink-primary)] bg-[var(--ink-primary)] text-[var(--bg-archive)] hover:opacity-90 rounded-xs cursor-pointer flex items-center justify-center gap-1.5 transition-all shadow-xs shrink-0 self-start sm:self-auto"
            >
              <component :is="downloadedType === 'json' ? Check : Download" class="w-3.5 h-3.5" />
              <span>{{ downloadedType === 'json' ? '已导出' : '导出 JSON' }}</span>
            </button>
          </div>

          <!-- 2. Markdown 日记文稿 -->
          <div
            class="p-4 border border-[var(--border-subtle)] hover:border-[var(--ink-primary)]/50 rounded-xs bg-[var(--bg-archive)] transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-3 group"
          >
            <div class="space-y-1 max-w-full sm:max-w-[70%]">
              <div class="flex items-center gap-2 font-serif-editorial text-sm font-medium text-[var(--ink-primary)]">
                <FileText class="w-4 h-4 text-[var(--accent-moss)]" />
                <span>生活手账 Markdown 实体文稿</span>
              </div>
              <p class="text-xs text-[var(--ink-muted)] font-serif-editorial leading-relaxed">
                所有生活日常、思考与底片手记，自动排版为标准 Markdown 纯文本，适合本地 Obsidian / Logseq 沉淀。
              </p>
            </div>
            <button
              @click="handleExportMarkdown"
              class="px-4 py-2 text-xs font-serif-editorial border border-[var(--border-subtle)] hover:border-[var(--ink-primary)] rounded-xs cursor-pointer flex items-center justify-center gap-1.5 transition-all text-[var(--ink-primary)] shrink-0 self-start sm:self-auto"
            >
              <component :is="downloadedType === 'markdown' ? Check : Download" class="w-3.5 h-3.5" />
              <span>{{ downloadedType === 'markdown' ? '已导出' : '导出 .md' }}</span>
            </button>
          </div>

          <!-- 3. CSV 记账表格 -->
          <div
            class="p-4 border border-[var(--border-subtle)] hover:border-[var(--ink-primary)]/50 rounded-xs bg-[var(--bg-archive)] transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-3 group"
          >
            <div class="space-y-1 max-w-full sm:max-w-[70%]">
              <div class="flex items-center gap-2 font-serif-editorial text-sm font-medium text-[var(--ink-primary)]">
                <FileSpreadsheet class="w-4 h-4 text-amber-700" />
                <span>财务记账流水 CSV 表格</span>
              </div>
              <p class="text-xs text-[var(--ink-muted)] font-serif-editorial leading-relaxed">
                包含 UTF-8 BOM 标头，Excel 与 Numbers 打开无乱码，适合月度收支对账与税务统计。
              </p>
            </div>
            <button
              @click="handleExportCSV"
              class="px-4 py-2 text-xs font-serif-editorial border border-[var(--border-subtle)] hover:border-[var(--ink-primary)] rounded-xs cursor-pointer flex items-center justify-center gap-1.5 transition-all text-[var(--ink-primary)] shrink-0 self-start sm:self-auto"
            >
              <component :is="downloadedType === 'csv' ? Check : Download" class="w-3.5 h-3.5" />
              <span>{{ downloadedType === 'csv' ? '已导出' : '导出 CSV' }}</span>
            </button>
          </div>
        </div>
      </div>

      <!-- 底部版权与数据自主权承诺 -->
      <div class="pt-4 border-t border-[var(--border-subtle)] text-xs font-serif-editorial text-[var(--ink-muted)] text-center">
        “数据 100% 属于你，永远可导出，永远不被平台绑架。”
      </div>
    </div>
  </div>
</template>
