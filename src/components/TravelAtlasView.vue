<script setup lang="ts">
import { ref, computed, watch, onMounted, defineAsyncComponent } from 'vue'
import {
  Plus,
  Compass,
  Sparkles,
  Layers,
  ChevronRight,
  BookOpen,
  MapPin,
  Stamp,
  Pencil,
  Trash2,
} from 'lucide-vue-next'
import { fetchFootprintsAtlas, fetchFootprints, deleteFootprint, getAdminToken } from '../utils/api'
import { audio } from '../utils/audio'
import { askConfirm, showAlert } from '../composables/useConfirm'
import type { AtlasCitySummary, Footprint, LifeEntry } from '../types'
import { CHINA_CITIES, type CityOption } from '../utils/cities'

const AddFootprintModal = defineAsyncComponent(() => import('./AddFootprintModal.vue'))
const CityMemoryDrawerModal = defineAsyncComponent(() => import('./CityMemoryDrawerModal.vue'))
import {
  REGION_GROUPS,
  PROVINCE_SHORT_MAP,
  PROVINCE_ADCODE_MAP,
  PROVINCE_EPITHET_MAP,
  getCityEpithet,
  formatVisitStampCount,
} from '../utils/atlasHelpers'

const props = withDefaults(
  defineProps<{
    storageConfigured?: boolean
    refreshKey?: number
  }>(),
  {
    storageConfigured: true,
    refreshKey: 0,
  }
)

const emit = defineEmits<{
  (e: 'selectEntry', entry: LifeEntry): void
  (e: 'footprintSaved'): void
  (e: 'openAddWithCity', city: { code: string; name: string }): void
  (e: 'requestAuth', callback: () => void): void
}>()

const atlasData = ref<{
  total_footprints: number
  total_cities: number
  cities: AtlasCitySummary[]
}>({
  total_footprints: 0,
  total_cities: 0,
  cities: [],
})

const rawFootprints = ref<Footprint[]>([])
const isLoading = ref(false)
const loadError = ref('')
const isAddModalOpen = ref(false)
const isDrawerOpen = ref(false)
const addModalInitialCityCode = ref('')
const addModalInitialCityName = ref('')
const editingFootprint = ref<Footprint | null>(null)

const handleAddFootprintInCity = (city: { code: string; name: string }) => {
  if (!isAdmin.value) {
    emit('requestAuth', () => handleAddFootprintInCity(city))
    return
  }
  editingFootprint.value = null
  addModalInitialCityCode.value = city.code
  addModalInitialCityName.value = city.name
  isAddModalOpen.value = true
}

const handleEditFootprint = (fp: Footprint) => {
  if (!isAdmin.value) {
    emit('requestAuth', () => handleEditFootprint(fp))
    return
  }
  editingFootprint.value = fp
  isAddModalOpen.value = true
}

const handleDeleteFootprint = async (fp: Footprint) => {
  if (!isAdmin.value) {
    emit('requestAuth', () => handleDeleteFootprint(fp))
    return
  }
  const confirmed = await askConfirm({
    title: '删除山河足迹',
    message: `确定要抹去在「${fp.city_name || ''} · ${fp.title || '此行'}」留下的足迹票根吗？关联游记不受影响。`,
    danger: true,
    confirmText: '确认删除',
  })
  if (!confirmed) return

  try {
    await deleteFootprint(fp.id)
    audio.playTink()
    await loadAtlas()
    emit('footprintSaved')
  } catch (err: any) {
    showAlert({ title: '删除失败', message: err.message || '网络连接异常', danger: true })
  }
}

const handleAddEntryInCity = (city: { code: string; name: string }) => {
  if (!isAdmin.value) {
    emit('requestAuth', () => handleAddEntryInCity(city))
    return
  }
  isDrawerOpen.value = false
  emit('openAddWithCity', city)
}

// 山河印谱过滤控制：大区筛选 ('all' 或大区名称) 与 显隐模式 ('all' 全谱34省 | 'lit' 仅看已钤印)
const selectedRegionFilter = ref<string>('all')
const sealDisplayFilter = ref<'all' | 'lit'>('all')

// 票根架整理模式：'region' (按地域大区归档) | 'timeline' (按编年时间轴)
const ticketGrouping = ref<'region' | 'timeline'>('region')

// 当前在印谱中聚焦的高亮城市 (默认最新或首座城市)
const focusedCityCode = ref('')

// 选中的回忆抽屉目标
const selectedProvinceAdcode = ref('')
const selectedProvinceName = ref('')
const selectedCityCode = ref('')
const selectedCityName = ref('')

const isAdmin = computed(() => Boolean(getAdminToken()))

// 请求序号：仅接受最新一次请求的结果，避免慢响应覆盖新数据 (FE-22)
let atlasLoadSeq = 0

const loadAtlas = async () => {
  const seq = ++atlasLoadSeq
  try {
    isLoading.value = true
    loadError.value = ''
    const [atlasRes, footprintsRes] = await Promise.all([
      fetchFootprintsAtlas(),
      fetchFootprints(),
    ])
    if (seq !== atlasLoadSeq) return
    atlasData.value = atlasRes
    rawFootprints.value = footprintsRes || []

    // 默认聚焦在第一座城市
    if (atlasRes.cities && atlasRes.cities.length > 0 && !focusedCityCode.value) {
      focusedCityCode.value = atlasRes.cities[0].city_code
    }
  } catch (err: any) {
    console.error('Failed to load footprints atlas:', err)
    loadError.value = err?.message || '山河印迹加载失败，请检查服务连接'
  } finally {
    isLoading.value = false
  }
}

watch(
  () => props.refreshKey,
  () => {
    loadAtlas()
  }
)

// 原始足迹字典 (city_code -> Footprint[])
const cityFootprintsMap = computed<Map<string, Footprint[]>>(() => {
  const map = new Map<string, Footprint[]>()
  for (const fp of rawFootprints.value) {
    if (!map.has(fp.city_code)) {
      map.set(fp.city_code, [])
    }
    map.get(fp.city_code)!.push(fp)
  }
  return map
})

// 全国 375 城市基础字典 (code -> CityOption)
const chinaCityOptionMap = computed<Map<string, CityOption>>(() => {
  const map = new Map<string, CityOption>()
  for (const c of CHINA_CITIES) {
    map.set(c.code, c)
  }
  return map
})

// 各省对应的标准地级单位列表 (province -> CityOption[])
const provincePrefecturesMap = computed<Map<string, CityOption[]>>(() => {
  const map = new Map<string, CityOption[]>()
  for (const c of CHINA_CITIES) {
    if (!map.has(c.province)) {
      map.set(c.province, [])
    }
    map.get(c.province)!.push(c)
  }
  return map
})

// 已点亮城市丰富信息模型
export interface LitCityItem {
  code: string
  name: string
  shortName: string
  province: string
  pinyin: string
  epithet: string
  visitCount: number
  firstVisitedAt: string
  latestVisitedAt: string
  latestNote?: string
  latestPhotoUrl?: string
  photoCount: number
  x: number
  y: number
}

const litCitiesList = computed<LitCityItem[]>(() => {
  const list: LitCityItem[] = []
  for (const summary of atlasData.value.cities || []) {
    const base = chinaCityOptionMap.value.get(summary.city_code)
    const name = summary.city_name || base?.name || '未知城市'
    const shortName = name.replace(/市|地区|自治州|特别行政区|盟/g, '') || name
    const province = base?.province || '其他'
    const pinyin = base?.pinyin || ''
    const epithet = getCityEpithet(summary.city_code, name)
    const x = base?.x ?? 450
    const y = base?.y ?? 280

    // 提取该城市最新的足迹笔记与照片
    const fps = cityFootprintsMap.value.get(summary.city_code) || []
    let latestNote = ''
    let latestPhotoUrl = ''
    let photoCount = 0

    for (const fp of fps) {
      if (!latestNote && fp.note) {
        latestNote = fp.note
      }
      for (const att of fp.attachments || []) {
        photoCount++
        if (!latestPhotoUrl && att.url) {
          latestPhotoUrl = att.url
        }
      }
    }

    list.push({
      code: summary.city_code,
      name,
      shortName,
      province,
      pinyin,
      epithet,
      visitCount: summary.visit_count || 1,
      firstVisitedAt: summary.first_visited_at || '',
      latestVisitedAt: summary.latest_visited_at || summary.first_visited_at || '',
      latestNote,
      latestPhotoUrl,
      photoCount,
      x,
      y,
    })
  }

  return list.sort((a, b) => b.latestVisitedAt.localeCompare(a.latestVisitedAt))
})

// 当前聚焦的城市实体
const currentFocusedCity = computed<LitCityItem | null>(() => {
  if (!focusedCityCode.value && litCitiesList.value.length > 0) {
    return litCitiesList.value[0]
  }
  return litCitiesList.value.find((c) => c.code === focusedCityCode.value) || litCitiesList.value[0] || null
})

// 当前聚焦城市所在省份的全部已点亮城邑 (用于右侧折页卡快捷切换)
const focusedProvinceCities = computed<LitCityItem[]>(() => {
  if (!currentFocusedCity.value) return []
  return litCitiesList.value.filter((c) => c.province === currentFocusedCity.value!.province)
})

