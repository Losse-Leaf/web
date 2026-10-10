<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import type { Project } from '../types'
import { ArrowUpRight, Github, Globe, Plus, Edit2, Trash2, X, AlertTriangle } from 'lucide-vue-next'
import { createProject, updateProject, deleteProject } from '../utils/api'
import PaperSelect from './PaperSelect.vue'

const props = defineProps<{
  projects: Project[]
}>()

const emit = defineEmits<{
  (e: 'projectCreated', project: Project): void
  (e: 'projectUpdated', project: Project): void
  (e: 'projectDeleted', id: number): void
}>()

const localProjects = ref<Project[]>([])
watch(
  () => props.projects,
  (list) => {
    localProjects.value = [...(list || [])]
  },
  { immediate: true, deep: true }
)

const activeCategory = ref<string>('all')

const categories = computed(() => {
  const set = new Set<string>()
  localProjects.value.forEach((p) => {
    if (p.category) set.add(p.category)
  })
  return Array.from(set)
})

const filteredProjects = computed(() => {
  if (activeCategory.value === 'all') return localProjects.value
  return localProjects.value.filter((p) => p.category === activeCategory.value)
})

// 弹窗状态与表单 (RG-10)
const isModalOpen = ref(false)
const editingId = ref<number | null>(null)
const isSubmitting = ref(false)
const formError = ref<string | null>(null)

const formTitle = ref('')
const formSubtitle = ref('')
const formCategory = ref('')
const formStatus = ref('Active')
const formDescription = ref('')
const formStory = ref('')
const formTags = ref('')
const formGithubUrl = ref('')

const openCreateModal = () => {
  editingId.value = null
  formTitle.value = ''
  formSubtitle.value = ''
  formCategory.value = activeCategory.value === 'all' ? '开源项目' : activeCategory.value
  formStatus.value = 'Active'
  formDescription.value = ''
  formStory.value = ''
  formTags.value = ''
  formGithubUrl.value = ''
  formError.value = null
  isModalOpen.value = true
}

const openEditModal = (proj: Project) => {
  editingId.value = proj.id
  formTitle.value = proj.title || ''
  formSubtitle.value = proj.subtitle || ''
  formCategory.value = proj.category || '开源项目'
  formStatus.value = proj.status || 'Active'
  formDescription.value = proj.description || ''
  formStory.value = proj.story || ''
  formTags.value = proj.tags || ''
  formGithubUrl.value = proj.github_url || ''
  formError.value = null
  isModalOpen.value = true
}

const handleSave = async () => {
  if (!formTitle.value.trim()) {
    formError.value = '造物项目名称不能为空'
    return
  }

  try {
    isSubmitting.value = true
    formError.value = null
    const payload = {
      title: formTitle.value.trim(),
      subtitle: formSubtitle.value.trim(),
      category: formCategory.value.trim() || '其他造物',
      status: formStatus.value.trim() || 'Active',
      description: formDescription.value.trim(),
      story: formStory.value.trim(),
      tags: formTags.value.trim(),
      github_url: formGithubUrl.value.trim(),
    }

    if (editingId.value) {
      const updated = await updateProject(editingId.value, payload)
      const idx = localProjects.value.findIndex((p) => p.id === editingId.value)
      if (idx !== -1) localProjects.value[idx] = updated
      emit('projectUpdated', updated)
    } else {
      const created = await createProject(payload)
      localProjects.value = [created, ...localProjects.value]
      emit('projectCreated', created)
    }
    isModalOpen.value = false
  } catch (err: any) {
    formError.value = err.message || '保存失败'
  } finally {
    isSubmitting.value = false
  }
}

const handleDelete = async (id: number) => {
  if (!confirm('确定要删除此造物项目吗？')) return
  try {
    await deleteProject(id)
    localProjects.value = localProjects.value.filter((p) => p.id !== id)
    emit('projectDeleted', id)
  } catch (err: any) {
    alert(err.message || '删除失败')
  }
}

const isGitHubUrl = (url?: string) => {
  return url && url.includes('github.com')
}
</script>

