<script setup lang="ts">
import { ref, watch } from 'vue'
import {
  X,
  RefreshCw,
  BookOpen,
  ExternalLink,
  AlertCircle,
  CheckCircle2,
  Plus,
  Pencil,
  Trash2,
} from 'lucide-vue-next'
import { getBeijingDateString } from '../utils/format'
import PaperDatePicker from './PaperDatePicker.vue'
import {
  checkSystemUpdate,
  fetchUpdateNotices,
  createUpdateNotice,
  updateUpdateNotice,
  deleteUpdateNotice,
} from '../utils/api'
import { audio } from '../utils/audio'
import type { UpdateCheckResult, UpdateNotice } from '../types'

const props = withDefaults(
  defineProps<{
    isOpen: boolean
    initialTab?: 'check' | 'notices'
  }>(),
  {
    initialTab: 'check',
  }
)

const emit = defineEmits<{
  (e: 'close'): void
}>()

const activeTab = ref<'check' | 'notices'>(props.initialTab)

// 1. 版本更新检测状态 (5.14.1)
const checking = ref(false)
const checkResult = ref<UpdateCheckResult | null>(null)
const checkRequestError = ref('')

const runUpdateCheck = async (force = false) => {
  checking.value = true
  checkRequestError.value = ''
  try {
    const res = await checkSystemUpdate(force)
    checkResult.value = res
  } catch (err: any) {
    checkRequestError.value = err?.message || '检查更新请求失败，请检查网络连接或服务端状态'
  } finally {
    checking.value = false
  }
}

// 2. 更新公告历史存档状态 (5.14.2)
const loadingNotices = ref(false)
const notices = ref<UpdateNotice[]>([])
const noticeError = ref('')

const isEditingForm = ref(false)
const editingId = ref<number | null>(null)
const submitting = ref(false)
const deletingId = ref<number | null>(null)

const todayStr = () => getBeijingDateString()

const form = ref({
  version: 'v1.1.0',
  title: '',
  body: '',
  released_at: todayStr(),
})

const loadNotices = async () => {
  loadingNotices.value = true
  noticeError.value = ''
  try {
    notices.value = await fetchUpdateNotices()
  } catch (err: any) {
    noticeError.value = err?.message || '无法加载更新公告存档'
  } finally {
    loadingNotices.value = false
  }
}

const openCreateForm = () => {
  audio.playTink()
  editingId.value = null
  form.value = {
    version: checkResult.value?.current_version || 'v1.1.0',
    title: '',
    body: '',
    released_at: todayStr(),
  }
  noticeError.value = ''
  isEditingForm.value = true
}

const openEditForm = (item: UpdateNotice) => {
  audio.playTink()
  editingId.value = item.id
  form.value = {
    version: item.version || '',
    title: item.title || '',
    body: item.body || '',
    released_at: (item.released_at || '').slice(0, 10) || todayStr(),
  }
  noticeError.value = ''
  isEditingForm.value = true
}

const cancelForm = () => {
  isEditingForm.value = false
  editingId.value = null
}

const handleSaveNotice = async () => {
  const version = form.value.version.trim()
  const title = form.value.title.trim()
  const body = form.value.body.trim()
  if (!version || !title || !body) {
    noticeError.value = '请填写完整的版本号、公告标题与装订更新说明正文'
    return
  }

  submitting.value = true
  noticeError.value = ''
  try {
    const payload = {
      version,
      title,
      body,
      released_at: form.value.released_at || todayStr(),
    }
    if (editingId.value !== null) {
      await updateUpdateNotice(editingId.value, payload)
    } else {
      await createUpdateNotice(payload)
    }
    audio.playTink()
    isEditingForm.value = false
    editingId.value = null
    await loadNotices()
  } catch (err: any) {
    noticeError.value = err?.message || '保存更新公告失败'
  } finally {
    submitting.value = false
  }
}

const handleDeleteNotice = async (id: number) => {
  deletingId.value = id
  noticeError.value = ''
  try {
    await deleteUpdateNotice(id)
    audio.playTink()
    notices.value = notices.value.filter((n) => n.id !== id)
  } catch (err: any) {
    noticeError.value = err?.message || '删除更新公告失败'
  } finally {
    deletingId.value = null
  }
}

const switchTab = (tab: 'check' | 'notices') => {
  audio.playTink()
  activeTab.value = tab
  if (tab === 'check' && !checkResult.value && !checking.value) {
    runUpdateCheck()
  } else if (tab === 'notices') {
    loadNotices()
  }
}

const formatDisplayDate = (raw?: string) => {
  if (!raw) return '—'
  return raw.replace('T', ' ').slice(0, 16)
}

