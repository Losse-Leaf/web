<script setup lang="ts">
import { ref, onMounted, watch } from 'vue'
import {
  AlertTriangle,
  Archive,
  Check,
  Globe,
  HardDrive,
  Server,
  X,
} from 'lucide-vue-next'
import type { BackupItem, SiteConfig, StorageStatus } from '../types'
import {
  fetchBackupList,
  fetchSiteConfig,
  fetchStorageStatus,
} from '../utils/api'
import { useBodyScrollLock } from '../composables/useBodyScrollLock'
import { useEscapeClose } from '../composables/useEscapeClose'
import BackupSnapshotTab from './storage/BackupSnapshotTab.vue'
import ObjectStorageTab from './storage/ObjectStorageTab.vue'
import ArchiveVisibilityTab from './storage/ArchiveVisibilityTab.vue'

const props = withDefaults(
  defineProps<{
    isOpen: boolean
    initialTab?: 'backup' | 'storage' | 'visibility'
  }>(),
  {
    initialTab: 'backup',
  },
)

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'restored'): void
  (e: 'configUpdated', config: SiteConfig): void
  (e: 'requestAuth'): void
}>()

const MAX_BACKUP_RETENTION = 12

const activeTab = ref<'backup' | 'storage' | 'visibility'>(props.initialTab)
const backups = ref<BackupItem[]>([])
const localStorageStatus = ref<StorageStatus | null>(null)
const isLoadingList = ref(false)
const loadError = ref('')

const publicModules = ref<string[]>([])
const isLoadingVisibility = ref(false)
let visibilityLoadSeq = 0

const alertMessage = ref<{ type: 'success' | 'error'; text: string } | null>(null)

const showAlertMsg = (payload: { type: 'success' | 'error'; text: string }) => {
  alertMessage.value = payload
  setTimeout(() => {
    if (alertMessage.value?.text === payload.text) {
      alertMessage.value = null
    }
  }, 5000)
}

const loadVisibilityConfig = async () => {
  const seq = ++visibilityLoadSeq
  isLoadingVisibility.value = true
  try {
    const cfg = await fetchSiteConfig()
    if (seq !== visibilityLoadSeq) return
    publicModules.value = Array.isArray(cfg?.public_modules) ? [...cfg.public_modules] : []
  } catch (err) {
    console.error('Failed to load site visibility config:', err)
  } finally {
    if (seq === visibilityLoadSeq) {
      isLoadingVisibility.value = false
    }
  }
}

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
    if (listRes.status === 'rejected' && statusRes.status === 'rejected') {
      loadError.value = listRes.reason?.message || statusRes.reason?.message || '灾备数据加载失败'
    }
  } finally {
    isLoadingList.value = false
  }
}

watch(
  [() => props.isOpen, () => props.initialTab],
  ([open, nextTab]) => {
    if (open && nextTab) {
      activeTab.value = nextTab
    }
  },
  { immediate: true },
)

// 修复直接以 openStorageBackup('visibility') 打开时未拉取 public_modules 导致误覆盖为空数组的缺陷
watch(
  [() => props.isOpen, activeTab],
  ([open, tab]) => {
    if (open && tab === 'visibility') {
      loadVisibilityConfig()
    }
  },
  { immediate: true },
)

onMounted(() => {
  loadData()
  if (activeTab.value !== 'visibility') {
    loadVisibilityConfig()
  }
})

useBodyScrollLock(() => props.isOpen)
useEscapeClose(() => props.isOpen, () => emit('close'))
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
          type="button"
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
          type="button"
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
          type="button"
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
          type="button"
          @click="activeTab = 'visibility'"
          class="px-3.5 py-2 rounded-xs border transition-all cursor-pointer flex items-center gap-2 shrink-0 font-serif-editorial"
          :class="
            activeTab === 'visibility'
              ? 'border-[var(--ink-primary)] bg-[var(--ink-primary)] text-[var(--bg-archive)] font-medium shadow-xs'
              : 'border-transparent text-[var(--ink-secondary)] hover:border-[var(--border-subtle)] hover:bg-[var(--bg-subtle)]'
          "
        >
          <Globe class="w-3.5 h-3.5" />
          <span>展厅公开</span>
          <span
            class="px-1.5 py-0.2 rounded-xs text-[11px] font-mono-archive"
            :class="activeTab === 'visibility' ? 'bg-white/20 text-white' : 'bg-[var(--bg-subtle)] text-[var(--ink-muted)]'"
          >
            {{ publicModules.length }}/4
          </span>
        </button>
      </div>

      <!-- 操作反馈提示条 -->
      <div
        class="min-h-[44px] flex items-center transition-opacity duration-200"
        :class="alertMessage ? 'opacity-100' : 'opacity-0'"
        role="alert"
        aria-live="polite"
      >
        <div
          v-if="alertMessage"
          class="w-full p-3 rounded-xs border text-xs font-serif-editorial flex items-start gap-2.5"
          :class="
            alertMessage.type === 'success'
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-800 dark:text-emerald-300'
              : 'bg-rose-500/10 border-rose-500/30 text-rose-800 dark:text-rose-300'
          "
        >
          <Check v-if="alertMessage.type === 'success'" class="w-4 h-4 shrink-0 text-emerald-600 mt-0.5" />
          <AlertTriangle v-else class="w-4 h-4 shrink-0 text-rose-600 mt-0.5" />
          <span class="flex-1 min-w-0 leading-relaxed truncate">{{ alertMessage.text }}</span>
        </div>
      </div>

      <!-- 选项卡 1：全量 ZIP 快照与灾备 -->
      <BackupSnapshotTab
        v-if="activeTab === 'backup'"
        :backups="backups"
        :storageStatus="localStorageStatus"
        :isLoadingList="isLoadingList"
        :loadError="loadError"
        :maxRetention="MAX_BACKUP_RETENTION"
        @refresh="loadData"
        @update:backups="(list) => (backups = list)"
        @restored="emit('restored')"
        @alert="showAlertMsg"
      />

      <!-- 选项卡 2：对象存储设置 -->
      <ObjectStorageTab
        v-else-if="activeTab === 'storage'"
        :storageStatus="localStorageStatus"
        :isLoadingList="isLoadingList"
        @update:storageStatus="(status) => (localStorageStatus = status)"
        @requestAuth="emit('requestAuth')"
        @alert="showAlertMsg"
      />

      <!-- 选项卡 3：展厅公开设置 -->
      <ArchiveVisibilityTab
        v-else-if="activeTab === 'visibility'"
        v-model:publicModules="publicModules"
        :isLoadingVisibility="isLoadingVisibility"
        @configUpdated="(cfg) => emit('configUpdated', cfg)"
        @alert="showAlertMsg"
      />

      <!-- 底部版权与数据自主权承诺 -->
      <div class="pt-4 border-t border-[var(--border-subtle)] text-xs font-serif-editorial text-[var(--ink-muted)] text-center">
        “数据 100% 属于你，永远可导出，永远不被平台绑架。”
      </div>
    </div>
  </div>
</template>
