<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch, defineAsyncComponent, h } from 'vue'
import HeaderNav from './components/HeaderNav.vue'
import HomeView from './components/HomeView.vue'
import FooterArchive from './components/FooterArchive.vue'
import ConfirmDialog from './components/ConfirmDialog.vue'
import WelcomePortal from './components/WelcomePortal.vue'

// ── MOB-OPT-P0: ChunkLoadError 自动重试 + loading/error 兜底 ──────────
window.addEventListener('vite:preloadError', (e: Event) => {
  e.preventDefault()
})

function retryImport<T>(loader: () => Promise<T>, retries = 2, delay = 1000): () => Promise<T> {
  return () =>
    loader().catch((err) => {
      if (retries <= 0) throw err
      return new Promise<T>((resolve) =>
        setTimeout(
          () => resolve(retryImport(loader, retries - 1, delay * 1.5)()),
          delay,
        ),
      )
    })
}

const AsyncLoadingFallback = {
  name: 'AsyncLoadingFallback',
  render() {
    return h('div', { class: 'flex items-center justify-center py-24', 'aria-label': '加载中' }, [
      h('span', {
        class: 'inline-block w-2 h-2 rounded-full bg-[var(--ink-muted)] animate-pulse',
      }),
    ])
  },
}

const AsyncErrorFallback = {
  name: 'AsyncErrorFallback',
  render() {
    return h(
      'div',
      { class: 'flex flex-col items-center justify-center py-24 gap-4 text-center' },
      [
        h('p', { class: 'text-sm text-[var(--ink-muted)]' }, '加载失败，请检查网络'),
        h(
          'button',
          {
            class:
              'px-4 py-2 text-xs font-mono-archive tracking-wider border border-[var(--border-divider)] rounded-sm hover:bg-[var(--bg-subtle)] transition-colors',
            onClick: () => window.location.reload(),
          },
          '刷新重试',
        ),
      ],
    )
  },
}

function lazyComponent(loader: () => Promise<any>) {
  return defineAsyncComponent({
    loader: retryImport(loader),
    loadingComponent: AsyncLoadingFallback,
    errorComponent: AsyncErrorFallback,
    delay: 120,
    timeout: 15_000,
  })
}

// 异步按需分包加载非首屏重型视图与管理模态框
const TransactionsView = lazyComponent(() => import('./components/TransactionsView.vue'))
const NewEntryModal = lazyComponent(() => import('./components/NewEntryModal.vue'))
const EntryDetailModal = lazyComponent(() => import('./components/EntryDetailModal.vue'))
const StorageBackupModal = lazyComponent(() => import('./components/StorageBackupModal.vue'))
const SearchModal = lazyComponent(() => import('./components/SearchModal.vue'))
const UpdateCheckModal = lazyComponent(() => import('./components/UpdateCheckModal.vue'))
const CategoryManagerModal = lazyComponent(() => import('./components/CategoryManagerModal.vue'))
const SessionExpiredModal = lazyComponent(() => import('./components/SessionExpiredModal.vue'))
const AlmanacModal = lazyComponent(() => import('./components/AlmanacModal.vue'))
const ProfileEditModal = lazyComponent(() => import('./components/ProfileEditModal.vue'))

import { getAdminToken, removeAdminToken, refreshSessionState } from './utils/api'
import { useTheme } from './composables/useTheme'
import { useArchive } from './composables/useArchive'
import { useTransactions } from './composables/useTransactions'
import { useCategories } from './composables/useCategories'
import { useConfirm } from './composables/useConfirm'
import { openModalCount } from './composables/useBodyScrollLock'
import type {
  LifeEntry,
  ArchiveCategory,
  Transaction,
  SiteConfig,
  CuratorProfile,
  SystemStatus,
} from './types'
import { BookOpen, Wallet, Plus } from 'lucide-vue-next'
import { parseOccurredDate, getBeijingYear } from './utils/format'
import {
  fetchEntryById,
  fetchSiteConfig,
  fetchCuratorProfile,
  fetchSystemStatus,
} from './utils/api'
import { loadCuratorProfile, saveCuratorProfile, DEFAULT_PROFILE } from './utils/profile'
import {
  markEnteredArchive,
  clearEnteredArchive,
  hasEnteredArchiveSession,
  redirectToOIDCLogin,
  logoutAndReload,
} from './utils/auth'

