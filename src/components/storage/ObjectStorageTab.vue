<script setup lang="ts">
import { ref, watch } from 'vue'
import {
  AlertTriangle,
  CheckCircle2,
  Eye,
  EyeOff,
  HardDrive,
  Loader2,
  Plug,
  RefreshCw,
  RotateCcw,
  Save,
} from 'lucide-vue-next'
import type { StorageConfigPayload, StorageStatus } from '../../types'
import { askConfirm } from '../../composables/useConfirm'
import { formatBytes } from '../../utils/format'
import PaperSelect, { type PaperSelectOption } from '../PaperSelect.vue'
import {
  fetchStorageStatus,
  getAdminToken,
  migrateStorageMedia,
  resetStorageConfig,
  testStorageConfig,
  updateStorageConfig,
} from '../../utils/api'

const props = defineProps<{
  storageStatus: StorageStatus | null
  isLoadingList: boolean
}>()

const emit = defineEmits<{
  (e: 'update:storageStatus', status: StorageStatus | null): void
  (e: 'requestAuth'): void
  (e: 'alert', payload: { type: 'success' | 'error'; text: string }): void
}>()

const storageProviderType = ref<'r2' | 's3'>('r2')
const showSecretKey = ref(false)
const isTestingStorage = ref(false)
const isSavingStorage = ref(false)
const isResettingStorage = ref(false)
const isMigratingMedia = ref(false)
const storageTestResult = ref<{ success: boolean; message: string; latency_ms?: number } | null>(null)
const mediaSyncResult = ref<{ uploaded_to_r2: number; downloaded_to_local: number; message: string } | null>(null)

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
  () => props.storageStatus,
  (newVal) => {
    if (newVal) {
      syncFormWithStatus(newVal)
    }
  },
  { immediate: true },
)

const switchProvider = (type: 'r2' | 's3') => {
  if (storageProviderType.value === type) return
  storageProviderType.value = type
  if (type === 'r2') {
    storageForm.value.endpoint = ''
  } else {
    storageForm.value.account_id = ''
  }
}

/**
 * 统一校验并构造对象存储配置载荷，消除连通性测试与保存配置之间的双写重复
 */
const validateAndBuildStoragePayload = ():
  | { ok: true; payload: StorageConfigPayload }
  | { ok: false; error: string } => {
  if (!storageForm.value.bucket_name?.trim()) {
    return { ok: false, error: '请填写存储桶名称 (Bucket Name)' }
  }
  if (!storageForm.value.access_key_id?.trim()) {
    return { ok: false, error: '请填写 Access Key ID' }
  }
  if (
    storageProviderType.value === 'r2' &&
    !storageForm.value.account_id?.trim() &&
    !storageForm.value.endpoint?.trim()
  ) {
    return { ok: false, error: '请填写 Cloudflare Account ID 或自定义 Endpoint' }
  }
  if (storageProviderType.value === 's3' && !storageForm.value.endpoint?.trim()) {
    return { ok: false, error: '请填写 S3 Endpoint 服务端点' }
  }
  if (!storageForm.value.secret_access_key?.trim() && !props.storageStatus?.has_secret_key) {
    return { ok: false, error: '请填写 Secret Access Key' }
  }

  const accountId = storageForm.value.account_id?.trim()
  const rawEndpoint = storageForm.value.endpoint?.trim()
  const resolvedEndpoint =
    storageProviderType.value === 'r2' && accountId && !rawEndpoint
      ? `https://${accountId}.r2.cloudflarestorage.com`
      : rawEndpoint

  return {
    ok: true,
    payload: {
      ...storageForm.value,
      account_id: accountId,
      access_key_id: storageForm.value.access_key_id?.trim(),
      secret_access_key: storageForm.value.secret_access_key?.trim(),
      bucket_name: storageForm.value.bucket_name?.trim(),
      endpoint: resolvedEndpoint,
      public_domain: storageForm.value.public_domain?.trim(),
      presign_expire_seconds: Number(storageForm.value.presign_expire_seconds) || 1800,
    },
  }
}