<template>
  <div class="max-w-4xl mx-auto px-4 sm:px-8 py-10 sm:py-20 text-left">
    
    <!-- 标头 -->
    <header class="pb-10 border-b border-[var(--border-subtle)] mb-8 space-y-3">
      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div class="space-y-1">
          <div class="flex items-center gap-3">
            <h1 class="font-serif-editorial text-4xl sm:text-5xl font-normal text-[var(--ink-primary)]">
              造物
            </h1>
            <span class="font-mono-archive text-xs tracking-widest text-[var(--ink-muted)]">
              造物工坊与实践
            </span>
          </div>
          <p class="font-serif-editorial text-sm sm:text-base text-[var(--ink-secondary)] pt-1">
            记录亲手创造的作品、长线实践与投入热忱的尝试。
          </p>
        </div>

        <button
          @click="openCreateModal"
          class="self-start sm:self-auto inline-flex items-center gap-1.5 px-4 py-2 bg-[var(--ink-primary)] text-[var(--bg-archive)] hover:opacity-90 rounded-xs font-mono-archive text-xs transition-opacity cursor-pointer shrink-0"
        >
          <Plus class="w-3.5 h-3.5" />
          <span>新建造物</span>
        </button>
      </div>
    </header>

    <!-- 类别视角筛选 (秩序感纸签胶囊样式 RC-52) -->
    <div
      v-if="categories.length > 1"
      class="flex flex-wrap items-center gap-2 mb-10 text-xs font-mono-archive border-b border-[var(--border-subtle)] pb-4"
    >
      <button
        @click="activeCategory = 'all'"
        class="px-3 py-1.5 rounded-xs border transition-all cursor-pointer"
        :class="
          activeCategory === 'all'
            ? 'border-[var(--ink-primary)] bg-[var(--ink-primary)] text-[var(--bg-archive)] font-medium shadow-xs'
            : 'border-[var(--border-subtle)] text-[var(--ink-secondary)] hover:border-[var(--border-divider)] hover:text-[var(--ink-primary)]'
        "
      >
        全部 ({{ localProjects.length }})
      </button>
      <button
        v-for="cat in categories"
        :key="cat"
        @click="activeCategory = cat"
        class="px-3 py-1.5 rounded-xs border transition-all cursor-pointer"
        :class="
          activeCategory === cat
            ? 'border-[var(--ink-primary)] bg-[var(--ink-primary)] text-[var(--bg-archive)] font-medium shadow-xs'
            : 'border-[var(--border-subtle)] text-[var(--ink-secondary)] hover:border-[var(--border-divider)] hover:text-[var(--ink-primary)]'
        "
      >
        {{ cat }} ({{ localProjects.filter(p => p.category === cat).length }})
      </button>
    </div>

    <!-- 空状态 (真实空态 RC-38) -->
    <div
      v-if="filteredProjects.length === 0"
      class="py-24 text-center space-y-4 font-serif-editorial text-[var(--ink-muted)] border border-dashed border-[var(--border-subtle)] rounded-xs"
    >
      <p class="text-xl text-[var(--ink-primary)]">
        暂无造物记录
      </p>
      <p class="font-mono-archive text-xs tracking-wider max-w-sm mx-auto text-[var(--ink-secondary)]">
        生活是一场长线造物。点击下方按钮登记你的第一个实践项目或手艺作品。
      </p>
      <div class="pt-2">
        <button
          @click="openCreateModal"
          class="inline-flex items-center gap-1.5 px-4 py-2 bg-[var(--ink-primary)] text-[var(--bg-archive)] rounded-xs font-mono-archive text-xs cursor-pointer hover:opacity-90 transition-opacity"
        >
          <Plus class="w-3.5 h-3.5" />
          <span>记录第一个作品</span>
        </button>
      </div>
    </div>

    <!-- 项目故事清单 (Editorial Stories) -->
    <div v-else class="divide-y divide-[var(--border-subtle)] space-y-16">
      
      <article
        v-for="(proj, idx) in filteredProjects"
        :key="proj.id"
        class="pt-14 first:pt-0 space-y-6"
      >
        <!-- 序号、状态与操作 -->
        <div class="flex items-center justify-between text-xs font-mono-archive text-[var(--ink-muted)]">
          <div class="flex items-center gap-2">
            <span class="text-[var(--ink-primary)] font-semibold">
              {{ String(idx + 1).padStart(2, '0') }}.
            </span>
            <span class="tracking-wider">{{ proj.category }}</span>
          </div>

          <div class="flex items-center gap-3">
            <span class="border border-[var(--border-subtle)] px-2 py-0.5 rounded-xs text-[10px] uppercase">
              {{ proj.status || 'Active' }}
            </span>
            <button
              @click="openEditModal(proj)"
              class="text-[var(--ink-muted)] hover:text-[var(--ink-primary)] p-1 rounded-xs transition-colors cursor-pointer"
              title="编辑项目"
            >
              <Edit2 class="w-3.5 h-3.5" />
            </button>
            <button
              @click="handleDelete(proj.id)"
              class="text-[var(--ink-muted)] hover:text-red-600 p-1 rounded-xs transition-colors cursor-pointer"
              title="删除项目"
            >
              <Trash2 class="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        <!-- 标题与副标 -->
        <div>
          <h2 class="text-2xl sm:text-3xl font-serif-editorial font-medium text-[var(--ink-primary)]">
            {{ proj.title }}
          </h2>
          <p v-if="proj.subtitle" class="text-sm font-mono-archive text-[var(--ink-muted)] mt-1">
            {{ proj.subtitle }}
          </p>
        </div>

        <!-- 人生经历叙事 (Story: 为什么开始、怎么做、遇到了什么) -->
        <div class="space-y-3 font-serif-editorial text-base sm:text-lg text-[var(--ink-secondary)] leading-relaxed max-w-2xl">
          <p v-if="proj.description" class="text-[var(--ink-primary)] font-medium">
            {{ proj.description }}
          </p>
          <p v-if="proj.story" class="text-[var(--ink-secondary)] italic text-sm sm:text-base border-l-2 border-[var(--border-subtle)] pl-4 py-1">
            “{{ proj.story }}”
          </p>
        </div>

        <!-- 标签与外部链接 -->
        <div class="pt-2 flex flex-wrap items-center justify-between gap-4 text-xs font-mono-archive">
          <div class="flex flex-wrap gap-2 text-[var(--ink-muted)]">
            <span v-for="tag in (proj.tags || '').split(',').map((t) => t.trim()).filter(Boolean)" :key="tag">
              #{{ tag }}
            </span>
          </div>

          <a
            v-if="proj.github_url"
            :href="proj.github_url"
            target="_blank"
            rel="noopener noreferrer"
            class="inline-flex items-center gap-1.5 text-[var(--ink-primary)] hover-underline pb-0.5"
          >
            <Github v-if="isGitHubUrl(proj.github_url)" class="w-3.5 h-3.5" />
            <Globe v-else class="w-3.5 h-3.5" />
            <span>{{ isGitHubUrl(proj.github_url) ? '查看 GitHub 源码' : '访问项目主页' }}</span>
            <ArrowUpRight class="w-3 h-3" />
          </a>
        </div>

      </article>

    </div>

    <!-- 新建 / 编辑造物项目模态框 (RG-10) -->
    <div
      v-if="isModalOpen"
      class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/45 backdrop-blur-xs animate-in fade-in duration-200"
      @click.self="isModalOpen = false"
    >
      <div class="bg-[var(--bg-archive)] border border-[var(--border-subtle)] shadow-[0_20px_60px_rgba(0,0,0,0.15)] w-full max-w-lg rounded-xs p-6 sm:p-8 text-left space-y-5">
        
        <div class="flex items-center justify-between pb-3 border-b border-[var(--border-subtle)]">
          <h3 class="font-serif-editorial text-xl font-medium text-[var(--ink-primary)]">
            {{ editingId ? '编辑造物项目' : '新建造物项目' }}
          </h3>
          <button @click="isModalOpen = false" class="text-[var(--ink-muted)] hover:text-[var(--ink-primary)] cursor-pointer">
            <X class="w-4 h-4" />
          </button>
        </div>

        <div v-if="formError" class="p-2.5 rounded-xs bg-red-500/10 border border-red-500/20 text-red-600 text-xs font-mono-archive flex items-center gap-2">
          <AlertTriangle class="w-3.5 h-3.5 shrink-0" />
          <span>{{ formError }}</span>
        </div>

        <div class="space-y-3.5 text-xs font-mono-archive">
          <div>
            <label class="block text-[var(--ink-secondary)] mb-1">项目名称 *</label>
            <input
              v-model="formTitle"
              type="text"
              placeholder="例如：Loose Leaf 或 机械键盘手作"
              class="w-full px-3 py-2 bg-[var(--bg-subtle)] border border-[var(--border-subtle)] rounded-xs focus:border-[var(--ink-primary)] outline-hidden font-serif-editorial text-sm text-[var(--ink-primary)]"
            />
          </div>

          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="block text-[var(--ink-secondary)] mb-1">副标题</label>
              <input
                v-model="formSubtitle"
                type="text"
                placeholder="简短注脚"
                class="w-full px-3 py-1.5 bg-[var(--bg-subtle)] border border-[var(--border-subtle)] rounded-xs text-[var(--ink-primary)]"
              />
            </div>
            <div>
              <label class="block text-[var(--ink-secondary)] mb-1">分类</label>
              <input
                v-model="formCategory"
                type="text"
                placeholder="例如：开源项目、手艺器物"
                class="w-full px-3 py-1.5 bg-[var(--bg-subtle)] border border-[var(--border-subtle)] rounded-xs text-[var(--ink-primary)]"
              />
            </div>
          </div>

          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="block text-[var(--ink-secondary)] mb-1">状态</label>
              <PaperSelect
                v-model="formStatus"
                size="sm"
                :options="[
                  { value: 'Active', label: 'Active (进行中)' },
                  { value: 'Maintained', label: 'Maintained (长期维护)' },
                  { value: 'Archived', label: 'Archived (已封存)' },
                ]"
              />
            </div>
            <div>
              <label class="block text-[var(--ink-secondary)] mb-1">GitHub / 主页链接</label>
              <input
                v-model="formGithubUrl"
                type="text"
                placeholder="https://..."
                class="w-full px-3 py-1.5 bg-[var(--bg-subtle)] border border-[var(--border-subtle)] rounded-xs text-[var(--ink-primary)]"
              />
            </div>
          </div>

          <div>
            <label class="block text-[var(--ink-secondary)] mb-1">标签 (以逗号分隔)</label>
            <input
              v-model="formTags"
              type="text"
              placeholder="Go, Vue, 胶片, 本地优先"
              class="w-full px-3 py-1.5 bg-[var(--bg-subtle)] border border-[var(--border-subtle)] rounded-xs text-[var(--ink-primary)]"
            />
          </div>

          <div>
            <label class="block text-[var(--ink-secondary)] mb-1">项目简述</label>
            <textarea
              v-model="formDescription"
              rows="2"
              placeholder="用两三句话阐明这个项目的定位与创造目的..."
              class="w-full px-3 py-2 bg-[var(--bg-subtle)] border border-[var(--border-subtle)] rounded-xs text-[var(--ink-primary)] font-serif-editorial text-sm"
            ></textarea>
          </div>

          <div>
            <label class="block text-[var(--ink-secondary)] mb-1">故事与经历 (Story)</label>
            <textarea
              v-model="formStory"
              rows="3"
              placeholder="背后的故事、踩过的坑或心得感悟..."
              class="w-full px-3 py-2 bg-[var(--bg-subtle)] border border-[var(--border-subtle)] rounded-xs text-[var(--ink-primary)] font-serif-editorial text-sm"
            ></textarea>
          </div>
        </div>

        <div class="flex items-center justify-end gap-3 pt-3 border-t border-[var(--border-subtle)]">
          <button
            @click="isModalOpen = false"
            class="px-4 py-2 border border-[var(--border-subtle)] hover:border-[var(--border-divider)] rounded-xs font-mono-archive text-xs cursor-pointer text-[var(--ink-secondary)]"
          >
            取消
          </button>
          <button
            @click="handleSave"
            :disabled="isSubmitting"
            class="px-5 py-2 bg-[var(--ink-primary)] text-[var(--bg-archive)] rounded-xs font-mono-archive text-xs cursor-pointer hover:opacity-90 disabled:opacity-50 transition-opacity"
          >
            {{ isSubmitting ? '保存中...' : '保存造物' }}
          </button>
        </div>

      </div>
    </div>

  </div>
</template>
