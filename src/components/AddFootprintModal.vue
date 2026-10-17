<script setup lang="ts">
import { ref, watch } from 'vue'
import { X, MapPin, Compass, Check } from 'lucide-vue-next'
import { createFootprint, updateFootprint, getAdminToken } from '../utils/api'
import { audio } from '../utils/audio'
import { getBeijingDateString, getBeijingISOString } from '../utils/format'
import CityPicker from './CityPicker.vue'
import PaperDatePicker from './PaperDatePicker.vue'
import ImageUploader from './ImageUploader.vue'
import {
  getFallbackDefaultCity,
  resolveDefaultCity,
  saveLastUsedCity,
} from '../utils/cities'
import type { Footprint } from '../types'

const props = withDefaults(
  defineProps<{
    isOpen: boolean
    storageConfigured?: boolean
    initialCityCode?: string
    initialCityName?: string
    editingFootprint?: Footprint | null
  }>(),
  {
    storageConfigured: true,
    editingFootprint: null,
  }
)

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'saved', footprint: Footprint): void
  (e: 'requestAuth', callback: () => void): void
}>()

const selectedCityCode = ref('')
const selectedCityName = ref('')
const userManuallyChangedCity = ref(false)
const todayStr = getBeijingDateString()
const visitedAt = ref(todayStr)
const departedAt = ref('')
const title = ref('')
const note = ref('')
const attachmentIds = ref<number[]>([])
const isSubmitting = ref(false)
const errorMsg = ref('')

const applyDefaultCity = () => {
  userManuallyChangedCity.value = false
  const fallback = getFallbackDefaultCity()
  if (fallback) {
    selectedCityCode.value = fallback.code
    selectedCityName.value = fallback.name
  } else {
    selectedCityCode.value = ''
    selectedCityName.value = ''
  }

  resolveDefaultCity().then((resolved) => {
    if (!userManuallyChangedCity.value && resolved) {
      selectedCityCode.value = resolved.code
      selectedCityName.value = resolved.name
    }
  })
}

watch(
  () => props.isOpen,
  (open) => {
    if (open) {
      errorMsg.value = ''
      if (props.editingFootprint) {
        userManuallyChangedCity.value = true
        selectedCityCode.value = props.editingFootprint.city_code
        selectedCityName.value = props.editingFootprint.city_name
        visitedAt.value = props.editingFootprint.visited_at ? props.editingFootprint.visited_at.slice(0, 10) : todayStr
        departedAt.value = props.editingFootprint.departed_at ? props.editingFootprint.departed_at.slice(0, 10) : ''
        title.value = props.editingFootprint.title || ''
        note.value = props.editingFootprint.note || ''
        attachmentIds.value = (props.editingFootprint.attachments || []).map((a) => a.id)
      } else {
        departedAt.value = ''
        title.value = ''
        note.value = ''
        attachmentIds.value = []
        if (props.initialCityCode && props.initialCityName) {
          userManuallyChangedCity.value = true
          selectedCityCode.value = props.initialCityCode
          selectedCityName.value = props.initialCityName
        } else {
          applyDefaultCity()
        }
      }
    }
  },
  { immediate: true }
)

const handleCitySelect = (city: { code: string; name: string }) => {
  userManuallyChangedCity.value = true
  selectedCityCode.value = city.code
  selectedCityName.value = city.name
  if (city.code && city.name) {
    saveLastUsedCity(city)
  }
}

const handleSubmit = async () => {
  if (!selectedCityCode.value || !selectedCityName.value) {
    errorMsg.value = '请检索并选择到访城市'
    return
  }
  if (!visitedAt.value) {
    errorMsg.value = '请选择到访日期'
    return
  }

  if (!getAdminToken()) {
    emit('requestAuth', () => handleSubmit())
    return
  }

  try {
    isSubmitting.value = true
    errorMsg.value = ''
    saveLastUsedCity({
      code: selectedCityCode.value,
      name: selectedCityName.value,
    })

    if (props.editingFootprint) {
      const fp = await updateFootprint(props.editingFootprint.id, {
        city_code: selectedCityCode.value,
        city_name: selectedCityName.value,
        visited_at: getBeijingISOString(visitedAt.value),
        departed_at: departedAt.value ? getBeijingISOString(departedAt.value) : undefined,
        title: title.value.trim() || undefined,
        note: note.value.trim() || undefined,
        attachment_ids: attachmentIds.value,
      })
      audio.playShutter()
      emit('saved', fp)
      emit('close')
    } else {
      const fp = await createFootprint({
        city_code: selectedCityCode.value,
        city_name: selectedCityName.value,
        visited_at: getBeijingISOString(visitedAt.value),
        departed_at: departedAt.value ? getBeijingISOString(departedAt.value) : undefined,
        title: title.value.trim() || undefined,
        note: note.value.trim() || undefined,
        attachment_ids: attachmentIds.value.length > 0 ? attachmentIds.value : undefined,
      })
      audio.playShutter()
      emit('saved', fp)
      emit('close')
    }
  } catch (err: any) {
    if (!getAdminToken()) {
      emit('requestAuth', () => handleSubmit())
      return
    }
    errorMsg.value = err.message || '录入足迹失败'
  } finally {
    isSubmitting.value = false
  }
}
</script>