const handleMigrateStorageMedia = async () => {
  if (isMigratingMedia.value) return
  isMigratingMedia.value = true
  mediaSyncResult.value = null
  try {
    const res = await migrateStorageMedia()
    mediaSyncResult.value = res
    emit('alert', {
      type: 'success',
      text: `已上传 ${res.uploaded_to_r2 ?? 0} 项至云端，已拉取 ${res.downloaded_to_local ?? 0} 项至本地`,
    })
    try {
      emit('update:storageStatus', await fetchStorageStatus())
    } catch {}
  } catch (err: any) {
    emit('alert', { type: 'error', text: err?.message || '双向同步媒体失败' })
  } finally {
    isMigratingMedia.value = false
  }
}

const handleTestStorage = async () => {
  if (isTestingStorage.value) return
  if (!getAdminToken()) {
    emit('requestAuth')
    return
  }
  storageTestResult.value = null

  const validated = validateAndBuildStoragePayload()
  if (!validated.ok) {
    emit('alert', { type: 'error', text: validated.error })
    return
  }

  isTestingStorage.value = true
  try {
    const res = await testStorageConfig(validated.payload)
    const latencyInfo = res.latency_ms ? ` · 往返延迟 ${res.latency_ms}ms` : ''
    storageTestResult.value = {
      success: true,
      message: `${res.message || '握手测试成功，读写校验正常'}${latencyInfo}`,
      latency_ms: res.latency_ms,
    }
  } catch (err: any) {
    storageTestResult.value = {
      success: false,
      message: err?.message || '连接测试失败，请检查 Endpoint、凭据及存储桶名称',
    }
  } finally {
    isTestingStorage.value = false
  }
}

const handleSaveStorage = async () => {
  if (isSavingStorage.value) return
  if (!getAdminToken()) {
    emit('requestAuth')
    return
  }

  const validated = validateAndBuildStoragePayload()
  if (!validated.ok) {
    emit('alert', { type: 'error', text: validated.error })
    return
  }

  isSavingStorage.value = true
  try {
    const updatedStatus = await updateStorageConfig(validated.payload)
    emit('update:storageStatus', updatedStatus)
    storageForm.value.secret_access_key = ''
    storageTestResult.value = {
      success: true,
      message: '配置已保存并生效，对象存储已成功热重载挂载',
    }
    emit('alert', { type: 'success', text: '对象存储配置已保存并生效' })
  } catch (err: any) {
    emit('alert', { type: 'error', text: err?.message || '保存配置失败' })
  } finally {
    isSavingStorage.value = false
  }
}

const handleResetStorage = async () => {
  const confirmed = await askConfirm({
    title: '切换为本地磁盘存储',
    message:
      '确定要关闭云端对象存储并恢复为本地磁盘存储模式吗？新上传的文件将直接保存在服务端本地磁盘 (/media)。',
    confirmText: '确认恢复本地存储',
    cancelText: '取消',
    danger: true,
  })
  if (!confirmed) return

  isResettingStorage.value = true
  try {
    const updatedStatus = await resetStorageConfig()
    emit('update:storageStatus', updatedStatus)
    storageForm.value.secret_access_key = ''
    storageTestResult.value = null
    emit('alert', { type: 'success', text: '已恢复为本地磁盘存储模式' })
  } catch (err: any) {
    emit('alert', { type: 'error', text: err?.message || '重置失败' })
  } finally {
    isResettingStorage.value = false
  }
}
</script>

