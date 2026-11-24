<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { X, Edit2, Trash2, Check, AlertTriangle, LayoutGrid, Rows3 } from 'lucide-vue-next'
import ImageUploader from './ImageUploader.vue'
import PaperSelect from './PaperSelect.vue'
import PaperDatePicker from './PaperDatePicker.vue'
import EditorialLightbox from './EditorialLightbox.vue'
import PrivacyToggle from './PrivacyToggle.vue'
import EntryCategoryPicker from './EntryCategoryPicker.vue'
import { updateLifeEntry, deleteLifeEntry, getAdminToken } from '../utils/api'
import { getEntryBadgeClass } from '../utils/entryCategoryStyle'
import {
  getEntryCategoryAccent,
  getEntryDisplayCategoryLabel,
  hasDistinctEntryTitle,
  normalizeEntryCategory,
  type EntryGalleryCategory,
  type LifeEntry,
} from '../types'
import {
  parseOccurredDate,
  renderEditorialContent,
  getBeijingISOString,
  getAttachmentThumbUrl,
} from '../utils/format'
import { showAlert } from '../composables/useConfirm'
import { useBodyScrollLock } from '../composables/useBodyScrollLock'
import { useEscapeClose } from '../composables/useEscapeClose'

const props = defineProps<{
  entry: LifeEntry | null
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'updated', entry: LifeEntry): void
  (e: 'deleted', id: number): void
  (e: 'requestAuth'): void
}>()

const isAdmin = computed(() => Boolean(getAdminToken()))

const isEditing = ref(false)
const showDeleteConfirm = ref(false)
const isSubmitting = ref(false)
const errorMsg = ref<string | null>(null)

// 编辑表单字段
const editTitle = ref('')
const editType = ref('life')
const editCategory = ref<EntryGalleryCategory>('')
const editContent = ref('')
const editLocation = ref('')
const editOccurredAt = ref('')
const editIsPrivate = ref(false)
const editAttachmentIds = ref<number[]>([])
const imageUploaderRef = ref<InstanceType<typeof ImageUploader> | null>(null)

const startEdit = () => {
  if (!props.entry) return
  if (!isAdmin.value) {
    emit('requestAuth')
    return
  }
  isEditing.value = true
  const rawType = (props.entry.type || 'life').toLowerCase()
  editType.value = rawType === 'wish' ? 'wish' : 'life'
  editCategory.value =
    editType.value === 'life' ? normalizeEntryCategory(props.entry.category) : ''

  editTitle.value = props.entry.title || ''
  editContent.value = props.entry.content || ''
  editLocation.value = props.entry.location || ''
  editIsPrivate.value = Boolean(props.entry.is_private)
  editAttachmentIds.value = (props.entry.attachments || []).map((a) => a.id)

  editOccurredAt.value = props.entry.occurred_at
    ? `${parseOccurredDate(props.entry.occurred_at).dateKey}T${parseOccurredDate(props.entry.occurred_at).time}`
    : ''
}

const cancelEdit = () => {
  isEditing.value = false
  errorMsg.value = null
}

const handleClose = () => {
  if (isSubmitting.value) return
  emit('close')
}

const handleSaveEdit = async () => {
  if (!props.entry) return
  if (!editContent.value.trim() && editAttachmentIds.value.length === 0) {
    errorMsg.value = '请填写记录内容或上传至少一张照片'
    return
  }

  if (!getAdminToken()) {
    emit('requestAuth')
    return
  }

  try {
    isSubmitting.value = true
    const updated = await updateLifeEntry(props.entry.id, {
      type: editType.value,
      category: editType.value === 'life' ? editCategory.value : '',
      title: editTitle.value.trim(),
      content: editContent.value.trim(),
      location: editLocation.value.trim(),
      is_private: editIsPrivate.value,
      occurred_at: getBeijingISOString(editOccurredAt.value),
      attachment_ids: editAttachmentIds.value,
      clear_attachments: editAttachmentIds.value.length === 0,
    })

    imageUploaderRef.value?.markCommitted()

    emit('updated', updated)
    isEditing.value = false
    errorMsg.value = null
  } catch (err: any) {
    errorMsg.value = err.message || '更新失败'
  } finally {
    isSubmitting.value = false
  }
}