<template>
  <div
    v-if="isOpen"
    class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[var(--ink-primary)]/40 backdrop-blur-xs animate-in fade-in duration-200"
    @click.self="emit('close')"
  >
    <div
      class="bg-[var(--bg-archive)] border border-[var(--border-subtle)] w-full max-w-lg rounded-xs shadow-2xl p-6 sm:p-8 space-y-6 max-h-[90vh] overflow-y-auto text-left"
    >
      <!-- 弹窗标头 -->
      <div class="flex items-start justify-between pb-4 border-b border-[var(--border-subtle)]">
        <div>
          <div class="flex items-center gap-2">
            <Compass class="w-5 h-5 text-[var(--accent-warm)]" />
            <h2 class="font-serif-editorial text-2xl text-[var(--ink-primary)] font-medium">
              {{ editingFootprint ? '修订山河足迹' : '补录城市足迹' }}
            </h2>
          </div>
          <p class="font-serif-editorial text-xs text-[var(--ink-muted)] mt-1">
            {{ editingFootprint ? '修订山河图谱票根与旅途记忆。' : '点亮山川图谱。支持多日行程跨度，后续多篇游记与账单可挂载或自动聚合成同一次旅程。' }}
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
        <!-- 城市选择 -->
        <div>
          <label class="block text-[11px] text-[var(--ink-muted)] mb-1">到访城市 *</label>
          <CityPicker
            v-model="selectedCityCode"
            placeholder="搜索城市..."
            @select="handleCitySelect"
          />
          <div v-if="selectedCityName" class="mt-1.5 flex items-center gap-1.5 text-[11px] text-[var(--accent-moss)]">
            <MapPin class="w-3.5 h-3.5" />
            <span>已选定城市：{{ selectedCityName }} ({{ selectedCityCode }})</span>
          </div>
        </div>

        <!-- 启程与返程日期 (支持单日与多日行程) -->
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label class="block text-[11px] text-[var(--ink-muted)] mb-1">启程 / 到访日期 *</label>
            <PaperDatePicker
              v-model="visitedAt"
              placeholder="选择到访日期..."
            />
          </div>
          <div>
            <label class="block text-[11px] text-[var(--ink-muted)] mb-1">返程日期</label>
            <PaperDatePicker
              v-model="departedAt"
              placeholder="选择返程日期..."
            />
          </div>
        </div>

        <!-- 行旅标题 -->
        <div>
          <label class="block text-[11px] text-[var(--ink-muted)] mb-1">旅程主题 / 行旅标题</label>
          <input
            v-model="title"
            type="text"
            placeholder="行旅标题"
            class="w-full px-3 py-2 bg-[var(--bg-archive)] border border-[var(--border-subtle)] focus:border-[var(--ink-primary)] rounded-xs outline-none text-xs text-[var(--ink-primary)] font-serif-editorial"
          />
        </div>

        <!-- 足迹简注 / 随笔 -->
        <div>
          <label class="block text-[11px] text-[var(--ink-muted)] mb-1">足迹简注 / 行旅随笔</label>
          <textarea
            v-model="note"
            rows="3"
            placeholder="记下一缕风、一碗热汤或一处驻足..."
            class="w-full px-3 py-2 bg-[var(--bg-archive)] border border-[var(--border-subtle)] focus:border-[var(--ink-primary)] rounded-xs outline-none text-xs text-[var(--ink-primary)] font-serif-editorial leading-relaxed"
          ></textarea>
        </div>

        <!-- 旅途影像上传 -->
        <ImageUploader
          :storageConfigured="storageConfigured"
          :initialAttachments="editingFootprint?.attachments"
          @update:attachments="(ids) => (attachmentIds = ids)"
        />

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
            class="px-5 py-1.5 text-xs bg-[var(--ink-primary)] text-[var(--bg-archive)] rounded-xs hover:opacity-90 transition-opacity cursor-pointer font-serif-editorial inline-flex items-center gap-1.5"
          >
            <Check class="w-3.5 h-3.5" />
            <span>{{ isSubmitting ? '正在保存...' : (editingFootprint ? '保存足迹修订' : '点亮城市足迹') }}</span>
          </button>
        </div>
      </form>
    </div>
  </div>
</template>
