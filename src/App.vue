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

// 统一主理人档案与本地缓存同步 (RC-24)
const syncProfileCache = (profile: CuratorProfile) => {
  curatorProfile.value = profile
  saveCuratorProfile({
    ...DEFAULT_PROFILE,
    name: profile.name || DEFAULT_PROFILE.name,
    title: profile.title || DEFAULT_PROFILE.title,
    avatar: profile.avatar || profile.avatar_url || DEFAULT_PROFILE.avatar,
    avatar_key: profile.avatar_key || '',
    location: profile.location || DEFAULT_PROFILE.location,
    current_city: profile.current_city || DEFAULT_PROFILE.current_city,
    bio: profile.bio || DEFAULT_PROFILE.bio,
    philosophy: profile.philosophy || profile.motto || DEFAULT_PROFILE.philosophy,
    motto: profile.philosophy || profile.motto || DEFAULT_PROFILE.motto,
    email: profile.email || DEFAULT_PROFILE.email,
    github: profile.github || profile.social_links?.github || DEFAULT_PROFILE.github,
    gearList: profile.gearList || profile.edc_gear || DEFAULT_PROFILE.gearList,
  })
}

// 1. 基础视图与主题模式
const currentView = ref<string>('home')
const { theme, toggleTheme } = useTheme()
const siteConfig = ref<SiteConfig | null>(null)
const curatorProfile = ref<CuratorProfile | null>(loadCuratorProfile() as unknown as CuratorProfile)

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

// 造物项目列表 (Things I made)
const projects = ref<Project[]>([
  {
    id: 1,
    title: 'SUSE-OAA-BACKEND',
    subtitle: '四川轻化工大学开放原子开源协会 · 业务后端',
    description: '为高校开源协会搭建的高可用业务后端体系，支撑协会事务流转、招新管理与校园开源数据接口。',
    story: '大二时参与协会建设，发现校园组织的招新和事务常散落在群聊里。于是和同伴一起用 Go 搭建了这套业务核心。也是我第一次深入将分层架构与领域逻辑应用到实际生产场景中。',
    category: '校园开源',
    tags: 'Go,Gin,校园开源',
    github_url: 'https://github.com/suse-edu-cn/SUSE-OAA-BACKEND',
    status: '运行中',
    featured: true,
    order: 1,
  },
  {
    id: 2,
    title: 'ArchCanvas',
    subtitle: 'AI 辅助 Go 架构设计画布',
    description: '让 AI 与开发者一起，从需求语义理解、ER 实体建模到架构设计，快速生成与构建可运行的 Go 工程骨架。',
    story: '在画系统架构图时常常觉得图与代码是割裂的。我想做一个直观的画板，把拖拽出来的实体和微服务边界实时映射为干净的 Go struct 代码。也是探索 AI 与工程设计工具融合的小实验。',
    category: '架构实验',
    tags: 'TypeScript,Go,Architecture',
    github_url: 'https://github.com/YN1753/ArchCanvas',
    status: '迭代中',
    featured: true,
    order: 2,
  },
  {
    id: 3,
    title: 'GoLens',
    subtitle: '基于交互式状态机的 Go 底层机制透视镜',
    description: '让 GMP 协程调度、三色标记 GC 屏障与 Channel 阻塞机制清晰可见的高交互度运行时可视化工具。',
    story: '学 Go 底层时被各种纸上谈兵的图解绕晕了。既然理解不了抽象，就手写一套状态机把它像电影放映机一样在浏览器里跑起来。做完之后，GMP 的工作偷取机制就像齿轮一样印在脑子里了。',
    category: '底层透视',
    tags: 'JavaScript,Go Internals,GMP',
    github_url: 'https://github.com/YN1753/GoLens',
    status: '已稳定',
    featured: true,
    order: 3,
  },
  {
    id: 4,
    title: 'AstraLink-Desktop',
    subtitle: '基于 Wails 的图笔记桌面端应用',
    description: '星链 2.0。探索 Go + 前端混合桌面开发（Wails 架构），支持双向链接、图谱可视化与本地隐私优先的知识管理。',
    story: '一直渴望一款数据 100% 留在本地硬盘、不依赖云端账户的个人笔记。用 Wails 把 WebKit 前端和 Go 核心绑在一起，启动轻快，内存只占几十兆。',
    category: '桌面工具',
    tags: 'Go,Wails,Vue,Desktop',
    github_url: 'https://github.com/YN1753/AstraLink-Desktop',
    status: '自用中',
    featured: false,
    order: 4,
  },
  {
    id: 5,
    title: 'Go-Load',
    subtitle: '轻量分布式 HTTP 压测探针',
    description: '自制轻量级高并发压测工具，毫秒级统计 P90 / P99 延迟直方图。',
    story: '觉得现成压测工具安装繁琐，就用 Go 原生协程池手打了一个发压器。小巧单文件，丢到服务器上就能测。',
    category: '命令行工具',
    tags: 'Go,Benchmark,CLI',
    github_url: 'https://github.com/YN1753/Go-Load',
    status: '已归档',
    featured: false,
    order: 5,
  },
  {
    id: 6,
    title: 'nexus',
    subtitle: '轻量 Linux 服务器管理控制台',
    description: '个人云服务器状态监控与容器服务守护面板。',
    story: '管理自己的轻量云服务器时写的工具，随时扫一眼内存、磁盘和守护进程。',
    category: '运维监控',
    tags: 'Vue,Linux,DevOps',
    github_url: 'https://github.com/YN1753/nexus',
    status: '维护中',
    featured: false,
    order: 6,
  },
  {
    id: 7,
    title: 'DeviceDaily',
    subtitle: '支持 Mac 小组件的设备成本统计 App',
    description: '基于 Swift 原生开发，支持 macOS WidgetKit，记录电子产品日均使用成本。',
    story: '想看看手里买了三年的相机和电脑到底均摊到了多少钱一天。写了个简洁的 macOS 桌面 Widget。',
    category: 'macOS 原生',
    tags: 'Swift,macOS,WidgetKit',
    github_url: 'https://github.com/YN1753/DeviceDaily',
    status: '日常自用',
    featured: false,
    order: 7,
  },
  {
    id: 8,
    title: 'Harmo V60 浅烘冲煮方案',
    subtitle: '基于日晒埃塞俄比亚豆的变水温阶梯萃取法',
    description: '抛弃玄学冲煮，以 92℃ → 88℃ 变水温阶梯注水，稳定探索浅烘豆花果香气与甜感平衡的手冲方案。',
    story: '清晨的第一杯手冲是我开启一天的仪式。为了稳定复现柑橘与茉莉花香，用温度计和秒表记录了上百次注水数据，整理出这套自用的阶梯水温冲煮参数。',
    category: '生活手艺',
    tags: '手冲咖啡,V60,风味探索,生活手艺',
    github_url: 'https://github.com/YN1753/Loose-Leaf',
    status: '日常践行',
    featured: true,
    order: 8,
  },
  {
    id: 9,
    title: '西湖杨公堤夜骑巡航指南',
    subtitle: '21KM 环湖避开人流的深夜独行路书',
    description: '夜里十点后的西湖杨公堤没有游人与喧嚣，树影与湿润水汽掠过耳旁。包含路况、补给点与安全提示的骑行路书。',
    story: '写代码卡住或心浮气躁的夜晚，骑上公路车钻进杨公堤和茅家埠的树影里。风把杂念吹散，呼吸找回节奏。这是我在这座城市里最隐秘的充能时刻。',
    category: '路线探索',
    tags: '公路车,夜骑,西湖路书,路线探索',
    github_url: 'https://github.com/YN1753/Loose-Leaf',
    status: '长期更新',
    featured: true,
    order: 9,
  },
])

