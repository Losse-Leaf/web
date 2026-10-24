<script setup lang="ts">
import { ref, watch } from 'vue'
import { X, Sparkles } from 'lucide-vue-next'
import { createWish, updateWish, getAdminToken } from '../utils/api'
import { getBeijingDateString } from '../utils/format'
import type { Wish, Attachment } from '../types'
import CityPicker from './CityPicker.vue'
import PaperDatePicker from './PaperDatePicker.vue'
import ImageUploader from './ImageUploader.vue'
import { useBodyScrollLock } from '../composables/useBodyScrollLock'

const props = defineProps<{
  isOpen: boolean
  editingWish?: Wish | null
  storageConfigured?: boolean
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'saved', wish: Wish): void
  (e: 'requestAuth', callback: () => void): void
}>()

const kind = ref<'item' | 'travel' | 'milestone'>('item')
const title = ref('')
const note = ref('')
const spec = ref('')
const cityName = ref('')
const cityCode = ref('')
const budgetYuan = ref('')
const targetDate = ref('')
/** 补档：许下日期（可回填为过去），默认今天 */
const plantedAt = ref(getBeijingDateString())
const attachments = ref<Attachment[]>([])
const attachmentIds = ref<number[]>([])
// 附件上传器引用：保存成功后 markCommitted，避免卸载时把已绑定参考图当孤儿清理
const imageUploaderRef = ref<InstanceType<typeof ImageUploader> | null>(null)
const isSubmitting = ref(false)
const errorMsg = ref('')

const onCityPicked = (city: { code: string; name: string }) => {
  cityCode.value = city.code
  cityName.value = city.name
}

watch(
  () => props.editingWish,
  (w) => {
    if (w) {
      kind.value = w.kind
      title.value = w.title
      note.value = w.note || ''
      spec.value = w.spec || ''
      cityName.value = w.city_name || ''
      cityCode.value = w.city_code || ''
      budgetYuan.value = w.budget > 0 ? (w.budget / 100).toFixed(2) : ''
      targetDate.value = w.target_date ? w.target_date.slice(0, 10) : ''
      plantedAt.value = w.planted_at ? w.planted_at.slice(0, 10) : getBeijingDateString()
      attachments.value = w.attachments ? [...w.attachments] : []
      attachmentIds.value = attachments.value.map((a) => a.id)
    } else {
      kind.value = 'item'
      title.value = ''
      note.value = ''
      spec.value = ''
      cityName.value = ''
      cityCode.value = ''
      budgetYuan.value = ''
      targetDate.value = ''
      plantedAt.value = getBeijingDateString()
      attachments.value = []
      attachmentIds.value = []
    }
    errorMsg.value = ''
  },
  { immediate: true }
)

const handleSubmit = async () => {
  const t = title.value.trim()
  if (!t) {
    errorMsg.value = '请输入心愿名称'
    return
  }

  if (!getAdminToken()) {
    emit('requestAuth', () => {
      handleSubmit()
    })
    return
  }

  let budgetCents = 0
  if (budgetYuan.value.trim()) {
    const val = parseFloat(budgetYuan.value.trim())
    if (!isNaN(val) && val >= 0) {
      budgetCents = Math.round(val * 100)
    }
  }

  try {
    isSubmitting.value = true
    errorMsg.value = ''

    if (props.editingWish) {
      const updated = await updateWish(props.editingWish.id, {
        title: t,
        kind: kind.value,
        note: note.value.trim() || undefined,
        spec: kind.value === 'item' ? spec.value.trim() || undefined : undefined,
        city_name: kind.value === 'travel' ? cityName.value.trim() || undefined : undefined,
        city_code: kind.value === 'travel' ? cityCode.value.trim() || undefined : undefined,
        budget: budgetCents,
        target_date: targetDate.value || undefined,
        planted_at: plantedAt.value || undefined,
        attachment_ids: attachmentIds.value,
        // 关键：**显式声明**「本次要解除全部参考图绑定」。
        // 后端的新契约是「空数组但不带 clear_attachments → 保持原样」，
        // 因为已发布的老客户端（数组不可选，默认 []）压根不知道可以不传 ——
        // 于是在没有附件 UI 的 mac 编辑弹窗里改个标题，
        // 服务端也会把该心愿的照片解绑（跨端更刺眼：
        // 用 web 传了图，再用 mac 改个字，图片就没了）。
        // 这里要真正清空图片时必须带上这个信号。
        clear_attachments: attachmentIds.value.length === 0,
      })
      emit('saved', updated)
    } else {
      const created = await createWish({
        title: t,
        kind: kind.value,
        note: note.value.trim() || undefined,
        spec: kind.value === 'item' ? spec.value.trim() || undefined : undefined,
        city_name: kind.value === 'travel' ? cityName.value.trim() || undefined : undefined,
        city_code: kind.value === 'travel' ? cityCode.value.trim() || undefined : undefined,
        budget: budgetCents,
        target_date: targetDate.value || undefined,
        planted_at: plantedAt.value || undefined,
        attachment_ids: attachmentIds.value.length > 0 ? attachmentIds.value : undefined,
      })
      emit('saved', created)
    }
    // 参考图已随心愿落库绑定，标记后上传器卸载不再回收这些文件
    imageUploaderRef.value?.markCommitted()
    emit('close')
  } catch (err: any) {
    if (!getAdminToken()) {
      emit('requestAuth', () => {
        handleSubmit()
      })
      return
    }
    errorMsg.value = err.message || '保存心愿失败'
  } finally {
    isSubmitting.value = false
  }
}

  // MOB-P1-66：弹窗打开期间锁定背景页面滚动（此前只有灯箱锁了）
  useBodyScrollLock(() => props.isOpen)