watch(
  () => [props.isOpen, props.initialTab] as const,
  ([open, tab]) => {
    if (open) {
      activeTab.value = tab || 'check'
      isEditingForm.value = false
      if (activeTab.value === 'check') {
        runUpdateCheck()
      } else {
        loadNotices()
      }
    }
  },
  { immediate: true }
)
</script>

<template>
  <div
    v-if="isOpen"
    class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs animate-in fade-in duration-200"
    @click.self="emit('close')"
  >
    <div
      class="bg-[var(--bg-archive)] border border-[var(--border-subtle)] shadow-[0_16px_40px_rgba(0,0,0,0.12)] w-full max-w-xl rounded-xs p-4 sm:p-8 text-left space-y-6 max-h-[88dvh] sm:max-h-[85vh] overflow-y-auto"
    >
      <!-- 顶部标题与模式切换 -->
      <div class="flex items-center justify-between pb-4 border-b border-[var(--border-subtle)]">
        <div class="flex items-center gap-3">
          <BookOpen class="w-4 h-4 text-[var(--ink-secondary)]" />
          <h2 class="font-serif-editorial text-xl font-medium text-[var(--ink-primary)]">
            版本检测与装订公告
          </h2>
        </div>
        <button
          @click="emit('close')"
          class="p-1.5 text-[var(--ink-muted)] hover:text-[var(--ink-primary)] cursor-pointer"
        >
          <X class="w-4 h-4" />
        </button>
      </div>

      <!-- 二级导航纸签 -->
      <div class="flex items-center justify-between border-b border-[var(--border-subtle)]/70 pb-3">
        <div class="flex items-center gap-2">
          <button
            @click="switchTab('check')"
            class="px-3 py-1.5 text-xs font-serif-editorial rounded-xs border transition-colors cursor-pointer"
            :class="
              activeTab === 'check'
                ? 'border-[var(--ink-primary)] bg-[var(--ink-primary)] text-[var(--bg-archive)]'
                : 'border-[var(--border-subtle)] text-[var(--ink-secondary)] hover:text-[var(--ink-primary)]'
            "
          >
            检查更新
          </button>
          <button
            @click="switchTab('notices')"
            class="px-3 py-1.5 text-xs font-serif-editorial rounded-xs border transition-colors cursor-pointer"
            :class="
              activeTab === 'notices'
                ? 'border-[var(--ink-primary)] bg-[var(--ink-primary)] text-[var(--bg-archive)]'
                : 'border-[var(--border-subtle)] text-[var(--ink-secondary)] hover:text-[var(--ink-primary)]'
            "
          >
            更新公告存档
          </button>
        </div>

        <span class="text-[11px] font-mono-archive text-[var(--ink-muted)]">
          仅管理端可见
        </span>
      </div>

      <!-- 面板一：手动版本更新检测 (5.14.1) -->
      <div v-if="activeTab === 'check'" class="space-y-5 font-serif-editorial">
        <div class="space-y-3">
          <div class="flex items-center justify-between py-2.5 border-b border-[var(--border-subtle)]/60 text-sm">
            <span class="text-[var(--ink-muted)]">当前运行版本</span>
            <span class="font-mono-archive text-xs text-[var(--ink-primary)]">
              {{ checkResult?.current_version ? `当前运行 ${checkResult.current_version}` : '读取中…' }}
            </span>
          </div>

          <div class="flex items-center justify-between py-2.5 border-b border-[var(--border-subtle)]/60 text-sm">
            <span class="text-[var(--ink-muted)]">最新发布版本</span>
            <span class="font-mono-archive text-xs text-[var(--ink-primary)]">
              <template v-if="checking">查询中…</template>
              <template v-else-if="checkResult?.latest_version">
                最新版本 {{ checkResult.latest_version }}
              </template>
              <template v-else>暂无已发布版本</template>
            </span>
          </div>

          <div
            v-if="checkResult?.checked_at"
            class="flex items-center justify-between py-2 border-b border-[var(--border-subtle)]/60 text-sm"
          >
            <span class="text-[var(--ink-muted)]">最近查询时刻</span>
            <span class="font-mono-archive text-xs text-[var(--ink-secondary)]">
              {{ formatDisplayDate(checkResult.checked_at) }}
            </span>
          </div>
        </div>

        <!-- 如实展示查询失败原因（不静默、不用假数据兜底） -->
        <div
          v-if="checkRequestError || checkResult?.check_error"
          class="p-3.5 bg-amber-950/10 border border-amber-700/40 rounded-xs text-xs text-[var(--ink-primary)] space-y-1.5"
        >
          <div class="flex items-center gap-1.5 font-medium text-amber-700">
            <AlertCircle class="w-4 h-4 shrink-0" />
            <span>版本查询未能完成</span>
          </div>
          <p class="font-mono-archive text-[11px] text-[var(--ink-secondary)] break-all leading-relaxed">
            {{ checkRequestError || checkResult?.check_error }}
          </p>
        </div>

        <!-- 发现新版本 -->
        <div
          v-else-if="checkResult && checkResult.has_update"
          class="p-4 bg-[var(--bg-subtle)] border border-[var(--ink-primary)]/30 rounded-xs space-y-2.5"
        >
          <div class="flex items-center justify-between">
            <span class="text-sm font-medium text-[var(--ink-primary)]">
              发现新版本 · {{ checkResult.latest_version }}
            </span>
            <span
              v-if="checkResult.published_at"
              class="text-[11px] font-mono-archive text-[var(--ink-muted)]"
            >
              {{ formatDisplayDate(checkResult.published_at) }}
            </span>
          </div>
          <p class="text-xs text-[var(--ink-secondary)] leading-relaxed">
            远端仓库已发布新版本，可前往发布页面查阅构建产物与校验和。
          </p>
          <div v-if="checkResult.release_url" class="pt-1">
            <a
              :href="checkResult.release_url"
              target="_blank"
              rel="noopener noreferrer"
              class="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono-archive bg-[var(--ink-primary)] text-[var(--bg-archive)] rounded-xs hover:opacity-90 transition-opacity"
            >
              <span>前往 GitHub Release 页面</span>
              <ExternalLink class="w-3.5 h-3.5" />
            </a>
          </div>
        </div>

        <!-- 已是最新或尚无发布 -->
        <div
          v-else-if="checkResult && !checking"
          class="p-3.5 bg-[var(--bg-subtle)] border border-[var(--border-subtle)] rounded-xs flex items-center gap-2 text-xs text-[var(--ink-secondary)]"
        >
          <CheckCircle2 class="w-4 h-4 text-emerald-700 shrink-0" />
          <span>
            {{
              checkResult.latest_version
                ? `当前运行版本（${checkResult.current_version}）已是最新版本。`
                : `当前运行版本为 ${checkResult.current_version}，远端仓库尚无已发布的 Release。`
            }}
          </span>
        </div>

        <div class="pt-2 flex items-center justify-between">
          <button
            @click="runUpdateCheck(true)"
            :disabled="checking"
            class="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-serif-editorial border border-[var(--border-subtle)] hover:border-[var(--ink-primary)] text-[var(--ink-secondary)] hover:text-[var(--ink-primary)] rounded-xs cursor-pointer transition-colors disabled:opacity-50"
          >
            <RefreshCw class="w-3.5 h-3.5" :class="{ 'animate-spin': checking }" />
            <span>{{ checking ? '正在查询…' : '重新检查更新' }}</span>
          </button>

          <button
            @click="emit('close')"
            class="px-4 py-1.5 text-xs font-mono-archive bg-[var(--ink-primary)] text-[var(--bg-archive)] rounded-xs cursor-pointer hover:opacity-90"
          >
            关闭
          </button>
        </div>
      </div>

      <!-- 面板二：更新公告历史存档（仅管理端 CRUD · 5.14.2） -->
      <div v-else class="space-y-5 font-serif-editorial">
        <div class="flex items-center justify-between">
          <p class="text-xs text-[var(--ink-secondary)]">
            为每个发布版本手写一段装订更新说明，按版本号倒序归档留存。
          </p>
          <button
            v-if="!isEditingForm"
            @click="openCreateForm"
            class="inline-flex items-center gap-1 px-3 py-1.5 text-xs bg-[var(--ink-primary)] text-[var(--bg-archive)] rounded-xs cursor-pointer hover:opacity-90 shrink-0"
          >
            <Plus class="w-3.5 h-3.5" />
            <span>新建公告</span>
          </button>
        </div>

        <div
          v-if="noticeError"
          class="p-3 bg-amber-950/10 border border-amber-700/40 rounded-xs text-xs text-amber-800"
        >
          {{ noticeError }}
        </div>

        <!-- 新建 / 编辑公告表单 -->
        <div
          v-if="isEditingForm"
          class="p-4 bg-[var(--bg-subtle)] border border-[var(--border-subtle)] rounded-xs space-y-4"
        >
          <div class="flex items-center justify-between border-b border-[var(--border-subtle)] pb-2">
            <span class="text-xs font-medium text-[var(--ink-primary)]">
              {{ editingId !== null ? '编辑装订更新说明' : '新建装订更新说明' }}
            </span>
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div class="space-y-1">
              <label class="block text-[11px] font-mono-archive text-[var(--ink-muted)]">
                版本号 (如 v1.0.0)
              </label>
              <input
                v-model="form.version"
                type="text"
                placeholder="v1.0.0"
                class="w-full px-2.5 py-1.5 text-xs font-mono-archive bg-[var(--bg-archive)] border border-[var(--border-subtle)] rounded-xs text-[var(--ink-primary)] focus:outline-none focus:border-[var(--ink-primary)]"
              />
            </div>

            <div class="space-y-1">
              <label class="block text-[11px] font-mono-archive text-[var(--ink-muted)]">
                发布日期
              </label>
              <PaperDatePicker
                v-model="form.released_at"
                :enableTime="false"
                placeholder="选择发布日期"
                size="sm"
              />
            </div>
          </div>

          <div class="space-y-1">
            <label class="block text-[11px] font-mono-archive text-[var(--ink-muted)]">
              公告标题
            </label>
            <input
              v-model="form.title"
              type="text"
              placeholder="例如：初版装帧 · 散页生活档案室落成"
              class="w-full px-2.5 py-1.5 text-xs bg-[var(--bg-archive)] border border-[var(--border-subtle)] rounded-xs text-[var(--ink-primary)] focus:outline-none focus:border-[var(--ink-primary)]"
            />
          </div>

          <div class="space-y-1">
            <label class="block text-[11px] font-mono-archive text-[var(--ink-muted)]">
              装订更新说明正文
            </label>
            <textarea
              v-model="form.body"
              rows="4"
              placeholder="记录本次版本的重要变更、装帧细节与手记…"
              class="w-full px-2.5 py-2 text-xs bg-[var(--bg-archive)] border border-[var(--border-subtle)] rounded-xs text-[var(--ink-primary)] leading-relaxed focus:outline-none focus:border-[var(--ink-primary)]"
            />
          </div>

          <div class="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              @click="cancelForm"
              class="px-3 py-1.5 text-xs border border-[var(--border-subtle)] text-[var(--ink-secondary)] rounded-xs cursor-pointer hover:text-[var(--ink-primary)]"
            >
              取消
            </button>
            <button
              type="button"
              :disabled="submitting"
              @click="handleSaveNotice"
              class="px-4 py-1.5 text-xs bg-[var(--ink-primary)] text-[var(--bg-archive)] rounded-xs cursor-pointer hover:opacity-90 disabled:opacity-50"
            >
              {{ submitting ? '保存中…' : '保存公告' }}
            </button>
          </div>
        </div>

        <!-- 历史公告列表 -->
        <div v-if="loadingNotices" class="py-8 text-center text-xs text-[var(--ink-muted)]">
          正在读取更新公告存档…
        </div>

        <div
          v-else-if="notices.length === 0"
          class="py-8 text-center border border-dashed border-[var(--border-subtle)] rounded-xs text-xs text-[var(--ink-muted)]"
        >
          尚无装订更新说明存档
        </div>

        <div v-else class="space-y-3">
          <article
            v-for="item in notices"
            :key="item.id"
            class="p-4 border border-[var(--border-subtle)] bg-[var(--bg-subtle)]/40 rounded-xs space-y-2"
          >
            <div class="flex items-start justify-between gap-2">
              <div class="space-y-0.5">
                <div class="flex items-center gap-2">
                  <span class="px-1.5 py-0.5 text-[11px] font-mono-archive bg-[var(--ink-primary)] text-[var(--bg-archive)] rounded-xs">
                    {{ item.version }}
                  </span>
                  <h3 class="text-sm font-medium text-[var(--ink-primary)]">
                    {{ item.title }}
                  </h3>
                </div>
                <p
                  v-if="item.released_at"
                  class="text-[11px] font-mono-archive text-[var(--ink-muted)]"
                >
                  发布于 {{ item.released_at.slice(0, 10) }}
                </p>
              </div>

              <div class="flex items-center gap-1.5 shrink-0">
                <button
                  @click="openEditForm(item)"
                  class="p-1.5 text-[var(--ink-muted)] hover:text-[var(--ink-primary)] cursor-pointer"
                  title="编辑公告"
                >
                  <Pencil class="w-3.5 h-3.5" />
                </button>
                <button
                  :disabled="deletingId === item.id"
                  @click="handleDeleteNotice(item.id)"
                  class="p-1.5 text-[var(--ink-muted)] hover:text-red-700 cursor-pointer disabled:opacity-50"
                  title="删除公告"
                >
                  <Trash2 class="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            <p class="text-xs text-[var(--ink-secondary)] whitespace-pre-line leading-relaxed pt-1">
              {{ item.body }}
            </p>
          </article>
        </div>
      </div>
    </div>
  </div>
</template>