// 模态框显隐控制
const selectedEntry = ref<LifeEntry | null>(null)
const isNewEntryOpen = ref(false)
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
    const timeA = a.occurred_at
      ? new Date(a.occurred_at).getTime()
      : a.date
      ? new Date(a.date.replace(/\./g, '-')).getTime()
      : 0
    const timeB = b.occurred_at
      ? new Date(b.occurred_at).getTime()
      : b.date
      ? new Date(b.date.replace(/\./g, '-')).getTime()
      : 0
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
  currentView.value = view
  window.location.hash = view
}

const openEntryDetail = (entry: LifeEntry) => {
  if (entry.is_transaction) {
    navigateTo('transactions')
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
  loadRemoteTransactions()
}

const handleTxUpdated = (tx: Transaction) => {
  updateTransactionItem(tx)
  loadRemoteTransactions()
}

const handleTxDeleted = (id: number) => {
  removeTransaction(id)
  loadRemoteTransactions()
}

const handleProjectCreated = (newProj: Project) => {
  projects.value = [newProj, ...projects.value]
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

    if (projRes.status === 'fulfilled' && projRes.value && projRes.value.length > 0) {
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
      @openAdd="isNewEntryOpen = true"
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
        @openAdd="isNewEntryOpen = true"
      />

      <!-- 2. TRANSACTIONS 视图：独立记账模块 -->
      <TransactionsView
        v-else-if="currentView === 'transactions'"
        :transactions="transactionsList"
        @openAdd="isNewEntryOpen = true"
        @transactionDeleted="handleTxDeleted"
        @transactionUpdated="handleTxUpdated"
      />

      <!-- 3. ARCHIVE 视图：按年/按月索引 -->
      <ArchiveView
        v-else-if="currentView === 'archive'"
        :entries="entries"
      />

      <!-- 4. PROJECTS 视图：作为人生经历的一章 (造物 / Things I Made) -->
      <ProjectsView
        v-else-if="currentView === 'projects'"
        :projects="projects"
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
    <FloatingActionButton @click="isNewEntryOpen = true" />

    <!-- 1. 全局即时模糊搜索与标签检索弹窗 (Cmd+K) -->
    <SearchModal
      v-if="isSearchOpen"
      :isOpen="isSearchOpen"
      :entries="entries"
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

    <!-- 3. 新增生活记录/记账 弹窗 -->
    <NewEntryModal
      v-if="isNewEntryOpen"
      :isOpen="isNewEntryOpen"
      :storageConfigured="storageConfigured"
      :projects="projects"
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
