<script setup lang="ts">
import { ref } from 'vue'
import type { Project } from '../../types'
import { useCategories } from '../../composables/useCategories'
import ImageUploader from '../ImageUploader.vue'
import PaperSelect from '../PaperSelect.vue'
import PaperDatePicker from '../PaperDatePicker.vue'

defineProps<{
  projects?: Project[]
  projectMode: 'new' | 'entry'
  selectedProjectId: number | null
  title: string
  content: string
  occurredAt: string
  projTitle: string
  projSubtitle: string
  projCategory: string
  projStatus: string
  projDescription: string
  projStory: string
  projGithubUrl: string
}>()

const emit = defineEmits<{
  (e: 'update:projectMode', val: 'new' | 'entry'): void
  (e: 'update:selectedProjectId', val: number | null): void
  (e: 'update:title', val: string): void
  (e: 'update:content', val: string): void
  (e: 'update:occurredAt', val: string): void
  (e: 'update:projTitle', val: string): void
  (e: 'update:projSubtitle', val: string): void
  (e: 'update:projCategory', val: string): void
  (e: 'update:projStatus', val: string): void
  (e: 'update:projDescription', val: string): void
  (e: 'update:projStory', val: string): void
  (e: 'update:projGithubUrl', val: string): void
  (e: 'update:attachmentIds', ids: number[]): void
}>()

const { projectCategories, openCategoryManager } = useCategories()
const imageUploaderRef = ref<InstanceType<typeof ImageUploader> | null>(null)

defineExpose({
  uploadFiles: (files: File[]) => imageUploaderRef.value?.uploadFiles(files),
  markCommitted: () => imageUploaderRef.value?.markCommitted(),
})
</script>

