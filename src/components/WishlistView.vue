<script setup lang="ts">
import { ref, computed, onMounted, watch, defineAsyncComponent } from 'vue'
import {
  Sparkles,
  Plus,
  Trash2,
  Edit2,
  MapPin,
  ShieldCheck,
  Calendar,
  Compass,
} from 'lucide-vue-next'
import { fetchWishes, deleteWish, getAdminToken } from '../utils/api'
import { formatMoney } from '../utils/format'
import type { Wish } from '../types'
import { askConfirm, showAlert } from '../composables/useConfirm'

const WishFormModal = defineAsyncComponent(() => import('./WishFormModal.vue'))
const WishResolutionModal = defineAsyncComponent(() => import('./WishResolutionModal.vue'))

const props = defineProps<{
  storageConfigured?: boolean
  refreshKey?: number
}>()

const emit = defineEmits<{
  (e: 'wishResolved'): void
  (e: 'requestAuth', callback: () => void): void
}>()

const allWishes = ref<Wish[]>([])
const wishes = allWishes // 模板维度计数别名，保持全量指标统计
const filteredWishes = ref<Wish[]>([])
const isLoading = ref(false)
const loadError = ref('')
const selectedKind = ref<'all' | 'item' | 'travel' | 'milestone'>('all')
const selectedStatus = ref<'wanting' | 'fulfilled' | 'relinquished' | 'all'>('wanting')

const isFormOpen = ref(false)
const editingWish = ref<Wish | null>(null)
const resolvingWish = ref<Wish | null>(null)
const isResolutionOpen = ref(false)

const isAdmin = computed(() => Boolean(getAdminToken()))

const loadWishes = async () => {
  try {
    isLoading.value = true
    loadError.value = ''
    const [statsList, currentList] = await Promise.all([
      fetchWishes(),
      fetchWishes({
        kind: selectedKind.value !== 'all' ? selectedKind.value : undefined,
        status: selectedStatus.value !== 'all' ? selectedStatus.value : undefined,
      }),
    ])
    allWishes.value = statsList || []
    filteredWishes.value = currentList || []
  } catch (err: any) {
    console.error('Failed to load wishes:', err)
    loadError.value = err?.message || '心愿清单加载失败，请检查服务连接'
  } finally {
    isLoading.value = false
  }
}

watch(
  () => props.refreshKey,
  (val) => {
    if (val !== undefined) {
      loadWishes()
    }
  }
)

watch([selectedKind, selectedStatus], async () => {
  try {
    const list = await fetchWishes({
      kind: selectedKind.value !== 'all' ? selectedKind.value : undefined,
      status: selectedStatus.value !== 'all' ? selectedStatus.value : undefined,
    })
    filteredWishes.value = list || []
  } catch (err) {
    console.warn('Failed to filter wishes:', err)
  }
})

const openCreateWish = () => {
  if (!isAdmin.value) {
    emit('requestAuth', () => {
      editingWish.value = null
      isFormOpen.value = true
    })
    return
  }
  editingWish.value = null
  isFormOpen.value = true
}

const openEditWish = (w: Wish) => {
  editingWish.value = w
  isFormOpen.value = true
}

const openResolveWish = (w: Wish) => {
  resolvingWish.value = w
  isResolutionOpen.value = true
}

const handleDeleteWish = async (w: Wish) => {
  const ok = await askConfirm({
    title: '删除心愿',
    message: `确定删除心愿《${w.title}》？此操作不可恢复。`,
    confirmText: '删除',
    danger: true,
  })
  if (!ok) return
  try {
    await deleteWish(w.id)
    await loadWishes()
    emit('wishResolved')
  } catch (err: any) {
    await showAlert({ title: '删除失败', message: err.message || '删除心愿失败', danger: true })
  }
}

const handleWishSaved = () => {
  loadWishes()
  emit('wishResolved')
}

const handleWishResolved = () => {
  loadWishes()
  emit('wishResolved')
}

// 统计指标基于全局心愿数据计算
const wantingWishes = computed(() => allWishes.value.filter((w) => w.status === 'wanting'))
const fulfilledWishes = computed(() => allWishes.value.filter((w) => w.status === 'fulfilled'))
const relinquishedWishes = computed(() => allWishes.value.filter((w) => w.status === 'relinquished'))

