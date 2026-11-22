<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import {
  BookOpen,
  ChevronDown,
  Menu,
  X,
  Plus,
  Search,
  Moon,
  Sun,
} from 'lucide-vue-next'
import { getAdminToken } from '../utils/api'
import { getSiteBrandName } from '../utils/profile'
import type { SiteConfig } from '../types'

const props = defineProps<{
  currentView: string
  theme?: 'paper' | 'darkroom'
  config?: SiteConfig | null
}>()

const emit = defineEmits<{
  (e: 'navigate', view: string): void
  (e: 'openAdd'): void
  (e: 'openAlmanac'): void
  (e: 'openProfile'): void
  (e: 'openStorageBackup', tab?: 'backup' | 'storage' | 'visibility'): void
  (e: 'openSearch'): void
  (e: 'openPairing'): void
  (e: 'openUpdateCheck'): void
  (e: 'toggleTheme'): void
  (e: 'logout'): void
}>()

const mobileMenuOpen = ref(false)
const isDropdownOpen = ref(false)
const dropdownRef = ref<HTMLElement | null>(null)

// 刊物品牌名（由后端配置单一驱动 RC-40）
const displaySiteName = computed(() => getSiteBrandName(props.config))

const isAdmin = computed(() => Boolean(getAdminToken()))

const canShowAlmanac = computed(() => {
  if (isAdmin.value) return true
  const pub = props.config?.public_modules ?? []
  return pub.includes('almanac')
})

// 核心导航栏目：仅保留「散页」与「记账」（访客若开放心愿单，第二入口展示心愿单）
const navItems = computed(() => {
  if (isAdmin.value) {
    return [
      { key: 'home', label: '散页' },
      { key: 'transactions', label: '记账' },
    ]
  }
  const pub = new Set(props.config?.public_modules || [])
  const items: { key: string; label: string }[] = []
  if (pub.has('entries')) items.push({ key: 'home', label: '散页' })
  if (pub.has('wishes')) items.push({ key: 'transactions', label: '心愿单' })
  return items
})

// 辅助工具与设置（主理人资料、设备配对、数据备份、存储设置、检查更新仅管理端可见）
const toolOptions = computed(() => {
  const opts: { key: string; label: string; action: () => void }[] = []
  if (isAdmin.value) {
    opts.push(
      {
        key: 'profile',
        label: '主理人资料',
        action: () => emit('openProfile'),
      },
      {
        key: 'pair',
        label: '设备配对',
        action: () => emit('openPairing'),
      },
      {
        key: 'storage-backup',
        label: '存储与备份',
        action: () => emit('openStorageBackup', 'backup'),
      },
      {
        key: 'visibility',
        label: '展厅公开设置',
        action: () => emit('openStorageBackup', 'visibility'),
      },
      {
        key: 'update-check',
        label: '检查更新',
        action: () => emit('openUpdateCheck'),
      },
      {
        key: 'logout',
        label: '退出主理人',
        action: () => emit('logout'),
      }
    )
  }
  return opts
})

const setView = (view: string) => {
  emit('navigate', view)
  mobileMenuOpen.value = false
  window.scrollTo({ top: 0, behavior: 'smooth' })
}

const handleToolClick = (opt: { action: () => void }) => {
  opt.action()
  isDropdownOpen.value = false
  mobileMenuOpen.value = false
}

const handleOpenAdd = () => {
  emit('openAdd')
  mobileMenuOpen.value = false
}

