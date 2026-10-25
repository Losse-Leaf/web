<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { X, Edit2, Trash2, ArrowUpRight, Check, AlertTriangle, LayoutGrid, Rows3 } from 'lucide-vue-next'
import ImageUploader from './ImageUploader.vue'
import PaperSelect from './PaperSelect.vue'
import PaperDatePicker from './PaperDatePicker.vue'
import CityPicker from './CityPicker.vue'
import EditorialLightbox from './EditorialLightbox.vue'
import { matchCityFromLocation, saveLastUsedCity } from '../utils/cities'
import { updateLifeEntry, deleteLifeEntry, getAdminToken } from '../utils/api'
import type { LifeEntry, Project } from '../types'
import { parseOccurredDate, renderEditorialContent, getBeijingISOString } from '../utils/format'
import { showAlert } from '../composables/useConfirm'
import { useBodyScrollLock } from '../composables/useBodyScrollLock'

const props = defineProps<{
  entry: LifeEntry | null
  storageConfigured: boolean
  projects?: Project[]
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'updated', entry: LifeEntry): void
  (e: 'deleted', id: number): void
  (e: 'requestAuth', callback: () => void): void
}>()

const isAdmin = computed(() => Boolean(getAdminToken()))

const isEditing = ref(false)
const showDeleteConfirm = ref(false)
const isSubmitting = ref(false)
const errorMsg = ref<string | null>(null)

// 编辑表单字段
const editTitle = ref('')
const editType = ref('life')
const editContent = ref('')
const editLocation = ref('')
const editCityCode = ref('')
const editCityName = ref('')
const editOccurredAt = ref('')
const editProjectId = ref<number | null>(null)
const editAttachmentIds = ref<number[]>([])
// 附件上传器引用：保存成功后调用 markCommitted()，避免组件卸载时把已绑定附件当孤儿清理
const imageUploaderRef = ref<InstanceType<typeof ImageUploader> | null>(null)

const handleEditCitySelect = (city: { code: string; name: string }) => {
  editCityCode.value = city.code
  editCityName.value = city.name
  if (city.name && !editLocation.value.trim()) {
    editLocation.value = city.name
  }
  if (city.code && city.name) {
    saveLastUsedCity(city)
  }
}


const startEdit = () => {
  if (!props.entry) return
  if (!isAdmin.value) {
    emit('requestAuth', () => startEdit())
    return
  }
  isEditing.value = true
  const rawType = (props.entry.type || 'life').toLowerCase()
  if (rawType === 'travel') editType.value = 'travel'
  else if (rawType === 'project') editType.value = 'project'
  else if (rawType === 'wish') editType.value = 'wish'
  else editType.value = 'life'

  editTitle.value = props.entry.title || ''
  editContent.value = props.entry.content || ''
  editLocation.value = props.entry.location || ''
  const matched = matchCityFromLocation(props.entry.location)
  editCityCode.value = props.entry.city_code || matched?.code || ''
  editCityName.value = props.entry.city_name || matched?.name || ''
  editProjectId.value = props.entry.project_id || null
  editAttachmentIds.value = (props.entry.attachments || []).map((a) => a.id)

  // 统一经 parseOccurredDate 还原北京时间后再回填 (RC-134)
  editOccurredAt.value = props.entry.occurred_at
    ? `${parseOccurredDate(props.entry.occurred_at).dateKey}T${parseOccurredDate(props.entry.occurred_at).time}`
    : ''
}

const cancelEdit = () => {
  isEditing.value = false
  errorMsg.value = null
}

// 提交/删除进行中禁止用户侧关闭（背景/X）：保存期间关闭会卸载弹窗并触发
// ImageUploader 的 cleanupUploads，把在途 PUT 正在绑定的照片当孤儿回收。
// 删除成功路径的 emit('close') 发生在 finally 复位之前，直接 emit、绕过本守卫。
const handleClose = () => {
  if (isSubmitting.value) return
  emit('close')
}


