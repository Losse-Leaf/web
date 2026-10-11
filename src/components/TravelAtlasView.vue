<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import {
  Plus,
  MapPin,
  ChevronRight,
} from 'lucide-vue-next'
import { fetchFootprintsAtlas, getAdminToken } from '../utils/api'
import type { AtlasCitySummary, LifeEntry } from '../types'
import AddFootprintModal from './AddFootprintModal.vue'
import CityMemoryDrawerModal from './CityMemoryDrawerModal.vue'
import { CHINA_CITIES } from '../utils/cities'
import {
  PROVINCES_DATA,
  CITIES_BOUNDARY_DATA,
  NATIONAL_OUTLINE_PATH,
  DIAOYU_DAO,
  SCS_INSET,
  PROVINCE_FULL_TO_SHORT,
  getProvinceAdcodeByCityCode,
  type ProvinceMapItem,
  type CityBoundaryItem,
} from '../utils/chinaMapData'

export interface ProvinceStat extends ProvinceMapItem {
  visitedCities: AtlasCitySummary[]
  cityCount: number
  totalVisits: number
  level: number // 0: 0座, 1: 1座, 2: 2座, 3: 3+座 (RC-93)
  latestVisitedAt?: string
}

export interface CityStat extends CityBoundaryItem {
  visitCount: number
  level: number // 0: 0次, 1: 1次, 2: 2次, 3: 3+次 (RC-93)
  latestVisitedAt?: string
}

interface HoveredTarget {
  level: 'province' | 'city'
  adcode: string
  name: string
  subtitle: string
  detail?: string
}

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

// 图层交互检视模式：'dual' (默认：已点亮城市优先响应市级抽屉，其余区域响应省级抽屉) | 'province' (省级检视) | 'city' (市级检视)
const interactionMode = ref<'dual' | 'province' | 'city'>('dual')

const selectedProvinceAdcode = ref('')
const selectedProvinceName = ref('')
const selectedCityCode = ref('')
const selectedCityName = ref('')

const hoveredTarget = ref<HoveredTarget | null>(null)
const tooltipPos = ref<{ x: number; y: number }>({ x: 0, y: 0 })

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

// 城市打卡字典 (按 city_code 索引)
const visitedCitySummaryMap = computed<Map<string, AtlasCitySummary>>(() => {
  const map = new Map<string, AtlasCitySummary>()
  for (const c of atlasData.value.cities || []) {
    map.set(c.city_code, c)
  }
  return map
})

// 1. 省级聚合统计 (34 个省级行政区，按该省去过的城市数 0 / 1 / 2 / 3+ 分档 RC-93)
const provinceStatsMap = computed<Map<string, ProvinceStat>>(() => {
  const map = new Map<string, ProvinceStat>()
  const citiesByProv = new Map<string, AtlasCitySummary[]>()

  for (const c of atlasData.value.cities || []) {
    const provAdcode = getProvinceAdcodeByCityCode(c.city_code)
    if (!citiesByProv.has(provAdcode)) {
      citiesByProv.set(provAdcode, [])
    }
    citiesByProv.get(provAdcode)!.push(c)
  }

  for (const prov of PROVINCES_DATA) {
    const visitedCities = citiesByProv.get(prov.adcode) || []
    const cityCount = visitedCities.length
    const totalVisits = visitedCities.reduce((sum, c) => sum + (c.visit_count || 1), 0)
    const level = cityCount === 0 ? 0 : cityCount === 1 ? 1 : cityCount === 2 ? 2 : 3

    let latestVisitedAt = ''
    for (const c of visitedCities) {
      if (c.latest_visited_at) {
        if (!latestVisitedAt || c.latest_visited_at > latestVisitedAt) {
          latestVisitedAt = c.latest_visited_at
        }
      }
    }

    map.set(prov.adcode, {
      ...prov,
      visitedCities,
      cityCount,
      totalVisits,
      level,
      latestVisitedAt,
    })
  }

  return map
})

const provinceStatsList = computed<ProvinceStat[]>(() => {
  return PROVINCES_DATA.map((p) => provinceStatsMap.value.get(p.adcode)!)
})