const syncProfileCache = (profile: CuratorProfile) => {
  curatorProfile.value = profile
  saveCuratorProfile({
    ...DEFAULT_PROFILE,
    ...profile,
    email: profile.email || profile.social_links?.email || '',
    github: profile.github || profile.social_links?.github || '',
  })
}

// 1. 基础视图与主题模式（仅两大顶层视图：散页 home / 记账 transactions）
const currentView = ref<'home' | 'transactions'>('home')
const ledgerTab = ref<'ledger' | 'wishes'>('ledger')

const mobileNavItems = computed(() => {
  const isAdmin = Boolean(getAdminToken())
  return [
    { key: 'home' as const, label: '散页', icon: BookOpen },
    { key: 'transactions' as const, label: isAdmin ? '记账' : '心愿单', icon: Wallet },
  ]
})

const { theme, toggleTheme } = useTheme()
const siteConfig = ref<SiteConfig | null>(null)

const VIEW_TO_PUBLIC_MODULE: Record<string, string> = {
  home: 'entries',
  life: 'entries',
  transactions: 'wishes',
  wishes: 'wishes',
  wishlist: 'wishes',
}

const PUBLIC_MODULE_TO_VIEW: Record<string, 'home' | 'transactions'> = {
  entries: 'home',
  wishes: 'transactions',
}

const isViewVisible = (view: string): boolean => {
  if (getAdminToken()) return true
  const mod = VIEW_TO_PUBLIC_MODULE[view]
  if (!mod) return false
  if (!siteConfig.value) return view === 'home'
  return (siteConfig.value.public_modules ?? []).includes(mod)
}

const firstPublicView = (): 'home' | 'transactions' => {
  const mods = siteConfig.value?.public_modules ?? []
  for (const mod of ['entries', 'wishes']) {
    if (mods.includes(mod)) {
      return PUBLIC_MODULE_TO_VIEW[mod] || 'home'
    }
  }
  return 'home'
}

const isSiteFullyPrivateForVisitor = computed(() => {
  return !getAdminToken() && Boolean(siteConfig.value) && (siteConfig.value?.public_modules?.length ?? 0) === 0
})

const visibleMobileNavItems = computed(() => {
  if (getAdminToken()) return mobileNavItems.value
  return mobileNavItems.value.filter((item) => isViewVisible(item.key))
})

const curatorProfile = ref<CuratorProfile | null>(loadCuratorProfile())

// 欢迎扉页 / 档案馆的流转状态
const hasEnteredArchive = ref<boolean>(
  Boolean(getAdminToken()) || hasEnteredArchiveSession(),
)
const systemStatus = ref<SystemStatus | null>(null)

const PROFILE_TTL_MS = 30_000
const SYSTEM_TTL_MS = 30_000
const DATA_FRESH_MS = 30_000
let profileFetchedAt = 0
let profileInFlight: Promise<CuratorProfile | null> | null = null
let systemFetchedAt = 0
let systemInFlight: Promise<SystemStatus | null> | null = null
let lastDataRefreshAt = 0
let lastDataRefreshedAsAdmin = false