const handleDelete = async () => {
  if (!props.entry) return
  if (!getAdminToken()) {
    emit('requestAuth')
    return
  }
  try {
    isSubmitting.value = true
    await deleteLifeEntry(props.entry.id)
    emit('deleted', props.entry.id)
    emit('close')
  } catch (err: any) {
    await showAlert({ title: '删除失败', message: err.message || '删除失败', danger: true })
  } finally {
    isSubmitting.value = false
    showDeleteConfirm.value = false
  }
}

const displayImages = computed(() => {
  if (!props.entry) return []
  if (props.entry.attachments && props.entry.attachments.length > 0) {
    return props.entry.attachments
      .map((a) => ({ thumb: getAttachmentThumbUrl(a), original: a.url || a.thumbnail_url }))
      .filter((a) => Boolean(a.thumb))
  }
  return []
})

const galleryViewMode = ref<'stack' | 'contact'>('contact')
const isLightboxOpen = ref(false)
const lightboxUrl = ref('')

watch(
  () => props.entry?.id,
  () => {
    galleryViewMode.value = displayImages.value.length >= 4 ? 'contact' : 'stack'
    isEditing.value = false
    showDeleteConfirm.value = false
  },
  { immediate: true }
)

const openImageLightbox = (url: string) => {
  lightboxUrl.value = url
  isLightboxOpen.value = true
}

useBodyScrollLock(() => !!props.entry)
useEscapeClose(() => Boolean(props.entry), handleClose)
</script>