// 2. 市级聚合统计 (370 条市级矢量轮廓，按该市到访次数 0 / 1 / 2 / 3+ 分档 RC-93)
const cityStatsMap = computed<Map<string, CityStat>>(() => {
  const map = new Map<string, CityStat>()
  for (const city of CITIES_BOUNDARY_DATA) {
    const summary = visitedCitySummaryMap.value.get(city.code)
    const visitCount = summary?.visit_count || 0
    const level = visitCount === 0 ? 0 : visitCount === 1 ? 1 : visitCount === 2 ? 2 : 3
    map.set(city.code, {
      ...city,
      visitCount,
      level,
      latestVisitedAt: summary?.latest_visited_at,
    })
  }
  return map
})

const cityStatsList = computed<CityStat[]>(() => {
  return CITIES_BOUNDARY_DATA.map((c) => cityStatsMap.value.get(c.code)!)
})

// 已点亮城市的坐标与触控热区点位 (支持移动端 r=9 扩展热区 §12.6 / RC-93)
const litCityHotspots = computed(() => {
  const coordMap = new Map<string, { x: number; y: number; name: string }>()
  for (const c of CHINA_CITIES) {
    coordMap.set(c.code, { x: c.x, y: c.y, name: c.name })
  }
  return (atlasData.value.cities || [])
    .map((summary) => {
      const coord = coordMap.get(summary.city_code)
      if (!coord) return null
      return {
        code: summary.city_code,
        name: summary.city_name || coord.name,
        x: coord.x,
        y: coord.y,
        visitCount: summary.visit_count || 1,
      }
    })
    .filter((item): item is NonNullable<typeof item> => item !== null)
})

// 已点亮的省级行政区清单
const litProvinces = computed<ProvinceStat[]>(() => {
  return provinceStatsList.value
    .filter((p) => p.cityCount > 0)
    .sort((a, b) => {
      if (a.latestVisitedAt && b.latestVisitedAt) {
        return b.latestVisitedAt.localeCompare(a.latestVisitedAt)
      }
      return b.cityCount - a.cityCount
    })
})

// 省市两级统计大盘指标 (RC-93 并列呈现省级 / 34 与市级 / 375)
const litProvinceCount = computed(() => litProvinces.value.length)
const provinceCoveragePercentage = computed(() => {
  return Math.min(100, Number(((litProvinceCount.value / 34) * 100).toFixed(1))).toFixed(1)
})
const cityCoveragePercentage = computed(() => {
  return Math.min(100, Number(((atlasData.value.total_cities / 375) * 100).toFixed(1))).toFixed(1)
})

// 省级色阶：按去过的城市数 (0 / 1 / 2 / 3+) 映射 --activity-empty 与 --activity-l1 ~ l3
const getProvinceFill = (stat: ProvinceStat) => {
  if (stat.level === 0) return 'var(--activity-empty)'
  if (stat.level === 1) return 'var(--activity-l1)'
  if (stat.level === 2) return 'var(--activity-l2)'
  return 'var(--activity-l3)'
}

// 市级色阶：按该城到访次数 (0 / 1 / 2 / 3+) 映射 --activity-empty 与 --activity-l2 ~ l4
const getCityFill = (stat: CityStat) => {
  if (stat.level === 0) return 'var(--activity-empty)'
  if (stat.level === 1) return 'var(--activity-l2)'
  if (stat.level === 2) return 'var(--activity-l3)'
  return 'var(--activity-l4)'
}

// 打开省份回忆抽屉 (RC-93 -> GET /api/v1/footprints/provinces/:adcode/drawer)
const openProvinceDrawer = (stat: ProvinceStat) => {
  selectedProvinceAdcode.value = stat.adcode
  selectedProvinceName.value = stat.name
  selectedCityCode.value = ''
  selectedCityName.value = ''
  isDrawerOpen.value = true
}

// 打开城市回忆抽屉 (RC-93 -> GET /api/v1/footprints/cities/:city_code/drawer)
const openCityDrawer = (cityCode: string, fallbackName?: string) => {
  const cityStat = cityStatsMap.value.get(cityCode)
  const summary = visitedCitySummaryMap.value.get(cityCode)
  selectedCityCode.value = cityCode
  selectedCityName.value = fallbackName || summary?.city_name || cityStat?.name || ''
  selectedProvinceAdcode.value = ''
  selectedProvinceName.value = ''
  isDrawerOpen.value = true
}