const handleOpenAlmanac = () => {
  emit('openAlmanac')
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
      
      <!-- 极简出版标识：纯净呈现品牌名 -->
      <button
        @click="setView('home')"
        class="text-left group cursor-pointer"
      >
        <span class="font-serif-editorial text-xl font-medium tracking-wider text-[var(--ink-primary)]">
          {{ displaySiteName }}
        </span>
      </button>

      <!-- 桌面端克制纯中文导航：散页 / 记账 -->
      <nav class="hidden md:flex items-center gap-1.5 lg:gap-2">
        <button
          v-for="item in navItems"
          :key="item.key"
          @click="setView(item.key)"
          class="relative text-sm tracking-wider transition-all duration-200 cursor-pointer py-1.5 px-3 lg:px-4 rounded-xs select-none"
          :class="currentView === item.key 
            ? 'text-[var(--ink-primary)] font-medium bg-[var(--bg-subtle)]/75 shadow-2xs after:content-[\'\'] after:absolute after:bottom-0 after:left-3 after:right-3 after:h-[2px] after:bg-[var(--accent-warm)]' 
            : 'text-[var(--ink-secondary)] hover:text-[var(--ink-primary)] hover:bg-[var(--bg-subtle)]/40'"
        >
          {{ item.label }}
        </button>
      </nav>

      <!-- 右上角：[搜索] + [年鉴] + [＋ 记录] + [主理人] + [设置⌄] + [暗房模式] -->
      <div class="hidden md:flex items-center gap-2.5 text-xs font-mono-archive text-[var(--ink-muted)]">
        
        <!-- 全局搜索入口 (支持 Cmd+K) -->
        <button
          @click="emit('openSearch')"
          class="flex items-center gap-1.5 text-xs py-1 px-2 rounded-xs border border-[var(--border-subtle)] hover:border-[var(--border-divider)] bg-[var(--bg-archive)] text-[var(--ink-secondary)] hover:text-[var(--ink-primary)] transition-colors cursor-pointer"
          title="全局搜索 (⌘K)"
        >
          <Search class="w-3.5 h-3.5" />
          <span class="font-serif-editorial text-[13px] hidden lg:inline">搜索</span>
          <kbd class="text-[11px] bg-[var(--bg-subtle)] px-1 rounded-xs border border-[var(--border-subtle)] opacity-70">⌘K</kbd>
        </button>

        <!-- 年度生活年鉴入口 -->
        <button
          v-if="canShowAlmanac"
          @click="handleOpenAlmanac"
          class="flex items-center gap-1.5 text-xs py-1 px-2.5 rounded-xs border border-[var(--border-subtle)] hover:border-[var(--border-divider)] bg-[var(--bg-archive)] text-[var(--ink-secondary)] hover:text-[var(--ink-primary)] transition-colors cursor-pointer"
          title="查看年度生活年鉴"
        >
          <BookOpen class="w-3.5 h-3.5" />
          <span class="font-serif-editorial text-[13px]">年鉴</span>
        </button>

        <!-- 全局「＋」新增入口 -->
        <button
          @click="handleOpenAdd"
          class="flex items-center gap-1 text-xs py-1 px-2.5 rounded-xs border border-[var(--ink-primary)] bg-[var(--ink-primary)] text-[var(--bg-archive)] hover:opacity-90 transition-opacity cursor-pointer shadow-xs"
        >
          <Plus class="w-3.5 h-3.5" />
          <span class="font-serif-editorial text-[13px]">记录</span>
        </button>

        <!-- 主理人身份状态：常驻占位，登录/登出只切透明度，不推挤右侧工具区 -->
        <div
          class="flex items-center gap-1.5 text-xs py-1 px-2 rounded-xs border border-emerald-600/30 bg-emerald-50/40 dark:bg-emerald-950/20 text-emerald-700 dark:text-emerald-400 font-mono-archive text-[11px] transition-opacity"
          :class="isAdmin ? 'opacity-100' : 'opacity-0 pointer-events-none'"
        >
          <span class="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
          <span>主理人</span>
        </div>

        <!-- 设置/工具 ⌄ 二级轻量浮层 -->
        <div v-if="toolOptions.length > 0" class="relative" ref="dropdownRef">
          <button
            @click.stop="isDropdownOpen = !isDropdownOpen"
            class="flex items-center gap-1 text-xs tracking-wider transition-colors cursor-pointer py-1 px-2 rounded-xs border border-[var(--border-subtle)] hover:border-[var(--border-divider)] bg-[var(--bg-archive)] text-[var(--ink-secondary)] hover:text-[var(--ink-primary)]"
          >
            <span class="font-serif-editorial text-[13px]">设置</span>
            <ChevronDown class="w-3 h-3 opacity-60 transition-transform duration-200" :class="{ 'rotate-180': isDropdownOpen }" />
          </button>

          <!-- 简洁、精致、克制的二级浮层菜单 -->
          <div
            v-if="isDropdownOpen"
            class="absolute right-0 top-full mt-2 w-36 bg-[var(--bg-archive)] border border-[var(--border-subtle)] shadow-[0_8px_30px_rgba(0,0,0,0.08)] py-1.5 z-50 rounded-xs animate-in fade-in duration-150"
            @click.stop
          >
            <div class="px-3 pb-1 mb-1 text-[11px] font-mono-archive tracking-widest text-[var(--ink-muted)] border-b border-[var(--border-subtle)]/60">
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

      <!-- 移动端右上角：搜索 + 年鉴 + 暗房 + ＋ 与 菜单按钮 -->
      <div class="flex items-center gap-1 sm:gap-2 md:hidden">
        <button
          @click="emit('openSearch')"
          class="p-1.5 text-[var(--ink-secondary)] hover:text-[var(--ink-primary)] cursor-pointer"
          title="搜索"
        >
          <Search class="w-4 h-4" />
        </button>
        <button
          v-if="canShowAlmanac"
          @click="handleOpenAlmanac"
          class="p-1.5 text-[var(--ink-secondary)] hover:text-[var(--ink-primary)] cursor-pointer"
          title="年度生活年鉴"
        >
          <BookOpen class="w-4 h-4" />
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

    <!-- 移动端手账折页抽屉 -->
    <div
      v-if="mobileMenuOpen"
      class="md:hidden absolute top-full left-0 right-0 z-50 border-b border-[var(--border-subtle)] bg-[var(--bg-archive)] backdrop-blur-lg px-5 py-6 space-y-6 shadow-xl animate-in slide-in-from-top-2 duration-200"
    >
      <!-- 快捷新增与年鉴入口 -->
      <div class="space-y-2.5">
        <button
          @click="handleOpenAdd"
          class="w-full py-2.5 px-3 bg-[var(--ink-primary)] text-[var(--bg-archive)] rounded-xs text-xs font-mono-archive flex items-center justify-center gap-2 cursor-pointer shadow-xs active:scale-[0.99] transition-transform"
        >
          <Plus class="w-4 h-4" />
          <span class="font-serif-editorial text-sm font-medium">写下一篇散页手账</span>
        </button>
      </div>

      <!-- 导航栏目：双列纸签网格 -->
      <div class="space-y-2">
        <div class="flex items-center justify-between text-[11px] font-mono-archive tracking-widest text-[var(--ink-muted)] border-b border-[var(--border-subtle)]/70 pb-1.5">
          <span>生活档案章节</span>
          <span>CH. 01–02</span>
        </div>
        <div class="grid grid-cols-2 gap-2 text-sm font-serif-editorial">
          <button
            v-for="item in navItems"
            :key="item.key"
            @click="setView(item.key)"
            class="text-left py-2.5 px-3 rounded-xs border transition-all flex items-center justify-between cursor-pointer"
            :class="currentView === item.key 
              ? 'border-[var(--ink-primary)] bg-[var(--bg-subtle)] text-[var(--ink-primary)] font-semibold shadow-2xs' 
              : 'border-[var(--border-subtle)] text-[var(--ink-secondary)] hover:border-[var(--border-divider)] hover:text-[var(--ink-primary)]'"
          >
            <span>{{ item.label }}</span>
            <span v-if="currentView === item.key" class="w-1.5 h-1.5 rounded-full bg-[var(--accent-warm)]"></span>
          </button>
        </div>
      </div>

      <!-- 工具选项 -->
      <div v-if="toolOptions.length > 0" class="space-y-2 pt-2 border-t border-[var(--border-subtle)]">
        <span class="text-[11px] font-mono-archive tracking-widest text-[var(--ink-muted)] block">
          档案馆系统与设置
        </span>
        <div class="grid grid-cols-2 gap-2 text-xs font-serif-editorial">
          <button
            v-for="opt in toolOptions"
            :key="opt.key"
            @click="handleToolClick(opt)"
            class="text-left py-2 px-2.5 rounded-xs border border-[var(--border-subtle)] bg-[var(--bg-subtle)]/30 text-[var(--ink-secondary)] hover:text-[var(--ink-primary)] hover:border-[var(--border-divider)] transition-colors cursor-pointer"
          >
            {{ opt.label }}
          </button>
        </div>
      </div>
    </div>
  </header>
</template>
