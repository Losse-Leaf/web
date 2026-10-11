<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import {
  ChevronDown,
  Menu,
  X,
  Plus,
  Search,
  Moon,
  Sun,
} from 'lucide-vue-next'
import { audio } from '../utils/audio'
import { getAdminToken } from '../utils/api'
import type { ArchiveCategory, SiteConfig, CuratorProfile } from '../types'

const props = defineProps<{
  currentView: string
  currentCategory: ArchiveCategory
  theme?: 'paper' | 'darkroom'
  config?: SiteConfig | null
  profile?: CuratorProfile | null
}>()

const emit = defineEmits<{
  (e: 'navigate', view: string): void
  (e: 'changeCategory', category: ArchiveCategory): void
  (e: 'openAdd'): void
  (e: 'openStats'): void
  (e: 'openStorage'): void
  (e: 'openSearch'): void
  (e: 'openExport'): void
  (e: 'openPairing'): void
  (e: 'openUpdateCheck'): void
  (e: 'openUpdateNotices'): void
  (e: 'toggleTheme'): void
}>()

const mobileMenuOpen = ref(false)
const isDropdownOpen = ref(false)
const dropdownRef = ref<HTMLElement | null>(null)

// 刊物品牌名（由后端配置单一驱动 RC-40）
const displaySiteName = computed(() => {
  return props.config?.site_name?.split('·')?.[0]?.trim() || '散页'
})

const isAdmin = computed(() => Boolean(getAdminToken()))

// 核心导航栏目（单轨统一；访客未登录时彻底不渲染私密记账/资产 RC-53）
const navItems = computed(() => {
  const items = [
    { key: 'home', label: '时间流' },
  ]
  if (isAdmin.value) {
    items.push({ key: 'transactions', label: '记账' })
  }
  items.push(
    { key: 'wishes', label: '心愿' },
    { key: 'atlas', label: '足迹' },
    { key: 'projects', label: '项目' },
    { key: 'archive', label: '归档' },
    { key: 'about', label: '主理人' }
  )
  return items
})

// 辅助工具与设置（纯净无赘述；检查更新与更新公告仅管理端可见 RC-97）
const toolOptions = computed(() => {
  const opts = [
    {
      key: 'pair',
      label: '设备配对',
      action: () => emit('openPairing'),
    },
    {
      key: 'export',
      label: '数据备份',
      action: () => emit('openExport'),
    },
    {
      key: 'stats',
      label: '生活统计',
      action: () => emit('openStats'),
    },
    {
      key: 'storage',
      label: '存储设置',
      action: () => emit('openStorage'),
    },
  ]
  if (isAdmin.value) {
    opts.push(
      {
        key: 'update-check',
        label: '检查更新',
        action: () => emit('openUpdateCheck'),
      },
      {
        key: 'update-notices',
        label: '更新公告',
        action: () => emit('openUpdateNotices'),
      }
    )
  }
  return opts
})

const setView = (view: string) => {
  audio.playTink()
  emit('navigate', view)
  mobileMenuOpen.value = false
  window.scrollTo({ top: 0, behavior: 'smooth' })
}

const handleToolClick = (opt: { action: () => void }) => {
  audio.playTink()
  opt.action()
  isDropdownOpen.value = false
  mobileMenuOpen.value = false
}

const handleOpenAdd = () => {
  audio.playTink()
  emit('openAdd')
  mobileMenuOpen.value = false
}


// 点击外部自动关闭下拉浮层
const handleDocumentClick = (e: MouseEvent) => {
  if (dropdownRef.value && !dropdownRef.value.contains(e.target as Node)) {
    isDropdownOpen.value = false
  }
}

const handleGlobalKeyDown = (e: KeyboardEvent) => {
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
    e.preventDefault()
    audio.playTink()
    emit('openSearch')
  }
}

onMounted(() => {
  document.addEventListener('click', handleDocumentClick)
  window.addEventListener('keydown', handleGlobalKeyDown)
})

onUnmounted(() => {
  document.removeEventListener('click', handleDocumentClick)
  window.removeEventListener('keydown', handleGlobalKeyDown)
})
</script>