</script>

<template>
  <div
    v-if="isOpen"
    class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[var(--ink-primary)]/40 backdrop-blur-xs animate-in fade-in duration-200"
    @click.self="emit('close')"
  >
    <div
      class="bg-[var(--bg-archive)] border border-[var(--border-subtle)] w-full max-w-lg rounded-xs shadow-2xl p-6 sm:p-8 space-y-6 max-h-[90dvh] overflow-y-auto text-left pb-[max(1.5rem,env(safe-area-inset-bottom,1.5rem))]"
    >
      <!-- 弹窗标头 -->
      <div class="flex items-start justify-between pb-4 border-b border-[var(--border-subtle)]">
        <div>
          <div class="flex items-center gap-2">
            <Sparkles class="w-5 h-5 text-[var(--accent-warm)]" />
            <h2 class="font-serif-editorial text-2xl text-[var(--ink-primary)] font-medium">
              {{ editingWish ? '编辑心愿' : '许下心愿' }}
            </h2>
          </div>
          <p class="font-serif-editorial text-xs text-[var(--ink-muted)] mt-1">
            无截止死线、无焦虑进度条。忠实记录生活的向往、行旅期待与人生进阶。
          </p>
        </div>
        <button
          @click="emit('close')"
          class="text-[var(--ink-muted)] hover:text-[var(--ink-primary)] p-1 cursor-pointer transition-colors"
        >
          <X class="w-4 h-4" />
        </button>
      </div>

      <!-- 错误提示 -->
      <div v-if="errorMsg" class="p-3 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800/40 text-red-700 dark:text-red-300 text-xs font-mono-archive rounded-xs">
        {{ errorMsg }}
      </div>

      <form @submit.prevent="handleSubmit" class="space-y-5 font-mono-archive text-xs">
        <!-- 三维心愿分类选择器 -->
        <div>
          <label class="block text-[11px] text-[var(--ink-muted)] mb-2">心愿维度类别 *</label>
          <div class="grid grid-cols-3 gap-2">
            <button
              type="button"
              @click="kind = 'item'"
              class="py-2 px-3 border rounded-xs text-xs font-serif-editorial text-center cursor-pointer transition-colors"
              :class="kind === 'item' ? 'border-[var(--ink-primary)] bg-[var(--ink-primary)] text-[var(--bg-archive)]' : 'border-[var(--border-subtle)] hover:border-[var(--ink-primary)] text-[var(--ink-primary)]'"
            >
              好物
            </button>
            <button
              type="button"
              @click="kind = 'travel'"
              class="py-2 px-3 border rounded-xs text-xs font-serif-editorial text-center cursor-pointer transition-colors"
              :class="kind === 'travel' ? 'border-[var(--ink-primary)] bg-[var(--ink-primary)] text-[var(--bg-archive)]' : 'border-[var(--border-subtle)] hover:border-[var(--ink-primary)] text-[var(--ink-primary)]'"
            >
              旅程
            </button>
            <button
              type="button"
              @click="kind = 'milestone'"
              class="py-2 px-3 border rounded-xs text-xs font-serif-editorial text-center cursor-pointer transition-colors"
              :class="kind === 'milestone' ? 'border-[var(--ink-primary)] bg-[var(--ink-primary)] text-[var(--bg-archive)]' : 'border-[var(--border-subtle)] hover:border-[var(--ink-primary)] text-[var(--ink-primary)]'"
            >
              里程碑
            </button>
          </div>
        </div>

        <!-- 标题 -->
        <div>
          <label class="block text-[11px] text-[var(--ink-muted)] mb-1">心愿标题 *</label>
          <input
            v-model="title"
            type="text"
            required
            class="w-full px-3 py-2 bg-[var(--bg-archive)] border border-[var(--border-subtle)] focus:border-[var(--ink-primary)] rounded-xs outline-none text-sm text-[var(--ink-primary)] font-serif-editorial"
          />
        </div>

        <!-- 好物专属：期望规格型号 -->
        <div v-if="kind === 'item'">
          <label class="block text-[11px] text-[var(--ink-muted)] mb-1">规格型号</label>
          <input
            v-model="spec"
            type="text"
            class="w-full px-3 py-1.5 bg-[var(--bg-archive)] border border-[var(--border-subtle)] focus:border-[var(--ink-primary)] rounded-xs outline-none text-xs text-[var(--ink-primary)]"
          />
        </div>

        <!-- 旅程专属：目标城市 (接入 CityPicker.vue 自动绑定行政代码 RC-58) -->
        <div v-if="kind === 'travel'" class="space-y-3">
          <div>
            <label class="block text-[11px] text-[var(--ink-muted)] mb-1">目的地城市</label>
            <CityPicker
              v-model="cityCode"
              @select="onCityPicked"
            />
          </div>
          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="block text-[11px] text-[var(--ink-muted)] mb-1">目的地城市名</label>
              <input
                v-model="cityName"
                type="text"
                class="w-full px-3 py-1.5 bg-[var(--bg-archive)] border border-[var(--border-subtle)] focus:border-[var(--ink-primary)] rounded-xs outline-none text-xs text-[var(--ink-primary)]"
              />
            </div>
            <div>
              <label class="block text-[11px] text-[var(--ink-muted)] mb-1">行政代码</label>
              <input
                v-model="cityCode"
                type="text"
                class="w-full px-3 py-1.5 bg-[var(--bg-archive)] border border-[var(--border-subtle)] focus:border-[var(--ink-primary)] rounded-xs outline-none text-xs text-[var(--ink-primary)]"
              />
            </div>
          </div>
        </div>

        <!-- 预算与目标期 -->
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label class="block text-[11px] text-[var(--ink-muted)] mb-1">预估预算 (¥)</label>
            <div class="relative">
              <span class="absolute left-2.5 top-1.5 text-[var(--ink-muted)]">¥</span>
              <input
                v-model="budgetYuan"
                type="number"
                step="0.01"
                placeholder="0.00"
                class="w-full pl-6 pr-3 py-1.5 bg-[var(--bg-archive)] border border-[var(--border-subtle)] focus:border-[var(--ink-primary)] rounded-xs outline-none text-xs text-[var(--ink-primary)]"
              />
            </div>
          </div>

          <div>
            <label class="block text-[11px] text-[var(--ink-muted)] mb-1">愿景目标期</label>
            <PaperDatePicker
              v-model="targetDate"
              clearable
            />
          </div>

          <div>
            <label class="block text-[11px] text-[var(--ink-muted)] mb-1">许下日期</label>
            <PaperDatePicker v-model="plantedAt" />
            <p class="mt-1 text-[10px] font-mono-archive text-[var(--ink-muted)]">
              可选择过去的日期补录旧心愿
            </p>
          </div>
        </div>

        <!-- 向往初心与愿景说明 -->
        <div>
          <label class="block text-[11px] text-[var(--ink-muted)] mb-1">向往初心与规划</label>
          <textarea
            v-model="note"
            rows="3"
            class="w-full px-3 py-2 bg-[var(--bg-archive)] border border-[var(--border-subtle)] focus:border-[var(--ink-primary)] rounded-xs outline-none text-xs text-[var(--ink-primary)] font-serif-editorial leading-relaxed"
          ></textarea>
        </div>

        <!-- 心愿参考配图上传 -->
        <div class="space-y-1.5">
          <label class="block text-[11px] text-[var(--ink-muted)]">心愿参考照片与灵感剪报</label>
          <ImageUploader
            ref="imageUploaderRef"
            :initialAttachments="attachments"
            :storageConfigured="storageConfigured ?? true"
            @update:attachments="attachmentIds = $event"
          />
        </div>

        <!-- 底部提交操作 -->
        <div class="flex items-center justify-end gap-3 pt-4 border-t border-[var(--border-subtle)]">
          <button
            @click="emit('close')"
            type="button"
            class="px-3.5 py-1.5 text-xs border border-[var(--border-subtle)] hover:border-[var(--ink-primary)] rounded-xs text-[var(--ink-muted)] hover:text-[var(--ink-primary)] cursor-pointer transition-colors"
          >
            取消
          </button>
          <button
            type="submit"
            :disabled="isSubmitting"
            class="px-5 py-1.5 text-xs bg-[var(--ink-primary)] text-[var(--bg-archive)] rounded-xs hover:opacity-90 transition-opacity cursor-pointer font-serif-editorial"
          >
            {{ isSubmitting ? '保存中...' : (editingWish ? '保存修改' : '确认许下心愿') }}
          </button>
        </div>
      </form>
    </div>
  </div>
</template>