// 单一监听器事件委托处理 (RC-93 §5.11.2：统一读取 data-adcode 与 data-level="province" | "city")
const handleMapClick = (e: MouseEvent) => {
  const target = (e.target as Element).closest('[data-adcode]') as HTMLElement | SVGElement | null
  if (!target) return
  const adcode = target.getAttribute('data-adcode')
  const level = target.getAttribute('data-level') as 'province' | 'city' | null
  if (!adcode || !level) return

  if (level === 'city') {
    openCityDrawer(adcode)
  } else {
    const stat = provinceStatsMap.value.get(adcode)
    if (stat) {
      openProvinceDrawer(stat)
    }
  }
}

const handleMapHover = (e: MouseEvent) => {
  const target = (e.target as Element).closest('[data-adcode]') as HTMLElement | SVGElement | null
  if (!target) {
    hoveredTarget.value = null
    return
  }
  const adcode = target.getAttribute('data-adcode')
  const level = target.getAttribute('data-level') as 'province' | 'city' | null
  if (!adcode || !level) {
    hoveredTarget.value = null
    return
  }

  const container = (e.currentTarget as HTMLElement).getBoundingClientRect()
  tooltipPos.value = {
    x: e.clientX - container.left,
    y: e.clientY - container.top,
  }

  if (level === 'city') {
    const cityStat = cityStatsMap.value.get(adcode)
    const summary = visitedCitySummaryMap.value.get(adcode)
    const provAdcode = cityStat?.provinceAdcode || getProvinceAdcodeByCityCode(adcode)
    const provName = provinceStatsMap.value.get(provAdcode)?.name || ''
    const visitCount = summary?.visit_count ?? cityStat?.visitCount ?? 0
    const name = summary?.city_name || cityStat?.name || adcode
    hoveredTarget.value = {
      level: 'city',
      adcode,
      name,
      subtitle: visitCount > 0 ? `市级 · 到访 ${visitCount} 次` : '市级 · 未点亮',
      detail: visitCount > 0
        ? `${provName ? `${provName} · ` : ''}${summary?.latest_visited_at ? `最近到访 ${summary.latest_visited_at}` : '点击展开城市回忆抽屉'}`
        : `${provName ? `${provName} · ` : ''}点击查看城市抽屉`,
    }
  } else {
    const stat = provinceStatsMap.value.get(adcode)
    if (stat) {
      hoveredTarget.value = {
        level: 'province',
        adcode,
        name: stat.name,
        subtitle: stat.cityCount > 0 ? `省级 · 去过 ${stat.cityCount} 城` : '省级 · 未点亮',
        detail: stat.cityCount > 0
          ? `${stat.visitedCities.map((c) => c.city_name).join('、')} (共 ${stat.totalVisits} 次打卡)`
          : '点击查看省份回忆抽屉',
      }
    } else {
      hoveredTarget.value = null
    }
  }
}

const handleMapLeave = () => {
  hoveredTarget.value = null
}

const handleFootprintSaved = () => {
  loadAtlas()
}

// 省份简称与防重叠视觉微调偏移（去除省会圆点，直接展示 34 个省份简称）
const PROVINCE_LABEL_OFFSETS: Record<string, { dx: number; dy: number }> = {
  '110000': { dx: -4, dy: -3 },  // 北京
  '120000': { dx: 7, dy: 3 },    // 天津
  '130000': { dx: -4, dy: 6 },   // 河北
  '310000': { dx: 10, dy: 1 },   // 上海
  '440000': { dx: 0, dy: -5 },   // 广东
  '810000': { dx: 11, dy: 3 },   // 香港
  '820000': { dx: -10, dy: 6 },  // 澳门
}

const getProvinceShortName = (name: string) => {
  return PROVINCE_FULL_TO_SHORT[name] || name.replace(/(省|市|自治区|特别行政区|维吾尔|壮族|回族)/g, '')
}

const getProvinceLabelPos = (prov: ProvinceStat) => {
  const offset = PROVINCE_LABEL_OFFSETS[prov.adcode] || { dx: 0, dy: 0 }
  return {
    x: Number((prov.center.x + offset.dx).toFixed(1)),
    y: Number((prov.center.y + offset.dy).toFixed(1)),
  }
}

