<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import HeaderNav from './components/HeaderNav.vue'
import HomeView from './components/HomeView.vue'
import ArchiveView from './components/ArchiveView.vue'
import ProjectsView from './components/ProjectsView.vue'
import AboutView from './components/AboutView.vue'
import FooterArchive from './components/FooterArchive.vue'
import TransactionsView from './components/TransactionsView.vue'
import NewEntryModal from './components/NewEntryModal.vue'
import EntryDetailModal from './components/EntryDetailModal.vue'
import StorageModal from './components/StorageModal.vue'
import StatsModal from './components/StatsModal.vue'
import SearchModal from './components/SearchModal.vue'
import ExportModal from './components/ExportModal.vue'
import DevicePairingModal from './components/DevicePairingModal.vue'
import WelcomePortal from './components/WelcomePortal.vue'
import FloatingActionButton from './components/FloatingActionButton.vue'
import { getAdminToken } from './utils/api'
import { useTheme } from './composables/useTheme'
import { useArchive } from './composables/useArchive'
import { useTransactions } from './composables/useTransactions'
import type {
  LifeEntry,
  Project,
  ArchiveCategory,
  StorageStatus,
  GlobalStats,
  Transaction,
  SiteConfig,
  CuratorProfile,
  SystemStatus,
} from './types'
import { entryMatchesCategory } from './types'
import { parseOccurredDate } from './utils/format'
import {
  fetchEntryById,
  fetchStorageStatus,
  fetchGlobalStats,
  fetchProjects,
  fetchSiteConfig,
  fetchCuratorProfile,
  fetchSystemStatus,
} from './utils/api'
import { loadCuratorProfile, saveCuratorProfile, DEFAULT_PROFILE } from './utils/profile'
import { markEnteredArchive, clearEnteredArchive, hasEnteredArchiveSession } from './utils/auth'

// 统一主理人档案与本地缓存同步 (RC-24, RC-29, RC-31, RC-32, RC-47, RG-09)
const syncProfileCache = (profile: CuratorProfile) => {
  curatorProfile.value = profile
  saveCuratorProfile({
    ...DEFAULT_PROFILE,
    ...profile,
    email: profile.email || profile.social_links?.email || '',
    github: profile.github || profile.social_links?.github || '',
    edc_gear: profile.edc_gear || [],
  })
}

// 1. 基础视图与主题模式
const currentView = ref<string>('home')
const { theme, toggleTheme } = useTheme()
const siteConfig = ref<SiteConfig | null>(null)
const curatorProfile = ref<CuratorProfile | null>(loadCuratorProfile())

// 2. 生活档案与即时搜索
const {
  entries,
  currentCategory,
  allTags,
  loadRemoteEntries,
  addEntry,
  updateEntry,
  removeEntry,
} = useArchive()

// 3. 独立记账体系
const {
  transactions: transactionsList,
  loadRemoteTransactions,
  addTransaction,
  updateTransactionItem,
  removeTransaction,
  txToEntry,
} = useTransactions()

// 造物项目列表 (真实空态，由后端驱动 RC-38)
const projects = ref<Project[]>([])

// 模态框显隐控制
const selectedEntry = ref<LifeEntry | null>(null)
const isNewEntryOpen = ref(false)
const newEntryInitialKind = ref<'life' | 'thought' | 'photo' | 'project' | 'collection' | 'transaction' | undefined>(undefined)

const openNewEntry = (kind?: 'life' | 'thought' | 'photo' | 'project' | 'collection' | 'transaction') => {
  newEntryInitialKind.value = kind || (currentView.value === 'transactions' ? 'transaction' : undefined)
  isNewEntryOpen.value = true
}

const isStorageOpen = ref(false)
const isStatsOpen = ref(false)
const isSearchOpen = ref(false)
const isExportOpen = ref(false)
const isPairingOpen = ref(false)

const systemStatus = ref<SystemStatus | null>(null)
const storageStatus = ref<StorageStatus | null>(null)
const globalStats = ref<GlobalStats | null>(null)

const storageConfigured = computed(() => Boolean(storageStatus.value?.configured))

// 融合生活印记与记账的完整时间流
const allTimelineEntries = computed(() => {
  const txEntries = transactionsList.value.map(txToEntry)
  const combined = [...entries.value, ...txEntries]
  combined.sort((a, b) => {
    const timeA = parseOccurredDate(a.occurred_at).timestamp
    const timeB = parseOccurredDate(b.occurred_at).timestamp
    return timeB - timeA
  })
  return combined
})

