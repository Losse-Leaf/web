<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import {
  Plus,
  MapPin,
  ChevronRight,
} from 'lucide-vue-next'
import { fetchFootprintsAtlas, getAdminToken } from '../utils/api'
import type { AtlasCitySummary } from '../types'
import AddFootprintModal from './AddFootprintModal.vue'
import CityMemoryDrawerModal from './CityMemoryDrawerModal.vue'

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

// 全国市级覆盖率 (全国约 333 个地级行政区)
const coveragePercentage = computed(() => {
  const count = atlasData.value.total_cities || 0
  return ((count / 333) * 100).toFixed(1)
})

// 城市重要坐标映射表 (用于在合规 SVG 轮廓上准确投射点亮墨印)
const CITY_COORDINATES: Record<string, { x: number; y: number }> = {
  // 直辖市
  '110100': { x: 580, y: 220 }, // 北京
  '120100': { x: 595, y: 235 }, // 天津
  '310100': { x: 670, y: 355 }, // 上海
  '500100': { x: 480, y: 380 }, // 重庆
  // 浙江
  '330100': { x: 650, y: 365 }, // 杭州
  '330200': { x: 668, y: 375 }, // 宁波
  '330300': { x: 655, y: 405 }, // 温州
  // 江苏
  '320100': { x: 630, y: 340 }, // 南京
  '320500': { x: 655, y: 350 }, // 苏州
  // 广东 / 港澳
  '440100': { x: 560, y: 480 }, // 广州
  '440300': { x: 575, y: 490 }, // 深圳
  '810000': { x: 580, y: 495 }, // 香港
  '820000': { x: 565, y: 498 }, // 澳门
  // 台湾
  '710000': { x: 685, y: 460 }, // 台北
  // 四川 / 云南 / 西藏
  '510100': { x: 450, y: 360 }, // 成都
  '530100': { x: 440, y: 470 }, // 昆明
  '532900': { x: 405, y: 455 }, // 大理
  '530700': { x: 410, y: 435 }, // 丽江
  '540100': { x: 260, y: 370 }, // 拉萨
  // 陕西 / 湖北 / 湖南
  '610100': { x: 510, y: 310 }, // 西安
  '420100': { x: 575, y: 360 }, // 武汉
  '430100': { x: 550, y: 410 }, // 长沙
  // 江西 / 福建
  '360200': { x: 615, y: 380 }, // 景德镇
  '360100': { x: 600, y: 395 }, // 南昌
  '350200': { x: 640, y: 450 }, // 厦门
  // 北方
  '370200': { x: 640, y: 265 }, // 青岛
  '210100': { x: 680, y: 170 }, // 沈阳
  '230100': { x: 700, y: 110 }, // 哈尔滨
  '650100': { x: 200, y: 170 }, // 乌鲁木齐
}