const loadProfileShared = (force = false): Promise<CuratorProfile | null> => {
  if (!force && profileFetchedAt && Date.now() - profileFetchedAt < PROFILE_TTL_MS) {
    return Promise.resolve(curatorProfile.value)
  }
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
    removeAdminToken()
    clearEnteredArchive()
    hasEnteredArchive.value = false
  } else if (!suppressAutoEnter && (Boolean(getAdminToken()) || hasEnteredArchiveSession())) {
    if (Boolean(getAdminToken())) {
      markEnteredArchive()
    }
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

// 模态框显隐控制
const selectedEntry = ref<LifeEntry | null>(null)
const isNewEntryOpen = ref(false)
const newEntryInitialKind = ref<'life' | 'wish' | 'transaction' | undefined>(undefined)

const openNewEntry = (kind?: 'life' | 'wish' | 'transaction') => {
  newEntryInitialKind.value =
    kind ||
    (currentView.value === 'transactions'
      ? (ledgerTab.value === 'wishes' ? 'wish' : 'transaction')
      : undefined)
  isNewEntryOpen.value = true
}

const isStorageBackupOpen = ref(false)
const storageBackupInitialTab = ref<'backup' | 'storage' | 'visibility'>('backup')
const isSearchOpen = ref(false)
const isUpdateCheckOpen = ref(false)
const isSessionHintOpen = ref(false)
const isAlmanacOpen = ref(false)
const almanacYear = ref<number>(getBeijingYear())
const isProfileEditOpen = ref(false)

const { confirmRequest } = useConfirm()
const { loadCategories, isCategoryManagerOpen } = useCategories()
const anyModalOpen = computed(
  () =>
    openModalCount.value > 0 ||
    isSearchOpen.value ||
    isStorageBackupOpen.value ||
    isNewEntryOpen.value ||
    isUpdateCheckOpen.value ||
    isSessionHintOpen.value ||
    isAlmanacOpen.value ||
    isProfileEditOpen.value ||
    isCategoryManagerOpen.value ||
    Boolean(confirmRequest.value) ||
    Boolean(selectedEntry.value)
)

const handleOpenSearch = () => {
  if (anyModalOpen.value) return
  isSearchOpen.value = true
}

const handleOpenAlmanac = () => {
  almanacYear.value = getBeijingYear()
  isAlmanacOpen.value = true
}

const handleOpenProfile = () => {
  if (!getAdminToken()) {
    handleRequestAuth()
    return
  }
  isProfileEditOpen.value = true
}

const wishesRefreshKey = ref(0)
const txRefreshKey = ref(0)

const handleRequestAuth = () => {
  if (getAdminToken()) return
  isSessionHintOpen.value = true
}

const handleLogout = async () => {
  await logoutAndReload()
}

const openUpdateCheckModal = () => {
  if (!getAdminToken()) return
  isUpdateCheckOpen.value = true
}

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

const availableAlmanacYears = computed(() => {
  const currentYear = getBeijingYear()
  let minYear = currentYear
  allTimelineEntries.value.forEach((entry) => {
    const y = parseInt(parseOccurredDate(entry.occurred_at).year, 10)
    if (!isNaN(y) && y >= 2000 && y <= currentYear) {
      if (y < minYear) minYear = y
    }
  })
  const list: number[] = []
  for (let y = currentYear; y >= minYear; y--) {
    list.push(y)
  }
  return list
})

const handleCategoryChange = (cat: ArchiveCategory) => {
  currentCategory.value = cat
  if (currentView.value !== 'home') {
    currentView.value = 'home'
    window.location.hash = 'home'
  }
}

const navigateTo = (view: string) => {
  if (view === 'wishes' || view === 'wishlist') {
    if (!isViewVisible('wishes')) {
      const target = firstPublicView()
      currentView.value = target
      if (target === 'transactions' && !getAdminToken()) {
        ledgerTab.value = 'wishes'
      }
      window.location.hash = target === 'transactions' && ledgerTab.value === 'wishes' ? 'wishes' : target
      return
    }
    ledgerTab.value = 'wishes'
    currentView.value = 'transactions'
    window.location.hash = 'wishes'
    return
  }

  if (view === 'transactions') {
    if (!getAdminToken()) {
      if (isViewVisible('wishes')) {
        ledgerTab.value = 'wishes'
        currentView.value = 'transactions'
        window.location.hash = 'wishes'
        return
      }
      const target = firstPublicView()
      currentView.value = target
      window.location.hash = target
      return
    }
    ledgerTab.value = 'ledger'
    currentView.value = 'transactions'
    window.location.hash = 'transactions'
    return
  }

  if (!isViewVisible('home')) {
    const target = firstPublicView()
    currentView.value = target
    if (target === 'transactions' && !getAdminToken()) {
      ledgerTab.value = 'wishes'
    }
    window.location.hash = target === 'transactions' && ledgerTab.value === 'wishes' ? 'wishes' : target
    return
  }
  currentView.value = 'home'
  window.location.hash = 'home'
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
    window.location.hash =
      currentView.value === 'transactions' && ledgerTab.value === 'wishes'
        ? 'wishes'
        : currentView.value
  }
}