onMounted(() => {
  loadAtlas()
})
</script>

<template>
  <div class="max-w-6xl mx-auto px-3 sm:px-6 py-8 sm:py-14 text-left">
    
    <!-- 标头与补录操作 -->
    <header class="pb-8 border-b border-[var(--border-subtle)] mb-8 space-y-4">
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-3">
          <h1 class="font-serif-editorial text-4xl sm:text-5xl font-normal text-[var(--ink-primary)]">
            空间足迹
          </h1>
          <span class="font-mono-archive text-xs tracking-widest text-[var(--ink-muted)]">
            山川漫游 · 省市两级图谱
          </span>
        </div>

        <button
          v-if="isAdmin"
          @click="isAddModalOpen = true"
          class="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono-archive bg-[var(--ink-primary)] text-[var(--bg-archive)] rounded-xs hover:opacity-90 transition-opacity cursor-pointer shadow-xs"
        >
          <Plus class="w-3.5 h-3.5" />
          <span>补录足迹</span>
        </button>
      </div>

      <p class="font-serif-editorial text-xs text-[var(--ink-muted)] leading-relaxed">
        中国标准 Albers 等面积圆锥投影省市两级矢量图谱（全部地图矢量取自官方数据源、一次性固化、来源与投影参数已注明）。省级色块按去过的城市数浅墨晕染，市级色块按到访次数深墨点亮（省粗市细）。点击省份或城市分别展开「省份回忆抽屉」与「城市回忆抽屉」。
      </p>
    </header>

    <!-- 省市两级统计大盘纸签 (RC-93 并列呈现省级 / 34、市级 / 375 与累计到访总次数) -->
    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 p-5 rounded-xs border border-[var(--border-subtle)] bg-[var(--bg-subtle)]/40 mb-8 font-mono-archive text-xs">
      <div>
        <span class="text-[var(--ink-muted)] block text-[11px]">点亮省级数 (省级口径)</span>
        <div class="flex items-baseline gap-2 mt-1">
          <span class="font-serif-editorial text-2xl text-[var(--ink-primary)] font-medium">
            {{ litProvinceCount }} / 34
          </span>
          <span class="text-[11px] text-[var(--ink-muted)]">
            (省级覆盖率 {{ provinceCoveragePercentage }}%)
          </span>
        </div>
      </div>

      <div>
        <span class="text-[var(--ink-muted)] block text-[11px]">点亮市级数 (地级市口径)</span>
        <div class="flex items-baseline gap-2 mt-1">
          <span class="font-serif-editorial text-2xl text-[var(--accent-moss)] font-medium">
            {{ atlasData.total_cities }} / 375
          </span>
          <span class="text-[11px] text-[var(--ink-muted)]">
            (市级覆盖率 {{ cityCoveragePercentage }}%)
          </span>
        </div>
      </div>

      <div>
        <span class="text-[var(--ink-muted)] block text-[11px]">累计到访足迹总次数</span>
        <div class="flex items-baseline gap-2 mt-1">
          <span class="font-serif-editorial text-2xl text-[var(--ink-primary)] font-medium">
            {{ atlasData.total_footprints }} 次
          </span>
          <span class="text-[11px] text-[var(--ink-muted)]">
            (跨 {{ litProvinceCount }} 省 {{ atlasData.total_cities }} 城)
          </span>
        </div>
      </div>

      <div>
        <span class="text-[var(--ink-muted)] block text-[11px]">两级墨色阶 (省:城数 / 市:次数)</span>
        <div class="flex items-center gap-1.5 mt-2 flex-wrap">
          <div class="flex items-center gap-1">
            <span class="w-3 h-3 rounded-xs border border-[var(--border-subtle)] bg-[var(--activity-empty)]" title="0"></span>
            <span class="text-[10px] text-[var(--ink-muted)]">0</span>
          </div>
          <div class="flex items-center gap-1">
            <span class="w-3 h-3 rounded-xs bg-[var(--activity-l1)]" title="1"></span>
            <span class="text-[10px] text-[var(--ink-muted)]">1</span>
          </div>
          <div class="flex items-center gap-1">
            <span class="w-3 h-3 rounded-xs bg-[var(--activity-l2)]" title="2"></span>
            <span class="text-[10px] text-[var(--ink-muted)]">2</span>
          </div>
          <div class="flex items-center gap-1">
            <span class="w-3 h-3 rounded-xs bg-[var(--activity-l3)]" title="3+ (省)"></span>
            <span class="w-3 h-3 rounded-xs bg-[var(--activity-l4)]" title="3+ (市)"></span>
            <span class="text-[10px] text-[var(--ink-muted)]">3+</span>
          </div>
        </div>
      </div>
    </div>

    <!-- 纯 SVG 合规中国地图画卷 (省市两级轮廓 + 两级着色 + 单监听器事件委托 RC-93) -->
    <div class="mb-12 p-3 sm:p-6 border border-[var(--border-subtle)] bg-[var(--bg-subtle)]/20 rounded-xs relative">
      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 text-xs font-mono-archive text-[var(--ink-muted)] border-b border-[var(--border-subtle)]/50">
        <div class="flex items-center gap-2">
          <span>中国全境省市两级空间漫游图谱</span>
          <span class="text-[10px] text-[var(--ink-muted)]/80 hidden md:inline">
            (省粗市细 · 34 省级名称标注)
          </span>
        </div>

        <!-- 层级检视切换器：方便在双层同览、纯省级抽屉点击与纯市级抽屉点击之间自由切换 -->
        <div class="inline-flex items-center gap-1 bg-[var(--bg-archive)] p-0.5 rounded-xs border border-[var(--border-subtle)] text-[11px]">
          <button
            type="button"
            @click="interactionMode = 'dual'"
            class="px-2 py-0.5 rounded-xs cursor-pointer transition-colors"
            :class="interactionMode === 'dual' ? 'bg-[var(--ink-primary)] text-[var(--bg-archive)]' : 'text-[var(--ink-muted)] hover:text-[var(--ink-primary)]'"
            title="点亮城市响应市级抽屉，其余省域响应省级抽屉"
          >
            省市同览
          </button>
          <button
            type="button"
            @click="interactionMode = 'province'"
            class="px-2 py-0.5 rounded-xs cursor-pointer transition-colors"
            :class="interactionMode === 'province' ? 'bg-[var(--ink-primary)] text-[var(--bg-archive)]' : 'text-[var(--ink-muted)] hover:text-[var(--ink-primary)]'"
            title="点击任意位置打开对应省级回忆抽屉"
          >
            点击看省
          </button>
          <button
            type="button"
            @click="interactionMode = 'city'"
            class="px-2 py-0.5 rounded-xs cursor-pointer transition-colors"
            :class="interactionMode === 'city' ? 'bg-[var(--ink-primary)] text-[var(--bg-archive)]' : 'text-[var(--ink-muted)] hover:text-[var(--ink-primary)]'"
            title="点击任意地级市打开对应城市回忆抽屉"
          >
            点击看市
          </button>
        </div>
      </div>

      <div class="py-2 sm:py-4 flex justify-center relative">
        <!-- SVG 地图容器 (紧凑裁切 viewBox 35 30 765 530 铺满全宽，事件委托严格绑定单监听器 RC-93) -->
        <svg
          viewBox="35 30 765 530"
          class="w-full h-auto select-none"
          xmlns="http://www.w3.org/2000/svg"
          @click="handleMapClick"
          @mousemove="handleMapHover"
          @mouseleave="handleMapLeave"
        >
          <!-- 第一层：34 个省级行政区底色与轮廓 (RC-93 省级着色：浅墨底色 + 较粗省级描边) -->
          <g class="provinces-layer">
            <path
              v-for="prov in provinceStatsList"
              :key="prov.adcode"
              :d="prov.d"
              :data-adcode="prov.adcode"
              data-level="province"
              :fill="getProvinceFill(prov)"
              :fill-opacity="prov.level > 0 ? '0.45' : '1'"
              :stroke="prov.cityCount > 0 ? 'var(--ink-primary)' : 'var(--ink-secondary)'"
              :stroke-opacity="prov.cityCount > 0 ? '0.95' : '0.65'"
              :stroke-width="prov.cityCount > 0 ? '1.15' : '0.85'"
              stroke-linejoin="round"
              class="atlas-prov-path cursor-pointer"
            />
          </g>

          <!-- 第二层：370 个地级市行政区轮廓与点亮着色 (RC-93 市级着色：精细市级描边 + 点亮后深墨阶填充) -->
          <g
            class="cities-layer"
            :class="interactionMode === 'province' ? 'pointer-events-none' : ''"
          >
            <path
              v-for="city in cityStatsList"
              :key="city.code"
              :d="city.d"
              :data-adcode="city.code"
              data-level="city"
              :fill="getCityFill(city)"
              :fill-opacity="city.level > 0 ? '0.92' : '0'"
              :stroke="city.visitCount > 0 ? 'var(--ink-primary)' : 'var(--ink-muted)'"
              :stroke-opacity="city.visitCount > 0 ? '0.9' : '0.45'"
              :stroke-width="city.visitCount > 0 ? '0.65' : '0.38'"
              stroke-linejoin="round"
              class="atlas-city-path cursor-pointer"
              :class="interactionMode === 'dual' && city.visitCount === 0 ? 'pointer-events-none' : ''"
            />
          </g>

          <!-- 第三层：省级加粗外框覆层 (确保市级网格与填充之上，34 个省级粗轮廓始终清晰可辨，省粗市细) -->
          <g class="provinces-border-overlay pointer-events-none">
            <path
              v-for="prov in provinceStatsList"
              :key="`border-${prov.adcode}`"
              :d="prov.d"
              fill="none"
              :stroke="prov.cityCount > 0 ? 'var(--ink-primary)' : 'var(--ink-secondary)'"
              :stroke-opacity="prov.cityCount > 0 ? '0.95' : '0.7'"
              :stroke-width="prov.cityCount > 0 ? '1.15' : '0.85'"
              stroke-linejoin="round"
            />
          </g>

          <!-- 全国主体外轮廓边界线 (100000_full.json 投影) -->
          <path
            :d="NATIONAL_OUTLINE_PATH"
            fill="none"
            stroke="var(--ink-primary)"
            stroke-width="1.3"
            stroke-linejoin="round"
            class="opacity-80 pointer-events-none"
          />

          <!-- 已点亮地级市移动端触控热区扩展圈 (r=9 透明热区，解决两级设计下市级色块偏小的触控问题 §12.6 / RC-93) -->
          <g
            v-if="interactionMode !== 'province'"
            class="lit-cities-touch-layer"
          >
            <circle
              v-for="spot in litCityHotspots"
              :key="`spot-${spot.code}`"
              :cx="spot.x"
              :cy="spot.y"
              r="9"
              fill="transparent"
              :data-adcode="spot.code"
              data-level="city"
              class="cursor-pointer"
            />
          </g>

          <!-- 钓鱼岛及其附属岛屿标记与注记 (123.47°E, 25.75°N) -->
          <g class="diaoyu-dao-marker pointer-events-none">
            <circle
              :cx="DIAOYU_DAO.x"
              :cy="DIAOYU_DAO.y"
              r="2"
              fill="var(--ink-secondary)"
            />
            <text
              :x="DIAOYU_DAO.labelX"
              :y="DIAOYU_DAO.labelY"
              font-size="8"
              fill="var(--ink-muted)"
              font-family="serif"
            >
              {{ DIAOYU_DAO.name }}
            </text>
          </g>

          <!-- 南海诸岛标准附框 (权威标准十段线与诸岛插框) -->
          <g class="scs-inset-frame pointer-events-none">
            <rect
              :x="SCS_INSET.box.x"
              :y="SCS_INSET.box.y"
              :width="SCS_INSET.box.width"
              :height="SCS_INSET.box.height"
              fill="var(--bg-archive)"
              stroke="var(--ink-secondary)"
              stroke-width="0.9"
            />
            <text
              :x="SCS_INSET.box.x + SCS_INSET.box.width / 2"
              :y="SCS_INSET.box.y + 16"
              text-anchor="middle"
              font-size="9"
              font-family="serif"
              font-weight="500"
              fill="var(--ink-secondary)"
            >
              {{ SCS_INSET.title }}
            </text>
            <line
              :x1="SCS_INSET.box.x"
              :y1="SCS_INSET.box.y + 22"
              :x2="SCS_INSET.box.x + SCS_INSET.box.width"
              :y2="SCS_INSET.box.y + 22"
              stroke="var(--border-subtle)"
              stroke-width="0.6"
            />

            <!-- 海南岛南部与台湾岛南部参考海岸线 -->
            <path
              :d="SCS_INSET.hainanCoast"
              fill="var(--bg-subtle)"
              stroke="var(--border-subtle)"
              stroke-width="0.6"
            />
            <path
              :d="SCS_INSET.taiwanCoast"
              fill="var(--bg-subtle)"
              stroke="var(--border-subtle)"
              stroke-width="0.6"
            />

            <!-- 权威标准十段线 (100000_JD 投影) -->
            <g class="scs-dashes">
              <path
                v-for="(d, idx) in SCS_INSET.dashes"
                :key="idx"
                :d="d"
                fill="none"
                stroke="var(--ink-secondary)"
                stroke-width="1.2"
                stroke-linecap="round"
                class="opacity-85"
              />
            </g>

            <!-- 诸岛小岛礁与暗沙印记点 -->
            <g v-for="isl in SCS_INSET.islands" :key="isl.name">
              <circle
                :cx="isl.x"
                :cy="isl.y"
                :r="isl.r"
                fill="var(--ink-muted)"
              />
              <text
                :x="isl.x + 3"
                :y="isl.y + 2"
                font-size="6.5"
                font-family="serif"
                fill="var(--ink-muted)"
              >
                {{ isl.name }}
              </text>
            </g>
          </g>

          <!-- 34 个省级行政区简称标注（无省会圆点，居中清爽呈现省份名称） -->
          <g class="province-labels-layer pointer-events-none">
            <text
              v-for="prov in provinceStatsList"
              :key="`label-${prov.adcode}`"
              :x="getProvinceLabelPos(prov).x"
              :y="getProvinceLabelPos(prov).y"
              text-anchor="middle"
              dominant-baseline="central"
              font-size="8.5"
              font-family="serif"
              :fill="prov.cityCount > 0 ? 'var(--ink-primary)' : 'var(--ink-secondary)'"
              :font-weight="prov.cityCount > 0 ? '600' : '400'"
              class="atlas-prov-label select-none"
            >
              {{ getProvinceShortName(prov.name) }}
            </text>
          </g>
        </svg>

        <!-- 悬浮微纸签 (根据 data-level 动态展示省级或市级悬浮信息 RC-93) -->
        <div
          v-if="hoveredTarget"
          class="absolute z-20 pointer-events-none px-3 py-1.5 bg-[var(--bg-archive)] border border-[var(--ink-secondary)] rounded-xs shadow-md font-mono-archive text-xs -translate-x-1/2 -translate-y-12 transition-all"
          :style="{ left: `${tooltipPos.x}px`, top: `${tooltipPos.y}px` }"
        >
          <div class="flex items-center gap-1.5">
            <span class="font-serif-editorial font-medium text-[var(--ink-primary)]">
              {{ hoveredTarget.name }}
            </span>
            <span class="text-[10px] text-[var(--ink-muted)]">
              · {{ hoveredTarget.subtitle }}
            </span>
          </div>
          <div v-if="hoveredTarget.detail" class="text-[10px] text-[var(--ink-muted)] mt-0.5 max-w-[240px] truncate">
            {{ hoveredTarget.detail }}
          </div>
        </div>
      </div>
    </div>

    <!-- 点亮省市两级履历列表展厅 (点击卡片打开省级抽屉，点击卡片内城市贴纸直接打开市级抽屉 RC-93) -->
    <div class="space-y-6">
      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-[var(--border-subtle)] font-mono-archive text-xs">
        <span class="text-[var(--ink-muted)]">
          已点亮省市履历 ({{ litProvinces.length }} / 34 个省级行政区 · {{ atlasData.total_cities }} / 375 座地级城市)
        </span>
        <span class="text-[11px] text-[var(--ink-muted)]">
          点击省卡打开「省份抽屉」 · 点击城市标签直达「城市抽屉」 ↗
        </span>
      </div>

      <div v-if="litProvinces.length === 0" class="text-xs font-mono-archive text-[var(--ink-muted)] py-12 text-center">
        暂无点亮足迹。点击右上角「补录足迹」点亮你的第一个漫游足迹。
      </div>

      <div v-else class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <div
          v-for="prov in litProvinces"
          :key="prov.adcode"
          @click="openProvinceDrawer(prov)"
          class="p-4 bg-[var(--bg-subtle)]/40 border border-[var(--border-subtle)] hover:border-[var(--ink-primary)] rounded-xs cursor-pointer transition-all flex items-center justify-between group text-left"
        >
          <div class="space-y-2 min-w-0 flex-1 pr-2">
            <div class="flex items-center gap-2">
              <MapPin class="w-4 h-4 text-[var(--accent-warm)] shrink-0" />
              <h3 class="font-serif-editorial text-base font-medium text-[var(--ink-primary)] group-hover:text-[var(--accent-warm)] transition-colors truncate">
                {{ prov.name }}
              </h3>
              <span class="px-1.5 py-0.2 bg-[var(--ink-primary)] text-[var(--bg-archive)] rounded-xs text-[10px] font-mono-archive shrink-0">
                {{ prov.cityCount }} 城
              </span>
            </div>
            
            <!-- 省内已点亮城市贴纸（点击城市直达市级回忆抽屉 RC-93） -->
            <div class="flex flex-wrap gap-1">
              <button
                v-for="c in prov.visitedCities"
                :key="c.city_code"
                type="button"
                @click.stop="openCityDrawer(c.city_code, c.city_name)"
                class="px-1.5 py-0.5 text-[11px] font-serif-editorial bg-[var(--bg-archive)] border border-[var(--border-subtle)] hover:border-[var(--accent-warm)] hover:text-[var(--accent-warm)] rounded-xs text-[var(--ink-secondary)] transition-colors cursor-pointer"
                :title="`点击打开 ${c.city_name} 城市回忆抽屉 (到访 ${c.visit_count} 次)`"
              >
                {{ c.city_name }}
                <span class="font-mono-archive text-[9px] text-[var(--ink-muted)]">×{{ c.visit_count }}</span>
              </button>
            </div>

            <p class="font-mono-archive text-[10px] text-[var(--ink-muted)]">
              累计到访 {{ prov.totalVisits }} 次<span v-if="prov.latestVisitedAt"> · 最近 {{ prov.latestVisitedAt }}</span>
            </p>
          </div>

          <ChevronRight class="w-4 h-4 text-[var(--ink-muted)] group-hover:text-[var(--ink-primary)] group-hover:translate-x-0.5 transition-all shrink-0" />
        </div>
      </div>
    </div>

    <!-- 弹窗挂载 -->
    <AddFootprintModal
      v-if="isAddModalOpen"
      :isOpen="isAddModalOpen"
      @close="isAddModalOpen = false"
      @saved="handleFootprintSaved"
    />

    <CityMemoryDrawerModal
      v-if="isDrawerOpen"
      :isOpen="isDrawerOpen"
      :adcode="selectedProvinceAdcode"
      :provinceName="selectedProvinceName"
      :cityCode="selectedCityCode"
      :cityName="selectedCityName"
      @close="isDrawerOpen = false"
      @selectEntry="(entry) => { isDrawerOpen = false; emit('selectEntry', entry) }"
    />

  </div>
</template>

<style scoped>
/* 纯 CSS :hover 描边与明度高亮，不经过 Vue 响应式状态派发 (RC-93 / §5.2 性能铁律) */
.atlas-prov-path {
  transition: fill-opacity 0.15s ease, stroke-width 0.15s ease;
}
.atlas-prov-path:hover {
  fill-opacity: 0.62;
  stroke: var(--ink-primary);
  stroke-width: 1.25px;
}

.atlas-city-path {
  transition: fill-opacity 0.15s ease, stroke-width 0.15s ease;
}
.atlas-city-path:hover {
  fill-opacity: 1;
  stroke: var(--accent-warm);
  stroke-width: 0.95px;
}

.atlas-prov-label {
  paint-order: stroke;
  stroke: var(--bg-archive);
  stroke-width: 2.2px;
  stroke-linejoin: round;
  opacity: 0.92;
}
</style>