const totalWantingBudget = computed(() => {
  return wantingWishes.value.reduce((sum, w) => sum + (w.budget || 0), 0)
})

const totalFulfilledActual = computed(() => {
  return fulfilledWishes.value.reduce((sum, w) => sum + (w.actual_cost || w.budget || 0), 0)
})

const totalSavedBudget = computed(() => {
  return relinquishedWishes.value.reduce((sum, w) => sum + (w.budget || 0), 0)
})

const getKindLabel = (k: string) => {
  switch (k) {
    case 'item':
      return '好物器物'
    case 'travel':
      return '行旅探索'
    case 'milestone':
      return '阶段进阶'
    default:
      return '心愿'
  }
}

onMounted(() => {
  loadWishes()
})
</script>

<template>
  <div class="max-w-5xl mx-auto px-4 sm:px-8 py-10 sm:py-20 text-left">
    
    <!-- 标头与操作 -->
    <header class="pb-10 border-b border-[var(--border-subtle)] mb-10 space-y-4">
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-3">
          <h1 class="font-serif-editorial text-4xl sm:text-5xl font-normal text-[var(--ink-primary)]">
            心愿清单
          </h1>
          <span class="font-mono-archive text-xs tracking-widest text-[var(--ink-muted)]">
            好物 · 旅程 · 里程碑
          </span>
        </div>

        <button
          @click="openCreateWish"
          class="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono-archive bg-[var(--ink-primary)] text-[var(--bg-archive)] rounded-xs hover:opacity-90 transition-opacity cursor-pointer shadow-xs"
        >
          <Plus class="w-3.5 h-3.5" />
          <span>{{ isAdmin ? '许下心愿' : '许下心愿 (需登录)' }}</span>
        </button>
      </div>

      <p class="font-serif-editorial text-xs text-[var(--ink-muted)] leading-relaxed">
        生活的三维期冀：花钱可得的称手好物、需要闲暇与决心的山川行旅、心智进阶的人生里程碑。无截止死线，真实倒映生活向往。
      </p>
    </header>

    <!-- 统计大盘纸卡 -->
    <div class="grid grid-cols-1 sm:grid-cols-3 gap-6 p-5 rounded-xs border border-[var(--border-subtle)] bg-[var(--bg-subtle)]/40 mb-10 font-mono-archive text-xs">
      <div>
        <span class="text-[var(--ink-muted)] block text-[11px]">在愿向往 (进行中)</span>
        <div class="flex items-baseline gap-2 mt-1">
          <span class="font-serif-editorial text-2xl text-[var(--ink-primary)] font-medium">
            {{ wantingWishes.length }} 项
          </span>
          <span v-if="totalWantingBudget > 0" class="text-[11px] text-[var(--ink-muted)]">
            (预算 ¥{{ formatMoney(totalWantingBudget) }})
          </span>
        </div>
      </div>

      <div>
        <span class="text-[var(--ink-muted)] block text-[11px]">圆满达成 (已归册)</span>
        <div class="flex items-baseline gap-2 mt-1">
          <span class="font-serif-editorial text-2xl text-[var(--accent-moss)] font-medium">
            {{ fulfilledWishes.length }} 项
          </span>
          <span v-if="isAdmin && totalFulfilledActual > 0" class="text-[11px] text-[var(--ink-muted)]">
            (投入 ¥{{ formatMoney(totalFulfilledActual) }})
          </span>
        </div>
      </div>

      <div>
        <span class="text-[var(--ink-muted)] block text-[11px]">理性拔草 (已释怀)</span>
        <div class="flex items-baseline gap-2 mt-1">
          <span class="font-serif-editorial text-2xl text-emerald-700 dark:text-emerald-400 font-medium">
            {{ relinquishedWishes.length }} 项
          </span>
          <span v-if="totalSavedBudget > 0" class="text-[11px] text-emerald-600">
            (省下 ¥{{ formatMoney(totalSavedBudget) }})
          </span>
        </div>
      </div>
    </div>

    <!-- 筛选胶囊栏 (Kind & Status) -->
    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-8 mb-8 border-b border-[var(--border-subtle)] font-mono-archive text-xs">
      <!-- 维度 Tab -->
      <div class="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
        <button
          @click="selectedKind = 'all'"
          class="px-3 py-1 rounded-xs border transition-colors cursor-pointer"
          :class="selectedKind === 'all' ? 'border-[var(--ink-primary)] bg-[var(--ink-primary)] text-[var(--bg-archive)]' : 'border-[var(--border-subtle)] hover:border-[var(--ink-primary)] text-[var(--ink-secondary)]'"
        >
          全维度 ({{ wishes.length }})
        </button>
        <button
          @click="selectedKind = 'item'"
          class="px-3 py-1 rounded-xs border transition-colors cursor-pointer"
          :class="selectedKind === 'item' ? 'border-[var(--ink-primary)] bg-[var(--ink-primary)] text-[var(--bg-archive)]' : 'border-[var(--border-subtle)] hover:border-[var(--ink-primary)] text-[var(--ink-secondary)]'"
        >
          好物 ({{ wishes.filter((w) => w.kind === 'item').length }})
        </button>
        <button
          @click="selectedKind = 'travel'"
          class="px-3 py-1 rounded-xs border transition-colors cursor-pointer"
          :class="selectedKind === 'travel' ? 'border-[var(--ink-primary)] bg-[var(--ink-primary)] text-[var(--bg-archive)]' : 'border-[var(--border-subtle)] hover:border-[var(--ink-primary)] text-[var(--ink-secondary)]'"
        >
          旅程 ({{ wishes.filter((w) => w.kind === 'travel').length }})
        </button>
        <button
          @click="selectedKind = 'milestone'"
          class="px-3 py-1 rounded-xs border transition-colors cursor-pointer"
          :class="selectedKind === 'milestone' ? 'border-[var(--ink-primary)] bg-[var(--ink-primary)] text-[var(--bg-archive)]' : 'border-[var(--border-subtle)] hover:border-[var(--ink-primary)] text-[var(--ink-secondary)]'"
        >
          里程碑 ({{ wishes.filter((w) => w.kind === 'milestone').length }})
        </button>
      </div>

      <!-- 状态过滤 -->
      <div class="flex items-center gap-2 text-[11px]">
        <span class="text-[var(--ink-muted)]">状态:</span>
        <button
          @click="selectedStatus = 'wanting'"
          class="px-2 py-0.5 border rounded-xs cursor-pointer transition-colors"
          :class="selectedStatus === 'wanting' ? 'border-[var(--ink-primary)] bg-[var(--bg-subtle)] text-[var(--ink-primary)] font-medium' : 'border-[var(--border-subtle)] text-[var(--ink-muted)] hover:text-[var(--ink-primary)]'"
        >
          在愿
        </button>
        <button
          @click="selectedStatus = 'fulfilled'"
          class="px-2 py-0.5 border rounded-xs cursor-pointer transition-colors"
          :class="selectedStatus === 'fulfilled' ? 'border-[var(--ink-primary)] bg-[var(--bg-subtle)] text-[var(--accent-moss)] font-medium' : 'border-[var(--border-subtle)] text-[var(--ink-muted)] hover:text-[var(--ink-primary)]'"
        >
          已达成
        </button>
        <button
          @click="selectedStatus = 'relinquished'"
          class="px-2 py-0.5 border rounded-xs cursor-pointer transition-colors"
          :class="selectedStatus === 'relinquished' ? 'border-[var(--ink-primary)] bg-[var(--bg-subtle)] text-emerald-700 font-medium' : 'border-[var(--border-subtle)] text-[var(--ink-muted)] hover:text-[var(--ink-primary)]'"
        >
          已拔草
        </button>
        <button
          @click="selectedStatus = 'all'"
          class="px-2 py-0.5 border rounded-xs cursor-pointer transition-colors"
          :class="selectedStatus === 'all' ? 'border-[var(--ink-primary)] bg-[var(--bg-subtle)] text-[var(--ink-primary)] font-medium' : 'border-[var(--border-subtle)] text-[var(--ink-muted)] hover:text-[var(--ink-primary)]'"
        >
          全部
        </button>
      </div>
    </div>

    <!-- 列表展示区 -->
    <div v-if="isLoading" class="text-xs font-mono-archive text-[var(--ink-muted)] py-16 text-center">
      正在翻阅心愿纸笺...
    </div>

    <!-- 错误状态 -->
    <div
      v-else-if="loadError"
      class="py-16 text-center border border-dashed border-rose-500/40 rounded-xs space-y-3 font-mono-archive"
    >
      <p class="text-xs text-rose-600 dark:text-rose-400">{{ loadError }}</p>
      <button
        @click="loadWishes"
        class="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs border border-[var(--border-subtle)] hover:border-[var(--ink-primary)] rounded-xs text-[var(--ink-primary)] cursor-pointer"
      >
        <span>重新加载</span>
      </button>
    </div>

    <!-- 空状态 -->
    <div
      v-else-if="filteredWishes.length === 0"
      class="py-16 text-center border border-dashed border-[var(--border-subtle)] rounded-xs space-y-3 font-mono-archive"
    >
      <Compass class="w-6 h-6 mx-auto text-[var(--ink-muted)]" />
      <p class="text-xs text-[var(--ink-muted)]">
        {{ selectedStatus === 'wanting' ? '当前没有在愿的心愿。' : '暂无对应分类的心愿记录。' }}
      </p>
      <button
        v-if="selectedStatus === 'wanting'"
        @click="openCreateWish"
        class="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs border border-[var(--border-subtle)] hover:border-[var(--ink-primary)] rounded-xs text-[var(--ink-primary)] cursor-pointer"
      >
        <Plus class="w-3.5 h-3.5" />
        <span>{{ isAdmin ? '写下第一个向往' : '以主理人身份写下第一个向往' }}</span>
      </button>
    </div>

    <!-- 心愿网格卡片 -->
    <div v-else class="grid grid-cols-1 md:grid-cols-2 gap-6">
      <div
        v-for="w in filteredWishes"
        :key="w.id"
        class="p-5 bg-[var(--bg-subtle)]/30 border border-[var(--border-subtle)] hover:border-[var(--border-strong)] rounded-xs transition-colors flex flex-col justify-between space-y-4 text-left group"
      >
        <div class="space-y-3">
          <!-- 胶囊头: 类别 + 状态 + 预算 -->
          <div class="flex items-center justify-between gap-2 font-mono-archive text-[11px]">
            <div class="flex items-center gap-2">
              <span class="px-1.5 py-0.5 border border-[var(--border-subtle)] rounded-xs text-[var(--ink-muted)]">
                {{ getKindLabel(w.kind) }}
              </span>
              <span v-if="w.city_name" class="flex items-center gap-1 text-[var(--ink-muted)]">
                <MapPin class="w-3 h-3" />
                <span>{{ w.city_name }}</span>
              </span>
              <span v-if="w.spec" class="text-[var(--ink-muted)]">
                · {{ w.spec }}
              </span>
            </div>

            <!-- 预算或花费 (访客模式脱敏隐藏实付开销 RC-57) -->
            <div>
              <span v-if="w.status === 'relinquished'" class="text-emerald-700 font-medium">
                省下 ¥{{ formatMoney(w.budget) }}
              </span>
              <span v-else-if="isAdmin && w.status === 'fulfilled' && (w.actual_cost || w.budget)" class="text-[var(--accent-moss)] font-medium">
                实付 ¥{{ formatMoney(w.actual_cost || w.budget) }}
              </span>
              <span v-else-if="w.budget > 0" class="text-[var(--ink-primary)] font-medium">
                预算 ¥{{ formatMoney(w.budget) }}
              </span>
              <span v-else class="text-[var(--ink-muted)]">
                无预算约束
              </span>
            </div>
          </div>

          <!-- 标题与初心简述 -->
          <div>
            <h3 class="font-serif-editorial text-lg text-[var(--ink-primary)] font-medium leading-snug">
              {{ w.title }}
            </h3>
            <p v-if="w.note" class="font-serif-editorial text-xs text-[var(--ink-secondary)] mt-1.5 leading-relaxed italic">
              “{{ w.note }}”
            </p>
          </div>

          <!-- 心愿参考配图预览 -->
          <div v-if="w.attachments && w.attachments.length > 0" class="flex items-center gap-2 pt-1 overflow-x-auto">
            <img
              v-for="att in w.attachments"
              :key="att.id"
              :src="att.url"
              :alt="w.title"
              loading="lazy"
              class="w-16 h-16 object-cover rounded-xs border border-[var(--border-subtle)] bg-[var(--bg-subtle)] shrink-0"
             decoding="async">
          </div>

          <!-- 达成归册印记 / 拔草印记 -->
          <div v-if="w.status === 'fulfilled'" class="pt-1 flex flex-wrap items-center gap-2 font-mono-archive text-[11px]">
            <span class="vermilion-seal px-2 py-0.5 text-[11px]">
              圆满归册
            </span>
            <span v-if="w.fulfilled_at" class="text-[var(--ink-muted)]">
              · {{ w.fulfilled_at.slice(0, 10) }}
            </span>
          </div>

          <div v-else-if="w.status === 'relinquished'" class="pt-1 flex items-center gap-1.5 font-mono-archive text-[11px]">
            <span class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-xs border border-emerald-600/30 bg-emerald-50/50 dark:bg-emerald-950/20 text-emerald-700 dark:text-emerald-400">
              <ShieldCheck class="w-3 h-3" />
              <span>已理性拔草释怀 · 守住生活秩序</span>
            </span>
          </div>

          <div v-else-if="w.target_date" class="pt-1 flex items-center gap-1 font-mono-archive text-[11px] text-[var(--ink-muted)]">
            <Calendar class="w-3 h-3" />
            <span>愿景目标期: {{ w.target_date.slice(0, 10) }}</span>
          </div>
        </div>

        <!-- 底部操作按钮 -->
        <div class="pt-3 border-t border-[var(--border-subtle)]/60 flex items-center justify-between font-mono-archive text-[11px]">
          <span class="text-[11px] text-[var(--ink-muted)]">
            {{ w.created_at ? w.created_at.slice(0, 10) : '' }} 许下
          </span>

          <div class="flex items-center gap-2">
            <!-- 达成仪式按钮 -->
            <button
              v-if="w.status === 'wanting' && isAdmin"
              @click="openResolveWish(w)"
              type="button"
              class="px-2.5 py-1 bg-[var(--ink-primary)] text-[var(--bg-archive)] hover:opacity-90 rounded-xs transition-opacity cursor-pointer inline-flex items-center gap-1 font-serif-editorial"
            >
              <Sparkles class="w-3 h-3" />
              <span>归册仪式</span>
            </button>

            <!-- 编辑 -->
            <button
              v-if="isAdmin && w.status === 'wanting'"
              @click="openEditWish(w)"
              class="p-1 text-[var(--ink-muted)] hover:text-[var(--ink-primary)] cursor-pointer transition-colors"
              title="编辑心愿"
            >
              <Edit2 class="w-3.5 h-3.5" />
            </button>

            <!-- 删除 -->
            <button
              v-if="isAdmin"
              @click="handleDeleteWish(w)"
              class="p-1 text-[var(--ink-muted)] hover:text-red-700 cursor-pointer transition-colors"
              title="删除心愿"
            >
              <Trash2 class="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- 弹窗组件挂载 -->
    <WishFormModal
      v-if="isFormOpen"
      :isOpen="isFormOpen"
      :editingWish="editingWish"
      :storageConfigured="storageConfigured"
      @close="isFormOpen = false"
      @saved="handleWishSaved"
      @requestAuth="(cb) => emit('requestAuth', cb)"
    />

    <WishResolutionModal
      v-if="isResolutionOpen"
      :isOpen="isResolutionOpen"
      :wish="resolvingWish"
      @close="isResolutionOpen = false"
      @resolved="handleWishResolved"
      @requestAuth="(cb) => emit('requestAuth', cb)"
    />

  </div>
</template>
