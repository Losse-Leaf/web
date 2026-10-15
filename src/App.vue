<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import HeaderNav from './components/HeaderNav.vue'
import HomeView from './components/HomeView.vue'
import ArchiveView from './components/ArchiveView.vue'
import ProjectsView from './components/ProjectsView.vue'
import WishlistView from './components/WishlistView.vue'
import TravelAtlasView from './components/TravelAtlasView.vue'
import AboutView from './components/AboutView.vue'
import FooterArchive from './components/FooterArchive.vue'
import TransactionsView from './components/TransactionsView.vue'
import NewEntryModal from './components/NewEntryModal.vue'
import EntryDetailModal from './components/EntryDetailModal.vue'
import StorageBackupModal from './components/StorageBackupModal.vue'
import StatsModal from './components/StatsModal.vue'
import SearchModal from './components/SearchModal.vue'
import DevicePairingModal from './components/DevicePairingModal.vue'
import UpdateCheckModal from './components/UpdateCheckModal.vue'
import CategoryManagerModal from './components/CategoryManagerModal.vue'
import ConfirmDialog from './components/ConfirmDialog.vue'
import PasscodeModal from './components/PasscodeModal.vue'
import WelcomePortal from './components/WelcomePortal.vue'
import FloatingActionButton from './components/FloatingActionButton.vue'
import { getAdminToken, removeAdminToken } from './utils/api'
import { useTheme } from './composables/useTheme'
import { useArchive } from './composables/useArchive'
import { useTransactions } from './composables/useTransactions'
import { useCategories } from './composables/useCategories'
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
  verifyMasterPasscode,
  resetEntriesETag,
  clearApiCache,
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
const newEntryInitialKind = ref<'life' | 'travel' | 'project' | 'wish' | 'transaction' | undefined>(undefined)
const newEntryInitialProjectId = ref<number | undefined>(undefined)
const newEntryInitialCityCode = ref('')
const newEntryInitialCityName = ref('')

const openNewEntry = (
  kind?: 'life' | 'travel' | 'project' | 'wish' | 'transaction',
  projectId?: number,
  city?: { code: string; name: string }
) => {
  newEntryInitialKind.value =
    kind ||
    (currentView.value === 'transactions'
      ? 'transaction'
      : currentView.value === 'projects'
        ? 'project'
        : currentView.value === 'wishes' || currentView.value === 'wishlist'
          ? 'wish'
          : currentView.value === 'atlas' || currentView.value === 'footprints'
            ? 'travel'
            : undefined)
  newEntryInitialProjectId.value = projectId
  newEntryInitialCityCode.value = city?.code || ''
  newEntryInitialCityName.value = city?.name || ''
  isNewEntryOpen.value = true
}

const handleOpenAddWithCity = (city: { code: string; name: string }) => {
  openNewEntry('travel', undefined, city)
}

const isStorageBackupOpen = ref(false)
const storageBackupInitialTab = ref<'backup' | 'storage' | 'export'>('backup')
const isStatsOpen = ref(false)
const isSearchOpen = ref(false)
const isPairingOpen = ref(false)
const isUpdateCheckOpen = ref(false)

const isPasscodeModalOpen = ref(false)
const passcodeModalPrompt = ref('')
const passcodeModalCallback = ref<(() => void) | null>(null)
const wishesRefreshKey = ref(0)
const atlasRefreshKey = ref(0)
const txRefreshKey = ref(0)
const archiveRefreshKey = ref(0)

const handleRequestAuth = (callback?: () => void, prompt?: string) => {
  if (Boolean(getAdminToken())) {
    callback?.()
    return
  }
  passcodeModalPrompt.value = prompt || '请输入管理员密钥以授权发布与管理'
  passcodeModalCallback.value = callback || null
  isPasscodeModalOpen.value = true
}

const handleAuthenticated = async () => {
  const cb = passcodeModalCallback.value
  passcodeModalCallback.value = null
  isPasscodeModalOpen.value = false
  if (cb) {
    cb()
  }
  await refreshData()
}

const handleLogout = () => {
  removeAdminToken()
  clearEnteredArchive()
  refreshData()
  window.location.reload()
}

const openUpdateCheckModal = () => {
  if (!getAdminToken()) return
  isUpdateCheckOpen.value = true
}

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
    currentView.value = 'home'
    window.location.hash = 'home'
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

const openStatsModal = async () => {
  isStatsOpen.value = true
  try {
    globalStats.value = await fetchGlobalStats()
  } catch (err) {
    console.error('Failed to fetch global stats:', err)
  }
}