<template>
  <header
    class="sticky top-0 z-50 w-full bg-[var(--bg-archive)]/92 backdrop-blur-md border-b border-[var(--border-subtle)] transition-colors duration-300"
    style="padding-top: env(safe-area-inset-top, 0px);"
  >
    <div class="max-w-5xl mx-auto px-4 sm:px-8 h-16 flex items-center justify-between">
      
      <!-- 极简出版标识：动态从后端配置与主理人档案中驱动 -->
      <button
        @click="setView('home')"
        class="text-left group cursor-pointer"
      >
        <span class="font-serif-editorial text-xl font-medium tracking-wider text-[var(--ink-primary)]">
          {{ displaySiteName }}
        </span>
        <span class="text-xs text-[var(--ink-muted)] ml-2.5 hidden sm:inline tracking-wider font-serif-editorial">
          时光手账与生活档案
        </span>
      </button>

      <!-- 桌面端克制纯中文导航 -->
      <nav class="hidden md:flex items-center gap-7">
        <button
          v-for="item in navItems"
          :key="item.key"
          @click="setView(item.key)"
          class="text-sm tracking-wider transition-colors cursor-pointer py-1"
          :class="currentView === item.key 
            ? 'text-[var(--ink-primary)] font-semibold border-b border-[var(--ink-primary)]' 
            : 'text-[var(--ink-muted)] hover:text-[var(--ink-primary)]'"
        >
          {{ item.label }}
        </button>
      </nav>

      <!-- 右上角：[搜索] + [＋ 记录] + [设置⌄] + [暗房模式] + 雨声 + GitHub -->
      <div class="hidden md:flex items-center gap-2.5 text-xs font-mono-archive text-[var(--ink-muted)]">
        
        <!-- 全局搜索入口 (支持 Cmd+K) -->
        <button
          @click="emit('openSearch')"
          class="flex items-center gap-1.5 text-xs py-1 px-2 rounded-xs border border-[var(--border-subtle)] hover:border-[var(--border-divider)] bg-[var(--bg-archive)] text-[var(--ink-secondary)] hover:text-[var(--ink-primary)] transition-colors cursor-pointer"
          title="全局即时搜索 (快捷键 ⌘K)"
        >
          <Search class="w-3.5 h-3.5" />
          <span class="font-serif-editorial text-[13px] hidden lg:inline">搜索</span>
          <kbd class="text-[10px] bg-[var(--bg-subtle)] px-1 rounded-xs border border-[var(--border-subtle)] opacity-70">⌘K</kbd>
        </button>

        <!-- 全局「＋」新增入口 (负责添加东西) -->
        <button
          @click="handleOpenAdd"
          class="flex items-center gap-1 text-xs py-1 px-2.5 rounded-xs border border-[var(--ink-primary)] bg-[var(--ink-primary)] text-[var(--bg-archive)] hover:opacity-90 transition-opacity cursor-pointer shadow-xs"
          title="记录一点什么 (生活记录 / 想法 / 照片 / 项目 / 收藏 / 记账)"
        >
          <Plus class="w-3.5 h-3.5" />
          <span class="font-serif-editorial text-[13px]">记录</span>
        </button>

        <!-- 设置/工具 ⌄ 二级轻量浮层 (数据备份 / 生活统计 / 存储设置) -->
        <div class="relative" ref="dropdownRef">
          <button
            @click.stop="isDropdownOpen = !isDropdownOpen"
            class="flex items-center gap-1 text-xs tracking-wider transition-colors cursor-pointer py-1 px-2 rounded-xs border border-[var(--border-subtle)] hover:border-[var(--border-divider)] bg-[var(--bg-archive)] text-[var(--ink-secondary)] hover:text-[var(--ink-primary)]"
            title="数据备份、生活统计与设置"
          >
            <span class="font-serif-editorial text-[13px]">设置</span>
            <ChevronDown class="w-3 h-3 opacity-60 transition-transform duration-200" :class="{ 'rotate-180': isDropdownOpen }" />
          </button>

          <!-- 简洁、精致、克制的二级浮层菜单 -->
          <div
            v-if="isDropdownOpen"
            class="absolute right-0 top-full mt-2 w-32 bg-[var(--bg-archive)] border border-[var(--border-subtle)] shadow-[0_8px_30px_rgba(0,0,0,0.08)] py-1.5 z-50 rounded-xs animate-in fade-in duration-150"
            @click.stop
          >
            <div class="px-3 pb-1 mb-1 text-[10px] font-mono-archive tracking-widest text-[var(--ink-muted)] border-b border-[var(--border-subtle)]/60">
              系统与工具
            </div>

            <div class="space-y-0.5">
              <button
                v-for="opt in toolOptions"
                :key="opt.key"
                @click="handleToolClick(opt)"
                class="w-full text-left px-3 py-1.5 text-xs font-serif-editorial transition-colors flex items-center justify-between cursor-pointer group hover:bg-[var(--bg-subtle)]/60 text-[var(--ink-secondary)] hover:text-[var(--ink-primary)]"
              >
                <span>{{ opt.label }}</span>
              </button>
            </div>
          </div>
        </div>

        <!-- 纸张 / 暗房模式切换 -->
        <button
          @click="emit('toggleTheme')"
          class="p-1 text-[var(--ink-secondary)] hover:text-[var(--ink-primary)] rounded-xs border border-[var(--border-subtle)] hover:border-[var(--border-divider)] cursor-pointer transition-colors"
          :title="theme === 'darkroom' ? '切换为暖色棉纸模式' : '切换为胶片暗房模式'"
        >
          <Moon v-if="theme === 'paper'" class="w-3.5 h-3.5" />
          <Sun v-else class="w-3.5 h-3.5 text-amber-500" />
        </button>
      </div>

      <!-- 移动端右上角：搜索 + 暗房 + ＋ 与 菜单按钮 -->
      <div class="flex items-center gap-1 sm:gap-2 md:hidden">
        <button
          @click="emit('openSearch')"
          class="p-1.5 text-[var(--ink-secondary)] hover:text-[var(--ink-primary)] cursor-pointer"
          title="搜索"
        >
          <Search class="w-4 h-4" />
        </button>
        <button
          @click="emit('toggleTheme')"
          class="p-1.5 text-[var(--ink-secondary)] hover:text-[var(--ink-primary)] cursor-pointer"
          title="主题模式"
        >
          <Moon v-if="theme === 'paper'" class="w-4 h-4" />
          <Sun v-else class="w-4 h-4 text-amber-500" />
        </button>
        <button
          @click="handleOpenAdd"
          class="p-1.5 bg-[var(--ink-primary)] text-[var(--bg-archive)] rounded-xs cursor-pointer shadow-xs"
          title="新建记录"
        >
          <Plus class="w-4 h-4" />
        </button>
        <button
          @click="mobileMenuOpen = !mobileMenuOpen"
          class="p-1.5 text-[var(--ink-primary)] cursor-pointer"
        >
          <Menu v-if="!mobileMenuOpen" class="w-5 h-5" />
          <X v-else class="w-5 h-5" />
        </button>
      </div>

    </div>

    <!-- 移动端展开抽屉 -->
    <div
      v-if="mobileMenuOpen"
      class="md:hidden border-b border-[var(--border-subtle)] bg-[var(--bg-archive)] px-6 py-6 space-y-6"
    >
      <!-- 快捷新增 -->
      <div>
        <button
          @click="handleOpenAdd"
          class="w-full py-2.5 px-3 bg-[var(--ink-primary)] text-[var(--bg-archive)] rounded-xs text-xs font-mono-archive flex items-center justify-center gap-2 cursor-pointer"
        >
          <Plus class="w-4 h-4" />
          <span class="font-serif-editorial text-sm">记录一点什么</span>
        </button>
      </div>

      <!-- 导航栏目 -->
      <div class="space-y-2">
        <span class="text-[11px] font-mono-archive tracking-widest text-[var(--ink-muted)] block">
          页面导航
        </span>
        <div class="grid grid-cols-2 gap-2 text-sm font-serif-editorial">
          <button
            v-for="item in navItems"
            :key="item.key"
            @click="setView(item.key)"
            class="text-left py-2 px-2.5 rounded-xs border text-xs flex items-center justify-between"
            :class="currentView === item.key 
              ? 'border-[var(--ink-primary)] text-[var(--ink-primary)] font-bold' 
              : 'border-[var(--border-subtle)] text-[var(--ink-muted)]'"
          >
            <span>{{ item.label }}</span>
          </button>
        </div>
      </div>

      <!-- 工具选项 -->
      <div class="space-y-2 pt-2 border-t border-[var(--border-subtle)]">
        <span class="text-[11px] font-mono-archive tracking-widest text-[var(--ink-muted)] block">
          设置与工具
        </span>
        <div class="grid grid-cols-2 gap-2 text-xs font-serif-editorial">
          <button
            v-for="opt in toolOptions"
            :key="opt.key"
            @click="handleToolClick(opt)"
            class="text-left py-1.5 px-2 rounded-xs border border-[var(--border-subtle)] text-[var(--ink-secondary)]"
          >
            {{ opt.label }}
          </button>
        </div>
      </div>
    </div>
  </header>
</template>
