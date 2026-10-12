<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { Compass, ChevronRight, MapPin } from 'lucide-vue-next'
import { fetchFootprintsAtlas } from '../utils/api'
import { CHINA_CITIES } from '../utils/cities'
import type { AtlasCitySummary } from '../types'

const emit = defineEmits<{
  (e: 'navigateAtlas'): void
  (e: 'selectCity', city: { code: string; name: string }): void
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

const loadMiniAtlas = async () => {
  try {
    isLoading.value = true
    const res = await fetchFootprintsAtlas()
    atlasData.value = res
  } catch (err) {
    console.warn('Failed to load mini atlas summary:', err)
  } finally {
    isLoading.value = false
  }
}

const cityCoordMap = computed(() => {
  const map = new Map<string, { x: number; y: number }>()
  for (const c of CHINA_CITIES) {
    map.set(c.code, { x: c.x, y: c.y })
  }
  return map
})

const litPoints = computed(() => {
  return (atlasData.value.cities || []).map((c) => {
    const coords = cityCoordMap.value.get(c.city_code) || { x: 450, y: 280 }
    return {
      ...c,
      shortName: c.city_name.replace(/市|地区|自治州|特别行政区|盟/g, '') || c.city_name,
      x: coords.x,
      y: coords.y,
    }
  })
})

const recentCities = computed(() => {
  return litPoints.value.slice(0, 6)
})

onMounted(() => {
  loadMiniAtlas()
})
</script>

<template>
  <div class="space-y-4">
    <!-- 微缩经纬星野画布 (高度可控、视差自洽) -->
    <div
      class="bg-[var(--bg-archive)] border border-[var(--border-subtle)] rounded-xs p-3 sm:p-5 relative overflow-hidden group cursor-pointer"
      @click="emit('navigateAtlas')"
      title="点击进入山川行迹全屏星野与典藏票根"
    >
      <div class="flex items-center justify-between pb-2 mb-2 border-b border-[var(--border-subtle)]/60 text-xs font-serif-editorial text-[var(--ink-secondary)]">
        <div class="flex items-center gap-1.5">
          <Compass class="w-3.5 h-3.5 text-[var(--accent-warm)]" />
          <span>山川星宿概览 · 已驻足 {{ atlasData.total_cities }} 座城市 ({{ atlasData.total_footprints }} 次履迹)</span>
        </div>
        <span class="text-[11px] font-serif-editorial text-[var(--ink-muted)] flex items-center gap-0.5 group-hover:text-[var(--ink-primary)] transition-colors">
          <span>全屏视界</span>
          <ChevronRight class="w-3 h-3 group-hover:translate-x-0.5 transition-transform" />
        </span>
      </div>

      <div class="relative w-full aspect-[21/9] sm:aspect-[24/9] flex items-center justify-center">
        <svg viewBox="60 30 720 380" class="w-full h-full select-none pointer-events-none">
          <defs>
            <filter id="mini-glow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur in="SourceGraphic" stdDeviation="3" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          <!-- 经纬度极细虚线 -->
          <g stroke="var(--border-subtle)" stroke-width="0.5" stroke-dasharray="3 4" opacity="0.45">
            <line x1="200" y1="30" x2="200" y2="400" />
            <line x1="340" y1="30" x2="340" y2="400" />
            <line x1="480" y1="30" x2="480" y2="400" />
            <line x1="620" y1="30" x2="620" y2="400" />
            <line x1="60" y1="120" x2="780" y2="120" />
            <line x1="60" y1="210" x2="780" y2="210" />
            <line x1="60" y1="300" x2="780" y2="300" />
          </g>

          <!-- 全量 375 城市星尘基座 -->
          <g fill="var(--ink-muted)" opacity="0.14">
            <circle
              v-for="city in CHINA_CITIES"
              :key="city.code"
              :cx="city.x"
              :cy="city.y"
              r="1"
            />
          </g>

          <!-- 点亮城市星宿节点 -->
          <g>
            <g v-for="c in litPoints" :key="c.city_code">
              <circle
                :cx="c.x"
                :cy="c.y"
                :r="c.visit_count >= 3 ? 9 : 6.5"
                fill="none"
                :stroke="c.visit_count >= 3 ? '#b94a3b' : c.visit_count === 2 ? 'var(--accent-moss)' : 'var(--ink-secondary)'"
                stroke-width="1"
                opacity="0.6"
                filter="url(#mini-glow)"
              />
              <circle
                :cx="c.x"
                :cy="c.y"
                :r="c.visit_count >= 3 ? 4 : 3"
                :fill="c.visit_count >= 3 ? '#b94a3b' : c.visit_count === 2 ? 'var(--accent-moss)' : 'var(--ink-primary)'"
              />
              <text
                :x="c.x + 6"
                :y="c.y + 3"
                font-size="9"
                font-family="serif"
                fill="var(--ink-primary)"
                class="font-medium"
                style="paint-order: stroke; stroke: var(--bg-archive); stroke-width: 2.5px; stroke-linejoin: round;"
              >
                {{ c.shortName }}
              </text>
            </g>
          </g>
        </svg>
      </div>
    </div>

    <!-- 最近踏足城市纸签流 -->
    <div v-if="recentCities.length > 0" class="flex flex-wrap items-center gap-2 pt-1 font-mono-archive text-xs">
      <span class="text-[11px] text-[var(--ink-muted)] mr-1">最近履迹：</span>
      <button
        v-for="c in recentCities"
        :key="c.city_code"
        @click="emit('navigateAtlas')"
        class="px-2 py-0.5 rounded-xs bg-[var(--bg-subtle)]/70 border border-[var(--border-subtle)] hover:border-[var(--ink-primary)] text-[11px] text-[var(--ink-secondary)] hover:text-[var(--ink-primary)] inline-flex items-center gap-1 cursor-pointer transition-colors"
      >
        <MapPin class="w-3 h-3 text-[var(--accent-warm)]" />
        <span>{{ c.city_name }}</span>
        <span class="text-[10px] text-[var(--ink-muted)]">({{ c.visit_count }}次)</span>
      </button>
      <button
        @click="emit('navigateAtlas')"
        class="text-[11px] text-[var(--accent-warm)] hover:underline ml-auto cursor-pointer"
      >
        查看全部 {{ atlasData.total_cities }} 城票根与回忆抽屉 ↗
      </button>
    </div>
  </div>
</template>