const openStorageBackupModal = async (tab: 'backup' | 'storage' | 'export' = 'backup') => {
  storageBackupInitialTab.value = tab
  isStorageBackupOpen.value = true
  try {
    storageStatus.value = await fetchStorageStatus()
  } catch (err) {
    console.error('Failed to fetch storage status:', err)
  }
}

const handleEntryCreated = (newEntry: LifeEntry) => {
  addEntry(newEntry)
  loadRemoteEntries()
  wishesRefreshKey.value++
  atlasRefreshKey.value++
  archiveRefreshKey.value++
  if (
    currentView.value !== 'home' &&
    currentView.value !== 'life' &&
    currentView.value !== 'archive' &&
    currentView.value !== 'projects' &&
    currentView.value !== 'wishes' &&
    currentView.value !== 'wishlist' &&
    currentView.value !== 'atlas' &&
    currentView.value !== 'footprints' &&
    currentView.value !== 'about'
  ) {
    navigateTo('home')
  }
}

const handleEntryUpdated = (updated: LifeEntry) => {
  updateEntry(updated)
  selectedEntry.value = updated
  loadRemoteEntries()
  wishesRefreshKey.value++
  atlasRefreshKey.value++
  archiveRefreshKey.value++
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
  wishesRefreshKey.value++
  atlasRefreshKey.value++
  archiveRefreshKey.value++
}

const handleTxCreated = async (tx: Transaction) => {
  addTransaction(tx)
  txRefreshKey.value++
  try {
    const prof = await fetchCuratorProfile()
    if (prof) syncProfileCache(prof)
  } catch {
    // ignore
  }
}

const handleTxUpdated = (tx: Transaction) => {
  updateTransactionItem(tx)
  txRefreshKey.value++
}

const handleTxDeleted = (id: number) => {
  removeTransaction(id)
  txRefreshKey.value++
}

const handleGearChanged = async () => {
  try {
    const [profRes] = await Promise.allSettled([fetchCuratorProfile(), loadRemoteTransactions()])
    if (profRes.status === 'fulfilled' && profRes.value) {
      syncProfileCache(profRes.value)
    }
  } catch (err) {
    console.warn('Failed to refresh gear assets:', err)
  }
}

const handleRestored = () => {
  clearApiCache()
  resetEntriesETag()
  window.location.reload()
}

const handleProjectCreated = (newProj: Project) => {
  projects.value = [newProj, ...projects.value]
  loadRemoteEntries()
}

const handleProjectUpdated = (updated: Project) => {
  projects.value = projects.value.map((p) => (p.id === updated.id ? updated : p))
  loadRemoteEntries()
}

const handleProjectDeleted = (id: number) => {
  projects.value = projects.value.filter((p) => p.id !== id)
}

const refreshData = async () => {
  wishesRefreshKey.value++
  atlasRefreshKey.value++
  archiveRefreshKey.value++
  try {
    const [, statsData, statusData, profData] = await Promise.allSettled([
      Promise.all([loadRemoteEntries(), loadRemoteTransactions()]),
      fetchGlobalStats(),
      fetchStorageStatus(),
      fetchCuratorProfile(),
    ])
    if (statsData.status === 'fulfilled' && statsData.value) {
      globalStats.value = statsData.value
    }
    if (statusData.status === 'fulfilled' && statusData.value) {
      storageStatus.value = statusData.value
    }
    if (profData.status === 'fulfilled' && profData.value) {
      syncProfileCache(profData.value)
    }
  } catch (err) {
    console.error('Failed to refresh data:', err)
  }
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
        } catch (err) {
          console.error(`Failed to fetch entry #${id}:`, err)
        }
      }
    }
    return
  }

  if (!hash || hash === 'home' || hash === 'life') {
    currentView.value = 'home'
    selectedEntry.value = null
  } else if (
    ['transactions', 'archive', 'projects', 'about', 'wishes', 'wishlist', 'atlas', 'footprints'].includes(hash)
  ) {
    if (['transactions', 'assets'].includes(hash) && !getAdminToken()) {
      currentView.value = 'home'
      window.location.hash = 'home'
      selectedEntry.value = null
      return
    }
    const normalizedHash =
      hash === 'wishlist' ? 'wishes' : hash === 'footprints' ? 'atlas' : hash
    currentView.value = normalizedHash
    selectedEntry.value = null
  }
}

const { loadCategories } = useCategories()

