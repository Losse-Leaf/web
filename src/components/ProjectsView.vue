<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import type { Project, LifeEntry } from '../types'
import { ArrowUpRight, Github, Globe, Plus, Edit2, Trash2, X, AlertTriangle, BookOpen, ChevronRight, SlidersHorizontal } from 'lucide-vue-next'
import { createProject, updateProject, deleteProject, getAdminToken } from '../utils/api'
import { useCategories } from '../composables/useCategories'
import { askConfirm, showAlert } from '../composables/useConfirm'
import PaperSelect from './PaperSelect.vue'

const props = defineProps<{
  projects: Project[]
  entries?: LifeEntry[]
}>()

const emit = defineEmits<{
  (e: 'projectCreated', project: Project): void
  (e: 'projectUpdated', project: Project): void
  (e: 'projectDeleted', id: number): void
  (e: 'selectEntry', entry: LifeEntry): void
  (e: 'openAddProjectEntry', projectId: number): void
  (e: 'requestAuth', callback: () => void): void
}>()

const isAdmin = computed(() => Boolean(getAdminToken()))

const { projectCategories, loadCategories, openCategoryManager } = useCategories()

onMounted(() => {
  loadCategories()
})

const getProjectEntries = (projectId: number): LifeEntry[] => {
  return (props.entries || []).filter((e) => e.project_id === projectId)
}

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
const formStatus = ref('进行中')
const formDescription = ref('')
const formStory = ref('')
const formGithubUrl = ref('')

// 造物状态四端统一为中文四态(与后端 validProjectStatuses 白名单一致)。
// normalize 兼容存量英文/历史表述的读取(后端已做一次性数据迁移,此处双保险)。
const normalizeProjectStatus = (raw?: string | null): string => {
  const s = (raw || '').trim()
  if (!s) return '进行中'
  switch (s) {
    case '进行中': case '已完成': case '维护中': case '已搁置': return s
    case 'Active': case 'WIP': return '进行中'
    case 'Maintained': case '持续维护': return '维护中'
    case 'Archived': case '已归档': return '已搁置'
    default: return s === '已完成' ? s : '进行中'
  }
}
const projectStatusLabel = (raw?: string | null): string => normalizeProjectStatus(raw)

const openCreateModal = () => {
  if (!isAdmin.value) {
    emit('requestAuth', () => openCreateModal())
    return
  }
  editingId.value = null
  formTitle.value = ''
  formSubtitle.value = ''
  formCategory.value = activeCategory.value === 'all' ? (projectCategories.value[0] || '开源项目') : activeCategory.value
  formStatus.value = '进行中'
  formDescription.value = ''
  formStory.value = ''
  formGithubUrl.value = ''
  formError.value = null
  isModalOpen.value = true
}

const openEditModal = (proj: Project) => {
  if (!isAdmin.value) {
    emit('requestAuth', () => openEditModal(proj))
    return
  }
  editingId.value = proj.id
  formTitle.value = proj.title || ''
  formSubtitle.value = proj.subtitle || ''
  formCategory.value = proj.category || projectCategories.value[0] || '开源项目'
  formStatus.value = normalizeProjectStatus(proj.status)
  formDescription.value = proj.description || ''
  formStory.value = proj.story || ''
  formGithubUrl.value = proj.github_url || ''
  formError.value = null
  isModalOpen.value = true
}