const handleSaveEdit = async () => {
  if (!props.entry) return
  // 与 NewEntryModal 创建口径一致：正文与附件全空才拦截 ——
  // 其他端创建的纯图条目（正文为空）此前被强制「正文非空」而无法编辑。
  if (!editContent.value.trim() && editAttachmentIds.value.length === 0) {
    errorMsg.value = '请填写记录内容或上传至少一张照片'
    return
  }

  if (!getAdminToken()) {
    emit('requestAuth', () => handleSaveEdit())
    return
  }

  try {
    isSubmitting.value = true
    // 编辑时记录「初始城市」：用户显式清空（初始有城市→现为空）必须跳过地名反推，
    // 否则 matchCityFromLocation 会用地名文本把刚清空的城市再推导回来
    // （NewEntryModal 创建时 location 默认就是城市名，命中率极高），
    // clear_city 恒为 false、清空静默失效。仅初始就无城市的条目才允许反推兜底。
    const cityCleared = Boolean(props.entry.city_code) && !editCityCode.value
    const matched = !cityCleared && !editCityCode.value ? matchCityFromLocation(editLocation.value) : null
    const finalCityCode = editCityCode.value || matched?.code || undefined
    const finalCityName = editCityName.value || matched?.name || undefined
    const finalLocation = editLocation.value.trim() || finalCityName || ''

    if (finalCityCode && finalCityName) {
      saveLastUsedCity({ code: finalCityCode, name: finalCityName })
    }

    const updated = await updateLifeEntry(props.entry.id, {
      type: editType.value,
      title: editTitle.value.trim(),
      content: editContent.value.trim(),
      location: finalLocation,
      city_code: finalCityCode,
      city_name: finalCityName,
      // 清空城市但保留地点文本时 finalCityCode 为 undefined 且不带 clear_city，
      // 后端按「保持原值」处理 ⇒ 清空静默失效。对齐 TransactionsView 的判定。
      clear_city: cityCleared || undefined,
      project_id: editProjectId.value,
      occurred_at: getBeijingISOString(editOccurredAt.value),
      attachment_ids: editAttachmentIds.value,
      // 编辑时删光了照片必须显式声明解绑：单发空数组服务端按「保持原样」处理，
      // 用户删光照片保存后照片会原样回来且无任何报错（后端契约，与 WishFormModal 同口径）
      clear_attachments: editAttachmentIds.value.length === 0,
    })

    // 附件已随本次保存绑定到条目，标记后组件卸载不再当孤儿清理
    imageUploaderRef.value?.markCommitted()

    emit('updated', updated)
    isEditing.value = false
    errorMsg.value = null
  } catch (err: any) {
    if (!getAdminToken()) {
      emit('requestAuth', () => handleSaveEdit())
      return
    }
    errorMsg.value = err.message || '更新失败'
  } finally {
    isSubmitting.value = false
  }
}

const handleDelete = async () => {
  if (!props.entry) return
  if (!getAdminToken()) {
    emit('requestAuth', () => handleDelete())
    return
  }
  try {
    isSubmitting.value = true
    await deleteLifeEntry(props.entry.id)
    emit('deleted', props.entry.id)
    emit('close')
  } catch (err: any) {
    if (!getAdminToken()) {
      emit('requestAuth', () => handleDelete())
      return
    }
    await showAlert({ title: '删除失败', message: err.message || '删除失败', danger: true })
  } finally {
    isSubmitting.value = false
    showDeleteConfirm.value = false
  }
}

const displayImages = computed(() => {
  if (!props.entry) return []
  if (props.entry.attachments && props.entry.attachments.length > 0) {
    // 列表/接触印相用缩略图；灯箱必须换回原图，否则放大后只有 480px。
    return props.entry.attachments
      .map((a) => ({ thumb: a.thumbnail_url || a.url, original: a.url || a.thumbnail_url }))
      .filter((a) => Boolean(a.thumb))
  }
  return []
})

// 暗房接触印相表 (Contact Sheet) 与单张画廊切换 (当照片 >= 4 张时默认提供接触印相表切换)
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

