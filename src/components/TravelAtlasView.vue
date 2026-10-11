<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import {
  Plus,
  Compass,
  Tag,
  Sparkles,
  Calendar,
  Layers,
  ChevronRight,
} from 'lucide-vue-next'
import { fetchFootprintsAtlas, getAdminToken } from '../utils/api'
import { audio } from '../utils/audio'
import type { AtlasCitySummary, LifeEntry } from '../types'
import AddFootprintModal from './AddFootprintModal.vue'
import CityMemoryDrawerModal from './CityMemoryDrawerModal.vue'
import { CHINA_CITIES, type CityOption } from '../utils/cities'
import {
  REGION_GROUPS,
  PROVINCE_SHORT_MAP,
  PROVINCE_ADCODE_MAP,
  getCityTicketCode,
  formatVisitStampCount,
  calculateStarTrailCurve,
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

const isLoading = ref(false)
const isAddModalOpen = ref(false)
const isDrawerOpen = ref(false)

// 视图模式：'celestial' (山川经纬星野) | 'tickets' (典藏票根印信架)
const currentViewMode = ref<'celestial' | 'tickets'>('celestial')

// 票根架整理模式：'region' (按地域大区归档) | 'timeline' (按编年时间轴)
const ticketGrouping = ref<'region' | 'timeline'>('region')

// 选中的回忆抽屉目标
const selectedProvinceAdcode = ref('')
const selectedProvinceName = ref('')
const selectedCityCode = ref('')
const selectedCityName = ref('')

// 星图交互悬浮态
const hoveredStar = ref<LitCityItem | null>(null)

const isAdmin = computed(() => Boolean(getAdminToken()))

const loadAtlas = async () => {
  try {
    isLoading.value = true
    const res = await fetchFootprintsAtlas()
    atlasData.value = res
  } catch (err) {
    console.error('Failed to load footprints atlas:', err)
  } finally {
    isLoading.value = false
  }
}

// 全国 375 城市基础字典 (code -> CityOption)
const chinaCityOptionMap = computed<Map<string, CityOption>>(() => {
  const map = new Map<string, CityOption>()
  for (const c of CHINA_CITIES) {
    map.set(c.code, c)
  }
  return map
})

// 已点亮城市集合
export interface LitCityItem {
  code: string
  name: string
  province: string
  pinyin: string
  ticketCode: string
  visitCount: number
  firstVisitedAt: string
  latestVisitedAt: string
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
    // 默认坐标兜底至画布中心附近
    const x = base?.x ?? 450
    const y = base?.y ?? 280

    list.push({
      code: summary.city_code,
      name,
      province,
      pinyin,
      ticketCode,
      visitCount: summary.visit_count || 1,
      firstVisitedAt: summary.first_visited_at || '',
      latestVisitedAt: summary.latest_visited_at || summary.first_visited_at || '',
      x,
      y,
    })
  }

  // 默认按最近到访时间倒序
  return list.sort((a, b) => b.latestVisitedAt.localeCompare(a.latestVisitedAt))
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

// 星图：旅途星轨航线计算 (按首次到访时间正序串联)
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

// 切换视角
const switchViewMode = (mode: 'celestial' | 'tickets') => {
  audio.playTink()
  currentViewMode.value = mode
  hoveredStar.value = null
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
    <!-- 视角 A：【山川经纬星野】(Celestial Voyage Topology)                                -->
    <!-- ================================================================================== -->
    <section
      v-if="currentViewMode === 'celestial'"
      class="bg-[var(--bg-archive)] border border-[var(--border-subtle)] rounded-xs p-4 sm:p-8 relative shadow-sm overflow-hidden"
    >
      <!-- 星图顶注与说明 -->
      <div class="flex flex-col sm:flex-row sm:items-center justify-between pb-4 mb-4 border-b border-[var(--border-subtle)]/60 text-xs font-serif-editorial text-[var(--ink-secondary)]">
        <div class="flex items-center gap-2">
          <Sparkles class="w-3.5 h-3.5 text-[var(--ink-muted)]" />
          <span>天球经纬坐标星野 · 点击发光星芒翻阅城市回忆抽屉</span>
        </div>
        <div class="text-[11px] font-mono-archive text-[var(--ink-muted)] mt-1 sm:mt-0">
          ALBERS CELESTIAL PROJECTION · NO BORDERS
        </div>
      </div>

      <!-- SVG 经纬天球坐标星图画布 -->
      <div class="relative w-full aspect-[4/3] sm:aspect-[16/10] max-w-5xl mx-auto flex items-center justify-center">
        <svg
          viewBox="30 20 780 540"
          class="w-full h-full select-none"
        >
          <defs>
            <!-- 星芒微光滤镜 -->
            <filter id="star-glow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur in="SourceGraphic" stdDeviation="2.5" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          <!-- 1. 复古外围双线纸本边框与四角切线 -->
          <rect
            x="35"
            y="25"
            width="770"
            height="530"
            fill="none"
            stroke="var(--border-subtle)"
            stroke-width="1.2"
          />
          <rect
            x="39"
            y="29"
            width="762"
            height="522"
            fill="none"
            stroke="var(--border-subtle)"
            stroke-width="0.6"
            stroke-dasharray="6 3"
          />

          <!-- 四角装饰刻度标 -->
          <path d="M 35 35 L 45 35 M 35 35 L 35 45" stroke="var(--ink-muted)" stroke-width="1.2" fill="none" />
          <path d="M 805 35 L 795 35 M 805 35 L 805 45" stroke="var(--ink-muted)" stroke-width="1.2" fill="none" />
          <path d="M 35 555 L 45 555 M 35 555 L 35 545" stroke="var(--ink-muted)" stroke-width="1.2" fill="none" />
          <path d="M 805 555 L 795 555 M 805 555 L 805 545" stroke="var(--ink-muted)" stroke-width="1.2" fill="none" />

          <!-- 2. 天球经纬刻度网格线 (极细、极淡) -->
          <!-- 经线 (Longitudes) -->
          <g stroke="var(--border-subtle)" stroke-width="0.5" stroke-dasharray="4 6" opacity="0.65">
            <line x1="160" y1="35" x2="160" y2="555" />
            <line x1="280" y1="35" x2="280" y2="555" />
            <line x1="400" y1="35" x2="400" y2="555" />
            <line x1="520" y1="35" x2="520" y2="555" />
            <line x1="640" y1="35" x2="640" y2="555" />
            <line x1="740" y1="35" x2="740" y2="555" />
            <!-- 纬线 (Latitudes) -->
            <line x1="35" y1="120" x2="805" y2="120" />
            <line x1="35" y1="220" x2="805" y2="220" />
            <line x1="35" y1="320" x2="805" y2="320" />
            <line x1="35" y1="420" x2="805" y2="420" />
            <line x1="35" y1="500" x2="805" y2="500" />
          </g>

          <!-- 经纬度刻度文本 -->
          <g font-family="monospace" font-size="9" fill="var(--ink-muted)" opacity="0.65">
            <text x="160" y="48" text-anchor="middle">85°E</text>
            <text x="280" y="48" text-anchor="middle">95°E</text>
            <text x="400" y="48" text-anchor="middle">105°E</text>
            <text x="520" y="48" text-anchor="middle">115°E</text>
            <text x="640" y="48" text-anchor="middle">125°E</text>
            <text x="45" y="123" text-anchor="start">45°N</text>
            <text x="45" y="223" text-anchor="start">38°N</text>
            <text x="45" y="323" text-anchor="start">30°N</text>
            <text x="45" y="423" text-anchor="start">22°N</text>
          </g>

          <!-- 3. 左下角复古航海罗盘玫瑰 (Compass Rose) 与比例尺 -->
          <g transform="translate(100, 480)" opacity="0.75">
            <circle cx="0" cy="0" r="28" fill="none" stroke="var(--border-subtle)" stroke-width="0.8" />
            <circle cx="0" cy="0" r="14" fill="none" stroke="var(--border-subtle)" stroke-width="0.6" stroke-dasharray="2 2" />
            <!-- 指北罗盘针 -->
            <path d="M 0 -26 L 4 0 L 0 6 L -4 0 Z" fill="var(--ink-secondary)" />
            <path d="M 0 26 L 4 0 L 0 -6 L -4 0 Z" fill="var(--border-divider)" />
            <path d="M -26 0 L 0 4 L 6 0 L 0 -4 Z" fill="var(--border-divider)" />
            <path d="M 26 0 L 0 4 L -6 0 L 0 -4 Z" fill="var(--border-divider)" />
            <text x="0" y="-30" font-size="8" font-family="monospace" text-anchor="middle" fill="var(--ink-primary)">N</text>
            <text x="0" y="38" font-size="8" font-family="monospace" text-anchor="middle" fill="var(--ink-muted)">S</text>
            <text x="36" y="3" font-size="8" font-family="monospace" text-anchor="middle" fill="var(--ink-muted)">E</text>
            <text x="-36" y="3" font-size="8" font-family="monospace" text-anchor="middle" fill="var(--ink-muted)">W</text>
          </g>

          <!-- 4. 未去过城市的微尘散点 (Constellation Background Dust) -->
          <g fill="var(--ink-muted)" opacity="0.18">
            <circle
              v-for="city in CHINA_CITIES"
              :key="city.code"
              :cx="city.x"
              :cy="city.y"
              r="1.2"
            />
          </g>

          <!-- 5. 旅途星轨航线 (Voyage Trails 贝塞尔曲线连接) -->
          <g fill="none" stroke="var(--ink-secondary)" stroke-width="1.2" stroke-dasharray="5 4" opacity="0.45">
            <path
              v-for="(trail, idx) in celestialVoyageTrails"
              :key="idx"
              :d="trail.path"
            />
          </g>

          <!-- 6. 已点亮城市的星芒节点与常驻文字 -->
          <g>
            <g
              v-for="c in litCitiesList"
              :key="c.code"
              class="cursor-pointer group"
              @mouseenter="hoveredStar = c"
              @mouseleave="hoveredStar = null"
              @click="openCityDrawer(c.code, c.name)"
            >
              <!-- 节点外层光晕 -->
              <circle
                :cx="c.x"
                :cy="c.y"
                :r="c.visitCount >= 3 ? 10 : 7"
                fill="none"
                :stroke="c.visitCount >= 3 ? '#b94a3b' : 'var(--ink-secondary)'"
                stroke-width="0.8"
                opacity="0.35"
                filter="url(#star-glow)"
              />
              <!-- 节点中心实心星芒点 -->
              <circle
                :cx="c.x"
                :cy="c.y"
                :r="c.visitCount >= 3 ? 4 : 3"
                :fill="c.visitCount >= 3 ? '#b94a3b' : 'var(--ink-primary)'"
              />
              <!-- 城市名称常驻注记 (带纸底光晕描边，避免重叠) -->
              <text
                :x="c.x + 6"
                :y="c.y + 3"
                font-size="10"
                font-family="serif"
                fill="var(--ink-primary)"
                class="font-medium transition-all group-hover:font-bold"
                style="paint-order: stroke; stroke: var(--bg-archive); stroke-width: 2.5px; stroke-linejoin: round;"
              >
                {{ c.name.replace(/市|特别行政区/g, '') }}
              </text>
            </g>
          </g>
        </svg>

        <!-- 悬停节点时浮现的古典特种纸浮层卡片 -->
        <div
          v-if="hoveredStar"
          class="absolute bottom-6 right-6 bg-[var(--bg-archive)]/95 backdrop-blur-md border border-[var(--border-subtle)] shadow-[0_12px_32px_rgba(0,0,0,0.12)] p-4 rounded-xs text-left max-w-xs animate-in fade-in duration-150 pointer-events-none"
        >
          <div class="flex items-center justify-between gap-4 pb-2 border-b border-[var(--border-subtle)]/70">
            <div>
              <span class="text-xs font-mono-archive font-bold text-[var(--ink-primary)]">
                {{ hoveredStar.ticketCode }}
              </span>
              <h3 class="font-serif-editorial text-base font-medium text-[var(--ink-primary)]">
                {{ hoveredStar.name }}
              </h3>
            </div>
            <span class="text-[10px] font-mono-archive px-1.5 py-0.5 rounded-xs border border-[var(--border-subtle)] bg-[var(--bg-subtle)] text-[var(--ink-secondary)]">
              {{ hoveredStar.province }}
            </span>
          </div>

          <div class="pt-2.5 space-y-1 text-xs font-serif-editorial text-[var(--ink-secondary)]">
            <div class="flex items-center justify-between">
              <span class="text-[var(--ink-muted)]">到访印信：</span>
              <span class="font-medium text-[var(--ink-primary)]">
                {{ formatVisitStampCount(hoveredStar.visitCount) }}
              </span>
            </div>
            <div class="flex items-center justify-between text-[11px]">
              <span class="text-[var(--ink-muted)]">首访时间：</span>
              <span>{{ hoveredStar.firstVisitedAt || '早年行迹' }}</span>
            </div>
            <div v-if="hoveredStar.latestVisitedAt && hoveredStar.latestVisitedAt !== hoveredStar.firstVisitedAt" class="flex items-center justify-between text-[11px]">
              <span class="text-[var(--ink-muted)]">最近到访：</span>
              <span>{{ hoveredStar.latestVisitedAt }}</span>
            </div>
          </div>
          <div class="mt-3 pt-2 border-t border-[var(--border-subtle)]/40 text-[10px] font-serif-editorial text-[var(--ink-muted)] text-right">
            轻触打开城市回忆抽屉 ➔
          </div>
        </div>
      </div>
    </section>

    <!-- ================================================================================== -->
    <!-- 视角 B：【典藏票根印信架】(Traveler's Ticket & Stamp Rack)                          -->
    <!-- ================================================================================== -->
    <section v-else class="space-y-8">
      <!-- 票根架二级组织胶囊 -->
      <div class="flex items-center justify-between pb-3 border-b border-[var(--border-subtle)]">
        <div class="flex items-center gap-2">
          <Layers class="w-4 h-4 text-[var(--ink-muted)]" />
          <span class="font-serif-editorial text-sm font-medium text-[var(--ink-primary)]">
            典藏车票存根与印信插架
          </span>
        </div>

        <div class="flex items-center gap-1.5 text-xs font-serif-editorial">
          <button
            @click="ticketGrouping = 'region'"
            class="px-2.5 py-1 rounded-xs border transition-colors cursor-pointer"
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
            class="px-2.5 py-1 rounded-xs border transition-colors cursor-pointer"
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

      <!-- 模式 1：按地域大区归类展示 -->
      <div v-if="ticketGrouping === 'region'" class="space-y-10">
        <div
          v-for="group in regionGroupedTickets"
          :key="group.name"
          class="space-y-4"
        >
          <!-- 大区标题栏与省份印章标签 -->
          <div class="flex flex-wrap items-center justify-between gap-3 pb-2 border-b border-[var(--border-subtle)]/70">
            <div class="flex items-center gap-3">
              <h2 class="font-serif-editorial text-lg font-medium text-[var(--ink-primary)]">
                {{ group.name }}
              </h2>
              <span class="text-xs font-mono-archive text-[var(--ink-muted)]">
                {{ group.totalCities }} 座城
              </span>
            </div>

            <!-- 可点击查看省份抽屉的省份印章胶囊 -->
            <div class="flex flex-wrap items-center gap-1.5">
              <button
                v-for="prov in group.provinces"
                :key="prov.adcode"
                @click="openProvinceDrawer(prov.adcode, prov.name)"
                class="flex items-center gap-1 px-2 py-0.5 rounded-xs border border-[var(--border-subtle)] bg-[var(--bg-subtle)]/60 text-xs font-serif-editorial text-[var(--ink-secondary)] hover:text-[var(--ink-primary)] hover:border-[var(--ink-primary)] transition-colors cursor-pointer"
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

          <!-- 车票插槽网格 -->
          <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div
              v-for="city in group.cities"
              :key="city.code"
              @click="openCityDrawer(city.code, city.name)"
              class="group relative bg-[var(--bg-archive)] border border-[var(--border-subtle)] hover:border-[var(--ink-primary)] p-4 rounded-xs shadow-xs hover:shadow-md transition-all duration-200 cursor-pointer flex flex-col justify-between overflow-hidden"
            >
              <!-- 票根两端冲切圆弧缺口模拟 (Ticket Stub Notches) -->
              <div class="absolute -left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 rounded-full bg-[var(--bg-archive)] border border-[var(--border-subtle)]"></div>
              <div class="absolute -right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 rounded-full bg-[var(--bg-archive)] border border-[var(--border-subtle)]"></div>

              <div>
                <!-- 车票顶端：3字母代码 + 城市全称 + 所属省份 -->
                <div class="flex items-start justify-between pb-3 border-b border-dashed border-[var(--border-subtle)]">
                  <div>
                    <div class="font-mono-archive text-lg font-bold tracking-wider text-[var(--ink-primary)] group-hover:text-[#b94a3b] transition-colors">
                      {{ city.ticketCode }}
                    </div>
                    <div class="font-serif-editorial text-base font-medium text-[var(--ink-primary)]">
                      {{ city.name }}
                    </div>
                  </div>
                  <!-- 右侧省份印章印记 -->
                  <div class="w-7 h-7 rounded-xs border border-[var(--ink-primary)]/80 flex items-center justify-center font-serif-editorial font-bold text-xs text-[var(--ink-primary)] bg-[var(--bg-subtle)]">
                    {{ PROVINCE_SHORT_MAP[city.province] || city.province.slice(0, 1) }}
                  </div>
                </div>

                <!-- 车票主体信息：复古印戳 -->
                <div class="py-3 flex items-center justify-between text-xs font-serif-editorial">
                  <div class="space-y-0.5 text-[var(--ink-secondary)]">
                    <div class="flex items-center gap-1.5 text-[11px] text-[var(--ink-muted)]">
                      <Calendar class="w-3 h-3" />
                      <span>首访 {{ city.firstVisitedAt || '早年' }}</span>
                    </div>
                    <div v-if="city.latestVisitedAt && city.latestVisitedAt !== city.firstVisitedAt" class="text-[10px] text-[var(--ink-muted)] font-mono-archive">
                      最近 {{ city.latestVisitedAt }}
                    </div>
                  </div>

                  <!-- 到访印信印记徽章 -->
                  <div
                    class="px-2 py-1 rounded-xs border text-[11px] font-serif-editorial font-medium tracking-wider"
                    :class="
                      city.visitCount >= 3
                        ? 'border-[#b94a3b] text-[#b94a3b] bg-[#b94a3b]/5'
                        : 'border-[var(--ink-secondary)] text-[var(--ink-secondary)] bg-[var(--bg-subtle)]'
                    "
                  >
                    {{ formatVisitStampCount(city.visitCount) }}
                  </div>
                </div>
              </div>

              <!-- 车票底端：翻阅提示 -->
              <div class="pt-2.5 border-t border-[var(--border-subtle)]/50 flex items-center justify-between text-[11px] font-serif-editorial text-[var(--ink-muted)] group-hover:text-[var(--ink-primary)] transition-colors">
                <span>翻阅回忆抽屉</span>
                <ChevronRight class="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- 模式 2：按编年时间轴展示 -->
      <div v-else class="space-y-10">
        <div
          v-for="group in timelineGroupedTickets"
          :key="group.year"
          class="space-y-4"
        >
          <div class="flex items-center gap-3 pb-2 border-b border-[var(--border-subtle)]/70">
            <h2 class="font-serif-editorial text-xl font-medium text-[var(--ink-primary)]">
              {{ group.year }} 年行迹
            </h2>
            <span class="text-xs font-mono-archive text-[var(--ink-muted)]">
              {{ group.cities.length }} 站停留
            </span>
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div
              v-for="city in group.cities"
              :key="city.code"
              @click="openCityDrawer(city.code, city.name)"
              class="group relative bg-[var(--bg-archive)] border border-[var(--border-subtle)] hover:border-[var(--ink-primary)] p-4 rounded-xs shadow-xs hover:shadow-md transition-all duration-200 cursor-pointer flex flex-col justify-between overflow-hidden"
            >
              <div class="absolute -left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 rounded-full bg-[var(--bg-archive)] border border-[var(--border-subtle)]"></div>
              <div class="absolute -right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 rounded-full bg-[var(--bg-archive)] border border-[var(--border-subtle)]"></div>

              <div>
                <div class="flex items-start justify-between pb-3 border-b border-dashed border-[var(--border-subtle)]">
                  <div>
                    <div class="font-mono-archive text-lg font-bold tracking-wider text-[var(--ink-primary)] group-hover:text-[#b94a3b] transition-colors">
                      {{ city.ticketCode }}
                    </div>
                    <div class="font-serif-editorial text-base font-medium text-[var(--ink-primary)]">
                      {{ city.name }}
                    </div>
                  </div>
                  <div class="w-7 h-7 rounded-xs border border-[var(--ink-primary)]/80 flex items-center justify-center font-serif-editorial font-bold text-xs text-[var(--ink-primary)] bg-[var(--bg-subtle)]">
                    {{ PROVINCE_SHORT_MAP[city.province] || city.province.slice(0, 1) }}
                  </div>
                </div>

                <div class="py-3 flex items-center justify-between text-xs font-serif-editorial">
                  <div class="space-y-0.5 text-[var(--ink-secondary)]">
                    <div class="flex items-center gap-1.5 text-[11px] text-[var(--ink-muted)]">
                      <Calendar class="w-3 h-3" />
                      <span>{{ city.latestVisitedAt || '早年' }}</span>
                    </div>
                  </div>

                  <div
                    class="px-2 py-1 rounded-xs border text-[11px] font-serif-editorial font-medium tracking-wider"
                    :class="
                      city.visitCount >= 3
                        ? 'border-[#b94a3b] text-[#b94a3b] bg-[#b94a3b]/5'
                        : 'border-[var(--ink-secondary)] text-[var(--ink-secondary)] bg-[var(--bg-subtle)]'
                    "
                  >
                    {{ formatVisitStampCount(city.visitCount) }}
                  </div>
                </div>
              </div>

              <div class="pt-2.5 border-t border-[var(--border-subtle)]/50 flex items-center justify-between text-[11px] font-serif-editorial text-[var(--ink-muted)] group-hover:text-[var(--ink-primary)] transition-colors">
                <span>翻阅回忆抽屉</span>
                <ChevronRight class="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
              </div>
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
