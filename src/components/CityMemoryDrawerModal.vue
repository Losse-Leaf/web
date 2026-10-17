<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import {
  X,
  MapPin,
  ArrowLeft,
  Plus,
  PenLine,
  Pencil,
  Trash2,
} from 'lucide-vue-next'
import { fetchCityMemoryDrawer, fetchProvinceMemoryDrawer, getAdminToken, deleteFootprint } from '../utils/api'
import { formatMoney } from '../utils/format'
import { audio } from '../utils/audio'
import { askConfirm, showAlert } from '../composables/useConfirm'
import type { CityMemoryDrawerData, ProvinceMemoryDrawerData, Attachment } from '../types'

const props = defineProps<{
  isOpen: boolean
  adcode?: string
  provinceName?: string
  cityCode?: string
  cityName?: string
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'refresh'): void
  (e: 'selectEntry', entry: any): void
  (e: 'addEntryInCity', city: { code: string; name: string }): void
  (e: 'addFootprintInCity', city: { code: string; name: string }): void
  (e: 'editFootprint', footprint: any): void
}>()

const isAdmin = computed(() => Boolean(getAdminToken()))
const drawerData = ref<(CityMemoryDrawerData | ProvinceMemoryDrawerData) | null>(null)
const isLoading = ref(false)
const errorMsg = ref('')

// 支持从省级抽屉第一章「到访城市清单」点击下钻至对应城市抽屉，并支持一键返回省级抽屉 (RC-93)
const drilldownCityCode = ref('')
const drilldownCityName = ref('')
const activeLightboxUrl = ref('')

const effectiveCityCode = computed(() => drilldownCityCode.value || props.cityCode || '')
const effectiveAdcode = computed(() => (effectiveCityCode.value ? '' : props.adcode || ''))

// 汇总该城市/省份 footprints 与 entries 的全部图片附件并去重 (RC-58)
const photos = computed<Attachment[]>(() => {
  if (!drawerData.value) return []
  const seen = new Set<string>()
  const list: Attachment[] = []

  const addAtt = (att: Attachment) => {
    if (!att || !att.url) return
    const key = att.id ? `id:${att.id}` : `url:${att.url}`
    if (seen.has(key)) return
    seen.add(key)
    list.push(att)
  }

  for (const fp of drawerData.value.footprints || []) {
    for (const att of fp.attachments || []) {
      addAtt(att)
    }
  }
  for (const entry of drawerData.value.entries || []) {
    for (const att of entry.attachments || []) {
      addAtt(att)
    }
  }
  return list
})

const loadData = async () => {
  try {
    isLoading.value = true
    errorMsg.value = ''
    if (effectiveCityCode.value) {
      const data = await fetchCityMemoryDrawer(effectiveCityCode.value)
      drawerData.value = data
    } else if (effectiveAdcode.value) {
      const data = await fetchProvinceMemoryDrawer(effectiveAdcode.value)
      drawerData.value = data
    }
  } catch (err: any) {
    errorMsg.value = err.message || '加载回忆失败'
  } finally {
    isLoading.value = false
  }
}

watch(
  () => [props.adcode, props.cityCode, props.isOpen],
  () => {
    drilldownCityCode.value = ''
    drilldownCityName.value = ''
    activeLightboxUrl.value = ''
    if (props.isOpen && (props.adcode || props.cityCode)) {
      loadData()
    }
  },
  { immediate: true }
)

const handleSelectCityInProvince = (cityCode: string, cityName: string) => {
  drilldownCityCode.value = cityCode
  drilldownCityName.value = cityName
  loadData()
}

const handleBackToProvince = () => {
  drilldownCityCode.value = ''
  drilldownCityName.value = ''
  loadData()
}

const formatDate = (dateStr?: string) => {
  if (!dateStr) return ''
  return dateStr.slice(0, 10).replace(/-/g, '.')
}

const isProvinceMode = computed(() => {
  return Boolean(!effectiveCityCode.value && effectiveAdcode.value)
})

const displayName = computed(() => {
  if (isProvinceMode.value) {
    if (drawerData.value && 'province_name' in drawerData.value && drawerData.value.province_name) {
      return drawerData.value.province_name
    }
    return props.provinceName || '省份回忆'
  }
  if (drawerData.value && 'city_name' in drawerData.value && drawerData.value.city_name) {
    return drawerData.value.city_name
  }
  return drilldownCityName.value || props.cityName || '城市回忆'
})