const filteredEntriesByCategory = computed(() => {
  if (currentCategory.value === 'all') {
    return allTimelineEntries.value
  }
  return allTimelineEntries.value.filter((e) => entryMatchesCategory(e, currentCategory.value))
})

const handleCategoryChange = (cat: ArchiveCategory) => {
  currentCategory.value = cat
  if (currentView.value !== 'home' && currentView.value !== 'life') {
    currentView.value = 'home'
    window.location.hash = 'home'
  }
}

const navigateTo = (view: string) => {
  if (['transactions', 'assets'].includes(view) && !getAdminToken()) {
    currentView.value = 'archive'
    window.location.hash = 'archive'
    return
  }
  currentView.value = view
  window.location.hash = view
}

const openEntryDetail = (entry: LifeEntry) => {
  if (entry.is_transaction) {
    if (getAdminToken()) {
      navigateTo('transactions')
    }
    return
  }
  selectedEntry.value = entry
  window.location.hash = `entry/${entry.id}`
}

const closeEntryDetail = () => {
  selectedEntry.value = null
  if (window.location.hash.startsWith('#entry/')) {
    window.location.hash = currentView.value
  }
}

const handleSelectTag = (_tag: string) => {
  isSearchOpen.value = true
}

const openStatsModal = async () => {
  isStatsOpen.value = true
  try {
    globalStats.value = await fetchGlobalStats()
  } catch {}
}

const openStorageModal = async () => {
  isStorageOpen.value = true
  try {
    storageStatus.value = await fetchStorageStatus()
  } catch {}
}

const handleEntryCreated = (newEntry: LifeEntry) => {
  addEntry(newEntry)
  loadRemoteEntries()
  if (currentView.value !== 'home' && currentView.value !== 'life') {
    navigateTo('home')
  }
}

const handleEntryUpdated = (updated: LifeEntry) => {
  updateEntry(updated)
  selectedEntry.value = updated
  loadRemoteEntries()
}

const handleEntryDeleted = (id: number) => {
  removeEntry(id)
  if (selectedEntry.value?.id === id) {
    selectedEntry.value = null
  }
  if (window.location.hash.startsWith('#entry/')) {
    window.location.hash = currentView.value
  }
  loadRemoteEntries()
}

const handleTxCreated = (tx: Transaction) => {
  addTransaction(tx)
}

const handleTxUpdated = (tx: Transaction) => {
  updateTransactionItem(tx)
}

const handleTxDeleted = (id: number) => {
  removeTransaction(id)
}

const handleProjectCreated = (newProj: Project) => {
  projects.value = [newProj, ...projects.value]
}

const handleProjectUpdated = (updated: Project) => {
  projects.value = projects.value.map((p) => (p.id === updated.id ? updated : p))
}

const handleProjectDeleted = (id: number) => {
  projects.value = projects.value.filter((p) => p.id !== id)
}

const refreshData = async () => {
  try {
    const [, statsData, statusData] = await Promise.allSettled([
      Promise.all([loadRemoteEntries(), loadRemoteTransactions()]),
      fetchGlobalStats(),
      fetchStorageStatus(),
    ])
    if (statsData.status === 'fulfilled' && statsData.value) {
      globalStats.value = statsData.value
    }
    if (statusData.status === 'fulfilled' && statusData.value) {
      storageStatus.value = statusData.value
    }
  } catch {}
}

const handleHashChange = async () => {
  const hash = window.location.hash.replace('#', '')
  if (hash.startsWith('entry/')) {
    const idStr = hash.replace('entry/', '')
    const id = parseInt(idStr, 10)
    if (!isNaN(id)) {
      const found = entries.value.find((e) => e.id === id)
      if (found) {
        selectedEntry.value = found
      } else {
        try {
          const fetched = await fetchEntryById(id)
          if (fetched) selectedEntry.value = fetched
        } catch {}
      }
    }
    return
  }

  if (!hash || hash === 'home' || hash === 'life') {
    currentView.value = 'home'
    selectedEntry.value = null
  } else if (['transactions', 'archive', 'projects', 'about'].includes(hash)) {
    if (['transactions', 'assets'].includes(hash) && !getAdminToken()) {
      currentView.value = 'archive'
      window.location.hash = 'archive'
      selectedEntry.value = null
      return
    }
    currentView.value = hash
    selectedEntry.value = null
  }
}

