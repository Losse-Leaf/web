<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import { Stamp, ChevronRight, MapPin } from 'lucide-vue-next'
import { fetchFootprintsAtlas } from '../utils/api'
import { CHINA_CITIES } from '../utils/cities'
import { ALL_PROVINCES_ORDERED, PROVINCE_SHORT_MAP } from '../utils/atlasHelpers'
import type { AtlasCitySummary } from '../types'

const props = defineProps<{
  refreshTrigger?: number
}>()

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

const cityProvinceMap = computed(() => {
  const map = new Map<string, string>()
  for (const c of CHINA_CITIES) {
    map.set(c.code, c.province)
  }
  return map
})

const litPoints = computed(() => {
  return (atlasData.value.cities || []).map((c) => {
    const province = cityProvinceMap.value.get(c.city_code) || '其他'
    return {
      ...c,
      province,
      shortName: c.city_name.replace(/市|地区|自治州|特别行政区|盟/g, '') || c.city_name,
    }
  })
})

const provinceStatsMap = computed(() => {
  const map = new Map<string, { cityCount: number; visitCount: number }>()
  for (const c of litPoints.value) {
    const cur = map.get(c.province) || { cityCount: 0, visitCount: 0 }
    cur.cityCount += 1
    cur.visitCount += c.visit_count || 1
    map.set(c.province, cur)
  }
  return map
})

const miniProvinceSeals = computed(() => {
  return ALL_PROVINCES_ORDERED.map((prov) => {
    const stat = provinceStatsMap.value.get(prov)
    return {
      name: prov,
      shortName: PROVINCE_SHORT_MAP[prov] || prov.slice(0, 1),
      isLit: Boolean(stat && stat.cityCount > 0),
      cityCount: stat?.cityCount || 0,
      visitCount: stat?.visitCount || 0,
    }
  })
})

const litProvinceCount = computed(() => {
  return miniProvinceSeals.value.filter((p) => p.isLit).length
})

const recentCities = computed(() => {
  return litPoints.value.slice(0, 6)
})

watch(
  () => props.refreshTrigger,
  () => {
    loadMiniAtlas()
  }
)

onMounted(() => {
  loadMiniAtlas()
})
</script>

<template>
  <div v-if="atlasData.total_footprints > 0" class="space-y-4">
    <!-- 微缩山河印谱 · 三十四省活字印章盘 -->
    <div
      class="bg-[var(--bg-archive)] border border-[var(--border-subtle)] rounded-xs p-4 sm:p-5 relative overflow-hidden group cursor-pointer"
      @click="emit('navigateAtlas')"
    >
      <div class="flex items-center justify-between pb-3 mb-3.5 border-b border-[var(--border-subtle)]/60 text-xs font-serif-editorial text-[var(--ink-secondary)]">
        <div class="flex items-center gap-1.5">
          <Stamp class="w-3.5 h-3.5 text-[#b94a3b]" />
          <span>
            山河印谱概览 · 已钤印 {{ litProvinceCount }} / 34 省区 · {{ atlasData.total_cities }} 座城邑 ({{ atlasData.total_footprints }} 次履迹)
          </span>
        </div>
        <span class="text-[11px] font-serif-editorial text-[var(--ink-muted)] flex items-center gap-0.5 group-hover:text-[var(--ink-primary)] transition-colors">
          <span>翻阅全谱与票根</span>
          <ChevronRight class="w-3 h-3 group-hover:translate-x-0.5 transition-transform" />
        </span>
      </div>

      <!-- 34 省活字印章矩阵 (紧凑博古小格) -->
      <div class="grid grid-cols-5 sm:grid-cols-9 md:grid-cols-12 gap-2">
        <div
          v-for="seal in miniProvinceSeals"
          :key="seal.name"
          class="rounded-xs p-2 flex flex-col items-center justify-center text-center transition-all relative"
          :class="
            seal.isLit
              ? 'bg-[#FAF6EE] dark:bg-[#221F1C] border border-[#b94a3b] shadow-2xs'
              : 'bg-[var(--bg-subtle)]/35 border border-dashed border-[var(--border-subtle)]/70 opacity-65'
          "
        >
          <!-- 单字印章 -->
          <div
            class="w-7 h-7 rounded-xs flex items-center justify-center font-serif-editorial font-bold text-sm leading-none mb-1"
            :class="
              seal.isLit
                ? 'bg-[#b94a3b] text-[#FAF7F0] border border-[#b94a3b]'
                : 'text-[var(--ink-muted)]'
            "
          >
            {{ seal.shortName }}
          </div>
          <span
            class="text-[11px] font-serif-editorial truncate max-w-full"
            :class="seal.isLit ? 'text-[var(--ink-primary)] font-medium' : 'text-[var(--ink-muted)]'"
          >
            {{ seal.name }}
          </span>
          <span
            v-if="seal.isLit"
            class="text-[11px] font-mono-archive text-[#b94a3b] leading-tight mt-0.5"
          >
            {{ seal.cityCount }}城
          </span>
          <span
            v-else
            class="text-[11px] font-serif-editorial text-[var(--ink-muted)]/50 leading-tight mt-0.5"
          >
            待访
          </span>
        </div>
      </div>
    </div>

    <!-- 最近踏足城市纸签流 -->
    <div v-if="recentCities.length > 0" class="flex flex-wrap items-center gap-2 pt-1 font-mono-archive text-xs">
      <span class="text-[11px] text-[var(--ink-muted)] mr-1">最近履迹：</span>
      <button
        v-for="c in recentCities"
        :key="c.city_code"
        @click="emit('navigateAtlas')"
        class="px-2 py-0.5 rounded-xs bg-[var(--bg-subtle)]/70 border border-[var(--border-subtle)] hover:border-[#b94a3b] text-[11px] text-[var(--ink-secondary)] hover:text-[var(--ink-primary)] inline-flex items-center gap-1 cursor-pointer transition-colors"
      >
        <MapPin class="w-3 h-3 text-[#b94a3b]" />
        <span>{{ c.city_name }}</span>
        <span class="text-[11px] text-[var(--ink-muted)]">({{ c.visit_count }}次)</span>
      </button>
      <button
        @click="emit('navigateAtlas')"
        class="text-[11px] text-[#b94a3b] hover:underline ml-auto cursor-pointer font-serif-editorial"
      >
        查看全部 {{ atlasData.total_cities }} 城印谱与车票存根 ↗
      </button>
    </div>
  </div>
</template>
