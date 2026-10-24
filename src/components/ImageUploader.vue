<script setup lang="ts">
import { ref, reactive, onUnmounted } from 'vue'
import { Plus, X, RotateCcw } from 'lucide-vue-next'
import { uploadUnifiedFile, cleanupUploads } from '../utils/api'
import { audio } from '../utils/audio'
import { showAlert } from '../composables/useConfirm'
import { compressClientImage } from '../utils/imageCompressor'
import type { Attachment } from '../types'

const props = defineProps<{
  initialAttachments?: Attachment[]
  storageConfigured: boolean
}>()

const emit = defineEmits<{
  (e: 'update:attachments', ids: number[]): void
}>()

interface UploadItem {
  id: string
  file?: File
  name: string
  size: number
  previewUrl: string
  progress: number
  status: 'idle' | 'uploading' | 'completed' | 'error'
  errorMsg?: string
  attachmentId?: number
  objectKey?: string
  /** MOB-P0-16：允许用户主动取消正在进行的上传 */
  abort?: AbortController
}

const items = ref<UploadItem[]>(
  (props.initialAttachments || []).map((att) => ({
    id: `existing-${att.id}`,
    name: att.original_filename || 'image',
    size: att.size || 0,
    previewUrl: att.url,
    progress: 100,
    status: 'completed',
    attachmentId: att.id,
    objectKey: att.object_key,
  }))
)

const fileInputRef = ref<HTMLInputElement | null>(null)
const isDragging = ref(false)

// 本次会话上传的附件是否已随条目/心愿/足迹「落库绑定」。
// false 时组件卸载（用户取消发布 / 关闭弹窗）会把已完成上传的 object_key
// 当孤儿文件回传服务端清理；true 后不再清理（附件已绑定，删了会把已发布内容弄坏图）。
const committed = ref(false)
const markCommitted = () => {
  committed.value = true
}

const triggerSelect = () => {
  fileInputRef.value?.click()
}

const notifyChange = () => {
  const ids = items.value
    .filter((it) => it.status === 'completed' && it.attachmentId)
    .map((it) => it.attachmentId!)
  emit('update:attachments', ids)
}

// MOB-P0-16：原先所有文件同时进入 handleFileProcess（并发全分辨率解码），
// 一次选 6 张 12MP 照片 ≈ 290MB ⇒ iOS Safari 直接内存崩溃。
// 现在改为「串行队列」：一次只解码 + 上传一张，峰值内存与单张照片同量级。
let fileQueue: Promise<void> = Promise.resolve()
let destroyed = false

const enqueueFile = (file: File) => {
  if (destroyed) return fileQueue
  fileQueue = fileQueue.then(() => handleFileProcess(file)).catch(() => {})
  return fileQueue
}