onMounted(async () => {
  await handleHashChange()
  window.addEventListener('hashchange', handleHashChange)

  await refreshData()

  try {
    const [projRes, cfgRes, profRes, sysRes] = await Promise.allSettled([
      fetchProjects(),
      fetchSiteConfig(),
      fetchCuratorProfile(),
      fetchSystemStatus(),
    ])

    if (projRes.status === 'fulfilled' && Array.isArray(projRes.value)) {
      projects.value = projRes.value
    }
    if (cfgRes.status === 'fulfilled' && cfgRes.value) {
      siteConfig.value = cfgRes.value
      document.title = '散页 · 生活档案与时光手账'
    }
    if (profRes.status === 'fulfilled' && profRes.value) {
      syncProfileCache(profRes.value)
    }
    if (sysRes.status === 'fulfilled' && sysRes.value) {
      systemStatus.value = sysRes.value
      // 若系统尚未初始化，必须停留在欢迎扉页装帧向导
      if (!sysRes.value.initialized) {
        hasEnteredArchive.value = false
      } else if (Boolean(getAdminToken()) || hasEnteredArchiveSession()) {
        hasEnteredArchive.value = true
      }
    }
  } catch {}

  window.addEventListener('looseleaf-profile-updated', ((e: CustomEvent) => {
    if (e.detail) {
      curatorProfile.value = { ...curatorProfile.value, ...e.detail }
    }
  }) as EventListener)
})

// 顶级大屏页面与真正网站的流转状态 (RC-25)
const checkHasEntered = (): boolean => {
  return Boolean(getAdminToken()) || hasEnteredArchiveSession()
}

const hasEnteredArchive = ref<boolean>(checkHasEntered())

const handleEnterArchive = () => {
  hasEnteredArchive.value = true
  markEnteredArchive()
  refreshData()
}

const handleReturnToWelcome = () => {
  hasEnteredArchive.value = false
  clearEnteredArchive()
}

const handleBootstrapped = async () => {
  try {
    const [cfg, prof, sys] = await Promise.allSettled([
      fetchSiteConfig(),
      fetchCuratorProfile(),
      fetchSystemStatus(),
    ])
    if (cfg.status === 'fulfilled' && cfg.value) siteConfig.value = cfg.value
    if (prof.status === 'fulfilled' && prof.value) syncProfileCache(prof.value)
    if (sys.status === 'fulfilled' && sys.value) systemStatus.value = sys.value
  } catch {}
  hasEnteredArchive.value = true
  markEnteredArchive()
  refreshData()
}

watch(currentView, (newV) => {
  if (!window.location.hash.startsWith('#entry/')) {
    window.location.hash = newV
  }
})
</script>