const openStorageBackupModal = (tab: 'backup' | 'storage' | 'visibility' = 'backup') => {
  if (!getAdminToken()) {
    handleRequestAuth()
    return
  }
  storageBackupInitialTab.value = tab
  isStorageBackupOpen.value = true
}

const handleEntryCreated = (newEntry: LifeEntry) => {
  addEntry(newEntry)
  wishesRefreshKey.value++
  if (currentView.value !== 'home' && currentView.value !== 'transactions') {
    navigateTo('home')
  }
}

const handleEntryUpdated = (updated: LifeEntry) => {
  updateEntry(updated)
  selectedEntry.value = updated
  wishesRefreshKey.value++
}

const handleEntryDeleted = (id: number) => {
  removeEntry(id)
  if (selectedEntry.value?.id === id) {
    selectedEntry.value = null
  }
  if (window.location.hash.startsWith('#entry/')) {
    window.location.hash =
      currentView.value === 'transactions' && ledgerTab.value === 'wishes'
        ? 'wishes'
        : currentView.value
  }
  wishesRefreshKey.value++
}

const handleTxCreated = async (tx: Transaction) => {
  addTransaction(tx)
  txRefreshKey.value++
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

const handleRestored = () => {
  window.location.reload()
}

let refreshDataInFlight: Promise<void> | null = null
let refreshDataAsAdmin: boolean | null = null
const refreshData = async (): Promise<void> => {
  const adminNow = Boolean(getAdminToken())
  if (refreshDataInFlight) {
    if (refreshDataAsAdmin === adminNow) return refreshDataInFlight
    await refreshDataInFlight
  }
  const run = (async () => {
    wishesRefreshKey.value++
    txRefreshKey.value++
    const isAdmin = Boolean(getAdminToken())
    const pubMods = siteConfig.value?.public_modules ?? []
    const tasks: Promise<unknown>[] = []
    if (isAdmin || !siteConfig.value || pubMods.includes('entries')) {
      tasks.push(loadRemoteEntries())
    }
    if (isAdmin || !siteConfig.value || pubMods.includes('profile')) {
      tasks.push(loadProfileShared())
    }
    if (isAdmin) {
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
    const target = isViewVisible('home') ? 'home' : firstPublicView()
    if (target === 'transactions' && !getAdminToken()) {
      ledgerTab.value = 'wishes'
    }
    currentView.value = target
    selectedEntry.value = null
  } else if (hash === 'wishes' || hash === 'wishlist') {
    if (!isViewVisible('wishes')) {
      const target = firstPublicView()
      currentView.value = target
      window.location.hash = target
      selectedEntry.value = null
      return
    }
    ledgerTab.value = 'wishes'
    currentView.value = 'transactions'
    selectedEntry.value = null
  } else if (hash === 'transactions') {
    if (!getAdminToken()) {
      if (isViewVisible('wishes')) {
        ledgerTab.value = 'wishes'
        currentView.value = 'transactions'
        selectedEntry.value = null
        return
      }
      const target = firstPublicView()
      currentView.value = target
      window.location.hash = target
      selectedEntry.value = null
      return
    }
    ledgerTab.value = 'ledger'
    currentView.value = 'transactions'
    selectedEntry.value = null
  } else {
    // 兼容已下线的旧 hash（#projects / #atlas / #about 等），优雅回落至首屏可见视图
    const target = isViewVisible('home') ? 'home' : firstPublicView()
    if (target === 'transactions' && !getAdminToken()) {
      ledgerTab.value = 'wishes'
    }
    currentView.value = target
    selectedEntry.value = null
  }
}

const handleAuthExpired = () => {
  isSessionHintOpen.value = true
}

onMounted(async () => {
  window.addEventListener('looseleaf-auth-expired', handleAuthExpired)

  const sessionTask = refreshSessionState()
  const transactionsTask = sessionTask.then((isAdmin) => {
    if (isAdmin || Boolean(getAdminToken())) return loadRemoteTransactions()
    return undefined
  })

  const bootTasks = Promise.allSettled([
    loadCategories(),
    loadRemoteEntries(),
    fetchSiteConfig(),
    loadProfileShared(),
    loadSystemStatusShared(),
    transactionsTask,
  ])

  const isSessionAdmin = await sessionTask
  if (isSessionAdmin && systemStatus.value?.initialized !== false) {
    markEnteredArchive()
    hasEnteredArchive.value = true
  }
  await handleHashChange()
  window.addEventListener('hashchange', handleHashChange)

  const results = await bootTasks
  const cfgRes = results[2]

  if (cfgRes.status === 'fulfilled' && cfgRes.value) {
    const cfg = cfgRes.value
    siteConfig.value = cfg
    document.title = cfg.site_name || '散页 · 个人生活志'
  }

  if (isSessionAdmin && systemStatus.value?.initialized !== false) {
    markEnteredArchive()
    hasEnteredArchive.value = true
  }

  lastDataRefreshAt = Date.now()
  lastDataRefreshedAsAdmin = Boolean(getAdminToken())

  window.addEventListener('looseleaf-profile-updated', handleProfileUpdatedEvent)
})

const handleProfileUpdatedEvent = ((e: CustomEvent) => {
  if (e.detail) {
    curatorProfile.value = { ...curatorProfile.value, ...e.detail }
  }
}) as EventListener

onUnmounted(() => {
  window.removeEventListener('looseleaf-auth-expired', handleAuthExpired)
  window.removeEventListener('looseleaf-profile-updated', handleProfileUpdatedEvent)
  window.removeEventListener('hashchange', handleHashChange)
})

let suppressAutoEnter = false

const handleEnterArchive = () => {
  if (systemStatus.value && !systemStatus.value.initialized) {
    return
  }
  suppressAutoEnter = false
  hasEnteredArchive.value = true
  markEnteredArchive()
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
  suppressAutoEnter = true
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

watch([currentView, ledgerTab], ([newV, tab]) => {
  if (!window.location.hash.startsWith('#entry/')) {
    const targetHash = newV === 'transactions' && tab === 'wishes' ? 'wishes' : newV
    if (window.location.hash.replace('#', '') !== targetHash) {
      window.location.hash = targetHash
    }
  }
})

watch(() => siteConfig.value?.site_name, (newName) => {
  if (newName) {
    document.title = newName
  }
})

watch(() => siteConfig.value?.public_modules, () => {
  if (!getAdminToken() && !isViewVisible(currentView.value)) {
    const target = firstPublicView()
    if (target === 'transactions') {
      ledgerTab.value = 'wishes'
    }
    if (target !== currentView.value) {
      currentView.value = target
    }
  }
})
</script>

<template>
  <!-- 1. 独立全屏大屏页面：欢迎扉页 / 迎宾与登入门户 -->
  <WelcomePortal
    v-if="!hasEnteredArchive"
    :theme="theme"
    :systemStatus="systemStatus"
    @enter="handleEnterArchive"
    @toggleTheme="toggleTheme"
    @bootstrapped="handleBootstrapped"
  />

  <!-- 2. 真正的网站展厅本体 -->
  <div
    v-else
    class="min-h-screen bg-[var(--bg-archive)] text-[var(--ink-primary)] flex flex-col justify-between selection:bg-[var(--accent-warm)]/15 selection:text-[var(--accent-warm)]"
  >
    <!-- 原生 SVG 纸张微噪点覆盖层 -->
    <div class="paper-grain-overlay" aria-hidden="true" />

    <!-- 极简出版风顶部导航 -->
    <HeaderNav
      :currentView="currentView"
      :theme="theme"
      :config="siteConfig"
      @navigate="navigateTo"
      @openAdd="openNewEntry()"
      @openAlmanac="handleOpenAlmanac"
      @openProfile="handleOpenProfile"
      @openSearch="handleOpenSearch"
      @openStorageBackup="openStorageBackupModal"
      @openUpdateCheck="openUpdateCheckModal"
      @toggleTheme="toggleTheme"
      @logout="handleLogout"
    />

    <!-- 主视图区 -->
    <main class="flex-grow pb-16 md:pb-0">
      <div
        v-if="isSiteFullyPrivateForVisitor"
        class="max-w-xl mx-auto px-6 py-24 text-center space-y-5"
      >
        <div class="text-[11px] font-mono-archive tracking-[0.25em] uppercase text-[var(--ink-faint)]">
          Private Archive
        </div>
        <h2 class="text-2xl font-serif-editorial text-[var(--ink-primary)]">
          当前展厅已设为仅主理人可见
        </h2>
        <p class="text-sm text-[var(--ink-muted)] leading-relaxed">
          主理人暂未对外开放任何公开板块。如果你是档案主理人，请登录以浏览与管理全部内容。
        </p>
        <div class="pt-2">
          <button
            type="button"
            @click="systemStatus?.oidc_enabled ? redirectToOIDCLogin() : handleRequestAuth()"
            class="min-h-[44px] px-5 py-2.5 rounded-sm bg-[var(--ink-primary)] text-[var(--bg-archive)] text-xs font-mono-archive tracking-widest uppercase hover:opacity-90 transition-opacity cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-warm)]"
          >
            {{ systemStatus?.oidc_enabled ? '使用 Vesper Auth 登录' : '主理人登录' }}
          </button>
        </div>
      </div>

      <!-- 1. 散页视图 (Stream)：开篇封面 + 那年今日 + 生活刻度热力图 + 纵向时间流 -->
      <HomeView
        v-else-if="currentView === 'home'"
        :entries="allTimelineEntries"
        :currentCategory="currentCategory"
        :config="siteConfig"
        :profile="curatorProfile"
        @changeCategory="handleCategoryChange"
        @selectEntry="openEntryDetail"
        @openAdd="openNewEntry()"
      />

      <!-- 2. 记账视图 (Ledger)：日常流水 + 内嵌心愿单 -->
      <TransactionsView
        v-else-if="currentView === 'transactions'"
        :refreshKey="txRefreshKey"
        :wishesRefreshKey="wishesRefreshKey"
        :initialTab="ledgerTab"
        @tabChange="(tab: 'ledger' | 'wishes') => (ledgerTab = tab)"
        @openAdd="(kind?: 'transaction' | 'wish') => openNewEntry(kind || 'transaction')"
        @transactionDeleted="handleTxDeleted"
        @transactionUpdated="handleTxUpdated"
        @wishResolved="refreshData"
        @requestAuth="handleRequestAuth"
      />
    </main>

    <!-- 极简合规页脚 -->
    <FooterArchive
      :config="siteConfig"
      :profile="curatorProfile"
      @openWelcome="handleReturnToWelcome"
    />

    <!-- 全局快捷新增浮动操作按钮 -->
    <div class="md:hidden h-0" />
    <aside
      v-if="!anyModalOpen"
      aria-label="快捷操作"
      class="fixed z-40"
      style="bottom: calc(4.75rem + env(safe-area-inset-bottom, 0px)); right: calc(1.5rem + env(safe-area-inset-right, 0px));"
    >
      <button
        @click="openNewEntry()"
        class="w-12 h-12 sm:w-13 sm:h-13 rounded-full bg-[var(--ink-primary)] text-[var(--bg-archive)] shadow-[0_6px_24px_rgba(0,0,0,0.18)] hover:scale-105 active:scale-95 transition-all duration-200 flex items-center justify-center cursor-pointer group"
        aria-label="新增生活记录"
      >
        <Plus class="w-5 h-5 group-hover:rotate-90 transition-transform duration-200" />
      </button>
    </aside>

    <!-- 移动端底部标签栏：散页 / 记账 -->
    <nav
      v-if="!anyModalOpen && visibleMobileNavItems.length > 0"
      class="md:hidden fixed bottom-0 inset-x-0 z-40 bg-[var(--bg-archive)]/96 backdrop-blur-md border-t border-[var(--border-subtle)] pb-[env(safe-area-inset-bottom)]"
      aria-label="移动端主导航"
    >
      <div
        class="grid"
        :style="{ gridTemplateColumns: `repeat(${visibleMobileNavItems.length}, minmax(0, 1fr))` }"
      >
        <button
          v-for="item in visibleMobileNavItems"
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

    <!-- 2. 存储设置与全量灾备中枢 -->
    <StorageBackupModal
      v-if="isStorageBackupOpen"
      :isOpen="isStorageBackupOpen"
      :initialTab="storageBackupInitialTab"
      @close="isStorageBackupOpen = false"
      @restored="handleRestored"
      @configUpdated="siteConfig = $event"
      @requestAuth="handleRequestAuth"
    />

    <!-- 3. 新增生活记录/心愿/记账 弹窗 -->
    <NewEntryModal
      v-if="isNewEntryOpen"
      :isOpen="isNewEntryOpen"
      :initialKind="newEntryInitialKind"
      @close="isNewEntryOpen = false"
      @entryCreated="handleEntryCreated"
      @transactionCreated="handleTxCreated"
      @wishCreated="refreshData"
      @requestAuth="handleRequestAuth"
    />

    <!-- 4. 生活记录详情 / 编辑 / 删除 弹窗 -->
    <EntryDetailModal
      v-if="Boolean(selectedEntry)"
      :entry="selectedEntry"
      @close="closeEntryDetail"
      @updated="handleEntryUpdated"
      @deleted="handleEntryDeleted"
      @requestAuth="handleRequestAuth"
    />

    <!-- 5. 年度生活年鉴画报弹窗 -->
    <AlmanacModal
      v-if="isAlmanacOpen"
      :isOpen="isAlmanacOpen"
      :initialYear="almanacYear"
      :availableYears="availableAlmanacYears"
      @close="isAlmanacOpen = false"
    />

    <!-- 7. 主理人资料编辑弹窗 -->
    <ProfileEditModal
      v-if="isProfileEditOpen && curatorProfile"
      :isOpen="isProfileEditOpen"
      :profile="curatorProfile"
      @close="isProfileEditOpen = false"
      @updated="curatorProfile = $event"
    />

    <!-- 8. 系统版本检测 弹窗（管理端专用） -->
    <UpdateCheckModal
      v-if="isUpdateCheckOpen"
      :isOpen="isUpdateCheckOpen"
      @close="isUpdateCheckOpen = false"
    />

    <!-- 9. 全局自定义分类与字典管理 弹窗 -->
    <CategoryManagerModal v-if="isCategoryManagerOpen" />

    <!-- 10. 全站统一确认 / 提示弹窗 -->
    <ConfirmDialog />

    <!-- 11. 主理人权限引导弹窗 -->
    <SessionExpiredModal
      v-if="isSessionHintOpen"
      :isOpen="isSessionHintOpen"
      :systemStatus="systemStatus"
      @close="isSessionHintOpen = false"
    />

  </div>
</template>
