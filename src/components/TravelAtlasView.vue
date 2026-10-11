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
import {
  PROVINCES_DATA,
  NATIONAL_OUTLINE_PATH,
  DIAOYU_DAO,
  SCS_INSET,
  CAPITAL_CITIES,
  getProvinceAdcodeByCityCode,
  type ProvinceMapItem,
} from '../utils/chinaMapData'

export interface ProvinceStat extends ProvinceMapItem {
  visitedCities: AtlasCitySummary[]
  cityCount: number
  totalVisits: number
  level: number // 0: 0座, 1: 1座, 2: 2座, 3: 3+座 (RC-91)
  latestVisitedAt?: string
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

const selectedProvinceAdcode = ref('')
const selectedProvinceName = ref('')
const selectedCityCodes = ref<string[]>([])

const hoveredProvince = ref<ProvinceStat | null>(null)
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

// 将到访城市按省级行政区前缀聚合 (RC-91)
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

    // 提取该省最近到访日期
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

// 已点亮的省级行政区清单
const litProvinces = computed<ProvinceStat[]>(() => {
  return provinceStatsList.value
    .filter((p) => p.cityCount > 0)
    .sort((a, b) => {
      // 按最近到访时间倒序，其次按到访城市数倒序
      if (a.latestVisitedAt && b.latestVisitedAt) {
        return b.latestVisitedAt.localeCompare(a.latestVisitedAt)
      }
      return b.cityCount - a.cityCount
    })
})

// 点亮省级数与覆盖率 (RC-91 统计大盘)
const litProvinceCount = computed(() => litProvinces.value.length)
const provinceCoveragePercentage = computed(() => {
  return Math.min(100, Number(((litProvinceCount.value / 34) * 100).toFixed(1))).toFixed(1)
})

// 根据省份到访城市数分档着色 (复用纸本墨色阶 RC-91)
const getProvinceFill = (stat: ProvinceStat) => {
  if (stat.level === 0) return 'var(--bg-archive)'
  if (stat.level === 1) return 'var(--activity-l1)'
  if (stat.level === 2) return 'var(--activity-l2)'
  return 'var(--activity-l3)'
}

// 打开省份回忆抽屉 (RC-91)
const openProvinceDrawer = (stat: ProvinceStat) => {
  selectedProvinceAdcode.value = stat.adcode
  selectedProvinceName.value = stat.name
  selectedCityCodes.value = stat.visitedCities.map((c) => c.city_code)
  isDrawerOpen.value = true
}

// 单一监听器事件委托处理 (RC-91 §5.11.2)
const handleMapClick = (e: MouseEvent) => {
  const target = (e.target as Element).closest('[data-province]') as HTMLElement | SVGElement | null
  if (!target) return
  const adcode = target.dataset.province
  if (!adcode) return
  const stat = provinceStatsMap.value.get(adcode)
  if (stat) {
    openProvinceDrawer(stat)
  }
}

const handleMapHover = (e: MouseEvent) => {
  const target = (e.target as Element).closest('[data-province]') as HTMLElement | SVGElement | null
  if (!target) {
    hoveredProvince.value = null
    return
  }
  const adcode = target.dataset.province
  if (!adcode) {
    hoveredProvince.value = null
    return
  }
  const stat = provinceStatsMap.value.get(adcode)
  if (stat) {
    hoveredProvince.value = stat
    const container = (e.currentTarget as HTMLElement).getBoundingClientRect()
    tooltipPos.value = {
      x: e.clientX - container.left,
      y: e.clientY - container.top,
    }
  } else {
    hoveredProvince.value = null
  }
}

const handleMapLeave = () => {
  hoveredProvince.value = null
}

const handleFootprintSaved = () => {
  loadAtlas()
}

onMounted(() => {
  loadAtlas()
})
</script>

<template>
  <div class="max-w-5xl mx-auto px-4 sm:px-8 py-10 sm:py-20 text-left">
    
    <!-- 标头与补录操作 -->
    <header class="pb-8 border-b border-[var(--border-subtle)] mb-10 space-y-4">
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-3">
          <h1 class="font-serif-editorial text-4xl sm:text-5xl font-normal text-[var(--ink-primary)]">
            空间足迹
          </h1>
          <span class="font-mono-archive text-xs tracking-widest text-[var(--ink-muted)]">
            山川漫游 · 省级图谱
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
        中国标准 Albers 等面积圆锥投影省级分区矢量图谱（基于官方 DataV Atlas 行政区划边界）。点亮单位为省级行政区，按各省到访城市数深浅墨阶着色；34 个省会城市常驻固定注记。点击任意省份展开右侧侧滑纸本回忆抽屉，聚合并回溯旅途足迹、影像胶片与生活随笔。
      </p>
    </header>