<template>
  <div
    v-if="entry"
    role="dialog"
    aria-modal="true"
    :aria-label="hasDistinctEntryTitle(entry) ? entry.title : '散页详情'"
    class="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/45 backdrop-blur-xs animate-in fade-in duration-200"
    @click.self="handleClose"
  >
    <div
      class="bg-[var(--bg-archive)] border border-[var(--border-subtle)] shadow-[0_20px_60px_rgba(0,0,0,0.15)] w-full max-w-2xl max-h-[88dvh] sm:max-h-[92vh] overflow-y-auto rounded-xs p-4 sm:p-10 text-left relative transition-all pb-[max(1.5rem,env(safe-area-inset-bottom,1.5rem))]"
    >
      <!-- 顶部关闭与操作工具栏 -->
      <div class="flex items-center justify-between gap-3 pb-6 border-b border-[var(--border-subtle)] mb-8">
        <div class="flex flex-wrap items-center gap-2 font-mono-archive text-xs text-[var(--ink-muted)]">
          <span class="text-[var(--ink-primary)] font-medium">
            {{ parseOccurredDate(entry.occurred_at).dotDate }}
          </span>
          <span v-if="parseOccurredDate(entry.occurred_at).time">· {{ parseOccurredDate(entry.occurred_at).time }}</span>
          <span>·</span>
          <span
            class="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-xs border text-[11px] font-medium"
            :class="getEntryBadgeClass(entry)"
          >
            <span
              aria-hidden="true"
              class="w-1.5 h-1.5 rounded-full shrink-0"
              :style="{ backgroundColor: getEntryCategoryAccent(entry) }"
            ></span>
            <span>{{ getEntryDisplayCategoryLabel(entry) }}</span>
          </span>
        </div>

        <div class="flex items-center gap-3">
          <template v-if="isAdmin && !isEditing">
            <button
              @click="startEdit"
              class="text-xs font-mono-archive text-[var(--ink-muted)] hover:text-[var(--ink-primary)] transition-colors cursor-pointer flex items-center gap-1 py-1 px-2 border border-transparent hover:border-[var(--border-subtle)] rounded-xs"
              title="编辑记录"
            >
              <Edit2 class="w-3.5 h-3.5" />
              <span>编辑</span>
            </button>
            <button
              @click="showDeleteConfirm = true"
              class="text-xs font-mono-archive text-red-600/70 hover:text-red-700 transition-colors cursor-pointer flex items-center gap-1 py-1 px-2 border border-transparent hover:border-red-200 rounded-xs"
              title="删除记录"
            >
              <Trash2 class="w-3.5 h-3.5" />
              <span>删除</span>
            </button>
          </template>

          <button
            @click="handleClose"
            aria-label="关闭"
            class="p-1 text-[var(--ink-muted)] hover:text-[var(--ink-primary)] cursor-pointer transition-colors"
          >
            <X class="w-5 h-5" />
          </button>
        </div>
      </div>

      <!-- 删除确认浮层 -->
      <div class="relative z-20">
        <div
          v-if="showDeleteConfirm"
          class="absolute top-0 left-0 right-0 p-4 bg-red-50 border border-red-200 rounded-xs space-y-3 font-serif-editorial text-sm shadow-[0_12px_36px_rgba(0,0,0,0.18)]"
        >
          <div class="flex items-center gap-2 text-red-800 font-medium">
            <AlertTriangle class="w-4 h-4 text-red-600" />
            <span>确定删除这条记录？</span>
          </div>
          <p class="text-xs text-red-700 leading-relaxed font-mono-archive">
            删除后将同时清理关联的照片与存储对象，该操作不可撤销。
          </p>
          <div class="flex items-center justify-end gap-3 pt-1">
            <button
              @click="showDeleteConfirm = false"
              class="px-3 py-1 text-xs font-mono-archive text-[var(--ink-muted)] hover:text-[var(--ink-primary)] cursor-pointer"
            >
              取消
            </button>
            <button
              @click="handleDelete"
              :disabled="isSubmitting"
              class="px-3.5 py-1 text-xs font-mono-archive bg-red-600 text-white hover:bg-red-700 rounded-xs transition-colors cursor-pointer disabled:opacity-50"
            >
              <span class="min-w-[7em] text-center">{{ isSubmitting ? '正在删除...' : '确认删除' }}</span>
            </button>
          </div>
        </div>
      </div>

      <!-- 编辑模式 -->
      <form v-if="isEditing" @submit.prevent="handleSaveEdit" class="space-y-6">
        <div class="min-h-[44px] flex items-center" role="alert" aria-live="polite">
          <div v-if="errorMsg" class="w-full p-3 bg-red-50 text-red-700 text-xs rounded-xs border border-red-200 truncate">
            {{ errorMsg }}
          </div>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div class="space-y-1.5">
            <label class="block text-xs font-mono-archive text-[var(--ink-muted)]">记录形态</label>
            <PaperSelect
              v-model="editType"
              :options="[
                { value: 'life', label: '日常' },
                { value: 'wish', label: '心愿' },
              ]"
            />
          </div>
          <div class="sm:col-span-2 space-y-1.5">
            <label class="block text-xs font-mono-archive text-[var(--ink-muted)]">标题</label>
            <input
              v-model="editTitle"
              type="text"
              class="w-full px-3 py-2 text-base font-serif-editorial bg-transparent border border-[var(--border-subtle)] focus:border-[var(--ink-primary)] rounded-xs outline-none"
            />
          </div>
        </div>

        <EntryCategoryPicker
          v-if="editType === 'life'"
          v-model="editCategory"
        />

        <div class="space-y-1.5">
          <label class="block text-xs font-mono-archive text-[var(--ink-muted)]">正文内容 *</label>
          <textarea
            v-model="editContent"
            rows="6"
            class="w-full px-3 py-2 text-base font-serif-editorial leading-relaxed bg-transparent border border-[var(--border-subtle)] focus:border-[var(--ink-primary)] rounded-xs outline-none resize-none"
          ></textarea>
        </div>

        <!-- 附件管理 -->
        <ImageUploader
          ref="imageUploaderRef"
          :initialAttachments="entry.attachments"
          @update:attachments="editAttachmentIds = $event"
        />

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div class="space-y-1.5">
            <label class="block text-xs font-mono-archive text-[var(--ink-muted)]">发生时间</label>
            <PaperDatePicker
              v-model="editOccurredAt"
              enableTime
            />
          </div>

          <div class="space-y-1.5">
            <label class="block text-xs font-mono-archive text-[var(--ink-muted)]">地点</label>
            <input
              v-model="editLocation"
              type="text"
              class="w-full px-3 py-2 text-xs font-serif-editorial bg-transparent border border-[var(--border-subtle)] focus:border-[var(--ink-primary)] rounded-xs outline-none"
            />
          </div>
        </div>

        <PrivacyToggle v-model="editIsPrivate" />

        <div class="pt-6 border-t border-[var(--border-subtle)] flex items-center justify-end gap-3">
          <button
            type="button"
            @click="cancelEdit"
            class="px-4 py-2 text-xs font-mono-archive text-[var(--ink-muted)] hover:text-[var(--ink-primary)] cursor-pointer"
          >
            取消
          </button>
          <button
            type="submit"
            :disabled="isSubmitting"
            class="px-5 py-2 text-xs font-mono-archive bg-[var(--ink-primary)] text-[var(--bg-archive)] hover:opacity-90 rounded-xs transition-opacity cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
          >
            <span class="w-3.5 h-3.5 inline-flex items-center justify-center shrink-0">
              <Check v-if="!isSubmitting" class="w-3.5 h-3.5" />
            </span>
            <span class="min-w-[7em] text-center">{{ isSubmitting ? '保存中...' : '保存修改' }}</span>
          </button>
        </div>
      </form>

      <!-- 浏览模式 (Editorial 典雅展示) -->
      <article v-else class="space-y-8 font-serif-editorial">
        <!-- 标题 -->
        <h1 v-if="hasDistinctEntryTitle(entry)" class="type-page-heading text-[var(--ink-primary)] leading-snug">
          {{ entry.title }}
        </h1>

        <!-- 大尺寸图片画廊 / 暗房接触印相表 (Contact Sheet) -->
        <div v-if="displayImages.length > 0" class="space-y-3">
          <div
            v-if="displayImages.length >= 4"
            class="flex items-center justify-between text-[11px] font-mono-archive text-[var(--ink-muted)] pb-1 border-b border-[var(--border-subtle)]/60"
          >
            <span>共 {{ displayImages.length }} 帧影像底片</span>
            <div class="inline-flex items-center gap-1 p-0.5 bg-[var(--bg-subtle)] border border-[var(--border-subtle)] rounded-xs">
              <button
                type="button"
                @click="galleryViewMode = 'contact'"
                class="px-2 py-0.5 rounded-xs flex items-center gap-1 transition-colors cursor-pointer"
                :class="
                  galleryViewMode === 'contact'
                    ? 'bg-[var(--ink-primary)] text-[var(--bg-archive)]'
                    : 'text-[var(--ink-muted)] hover:text-[var(--ink-primary)]'
                "
              >
                <LayoutGrid class="w-3 h-3" />
                <span>接触印相表</span>
              </button>
              <button
                type="button"
                @click="galleryViewMode = 'stack'"
                class="px-2 py-0.5 rounded-xs flex items-center gap-1 transition-colors cursor-pointer"
                :class="
                  galleryViewMode === 'stack'
                    ? 'bg-[var(--ink-primary)] text-[var(--bg-archive)]'
                    : 'text-[var(--ink-muted)] hover:text-[var(--ink-primary)]'
                "
              >
                <Rows3 class="w-3 h-3" />
                <span>逐幅纵览</span>
              </button>
            </div>
          </div>

          <!-- 接触印相表 -->
          <div
            v-if="displayImages.length >= 4 && galleryViewMode === 'contact'"
            class="p-2.5 sm:p-3.5 bg-[#181716] text-[#F9F8F5] rounded-xs border border-[var(--border-subtle)] space-y-2.5 shadow-inner"
          >
            <div class="flex items-center justify-between text-[11px] font-mono-archive text-[#a8a29e] tracking-widest px-0.5">
              <span>KODAK TRI-X 400 · CONTACT PROOF SHEET</span>
              <span>{{ parseOccurredDate(entry.occurred_at).dotDate }} · {{ displayImages.length }} FRAMES</span>
            </div>
            <div class="flex items-center justify-between gap-1.5 py-0.5 opacity-45">
              <span v-for="n in 14" :key="'top-' + n" class="w-2.5 h-1.5 rounded-[1px] bg-[#2c2a29] border border-white/15"></span>
            </div>
            <div
              class="grid gap-2.5"
              :class="displayImages.length === 4 ? 'grid-cols-2' : 'grid-cols-2 sm:grid-cols-3'"
            >
              <div
                v-for="(img, idx) in displayImages"
                :key="idx"
                @click="openImageLightbox(img.original || img.thumb)"
                class="contact-loupe-frame group/frame relative bg-black/80 p-1.5 rounded-xs border border-white/10 hover:border-[var(--accent-warm)]/80 cursor-zoom-in space-y-1"
              >
                <div class="aspect-[4/3] overflow-hidden rounded-xs bg-black">
                  <img
                    :src="img.thumb"
                    :alt="hasDistinctEntryTitle(entry) ? entry.title : getEntryDisplayCategoryLabel(entry)"
                    class="w-full h-full object-cover group-hover/frame:scale-105 transition-transform duration-300"
                    loading="lazy"
                   decoding="async">
                </div>
                <div class="flex items-center justify-between text-[11px] font-mono-archive text-[#a8a29e] px-0.5">
                  <span>FRAME {{ String(idx + 1).padStart(2, '0') }}A</span>
                  <span class="text-[var(--accent-warm)]/90">▲ {{ idx + 1 }}</span>
                </div>
              </div>
            </div>
            <div class="flex items-center justify-between gap-1.5 py-0.5 opacity-45">
              <span v-for="n in 14" :key="'bot-' + n" class="w-2.5 h-1.5 rounded-[1px] bg-[#2c2a29] border border-white/15"></span>
            </div>
          </div>

          <!-- 逐幅纵览画廊 -->
          <div v-else class="space-y-4">
            <div
              v-for="(img, idx) in displayImages"
              :key="idx"
              @click="openImageLightbox(img.original || img.thumb)"
              class="overflow-hidden rounded-xs bg-[var(--bg-subtle)] border border-[var(--border-subtle)] cursor-zoom-in"
            >
              <img
                :src="img.thumb"
                :alt="hasDistinctEntryTitle(entry) ? entry.title : getEntryDisplayCategoryLabel(entry)"
                class="w-full max-h-[680px] object-cover editorial-image"
                loading="lazy"
               decoding="async">
            </div>
          </div>
        </div>

        <!-- 正文叙事 -->
        <div
          class="text-base sm:text-lg text-[var(--ink-secondary)] leading-relaxed font-normal prose-editorial"
          v-html="renderEditorialContent(entry.content)"
        ></div>

        <!-- 注脚信息：地点与关联心愿 -->
        <div
          v-if="entry.location || entry.wish"
          class="pt-6 border-t border-[var(--border-subtle)] space-y-2 text-xs font-mono-archive text-[var(--ink-muted)]"
        >
          <div v-if="entry.location" class="flex items-center gap-2">
            <span>地点：</span>
            <span class="text-[var(--ink-primary)] font-serif-editorial">{{ entry.location }}</span>
          </div>

          <div v-if="entry.wish" class="flex items-center gap-2">
            <span>关联心愿：</span>
            <span class="text-[var(--ink-primary)]">{{ entry.wish.title }}</span>
          </div>
        </div>
      </article>

      <!-- 暗房底片灯箱 -->
      <EditorialLightbox
        :isOpen="isLightboxOpen"
        :imageUrl="lightboxUrl"
        :title="hasDistinctEntryTitle(entry) ? entry.title : ''"
        :meta="entry.location || ''"
        :location="entry.location || ''"
        :date="parseOccurredDate(entry.occurred_at).dotDate"
        @close="isLightboxOpen = false"
      />
    </div>
  </div>
</template>