onMounted(async () => {
  loadCategories()
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
      const cfg = cfgRes.value
      if (cfg.site_name && cfg.site_name.includes('时光手账')) {
        cfg.site_name = '散页 · 个人生活志'
      }
      siteConfig.value = cfg
      document.title = cfg.site_name || '散页 · 个人生活志'
    }
    if (profRes.status === 'fulfilled' && profRes.value) {
      syncProfileCache(profRes.value)
    }
    if (sysRes.status === 'fulfilled' && sysRes.value) {
      systemStatus.value = sysRes.value
      if (!siteConfig.value?.site_name && sysRes.value.site_name) {
        document.title = sysRes.value.site_name
      }
      // 若系统尚未初始化，无条件清空本地残留旧 Token 并停留在欢迎扉页首次装帧向导 (RC-59)
      if (!sysRes.value.initialized) {
        removeAdminToken()
        clearEnteredArchive()
        hasEnteredArchive.value = false
      } else {
        // 本地调试环境自动零摩擦授权 (若尚未持有 Token，自动以默认口令 123456 获取主理人权限)
        if (!getAdminToken() && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')) {
          try {
            await verifyMasterPasscode('123456')
            await loadRemoteTransactions()
          } catch {}
        }
        if (Boolean(getAdminToken()) || hasEnteredArchiveSession()) {
          hasEnteredArchive.value = true
        }
      }
    }
  } catch (err) {
    console.warn('Initial data loading failed:', err)
  }

  window.addEventListener('looseleaf-profile-updated', ((e: CustomEvent) => {
    if (e.detail) {
      curatorProfile.value = { ...curatorProfile.value, ...e.detail }
    }
  }) as EventListener)
})

// 顶级大屏页面与真正网站的流转状态 (RC-25, RC-59)
const checkHasEntered = (): boolean => {
  return Boolean(getAdminToken()) || hasEnteredArchiveSession()
}

const hasEnteredArchive = ref<boolean>(checkHasEntered())

const handleEnterArchive = () => {
  if (systemStatus.value && !systemStatus.value.initialized) {
    return
  }
  hasEnteredArchive.value = true
  markEnteredArchive()
  refreshData()
}

const handleReturnToWelcome = () => {
  hasEnteredArchive.value = false
  clearEnteredArchive()
}

const handleBootstrapped = async () => {
  if (systemStatus.value) {
    systemStatus.value = { ...systemStatus.value, initialized: true }
  } else {
    systemStatus.value = { initialized: true, site_name: '散页' }
  }
  try {
    const [cfg, prof, sys] = await Promise.allSettled([
      fetchSiteConfig(),
      fetchCuratorProfile(),
      fetchSystemStatus(),
    ])
    if (cfg.status === 'fulfilled' && cfg.value) siteConfig.value = cfg.value
    if (prof.status === 'fulfilled' && prof.value) syncProfileCache(prof.value)
    if (sys.status === 'fulfilled' && sys.value) {
      systemStatus.value = { ...sys.value, initialized: true }
    }
  } catch (err) {
    console.error('Failed to sync state after bootstrap:', err)
  }
  hasEnteredArchive.value = true
  markEnteredArchive()
  refreshData()
}

watch(currentView, (newV) => {
  if (!window.location.hash.startsWith('#entry/')) {
    window.location.hash = newV
  }
})

