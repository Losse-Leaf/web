<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import {
  Plus,
  Compass,
  Tag,
  Sparkles,
  Layers,
  ChevronRight,
  BookOpen,
  MapPin,
} from 'lucide-vue-next'
import { fetchFootprintsAtlas, fetchFootprints, getAdminToken } from '../utils/api'
import { audio } from '../utils/audio'
import type { AtlasCitySummary, Footprint, LifeEntry } from '../types'
import AddFootprintModal from './AddFootprintModal.vue'
import CityMemoryDrawerModal from './CityMemoryDrawerModal.vue'
import { CHINA_CITIES, type CityOption } from '../utils/cities'
import {
  REGION_GROUPS,
  PROVINCE_SHORT_MAP,
  PROVINCE_ADCODE_MAP,
  getCityTicketCode,
  getCityEpithet,
  formatVisitStampCount,
  calculateStarTrailCurve,
  ANCIENT_ROUTES,
} from '../utils/atlasHelpers'

const emit = defineEmits<{
  (e: 'selectEntry', entry: LifeEntry): void
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
const isAddModalOpen = ref(false)
const isDrawerOpen = ref(false)

// 视图模式：'celestial' (山川经纬星野) | 'tickets' (典藏票根印信架)
const currentViewMode = ref<'celestial' | 'tickets'>('celestial')

// 票根架整理模式：'region' (按地域大区归档) | 'timeline' (按编年时间轴)
const ticketGrouping = ref<'region' | 'timeline'>('region')

// 当前在星图中聚焦的高亮城市 (默认最新或首座城市)
const focusedCityCode = ref('')

// 选中的回忆抽屉目标
const selectedProvinceAdcode = ref('')
const selectedProvinceName = ref('')
const selectedCityCode = ref('')
const selectedCityName = ref('')

const isAdmin = computed(() => Boolean(getAdminToken()))

const loadAtlas = async () => {
  try {
    isLoading.value = true
    const [atlasRes, footprintsRes] = await Promise.all([
      fetchFootprintsAtlas(),
      fetchFootprints(),
    ])
    atlasData.value = atlasRes
    rawFootprints.value = footprintsRes || []

    // 默认聚焦在第一座城市
    if (atlasRes.cities && atlasRes.cities.length > 0 && !focusedCityCode.value) {
      focusedCityCode.value = atlasRes.cities[0].city_code
    }
  } catch (err) {
    console.error('Failed to load footprints atlas:', err)
  } finally {
    isLoading.value = false
  }
}

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

// 已点亮城市丰富信息模型
export interface LitCityItem {
  code: string
  name: string
  province: string
  pinyin: string
  ticketCode: string
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
    const province = base?.province || '其他'
    const pinyin = base?.pinyin || ''
    const ticketCode = getCityTicketCode(summary.city_code, pinyin)
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
      province,
      pinyin,
      ticketCode,
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

// 当前聚焦的星野城市实体
const currentFocusedCity = computed<LitCityItem | null>(() => {
  if (!focusedCityCode.value && litCitiesList.value.length > 0) {
    return litCitiesList.value[0]
  }
  return litCitiesList.value.find((c) => c.code === focusedCityCode.value) || litCitiesList.value[0] || null
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

// 星轨航线 (按首次到访时间正序串联)
const celestialVoyageTrails = computed(() => {
  if (litCitiesList.value.length < 2) return []

  const sortedChronological = [...litCitiesList.value].sort((a, b) => {
    return (a.firstVisitedAt || '').localeCompare(b.firstVisitedAt || '')
  })

  const trails: { path: string; from: string; to: string }[] = []
  for (let i = 0; i < sortedChronological.length - 1; i++) {
    const curr = sortedChronological[i]
    const next = sortedChronological[i + 1]
    const curve = calculateStarTrailCurve(curr.x, curr.y, next.x, next.y)
    trails.push({
      path: curve,
      from: curr.name,
      to: next.name,
    })
  }
  return trails
})

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

// 切换视角
const switchViewMode = (mode: 'celestial' | 'tickets') => {
  audio.playTink()
  currentViewMode.value = mode
}

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
}

onMounted(() => {
  loadAtlas()
})
</script>

<template>
  <div class="space-y-10 pb-16 animate-in fade-in duration-300">
    <!-- 顶栏出版物刊头与指标纸签 -->
    <header class="flex flex-col md:flex-row md:items-end justify-between gap-6 pb-6 border-b border-[var(--border-subtle)]">
      <div class="space-y-2">
        <div class="flex items-center gap-2.5">
          <span class="text-xs font-mono-archive tracking-widest text-[var(--ink-muted)] uppercase">
            Travel Archive & Celestial Atlas
          </span>
          <span class="w-1.5 h-1.5 rounded-full bg-[var(--ink-muted)]/40"></span>
          <span class="text-xs font-serif-editorial text-[var(--ink-muted)]">
            山川行迹 · 旅途档案
          </span>
        </div>
        <h1 class="font-serif-editorial text-2xl sm:text-3xl font-medium tracking-tight text-[var(--ink-primary)]">
          山川行迹
        </h1>
        <p class="font-serif-editorial text-sm text-[var(--ink-secondary)] leading-relaxed max-w-xl">
          以经纬度星图与典藏票根印信，收录踏足过的每一座城与山海回忆。拾起散落的足迹，装订成册。
        </p>
      </div>

      <!-- 右侧控制区：视角切换胶囊 ＋ 录入足迹 -->
      <div class="flex flex-wrap items-center gap-3">
        <!-- 双生视角切换胶囊 -->
        <div class="flex items-center p-0.5 rounded-xs bg-[var(--bg-subtle)] border border-[var(--border-subtle)]">
          <button
            @click="switchViewMode('celestial')"
            class="flex items-center gap-1.5 px-3 py-1.5 text-xs font-serif-editorial rounded-xs transition-all cursor-pointer"
            :class="
              currentViewMode === 'celestial'
                ? 'bg-[var(--bg-archive)] text-[var(--ink-primary)] font-medium shadow-xs border border-[var(--border-subtle)]'
                : 'text-[var(--ink-muted)] hover:text-[var(--ink-primary)]'
            "
            title="切换至山川经纬星野视图"
          >
            <Compass class="w-3.5 h-3.5" />
            <span>经纬星野</span>
          </button>
          <button
            @click="switchViewMode('tickets')"
            class="flex items-center gap-1.5 px-3 py-1.5 text-xs font-serif-editorial rounded-xs transition-all cursor-pointer"
            :class="
              currentViewMode === 'tickets'
                ? 'bg-[var(--bg-archive)] text-[var(--ink-primary)] font-medium shadow-xs border border-[var(--border-subtle)]'
                : 'text-[var(--ink-muted)] hover:text-[var(--ink-primary)]'
            "
            title="切换至典藏票根印信架视图"
          >
            <Tag class="w-3.5 h-3.5" />
            <span>典藏票根</span>
          </button>
        </div>

        <!-- 录入足迹快捷按键 -->
        <button
          v-if="isAdmin"
          @click="isAddModalOpen = true"
          class="flex items-center gap-1 px-3.5 py-1.5 text-xs font-serif-editorial rounded-xs border border-[var(--ink-primary)] bg-[var(--ink-primary)] text-[var(--bg-archive)] hover:opacity-90 transition-opacity cursor-pointer shadow-xs"
        >
          <Plus class="w-3.5 h-3.5" />
          <span>录入足迹</span>
        </button>
      </div>
    </header>

    <!-- 三联生活指标纸签 -->
    <section class="grid grid-cols-1 sm:grid-cols-3 gap-4">
      <div class="bg-[var(--bg-subtle)]/60 border border-[var(--border-subtle)] p-4 rounded-xs">
        <div class="text-[11px] font-mono-archive text-[var(--ink-muted)] tracking-wider mb-1">
          LIT CITIES · 点亮地级市
        </div>
        <div class="flex items-baseline gap-2">
          <span class="font-serif-editorial text-2xl text-[var(--ink-primary)] font-medium">
            {{ litCityCount }}
          </span>
          <span class="text-xs text-[var(--ink-muted)] font-mono-archive">
            / 375 ({{ cityCoveragePercentage }}%)
          </span>
        </div>
      </div>

      <div class="bg-[var(--bg-subtle)]/60 border border-[var(--border-subtle)] p-4 rounded-xs">
        <div class="text-[11px] font-mono-archive text-[var(--ink-muted)] tracking-wider mb-1">
          ROAMED PROVINCES · 踏足省级区
        </div>
        <div class="flex items-baseline gap-2">
          <span class="font-serif-editorial text-2xl text-[var(--ink-primary)] font-medium">
            {{ litProvinceCount }}
          </span>
          <span class="text-xs text-[var(--ink-muted)] font-mono-archive">
            / 34 ({{ provinceCoveragePercentage }}%)
          </span>
        </div>
      </div>

      <div class="bg-[var(--bg-subtle)]/60 border border-[var(--border-subtle)] p-4 rounded-xs">
        <div class="text-[11px] font-mono-archive text-[var(--ink-muted)] tracking-wider mb-1">
          TOTAL FOOTPRINTS · 漫游足迹总数
        </div>
        <div class="flex items-baseline gap-2">
          <span class="font-serif-editorial text-2xl text-[var(--ink-primary)] font-medium">
            {{ atlasData.total_footprints }}
          </span>
          <span class="text-xs text-[var(--ink-muted)] font-mono-archive">
            次行迹刻度
          </span>
        </div>
      </div>
    </section>

    <!-- ================================================================================== -->
    <!-- 视角 A：【山川经纬星野】(Celestial Voyage Cartography)                             -->
    <!-- 采用宽屏双栏工作台排版：左侧天球星野仪 ＋ 右侧驻足城市星野档案卡，告别大屏空白      -->
    <!-- ================================================================================== -->
    <section v-if="currentViewMode === 'celestial'" class="space-y-6">
      <div class="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        
        <!-- 左侧 8 栏：宏大深邃的天球星野图 -->
        <div class="lg:col-span-8 bg-[var(--bg-archive)] border border-[var(--border-subtle)] rounded-xs p-4 sm:p-6 shadow-sm overflow-hidden relative">
          <div class="flex items-center justify-between pb-3 mb-3 border-b border-[var(--border-subtle)]/60 text-xs font-serif-editorial text-[var(--ink-secondary)]">
            <div class="flex items-center gap-2">
              <Sparkles class="w-3.5 h-3.5 text-[var(--ink-muted)]" />
              <span>天球经纬坐标星图 · 罗盘玫瑰与古风茶马古道星野参考</span>
            </div>
            <div class="text-[11px] font-mono-archive text-[var(--ink-muted)]">
              ALBERS CELESTIAL PROJECTION
            </div>
          </div>

          <div class="relative w-full aspect-[4/3] sm:aspect-[16/11] flex items-center justify-center">
            <svg
              viewBox="20 15 800 550"
              class="w-full h-full select-none"
            >
              <defs>
                <!-- 焦点星芒脉冲光晕滤镜 -->
                <filter id="focus-glow" x="-50%" y="-50%" width="200%" height="200%">
                  <feGaussianBlur in="SourceGraphic" stdDeviation="4" result="blur" />
                  <feMerge>
                    <feMergeNode in="blur" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
              </defs>

              <!-- 1. 复古天球经纬大环与双线纸本边框 -->
              <rect x="25" y="20" width="790" height="540" fill="none" stroke="var(--border-subtle)" stroke-width="1.2" />
              <rect x="29" y="24" width="782" height="532" fill="none" stroke="var(--border-subtle)" stroke-width="0.6" stroke-dasharray="8 4" />

              <!-- 天球赤道环与黄道弧线示意 (丰富古典天文质感，消除画面空洞) -->
              <circle cx="420" cy="290" r="240" fill="none" stroke="var(--border-subtle)" stroke-width="0.8" opacity="0.35" />
              <circle cx="420" cy="290" r="160" fill="none" stroke="var(--border-subtle)" stroke-width="0.6" stroke-dasharray="3 3" opacity="0.3" />
              <ellipse cx="420" cy="290" rx="340" ry="190" fill="none" stroke="var(--border-subtle)" stroke-width="0.7" stroke-dasharray="10 5" opacity="0.25" />

              <!-- 四角复古裁切标与星图题头 -->
              <path d="M 25 35 L 40 35 M 25 35 L 25 50" stroke="var(--ink-muted)" stroke-width="1.2" fill="none" />
              <path d="M 815 35 L 800 35 M 815 35 L 815 50" stroke="var(--ink-muted)" stroke-width="1.2" fill="none" />
              <path d="M 25 545 L 40 545 M 25 545 L 25 530" stroke="var(--ink-muted)" stroke-width="1.2" fill="none" />
              <path d="M 815 545 L 800 545 M 815 545 L 815 530" stroke="var(--ink-muted)" stroke-width="1.2" fill="none" />

              <!-- 2. 经纬度刻度虚线与标注 -->
              <g stroke="var(--border-subtle)" stroke-width="0.5" stroke-dasharray="4 6" opacity="0.55">
                <line x1="150" y1="20" x2="150" y2="560" />
                <line x1="270" y1="20" x2="270" y2="560" />
                <line x1="390" y1="20" x2="390" y2="560" />
                <line x1="510" y1="20" x2="510" y2="560" />
                <line x1="630" y1="20" x2="630" y2="560" />
                <line x1="750" y1="20" x2="750" y2="560" />
                <line x1="25" y1="110" x2="815" y2="110" />
                <line x1="25" y1="210" x2="815" y2="210" />
                <line x1="25" y1="310" x2="815" y2="310" />
                <line x1="25" y1="410" x2="815" y2="410" />
                <line x1="25" y1="500" x2="815" y2="500" />
              </g>

              <g font-family="monospace" font-size="9" fill="var(--ink-muted)" opacity="0.65">
                <text x="150" y="38" text-anchor="middle">85°E</text>
                <text x="270" y="38" text-anchor="middle">95°E</text>
                <text x="390" y="38" text-anchor="middle">105°E</text>
                <text x="510" y="38" text-anchor="middle">115°E</text>
                <text x="630" y="38" text-anchor="middle">125°E</text>
                <text x="38" y="113" text-anchor="start">45°N</text>
                <text x="38" y="213" text-anchor="start">38°N</text>
                <text x="38" y="313" text-anchor="start">30°N</text>
                <text x="38" y="413" text-anchor="start">22°N</text>
              </g>

              <!-- 3. 古典人文行道星野弧线 (茶马古道/丝绸之路，带文字标注，解决画面单调) -->
              <g fill="none" stroke="var(--ink-muted)" stroke-width="0.8" stroke-dasharray="3 4" opacity="0.35">
                <path v-for="route in ANCIENT_ROUTES" :key="route.name" :d="route.path" />
              </g>
              <g font-size="8" font-family="serif" fill="var(--ink-muted)" opacity="0.45">
                <text x="155" y="375" text-anchor="start">茶马川藏古道 ──</text>
                <text x="180" y="215" text-anchor="start">丝路西域道 ──</text>
                <text x="525" y="325" text-anchor="start">京杭水驿 ──</text>
              </g>

              <!-- 4. 左下角复古航海罗盘玫瑰 -->
              <g transform="translate(90, 485)" opacity="0.75">
                <circle cx="0" cy="0" r="26" fill="none" stroke="var(--border-subtle)" stroke-width="0.8" />
                <circle cx="0" cy="0" r="13" fill="none" stroke="var(--border-subtle)" stroke-width="0.6" stroke-dasharray="2 2" />
                <path d="M 0 -24 L 4 0 L 0 5 L -4 0 Z" fill="var(--ink-secondary)" />
                <path d="M 0 24 L 4 0 L 0 -5 L -4 0 Z" fill="var(--border-divider)" />
                <path d="M -24 0 L 0 4 L 5 0 L 0 -4 Z" fill="var(--border-divider)" />
                <path d="M 24 0 L 0 4 L -5 0 L 0 -4 Z" fill="var(--border-divider)" />
                <text x="0" y="-28" font-size="8" font-family="monospace" text-anchor="middle" fill="var(--ink-primary)">N</text>
                <text x="0" y="36" font-size="8" font-family="monospace" text-anchor="middle" fill="var(--ink-muted)">S</text>
                <text x="34" y="3" font-size="8" font-family="monospace" text-anchor="middle" fill="var(--ink-muted)">E</text>
                <text x="-34" y="3" font-size="8" font-family="monospace" text-anchor="middle" fill="var(--ink-muted)">W</text>
              </g>

              <!-- 5. 全量 375 座城市的微尘星点 (呈现壮阔星象底座) -->
              <g fill="var(--ink-muted)" opacity="0.18">
                <circle
                  v-for="city in CHINA_CITIES"
                  :key="city.code"
                  :cx="city.x"
                  :cy="city.y"
                  r="1.2"
                />
              </g>

              <!-- 6. 旅途星轨航线 (连接点亮城市) -->
              <g fill="none" stroke="var(--ink-secondary)" stroke-width="1.2" stroke-dasharray="5 4" opacity="0.5">
                <path
                  v-for="(trail, idx) in celestialVoyageTrails"
                  :key="idx"
                  :d="trail.path"
                />
              </g>

              <!-- 7. 点亮城市的星芒节点 (焦点城市多重光晕) -->
              <g>
                <g
                  v-for="c in litCitiesList"
                  :key="c.code"
                  class="cursor-pointer group"
                  @mouseenter="focusedCityCode = c.code"
                  @click="openCityDrawer(c.code, c.name)"
                >
                  <!-- 焦点城市的超大漫射星盘光晕 -->
                  <circle
                    v-if="focusedCityCode === c.code"
                    :cx="c.x"
                    :cy="c.y"
                    r="22"
                    fill="none"
                    stroke="#b94a3b"
                    stroke-width="0.8"
                    stroke-dasharray="3 3"
                    opacity="0.45"
                  />
                  <!-- 节点常规光晕 -->
                  <circle
                    :cx="c.x"
                    :cy="c.y"
                    :r="focusedCityCode === c.code ? 12 : 8"
                    fill="none"
                    :stroke="c.code === '511800' || c.visitCount >= 3 ? '#b94a3b' : 'var(--ink-secondary)'"
                    stroke-width="1.2"
                    opacity="0.6"
                    filter="url(#focus-glow)"
                  />
                  <!-- 节点中心实心星芒 -->
                  <circle
                    :cx="c.x"
                    :cy="c.y"
                    :r="focusedCityCode === c.code ? 5 : 3.5"
                    :fill="c.code === '511800' || c.visitCount >= 3 ? '#b94a3b' : 'var(--ink-primary)'"
                  />
                  <!-- 城市名称常驻注记 -->
                  <text
                    :x="c.x + 8"
                    :y="c.y + 4"
                    font-size="11"
                    font-family="serif"
                    fill="var(--ink-primary)"
                    class="font-semibold transition-all"
                    style="paint-order: stroke; stroke: var(--bg-archive); stroke-width: 3px; stroke-linejoin: round;"
                  >
                    {{ c.name.replace(/市|特别行政区/g, '') }}
                  </text>
                </g>
              </g>
            </svg>
          </div>
        </div>

        <!-- 右侧 4 栏：驻足城市星野档案卡 (即使只有 1 座城市也能充满故事) -->
        <div class="lg:col-span-4 space-y-6 text-left">
          <div
            v-if="currentFocusedCity"
            class="bg-[var(--bg-archive)] border border-[var(--border-subtle)] rounded-xs p-5 sm:p-6 shadow-sm space-y-5 relative overflow-hidden"
          >
            <!-- 顶栏：代码徽章与所属省份 -->
            <div class="flex items-start justify-between border-b border-[var(--border-subtle)]/70 pb-3">
              <div>
                <span class="text-xs font-mono-archive font-bold text-[#b94a3b] tracking-wider">
                  {{ currentFocusedCity.ticketCode }} · DESTINATION
                </span>
                <h3 class="font-serif-editorial text-2xl font-medium text-[var(--ink-primary)] mt-0.5">
                  {{ currentFocusedCity.name }}
                </h3>
              </div>
              <div class="w-8 h-8 rounded-xs border border-[var(--ink-primary)] flex items-center justify-center font-serif-editorial font-bold text-sm text-[var(--ink-primary)] bg-[var(--bg-subtle)]">
                {{ PROVINCE_SHORT_MAP[currentFocusedCity.province] || currentFocusedCity.province.slice(0, 1) }}
              </div>
            </div>

            <!-- 文化笺注 -->
            <div class="p-2.5 rounded-xs bg-[var(--bg-subtle)]/50 border border-[var(--border-subtle)]/60 text-xs font-serif-editorial text-[var(--ink-secondary)] italic">
              {{ currentFocusedCity.epithet }}
            </div>

            <!-- 旅途指标 -->
            <div class="space-y-2 text-xs font-serif-editorial text-[var(--ink-secondary)]">
              <div class="flex items-center justify-between">
                <span class="text-[var(--ink-muted)]">到访印信：</span>
                <span class="font-medium text-[var(--ink-primary)]">
                  {{ formatVisitStampCount(currentFocusedCity.visitCount) }}
                </span>
              </div>
              <div class="flex items-center justify-between">
                <span class="text-[var(--ink-muted)]">首次探访：</span>
                <span class="font-mono-archive">{{ currentFocusedCity.firstVisitedAt || '早年行迹' }}</span>
              </div>
              <div v-if="currentFocusedCity.latestVisitedAt && currentFocusedCity.latestVisitedAt !== currentFocusedCity.firstVisitedAt" class="flex items-center justify-between">
                <span class="text-[var(--ink-muted)]">最近踏足：</span>
                <span class="font-mono-archive">{{ currentFocusedCity.latestVisitedAt }}</span>
              </div>
            </div>

            <!-- 旅途随笔手札引用 -->
            <div v-if="currentFocusedCity.latestNote" class="text-xs font-serif-editorial text-[var(--ink-secondary)] leading-relaxed bg-[var(--bg-subtle)]/30 p-3 rounded-xs border-l-2 border-[#b94a3b]">
              <span class="text-[var(--ink-muted)] block text-[10px] uppercase font-mono-archive mb-1">VOYAGE NOTE:</span>
              “{{ currentFocusedCity.latestNote }}”
            </div>

            <!-- 操作按钮：翻阅四章节回忆抽屉 -->
            <button
              @click="openCityDrawer(currentFocusedCity.code, currentFocusedCity.name)"
              class="w-full py-2.5 px-4 rounded-xs border border-[var(--ink-primary)] bg-[var(--ink-primary)] text-[var(--bg-archive)] hover:opacity-90 font-serif-editorial text-xs font-medium flex items-center justify-center gap-1.5 transition-all shadow-xs cursor-pointer"
            >
              <span>翻阅城市回忆抽屉 (4个章节)</span>
              <ChevronRight class="w-3.5 h-3.5" />
            </button>
          </div>

          <!-- 无城市数据时的优雅星野占位卡 -->
          <div
            v-else
            class="bg-[var(--bg-archive)] border border-dashed border-[var(--border-subtle)] rounded-xs p-6 text-center space-y-4"
          >
            <div class="w-10 h-10 rounded-full bg-[var(--bg-subtle)] mx-auto flex items-center justify-center text-[var(--ink-muted)]">
              <Compass class="w-5 h-5" />
            </div>
            <div class="space-y-1">
              <h3 class="font-serif-editorial text-lg font-medium text-[var(--ink-primary)]">
                星野待启 · 山川初歇
              </h3>
              <p class="font-serif-editorial text-xs text-[var(--ink-muted)] leading-relaxed">
                尚未钤印任何地级市足迹。装订第一张车票或在左侧星图中探索，即可点亮专属生活星宿。
              </p>
            </div>
            <button
              v-if="isAdmin"
              @click="isAddModalOpen = true"
              class="py-2 px-4 rounded-xs border border-[var(--ink-primary)] bg-[var(--ink-primary)] text-[var(--bg-archive)] font-serif-editorial text-xs font-medium inline-flex items-center gap-1 cursor-pointer"
            >
              <Plus class="w-3.5 h-3.5" />
              <span>装订第一站足迹</span>
            </button>
          </div>

          <!-- 备忘与漫游箴言纸签 (充实右侧视觉高度) -->
          <div class="bg-[var(--bg-subtle)]/50 border border-[var(--border-subtle)] rounded-xs p-5 space-y-3">
            <div class="text-[11px] font-mono-archive text-[var(--ink-muted)] tracking-wider">
              VOYAGE CHRONICLE · 散页山川录
            </div>
            <p class="font-serif-editorial text-xs text-[var(--ink-secondary)] leading-relaxed">
              “凡是走过的山川，皆成岁月星芒。不必丈量走得多远，只在乎留下了多少真实的生活刻度。”
            </p>
            <div class="pt-2 border-t border-[var(--border-subtle)]/60 flex items-center justify-between text-[11px] font-mono-archive text-[var(--ink-muted)]">
              <span>ACTIVE NODES: {{ litCityCount }}</span>
              <span>COVERAGE: {{ cityCoveragePercentage }}%</span>
            </div>
          </div>
        </div>

      </div>
    </section>

    <!-- ================================================================================== -->
    <!-- 视角 B：【典藏票根印信架】(Authentic Vintage Voyage Tickets Rack)                   -->
    <!-- 彻底重塑为两段式经典复古特种纸车票、双圈波浪邮戳、虚线针孔打孔与备忘插槽           -->
    <!-- ================================================================================== -->
    <section v-else class="space-y-10">
      <!-- 票根架控制工具栏 -->
      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-3 border-b border-[var(--border-subtle)]">
        <div class="flex items-center gap-2">
          <Layers class="w-4 h-4 text-[var(--ink-muted)]" />
          <span class="font-serif-editorial text-sm font-medium text-[var(--ink-primary)]">
            典藏车票存根与印信插架
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
                <span class="text-[10px] font-mono-archive text-[var(--ink-muted)]">
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
              <!-- 1. 左联：副券 / 旅客存根 (Counterfoil / Passenger Stub) -->
              <div class="w-full md:w-52 shrink-0 bg-[#F2EDE2] dark:bg-[#23201D] border-b md:border-b-0 md:border-r-2 border-dashed border-[#C5BBAA] dark:border-[#423D38] p-5 flex flex-col justify-between relative overflow-hidden">
                <!-- 针孔咬痕咬角 (上下两处半圆切口) -->
                <div class="absolute -right-3 -top-3 w-6 h-6 rounded-full bg-[var(--bg-archive)] border border-[#D5CDC0] dark:border-[#383430] hidden md:block"></div>
                <div class="absolute -right-3 -bottom-3 w-6 h-6 rounded-full bg-[var(--bg-archive)] border border-[#D5CDC0] dark:border-[#383430] hidden md:block"></div>

                <div class="space-y-3">
                  <!-- 存根抬头与仿真条形码 -->
                  <div class="flex items-center justify-between">
                    <span class="text-[9px] font-mono-archive text-[var(--ink-muted)] tracking-wider">
                      STUB #{{ city.code.slice(0, 4) }}
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

                  <!-- 核心大号三字代码与城市全称 -->
                  <div>
                    <div class="font-mono-archive text-3xl font-extrabold tracking-widest text-[var(--ink-primary)] group-hover:text-[#b94a3b] transition-colors">
                      {{ city.ticketCode }}
                    </div>
                    <div class="font-serif-editorial text-base font-semibold text-[var(--ink-primary)]">
                      {{ city.name }}
                    </div>
                    <div class="text-[10px] font-mono-archive text-[var(--ink-muted)] uppercase tracking-wider">
                      {{ city.pinyin }}
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

              <!-- 2. 右联：正券 / 乘车票面 (Main Boarding Pass) -->
              <div class="flex-1 p-5 sm:p-6 flex flex-col justify-between space-y-4 relative">
                <!-- 票面顶栏：出版物客票信息 -->
                <div class="flex items-center justify-between pb-2.5 border-b border-[#D5CDC0]/70 dark:border-[#383430]/70 text-[10px] font-mono-archive text-[var(--ink-muted)] tracking-wider">
                  <span>LOOSE LEAF TRAVEL PASS · 散页客票</span>
                  <span>CLASS: FIRST · 登程</span>
                  <span class="hidden sm:inline">NO. {{ city.code }}</span>
                </div>

                <!-- 路线段：起步 ➔ 到达 -->
                <div class="flex items-center justify-between gap-4">
                  <div>
                    <div class="text-[10px] font-mono-archive text-[var(--ink-muted)] uppercase">ORIGIN</div>
                    <div class="font-serif-editorial text-sm font-medium text-[var(--ink-secondary)]">起步站</div>
                  </div>

                  <div class="flex-1 flex items-center justify-center gap-2 text-[var(--ink-muted)] opacity-60">
                    <span class="w-full border-t border-dashed border-[var(--border-subtle)]"></span>
                    <span class="font-serif-editorial text-xs">❖</span>
                    <span class="w-full border-t border-dashed border-[var(--border-subtle)]"></span>
                  </div>

                  <div class="text-right">
                    <div class="text-[10px] font-mono-archive text-[#b94a3b] font-bold uppercase">DESTINATION</div>
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

                  <!-- 右侧：倾斜复古红色双圈波浪橡皮邮戳 (SVG Rubber Stamp) -->
                  <div class="shrink-0 transform rotate-[-6deg] group-hover:rotate-0 transition-transform duration-300">
                    <div class="border-2 border-[#b94a3b]/80 rounded-full w-20 h-20 p-0.5 flex items-center justify-center relative">
                      <div class="border border-[#b94a3b]/70 rounded-full w-full h-full flex flex-col items-center justify-center text-[#b94a3b] text-center">
                        <span class="text-[7px] font-mono-archive font-bold uppercase tracking-widest">LOOSE LEAF</span>
                        <span class="text-[9px] font-serif-editorial font-bold my-0.5">
                          {{ city.latestVisitedAt || city.firstVisitedAt || '留步' }}
                        </span>
                        <span class="text-[8px] font-serif-editorial border-t border-[#b94a3b]/60 px-1 pt-0.5">
                          {{ formatVisitStampCount(city.visitCount) }}
                        </span>
                      </div>
                      <!-- 右侧波浪邮戳切线 -->
                      <div class="absolute -right-6 top-1/2 -translate-y-1/2 flex flex-col gap-1 text-[#b94a3b]/70 font-mono-archive text-[10px]">
                        <span>〰〰</span>
                        <span>〰〰</span>
                        <span>〰〰</span>
                      </div>
                    </div>
                  </div>
                </div>

                <!-- 票面底栏：点阵打码 ＋ 翻阅抽屉入口 -->
                <div class="pt-2.5 border-t border-[#D5CDC0]/60 dark:border-[#383430]/60 flex items-center justify-between text-[11px] font-serif-editorial text-[var(--ink-muted)] group-hover:text-[var(--ink-primary)] transition-colors">
                  <span class="font-mono-archive text-[10px]">STATUS: STAMPED · 已钤印归档</span>
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
              <span v-if="isAdmin" class="text-[11px] font-mono-archive text-[var(--ink-secondary)] group-hover:text-[var(--ink-primary)]">
                + ADD NEXT VOYAGE TICKET
              </span>
              <span v-else class="text-[11px] font-mono-archive text-[var(--ink-muted)]">
                NEXT HORIZON AWAITS
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
                <div class="absolute -right-3 -top-3 w-6 h-6 rounded-full bg-[var(--bg-archive)] border border-[#D5CDC0] dark:border-[#383430] hidden md:block"></div>
                <div class="absolute -right-3 -bottom-3 w-6 h-6 rounded-full bg-[var(--bg-archive)] border border-[#D5CDC0] dark:border-[#383430] hidden md:block"></div>

                <div class="space-y-3">
                  <div class="flex items-center justify-between">
                    <span class="text-[9px] font-mono-archive text-[var(--ink-muted)]">STUB #{{ city.code.slice(0, 4) }}</span>
                    <div class="flex items-center gap-[1.5px] h-3.5 opacity-65">
                      <div class="w-[1px] h-full bg-[var(--ink-primary)]"></div>
                      <div class="w-[2px] h-full bg-[var(--ink-primary)]"></div>
                      <div class="w-[1px] h-full bg-[var(--ink-primary)]"></div>
                      <div class="w-[3px] h-full bg-[var(--ink-primary)]"></div>
                    </div>
                  </div>
                  <div>
                    <div class="font-mono-archive text-3xl font-extrabold text-[var(--ink-primary)] group-hover:text-[#b94a3b] transition-colors">
                      {{ city.ticketCode }}
                    </div>
                    <div class="font-serif-editorial text-base font-semibold text-[var(--ink-primary)]">
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
                <div class="flex items-center justify-between pb-2.5 border-b border-[#D5CDC0]/70 dark:border-[#383430]/70 text-[10px] font-mono-archive text-[var(--ink-muted)]">
                  <span>LOOSE LEAF TRAVEL PASS · 编年行迹</span>
                  <span>{{ group.year }} EDITION</span>
                </div>

                <div class="flex items-center justify-between gap-4">
                  <div>
                    <div class="text-[10px] font-mono-archive text-[var(--ink-muted)] uppercase">ORIGIN</div>
                    <div class="font-serif-editorial text-sm font-medium text-[var(--ink-secondary)]">起步站</div>
                  </div>
                  <div class="flex-1 flex items-center justify-center gap-2 text-[var(--ink-muted)] opacity-60">
                    <span class="w-full border-t border-dashed border-[var(--border-subtle)]"></span>
                    <span class="font-serif-editorial text-xs">❖</span>
                    <span class="w-full border-t border-dashed border-[var(--border-subtle)]"></span>
                  </div>
                  <div class="text-right">
                    <div class="text-[10px] font-mono-archive text-[#b94a3b] font-bold uppercase">DESTINATION</div>
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
                    <div class="border-2 border-[#b94a3b]/80 rounded-full w-20 h-20 p-0.5 flex items-center justify-center">
                      <div class="border border-[#b94a3b]/70 rounded-full w-full h-full flex flex-col items-center justify-center text-[#b94a3b] text-center">
                        <span class="text-[7px] font-mono-archive font-bold uppercase tracking-widest">LOOSE LEAF</span>
                        <span class="text-[9px] font-serif-editorial font-bold my-0.5">{{ city.latestVisitedAt }}</span>
                        <span class="text-[8px] font-serif-editorial border-t border-[#b94a3b]/60 px-1 pt-0.5">
                          {{ formatVisitStampCount(city.visitCount) }}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                <div class="pt-2.5 border-t border-[#D5CDC0]/60 dark:border-[#383430]/60 flex items-center justify-between text-[11px] font-serif-editorial text-[var(--ink-muted)] group-hover:text-[var(--ink-primary)] transition-colors">
                  <span class="font-mono-archive text-[10px]">ARCHIVED: {{ city.code }}</span>
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
              <span v-if="isAdmin" class="text-[11px] font-mono-archive text-[var(--ink-secondary)] group-hover:text-[var(--ink-primary)]">
                + ADD NEXT VOYAGE TICKET
              </span>
              <span v-else class="text-[11px] font-mono-archive text-[var(--ink-muted)]">
                NEW JOURNEY TO UNFOLD
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
          <span class="text-xs font-mono-archive text-[var(--ink-muted)]">
            RECENT FOOTPRINT ENTRIES
          </span>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div
            v-for="fp in rawFootprints"
            :key="fp.id"
            @click="openCityDrawer(fp.city_code, fp.city_name)"
            class="bg-[var(--bg-subtle)]/40 hover:bg-[var(--bg-subtle)] border border-[var(--border-subtle)] p-4 rounded-xs transition-colors cursor-pointer space-y-2 group"
          >
            <div class="flex items-center justify-between text-xs">
              <div class="flex items-center gap-2 font-medium text-[var(--ink-primary)]">
                <MapPin class="w-3.5 h-3.5 text-[#b94a3b]" />
                <span class="font-serif-editorial">{{ fp.city_name }}</span>
              </div>
              <span class="text-[11px] font-mono-archive text-[var(--ink-muted)]">
                {{ fp.visited_at ? fp.visited_at.slice(0, 10) : '' }}
              </span>
            </div>

            <p v-if="fp.note" class="font-serif-editorial text-xs text-[var(--ink-secondary)] line-clamp-2 leading-relaxed">
              {{ fp.note }}
            </p>
            <p v-else class="font-serif-editorial text-xs text-[var(--ink-muted)] italic">
              在 {{ fp.city_name }} 留下了散页时光印记。
            </p>

            <div class="pt-2 flex items-center justify-between text-[11px] font-serif-editorial text-[var(--ink-muted)] group-hover:text-[var(--ink-primary)]">
              <span>查看城市相片、随笔与账单</span>
              <ChevronRight class="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- 录入足迹弹窗 -->
    <AddFootprintModal
      :isOpen="isAddModalOpen"
      @close="isAddModalOpen = false"
      @saved="handleFootprintSaved"
    />

    <!-- 两级回忆抽屉组件 (支持省份与城市无缝穿梭与四章节聚合) -->
    <CityMemoryDrawerModal
      :isOpen="isDrawerOpen"
      :adcode="selectedProvinceAdcode"
      :provinceName="selectedProvinceName"
      :cityCode="selectedCityCode"
      :cityName="selectedCityName"
      @close="isDrawerOpen = false"
      @selectEntry="emit('selectEntry', $event)"
    />
  </div>
</template>