<template>
  <div class="space-y-4">
    <!-- 存储状态概要条 -->
    <div class="p-3.5 bg-[var(--bg-subtle)]/50 rounded-xs border border-[var(--border-subtle)] flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs font-serif-editorial">
      <div class="flex flex-wrap items-center gap-2">
        <span class="text-[var(--ink-muted)]">当前存储：</span>
        <span
          v-if="storageStatus?.configured"
          class="text-emerald-700 dark:text-emerald-400 flex items-center gap-1 font-medium"
        >
          <CheckCircle2 class="w-3.5 h-3.5" />
          <span>{{ storageStatus?.provider || 'Cloudflare R2' }} (已挂载)</span>
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
          媒体文件 {{ storageStatus?.local_file_count || 0 }} 件 ({{ formatBytes(storageStatus?.local_total_bytes || 0) }})
        </span>
      </div>

      <div v-if="storageStatus?.configured" class="flex items-center gap-2">
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

    <div
      v-if="isLoadingList && !storageStatus"
      class="p-8 text-center text-xs font-serif-editorial text-[var(--ink-muted)] border border-dashed border-[var(--border-subtle)] rounded-xs"
    >
      正在读取存储配置…
    </div>

    <div
      v-else
      class="p-4 sm:p-5 bg-[var(--bg-subtle)]/40 rounded-xs border border-[var(--border-subtle)] space-y-4"
    >
      <div class="flex items-center justify-between pb-1">
        <span class="font-serif-editorial text-sm font-medium text-[var(--ink-primary)]">
          对象存储接入凭据
        </span>
        <div class="flex items-center gap-1 p-0.5 bg-[var(--bg-archive)] border border-[var(--border-subtle)] rounded-xs text-xs font-serif-editorial">
          <button
            type="button"
            @click="switchProvider('r2')"
            class="py-1 px-2.5 rounded-xs transition-all cursor-pointer font-medium"
            :class="storageProviderType === 'r2' ? 'bg-[var(--ink-primary)] text-[var(--bg-archive)]' : 'text-[var(--ink-secondary)] hover:text-[var(--ink-primary)]'"
          >
            Cloudflare R2
          </button>
          <button
            type="button"
            @click="switchProvider('s3')"
            class="py-1 px-2.5 rounded-xs transition-all cursor-pointer font-medium"
            :class="storageProviderType === 's3' ? 'bg-[var(--ink-primary)] text-[var(--bg-archive)]' : 'text-[var(--ink-secondary)] hover:text-[var(--ink-primary)]'"
          >
            S3 兼容协议
          </button>
        </div>
      </div>

      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3.5 font-serif-editorial">
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

        <div>
          <div class="flex items-center justify-between mb-1">
            <label class="text-xs text-[var(--ink-secondary)]">
              私有访问密钥
              <span v-if="!storageStatus?.has_secret_key" class="text-rose-600">*</span>
            </label>
            <span v-if="storageStatus?.has_secret_key" class="text-[11px] text-emerald-700 dark:text-emerald-400 font-mono-archive">
              已保存
            </span>
          </div>
          <div class="relative">
            <input
              v-model="storageForm.secret_access_key"
              :type="showSecretKey ? 'text' : 'password'"
              :placeholder="storageStatus?.has_secret_key ? '留空保持不变' : ''"
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

      <div
        class="min-h-[64px] flex items-center transition-opacity duration-200"
        :class="storageTestResult ? 'opacity-100' : 'opacity-0'"
        role="alert"
        aria-live="polite"
      >
        <div
          v-if="storageTestResult"
          class="w-full p-3 rounded-xs border text-xs font-serif-editorial flex items-start gap-2.5"
          :class="
            storageTestResult.success
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-800 dark:text-emerald-300'
              : 'bg-rose-500/10 border-rose-500/30 text-rose-800 dark:text-rose-300'
          "
        >
          <CheckCircle2 v-if="storageTestResult.success" class="w-4 h-4 shrink-0 text-emerald-600 mt-0.5" />
          <AlertTriangle v-else class="w-4 h-4 shrink-0 text-rose-600 mt-0.5" />
          <div class="flex-1 min-w-0 space-y-0.5 leading-relaxed">
            <div class="font-medium">
              {{ storageTestResult.success ? '对象存储连接握手成功' : '对象存储握手测试未通过' }}
            </div>
            <p class="text-[11px] opacity-90 truncate">{{ storageTestResult.message }}</p>
          </div>
        </div>
      </div>

      <div class="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-3 pt-3 border-t border-[var(--border-subtle)]">
        <div>
          <button
            v-if="storageStatus?.configured"
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
</template>