    <!-- 统计大盘纸签 (RC-91 口径变更) -->
    <div class="grid grid-cols-1 sm:grid-cols-3 gap-6 p-5 rounded-xs border border-[var(--border-subtle)] bg-[var(--bg-subtle)]/40 mb-10 font-mono-archive text-xs">
      <div>
        <span class="text-[var(--ink-muted)] block text-[11px]">点亮省级行政区</span>
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
        <span class="text-[var(--ink-muted)] block text-[11px]">漫游地级城市</span>
        <div class="flex items-baseline gap-2 mt-1">
          <span class="font-serif-editorial text-2xl text-[var(--accent-moss)] font-medium">
            {{ atlasData.total_cities }} 座
          </span>
          <span class="text-[11px] text-[var(--ink-muted)]">
            (累计 {{ atlasData.total_footprints }} 次到访)
          </span>
        </div>
      </div>

      <div>
        <span class="text-[var(--ink-muted)] block text-[11px]">图谱墨色阶 (该省去过城市数)</span>
        <div class="flex items-center gap-2 mt-2">
          <div class="flex items-center gap-1">
            <span class="w-3 h-3 rounded-xs border border-[var(--border-subtle)] bg-[var(--bg-archive)]" title="0座"></span>
            <span class="text-[10px] text-[var(--ink-muted)]">0</span>
          </div>
          <div class="flex items-center gap-1">
            <span class="w-3 h-3 rounded-xs bg-[var(--activity-l1)]" title="1座"></span>
            <span class="text-[10px] text-[var(--ink-muted)]">1</span>
          </div>
          <div class="flex items-center gap-1">
            <span class="w-3 h-3 rounded-xs bg-[var(--activity-l2)]" title="2座"></span>
            <span class="text-[10px] text-[var(--ink-muted)]">2</span>
          </div>
          <div class="flex items-center gap-1">
            <span class="w-3 h-3 rounded-xs bg-[var(--activity-l3)]" title="3+座"></span>
            <span class="text-[10px] text-[var(--ink-muted)]">3+</span>
          </div>
          <span class="text-[10px] text-[var(--ink-muted)] ml-1.5">· 34 省会注记</span>
        </div>
      </div>
    </div>

    <!-- 纯 SVG 合规中国地图画卷 (省级着色 + 事件委托 RC-91) -->
    <div class="mb-12 p-6 sm:p-10 border border-[var(--border-subtle)] bg-[var(--bg-subtle)]/20 rounded-xs relative">
      <div class="flex items-center justify-between pb-4 text-xs font-mono-archive text-[var(--ink-muted)] border-b border-[var(--border-subtle)]/50">
        <span>中国全境省级空间漫游图谱</span>
        <span>轻触或点击省份查看省份回忆 ↗</span>
      </div>

      <div class="py-6 flex justify-center relative">
        <!-- SVG 地图容器 (820x580 视图尺寸，事件委托绑定单监听器) -->
        <svg
          viewBox="0 0 820 580"
          class="w-full max-w-2xl h-auto select-none"
          xmlns="http://www.w3.org/2000/svg"
          @click="handleMapClick"
          @mousemove="handleMapHover"
          @mouseleave="handleMapLeave"
        >
          <!-- 34 个省级行政区 Albers 投影矢量色块 (RC-91 省级着色) -->
          <g class="provinces-layer">
            <path
              v-for="prov in provinceStatsList"
              :key="prov.adcode"
              :d="prov.d"
              :data-province="prov.adcode"
              :fill="getProvinceFill(prov)"
              :stroke="prov.cityCount > 0 ? 'var(--ink-primary)' : 'var(--border-subtle)'"
              :stroke-width="prov.cityCount > 0 ? '0.8' : '0.5'"
              stroke-linejoin="round"
              class="transition-colors cursor-pointer hover:opacity-85"
            />
          </g>

          <!-- 全国主体外轮廓边界线 (100000.json 投影) -->
          <path
            :d="NATIONAL_OUTLINE_PATH"
            fill="none"
            stroke="var(--border-strong)"
            stroke-width="1.2"
            stroke-linejoin="round"
            class="opacity-75 pointer-events-none"
          />

          <!-- 钓鱼岛及其附属岛屿标记与注记 (123.47°E, 25.75°N) -->
          <g class="diaoyu-dao-marker">
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
          <g class="scs-inset-frame">
            <rect
              :x="SCS_INSET.box.x"
              :y="SCS_INSET.box.y"
              :width="SCS_INSET.box.width"
              :height="SCS_INSET.box.height"
              fill="var(--bg-archive)"
              stroke="var(--border-strong)"
              stroke-width="1"
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

            <!-- 权威标准十段线 (10-dash line) -->
            <g class="scs-dashes">
              <path
                v-for="(d, idx) in SCS_INSET.dashes"
                :key="idx"
                :d="d"
                fill="var(--ink-secondary)"
                stroke="none"
                class="opacity-80"
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

