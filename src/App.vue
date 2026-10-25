<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch, defineAsyncComponent } from 'vue'
import HeaderNav from './components/HeaderNav.vue'
import HomeView from './components/HomeView.vue'
import FooterArchive from './components/FooterArchive.vue'
import ConfirmDialog from './components/ConfirmDialog.vue'
import WelcomePortal from './components/WelcomePortal.vue'
import FloatingActionButton from './components/FloatingActionButton.vue'
import PwaUpdatePrompt from './components/PwaUpdatePrompt.vue'

// 异步按需分包加载非首屏重型视图与管理模态框，彻底消除 >500kB 单包警告并加速首屏 (FE-23)
const ArchiveView = defineAsyncComponent(() => import('./components/ArchiveView.vue'))
const ProjectsView = defineAsyncComponent(() => import('./components/ProjectsView.vue'))
const WishlistView = defineAsyncComponent(() => import('./components/WishlistView.vue'))
const TravelAtlasView = defineAsyncComponent(() => import('./components/TravelAtlasView.vue'))
const AboutView = defineAsyncComponent(() => import('./components/AboutView.vue'))
const TransactionsView = defineAsyncComponent(() => import('./components/TransactionsView.vue'))
const NewEntryModal = defineAsyncComponent(() => import('./components/NewEntryModal.vue'))
const EntryDetailModal = defineAsyncComponent(() => import('./components/EntryDetailModal.vue'))
const StorageBackupModal = defineAsyncComponent(() => import('./components/StorageBackupModal.vue'))
const StatsModal = defineAsyncComponent(() => import('./components/StatsModal.vue'))
const SearchModal = defineAsyncComponent(() => import('./components/SearchModal.vue'))
const DevicePairingModal = defineAsyncComponent(() => import('./components/DevicePairingModal.vue'))
const UpdateCheckModal = defineAsyncComponent(() => import('./components/UpdateCheckModal.vue'))
const CategoryManagerModal = defineAsyncComponent(() => import('./components/CategoryManagerModal.vue'))
const SessionExpiredModal = defineAsyncComponent(() => import('./components/SessionExpiredModal.vue'))
import { getAdminToken, removeAdminToken, refreshSessionState } from './utils/api'
import { useTheme } from './composables/useTheme'
import { useArchive } from './composables/useArchive'
import { useTransactions } from './composables/useTransactions'
import { useCategories } from './composables/useCategories'
import { useConfirm } from './composables/useConfirm'
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
import { BookOpen, Heart, MapPin, Compass, User } from 'lucide-vue-next'
import { entryMatchesCategory } from './types'
import { parseOccurredDate, getBeijingYear } from './utils/format'
import {
  fetchEntryById,
  fetchGlobalStats,
  fetchProjects,
  fetchSiteConfig,
  fetchCuratorProfile,
  fetchSystemStatus,
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

/** MOB-P1-107：移动端底部标签栏的 5 个主板块 */
const mobileNavItems = [
  { key: 'home', label: '时间流', icon: BookOpen },
  { key: 'wishes', label: '心愿', icon: Heart },
  { key: 'atlas', label: '足迹', icon: MapPin },
  { key: 'projects', label: '项目', icon: Compass },
  { key: 'about', label: '主理人', icon: User }
]
const { theme, toggleTheme } = useTheme()
const siteConfig = ref<SiteConfig | null>(null)
const curatorProfile = ref<CuratorProfile | null>(loadCuratorProfile())

// 欢迎扉页 / 档案馆的流转状态 (RC-25, RC-59)
const hasEnteredArchive = ref<boolean>(
  Boolean(getAdminToken()) || hasEnteredArchiveSession(),
)
const systemStatus = ref<SystemStatus | null>(null)

// WEB-5：共享请求与短 TTL 缓存。
// 此前 profile 在 refreshData 与启动批次里各拉一次、system 在 WelcomePortal
// 与 App 各拉一次；现在同一时刻只有一个 in-flight Promise，30 秒内复用结果。
const PROFILE_TTL_MS = 30_000
const SYSTEM_TTL_MS = 30_000
const DATA_FRESH_MS = 30_000
let profileFetchedAt = 0
let profileInFlight: Promise<CuratorProfile | null> | null = null
let systemFetchedAt = 0
let systemInFlight: Promise<SystemStatus | null> | null = null
let lastDataRefreshAt = 0
// 上一次整批数据刷新时的登录身份：封面内登录后必须补拉主理人专属数据。
let lastDataRefreshedAsAdmin = false

const loadProfileShared = (force = false): Promise<CuratorProfile | null> => {
  if (!force && profileFetchedAt && Date.now() - profileFetchedAt < PROFILE_TTL_MS) {
    return Promise.resolve(curatorProfile.value)
  }
  // force 必须绕过在途请求：否则刚记完一笔账时，复用的仍是记账前发出的
  // /profile，资产大盘会短暂回退到旧值。
  if (profileInFlight && !force) return profileInFlight
  const request = fetchCuratorProfile()
    .then((profile) => {
      if (profile) {
        syncProfileCache(profile)
        profileFetchedAt = Date.now()
      }
      return profile
    })
    .finally(() => {
      if (profileInFlight === request) profileInFlight = null
    })
  profileInFlight = request
  return request
}

const applySystemStatus = (status: SystemStatus) => {
  systemStatus.value = status
  if (!siteConfig.value?.site_name && status.site_name) {
    document.title = status.site_name
  }
  if (!status.initialized) {
    // 系统尚未初始化：无条件清空本地残留旧 Token，停留在欢迎扉页首次装帧向导 (RC-59)
    removeAdminToken()
    clearEnteredArchive()
    hasEnteredArchive.value = false
  } else if (!suppressAutoEnter && (Boolean(getAdminToken()) || hasEnteredArchiveSession())) {
    hasEnteredArchive.value = true
  }
}

const loadSystemStatusShared = (force = false): Promise<SystemStatus | null> => {
  if (!force && systemFetchedAt && Date.now() - systemFetchedAt < SYSTEM_TTL_MS) {
    return Promise.resolve(systemStatus.value)
  }
  if (systemInFlight && !force) return systemInFlight
  const request = fetchSystemStatus()
    .then((status) => {
      systemFetchedAt = Date.now()
      applySystemStatus(status)
      return status
    })
    .catch((err) => {
      console.warn('Failed to fetch system status:', err)
      return null
    })
    .finally(() => {
      if (systemInFlight === request) systemInFlight = null
    })
  systemInFlight = request
  return request
}

// 2. 生活档案与即时搜索
const {
  entries,
  currentCategory,
  loadRemoteEntries,
  refreshEntriesForYear,
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
const storageBackupInitialTab = ref<'backup' | 'storage'>('backup')
const isStatsOpen = ref(false)
const isSearchOpen = ref(false)

// MOB-P1-101：离线感知（此前完全没有 navigator.onLine 的使用，
// 断网时用户只看到「旧数据」，却不知道已经离线）
const isOnline = ref(typeof navigator === 'undefined' ? true : navigator.onLine)

const setupOnlineListeners = () => {
  if (typeof window === 'undefined') return
  window.addEventListener('online', () => { isOnline.value = true })
  window.addEventListener('offline', () => { isOnline.value = false })
}

const isPairingOpen = ref(false)
const isUpdateCheckOpen = ref(false)

const isSessionHintOpen = ref(false)

// MOB-P2-84：PWA 安装引导
// Android Chrome 会触发 beforeinstallprompt（可主动弹出安装 CTA）；
// iOS Safari 永远不会触发，只能提示用户「分享 → 添加到主屏幕」。
const deferredInstallPrompt = ref<any>(null)
const isIOS = typeof navigator !== 'undefined' &&
  /iphone|ipad|ipod/i.test(navigator.userAgent) && !(window as any).MSStream
const showInstallTip = ref(false)

const setupInstallPrompt = () => {
  if (typeof window === 'undefined') return
  window.addEventListener('beforeinstallprompt', (e: any) => {
    e.preventDefault()
    deferredInstallPrompt.value = e
    showInstallTip.value = true
  })
  window.addEventListener('appinstalled', () => {
    deferredInstallPrompt.value = null
    showInstallTip.value = false
  })
}

const promptInstall = async () => {
  const p = deferredInstallPrompt.value
  if (!p) return
  deferredInstallPrompt.value = null
  showInstallTip.value = false
  try {
    await p.prompt()
  } catch {
    // 用户拒绝或环境不支持，忽略
  }
}

// MOB-P1-93：是否处于「某个弹窗打开」状态（用于隐藏悬浮按钮与移动端底栏）
// z-[1150] 的移动端底栏会盖在任何漏计的弹窗上：分类管理弹窗（useCategories
// 单例状态）与全局确认框（useConfirm 单例的 confirmRequest）此前都不在内。
const { confirmRequest } = useConfirm()
const { loadCategories, isCategoryManagerOpen } = useCategories()
const anyModalOpen = computed(
  () =>
    isSearchOpen.value ||
    isStorageBackupOpen.value ||
    isNewEntryOpen.value ||
    isStatsOpen.value ||
    isPairingOpen.value ||
    isUpdateCheckOpen.value ||
    isSessionHintOpen.value ||
    isCategoryManagerOpen.value ||
    Boolean(confirmRequest.value) ||
    Boolean(selectedEntry.value)
)
const wishesRefreshKey = ref(0)
const atlasRefreshKey = ref(0)
const txRefreshKey = ref(0)
const archiveRefreshKey = ref(0)

// 母密钥已移除：未授信的浏览器无法就地自证身份，
// 唯一接入方式是由已配对设备签发配对二维码，这里只做引导。
const handleRequestAuth = (callback?: () => void) => {
  if (Boolean(getAdminToken())) {
    callback?.()
    return
  }
  isSessionHintOpen.value = true
}

const handleLogout = async () => {
  removeAdminToken()
  clearEnteredArchive()
  // 登出时把 API 快照与 Workbox 运行时缓存一并清掉，避免下一位访客看到主理人数据。
  await clearApiCache()
  window.location.reload()
}

const openUpdateCheckModal = () => {
  if (!getAdminToken()) return
  isUpdateCheckOpen.value = true
}

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

const openStorageBackupModal = (tab: 'backup' | 'storage' = 'backup') => {
  if (!getAdminToken()) {
    handleRequestAuth(() => openStorageBackupModal(tab))
    return
  }
  storageBackupInitialTab.value = tab
  isStorageBackupOpen.value = true
  // WEB-5：/storage/status 延迟到弹窗打开时由 StorageBackupModal 自己拉取，
  // 首屏与访客不再触碰这个管理端接口。
}

const handleEntryCreated = (newEntry: LifeEntry) => {
  // WEB-7：接口已在弹窗内确认成功，这里只做本地乐观插入。
  // 不再整库重拉 7 页；分类 / 心愿 / 足迹的刷新信号保留。
  addEntry(newEntry)
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
  wishesRefreshKey.value++
  atlasRefreshKey.value++
  archiveRefreshKey.value++
}

const handleTxCreated = async (tx: Transaction) => {
  addTransaction(tx)
  txRefreshKey.value++
  // WEB-5：与启动 / 其它入口共享同一个 in-flight Promise，避免重复 /profile。
  await loadProfileShared(true)
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
  await Promise.allSettled([
    // 器物在时间流里有伴生散页（添置 / 转手都会改写它），
    // 不刷新时间流就看不到「添置器物 · xxx」。
    loadRemoteEntries(),
    ...(Boolean(getAdminToken()) ? [loadRemoteTransactions()] : []),
    loadProfileShared(true),
  ])
}

const handleRestored = async () => {
  await clearApiCache()
  resetEntriesETag()
  window.location.reload()
}

// WEB-7：造物伴生散页可能跨年；只回源这些年份，不再整库重拉。
const projectEntryYears = (projectId?: number): string[] => {
  const years = new Set<string>()
  if (projectId) {
    entries.value.forEach((e) => {
      if (e.project_id === projectId) {
        years.add(parseOccurredDate(e.occurred_at).year)
      }
    })
  }
  if (years.size === 0) years.add(String(getBeijingYear()))
  return Array.from(years).filter(Boolean)
}

const handleProjectCreated = (newProj: Project) => {
  projects.value = [newProj, ...projects.value]
  archiveRefreshKey.value++
  void refreshEntriesForYear(projectEntryYears(newProj.id))
}

const handleProjectUpdated = (updated: Project) => {
  projects.value = projects.value.map((p) => (p.id === updated.id ? updated : p))
  archiveRefreshKey.value++
  void refreshEntriesForYear(projectEntryYears(updated.id))
}

const handleProjectDeleted = (id: number) => {
  const years = projectEntryYears(id)
  projects.value = projects.value.filter((p) => p.id !== id)
  archiveRefreshKey.value++
  // 关键：造物的伴生散页会随项目一并软删除，否则时间流里会留下
  // 一条再也点不回项目的孤儿记录。只回源相关年份即可。
  void refreshEntriesForYear(years)
}

// WEB-5：欢迎页首屏不再拉 stats / storage / transactions：
// - stats 只在打开统计弹窗时拉（openStatsModal）；
// - storage 只在打开灾备弹窗时由 StorageBackupModal 自己拉；
// - transactions 是主理人接口，访客会 401，进档案后登录时再补。
let refreshDataInFlight: Promise<void> | null = null
let refreshDataAsAdmin: boolean | null = null
const refreshData = async (): Promise<void> => {
  const adminNow = Boolean(getAdminToken())
  // 进馆 / 登录回调 / 首次装帧几乎同时触发时只跑一轮，避免重复整库拉取。
  if (refreshDataInFlight) {
    if (refreshDataAsAdmin === adminNow) return refreshDataInFlight
    // 访客那一轮不会请求 transactions；身份变了必须等它结束再补一轮。
    await refreshDataInFlight
  }
  const run = (async () => {
    wishesRefreshKey.value++
    atlasRefreshKey.value++
    archiveRefreshKey.value++
    const tasks: Promise<unknown>[] = [
      loadRemoteEntries(),
      loadProfileShared(),
    ]
    if (Boolean(getAdminToken())) {
      tasks.push(loadRemoteTransactions())
    }
    await Promise.allSettled(tasks)
    lastDataRefreshAt = Date.now()
    lastDataRefreshedAsAdmin = Boolean(getAdminToken())
  })().finally(() => {
    if (refreshDataInFlight === run) {
      refreshDataInFlight = null
      refreshDataAsAdmin = null
    }
  })
  refreshDataInFlight = run
  refreshDataAsAdmin = adminNow
  return run
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
          // 晚到防护：请求期间用户可能已切换 hash / 关闭详情，
          // 迟到的结果不能再赋给 selectedEntry，否则会凭空弹出「幽灵详情」。
          // 用全等比对（而非 startsWith）避免 entry/1 误匹配 entry/12。
          if (fetched && window.location.hash.replace('#', '') === `entry/${id}`) {
            selectedEntry.value = fetched
          }
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

// 任意请求 401 后 utils/api.ts 会先清除本地凭据并派发 'looseleaf-auth-expired'。
// 这里统一收口：弹一次 SessionExpiredModal 提示会话失效（复用 isSessionHintOpen，
// 它是布尔单弹窗，连续多个 401 事件不会叠加弹窗，只会保持打开）。
const handleAuthExpired = () => {
  isSessionHintOpen.value = true
}

// WEB-5：启动瀑布改为「一波并行」。
// 此前是 refreshSessionState → handleHashChange → refreshData → 第二批，
// 首屏要等四段串行网络；现在 session 探针、分类、全量散页、项目、config、
// profile、system 同时发出，transactions 只在确认是主理人后才发（访客不 401）。
onMounted(async () => {
  setupOnlineListeners()
  setupInstallPrompt()
  window.addEventListener('looseleaf-auth-expired', handleAuthExpired)

  const sessionTask = refreshSessionState()
  const transactionsTask = sessionTask.then((isAdmin) => {
    if (isAdmin || Boolean(getAdminToken())) return loadRemoteTransactions()
    return undefined
  })

  const bootTasks = Promise.allSettled([
    loadCategories(),
    loadRemoteEntries(),
    fetchProjects(),
    fetchSiteConfig(),
    loadProfileShared(),
    loadSystemStatusShared(),
    transactionsTask,
  ])

  // 路由不能等整批数据：只要会话角色确定就立刻应用初始 hash 并挂上监听，
  // 否则首屏网络慢时刷新 /#atlas 会一直停在首页，前进/后退也失灵。
  const isSessionAdmin = await sessionTask
  await handleHashChange()
  window.addEventListener('hashchange', handleHashChange)

  const results = await bootTasks
  // 顺序与上面的 bootTasks 一一对应（sessionTask 已单独 await）。
  const projRes = results[2]
  const cfgRes = results[3]

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

  // Cookie 会话有效但 localStorage 标记缺失时，applySystemStatus 可能来不及把
  // 主人送进档案馆；以会话探针的权威结果补一次。
  if (isSessionAdmin && systemStatus.value?.initialized !== false) {
    hasEnteredArchive.value = true
  }

  lastDataRefreshAt = Date.now()
  lastDataRefreshedAsAdmin = Boolean(getAdminToken())

  window.addEventListener('looseleaf-profile-updated', ((e: CustomEvent) => {
    if (e.detail) {
      curatorProfile.value = { ...curatorProfile.value, ...e.detail }
    }
  }) as EventListener)
})

onUnmounted(() => {
  window.removeEventListener('looseleaf-auth-expired', handleAuthExpired)
})

// 认领成功页存活期间抑制「会话/entered 标记 → 自动进馆」：
// 认领成功瞬间两者必然已写入（claimDevice 已建立会话、handleClaimSubmit 已 markEnteredArchive），
// 若不抑制，handleBootstrapped 的状态预取一返回 applySystemStatus 就会把扉页顶成展厅，
// 「建议再配对一台设备作为备份」与「翻开扉页」根本来不及呈现。进馆由成功页按钮驱动。
let suppressAutoEnter = false

const handleEnterArchive = () => {
  if (systemStatus.value && !systemStatus.value.initialized) {
    return
  }
  suppressAutoEnter = false
  hasEnteredArchive.value = true
  markEnteredArchive()
  // 启动批次刚刚拉过数据就直接进馆，避免「点进入」再整库重拉一次。
  // 但身份变了（例如封面内刚登录主人）必须补拉 transactions ——
  // 访客启动批次根本不会请求这个主理人接口。
  const adminNow = Boolean(getAdminToken())
  if (
    !lastDataRefreshAt ||
    Date.now() - lastDataRefreshAt > DATA_FRESH_MS ||
    adminNow !== lastDataRefreshedAsAdmin
  ) {
    void refreshData()
  }
}

const handleReturnToWelcome = () => {
  hasEnteredArchive.value = false
  clearEnteredArchive()
}

const handleBootstrapped = async () => {
  // 首次认领成功：只做数据预取与状态校正，**不推进馆** ——
  // 成功页（「建议再配对一台设备作为备份」）必须留在欢迎扉页上，
  // 进馆交由成功页「翻开扉页」按钮 emit('enter') → handleEnterArchive 驱动。
  // 抑制 applySystemStatus 的自动进馆，否则预取返回（亚秒级）就会顶掉成功页。
  suppressAutoEnter = true
  // 先标记新鲜，防止紧随其后的 @enter 再触发一次 refreshData。
  lastDataRefreshAt = Date.now()
  if (systemStatus.value) {
    systemStatus.value = { ...systemStatus.value, initialized: true }
  } else {
    systemStatus.value = { initialized: true, site_name: '散页' }
  }
  const [cfg, prof, sys] = await Promise.allSettled([
    fetchSiteConfig(),
    loadProfileShared(true),
    loadSystemStatusShared(true),
  ])
  if (cfg.status === 'fulfilled' && cfg.value) siteConfig.value = cfg.value
  if (prof.status === 'fulfilled' && prof.value) syncProfileCache(prof.value)
  if (sys.status === 'fulfilled' && sys.value) {
    systemStatus.value = { ...sys.value, initialized: true }
  }
  void refreshData()
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
  <!-- P0-5：PWA 新版本提示（全局，不阻塞欢迎扉页与档案本体） -->
  <PwaUpdatePrompt />

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
      :theme="theme"
      :config="siteConfig"
      @navigate="navigateTo"
      @openAdd="openNewEntry()"
      @openSearch="isSearchOpen = true"
      @openStorageBackup="openStorageBackupModal"
      @openPairing="isPairingOpen = true"
      @openUpdateCheck="openUpdateCheckModal"
      @toggleTheme="toggleTheme"
      @openStats="openStatsModal"
      @openLogin="() => handleRequestAuth()"
      @logout="handleLogout"
    />

    <!-- 主视图区 -->
    <!-- MOB-P1-107：为移动端底部标签栏留出空间 -->
    <main class="flex-grow pb-16 md:pb-0">
      
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
    <!-- MOB-P2-84：安装到主屏幕的引导 -->
    <div
      v-if="showInstallTip"
      class="fixed bottom-20 inset-x-3 z-[1200] mx-auto max-w-sm bg-[var(--bg-archive)] border border-[var(--border-subtle)] rounded-xs shadow-2xl px-4 py-3 flex items-center gap-3"
    >
      <div class="flex-1 min-w-0">
        <p class="text-xs text-[var(--ink-primary)] font-serif-editorial mb-1">把散页放到主屏幕</p>
        <p v-if="!isIOS" class="text-[11px] text-[var(--ink-muted)] font-mono-archive">随时打开，像本地手记一样离线可用</p>
        <p v-else class="text-[11px] text-[var(--ink-muted)] font-mono-archive">点击 Safari 分享按钮 → 添加到主屏幕</p>
      </div>
      <button
        v-if="!isIOS"
        type="button"
        @click="promptInstall"
        class="px-3 py-1.5 text-xs bg-[var(--accent-warm)] text-white rounded-xs cursor-pointer shrink-0"
      >
        安装
      </button>
      <button
        type="button"
        @click="showInstallTip = false"
        class="px-2 py-1.5 text-xs text-[var(--ink-muted)] cursor-pointer shrink-0"
      >
        稍后
      </button>
    </div>

    <!-- MOB-P1-101：离线横幅 -->
    <div
      v-if="!isOnline"
      class="fixed top-0 inset-x-0 z-[1200] bg-[var(--accent-warm)] text-white text-xs px-4 py-1.5 flex items-center justify-center gap-2"
    >
      <span>当前离线 · 记录会先保存在本机，联网后自动同步</span>
    </div>

    <!-- MOB-P1-93：任一弹窗打开时隐藏悬浮按钮 ——
         iOS 的 vh/dvh 不随软键盘收缩，FAB 会一直压在弹窗底部输入框上 -->
    <!-- MOB-P1-107：FAB 上移，避开移动端底部标签栏 -->
    <div class="md:hidden h-0" />
    <FloatingActionButton v-if="!anyModalOpen" @click="openNewEntry()" />

    <!--
      MOB-P1-107：移动端底部标签栏。
      此前移动端只有左上角汉堡菜单 → 每次切换主板块都要「开菜单 → 滚动 → 点」三步；
      底部标签栏让 5 个主板块一触即达，与 Android 端的底栏策略保持一致。
      桌面端（md 及以上）仍走顶部导航，不显示此栏。
    -->
    <nav
      v-if="!anyModalOpen"
      class="md:hidden fixed bottom-0 inset-x-0 z-40 bg-[var(--bg-archive)]/96 backdrop-blur-md border-t border-[var(--border-subtle)] pb-[env(safe-area-inset-bottom)]"
      aria-label="主导航"
    >
      <div class="grid grid-cols-5">
        <button
          v-for="item in mobileNavItems"
          :key="item.key"
          type="button"
          @click="navigateTo(item.key)"
          :aria-current="currentView === item.key ? 'page' : undefined"
          class="flex flex-col items-center justify-center gap-0.5 py-2 min-h-[52px] transition-colors"
          :class="currentView === item.key ? 'text-[var(--accent-warm)]' : 'text-[var(--ink-muted)]'"
        >
          <component :is="item.icon" class="w-4 h-4" :stroke-width="1.6" />
          <span class="text-[10px] font-mono-archive tracking-wider">{{ item.label }}</span>
        </button>
      </div>
    </nav>

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
      @requestAuth="handleRequestAuth"
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
    <CategoryManagerModal v-if="isCategoryManagerOpen" />

    <!-- 10. 全站统一确认 / 提示弹窗 (原生 confirm/alert 收口 FE-21) -->
    <ConfirmDialog />

    <!-- 11. 主理人权限引导弹窗（无母密钥后，未授信浏览器只能通过设备配对接入） -->
    <SessionExpiredModal
      v-if="isSessionHintOpen"
      :isOpen="isSessionHintOpen"
      @close="isSessionHintOpen = false"
    />

  </div>
</template>