const handleSave = async () => {
  if (!formTitle.value.trim()) {
    formError.value = '造物项目名称不能为空'
    return
  }

  if (!getAdminToken()) {
    emit('requestAuth', () => handleSave())
    return
  }

  try {
    isSubmitting.value = true
    formError.value = null
    const payload = {
      title: formTitle.value.trim(),
      subtitle: formSubtitle.value.trim(),
      category: formCategory.value.trim() || '其他造物',
      status: formStatus.value.trim() || '进行中',
      description: formDescription.value.trim(),
      story: formStory.value.trim(),
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
    if (!getAdminToken()) {
      emit('requestAuth', () => handleSave())
      return
    }
    formError.value = err.message || '保存失败'
  } finally {
    isSubmitting.value = false
  }
}

const handleDelete = async (id: number) => {
  if (!isAdmin.value) {
    emit('requestAuth', () => handleDelete(id))
    return
  }
  const ok = await askConfirm({
    title: '删除造物项目',
    message: '确定删除此造物项目？相关手记将被解除关联。',
    confirmText: '删除',
    danger: true,
  })
  if (!ok) return
  try {
    await deleteProject(id)
    localProjects.value = localProjects.value.filter((p) => p.id !== id)
    emit('projectDeleted', id)
  } catch (err: any) {
    if (!getAdminToken()) {
      emit('requestAuth', () => handleDelete(id))
      return
    }
    await showAlert({ title: '删除失败', message: err.message || '删除失败', danger: true })
  }
}

const isGitHubUrl = (url?: string) => {
  return url && url.includes('github.com')
}
</script>

<template>
  <div class="max-w-5xl mx-auto px-4 sm:px-8 py-10 sm:py-20 text-left">
    
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

        <div v-if="isAdmin" class="flex items-center gap-2 self-start sm:self-auto shrink-0">
          <button
            @click="openCategoryManager('project')"
            class="inline-flex items-center gap-1.5 px-3 py-2 border border-[var(--border-subtle)] hover:border-[var(--ink-primary)] rounded-xs font-mono-archive text-xs text-[var(--ink-secondary)] hover:text-[var(--ink-primary)] transition-colors cursor-pointer"
          >
            <SlidersHorizontal class="w-3.5 h-3.5" />
            <span>分类管理</span>
          </button>

          <button
            @click="openCreateModal"
            class="inline-flex items-center gap-1.5 px-4 py-2 bg-[var(--ink-primary)] text-[var(--bg-archive)] hover:opacity-90 rounded-xs font-mono-archive text-xs transition-opacity cursor-pointer"
          >
            <Plus class="w-3.5 h-3.5" />
            <span>新建造物</span>
          </button>
        </div>
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
      <div v-if="isAdmin" class="pt-2">
        <button
          @click="openCreateModal"
          class="inline-flex items-center gap-1.5 px-4 py-2 bg-[var(--ink-primary)] text-[var(--bg-archive)] rounded-xs font-mono-archive text-xs cursor-pointer hover:opacity-90 transition-opacity"
        >
          <Plus class="w-3.5 h-3.5" />
          <span>记录第一个作品</span>
        </button>
      </div>
    </div>

    <!-- 项目故事清单 (Editorial Stories / Project Dossiers) -->
    <div v-else class="space-y-10">
      
      <article
        v-for="(proj, idx) in filteredProjects"
        :key="proj.id"
        class="p-6 sm:p-8 rounded-xs border border-[var(--border-subtle)] bg-[var(--bg-subtle)]/20 hover:bg-[var(--bg-subtle)]/35 hover:border-[var(--border-divider)] transition-all space-y-6 shadow-2xs text-left"
      >
        <!-- 卷宗编号、类别、状态与操作 -->
        <div class="flex items-center justify-between text-xs font-mono-archive text-[var(--ink-muted)] border-b border-[var(--border-subtle)]/60 pb-3">
          <div class="flex items-center gap-2.5">
            <span class="px-2 py-0.5 rounded-xs bg-[var(--accent-warm)]/10 text-[var(--accent-warm)] font-semibold tracking-wider text-[11px]">
              卷宗 NO. {{ String(idx + 1).padStart(2, '0') }}
            </span>
            <span class="text-[var(--border-divider)]">/</span>
            <span class="tracking-wider text-[var(--ink-secondary)] font-medium">{{ proj.category }}</span>
          </div>

          <div class="flex items-center gap-3">
            <span class="border border-[var(--border-subtle)] px-2 py-0.5 rounded-xs text-[11px] bg-[var(--bg-archive)] font-mono-archive">
              {{ projectStatusLabel(proj.status) }}
            </span>
            <template v-if="isAdmin">
              <button
                @click="emit('openAddProjectEntry', proj.id)"
                class="inline-flex items-center gap-1 px-2.5 py-1 border border-[var(--border-subtle)] hover:border-[var(--ink-primary)] text-[var(--ink-secondary)] hover:text-[var(--ink-primary)] bg-[var(--bg-archive)] rounded-xs transition-colors cursor-pointer text-[11px]"
              >
                <Plus class="w-3 h-3" />
                <span>写造物手记</span>
              </button>
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
            </template>
          </div>
        </div>

        <!-- 标题与副标 -->
        <div class="space-y-1">
          <h2 class="type-section-heading text-[var(--ink-primary)]">
            {{ proj.title }}
          </h2>
          <p v-if="proj.subtitle" class="text-xs sm:text-sm font-mono-archive text-[var(--ink-muted)]">
            {{ proj.subtitle }}
          </p>
        </div>

        <!-- 人生经历叙事 (Story: 为什么开始、怎么做、遇到了什么) -->
        <div class="space-y-3 font-serif-editorial text-sm sm:text-base text-[var(--ink-secondary)] leading-relaxed max-w-3xl prose-editorial">
          <p v-if="proj.description" class="text-[var(--ink-primary)] font-medium">
            {{ proj.description }}
          </p>
          <p v-if="proj.story" class="text-[var(--ink-secondary)] italic border-l-2 border-[var(--accent-warm)]/60 pl-4 py-1.5 bg-[var(--bg-subtle)]/40 rounded-r-xs">
            “{{ proj.story }}”
          </p>
        </div>

        <!-- 外部链接 -->
        <div v-if="proj.github_url" class="pt-1 flex flex-wrap items-center justify-end gap-4 text-xs font-mono-archive">
          <a
            :href="proj.github_url"
            target="_blank"
            rel="noopener noreferrer"
            class="inline-flex items-center gap-1.5 px-3 py-1 bg-[var(--bg-archive)] border border-[var(--border-subtle)] hover:border-[var(--ink-primary)] rounded-xs text-[var(--ink-primary)] transition-colors"
          >
            <Github v-if="isGitHubUrl(proj.github_url)" class="w-3.5 h-3.5" />
            <Globe v-else class="w-3.5 h-3.5" />
            <span>{{ isGitHubUrl(proj.github_url) ? '查看 GitHub 源码' : '访问项目主页' }}</span>
            <ArrowUpRight class="w-3 h-3 opacity-60" />
          </a>
        </div>

        <!-- 关联物候手记长卷 (主时间流下渗至该造物项目的记录) -->
        <div
          v-if="getProjectEntries(proj.id).length > 0"
          class="pt-4 border-t border-dashed border-[var(--border-subtle)]/70 space-y-2.5"
        >
          <div class="flex items-center justify-between text-xs font-serif-editorial text-[var(--ink-muted)]">
            <div class="flex items-center gap-1.5">
              <BookOpen class="w-3.5 h-3.5" />
              <span>物候手记与打磨进程 ({{ getProjectEntries(proj.id).length }} 篇)</span>
            </div>
            <button
              v-if="isAdmin"
              @click="emit('openAddProjectEntry', proj.id)"
              class="inline-flex items-center gap-1 text-[11px] font-mono-archive text-[var(--ink-secondary)] hover:text-[var(--ink-primary)] cursor-pointer transition-colors"
            >
              <Plus class="w-3 h-3" />
              <span>追加进展手记</span>
            </button>
          </div>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div
              v-for="entry in getProjectEntries(proj.id)"
              :key="entry.id"
              @click="emit('selectEntry', entry)"
              class="p-3 bg-[var(--bg-subtle)]/40 hover:bg-[var(--bg-subtle)] border border-[var(--border-subtle)] rounded-xs cursor-pointer transition-colors group space-y-1"
            >
              <div class="flex items-center justify-between text-xs">
                <span class="font-serif-editorial font-medium text-[var(--ink-primary)] truncate">
                  {{ entry.title || '造物手记' }}
                </span>
                <span class="text-[11px] font-mono-archive text-[var(--ink-muted)] shrink-0 ml-2">
                  {{ (entry.occurred_at || entry.created_at || '').slice(0, 10) }}
                </span>
              </div>
              <p class="text-xs font-serif-editorial text-[var(--ink-secondary)] line-clamp-2 leading-relaxed">
                {{ entry.content }}
              </p>
              <div class="pt-1 flex items-center justify-end text-[11px] font-serif-editorial text-[var(--ink-muted)] group-hover:text-[var(--ink-primary)]">
                <span>翻阅详情</span>
                <ChevronRight class="w-3 h-3" />
              </div>
            </div>
          </div>
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
              class="w-full px-3 py-2 bg-[var(--bg-subtle)] border border-[var(--border-subtle)] rounded-xs focus:border-[var(--ink-primary)] outline-hidden font-serif-editorial text-sm text-[var(--ink-primary)]"
            />
          </div>

          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="block text-[var(--ink-secondary)] mb-1">副标题</label>
              <input
                v-model="formSubtitle"
                type="text"
                class="w-full px-3 py-1.5 bg-[var(--bg-subtle)] border border-[var(--border-subtle)] rounded-xs text-[var(--ink-primary)]"
              />
            </div>
            <div>
              <div class="flex items-center justify-between mb-1">
                <label class="block text-[var(--ink-secondary)]">分类</label>
                <button
                  type="button"
                  @click="openCategoryManager('project')"
                  class="text-[11px] text-[var(--ink-secondary)] hover:text-[var(--ink-primary)] underline underline-offset-4 cursor-pointer"
                >
                  管理分类
                </button>
              </div>
              <PaperSelect
                v-model="formCategory"
                size="sm"
                :options="projectCategories.map((c) => ({ value: c, label: c }))"
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
                  { value: '进行中', label: '进行中' },
                  { value: '已完成', label: '已完成' },
                  { value: '维护中', label: '维护中' },
                  { value: '已搁置', label: '已搁置' },
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
            <label class="block text-[var(--ink-secondary)] mb-1">项目简述</label>
            <textarea
              v-model="formDescription"
              rows="2"
              class="w-full px-3 py-2 bg-[var(--bg-subtle)] border border-[var(--border-subtle)] rounded-xs text-[var(--ink-primary)] font-serif-editorial text-sm"
            ></textarea>
          </div>

          <div>
            <label class="block text-[var(--ink-secondary)] mb-1">项目故事</label>
            <textarea
              v-model="formStory"
              rows="3"
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