const displayCode = computed(() => {
  if (isProvinceMode.value) {
    if (drawerData.value && 'province_adcode' in drawerData.value && drawerData.value.province_adcode) {
      return drawerData.value.province_adcode
    }
    return effectiveAdcode.value
  }
  if (drawerData.value && 'city_code' in drawerData.value && drawerData.value.city_code) {
    return drawerData.value.city_code
  }
  return effectiveCityCode.value
})

const citiesSummary = computed(() => {
  if (!drawerData.value || !isProvinceMode.value) return []
  if ('visited_cities' in drawerData.value && drawerData.value.visited_cities) {
    return drawerData.value.visited_cities
  }
  if ('cities_summary' in drawerData.value && drawerData.value.cities_summary) {
    return drawerData.value.cities_summary
  }
  return []
})

const totalCitiesCount = computed(() => {
  if (!drawerData.value) return 0
  if ('visit_stats' in drawerData.value && drawerData.value.visit_stats && 'city_count' in drawerData.value.visit_stats) {
    const cc = (drawerData.value.visit_stats as any).city_count
    if (typeof cc === 'number' && cc > 0) return cc
  }
  if ('total_cities' in drawerData.value && typeof drawerData.value.total_cities === 'number' && drawerData.value.total_cities > 0) {
    return drawerData.value.total_cities
  }
  return citiesSummary.value.length
})

const handleEditFootprint = (fp: any) => {
  emit('editFootprint', fp)
}

const handleDeleteFootprint = async (fp: any) => {
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
    if (drawerData.value && 'footprints' in drawerData.value && Array.isArray(drawerData.value.footprints)) {
      drawerData.value.footprints = drawerData.value.footprints.filter((f: any) => f.id !== fp.id)
    }
    emit('refresh')
  } catch (err: any) {
    showAlert({ title: '删除失败', message: err.message || '网络连接异常', danger: true })
  }
}
</script>