<template>
  <div class="space-y-4">
    <!-- 子模式切换：写造物进展手记 vs 立项新造物 -->
    <div v-if="projects && projects.length > 0" class="flex items-center gap-2 pb-1">
      <button
        type="button"
        @click="emit('update:projectMode', 'entry')"
        class="px-3 py-1.5 text-xs font-mono-archive rounded-xs border transition-colors cursor-pointer"
        :class="projectMode === 'entry' ? 'border-[var(--ink-primary)] bg-[var(--bg-subtle)] text-[var(--ink-primary)] font-semibold' : 'border-[var(--border-subtle)] text-[var(--ink-muted)]'"
      >
        撰写已有项目进展手记
      </button>
      <button
        type="button"
        @click="emit('update:projectMode', 'new')"
        class="px-3 py-1.5 text-xs font-mono-archive rounded-xs border transition-colors cursor-pointer"
        :class="projectMode === 'new' ? 'border-[var(--ink-primary)] bg-[var(--bg-subtle)] text-[var(--ink-primary)] font-semibold' : 'border-[var(--border-subtle)] text-[var(--ink-muted)]'"
      >
        ＋ 立项新造物项目
      </button>
    </div>

    <!-- B1: 撰写已有项目的造物进展手记 -->
    <div v-if="projectMode === 'entry' && projects && projects.length > 0" class="space-y-4">
      <div class="space-y-1.5">
        <label class="block text-xs font-mono-archive text-[var(--ink-muted)]">选择造物项目 *</label>
        <PaperSelect
          :modelValue="selectedProjectId"
          @update:modelValue="emit('update:selectedProjectId', $event)"
          :options="projects.map((p) => ({ value: p.id, label: `${p.title} (${p.status || '进行中'})` }))"
        />
      </div>

      <div class="space-y-1.5">
        <label class="block text-xs font-mono-archive text-[var(--ink-muted)]">手记标题</label>
        <input
          :value="title"
          @input="emit('update:title', ($event.target as HTMLInputElement).value)"
          type="text"
          class="w-full px-3 py-2 text-base font-serif-editorial bg-transparent border border-[var(--border-subtle)] focus:border-[var(--ink-primary)] rounded-xs outline-none"
        />
      </div>

      <div class="space-y-1.5">
        <label class="block text-xs font-mono-archive text-[var(--ink-muted)]">进展内容 *</label>
        <textarea
          :value="content"
          @input="emit('update:content', ($event.target as HTMLTextAreaElement).value)"
          rows="5"
          class="w-full px-3 py-2 text-base font-serif-editorial leading-relaxed bg-transparent border border-[var(--border-subtle)] focus:border-[var(--ink-primary)] rounded-xs outline-none resize-none"
        ></textarea>
      </div>

      <ImageUploader
        ref="imageUploaderRef"
        @update:attachments="emit('update:attachmentIds', $event)"
      />

      <div class="space-y-1.5">
        <label class="block text-xs font-mono-archive text-[var(--ink-muted)]">记录时间</label>
        <PaperDatePicker
          :modelValue="occurredAt"
          @update:modelValue="emit('update:occurredAt', $event)"
          enableTime
        />
      </div>
    </div>

    <!-- B2: 立项新造物项目 -->
    <div v-else class="space-y-4">
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div class="space-y-1.5">
          <label class="block text-xs font-mono-archive text-[var(--ink-muted)]">造物名称 *</label>
          <input
            :value="projTitle"
            @input="emit('update:projTitle', ($event.target as HTMLInputElement).value)"
            type="text"
            class="w-full px-3 py-2 text-base font-serif-editorial bg-transparent border border-[var(--border-subtle)] focus:border-[var(--ink-primary)] rounded-xs outline-none"
          />
        </div>
        <div class="space-y-1.5">
          <label class="block text-xs font-mono-archive text-[var(--ink-muted)]">副标题</label>
          <input
            :value="projSubtitle"
            @input="emit('update:projSubtitle', ($event.target as HTMLInputElement).value)"
            type="text"
            class="w-full px-3 py-2 text-sm font-serif-editorial bg-transparent border border-[var(--border-subtle)] focus:border-[var(--ink-primary)] rounded-xs outline-none"
          />
        </div>
      </div>

      <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div class="space-y-1.5">
          <div class="flex items-center justify-between">
            <label class="block text-xs font-mono-archive text-[var(--ink-muted)]">造物分类</label>
            <button
              type="button"
              @click="openCategoryManager('project')"
              class="text-[11px] font-mono-archive text-[var(--ink-secondary)] hover:text-[var(--ink-primary)] underline underline-offset-4 cursor-pointer"
            >
              管理分类
            </button>
          </div>
          <PaperSelect
            :modelValue="projCategory"
            @update:modelValue="emit('update:projCategory', $event)"
            :options="projectCategories.map((c) => ({ value: c, label: c }))"
          />
        </div>
        <div class="space-y-1.5">
          <label class="block text-xs font-mono-archive text-[var(--ink-muted)]">运行状态</label>
          <PaperSelect
            :modelValue="projStatus"
            @update:modelValue="emit('update:projStatus', $event)"
            :options="[
              { value: '进行中', label: '进行中' },
              { value: '已完成', label: '已完成' },
              { value: '维护中', label: '维护中' },
              { value: '已搁置', label: '已搁置' },
            ]"
          />
        </div>
      </div>

      <div class="space-y-1.5">
        <label class="block text-xs font-mono-archive text-[var(--ink-muted)]">项目简介 *</label>
        <textarea
          :value="projDescription"
          @input="emit('update:projDescription', ($event.target as HTMLTextAreaElement).value)"
          rows="2"
          class="w-full px-3 py-2 text-sm font-serif-editorial bg-transparent border border-[var(--border-subtle)] focus:border-[var(--ink-primary)] rounded-xs outline-none resize-none"
        ></textarea>
      </div>

      <div class="space-y-1.5">
        <label class="block text-xs font-mono-archive text-[var(--ink-muted)]">立项初衷</label>
        <textarea
          :value="projStory"
          @input="emit('update:projStory', ($event.target as HTMLTextAreaElement).value)"
          rows="3"
          class="w-full px-3 py-2 text-sm font-serif-editorial bg-transparent border border-[var(--border-subtle)] focus:border-[var(--ink-primary)] rounded-xs outline-none resize-none"
        ></textarea>
      </div>

      <div class="space-y-1.5">
        <label class="block text-xs font-mono-archive text-[var(--ink-muted)]">仓库链接</label>
        <input
          :value="projGithubUrl"
          @input="emit('update:projGithubUrl', ($event.target as HTMLInputElement).value)"
          type="url"
          placeholder="https://github.com/..."
          class="w-full px-3 py-2 text-xs font-mono-archive bg-transparent border border-[var(--border-subtle)] focus:border-[var(--ink-primary)] rounded-xs outline-none"
        />
      </div>

      <ImageUploader
        ref="imageUploaderRef"
        @update:attachments="emit('update:attachmentIds', $event)"
      />
    </div>
  </div>
</template>