const handleFileProcess = async (file: File) => {
  if (destroyed) return
  // 单文件 50MB 上限，与后端统一中转接口及 docs 契约一致 (FE-16)
  if (file.size > 50 * 1024 * 1024) {
    showAlert({ title: '文件过大', message: `文件 ${file.name} 超过 50MB 上限`, danger: true })
    return
  }

  // 客户端智能压制（限制 2048px / 82% 质量 JPEG，与 Android 端契约一致）
  const compressedFile = await compressClientImage(file)
  if (destroyed) return
  const previewUrl = URL.createObjectURL(compressedFile)
  if (destroyed) {
    URL.revokeObjectURL(previewUrl)
    return
  }
  const item = reactive<UploadItem>({
    id: `${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    file: compressedFile,
    name: compressedFile.name,
    size: compressedFile.size,
    previewUrl,
    progress: 0,
    status: 'idle',
  })

  items.value.push(item)
  await startUpload(item)
}

const startUpload = async (item: UploadItem) => {
  if (!item.file || destroyed) return

  const controller = new AbortController()
  item.abort = controller

  try {
    item.status = 'uploading'
    item.progress = 10
    item.errorMsg = undefined

    const res = await uploadUnifiedFile(
      item.file,
      // 必须与后端白名单一致（entries / avatar / covers / audio）。
      // 原先传的是单数 'entry'，后端会以 400「不支持的存储归类目录」拒绝，
      // 网页端所有散页配图上传实际上都失败了。
      'entries',
      (pct) => {
        item.progress = Math.max(10, pct)
      },
      controller.signal
    )

    item.attachmentId = res.attachment_id
    item.objectKey = res.object_key
    if (destroyed) {
      // 上传在组件卸载后才完成：服务端已落下附件，必须按孤儿文件回收。
      if (!committed.value) cleanupUploads([res.object_key])
      return
    }
    item.status = 'completed'
    item.progress = 100
    audio.playShutter()
    notifyChange()
  } catch (err: any) {
    if (controller.signal.aborted) {
      item.status = 'error'
      item.errorMsg = '上传已取消'
      return
    }
    item.status = 'error'
    item.errorMsg = err.message || '上传失败'
  } finally {
    item.abort = undefined
  }
}

const cancelUpload = (item: UploadItem) => {
  try {
    item.abort?.abort()
  } catch {
    // ignore
  }
}

const onFilesSelected = (e: Event) => {
  const target = e.target as HTMLInputElement
  if (!target.files) return
  Array.from(target.files).forEach((f) => enqueueFile(f))
  target.value = ''
}

const onDrop = (e: DragEvent) => {
  isDragging.value = false
  if (!e.dataTransfer?.files) return
  Array.from(e.dataTransfer.files).forEach((f) => enqueueFile(f))
}

const uploadFiles = (files: File[]) => {
  files.forEach((f) => {
    if (f.type.startsWith('image/')) {
      enqueueFile(f)
    }
  })
}

const onPaste = (e: ClipboardEvent) => {
  const clipboardItems = e.clipboardData?.items
  if (!clipboardItems) return
  const imageFiles: File[] = []
  for (let i = 0; i < clipboardItems.length; i++) {
    const item = clipboardItems[i]
    if (item.type.startsWith('image/')) {
      const f = item.getAsFile()
      if (f) imageFiles.push(f)
    }
  }
  if (imageFiles.length > 0) {
    e.preventDefault()
    uploadFiles(imageFiles)
  }
}

defineExpose({
  uploadFiles,
  markCommitted,
})

const removeItem = (item: UploadItem) => {
  if (item.objectKey && !item.id.startsWith('existing-')) {
    cleanupUploads([item.objectKey])
  }
  if (item.previewUrl.startsWith('blob:')) {
    URL.revokeObjectURL(item.previewUrl)
  }
  items.value = items.value.filter((it) => it.id !== item.id)
  notifyChange()
}

onUnmounted(() => {
  destroyed = true
  items.value.forEach((it) => {
    try {
      it.abort?.abort()
    } catch {
      // ignore
    }
    if (it.previewUrl.startsWith('blob:')) {
      URL.revokeObjectURL(it.previewUrl)
    }
  })
  // 弹窗关闭 / 取消发布且附件未随条目提交：回收本次会话上传的孤儿文件。
  // 「existing-」前缀的是已绑定条目的历史附件，绝不能清。
  if (!committed.value) {
    const orphanKeys = items.value
      .filter((it) => it.objectKey && !it.id.startsWith('existing-') && it.status === 'completed')
      .map((it) => it.objectKey!)
    if (orphanKeys.length > 0) {
      cleanupUploads(orphanKeys)
    }
    // 组件因切换记录形态而卸载时，父层共享的 attachmentIds 必须同步清空，
    // 否则「日常传图 → 切到账目 → 再切回」会留下已被回收的附件 ID。
    emit('update:attachments', [])
  }
})
</script>

<template>
  <div class="space-y-3 select-none">
    <div class="flex items-center justify-between text-xs font-mono-archive text-[var(--ink-muted)]">
      <span>照片 / 附件</span>
      <span class="text-[11px]">
        单张图片最大 50MB
      </span>
    </div>

    <!-- 缩略图列表与添加区域 -->
    <div
      class="border border-dashed rounded-xs p-4 transition-colors duration-150"
      :class="isDragging ? 'border-[var(--ink-primary)] bg-[var(--bg-subtle)]' : 'border-[var(--border-subtle)] hover:border-[var(--border-divider)]'"
      @dragover.prevent="isDragging = true"
      @dragleave.prevent="isDragging = false"
      @drop.prevent="onDrop"
      @paste="onPaste"
    >
      <!-- 隐藏的文件选择器 -->
      <input
        ref="fileInputRef"
        type="file"
        multiple
        accept="image/jpeg,image/png,image/webp,image/gif,image/heic,image/heif"
        class="hidden"
        @change="onFilesSelected"
      />

      <div class="flex flex-wrap gap-3 items-center">
        <!-- 已选/上传中的缩略图 -->
        <div
          v-for="item in items"
          :key="item.id"
          class="relative w-24 h-24 rounded-xs overflow-hidden border border-[var(--border-subtle)] group bg-[var(--bg-subtle)] shrink-0"
        >
          <img
            :src="item.previewUrl"
            :alt="item.name"
            class="w-full h-full object-cover"
           loading="lazy" decoding="async">

          <!-- 进度遮罩 -->
          <div
            v-if="item.status === 'uploading'"
            class="absolute inset-0 bg-black/50 flex flex-col items-center justify-center text-white text-[11px] font-mono-archive"
          >
            <span>{{ item.progress }}%</span>
            <div class="w-16 h-1 bg-white/30 rounded-full mt-1 overflow-hidden">
              <div
                class="h-full bg-white transition-all duration-150"
                :style="{ width: `${item.progress}%` }"
              />
            </div>
            <button
              type="button"
              @click.stop="cancelUpload(item)"
              class="mt-1 px-2 py-0.5 text-[11px] bg-white/20 rounded-full cursor-pointer"
            >
              取消
            </button>
          </div>

          <!-- 失败状态 -->
          <div
            v-if="item.status === 'error'"
            class="absolute inset-0 bg-black/60 flex flex-col items-center justify-center text-white p-1 text-center"
          >
            <span class="text-[11px] text-red-300 truncate max-w-full">
              {{ item.errorMsg || '上传失败' }}
            </span>
            <button
              type="button"
              @click.stop="startUpload(item)"
              class="mt-1 p-1 hover:bg-white/20 rounded-full cursor-pointer"
              title="重试"
            >
              <RotateCcw class="w-3.5 h-3.5 text-white" />
            </button>
          </div>

          <!-- 删除按钮（MOB-P1-89：触屏没有 hover，必须常驻可见，否则手机上永远删不掉照片） -->
          <button
            type="button"
            @click.stop="removeItem(item)"
            class="absolute top-1 right-1 w-7 h-7 bg-black/65 hover:bg-black/80 text-white rounded-full flex items-center justify-center opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity cursor-pointer"
            title="删除"
            aria-label="删除这张照片"
          >
            <X class="w-3.5 h-3.5" />
          </button>
        </div>

        <!-- 添加按钮 -->
        <button
          type="button"
          @click="triggerSelect"
          class="w-24 h-24 border border-dashed border-[var(--border-subtle)] hover:border-[var(--ink-secondary)] rounded-xs flex flex-col items-center justify-center gap-1 text-[var(--ink-muted)] hover:text-[var(--ink-primary)] transition-colors cursor-pointer shrink-0"
        >
          <Plus class="w-4 h-4" />
          <span class="text-[11px] font-mono-archive">添加照片</span>
        </button>

        <div v-if="items.length === 0" class="text-xs text-[var(--ink-muted)] font-serif-editorial ml-2">
          点击添加照片（可从相册选择或直接拍摄）
        </div>
      </div>
    </div>
  </div>
</template>