          <!-- 34 个省会城市常驻标注 (RC-91 规定：不参与色阶，固定墨色) -->
          <g class="capitals-layer">
            <g
              v-for="cap in CAPITAL_CITIES"
              :key="cap.code"
              :data-province="getProvinceAdcodeByCityCode(cap.code)"
              class="group cursor-pointer"
            >
              <!-- 移动端触控热区扩展圈 (r=10 有效响应 24px~36px，RC-91 / §12.6) -->
              <circle
                :cx="cap.x"
                :cy="cap.y"
                r="10"
                fill="transparent"
                class="cursor-pointer"
              />

              <!-- 省会中心墨点 (固定墨色) -->
              <circle
                :cx="cap.x"
                :cy="cap.y"
                r="2"
                fill="var(--ink-primary)"
                class="pointer-events-none group-hover:scale-125 transition-transform"
              />

              <!-- 省会名称纸签 (常驻固定墨色，不随色阶变化) -->
              <text
                :x="cap.x + 3.5"
                :y="cap.y + 2.5"
                font-size="7.5"
                fill="var(--ink-secondary)"
                font-family="serif"
                class="pointer-events-none select-none font-medium opacity-90 group-hover:opacity-100 group-hover:fill-[var(--ink-primary)]"
              >
                {{ cap.name.replace(/(市|特别行政区)/g, '') }}
              </text>
            </g>
          </g>
        </svg>

        <!-- 悬浮微纸签 (浮动展示当前选中省份信息 RC-91) -->
        <div
          v-if="hoveredProvince"
          class="absolute z-20 pointer-events-none px-3 py-1.5 bg-[var(--bg-archive)] border border-[var(--border-strong)] rounded-xs shadow-md font-mono-archive text-xs -translate-x-1/2 -translate-y-12 transition-all"
          :style="{ left: `${tooltipPos.x}px`, top: `${tooltipPos.y}px` }"
        >
          <div class="flex items-center gap-1.5">
            <span class="font-serif-editorial font-medium text-[var(--ink-primary)]">
              {{ hoveredProvince.name }}
            </span>
            <span class="text-[10px] text-[var(--ink-muted)]">
              · {{ hoveredProvince.cityCount > 0 ? `去过 ${hoveredProvince.cityCount} 城` : '未点亮' }}
            </span>
          </div>
          <div v-if="hoveredProvince.cityCount > 0" class="text-[10px] text-[var(--ink-muted)] mt-0.5">
            {{ hoveredProvince.visitedCities.map((c) => c.city_name).join('、') }}
            (共 {{ hoveredProvince.totalVisits }} 次打卡)
          </div>
        </div>
      </div>
    </div>

    <!-- 点亮省份履历列表展厅 (RC-91 按省级聚合展示) -->
    <div class="space-y-6">
      <div class="flex items-center justify-between pb-3 border-b border-[var(--border-subtle)] font-mono-archive text-xs">
        <span class="text-[var(--ink-muted)]">
          已点亮省份履历 ({{ litProvinces.length }} 个省级行政区 · 涵盖 {{ atlasData.total_cities }} 座城市)
        </span>
        <span class="text-[11px] text-[var(--ink-muted)]">点击进入省份回忆抽屉 ↗</span>
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
          <div class="space-y-1.5">
            <div class="flex items-center gap-2">
              <MapPin class="w-4 h-4 text-[var(--accent-warm)]" />
              <h3 class="font-serif-editorial text-base font-medium text-[var(--ink-primary)] group-hover:text-[var(--accent-warm)] transition-colors">
                {{ prov.name }}
              </h3>
              <span class="px-1.5 py-0.2 bg-[var(--ink-primary)] text-[var(--bg-archive)] rounded-xs text-[10px] font-mono-archive">
                {{ prov.cityCount }} 城
              </span>
            </div>
            
            <p class="font-serif-editorial text-xs text-[var(--ink-secondary)] truncate max-w-[200px]">
              {{ prov.visitedCities.map((c) => c.city_name).join('、') }}
            </p>

            <p class="font-mono-archive text-[10px] text-[var(--ink-muted)]">
              累计到访 {{ prov.totalVisits }} 次<span v-if="prov.latestVisitedAt"> · 最近 {{ prov.latestVisitedAt }}</span>
            </p>
          </div>

          <ChevronRight class="w-4 h-4 text-[var(--ink-muted)] group-hover:text-[var(--ink-primary)] group-hover:translate-x-0.5 transition-all" />
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
      :cityCodes="selectedCityCodes"
      @close="isDrawerOpen = false"
      @selectEntry="(entry) => { isDrawerOpen = false; emit('selectEntry', entry) }"
    />

  </div>
</template>