<template>
  <div
    v-if="isOpen"
    class="fixed inset-0 z-50 flex justify-end bg-[var(--ink-primary)]/40 backdrop-blur-2xs animate-in fade-in duration-200"
    @click.self="emit('close')"
  >
    <!-- 侧滑纸本抽屉 (桌面端从右侧滑出，移动端占满屏，集成安全区域缓冲 RC-93 / §5.12) -->
    <div
      class="w-full sm:max-w-lg bg-[var(--bg-archive)] border-l border-[var(--border-subtle)] h-full overflow-y-auto p-6 sm:p-8 space-y-8 text-left shadow-2xl animate-in slide-in-from-right duration-250 pb-[max(2.5rem,env(safe-area-inset-bottom,2.5rem))]"
    >
      <!-- 标头与关闭 -->
      <div class="flex items-start justify-between pb-4 border-b border-[var(--border-subtle)]">
        <div class="space-y-1.5">
          <!-- 若从省级抽屉下钻至城市抽屉，提供返回省级抽屉按钮 -->
          <button
            v-if="drilldownCityCode && props.adcode"
            @click="handleBackToProvince"
            class="inline-flex items-center gap-1 text-[11px] font-mono-archive text-[var(--accent-warm)] hover:underline cursor-pointer mb-1"
          >
            <ArrowLeft class="w-3 h-3" />
            <span>返回 {{ props.provinceName || '省级' }} 回忆总览</span>
          </button>

          <div class="flex items-center gap-2">
            <MapPin class="w-5 h-5 text-[var(--accent-warm)]" />
            <h2 class="font-serif-editorial text-2xl sm:text-3xl font-medium text-[var(--ink-primary)]">
              {{ displayName }}
            </h2>
            <span class="px-1.5 py-0.5 text-[10px] font-mono-archive border border-[var(--border-subtle)] rounded-xs text-[var(--ink-muted)]">
              {{ isProvinceMode ? '省级抽屉' : '城市抽屉' }}
            </span>
          </div>
          <span class="text-xs font-mono-archive text-[var(--ink-muted)] block">
            {{ isProvinceMode ? '省级行政区划代码' : '市级行政区划代码' }}: {{ displayCode }}
          </span>

          <!-- 快捷行动入口：在此城写随笔 / 补录足迹 (闭环链路) -->
          <div v-if="isAdmin && !isProvinceMode" class="flex flex-wrap items-center gap-2 pt-2">
            <button
              @click="emit('addEntryInCity', { code: displayCode, name: displayName })"
              class="px-2.5 py-1 bg-[var(--bg-subtle)] border border-[var(--border-subtle)] hover:border-[var(--ink-primary)] rounded-xs text-[11px] font-serif-editorial text-[var(--ink-primary)] flex items-center gap-1 cursor-pointer transition-colors"
              title="为此城市撰写新的散页随笔"
            >
              <PenLine class="w-3 h-3 text-[var(--accent-warm)]" />
              <span>在此城写随笔</span>
            </button>
            <button
              @click="emit('addFootprintInCity', { code: displayCode, name: displayName })"
              class="px-2.5 py-1 bg-[var(--bg-subtle)] border border-[var(--border-subtle)] hover:border-[var(--ink-primary)] rounded-xs text-[11px] font-serif-editorial text-[var(--ink-primary)] flex items-center gap-1 cursor-pointer transition-colors"
              title="为此城市补录一段漫游足迹"
            >
              <Plus class="w-3 h-3 text-[var(--accent-moss)]" />
              <span>补录此城足迹</span>
            </button>
          </div>
        </div>

        <button
          @click="emit('close')"
          class="text-[var(--ink-muted)] hover:text-[var(--ink-primary)] p-1 cursor-pointer transition-colors"
          title="关闭抽屉"
        >
          <X class="w-4 h-4" />
        </button>
      </div>

      <!-- 载入中与错误 -->
      <div v-if="isLoading" class="text-xs font-mono-archive text-[var(--ink-muted)] py-16 text-center">
        正在展开{{ isProvinceMode ? '省份' : '城市' }}回忆抽屉...
      </div>

      <div v-else-if="errorMsg" class="p-3 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800/40 text-red-700 dark:text-red-300 text-xs font-mono-archive rounded-xs">
        {{ errorMsg }}
      </div>

      <!-- 四大递进章节 (RC-93 省市两级四重聚合) -->
      <div v-else-if="drawerData" class="space-y-8">
        
        <!-- 第一章：履迹简志 (Visits Summary) -->
        <section class="space-y-3 p-4 bg-[var(--bg-subtle)]/40 border border-[var(--border-subtle)] rounded-xs font-mono-archive text-xs">
          <div class="flex items-center justify-between pb-2 border-b border-[var(--border-subtle)]/60">
            <span class="text-[11px] text-[var(--ink-muted)]">CHAPTER I · 履迹简志</span>
            <span class="px-2 py-0.5 bg-[var(--ink-primary)] text-[var(--bg-archive)] rounded-xs text-[10px] font-medium">
              <template v-if="isProvinceMode">
                去过 {{ totalCitiesCount }} 座城市 · 累计到访 {{ drawerData.visit_stats.total_visits }} 次
              </template>
              <template v-else>
                累计到访 {{ drawerData.visit_stats.total_visits }} 次
              </template>
            </span>
          </div>

          <!-- 省级模式下的去过城市清单（点击可下钻至该城市的独立回忆抽屉 RC-93） -->
          <div v-if="isProvinceMode && citiesSummary.length > 0" class="pt-1 pb-1">
            <span class="text-[10px] text-[var(--ink-muted)] block mb-1.5">
              到访城市清单 (点击城市切换至市级回忆抽屉 ↗)
            </span>
            <div class="flex flex-wrap gap-1.5">
              <button
                v-for="c in citiesSummary"
                :key="c.city_code"
                type="button"
                @click="handleSelectCityInProvince(c.city_code, c.city_name)"
                class="px-2 py-0.5 rounded-xs bg-[var(--bg-archive)] border border-[var(--border-subtle)] hover:border-[var(--ink-primary)] text-[11px] text-[var(--ink-secondary)] inline-flex items-center gap-1 cursor-pointer transition-colors"
              >
                <span class="font-medium text-[var(--ink-primary)]">{{ c.city_name }}</span>
                <span class="text-[10px] text-[var(--ink-muted)]">({{ c.visit_count }}次)</span>
              </button>
            </div>
          </div>

          <div class="grid grid-cols-2 gap-3 pt-1 border-t border-[var(--border-subtle)]/40">
            <div>
              <span class="text-[var(--ink-muted)] block text-[10px]">首次探访</span>
              <span class="font-serif-editorial text-sm font-medium text-[var(--ink-primary)]">
                {{ formatDate(drawerData.visit_stats.first_visited_at) || '未记录' }}
              </span>
            </div>
            <div>
              <span class="text-[var(--ink-muted)] block text-[10px]">最近到访</span>
              <span class="font-serif-editorial text-sm font-medium text-[var(--ink-primary)]">
                {{ formatDate(drawerData.visit_stats.latest_visited_at) || '未记录' }}
              </span>
            </div>
          </div>

          <!-- 足迹履历列表 (支持多日行程跨度与多记录聚合统计) -->
          <div v-if="drawerData.footprints.length > 0" class="pt-2 space-y-2 border-t border-[var(--border-subtle)]/40">
            <div
              v-for="fp in drawerData.footprints"
              :key="fp.id"
              class="text-[11px] text-[var(--ink-secondary)] p-2 rounded-xs bg-[var(--bg-archive)]/60 border border-[var(--border-subtle)]/60 space-y-1"
            >
              <div class="flex flex-wrap items-center justify-between gap-1.5">
                <div class="flex items-center gap-1.5">
                  <span class="text-[var(--ink-muted)] font-mono-archive">
                    {{ formatDate(fp.visited_at) }}<template v-if="fp.departed_at && formatDate(fp.departed_at) !== formatDate(fp.visited_at)"> ~ {{ formatDate(fp.departed_at) }}</template>
                  </span>
                  <button
                    v-if="isProvinceMode && fp.city_name && fp.city_code"
                    type="button"
                    @click="handleSelectCityInProvince(fp.city_code, fp.city_name)"
                    class="text-[var(--accent-warm)] hover:underline shrink-0 font-medium cursor-pointer"
                  >
                    [{{ fp.city_name }}]
                  </button>
                  <span v-if="fp.title" class="font-serif-editorial font-medium text-[var(--ink-primary)]">
                    {{ fp.title }}
                  </span>
                </div>
                <div class="flex items-center gap-1.5 text-[10px] font-mono-archive">
                  <span v-if="(fp.entries_count || 0) > 0" class="px-1.5 py-0.2 rounded-xs bg-[var(--bg-subtle)] text-[var(--ink-secondary)] border border-[var(--border-subtle)]">
                    {{ fp.entries_count }} 篇游记
                  </span>
                  <span v-if="isAdmin && (fp.total_spent || 0) > 0" class="px-1.5 py-0.2 rounded-xs bg-[var(--accent-warm)]/10 text-[var(--accent-warm)] border border-[var(--accent-warm)]/30">
                    ¥{{ formatMoney(fp.total_spent || 0) }}
                  </span>
                  <button
                    v-if="isAdmin"
                    type="button"
                    @click.stop="handleEditFootprint(fp)"
                    class="text-[var(--ink-muted)] hover:text-[var(--ink-primary)] p-0.5 rounded cursor-pointer transition-colors"
                    title="编辑足迹票根"
                  >
                    <Pencil class="w-3 h-3" />
                  </button>
                  <button
                    v-if="isAdmin"
                    type="button"
                    @click.stop="handleDeleteFootprint(fp)"
                    class="text-[var(--ink-muted)] hover:text-[var(--accent-warm)] p-0.5 rounded cursor-pointer transition-colors"
                    title="删除足迹票根"
                  >
                    <Trash2 class="w-3 h-3" />
                  </button>
                </div>
              </div>
              <p v-if="fp.note" class="font-serif-editorial italic text-[var(--ink-secondary)]">
                {{ fp.note }}
              </p>
            </div>
          </div>
          <p v-else class="text-[11px] font-serif-editorial text-[var(--ink-muted)] italic pt-1">
            该{{ isProvinceMode ? '省份' : '城市' }}暂未录入打卡足迹。
          </p>
        </section>

        <!-- 第二章：菲林画廊 (Film Gallery) -->
        <section class="space-y-3">
          <div class="flex items-center justify-between">
            <span class="text-xs font-mono-archive text-[var(--ink-muted)] uppercase tracking-wider">
              CHAPTER II · 菲林画廊
            </span>
            <span v-if="photos.length > 0" class="text-xs font-mono-archive text-[var(--ink-muted)]">
              {{ photos.length }} 张
            </span>
          </div>

          <!-- 横向滚动相片流（支持点击打开全屏暗房底片灯箱） -->
          <div
            v-if="photos.length > 0"
            class="flex items-center gap-3 overflow-x-auto pb-2"
          >
            <button
              v-for="att in photos"
              :key="att.id || att.url"
              type="button"
              @click="activeLightboxUrl = att.url"
              class="w-32 h-32 shrink-0 bg-[var(--bg-subtle)] border border-[var(--border-subtle)] hover:border-[var(--ink-primary)] rounded-xs overflow-hidden cursor-zoom-in transition-colors"
            >
              <img
                :src="att.url"
                loading="lazy"
                class="w-full h-full object-cover editorial-image"
                alt="旅途菲林"
              />
            </button>
          </div>
          <p v-else class="text-xs font-serif-editorial text-[var(--ink-muted)] italic">
            暂未收录影像胶片。
          </p>
        </section>

        <!-- 第三章：散页随笔 (Chronicles) -->
        <section class="space-y-3">
          <div class="flex items-center justify-between">
            <span class="text-xs font-mono-archive text-[var(--ink-muted)] uppercase tracking-wider">
              CHAPTER III · 散页随笔
            </span>
            <span class="text-xs font-mono-archive text-[var(--ink-muted)]">
              {{ drawerData.entries.length }} 篇
            </span>
          </div>

          <div v-if="drawerData.entries.length === 0" class="text-xs font-serif-editorial text-[var(--ink-muted)] italic">
            尚未关联相关的散页生活随笔。
          </div>

          <div v-else class="space-y-2.5">
            <div
              v-for="entry in drawerData.entries"
              :key="entry.id"
              @click="emit('selectEntry', entry)"
              class="p-3 bg-[var(--bg-subtle)]/30 border border-[var(--border-subtle)] hover:border-[var(--ink-primary)] rounded-xs cursor-pointer transition-colors space-y-1"
            >
              <div class="flex items-center justify-between font-mono-archive text-[10px] text-[var(--ink-muted)]">
                <span>{{ formatDate(entry.occurred_at) }}</span>
                <span>{{ entry.type }}</span>
              </div>
              <h4 class="font-serif-editorial text-sm font-medium text-[var(--ink-primary)]">
                {{ entry.title }}
              </h4>
              <p v-if="entry.content || (entry as any).summary" class="font-serif-editorial text-xs text-[var(--ink-secondary)] line-clamp-2 leading-relaxed">
                {{ entry.content || (entry as any).summary }}
              </p>
            </div>
          </div>
        </section>

        <!-- 第四章：账单光谱 (Ledger Breakdown，仅主理人可见 RC-57 / RC-93) -->
        <section v-if="isAdmin" class="space-y-3">
          <div class="flex items-center justify-between">
            <span class="text-xs font-mono-archive text-[var(--ink-muted)] uppercase tracking-wider">
              CHAPTER IV · {{ isProvinceMode ? '省份账单光谱' : '城市账单光谱' }}
            </span>
            <span class="text-xs font-mono-archive font-medium text-[var(--ink-primary)]">
              共 ¥{{ formatMoney(drawerData.ledger_summary.total_spent) }}
            </span>
          </div>

          <div v-if="drawerData.ledger_summary.transaction_count === 0" class="text-xs font-serif-editorial text-[var(--ink-muted)] italic">
            暂无关联消费账目。
          </div>

          <div v-else class="space-y-2">
            <div class="grid grid-cols-2 gap-2 font-mono-archive text-xs">
              <div
                v-for="cat in drawerData.ledger_summary.categories"
                :key="cat.name"
                class="p-2.5 bg-[var(--bg-subtle)]/30 border border-[var(--border-subtle)] rounded-xs flex items-center justify-between"
              >
                <span class="text-[var(--ink-muted)]">{{ cat.name }}</span>
                <span class="font-medium text-[var(--ink-primary)]">¥{{ formatMoney(cat.amount) }}</span>
              </div>
            </div>
          </div>
        </section>

      </div>
    </div>

    <!-- 全屏暗房底片灯箱 (点击第二章相片唤起) -->
    <div
      v-if="activeLightboxUrl"
      class="fixed inset-0 z-60 flex items-center justify-center bg-black/85 p-4 cursor-zoom-out"
      @click.stop="activeLightboxUrl = ''"
    >
      <img
        :src="activeLightboxUrl"
        class="max-w-full max-h-[90vh] object-contain rounded-xs shadow-2xl"
        alt="旅途底片大图"
      />
    </div>
  </div>
</template>