// 已踏足省份集合
const litProvincesSet = computed(() => {
  const set = new Set<string>()
  for (const c of litCitiesList.value) {
    if (c.province) {
      set.add(c.province)
    }
  }
  return set
})

const litCityCount = computed(() => litCitiesList.value.length)
const litProvinceCount = computed(() => litProvincesSet.value.size)
const cityCoveragePercentage = computed(() => {
  return Math.min(100, Number(((litCityCount.value / 375) * 100).toFixed(1))).toFixed(1)
})
const provinceCoveragePercentage = computed(() => {
  return Math.min(100, Number(((litProvinceCount.value / 34) * 100).toFixed(1))).toFixed(1)
})

// 34 省百宝格印笺模型
export interface ProvinceSealItem {
  name: string
  shortName: string
  adcode: string
  regionName: string
  epithet: string
  isLit: boolean
  visitedCities: LitCityItem[]
  totalPrefectures: number
  totalVisits: number
  firstVisitedAt: string
  latestVisitedAt: string
  latestNote: string
}

const allProvinceSeals = computed<ProvinceSealItem[]>(() => {
  const cityByProvince = new Map<string, LitCityItem[]>()
  for (const c of litCitiesList.value) {
    if (!cityByProvince.has(c.province)) {
      cityByProvince.set(c.province, [])
    }
    cityByProvince.get(c.province)!.push(c)
  }

  const list: ProvinceSealItem[] = []
  for (const group of REGION_GROUPS) {
    for (const prov of group.provinces) {
      const visited = (cityByProvince.get(prov) || []).sort((a, b) =>
        b.latestVisitedAt.localeCompare(a.latestVisitedAt)
      )
      const prefectures = provincePrefecturesMap.value.get(prov) || []
      let totalVisits = 0
      let firstVisitedAt = ''
      let latestVisitedAt = ''
      let latestNote = ''

      for (const c of visited) {
        totalVisits += c.visitCount
        if (!firstVisitedAt || (c.firstVisitedAt && c.firstVisitedAt < firstVisitedAt)) {
          firstVisitedAt = c.firstVisitedAt
        }
        if (!latestVisitedAt || (c.latestVisitedAt && c.latestVisitedAt > latestVisitedAt)) {
          latestVisitedAt = c.latestVisitedAt
        }
        if (!latestNote && c.latestNote) {
          latestNote = c.latestNote
        }
      }

      list.push({
        name: prov,
        shortName: PROVINCE_SHORT_MAP[prov] || prov.slice(0, 1),
        adcode: PROVINCE_ADCODE_MAP[prov] || '110000',
        regionName: group.name,
        epithet: PROVINCE_EPITHET_MAP[prov] || '山河表里 · 岁月风物',
        isLit: visited.length > 0,
        visitedCities: visited,
        totalPrefectures: Math.max(1, prefectures.length),
        totalVisits,
        firstVisitedAt,
        latestVisitedAt,
        latestNote,
      })
    }
  }

  // 已钤印的省份优先排列在前，同为已钤印按最近到访时间倒序；未钤印保持八大区人文秩序
  return list.sort((a, b) => {
    if (a.isLit !== b.isLit) return a.isLit ? -1 : 1
    if (a.isLit && b.isLit) {
      return b.latestVisitedAt.localeCompare(a.latestVisitedAt)
    }
    return 0
  })
})

const filteredProvinceSeals = computed<ProvinceSealItem[]>(() => {
  return allProvinceSeals.value.filter((item) => {
    if (selectedRegionFilter.value !== 'all' && item.regionName !== selectedRegionFilter.value) {
      return false
    }
    if (sealDisplayFilter.value === 'lit' && !item.isLit) {
      return false
    }
    return true
  })
})

// 点击百宝格中的已钤印省份：聚焦该省首座城市，二次点击或点印章直接打开省卷抽屉
const handleLitProvinceSelect = (seal: ProvinceSealItem) => {
  audio.playTink()
  if (seal.visitedCities.length > 0) {
    focusedCityCode.value = seal.visitedCities[0].code
  }
}

// 点击百宝格中的未钤印省份：主理人可直接带入该省代表城市补录足迹
const handleUnlitProvinceClick = (seal: ProvinceSealItem) => {
  const prefectures = provincePrefecturesMap.value.get(seal.name) || []
  const defaultCity = prefectures[0]
  if (defaultCity) {
    handleAddFootprintInCity({ code: defaultCity.code, name: defaultCity.name })
  } else {
    if (!isAdmin.value) {
      emit('requestAuth', () => {
        isAddModalOpen.value = true
      })
      return
    }
    isAddModalOpen.value = true
  }
}

// 票根架：按地域大区归类
const regionGroupedTickets = computed(() => {
  const cityByProvince = new Map<string, LitCityItem[]>()
  for (const c of litCitiesList.value) {
    if (!cityByProvince.has(c.province)) {
      cityByProvince.set(c.province, [])
    }
    cityByProvince.get(c.province)!.push(c)
  }

  return REGION_GROUPS.map((group) => {
    const groupCities: LitCityItem[] = []
    const visitedProvincesInGroup: { name: string; adcode: string; count: number }[] = []

    for (const prov of group.provinces) {
      const cities = cityByProvince.get(prov) || []
      if (cities.length > 0) {
        groupCities.push(...cities)
        visitedProvincesInGroup.push({
          name: prov,
          adcode: PROVINCE_ADCODE_MAP[prov] || '110000',
          count: cities.length,
        })
      }
    }

    return {
      name: group.name,
      provinces: visitedProvincesInGroup,
      cities: groupCities.sort((a, b) => b.latestVisitedAt.localeCompare(a.latestVisitedAt)),
      totalCities: groupCities.length,
    }
  }).filter((g) => g.totalCities > 0)
})

// 票根架：按编年年份归类
const timelineGroupedTickets = computed(() => {
  const groupsMap = new Map<string, LitCityItem[]>()
  for (const c of litCitiesList.value) {
    const year = c.latestVisitedAt ? c.latestVisitedAt.slice(0, 4) : '往昔'
    if (!groupsMap.has(year)) {
      groupsMap.set(year, [])
    }
    groupsMap.get(year)!.push(c)
  }

  const sortedYears = Array.from(groupsMap.keys()).sort((a, b) => b.localeCompare(a))
  return sortedYears.map((year) => ({
    year,
    cities: groupsMap.get(year)!,
  }))
})

// 打开城市回忆抽屉
const openCityDrawer = (cityCode: string, cityName: string) => {
  audio.playPaperFlip()
  selectedCityCode.value = cityCode
  selectedCityName.value = cityName
  selectedProvinceAdcode.value = ''
  selectedProvinceName.value = ''
  isDrawerOpen.value = true
}

// 打开省份回忆抽屉
const openProvinceDrawer = (adcode: string, provName: string) => {
  audio.playPaperFlip()
  selectedProvinceAdcode.value = adcode
  selectedProvinceName.value = provName
  selectedCityCode.value = ''
  selectedCityName.value = ''
  isDrawerOpen.value = true
}

const handleFootprintSaved = () => {
  loadAtlas()
  emit('footprintSaved')
}

onMounted(() => {
  loadAtlas()
})
</script>