<template>
  <!-- 1. 独立全屏大屏页面：欢迎扉页 / 迎宾与登入门户 (类似全屏登录页架构，点击后方才进入真正网站) -->
  <WelcomePortal
    v-if="!hasEnteredArchive"
    :theme="theme"
    :systemStatus="systemStatus"
    @enter="handleEnterArchive"
    @toggleTheme="toggleTheme"
    @bootstrapped="handleBootstrapped"
  />

  <!-- 2. 真正的网站展厅本体：点击进入之后才加载并呈现 -->
  <div
    v-else
    class="min-h-screen bg-[var(--bg-archive)] text-[var(--ink-primary)] flex flex-col justify-between selection:bg-[var(--accent-warm)]/15 selection:text-[var(--accent-warm)] transition-colors duration-300"
  >
    <!-- 原生 SVG 纸张微噪点覆盖层（哑光相纸与实体书质感） -->
    <div class="paper-grain-overlay" aria-hidden="true" />

    <!-- 极简出版风顶部导航 -->
    <HeaderNav
      :currentView="currentView"
      :currentCategory="currentCategory"
      :theme="theme"
      :config="siteConfig"
      :profile="curatorProfile"
      @navigate="navigateTo"
      @changeCategory="handleCategoryChange"
      @openAdd="openNewEntry()"
      @openSearch="isSearchOpen = true"
      @openExport="isExportOpen = true"
      @openPairing="isPairingOpen = true"
      @toggleTheme="toggleTheme"
      @openStats="openStatsModal"
      @openStorage="openStorageModal"
    />

    <!-- 主视图区 -->
    <main class="flex-grow">
      
      <!-- 1. HOME 视图：克制开篇封面 + 最近一年生活刻度热力图 + 近况生活流 -->
      <HomeView
        v-if="currentView === 'home'"
        :entries="filteredEntriesByCategory"
        :allEntries="allTimelineEntries"
        :currentCategory="currentCategory"
        :config="siteConfig"
        :profile="curatorProfile"
        @navigate="navigateTo"
        @changeCategory="handleCategoryChange"
        @selectEntry="openEntryDetail"
        @selectTag="handleSelectTag"
        @openAdd="openNewEntry()"
      />

      <!-- 2. TRANSACTIONS 视图：独立记账与资产管理模块 (RG-11, RC-53) -->
      <TransactionsView
        v-else-if="currentView === 'transactions'"
        :transactions="transactionsList"
        :profile="curatorProfile"
        @openAdd="openNewEntry('transaction')"
        @transactionDeleted="handleTxDeleted"
        @transactionUpdated="handleTxUpdated"
      />

      <!-- 3. ARCHIVE 视图：按年/按月索引 (RG-12) -->
      <ArchiveView
        v-else-if="currentView === 'archive'"
        :entries="entries"
        @selectEntry="openEntryDetail"
      />

      <!-- 4. PROJECTS 视图：作为人生经历的一章 (造物 / Things I Made) -->
      <ProjectsView
        v-else-if="currentView === 'projects'"
        :projects="projects"
        @projectCreated="handleProjectCreated"
        @projectUpdated="handleProjectUpdated"
        @projectDeleted="handleProjectDeleted"
      />

      <!-- 6. ABOUT 视图：自然真诚的个人自白与档案馆初衷 -->
      <AboutView
        v-else-if="currentView === 'about'"
        :profile="curatorProfile"
        @profileUpdated="curatorProfile = $event"
      />

    </main>

    <!-- 极简合规页脚（工信部与公安备案直链） -->
    <FooterArchive
      :config="siteConfig"
      :profile="curatorProfile"
      @openWelcome="handleReturnToWelcome"
    />

    <!-- 全局快捷新增浮动操作按钮 (桌面端 + 移动端右下角) -->
    <FloatingActionButton @click="openNewEntry()" />

    <!-- 1. 全局即时模糊搜索与标签检索弹窗 (Cmd+K) -->
    <SearchModal
      v-if="isSearchOpen"
      :isOpen="isSearchOpen"
      :entries="entries"
      :tags="allTags"
      @close="isSearchOpen = false"
      @selectEntry="openEntryDetail"
    />

    <!-- 2. 数据主权全量备份与导出中心 (JSON / MD / CSV) -->
    <ExportModal
      v-if="isExportOpen"
      :isOpen="isExportOpen"
      :entries="entries"
      :transactions="transactionsList"
      :projects="projects"
      @close="isExportOpen = false"
    />

    <!-- 3. 新增生活记录/记账 弹窗 (RG-11) -->
    <NewEntryModal
      v-if="isNewEntryOpen"
      :isOpen="isNewEntryOpen"
      :storageConfigured="storageConfigured"
      :projects="projects"
      :initialKind="newEntryInitialKind"
      @close="isNewEntryOpen = false"
      @entryCreated="handleEntryCreated"
      @transactionCreated="handleTxCreated"
      @projectCreated="handleProjectCreated"
    />

    <!-- 4. 生活记录详情 / 编辑 / 删除 弹窗 -->
    <EntryDetailModal
      v-if="Boolean(selectedEntry)"
      :entry="selectedEntry"
      :storageConfigured="storageConfigured"
      :projects="projects"
      @close="closeEntryDetail"
      @updated="handleEntryUpdated"
      @deleted="handleEntryDeleted"
    />

    <!-- 5. 对象存储状态 弹窗 -->
    <StorageModal
      v-if="isStorageOpen"
      :isOpen="isStorageOpen"
      :status="storageStatus"
      @close="isStorageOpen = false"
    />

    <!-- 6. 统计指标 弹窗 -->
    <StatsModal
      v-if="isStatsOpen"
      :isOpen="isStatsOpen"
      :stats="globalStats"
      @close="isStatsOpen = false"
    />

    <!-- 7. 设备免密配对与受信任设备管理 弹窗 -->
    <DevicePairingModal
      v-if="isPairingOpen"
      :isOpen="isPairingOpen"
      @close="isPairingOpen = false"
    />

  </div>
</template>