const getKindLabel = (type: string) => {
  // RC-128 四母体收敛后仅认 4 类纯粹形态 (FE-20 / BE-36)
  const map: Record<string, string> = {
    life: '日常',
    travel: '游历',
    project: '造物',
    wish: '心愿',
  }
  return map[type] || '日常'
}

  // MOB-P1-66：弹窗打开期间锁定背景页面滚动（此前只有灯箱锁了）
  useBodyScrollLock(() => !!props.entry)
</script>

<template>
  <div
    v-if="entry"
    role="dialog"
    aria-modal="true"
    :aria-label="entry.title || '散页详情'"
    class="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/45 backdrop-blur-xs animate-in fade-in duration-200"
    @click.self="handleClose"
  >
    <div
      class="bg-[var(--bg-archive)] border border-[var(--border-subtle)] shadow-[0_20px_60px_rgba(0,0,0,0.15)] w-full max-w-2xl max-h-[88dvh] sm:max-h-[92vh] overflow-y-auto rounded-xs p-4 sm:p-10 text-left relative transition-all pb-[max(1.5rem,env(safe-area-inset-bottom,1.5rem))]"
    >
      <!-- 顶部关闭与操作工具栏 -->
      <div class="flex items-center justify-between pb-6 border-b border-[var(--border-subtle)] mb-8">
        <div class="flex items-center gap-2 font-mono-archive text-xs text-[var(--ink-muted)]">
          <span class="text-[var(--ink-primary)] font-medium">
            {{ parseOccurredDate(entry.occurred_at).dotDate }}
          </span>
          <span v-if="parseOccurredDate(entry.occurred_at).time">· {{ parseOccurredDate(entry.occurred_at).time }}</span>
          <span>·</span>
          <span class="text-[var(--ink-secondary)]">{{ getKindLabel(entry.type) }}</span>
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
            class="p-1 text-[var(--ink-muted)] hover:text-[var(--ink-primary)] cursor-pointer transition-colors"
          >
            <X class="w-5 h-5" />
          </button>
        </div>
      </div>

      <!-- 删除确认浮层 -->
      <div
        v-if="showDeleteConfirm"
        class="mb-6 p-4 bg-red-50/70 border border-red-200 rounded-xs space-y-3 font-serif-editorial text-sm"
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
            {{ isSubmitting ? '正在删除...' : '确认删除' }}
          </button>
        </div>
      </div>

      <!-- 编辑模式 -->
      <form v-if="isEditing" @submit.prevent="handleSaveEdit" class="space-y-6">
        <div v-if="errorMsg" class="p-3 bg-red-50 text-red-700 text-xs rounded-xs border border-red-200">
          {{ errorMsg }}
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div class="space-y-1.5">
            <label class="block text-xs font-mono-archive text-[var(--ink-muted)]">记录形态</label>
            <PaperSelect
              v-model="editType"
              :options="[
                { value: 'life', label: '日常' },
                { value: 'travel', label: '游历' },
                { value: 'project', label: '造物' },
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

        <div class="space-y-1.5">
          <label class="block text-xs font-mono-archive text-[var(--ink-muted)]">正文内容 *</label>
          <textarea
            v-model="editContent"
            rows="6"
            class="w-full px-3 py-2 text-base font-serif-editorial leading-relaxed bg-transparent border border-[var(--border-subtle)] focus:border-[var(--ink-primary)] rounded-xs outline-none resize-y"
          ></textarea>
        </div>

        <!-- 附件管理 -->
        <ImageUploader
          ref="imageUploaderRef"
          :initialAttachments="entry.attachments"
          :storageConfigured="storageConfigured"
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
            <label class="block text-xs font-mono-archive text-[var(--ink-muted)]">
              所在城市
            </label>
            <CityPicker
              v-model="editCityCode"
              :placeholder="editCityName || ''"
              @select="handleEditCitySelect"
            />
          </div>
        </div>

        <div class="space-y-1.5">
          <label class="block text-xs font-mono-archive text-[var(--ink-muted)]">具体地点</label>
          <input
            v-model="editLocation"
            type="text"
            class="w-full px-3 py-2 text-xs font-serif-editorial bg-transparent border border-[var(--border-subtle)] focus:border-[var(--ink-primary)] rounded-xs outline-none"
          />
        </div>

        <!-- 项目关联 -->
        <div v-if="projects && projects.length > 0" class="space-y-1.5">
          <label class="block text-xs font-mono-archive text-[var(--ink-muted)]">关联造物项目</label>
          <PaperSelect
            v-model="editProjectId"
            :options="[
              { value: null, label: '不关联项目' },
              ...projects.map((p) => ({ value: p.id, label: p.title })),
            ]"
          />
        </div>

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
            <Check v-if="!isSubmitting" class="w-3.5 h-3.5" />
            <span>{{ isSubmitting ? '保存中...' : '保存修改' }}</span>
          </button>
        </div>
      </form>

      <!-- 浏览模式 (Editorial 典雅展示) -->
      <article v-else class="space-y-8 font-serif-editorial">
        <!-- 标题 -->
        <h1 v-if="entry.title" class="type-page-heading text-[var(--ink-primary)] leading-snug">
          {{ entry.title }}
        </h1>

        <!-- 大尺寸图片画廊 / 暗房接触印相表 (Contact Sheet) -->
        <div v-if="displayImages.length > 0" class="space-y-3">
          <!-- 当照片 >= 4 张时提供画廊形态切换栏 -->
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

          <!-- 接触印相表 (Contact Sheet 2x2 / 3x3 网格 + 35mm 胶卷齿孔条) -->
          <div
            v-if="displayImages.length >= 4 && galleryViewMode === 'contact'"
            class="p-2.5 sm:p-3.5 bg-[#181716] text-[#F9F8F5] rounded-xs border border-[var(--border-subtle)] space-y-2.5 shadow-inner"
          >
            <div class="flex items-center justify-between text-[11px] font-mono-archive text-[#a8a29e] tracking-widest px-0.5">
              <span>KODAK TRI-X 400 · CONTACT PROOF SHEET</span>
              <span>{{ parseOccurredDate(entry.occurred_at).dotDate }} · {{ displayImages.length }} FRAMES</span>
            </div>
            <!-- 35mm 顶部胶片齿孔装饰 -->
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
                    :alt="entry.title"
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
            <!-- 35mm 底部胶片齿孔装饰 -->
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
                :alt="entry.title"
                class="w-full max-h-[680px] object-cover editorial-image"
                loading="lazy"
               decoding="async">
            </div>
          </div>
        </div>

        <!-- 正文叙事 (支持轻量出版级排版) -->
        <div
          class="text-base sm:text-lg text-[var(--ink-secondary)] leading-relaxed font-normal prose-editorial"
          v-html="renderEditorialContent(entry.content)"
        ></div>

        <!-- 注脚信息：地点、关联造物与关联心愿 -->
        <div class="pt-6 border-t border-[var(--border-subtle)] space-y-2 text-xs font-mono-archive text-[var(--ink-muted)]">
          <div v-if="entry.city_name || entry.location" class="flex items-center gap-2">
            <span>坐标：</span>
            <span class="text-[var(--ink-primary)] font-serif-editorial">{{ entry.city_name || entry.location }}</span>
          </div>

          <div v-if="entry.project" class="flex items-center gap-2">
            <span>关联造物：</span>
            <span class="text-[var(--ink-primary)]">{{ entry.project.title }}</span>
            <a
              v-if="entry.project.github_url"
              :href="entry.project.github_url"
              target="_blank"
              rel="noopener noreferrer"
              class="inline-flex items-center gap-1 text-[var(--ink-primary)] hover-underline ml-2"
            >
              <span>仓库</span>
              <ArrowUpRight class="w-3 h-3" />
            </a>
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
        :title="entry.title || ''"
        :meta="entry.city_name || entry.location || ''"
        :location="entry.location || ''"
        :date="parseOccurredDate(entry.occurred_at).dotDate"
        @close="isLightboxOpen = false"
      />
    </div>
  </div>
</template>