<template>
  <div class="max-w-5xl mx-auto px-4 sm:px-8 py-10 sm:py-20 text-left space-y-12 animate-in fade-in duration-300">
    <!-- 顶栏出版物刊头与指标纸签 -->
    <header class="pb-10 border-b border-[var(--border-subtle)] space-y-4">
      <div class="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div class="flex flex-wrap items-baseline gap-3.5">
          <h1 class="type-page-heading text-[var(--ink-primary)]">
            山川行迹
          </h1>
          <span class="type-mono-meta tracking-widest text-[var(--ink-muted)]">
            山河印谱 · 典藏票根 · 旅途行历
          </span>
        </div>

        <!-- 右侧控制区：印谱显隐切换 ＋ 录入足迹 -->
        <div class="flex flex-wrap items-center gap-3">
          <div class="flex items-center p-0.5 rounded-xs bg-[var(--bg-subtle)] border border-[var(--border-subtle)]">
            <button
              @click="sealDisplayFilter = 'all'"
              class="flex items-center gap-1.5 px-3 py-1.5 text-xs font-serif-editorial rounded-xs transition-all cursor-pointer"
              :class="
                sealDisplayFilter === 'all'
                  ? 'bg-[var(--bg-archive)] text-[var(--ink-primary)] font-medium shadow-xs border border-[var(--border-subtle)]'
                  : 'text-[var(--ink-muted)] hover:text-[var(--ink-primary)]'
              "
            >
              <Stamp class="w-3.5 h-3.5" />
              <span>全谱 34 省</span>
            </button>
            <button
              @click="sealDisplayFilter = 'lit'"
              class="flex items-center gap-1.5 px-3 py-1.5 text-xs font-serif-editorial rounded-xs transition-all cursor-pointer"
              :class="
                sealDisplayFilter === 'lit'
                  ? 'bg-[var(--bg-archive)] text-[#b94a3b] font-medium shadow-xs border border-[var(--border-subtle)]'
                  : 'text-[var(--ink-muted)] hover:text-[var(--ink-primary)]'
              "
            >
              <Sparkles class="w-3.5 h-3.5" />
              <span>已钤印 ({{ litProvinceCount }})</span>
            </button>
          </div>

          <button
            @click="isAdmin ? (isAddModalOpen = true) : emit('requestAuth', () => { isAddModalOpen = true })"
            class="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-mono-archive rounded-xs border border-[var(--ink-primary)] bg-[var(--ink-primary)] text-[var(--bg-archive)] hover:opacity-90 transition-opacity cursor-pointer shadow-xs"
          >
            <Plus class="w-3.5 h-3.5" />
            <span>录入足迹</span>
          </button>
        </div>
      </div>

      <p class="font-serif-editorial text-xs sm:text-sm text-[var(--ink-muted)] leading-relaxed max-w-3xl prose-editorial">
        以三十四省活字朱砂印谱与特种纸车票存根，收录踏足过的每一处山海与城邑。拾起散落的步履，钤印成册。
      </p>
    </header>

    <!-- 错误提示条 -->
    <div
      v-if="loadError"
      class="p-4 border border-dashed border-rose-500/40 rounded-xs flex items-center justify-between gap-4 font-mono-archive text-xs"
    >
      <span class="text-rose-600 dark:text-rose-400">{{ loadError }}</span>
      <button
        @click="loadAtlas"
        class="px-3 py-1 border border-[var(--border-subtle)] hover:border-[var(--ink-primary)] rounded-xs text-[var(--ink-primary)] cursor-pointer shrink-0"
      >
        重新加载
      </button>
    </div>

    <!-- 三联生活指标纸签 -->
    <section class="grid grid-cols-1 sm:grid-cols-3 gap-4 text-left">
      <div class="bg-[var(--bg-subtle)]/60 border border-[var(--border-subtle)] p-4 rounded-xs space-y-2">
        <div class="flex items-center justify-between text-xs font-serif-editorial text-[var(--ink-muted)] tracking-wider">
          <span>点亮地级市 · 驻足城邑</span>
          <span class="font-mono-archive text-[11px]">{{ cityCoveragePercentage }}%</span>
        </div>
        <div class="flex items-baseline gap-2">
          <span class="font-serif-editorial text-2xl text-[var(--ink-primary)] font-medium">
            {{ litCityCount }}
          </span>
          <span class="text-xs text-[var(--ink-muted)] font-mono-archive">
            / 375 城
          </span>
        </div>
        <div class="w-full h-1 bg-[var(--border-subtle)]/60 rounded-full overflow-hidden">
          <div
            class="h-full bg-[#b94a3b] transition-all duration-500"
            :style="{ width: `${Math.max(litCityCount > 0 ? 3 : 0, Number(cityCoveragePercentage))}%` }"
          ></div>
        </div>
      </div>

      <div class="bg-[var(--bg-subtle)]/60 border border-[var(--border-subtle)] p-4 rounded-xs space-y-2">
        <div class="flex items-center justify-between text-xs font-serif-editorial text-[var(--ink-muted)] tracking-wider">
          <span>踏足省级区 · 山河印谱</span>
          <span class="font-mono-archive text-[11px]">{{ provinceCoveragePercentage }}%</span>
        </div>
        <div class="flex items-baseline gap-2">
          <span class="font-serif-editorial text-2xl text-[var(--ink-primary)] font-medium">
            {{ litProvinceCount }}
          </span>
          <span class="text-xs text-[var(--ink-muted)] font-mono-archive">
            / 34 省区
          </span>
        </div>
        <div class="w-full h-1 bg-[var(--border-subtle)]/60 rounded-full overflow-hidden">
          <div
            class="h-full bg-[var(--ink-primary)] transition-all duration-500"
            :style="{ width: `${Math.max(litProvinceCount > 0 ? 4 : 0, Number(provinceCoveragePercentage))}%` }"
          ></div>
        </div>
      </div>

      <div class="bg-[var(--bg-subtle)]/60 border border-[var(--border-subtle)] p-4 rounded-xs space-y-2">
        <div class="flex items-center justify-between text-xs font-serif-editorial text-[var(--ink-muted)] tracking-wider">
          <span>漫游足迹总数 · 岁月印信</span>
          <span class="font-serif-editorial text-[11px]">卷宗在册</span>
        </div>
        <div class="flex items-baseline gap-2">
          <span class="font-serif-editorial text-2xl text-[var(--ink-primary)] font-medium">
            {{ atlasData.total_footprints }}
          </span>
          <span class="text-xs text-[var(--ink-muted)] font-serif-editorial">
            次行迹刻度
          </span>
        </div>
        <div class="text-[11px] font-serif-editorial text-[var(--ink-muted)] truncate">
          <template v-if="currentFocusedCity">
            最近驻足：{{ currentFocusedCity.province }} · {{ currentFocusedCity.shortName }}
          </template>
          <template v-else>
            尚待装订第一枚山河印信
          </template>
        </div>
      </div>
    </section>

    <!-- ================================================================================== -->
    <!-- 第一卷：【山河印谱 · 三十四省御朱印百宝格】(The 34-Province Seal & Curio Cabinet)   -->
    <!-- 左侧 8 栏：八大风物分区索引 + 三十四省活字印笺百宝格                               -->
    <!-- 右侧 4 栏：当前聚焦城邑与省卷御朱印折页卡                                         -->
    <!-- ================================================================================== -->
    <section class="space-y-5">
      <!-- 八大风物分区筛选栏 -->
      <div class="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-[var(--border-subtle)]">
        <div class="flex items-center gap-2">
          <Stamp class="w-4 h-4 text-[#b94a3b]" />
          <h2 class="font-serif-editorial text-base font-medium text-[var(--ink-primary)]">
            卷一 · 山河印谱百宝格
          </h2>
          <span class="text-xs font-serif-editorial text-[var(--ink-muted)] hidden sm:inline">
            （点击已钤印省份或城邑纸签可调阅印信与回忆抽屉）
          </span>
        </div>

        <div class="flex flex-wrap items-center gap-1.5 text-xs font-serif-editorial">
          <button
            @click="selectedRegionFilter = 'all'"
            class="px-2.5 py-1 rounded-xs border transition-colors cursor-pointer"
            :class="
              selectedRegionFilter === 'all'
                ? 'border-[var(--ink-primary)] bg-[var(--ink-primary)] text-[var(--bg-archive)] font-medium'
                : 'border-[var(--border-subtle)] text-[var(--ink-muted)] hover:text-[var(--ink-primary)]'
            "
          >
            全部疆域
          </button>
          <button
            v-for="rg in REGION_GROUPS"
            :key="rg.name"
            @click="selectedRegionFilter = rg.name"
            class="px-2.5 py-1 rounded-xs border transition-colors cursor-pointer"
            :class="
              selectedRegionFilter === rg.name
                ? 'border-[var(--ink-primary)] bg-[var(--ink-primary)] text-[var(--bg-archive)] font-medium'
                : 'border-[var(--border-subtle)] text-[var(--ink-muted)] hover:text-[var(--ink-primary)]'
            "
          >
            {{ rg.name }}
          </button>
        </div>
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        <!-- 左侧 8 栏：三十四省百宝格印笺矩阵 -->
        <div class="lg:col-span-8">
          <div
            v-if="filteredProvinceSeals.length === 0"
            class="bg-[var(--bg-archive)] border border-dashed border-[var(--border-subtle)] rounded-xs p-12 text-center space-y-3"
          >
            <p class="font-serif-editorial text-base text-[var(--ink-primary)]">
              该分区暂未钤印任何省份足迹
            </p>
            <p class="font-serif-editorial text-xs text-[var(--ink-muted)]">
              可切换至「全谱 34 省」查看待探访山河印格，或直接录入新一站旅程。
            </p>
            <div class="pt-1 flex items-center justify-center gap-3">
              <button
                @click="sealDisplayFilter = 'all'; selectedRegionFilter = 'all'"
                class="px-3.5 py-1.5 text-xs font-serif-editorial border border-[var(--border-subtle)] hover:border-[var(--ink-primary)] rounded-xs text-[var(--ink-primary)] cursor-pointer"
              >
                展开全谱 34 省
              </button>
            </div>
          </div>

          <!-- 百宝格木框底盘 -->
          <div
            v-else
            class="grid grid-cols-1 sm:grid-cols-2 gap-4"
          >
            <div
              v-for="seal in filteredProvinceSeals"
              :key="seal.adcode"
              @click="seal.isLit ? handleLitProvinceSelect(seal) : handleUnlitProvinceClick(seal)"
              class="relative rounded-xs p-4 text-left transition-all duration-200 flex flex-col justify-between cursor-pointer group overflow-hidden"
              :class="[
                seal.isLit
                  ? currentFocusedCity?.province === seal.name
                    ? 'bg-[#FAF6EE] dark:bg-[#221F1C] border-2 border-[#b94a3b] shadow-[0_6px_20px_rgba(185,74,59,0.10)]'
                    : 'bg-[#FAF7F0] dark:bg-[#1C1A18] border border-[#D5CDC0] dark:border-[#383430] hover:border-[#b94a3b]/70 shadow-xs'
                  : 'bg-[var(--bg-subtle)]/35 hover:bg-[var(--bg-subtle)]/70 border border-dashed border-[var(--border-subtle)] opacity-75 hover:opacity-100',
              ]"
            >
              <!-- 顶栏：分区题名、省份主名 与 朱砂/铅字方印 -->
              <div class="flex items-start justify-between gap-2">
                <div class="space-y-0.5 min-w-0">
                  <div class="flex items-center gap-1.5 text-[11px] font-mono-archive text-[var(--ink-muted)]">
                    <span>{{ seal.regionName }}</span>
                    <span v-if="seal.isLit" class="text-[#b94a3b] font-serif-editorial">
                      · {{ seal.visitedCities.length }}/{{ seal.totalPrefectures }}城
                    </span>
                  </div>
                  <div class="flex items-baseline gap-2">
                    <h3
                      class="font-serif-editorial text-lg font-medium tracking-wide truncate"
                      :class="seal.isLit ? 'text-[var(--ink-primary)]' : 'text-[var(--ink-secondary)]'"
                    >
                      {{ seal.name }}
                    </h3>
                    <span class="text-[11px] font-serif-editorial text-[var(--ink-muted)] truncate">
                      {{ seal.epithet }}
                    </span>
                  </div>
                </div>

                <!-- 篆刻方印：已点亮为朱砂红泥印章，未点亮为浅墨待钤暗印 -->
                <div
                  v-if="seal.isLit"
                  @click.stop="openProvinceDrawer(seal.adcode, seal.name)"
                  class="shrink-0 w-9 h-9 rounded-xs border-2 border-[#b94a3b] bg-[#b94a3b] text-[#FAF7F0] flex items-center justify-center font-serif-editorial font-bold text-base shadow-xs transform rotate-[-4deg] group-hover:rotate-0 transition-transform"
                  :title="`点击打开 ${seal.name} 省级回忆抽屉`"
                >
                  <span class="border border-[#FAF7F0]/50 w-7 h-7 flex items-center justify-center leading-none">
                    {{ seal.shortName }}
                  </span>
                </div>
                <div
                  v-else
                  class="shrink-0 w-8 h-8 rounded-xs border border-dashed border-[var(--border-subtle)] text-[var(--ink-muted)]/50 flex items-center justify-center font-serif-editorial text-sm select-none group-hover:border-[var(--ink-secondary)] group-hover:text-[var(--ink-secondary)] transition-colors"
                >
                  {{ seal.shortName }}
                </div>
              </div>

              <!-- 中部：已点亮省份展示城邑活字纸签；未点亮省份展示待访留白签 -->
              <div v-if="seal.isLit" class="py-3 space-y-2">
                <div class="flex flex-wrap items-center gap-1.5">
                  <button
                    v-for="city in seal.visitedCities.slice(0, 5)"
                    :key="city.code"
                    @click.stop="focusedCityCode = city.code; openCityDrawer(city.code, city.name)"
                    @mouseenter="focusedCityCode = city.code"
                    class="px-2 py-0.5 rounded-xs text-xs font-serif-editorial border transition-all cursor-pointer inline-flex items-center gap-1"
                    :class="
                      focusedCityCode === city.code
                        ? 'border-[#b94a3b] bg-[#b94a3b]/10 text-[#b94a3b] font-medium'
                        : 'border-[#D5CDC0] dark:border-[#383430] bg-[var(--bg-archive)] text-[var(--ink-primary)] hover:border-[#b94a3b]'
                    "
                    :title="`点击翻阅 ${city.name} 城市回忆抽屉`"
                  >
                    <span>{{ city.shortName }}</span>
                    <span v-if="city.visitCount > 1" class="text-[11px] font-mono-archive opacity-75">
                      ×{{ city.visitCount }}
                    </span>
                  </button>
                  <span
                    v-if="seal.visitedCities.length > 5"
                    class="text-[11px] font-mono-archive text-[var(--ink-muted)] px-1"
                  >
                    +{{ seal.visitedCities.length - 5 }}城
                  </span>
                </div>

                <p
                  v-if="seal.latestNote"
                  class="text-[11px] font-serif-editorial text-[var(--ink-secondary)] line-clamp-1 italic"
                >
                  “{{ seal.latestNote }}”
                </p>
              </div>

              <div v-else class="py-2.5 flex items-center justify-between text-[11px] font-serif-editorial text-[var(--ink-muted)]/75">
                <span>尚未钤印 · 共 {{ seal.totalPrefectures }} 处城邑</span>
                <span class="opacity-0 group-hover:opacity-100 text-[var(--ink-secondary)] transition-opacity">
                  ＋ 补录足迹
                </span>
              </div>

              <!-- 底栏：时间刻度与省卷抽屉直达 -->
              <div
                v-if="seal.isLit"
                class="pt-2 border-t border-[#D5CDC0]/60 dark:border-[#383430]/60 flex items-center justify-between text-[11px] font-serif-editorial text-[var(--ink-muted)]"
              >
                <span class="font-mono-archive text-[11px]">
                  {{ seal.latestVisitedAt || seal.firstVisitedAt || '已留步' }} · 累计 {{ seal.totalVisits }} 次
                </span>
                <button
                  @click.stop="openProvinceDrawer(seal.adcode, seal.name)"
                  class="inline-flex items-center gap-0.5 text-[var(--ink-secondary)] hover:text-[#b94a3b] transition-colors cursor-pointer"
                >
                  <span>省卷</span>
                  <ChevronRight class="w-3 h-3" />
                </button>
              </div>
            </div>
          </div>
        </div>

        <!-- 右侧 4 栏 Sticky：当前聚焦【驻足印信 · 精装御朱印折页卡】 -->
        <div class="lg:col-span-4 lg:sticky lg:top-24 space-y-5 text-left">
          <div
            v-if="currentFocusedCity"
            class="bg-[#FAF7F0] dark:bg-[#1C1A18] border border-[#D5CDC0] dark:border-[#383430] rounded-xs p-5 sm:p-6 shadow-sm space-y-5 relative overflow-hidden"
          >
            <!-- 顶栏：双印合璧（省名题记 + 篆刻大方印） -->
            <div class="flex items-start justify-between border-b border-[#D5CDC0]/70 dark:border-[#383430]/70 pb-4">
              <div class="space-y-1">
                <div class="flex items-center gap-1.5 text-xs font-serif-editorial font-medium text-[#b94a3b] tracking-wider">
                  <span>{{ currentFocusedCity.province }} · 御朱印信</span>
                </div>
                <h3 class="font-serif-editorial text-2xl font-bold text-[var(--ink-primary)]">
                  {{ currentFocusedCity.name }}
                </h3>
                <p class="text-[11px] font-serif-editorial text-[var(--ink-muted)]">
                  {{ PROVINCE_EPITHET_MAP[currentFocusedCity.province] || currentFocusedCity.epithet }}
                </p>
              </div>

              <!-- 宣纸朱文篆刻大方印 -->
              <div
                @click="openProvinceDrawer(PROVINCE_ADCODE_MAP[currentFocusedCity.province] || '110000', currentFocusedCity.province)"
                class="w-12 h-12 rounded-xs border-2 border-[#b94a3b] p-0.5 flex items-center justify-center bg-[#b94a3b]/5 text-[#b94a3b] cursor-pointer hover:bg-[#b94a3b] hover:text-[#FAF7F0] transition-colors shrink-0"
                :title="`打开 ${currentFocusedCity.province} 省级回忆抽屉`"
              >
                <div class="border border-[#b94a3b]/60 w-full h-full flex flex-col items-center justify-center leading-none">
                  <span class="font-serif-editorial font-bold text-base">
                    {{ PROVINCE_SHORT_MAP[currentFocusedCity.province] || currentFocusedCity.province.slice(0, 1) }}
                  </span>
                  <span class="text-[8px] font-serif-editorial tracking-tighter mt-0.5">山河藏</span>
                </div>
              </div>
            </div>

            <!-- 同省已点亮城邑快捷切换排签 -->
            <div v-if="focusedProvinceCities.length > 1" class="space-y-1.5">
              <div class="text-[11px] font-serif-editorial text-[var(--ink-muted)]">
                {{ currentFocusedCity.province }}已点亮城邑 ({{ focusedProvinceCities.length }})：
              </div>
              <div class="flex flex-wrap items-center gap-1.5">
                <button
                  v-for="pc in focusedProvinceCities"
                  :key="pc.code"
                  @click="focusedCityCode = pc.code"
                  class="px-2.5 py-1 rounded-xs text-xs font-serif-editorial border transition-colors cursor-pointer"
                  :class="
                    pc.code === currentFocusedCity.code
                      ? 'border-[#b94a3b] bg-[#b94a3b] text-[#FAF7F0] font-medium'
                      : 'border-[#D5CDC0] dark:border-[#383430] bg-[var(--bg-archive)] text-[var(--ink-secondary)] hover:text-[var(--ink-primary)]'
                  "
                >
                  {{ pc.shortName }}
                </button>
              </div>
            </div>

            <!-- 文化笺注 -->
            <div class="p-3 rounded-xs bg-[var(--bg-archive)]/80 border border-[#D5CDC0]/60 dark:border-[#383430]/60 text-xs font-serif-editorial text-[var(--ink-secondary)] italic">
              {{ currentFocusedCity.epithet }}
            </div>

            <!-- 旅途指标 -->
            <div class="space-y-2 text-xs font-serif-editorial text-[var(--ink-secondary)]">
              <div class="flex items-center justify-between">
                <span class="text-[var(--ink-muted)]">到访印信：</span>
                <span class="font-medium text-[#b94a3b]">
                  {{ formatVisitStampCount(currentFocusedCity.visitCount) }}
                </span>
              </div>
              <div class="flex items-center justify-between">
                <span class="text-[var(--ink-muted)]">首次探访：</span>
                <span class="font-mono-archive">{{ currentFocusedCity.firstVisitedAt || '早年行迹' }}</span>
              </div>
              <div
                v-if="currentFocusedCity.latestVisitedAt && currentFocusedCity.latestVisitedAt !== currentFocusedCity.firstVisitedAt"
                class="flex items-center justify-between"
              >
                <span class="text-[var(--ink-muted)]">最近踏足：</span>
                <span class="font-mono-archive">{{ currentFocusedCity.latestVisitedAt }}</span>
              </div>
            </div>

            <!-- 旅途随笔手札引用 -->
            <div
              v-if="currentFocusedCity.latestNote"
              class="text-xs font-serif-editorial text-[var(--ink-secondary)] leading-relaxed bg-[var(--bg-archive)]/60 p-3 rounded-xs border-l-2 border-[#b94a3b]"
            >
              <span class="text-[var(--ink-muted)] block text-[11px] font-serif-editorial mb-1">行旅随笔：</span>
              “{{ currentFocusedCity.latestNote }}”
            </div>

            <!-- 双联操作按钮：城卷抽屉 + 省卷总览 -->
            <div class="space-y-2 pt-1">
              <button
                @click="openCityDrawer(currentFocusedCity.code, currentFocusedCity.name)"
                class="w-full py-2.5 px-4 rounded-xs border border-[var(--ink-primary)] bg-[var(--ink-primary)] text-[var(--bg-archive)] hover:opacity-90 font-serif-editorial text-xs font-medium flex items-center justify-center gap-1.5 transition-all shadow-xs cursor-pointer"
              >
                <span>翻阅 {{ currentFocusedCity.shortName }} 城市回忆抽屉 (4章节)</span>
                <ChevronRight class="w-3.5 h-3.5" />
              </button>
              <button
                @click="openProvinceDrawer(PROVINCE_ADCODE_MAP[currentFocusedCity.province] || '110000', currentFocusedCity.province)"
                class="w-full py-2 px-4 rounded-xs border border-[#D5CDC0] dark:border-[#383430] hover:border-[#b94a3b] bg-[var(--bg-archive)] text-[var(--ink-secondary)] hover:text-[#b94a3b] font-serif-editorial text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
              >
                <span>调阅 {{ currentFocusedCity.province }} 省级行迹总卷</span>
                <ChevronRight class="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          <!-- 无城市数据时的优雅印谱占位卡 -->
          <div
            v-else
            class="bg-[var(--bg-archive)] border border-dashed border-[var(--border-subtle)] rounded-xs p-6 text-center space-y-4"
          >
            <div class="w-10 h-10 rounded-full bg-[var(--bg-subtle)] mx-auto flex items-center justify-center text-[var(--ink-muted)]">
              <Compass class="w-5 h-5" />
            </div>
            <div class="space-y-1">
              <h3 class="font-serif-editorial text-lg font-medium text-[var(--ink-primary)]">
                印谱待启 · 山川初歇
              </h3>
              <p class="font-serif-editorial text-xs text-[var(--ink-muted)] leading-relaxed">
                尚未钤印任何地级市足迹。点击左侧任意省份方格或下方按钮，即可盖下第一枚朱砂山河印。
              </p>
            </div>
            <button
              @click="isAdmin ? (isAddModalOpen = true) : emit('requestAuth', () => { isAddModalOpen = true })"
              class="py-2 px-4 rounded-xs border border-[var(--ink-primary)] bg-[var(--ink-primary)] text-[var(--bg-archive)] font-serif-editorial text-xs font-medium inline-flex items-center gap-1 cursor-pointer"
            >
              <Plus class="w-3.5 h-3.5" />
              <span>钤印第一站足迹</span>
            </button>
          </div>

          <!-- 备忘与漫游箴言纸签 -->
          <div class="bg-[var(--bg-subtle)]/50 border border-[var(--border-subtle)] rounded-xs p-5 space-y-3">
            <div class="text-xs font-serif-editorial text-[var(--ink-muted)] tracking-wider">
              散页山川录 · 印谱小记
            </div>
            <p class="font-serif-editorial text-xs text-[var(--ink-secondary)] leading-relaxed">
              “凡所踏足之州郡，皆以朱砂入印、车票归档。不必丈量走得多远，只在乎留下了多少真实可感的生活刻度。”
            </p>
            <div class="pt-2 border-t border-[var(--border-subtle)]/60 flex items-center justify-between text-[11px] font-serif-editorial text-[var(--ink-muted)]">
              <span>已钤印省区：{{ litProvinceCount }} / 34</span>
              <span>点亮城邑：{{ litCityCount }} 座</span>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- ================================================================================== -->
    <!-- 第二卷：【典藏票根印信架】(Authentic Vintage Voyage Tickets Rack)                   -->
    <!-- 两段式经典复古特种纸车票、双圈波浪邮戳、虚线针孔打孔与备忘插槽                     -->
    <!-- ================================================================================== -->
    <section class="space-y-10 pt-8 border-t border-[var(--border-subtle)]">
      <!-- 票根架控制工具栏 -->
      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-3 border-b border-[var(--border-subtle)]">
        <div class="flex items-center gap-2">
          <Layers class="w-4 h-4 text-[#b94a3b]" />
          <span class="font-serif-editorial text-base font-medium text-[var(--ink-primary)]">
            卷二 · 典藏车票存根与印信插架
          </span>
        </div>

        <div class="flex items-center gap-2 text-xs font-serif-editorial">
          <button
            @click="ticketGrouping = 'region'"
            class="px-3 py-1 rounded-xs border transition-colors cursor-pointer"
            :class="
              ticketGrouping === 'region'
                ? 'border-[var(--ink-primary)] bg-[var(--ink-primary)] text-[var(--bg-archive)]'
                : 'border-[var(--border-subtle)] text-[var(--ink-muted)] hover:text-[var(--ink-primary)]'
            "
          >
            按地域大区归档
          </button>
          <button
            @click="ticketGrouping = 'timeline'"
            class="px-3 py-1 rounded-xs border transition-colors cursor-pointer"
            :class="
              ticketGrouping === 'timeline'
                ? 'border-[var(--ink-primary)] bg-[var(--ink-primary)] text-[var(--bg-archive)]'
                : 'border-[var(--border-subtle)] text-[var(--ink-muted)] hover:text-[var(--ink-primary)]'
            "
          >
            按编年时间轴
          </button>
        </div>
      </div>

      <!-- 模式 1：按地域大区归档 -->
      <div v-if="ticketGrouping === 'region'" class="space-y-12">
        <div
          v-if="regionGroupedTickets.length === 0"
          class="border border-dashed border-[var(--border-subtle)] rounded-xs p-10 text-center space-y-4 bg-[var(--bg-archive)]/50"
        >
          <div class="w-12 h-12 rounded-full bg-[var(--bg-subtle)] mx-auto flex items-center justify-center text-[var(--ink-muted)]">
            <Layers class="w-6 h-6" />
          </div>
          <div class="space-y-1">
            <h3 class="font-serif-editorial text-lg font-medium text-[var(--ink-primary)]">
              车票插架尚无存根
            </h3>
            <p class="font-serif-editorial text-xs text-[var(--ink-muted)] max-w-sm mx-auto leading-relaxed">
              每一张复古车票都承载着一段时光故事。装订第一站足迹后，系统将在此自动分发仿真纸质车票与朱砂印章。
            </p>
          </div>
          <button
            v-if="isAdmin"
            @click="isAddModalOpen = true"
            class="py-2 px-4 rounded-xs border border-[var(--ink-primary)] bg-[var(--ink-primary)] text-[var(--bg-archive)] font-serif-editorial text-xs font-medium inline-flex items-center gap-1 cursor-pointer"
          >
            <Plus class="w-3.5 h-3.5" />
            <span>装订第一张车票</span>
          </button>
        </div>

        <div
          v-else
          v-for="group in regionGroupedTickets"
          :key="group.name"
          class="space-y-5"
        >
          <!-- 大区标题栏与省份印章胶囊 -->
          <div class="flex flex-wrap items-center justify-between gap-3 pb-2 border-b border-[var(--border-subtle)]/70">
            <div class="flex items-center gap-3">
              <h2 class="font-serif-editorial text-lg font-medium text-[var(--ink-primary)]">
                {{ group.name }}
              </h2>
              <span class="text-xs font-mono-archive text-[var(--ink-muted)]">
                {{ group.totalCities }} 座城
              </span>
            </div>

            <!-- 可点击打开省级抽屉的印章胶囊 -->
            <div class="flex flex-wrap items-center gap-1.5">
              <button
                v-for="prov in group.provinces"
                :key="prov.adcode"
                @click="openProvinceDrawer(prov.adcode, prov.name)"
                class="flex items-center gap-1 px-2.5 py-0.5 rounded-xs border border-[var(--border-subtle)] bg-[var(--bg-subtle)]/60 text-xs font-serif-editorial text-[var(--ink-secondary)] hover:text-[var(--ink-primary)] hover:border-[var(--ink-primary)] transition-colors cursor-pointer"
                :title="`打开 ${prov.name} 省份回忆抽屉`"
              >
                <span class="font-bold text-[var(--ink-primary)]">
                  {{ PROVINCE_SHORT_MAP[prov.name] || prov.name }}
                </span>
                <span>{{ prov.name }}</span>
                <span class="text-[11px] font-mono-archive text-[var(--ink-muted)]">
                  ({{ prov.count }})
                </span>
              </button>
            </div>
          </div>

          <!-- 车票阵列 (两段式复古物理车票质感) -->
          <div class="grid grid-cols-1 xl:grid-cols-2 gap-6">
            <div
              v-for="city in group.cities"
              :key="city.code"
              @click="openCityDrawer(city.code, city.name)"
              class="vintage-ticket-card relative bg-[#FAF7F0] dark:bg-[#1C1A18] border border-[#D5CDC0] dark:border-[#383430] rounded-xs shadow-[0_6px_24px_rgba(0,0,0,0.06)] hover:shadow-[0_12px_32px_rgba(0,0,0,0.12)] transition-all duration-300 overflow-hidden flex flex-col md:flex-row cursor-pointer group"
            >
              <!-- 1. 左联：副券 / 旅客存根 -->
              <div class="w-full md:w-52 shrink-0 bg-[#F2EDE2] dark:bg-[#23201D] border-b md:border-b-0 md:border-r-2 border-dashed border-[#C5BBAA] dark:border-[#423D38] p-5 flex flex-col justify-between relative overflow-hidden">
                <!-- 针孔咬痕咬角 (PC 端为右侧纵切口，移动端为底部横切口) -->
                <div class="absolute -right-3 -top-3 w-6 h-6 rounded-full bg-[var(--bg-archive)] border border-[#D5CDC0] dark:border-[#383430] hidden md:block"></div>
                <div class="absolute -right-3 -bottom-3 w-6 h-6 rounded-full bg-[var(--bg-archive)] border border-[#D5CDC0] dark:border-[#383430] hidden md:block"></div>
                <div class="absolute -left-3 -bottom-3 w-6 h-6 rounded-full bg-[var(--bg-archive)] border border-[#D5CDC0] dark:border-[#383430] md:hidden block"></div>
                <div class="absolute -right-3 -bottom-3 w-6 h-6 rounded-full bg-[var(--bg-archive)] border border-[#D5CDC0] dark:border-[#383430] md:hidden block"></div>

                <div class="space-y-3">
                  <!-- 存根抬头与仿真条形码 -->
                  <div class="flex items-center justify-between">
                    <span class="text-[11px] font-mono-archive text-[var(--ink-muted)] tracking-wider">
                      存根 #{{ city.code.slice(0, 4) }}
                    </span>
                    <!-- 仿真条形码 -->
                    <div class="flex items-center gap-[1.5px] h-3.5 opacity-65">
                      <div class="w-[1px] h-full bg-[var(--ink-primary)]"></div>
                      <div class="w-[2px] h-full bg-[var(--ink-primary)]"></div>
                      <div class="w-[1px] h-full bg-[var(--ink-primary)]"></div>
                      <div class="w-[3px] h-full bg-[var(--ink-primary)]"></div>
                      <div class="w-[1px] h-full bg-[var(--ink-primary)]"></div>
                      <div class="w-[2px] h-full bg-[var(--ink-primary)]"></div>
                    </div>
                  </div>

                  <!-- 真实中文省市题记与城市全称 -->
                  <div class="space-y-1">
                    <div class="text-xs font-serif-editorial text-[#b94a3b] font-medium tracking-wider">
                      {{ city.province }} · {{ city.shortName }}
                    </div>
                    <div class="font-serif-editorial text-2xl font-bold tracking-wide text-[var(--ink-primary)] group-hover:text-[#b94a3b] transition-colors">
                      {{ city.name }}
                    </div>
                  </div>
                </div>

                <!-- 存根底栏：朱砂省份印章 -->
                <div class="pt-4 border-t border-[#D5CDC0]/60 dark:border-[#383430]/60 flex items-center justify-between text-[11px] font-serif-editorial">
                  <span class="text-[var(--ink-muted)]">旅客存根</span>
                  <div class="w-6 h-6 rounded-xs border border-[#b94a3b] flex items-center justify-center font-bold text-xs text-[#b94a3b] bg-[#b94a3b]/5">
                    {{ PROVINCE_SHORT_MAP[city.province] || city.province.slice(0, 1) }}
                  </div>
                </div>
              </div>

              <!-- 2. 右联：正券 / 乘车票面 -->
              <div class="flex-1 p-5 sm:p-6 flex flex-col justify-between space-y-4 relative">
                <!-- 票面顶栏：出版物客票信息 -->
                <div class="flex items-center justify-between pb-2.5 border-b border-[#D5CDC0]/70 dark:border-[#383430]/70 text-[11px] font-serif-editorial text-[var(--ink-muted)] tracking-wider">
                  <span>散页客票 · 山川行迹</span>
                  <span>头等舱 · 登程</span>
                  <span class="hidden sm:inline font-mono-archive text-[11px]">编号 {{ city.code }}</span>
                </div>

                <!-- 路线段：起步 ➔ 到达 -->
                <div class="flex items-center justify-between gap-4">
                  <div>
                    <div class="text-[11px] font-serif-editorial text-[var(--ink-muted)]">出发地</div>
                    <div class="font-serif-editorial text-sm font-medium text-[var(--ink-secondary)]">起步站</div>
                  </div>

                  <div class="flex-1 flex items-center justify-center gap-2 text-[var(--ink-muted)] opacity-60">
                    <span class="w-full border-t border-dashed border-[var(--border-subtle)]"></span>
                    <span class="font-serif-editorial text-xs">❖</span>
                    <span class="w-full border-t border-dashed border-[var(--border-subtle)]"></span>
                  </div>

                  <div class="text-right">
                    <div class="text-[11px] font-serif-editorial text-[#b94a3b] font-medium">目的地</div>
                    <div class="font-serif-editorial text-2xl font-medium tracking-tight text-[var(--ink-primary)]">
                      {{ city.name }}
                    </div>
                  </div>
                </div>

                <!-- 核心：复古双圈波浪橡皮邮戳 ＋ 手札笺注 -->
                <div class="py-1 flex items-center justify-between gap-4">
                  <!-- 左侧：风物注记与手写随笔 -->
                  <div class="space-y-1.5 flex-1 text-left">
                    <div class="text-xs font-serif-editorial text-[var(--ink-secondary)] italic">
                      {{ city.epithet }}
                    </div>
                    <div v-if="city.latestNote" class="text-xs font-serif-editorial text-[var(--ink-primary)] line-clamp-1">
                      “{{ city.latestNote }}”
                    </div>
                    <div class="text-[11px] font-mono-archive text-[var(--ink-muted)]">
                      首访: {{ city.firstVisitedAt || '早年' }}
                      <span v-if="city.latestVisitedAt && city.latestVisitedAt !== city.firstVisitedAt" class="ml-2">
                        最近: {{ city.latestVisitedAt }}
                      </span>
                    </div>
                  </div>

                  <!-- 右侧：倾斜复古红色双圈波浪橡皮邮戳 -->
                  <div class="shrink-0 transform rotate-[-6deg] group-hover:rotate-0 transition-transform duration-300">
                    <div class="border-2 border-[#b94a3b]/85 rounded-full w-20 h-20 p-0.5 flex items-center justify-center relative shadow-[inset_0_0_6px_rgba(185,74,59,0.18)] bg-[#b94a3b]/[0.02]">
                      <div class="border border-[#b94a3b]/70 rounded-full w-full h-full flex flex-col items-center justify-center text-[#b94a3b] text-center select-none">
                        <span class="text-[8px] font-serif-editorial font-bold tracking-widest">散页 藏</span>
                        <span class="text-[11px] font-serif-editorial font-bold my-0.5">
                          {{ city.latestVisitedAt || city.firstVisitedAt || '留步' }}
                        </span>
                        <span class="text-[8px] font-serif-editorial border-t border-[#b94a3b]/60 px-1 pt-0.5">
                          {{ formatVisitStampCount(city.visitCount) }}
                        </span>
                      </div>
                      <!-- 右侧波浪邮戳切线 -->
                      <div class="absolute -right-6 top-1/2 -translate-y-1/2 flex flex-col gap-1 text-[#b94a3b]/70 font-mono-archive text-[11px] select-none">
                        <span>〰〰</span>
                        <span>〰〰</span>
                        <span>〰〰</span>
                      </div>
                    </div>
                  </div>
                </div>

                <!-- 票面底栏：点阵打码 ＋ 翻阅抽屉入口 -->
                <div class="pt-2.5 border-t border-[#D5CDC0]/60 dark:border-[#383430]/60 flex items-center justify-between text-[11px] font-serif-editorial text-[var(--ink-muted)] group-hover:text-[var(--ink-primary)] transition-colors">
                  <span>已钤印归册 · {{ city.province }}</span>
                  <div class="flex items-center gap-1 font-medium text-[var(--ink-primary)]">
                    <span>翻阅回忆抽屉 (4章节)</span>
                    <ChevronRight class="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
                  </div>
                </div>
              </div>
            </div>

            <!-- 空白待启程备忘插槽卡片 (当只有少量车票时优雅填充，消除空旷感) -->
            <div
              v-if="group.cities.length < 3"
              @click="isAdmin ? (isAddModalOpen = true) : null"
              class="relative bg-[var(--bg-archive)]/50 border-2 border-dashed border-[var(--border-subtle)] hover:border-[var(--ink-primary)] rounded-xs p-6 flex flex-col items-center justify-center text-center space-y-3 group transition-all"
              :class="{ 'cursor-pointer': isAdmin }"
            >
              <div class="w-12 h-12 rounded-full bg-[var(--bg-subtle)] flex items-center justify-center text-[var(--ink-muted)] group-hover:text-[var(--ink-primary)] group-hover:scale-105 transition-all">
                <Plus class="w-5 h-5" />
              </div>
              <div class="space-y-1">
                <h4 class="font-serif-editorial text-base font-medium text-[var(--ink-primary)]">
                  下一站山川 · 待启程插槽
                </h4>
                <p class="font-serif-editorial text-xs text-[var(--ink-muted)] max-w-xs">
                  {{ isAdmin ? '“山川尚远，步履不停。点击录入新一站行迹，装订专属车票。”' : '“山川尚远，步履不停。岁序常新，静候下一次出发。”' }}
                </p>
              </div>
              <span v-if="isAdmin" class="text-xs font-serif-editorial text-[var(--ink-secondary)] group-hover:text-[var(--ink-primary)]">
                ＋ 装订下一站车票
              </span>
              <span v-else class="text-xs font-serif-editorial text-[var(--ink-muted)]">
                静候下一段山海旅程
              </span>
            </div>
          </div>
        </div>
      </div>

      <!-- 模式 2：按编年时间轴归类 -->
      <div v-else class="space-y-12">
        <div
          v-if="timelineGroupedTickets.length === 0"
          class="border border-dashed border-[var(--border-subtle)] rounded-xs p-10 text-center space-y-4 bg-[var(--bg-archive)]/50"
        >
          <div class="w-12 h-12 rounded-full bg-[var(--bg-subtle)] mx-auto flex items-center justify-center text-[var(--ink-muted)]">
            <Layers class="w-6 h-6" />
          </div>
          <div class="space-y-1">
            <h3 class="font-serif-editorial text-lg font-medium text-[var(--ink-primary)]">
              编年车票尚无留档
            </h3>
            <p class="font-serif-editorial text-xs text-[var(--ink-muted)] max-w-sm mx-auto leading-relaxed">
              岁月匆匆，每一个年份的行迹都会在此化作一叠泛黄车票。
            </p>
          </div>
          <button
            v-if="isAdmin"
            @click="isAddModalOpen = true"
            class="py-2 px-4 rounded-xs border border-[var(--ink-primary)] bg-[var(--ink-primary)] text-[var(--bg-archive)] font-serif-editorial text-xs font-medium inline-flex items-center gap-1 cursor-pointer"
          >
            <Plus class="w-3.5 h-3.5" />
            <span>装订第一张车票</span>
          </button>
        </div>

        <div
          v-else
          v-for="group in timelineGroupedTickets"
          :key="group.year"
          class="space-y-5"
        >
          <div class="flex items-center gap-3 pb-2 border-b border-[var(--border-subtle)]/70">
            <h2 class="font-serif-editorial text-xl font-medium text-[var(--ink-primary)]">
              {{ group.year }} 年行迹存根
            </h2>
            <span class="text-xs font-mono-archive text-[var(--ink-muted)]">
              {{ group.cities.length }} 站停留
            </span>
          </div>

          <div class="grid grid-cols-1 xl:grid-cols-2 gap-6">
            <div
              v-for="city in group.cities"
              :key="city.code"
              @click="openCityDrawer(city.code, city.name)"
              class="vintage-ticket-card relative bg-[#FAF7F0] dark:bg-[#1C1A18] border border-[#D5CDC0] dark:border-[#383430] rounded-xs shadow-[0_6px_24px_rgba(0,0,0,0.06)] hover:shadow-[0_12px_32px_rgba(0,0,0,0.12)] transition-all duration-300 overflow-hidden flex flex-col md:flex-row cursor-pointer group"
            >
              <!-- 存根联 -->
              <div class="w-full md:w-52 shrink-0 bg-[#F2EDE2] dark:bg-[#23201D] border-b md:border-b-0 md:border-r-2 border-dashed border-[#C5BBAA] dark:border-[#423D38] p-5 flex flex-col justify-between relative overflow-hidden">
                <!-- 针孔咬痕咬角 (PC 端为右侧纵切口，移动端为底部横切口) -->
                <div class="absolute -right-3 -top-3 w-6 h-6 rounded-full bg-[var(--bg-archive)] border border-[#D5CDC0] dark:border-[#383430] hidden md:block"></div>
                <div class="absolute -right-3 -bottom-3 w-6 h-6 rounded-full bg-[var(--bg-archive)] border border-[#D5CDC0] dark:border-[#383430] hidden md:block"></div>
                <div class="absolute -left-3 -bottom-3 w-6 h-6 rounded-full bg-[var(--bg-archive)] border border-[#D5CDC0] dark:border-[#383430] md:hidden block"></div>
                <div class="absolute -right-3 -bottom-3 w-6 h-6 rounded-full bg-[var(--bg-archive)] border border-[#D5CDC0] dark:border-[#383430] md:hidden block"></div>

                <div class="space-y-3">
                  <div class="flex items-center justify-between">
                    <span class="text-[11px] font-mono-archive text-[var(--ink-muted)]">存根 #{{ city.code.slice(0, 4) }}</span>
                    <div class="flex items-center gap-[1.5px] h-3.5 opacity-65">
                      <div class="w-[1px] h-full bg-[var(--ink-primary)]"></div>
                      <div class="w-[2px] h-full bg-[var(--ink-primary)]"></div>
                      <div class="w-[1px] h-full bg-[var(--ink-primary)]"></div>
                      <div class="w-[3px] h-full bg-[var(--ink-primary)]"></div>
                    </div>
                  </div>
                  <div class="space-y-1">
                    <div class="text-xs font-serif-editorial text-[#b94a3b] font-medium tracking-wider">
                      {{ city.province }} · {{ city.shortName }}
                    </div>
                    <div class="font-serif-editorial text-2xl font-bold tracking-wide text-[var(--ink-primary)] group-hover:text-[#b94a3b] transition-colors">
                      {{ city.name }}
                    </div>
                  </div>
                </div>

                <div class="pt-4 border-t border-[#D5CDC0]/60 dark:border-[#383430]/60 flex items-center justify-between text-[11px] font-serif-editorial">
                  <span class="text-[var(--ink-muted)]">{{ city.latestVisitedAt }}</span>
                  <div class="w-6 h-6 rounded-xs border border-[#b94a3b] flex items-center justify-center font-bold text-xs text-[#b94a3b] bg-[#b94a3b]/5">
                    {{ PROVINCE_SHORT_MAP[city.province] || city.province.slice(0, 1) }}
                  </div>
                </div>
              </div>

              <!-- 正券联 -->
              <div class="flex-1 p-5 sm:p-6 flex flex-col justify-between space-y-4">
                <div class="flex items-center justify-between pb-2.5 border-b border-[#D5CDC0]/70 dark:border-[#383430]/70 text-[11px] font-serif-editorial text-[var(--ink-muted)]">
                  <span>散页客票 · 编年行迹</span>
                  <span>{{ group.year }} 岁次卷</span>
                </div>

                <div class="flex items-center justify-between gap-4">
                  <div>
                    <div class="text-[11px] font-serif-editorial text-[var(--ink-muted)]">出发地</div>
                    <div class="font-serif-editorial text-sm font-medium text-[var(--ink-secondary)]">起步站</div>
                  </div>
                  <div class="flex-1 flex items-center justify-center gap-2 text-[var(--ink-muted)] opacity-60">
                    <span class="w-full border-t border-dashed border-[var(--border-subtle)]"></span>
                    <span class="font-serif-editorial text-xs">❖</span>
                    <span class="w-full border-t border-dashed border-[var(--border-subtle)]"></span>
                  </div>
                  <div class="text-right">
                    <div class="text-[11px] font-serif-editorial text-[#b94a3b] font-medium">目的地</div>
                    <div class="font-serif-editorial text-2xl font-medium tracking-tight text-[var(--ink-primary)]">
                      {{ city.name }}
                    </div>
                  </div>
                </div>

                <div class="py-1 flex items-center justify-between gap-4">
                  <div class="space-y-1 flex-1 text-left">
                    <div class="text-xs font-serif-editorial text-[var(--ink-secondary)] italic">
                      {{ city.epithet }}
                    </div>
                    <div v-if="city.latestNote" class="text-xs font-serif-editorial text-[var(--ink-primary)] line-clamp-1">
                      “{{ city.latestNote }}”
                    </div>
                  </div>

                  <div class="shrink-0 transform rotate-[-6deg] group-hover:rotate-0 transition-transform">
                    <div class="border-2 border-[#b94a3b]/85 rounded-full w-20 h-20 p-0.5 flex items-center justify-center relative shadow-[inset_0_0_6px_rgba(185,74,59,0.18)] bg-[#b94a3b]/[0.02]">
                      <div class="border border-[#b94a3b]/70 rounded-full w-full h-full flex flex-col items-center justify-center text-[#b94a3b] text-center select-none">
                        <span class="text-[8px] font-serif-editorial font-bold tracking-widest">散页 藏</span>
                        <span class="text-[11px] font-serif-editorial font-bold my-0.5">{{ city.latestVisitedAt }}</span>
                        <span class="text-[8px] font-serif-editorial border-t border-[#b94a3b]/60 px-1 pt-0.5">
                          {{ formatVisitStampCount(city.visitCount) }}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                <div class="pt-2.5 border-t border-[#D5CDC0]/60 dark:border-[#383430]/60 flex items-center justify-between text-[11px] font-serif-editorial text-[var(--ink-muted)] group-hover:text-[var(--ink-primary)] transition-colors">
                  <span>已钤印归册 · 编号 {{ city.code }}</span>
                  <div class="flex items-center gap-1 font-medium text-[var(--ink-primary)]">
                    <span>翻阅回忆抽屉 (4章节)</span>
                    <ChevronRight class="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
                  </div>
                </div>
              </div>
            </div>

            <!-- 空白待启程备忘插槽卡片 (时间轴模式下同样优雅填充) -->
            <div
              v-if="group.cities.length < 3"
              @click="isAdmin ? (isAddModalOpen = true) : null"
              class="relative bg-[var(--bg-archive)]/50 border-2 border-dashed border-[var(--border-subtle)] hover:border-[var(--ink-primary)] rounded-xs p-6 flex flex-col items-center justify-center text-center space-y-3 group transition-all"
              :class="{ 'cursor-pointer': isAdmin }"
            >
              <div class="w-12 h-12 rounded-full bg-[var(--bg-subtle)] flex items-center justify-center text-[var(--ink-muted)] group-hover:text-[var(--ink-primary)] group-hover:scale-105 transition-all">
                <Plus class="w-5 h-5" />
              </div>
              <div class="space-y-1">
                <h4 class="font-serif-editorial text-base font-medium text-[var(--ink-primary)]">
                  下一站行历 · 虚位以待
                </h4>
                <p class="font-serif-editorial text-xs text-[var(--ink-muted)] max-w-xs">
                  {{ isAdmin ? '“记录岁序流转，新的远方即将在此钤印。”' : '“岁序常新，记录下一站时光故事。”' }}
                </p>
              </div>
              <span v-if="isAdmin" class="text-xs font-serif-editorial text-[var(--ink-secondary)] group-hover:text-[var(--ink-primary)]">
                ＋ 装订下一站车票
              </span>
              <span v-else class="text-xs font-serif-editorial text-[var(--ink-muted)]">
                静候下一段山海旅程
              </span>
            </div>
          </div>
        </div>
      </div>

      <!-- 底部伴随式【山川行迹手记长卷】(彻底解决只有 1-2 座城市时下方大面积空白的问题) -->
      <div v-if="rawFootprints.length > 0" class="pt-8 border-t border-[var(--border-subtle)] space-y-6 text-left">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-2">
            <BookOpen class="w-4 h-4 text-[var(--ink-secondary)]" />
            <h3 class="font-serif-editorial text-lg font-medium text-[var(--ink-primary)]">
              山川物候手记 · 旅途行历
            </h3>
          </div>
          <span class="text-xs font-serif-editorial text-[var(--ink-muted)]">
            近期行迹归档
          </span>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div
            v-for="fp in rawFootprints"
            :key="fp.id"
            @click="openCityDrawer(fp.city_code, fp.city_name)"
            class="bg-[var(--bg-subtle)]/40 hover:bg-[var(--bg-subtle)] border border-[var(--border-subtle)] p-4 rounded-xs transition-colors cursor-pointer space-y-2 group"
          >
            <div class="flex items-center justify-between text-xs gap-2">
              <div class="flex items-center gap-2 font-medium text-[var(--ink-primary)] truncate">
                <MapPin class="w-3.5 h-3.5 text-[#b94a3b] shrink-0" />
                <span class="font-serif-editorial">{{ fp.city_name }}</span>
                <span v-if="fp.title" class="text-[var(--ink-secondary)] font-serif-editorial truncate">· {{ fp.title }}</span>
              </div>
              <div class="flex items-center gap-2 shrink-0">
                <span class="text-[11px] font-mono-archive text-[var(--ink-muted)]">
                  {{ fp.visited_at ? fp.visited_at.slice(0, 10) : '' }}<template v-if="fp.departed_at && fp.departed_at.slice(0, 10) !== (fp.visited_at || '').slice(0, 10)"> ~ {{ fp.departed_at.slice(0, 10) }}</template>
                </span>
                <template v-if="isAdmin">
                  <button
                    type="button"
                    @click.stop="handleEditFootprint(fp)"
                    class="text-[var(--ink-muted)] hover:text-[var(--ink-primary)] p-0.5 rounded cursor-pointer transition-colors"
                    title="编辑足迹手记"
                  >
                    <Pencil class="w-3 h-3" />
                  </button>
                  <button
                    type="button"
                    @click.stop="handleDeleteFootprint(fp)"
                    class="text-[var(--ink-muted)] hover:text-[var(--accent-warm)] p-0.5 rounded cursor-pointer transition-colors"
                    title="删除足迹票根"
                  >
                    <Trash2 class="w-3 h-3" />
                  </button>
                </template>
              </div>
            </div>

            <p v-if="fp.note" class="font-serif-editorial text-xs text-[var(--ink-secondary)] line-clamp-2 leading-relaxed">
              {{ fp.note }}
            </p>
            <p v-else class="font-serif-editorial text-xs text-[var(--ink-muted)] italic">
              在 {{ fp.city_name }} 留下了散页时光印记。
            </p>

            <div class="pt-2 flex items-center justify-between text-[11px] font-serif-editorial text-[var(--ink-muted)] group-hover:text-[var(--ink-primary)]">
              <div class="flex items-center gap-2 font-mono-archive text-[11px]">
                <span v-if="(fp.entries_count || 0) > 0" class="px-1.5 py-0.5 rounded-xs border border-[var(--border-subtle)] bg-[var(--bg-archive)] text-[var(--ink-secondary)]">
                  {{ fp.entries_count }} 篇游记手记
                </span>
                <span v-if="(fp.attachments?.length || 0) > 0" class="px-1.5 py-0.5 rounded-xs border border-[var(--border-subtle)] bg-[var(--bg-archive)] text-[var(--ink-secondary)]">
                  {{ fp.attachments?.length }} 张影像
                </span>
                <span v-if="isAdmin && (fp.total_spent || 0) > 0" class="px-1.5 py-0.5 rounded-xs border border-[var(--accent-warm)]/30 bg-[var(--accent-warm)]/5 text-[var(--accent-warm)]">
                  旅途消费 ¥{{ (fp.total_spent! / 100).toFixed(2) }}
                </span>
                <span v-if="!(fp.entries_count || 0) && !(fp.total_spent || 0)">查看城市相片、随笔与账单</span>
              </div>
              <ChevronRight class="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform shrink-0" />
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- 录入与修订足迹弹窗 -->
    <AddFootprintModal
      v-if="isAddModalOpen"
      :isOpen="isAddModalOpen"
      :storageConfigured="storageConfigured"
      :initialCityCode="addModalInitialCityCode"
      :initialCityName="addModalInitialCityName"
      :editingFootprint="editingFootprint"
      @close="isAddModalOpen = false; editingFootprint = null; addModalInitialCityCode = ''; addModalInitialCityName = ''"
      @saved="handleFootprintSaved"
      @requestAuth="(cb) => emit('requestAuth', cb)"
    />

    <!-- 两级回忆抽屉组件 (支持省份与城市无缝穿梭与四章节聚合) -->
    <CityMemoryDrawerModal
      v-if="isDrawerOpen"
      :isOpen="isDrawerOpen"
      :adcode="selectedProvinceAdcode"
      :provinceName="selectedProvinceName"
      :cityCode="selectedCityCode"
      :cityName="selectedCityName"
      @close="isDrawerOpen = false"
      @refresh="loadAtlas"
      @selectEntry="emit('selectEntry', $event)"
      @addFootprintInCity="handleAddFootprintInCity"
      @addEntryInCity="handleAddEntryInCity"
      @editFootprint="handleEditFootprint"
    />
  </div>
</template>
