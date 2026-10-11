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
const selectedCityCode = ref('')
const selectedCityName = ref('')
const isDrawerOpen = ref(false)

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

const openCityDrawer = (city: { city_code: string; city_name: string }) => {
  selectedCityCode.value = city.city_code
  selectedCityName.value = city.city_name
  isDrawerOpen.value = true
}

const handleFootprintSaved = () => {
  loadAtlas()
}

import { CHINA_CITIES } from '../utils/cities'

// 全国市级覆盖率 (由单一事实来源 CHINA_CITIES 派生，上限 100%，RC-76)
const coveragePercentage = computed(() => {
  const count = atlasData.value.total_cities || 0
  const denominator = CHINA_CITIES.length || 375
  return Math.min(100, Number(((count / denominator) * 100).toFixed(1))).toFixed(1)
})

import {
  PROVINCES_DATA,
  NATIONAL_OUTLINE_PATH,
  DIAOYU_DAO,
  SCS_INSET,
  getCityProjectedPosition,
} from '../utils/chinaMapData'

// 根据 6 位行政区划代码获取权威 Albers 投影坐标
const getCityDotPosition = (code: string) => {
  return getCityProjectedPosition(code)
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
            山川漫游 · 城市图谱
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
        中国标准 Albers 等面积圆锥投影矢量图谱（基于 DataV Atlas 官方行政区划边界与 Albers 等面积圆锥投影）。完整包含全国全境、台湾省、海南省、钓鱼岛及其附属岛屿与南海诸岛标准插框十段线。以淡墨浸润每一个曾留下足迹与呼吸的城市，点击任意点亮城市展开侧滑纸本回忆抽屉。
      </p>
    </header>

    <!-- 点亮统计大盘纸签 -->
    <div class="grid grid-cols-1 sm:grid-cols-3 gap-6 p-5 rounded-xs border border-[var(--border-subtle)] bg-[var(--bg-subtle)]/40 mb-10 font-mono-archive text-xs">
      <div>
        <span class="text-[var(--ink-muted)] block text-[11px]">点亮城市</span>
        <div class="flex items-baseline gap-2 mt-1">
          <span class="font-serif-editorial text-2xl text-[var(--ink-primary)] font-medium">
            {{ atlasData.total_cities }} 座
          </span>
          <span class="text-[11px] text-[var(--ink-muted)]">
            (全国覆盖率 {{ coveragePercentage }}%)
          </span>
        </div>
      </div>

      <div>
        <span class="text-[var(--ink-muted)] block text-[11px]">累计到访足迹</span>
        <span class="font-serif-editorial text-2xl text-[var(--accent-moss)] font-medium mt-1 block">
          {{ atlasData.total_footprints }} 次
        </span>
      </div>

      <div>
        <span class="text-[var(--ink-muted)] block text-[11px]">地图绘制</span>
        <span class="font-serif-editorial text-sm text-[var(--ink-secondary)] mt-1 block">
          Albers 投影 · 墨色渐润
        </span>
      </div>
    </div>

    <!-- 纯 SVG 合规中国地图画卷 -->
    <div class="mb-12 p-6 sm:p-10 border border-[var(--border-subtle)] bg-[var(--bg-subtle)]/20 rounded-xs relative">
      <div class="flex items-center justify-between pb-4 text-xs font-mono-archive text-[var(--ink-muted)] border-b border-[var(--border-subtle)]/50">
        <span>全国市级空间漫游图谱</span>
        <span>点击已点亮城市查看回忆 ↗</span>
      </div>

      <div class="py-6 flex justify-center">
        <!-- SVG 地图容器 (800x600 视图尺寸) -->
        <svg
          viewBox="0 0 820 580"
          class="w-full max-w-2xl h-auto select-none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <!-- 合规 34 个省级行政区 Albers 投影矢量底图 -->
          <g class="provinces-layer">
            <path
              v-for="prov in PROVINCES_DATA"
              :key="prov.adcode"
              :d="prov.d"
              fill="var(--bg-archive)"
              stroke="var(--border-subtle)"
              stroke-width="0.6"
              stroke-linejoin="round"
              class="transition-colors hover:fill-[var(--bg-subtle)]"
            />
          </g>

          <!-- 全国主体外轮廓边界线 (权威 Albers 等面积圆锥投影) -->
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
            <!-- 插框外边框 -->
            <rect
              :x="SCS_INSET.box.x"
              :y="SCS_INSET.box.y"
              :width="SCS_INSET.box.width"
              :height="SCS_INSET.box.height"
              fill="var(--bg-archive)"
              stroke="var(--border-strong)"
              stroke-width="1"
            />
            <!-- 插框标题 -->
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

            <!-- 诸岛小岛礁与暗沙印记点 (东沙、西沙、中沙、黄岩岛、南沙、曾母暗沙) -->
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

          <!-- 点亮城市墨水浸润印记与光斑 (事件委托) -->
          <g>
            <g
              v-for="c in atlasData.cities"
              :key="c.city_code"
              @click="openCityDrawer(c)"
              class="cursor-pointer group"
            >
              <!-- 墨晕扩散圈 -->
              <circle
                :cx="getCityDotPosition(c.city_code).x"
                :cy="getCityDotPosition(c.city_code).y"
                :r="c.visit_count >= 3 ? 12 : 8"
                fill="var(--accent-warm)"
                class="opacity-20 group-hover:opacity-40 transition-opacity"
              />

              <!-- 实体墨点 -->
              <circle
                :cx="getCityDotPosition(c.city_code).x"
                :cy="getCityDotPosition(c.city_code).y"
                :r="c.visit_count >= 3 ? 4 : 3"
                fill="var(--ink-primary)"
                class="transition-transform group-hover:scale-125"
              />

              <!-- 城市名注记纸签 -->
              <text
                :x="getCityDotPosition(c.city_code).x + 6"
                :y="getCityDotPosition(c.city_code).y + 3"
                font-size="10"
                fill="var(--ink-primary)"
                font-family="serif"
                class="font-medium group-hover:fill-[var(--accent-warm)] transition-colors"
              >
                {{ c.city_name }}
              </text>
            </g>
          </g>
        </svg>
      </div>
    </div>

    <!-- 点亮城市列表展厅 (按最近造访时间排序) -->
    <div class="space-y-6">
      <div class="flex items-center justify-between pb-3 border-b border-[var(--border-subtle)] font-mono-archive text-xs">
        <span class="text-[var(--ink-muted)]">已点亮城市履历 ({{ atlasData.cities.length }} 座)</span>
        <span class="text-[11px] text-[var(--ink-muted)]">点击进入城市回忆抽屉</span>
      </div>

      <div v-if="atlasData.cities.length === 0" class="text-xs font-mono-archive text-[var(--ink-muted)] py-12 text-center">
        暂无点亮足迹。点击右上角「补录足迹」点亮你的第一个漫游城市。
      </div>

      <div v-else class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <div
          v-for="c in atlasData.cities"
          :key="c.city_code"
          @click="openCityDrawer(c)"
          class="p-4 bg-[var(--bg-subtle)]/40 border border-[var(--border-subtle)] hover:border-[var(--ink-primary)] rounded-xs cursor-pointer transition-all flex items-center justify-between group text-left"
        >
          <div class="space-y-1">
            <div class="flex items-center gap-2">
              <MapPin class="w-4 h-4 text-[var(--accent-warm)]" />
              <h3 class="font-serif-editorial text-base font-medium text-[var(--ink-primary)] group-hover:text-[var(--accent-warm)] transition-colors">
                {{ c.city_name }}
              </h3>
            </div>
            <p class="font-mono-archive text-[11px] text-[var(--ink-muted)]">
              到访 {{ c.visit_count }} 次 · 最近 {{ c.latest_visited_at }}
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
      :cityCode="selectedCityCode"
      :cityName="selectedCityName"
      @close="isDrawerOpen = false"
      @selectEntry="(entry) => { isDrawerOpen = false; emit('selectEntry', entry) }"
    />

  </div>
</template>