const getCityDotPosition = (code: string) => {
  if (CITY_COORDINATES[code]) {
    return CITY_COORDINATES[code]
  }
  // 依据 6 位行政区划前两位省份给出一个温和的估算坐标
  const prov = code.slice(0, 2)
  const PROV_DEFAULT: Record<string, { x: number; y: number }> = {
    '11': { x: 580, y: 220 }, // 京
    '12': { x: 595, y: 235 }, // 津
    '13': { x: 570, y: 240 }, // 冀
    '14': { x: 540, y: 250 }, // 晋
    '15': { x: 510, y: 180 }, // 蒙
    '21': { x: 670, y: 180 }, // 辽
    '22': { x: 700, y: 140 }, // 吉
    '23': { x: 700, y: 100 }, // 黑
    '31': { x: 670, y: 355 }, // 沪
    '32': { x: 640, y: 340 }, // 苏
    '33': { x: 650, y: 375 }, // 浙
    '34': { x: 610, y: 340 }, // 皖
    '35': { x: 635, y: 430 }, // 闽
    '36': { x: 595, y: 400 }, // 赣
    '37': { x: 620, y: 260 }, // 鲁
    '41': { x: 550, y: 300 }, // 豫
    '42': { x: 560, y: 350 }, // 鄂
    '43': { x: 540, y: 410 }, // 湘
    '44': { x: 565, y: 475 }, // 粤
    '45': { x: 490, y: 470 }, // 桂
    '46': { x: 520, y: 535 }, // 琼
    '50': { x: 480, y: 380 }, // 渝
    '51': { x: 440, y: 360 }, // 川
    '52': { x: 470, y: 430 }, // 黔
    '53': { x: 420, y: 460 }, // 滇
    '54': { x: 260, y: 360 }, // 藏
    '61': { x: 510, y: 310 }, // 陕
    '62': { x: 420, y: 280 }, // 甘
    '63': { x: 340, y: 290 }, // 青
    '64': { x: 480, y: 250 }, // 宁
    '65': { x: 200, y: 170 }, // 新
    '71': { x: 685, y: 460 }, // 台
    '81': { x: 580, y: 495 }, // 港
    '82': { x: 565, y: 498 }, // 澳
  }
  return PROV_DEFAULT[prov] || { x: 500, y: 330 }
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
        纯合规市级自绘矢量图谱。以淡墨浸润每一个曾留下呼吸与脚步的城市，点击任意点亮城市展开侧滑纸本回忆抽屉。
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
          <!-- 背景浅色线稿基础轮廓示意 (合规全境 Albers 投影概貌) -->
          <!-- 大陆主体外轮廓线 -->
          <path
            d="M 180 160 Q 240 140 320 180 T 460 170 T 560 180 T 660 140 T 730 80 Q 750 120 720 170 T 670 210 T 630 250 T 660 320 T 640 400 T 600 460 T 540 500 T 470 480 T 410 440 T 360 410 T 260 370 T 160 300 Z"
            fill="var(--bg-archive)"
            stroke="var(--border-strong)"
            stroke-width="1.2"
            stroke-linejoin="round"
            class="opacity-70"
          />

          <!-- 台湾省轮廓线 (硬约束：必须包含台湾) -->
          <path
            d="M 680 440 C 690 445 695 460 690 480 C 685 490 678 485 675 470 C 674 455 676 445 680 440 Z"
            fill="var(--bg-archive)"
            stroke="var(--border-strong)"
            stroke-width="1.2"
            class="opacity-80"
          />
          <text x="682" y="465" font-size="9" fill="var(--ink-muted)" font-family="monospace">台</text>

          <!-- 海南岛轮廓 -->
          <path
            d="M 510 525 C 525 520 535 530 530 545 C 520 550 510 545 505 535 Z"
            fill="var(--bg-archive)"
            stroke="var(--border-strong)"
            stroke-width="1.2"
            class="opacity-80"
          />

          <!-- 南海诸岛标准附框 (硬约束：南海诸岛及十段线插框) -->
          <g transform="translate(680, 460)">
            <!-- 插框边框 -->
            <rect
              x="0"
              y="0"
              width="100"
              height="110"
              fill="var(--bg-archive)"
              stroke="var(--border-strong)"
              stroke-width="1"
            />
            <text x="12" y="16" font-size="8" fill="var(--ink-muted)" font-family="monospace">南海诸岛</text>
            <!-- 十段线虚线示意弧 -->
            <path
              d="M 20 28 Q 50 35 80 40 T 70 85 T 45 100 T 25 80"
              fill="none"
              stroke="var(--border-strong)"
              stroke-width="0.8"
              stroke-dasharray="2,2"
            />
            <!-- 诸岛小岛礁印记点 (东沙、西沙、中沙、南沙、钓鱼岛附属) -->
            <circle cx="55" cy="45" r="1.5" fill="var(--ink-muted)" />
            <circle cx="45" cy="60" r="1.5" fill="var(--ink-muted)" />
            <circle cx="60" cy="65" r="1.5" fill="var(--ink-muted)" />
            <circle cx="48" cy="85" r="1.5" fill="var(--ink-muted)" />
          </g>

          <!-- 钓鱼岛及其附属岛屿标记 -->
          <circle cx="705" cy="430" r="1.5" fill="var(--ink-muted)" />
          <text x="712" y="433" font-size="7" fill="var(--ink-muted)" font-family="monospace">钓鱼岛</text>

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
    />

  </div>
</template>
