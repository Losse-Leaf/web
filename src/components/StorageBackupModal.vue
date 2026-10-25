<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import {
  X,
  Download,
  Check,
  Archive,
  RotateCcw,
  Upload,
  RefreshCw,
  Cloud,
  HardDrive,
  Loader2,
  AlertTriangle,
  CheckCircle2,
  Eye,
  EyeOff,
  Save,
  Plug,
  Trash2,
  FolderArchive,
  Server,
} from 'lucide-vue-next'
import type { LifeEntry, Transaction, Project, BackupItem, StorageStatus, StorageConfigPayload } from '../types'
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
import { useBodyScrollLock } from '../composables/useBodyScrollLock'

const props = withDefaults(
  defineProps<{
    isOpen: boolean
    initialTab?: 'backup' | 'storage'
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
  (e: 'requestAuth', callback?: () => void): void
}>()

// 激活选项卡：'backup' (全量快照与灾备) | 'storage' (对象存储设置)
const activeTab = ref<'backup' | 'storage'>(props.initialTab)

watch(
  () => props.initialTab,
  (newTab) => {
    if (newTab) activeTab.value = newTab
  }
)

// 2. 灾备状态与列表
const backups = ref<BackupItem[]>([])
const localStorageStatus = ref<StorageStatus | null>(props.storageStatus || null)
const isLoadingList = ref(false)
const loadError = ref('')
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

// 备份保留上限（DEC-05：每 6 小时一份 × 12 份 ≈ 3 天历史深度）。
// 后端 /system/backup/list 响应未携带上限字段，暂以常量对齐；若后端下发请替换为接口值。
const MAX_BACKUP_RETENTION = 12

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
      // 全站时间口径为中国北京时间，不能跟随浏览器本地时区。
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
  loadError.value = ''
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
    // 两个都失败才是「真的没加载出来」；只失败一个时另一块仍可正常使用。
    if (listRes.status === 'rejected' && statusRes.status === 'rejected') {
      loadError.value = listRes.reason?.message || statusRes.reason?.message || '灾备数据加载失败'
    }
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
    await clearApiCache()
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
    await clearApiCache()
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
    emit('requestAuth', () => handleTestStorage())
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
    emit('requestAuth', () => handleSaveStorage())
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

  // MOB-P1-66：弹窗打开期间锁定背景页面滚动（此前只有灯箱锁了）
  useBodyScrollLock(() => props.isOpen)
</script>

<template>
  <div
    v-if="isOpen"
    role="dialog"
    aria-modal="true"
    aria-label="存储设置与灾备中枢"
    class="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/55 backdrop-blur-xs transition-opacity duration-200"
    @click.self="emit('close')"
  >
    <div
      class="w-full max-w-3xl bg-[var(--bg-archive)] border border-[var(--border-subtle)] rounded-xs shadow-2xl p-5 sm:p-7 text-left space-y-5 max-h-[92dvh] overflow-y-auto animate-in fade-in zoom-in-95 duration-200 pb-[max(1.5rem,env(safe-area-inset-bottom,1.5rem))]"
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
          aria-label="关闭存储设置"
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
            class="px-1.5 py-0.2 rounded-xs text-[11px] font-mono-archive"
            :class="activeTab === 'backup' ? 'bg-white/20 text-white' : 'bg-[var(--bg-subtle)] text-[var(--ink-muted)]'"
          >
            {{ backups.length }}/{{ MAX_BACKUP_RETENTION }}
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
      <div v-if="activeTab === 'backup'" class="space-y-5">
        <!-- 策略状态简报与操作条 -->
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3.5 p-4 bg-[var(--bg-subtle)]/50 border border-[var(--border-subtle)] rounded-xs">
          <div class="space-y-1">
            <div class="flex items-center gap-2">
              <span class="font-serif-editorial text-sm font-medium text-[var(--ink-primary)]">
                全量数据快照归档
              </span>
              <span class="px-1.5 py-0.2 rounded-xs text-[11px] font-mono-archive bg-[var(--bg-archive)] border border-[var(--border-subtle)] text-[var(--ink-muted)]">
                {{ backups.length }}/{{ MAX_BACKUP_RETENTION }} 份
              </span>
            </div>
            <p class="text-xs text-[var(--ink-muted)] leading-relaxed font-serif-editorial">
              每 6 小时自动备份 · 累计占用 {{ formatBytes(totalBackupBytes) }} · 目的地：{{ localStorageStatus?.configured ? 'Cloudflare R2' : '本地存储' }}
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
              <span>{{ isCreatingBackup ? '正在生成...' : '立即生成快照' }}</span>
            </button>
          </div>
        </div>

        <!-- 现有快照清单列表 -->
        <div class="space-y-3">
          <div class="flex items-center justify-between text-xs text-[var(--ink-muted)]">
            <span class="font-serif-editorial font-medium text-[var(--ink-primary)]">
              历史快照归档清单 ({{ backups.length }}/{{ MAX_BACKUP_RETENTION }})
            </span>
            <span class="font-serif-editorial text-[11px]">按时间倒序 · 独立可移植</span>
          </div>

          <div
            v-if="loadError"
            class="p-3 rounded-xs border border-rose-500/30 bg-rose-500/10 text-xs text-rose-800 dark:text-rose-300 flex items-center gap-2"
          >
            <AlertTriangle class="w-4 h-4 shrink-0" />
            <span class="flex-1">{{ loadError }}</span>
            <button type="button" class="underline cursor-pointer" @click="loadData">重试</button>
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
              可点击上方「立即生成快照」创建首份完整全量备份，或静候系统每 6 小时自动打包归档。
            </div>
          </div>

          <!-- 快照条目列表 -->
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

          <!-- 拖拽上传与选定展示区 -->
          <div
            @dragover.prevent="isDragging = true"
            @dragleave.prevent="isDragging = false"
            @drop.prevent="onFileDrop"
            class="p-3.5 border rounded-xs transition-all"
            :class="[
              isDragging ? 'border-[var(--ink-primary)] bg-[var(--bg-subtle)]' : 'border-dashed border-[var(--border-subtle)] bg-[var(--bg-subtle)]/30',
            ]"
          >
            <!-- 尚未选择文件状态 -->
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

            <!-- 已选定待恢复文件预览 -->
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
      <div v-else-if="activeTab === 'storage'" class="space-y-4">
        <!-- 存储状态概要条 -->
        <div class="p-3.5 bg-[var(--bg-subtle)]/50 rounded-xs border border-[var(--border-subtle)] flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs font-serif-editorial">
          <div class="flex flex-wrap items-center gap-2">
            <span class="text-[var(--ink-muted)]">当前存储：</span>
            <span
              v-if="localStorageStatus?.configured"
              class="text-emerald-700 dark:text-emerald-400 flex items-center gap-1 font-medium"
            >
              <CheckCircle2 class="w-3.5 h-3.5" />
              <span>{{ localStorageStatus?.provider || 'Cloudflare R2' }} (已挂载)</span>
            </span>
            <span
              v-else
              class="text-[var(--ink-secondary)] flex items-center gap-1 font-medium"
            >
              <HardDrive class="w-3.5 h-3.5 text-[var(--accent-warm)]" />
              <span>本地磁盘存储 (/media)</span>
            </span>
            <span class="text-[var(--ink-muted)]">·</span>
            <span class="text-[var(--ink-muted)] font-mono-archive">
              媒体文件 {{ localStorageStatus?.local_file_count || 0 }} 件 ({{ formatBytes(localStorageStatus?.local_total_bytes || 0) }})
            </span>
          </div>

          <div v-if="localStorageStatus?.configured" class="flex items-center gap-2">
            <span v-if="mediaSyncResult" class="text-[11px] font-mono-archive text-emerald-700 dark:text-emerald-400">
              已同步：上传 {{ mediaSyncResult.uploaded_to_r2 ?? 0 }} / 拉取 {{ mediaSyncResult.downloaded_to_local ?? 0 }}
            </span>
            <button
              type="button"
              @click="handleMigrateStorageMedia"
              :disabled="isMigratingMedia"
              class="px-2.5 py-1 border border-[var(--border-subtle)] hover:border-[var(--ink-primary)] bg-[var(--bg-archive)] text-[var(--ink-primary)] rounded-xs text-xs transition-colors cursor-pointer flex items-center gap-1 disabled:opacity-50"
            >
              <RefreshCw class="w-3 h-3 text-[var(--accent-warm)]" :class="{ 'animate-spin': isMigratingMedia }" />
              <span>{{ isMigratingMedia ? '同步中...' : '双向同步媒体' }}</span>
            </button>
          </div>
        </div>

        <!-- 首次拉取完成前不渲染表单：否则用户抢先输入的凭据会被随后到达的
             /storage/status 覆盖（父组件已不再预取）。 -->
        <div
          v-if="isLoadingList && !localStorageStatus"
          class="p-8 text-center text-xs font-serif-editorial text-[var(--ink-muted)] border border-dashed border-[var(--border-subtle)] rounded-xs"
        >
          正在读取存储配置…
        </div>

        <!-- 存储配置表单 -->
        <div
          v-else
          class="p-4 sm:p-5 bg-[var(--bg-subtle)]/40 rounded-xs border border-[var(--border-subtle)] space-y-4"
        >
          <div class="flex items-center justify-between pb-1">
            <span class="font-serif-editorial text-sm font-medium text-[var(--ink-primary)]">
              对象存储接入凭据
            </span>
            <!-- 模式切换 -->
            <div class="flex items-center gap-1 p-0.5 bg-[var(--bg-archive)] border border-[var(--border-subtle)] rounded-xs text-xs font-serif-editorial">
              <button
                type="button"
                @click="storageProviderType = 'r2'"
                class="py-1 px-2.5 rounded-xs transition-all cursor-pointer font-medium"
                :class="storageProviderType === 'r2' ? 'bg-[var(--ink-primary)] text-[var(--bg-archive)]' : 'text-[var(--ink-secondary)] hover:text-[var(--ink-primary)]'"
              >
                Cloudflare R2
              </button>
              <button
                type="button"
                @click="storageProviderType = 's3'"
                class="py-1 px-2.5 rounded-xs transition-all cursor-pointer font-medium"
                :class="storageProviderType === 's3' ? 'bg-[var(--ink-primary)] text-[var(--bg-archive)]' : 'text-[var(--ink-secondary)] hover:text-[var(--ink-primary)]'"
              >
                S3 兼容协议
              </button>
            </div>
          </div>

          <!-- 表单网格 -->
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3.5 font-serif-editorial">
            <!-- Col 1: Account ID / Endpoint -->
            <div v-if="storageProviderType === 'r2'">
              <label class="block text-xs text-[var(--ink-secondary)] mb-1">
                Cloudflare 账户 ID <span class="text-rose-600">*</span>
              </label>
              <input
                v-model="storageForm.account_id"
                type="text"
                placeholder="Cloudflare 控制台中的 32 位账户 ID"
                class="w-full px-3 py-1.5 bg-[var(--bg-archive)] border border-[var(--border-subtle)] rounded-xs text-xs font-mono-archive text-[var(--ink-primary)] placeholder-[var(--ink-muted)] focus:outline-none focus:border-[var(--ink-primary)]"
              />
            </div>
            <div v-else>
              <label class="block text-xs text-[var(--ink-secondary)] mb-1">
                S3 服务端点 <span class="text-rose-600">*</span>
              </label>
              <input
                v-model="storageForm.endpoint"
                type="text"
                placeholder="https://s3.ap-northeast-1.amazonaws.com"
                class="w-full px-3 py-1.5 bg-[var(--bg-archive)] border border-[var(--border-subtle)] rounded-xs text-xs font-mono-archive text-[var(--ink-primary)] placeholder-[var(--ink-muted)] focus:outline-none focus:border-[var(--ink-primary)]"
              />
            </div>

            <!-- Col 2: 存储桶名称 -->
            <div>
              <label class="block text-xs text-[var(--ink-secondary)] mb-1">
                存储桶名称 <span class="text-rose-600">*</span>
              </label>
              <input
                v-model="storageForm.bucket_name"
                type="text"
                class="w-full px-3 py-1.5 bg-[var(--bg-archive)] border border-[var(--border-subtle)] rounded-xs text-xs font-mono-archive text-[var(--ink-primary)] placeholder-[var(--ink-muted)] focus:outline-none focus:border-[var(--ink-primary)]"
              />
            </div>

            <!-- Col 3: Access Key ID -->
            <div>
              <label class="block text-xs text-[var(--ink-secondary)] mb-1">
                访问密钥 ID <span class="text-rose-600">*</span>
              </label>
              <input
                v-model="storageForm.access_key_id"
                type="text"
                class="w-full px-3 py-1.5 bg-[var(--bg-archive)] border border-[var(--border-subtle)] rounded-xs text-xs font-mono-archive text-[var(--ink-primary)] placeholder-[var(--ink-muted)] focus:outline-none focus:border-[var(--ink-primary)]"
              />
            </div>

            <!-- Col 4: Secret Access Key -->
            <div>
              <div class="flex items-center justify-between mb-1">
                <label class="text-xs text-[var(--ink-secondary)]">
                  私有访问密钥
                  <span v-if="!localStorageStatus?.has_secret_key" class="text-rose-600">*</span>
                </label>
                <span v-if="localStorageStatus?.has_secret_key" class="text-[11px] text-emerald-700 dark:text-emerald-400 font-mono-archive">
                  已保存
                </span>
              </div>
              <div class="relative">
                <input
                  v-model="storageForm.secret_access_key"
                  :type="showSecretKey ? 'text' : 'password'"
                  :placeholder="localStorageStatus?.has_secret_key ? '留空保持不变' : ''"
                  class="w-full px-3 py-1.5 pr-8 bg-[var(--bg-archive)] border border-[var(--border-subtle)] rounded-xs text-xs font-mono-archive text-[var(--ink-primary)] placeholder-[var(--ink-muted)] focus:outline-none focus:border-[var(--ink-primary)]"
                />
                <button
                  type="button"
                  @click="showSecretKey = !showSecretKey"
                  class="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--ink-muted)] hover:text-[var(--ink-primary)] transition-colors cursor-pointer"
                  tabindex="-1"
                >
                  <EyeOff v-if="showSecretKey" class="w-3.5 h-3.5" />
                  <Eye v-else class="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            <!-- Col 5: 公网域名 -->
            <div>
              <label class="block text-xs text-[var(--ink-secondary)] mb-1">
                公网加速域名
              </label>
              <input
                v-model="storageForm.public_domain"
                type="text"
                placeholder="https://media.example.com"
                class="w-full px-3 py-1.5 bg-[var(--bg-archive)] border border-[var(--border-subtle)] rounded-xs text-xs font-mono-archive text-[var(--ink-primary)] placeholder-[var(--ink-muted)] focus:outline-none focus:border-[var(--ink-primary)]"
              />
            </div>

            <!-- Col 6: 有效期 -->
            <div>
              <label class="block text-xs text-[var(--ink-secondary)] mb-1">
                临时链接有效期
              </label>
              <PaperSelect
                v-model="storageForm.presign_expire_seconds"
                :options="presignExpireOptions"
                font="serif"
              />
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
                class="px-3 py-1.5 border border-rose-500/30 text-rose-700 dark:text-rose-400 hover:bg-rose-500/10 rounded-xs text-xs font-serif-editorial transition-colors cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
              >
                <RotateCcw v-if="!isResettingStorage" class="w-3.5 h-3.5" />
                <Loader2 v-else class="w-3.5 h-3.5 animate-spin" />
                <span>恢复为本地存储</span>
              </button>
            </div>

            <div class="flex items-center gap-2 justify-end">
              <button
                type="button"
                @click="handleTestStorage"
                :disabled="isTestingStorage || isSavingStorage || isResettingStorage"
                class="px-3.5 py-1.5 border border-[var(--border-subtle)] hover:border-[var(--ink-primary)] text-[var(--ink-primary)] rounded-xs text-xs font-serif-editorial transition-colors cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
              >
                <Plug v-if="!isTestingStorage" class="w-3.5 h-3.5 text-[var(--accent-warm)]" />
                <Loader2 v-else class="w-3.5 h-3.5 animate-spin text-[var(--accent-warm)]" />
                <span>测试连通性</span>
              </button>

              <button
                type="button"
                @click="handleSaveStorage"
                :disabled="isSavingStorage || isTestingStorage || isResettingStorage"
                class="px-4 py-1.5 bg-[var(--ink-primary)] text-[var(--bg-archive)] hover:opacity-90 rounded-xs text-xs font-serif-editorial font-medium transition-opacity cursor-pointer flex items-center gap-1.5 disabled:opacity-50 shadow-xs"
              >
                <Save v-if="!isSavingStorage" class="w-3.5 h-3.5" />
                <Loader2 v-else class="w-3.5 h-3.5 animate-spin" />
                <span>保存配置</span>
              </button>
            </div>
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