watch(() => siteConfig.value?.site_name, (newName) => {
  if (newName) {
    document.title = newName
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
      @openStorageBackup="openStorageBackupModal"
      @openPairing="isPairingOpen = true"
      @openUpdateCheck="openUpdateCheckModal"
      @toggleTheme="toggleTheme"
      @openStats="openStatsModal"
      @openLogin="() => handleRequestAuth(undefined, '以主人身份登录自留地')"
      @logout="handleLogout"
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
        @openAdd="openNewEntry()"
      />

      <!-- 2. TRANSACTIONS 视图：独立资产管理模块 (RG-11, RC-53) -->
      <TransactionsView
        v-else-if="currentView === 'transactions'"
        :transactions="transactionsList"
        :refreshKey="txRefreshKey"
        :profile="curatorProfile"
        @openAdd="openNewEntry('transaction')"
        @transactionDeleted="handleTxDeleted"
        @transactionUpdated="handleTxUpdated"
        @gearChanged="handleGearChanged"
      />

      <!-- 3. ARCHIVE 视图：按年/按月索引 (RG-12) -->
      <ArchiveView
        v-else-if="currentView === 'archive'"
        :entries="entries"
        :refreshKey="archiveRefreshKey"
        @selectEntry="openEntryDetail"
      />

      <!-- 4. PROJECTS 视图：作为人生经历的一章 (造物) -->
      <ProjectsView
        v-else-if="currentView === 'projects'"
        :projects="projects"
        :entries="entries"
        @projectCreated="handleProjectCreated"
        @projectUpdated="handleProjectUpdated"
        @projectDeleted="handleProjectDeleted"
        @selectEntry="openEntryDetail"
        @openAddProjectEntry="(projId) => openNewEntry('project', projId)"
        @requestAuth="handleRequestAuth"
      />

      <!-- 4. WISHLIST 视图：三维心愿单独立展示页与归册仪式 (FE-11) -->
      <WishlistView
        v-else-if="currentView === 'wishes' || currentView === 'wishlist'"
        :storageConfigured="storageConfigured"
        :refreshKey="wishesRefreshKey"
        @wishResolved="refreshData"
        @requestAuth="handleRequestAuth"
      />

      <!-- 5. ATLAS 视图：山川行迹印谱百宝格与典藏票根 (FE-12, FE-13, RC-98) -->
      <TravelAtlasView
        v-else-if="currentView === 'atlas' || currentView === 'footprints'"
        :storageConfigured="storageConfigured"
        :refreshKey="atlasRefreshKey"
        @selectEntry="openEntryDetail"
        @footprintSaved="loadRemoteEntries"
        @openAddWithCity="handleOpenAddWithCity"
        @requestAuth="handleRequestAuth"
      />

      <!-- 6. ABOUT 视图：主理人个人主页（肖像、自白、年度生活年鉴、时间热力图与器物图鉴） -->
      <AboutView
        v-else-if="currentView === 'about'"
        :profile="curatorProfile"
        :entries="allTimelineEntries"
        @profileUpdated="curatorProfile = $event"
        @requestAuth="handleRequestAuth"
        @selectEntry="openEntryDetail"
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

    <!-- 1. 全局即时模糊搜索弹窗 (Cmd+K) -->
    <SearchModal
      v-if="isSearchOpen"
      :isOpen="isSearchOpen"
      :entries="entries"
      @close="isSearchOpen = false"
      @selectEntry="openEntryDetail"
    />

    <!-- 2. 存储设置与全量灾备中枢 (ZIP 灾备 / 对象存储 / 文稿导出) -->
    <StorageBackupModal
      v-if="isStorageBackupOpen"
      :isOpen="isStorageBackupOpen"
      :initialTab="storageBackupInitialTab"
      :entries="entries"
      :transactions="transactionsList"
      :projects="projects"
      :storageStatus="storageStatus"
      @close="isStorageBackupOpen = false"
      @restored="handleRestored"
    />

    <!-- 3. 新增生活记录/记账 弹窗 (RG-11) -->
    <NewEntryModal
      v-if="isNewEntryOpen"
      :isOpen="isNewEntryOpen"
      :storageConfigured="storageConfigured"
      :projects="projects"
      :initialKind="newEntryInitialKind"
      :initialProjectId="newEntryInitialProjectId"
      :initialCityCode="newEntryInitialCityCode"
      :initialCityName="newEntryInitialCityName"
      @close="isNewEntryOpen = false; newEntryInitialCityCode = ''; newEntryInitialCityName = ''"
      @entryCreated="handleEntryCreated"
      @transactionCreated="handleTxCreated"
      @projectCreated="handleProjectCreated"
      @wishCreated="refreshData"
      @requestAuth="handleRequestAuth"
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
      @requestAuth="handleRequestAuth"
    />

    <!-- 5. 统计指标 弹窗 -->
    <StatsModal
      v-if="isStatsOpen"
      :isOpen="isStatsOpen"
      :stats="globalStats"
      @close="isStatsOpen = false"
    />

    <!-- 6. 设备免密配对与受信任设备管理 弹窗 -->
    <DevicePairingModal
      v-if="isPairingOpen"
      :isOpen="isPairingOpen"
      @close="isPairingOpen = false"
    />

    <!-- 7. 系统版本检测 弹窗（管理端专用） -->
    <UpdateCheckModal
      v-if="isUpdateCheckOpen"
      :isOpen="isUpdateCheckOpen"
      @close="isUpdateCheckOpen = false"
    />

    <!-- 8. 全局自定义分类与字典管理 弹窗 -->
    <CategoryManagerModal />

    <!-- 10. 全站统一确认 / 提示弹窗 (原生 confirm/alert 收口 FE-21) -->
    <ConfirmDialog />

    <!-- 11. 主理人印鉴登录弹窗 -->
    <PasscodeModal
      :isOpen="isPasscodeModalOpen"
      :prompt="passcodeModalPrompt"
      @close="isPasscodeModalOpen = false; passcodeModalCallback = null"
      @authenticated="handleAuthenticated"
    />

  </div>
</template>
