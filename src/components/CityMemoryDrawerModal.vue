<script setup lang="ts">
import { ref, watch } from 'vue'
import {
  X,
  MapPin,
} from 'lucide-vue-next'
import { fetchCityMemoryDrawer } from '../utils/api'
import { formatMoney } from '../utils/format'
import type { CityMemoryDrawerData } from '../types'

const props = defineProps<{
  isOpen: boolean
  cityCode: string
  cityName?: string
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'selectEntry', entry: any): void
}>()

const drawerData = ref<CityMemoryDrawerData | null>(null)
const isLoading = ref(false)
const errorMsg = ref('')

const loadData = async (code: string) => {
  if (!code) return
  try {
    isLoading.value = true
    errorMsg.value = ''
    const data = await fetchCityMemoryDrawer(code)
    drawerData.value = data
  } catch (err: any) {
    errorMsg.value = err.message || '加载城市回忆失败'
  } finally {
    isLoading.value = false
  }
}

watch(
  () => props.cityCode,
  (code) => {
    if (code) {
      loadData(code)
    }
  },
  { immediate: true }
)

const formatDate = (dateStr?: string) => {
  if (!dateStr) return ''
  return dateStr.slice(0, 10).replace(/-/g, '.')
}
</script>

<template>
  <div
    v-if="isOpen"
    class="fixed inset-0 z-50 flex justify-end bg-[var(--ink-primary)]/40 backdrop-blur-2xs animate-in fade-in duration-200"
    @click.self="emit('close')"
  >
    <!-- 侧滑纸本抽屉 (桌面端从右侧滑出，移动端占满屏) -->
    <div
      class="w-full sm:max-w-lg bg-[var(--bg-archive)] border-l border-[var(--border-subtle)] h-full overflow-y-auto p-6 sm:p-8 space-y-8 text-left shadow-2xl animate-in slide-in-from-right duration-250"
    >
      <!-- 标头与关闭 -->
      <div class="flex items-start justify-between pb-4 border-b border-[var(--border-subtle)]">
        <div class="space-y-1">
          <div class="flex items-center gap-2">
            <MapPin class="w-5 h-5 text-[var(--accent-warm)]" />
            <h2 class="font-serif-editorial text-2xl sm:text-3xl font-medium text-[var(--ink-primary)]">
              {{ drawerData?.city_name || cityName || '城市回忆' }}
            </h2>
          </div>
          <span class="text-xs font-mono-archive text-[var(--ink-muted)]">
            行政区划代码: {{ cityCode }}
          </span>
        </div>

        <button
          @click="emit('close')"
          class="text-[var(--ink-muted)] hover:text-[var(--ink-primary)] p-1 cursor-pointer transition-colors"
        >
          <X class="w-4 h-4" />
        </button>
      </div>

      <!-- 载入中与错误 -->
      <div v-if="isLoading" class="text-xs font-mono-archive text-[var(--ink-muted)] py-16 text-center">
        正在展开城市回忆抽屉...
      </div>

      <div v-else-if="errorMsg" class="p-3 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800/40 text-red-700 dark:text-red-300 text-xs font-mono-archive rounded-xs">
        {{ errorMsg }}
      </div>

      <!-- 四大递进章节 -->
      <div v-else-if="drawerData" class="space-y-8">
        
        <!-- 第一章：履迹简志 (Visits Summary) -->
        <section class="space-y-3 p-4 bg-[var(--bg-subtle)]/40 border border-[var(--border-subtle)] rounded-xs font-mono-archive text-xs">
          <div class="flex items-center justify-between pb-2 border-b border-[var(--border-subtle)]/60">
            <span class="text-[11px] text-[var(--ink-muted)]">CHAPTER I · 履迹简志</span>
            <span class="px-2 py-0.5 bg-[var(--ink-primary)] text-[var(--bg-archive)] rounded-xs text-[10px] font-medium">
              累计到访 {{ drawerData.visit_stats.total_visits }} 次
            </span>
          </div>

          <div class="grid grid-cols-2 gap-3 pt-1">
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

          <!-- 足迹履历列表 -->
          <div v-if="drawerData.footprints.length > 0" class="pt-2 space-y-1.5 border-t border-[var(--border-subtle)]/40">
            <div
              v-for="fp in drawerData.footprints"
              :key="fp.id"
              class="text-[11px] text-[var(--ink-secondary)] flex items-start gap-1.5"
            >
              <span class="text-[var(--ink-muted)] shrink-0">{{ formatDate(fp.visited_at) }}:</span>
              <span class="font-serif-editorial italic">{{ fp.note || '到访打卡' }}</span>
            </div>
          </div>
        </section>

        <!-- 第二章：菲林画廊 (Film Gallery) -->
        <section class="space-y-3">
          <div class="flex items-center justify-between">
            <span class="text-xs font-mono-archive text-[var(--ink-muted)] uppercase tracking-wider">
              CHAPTER II · 菲林画廊
            </span>
          </div>

          <!-- 横向滚动相片流 -->
          <div
            v-if="drawerData.footprints.some(f => f.attachments && f.attachments.length > 0)"
            class="flex items-center gap-3 overflow-x-auto pb-2"
          >
            <template v-for="f in drawerData.footprints" :key="f.id">
              <div
                v-for="att in f.attachments"
                :key="att.id"
                class="w-32 h-32 shrink-0 bg-[var(--bg-subtle)] border border-[var(--border-subtle)] rounded-xs overflow-hidden"
              >
                <img
                  :src="att.url"
                  loading="lazy"
                  class="w-full h-full object-cover"
                  alt="城市菲林"
                />
              </div>
            </template>
          </div>
          <p v-else class="text-xs font-serif-editorial text-[var(--ink-muted)] italic">
            在这座城市暂未收录影像胶片。
          </p>
        </section>

        <!-- 第三章：散页随笔 (City Chronicles) -->
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
            尚未关联发生在这座城市的生活随笔。
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
              <p v-if="entry.content" class="font-serif-editorial text-xs text-[var(--ink-secondary)] line-clamp-2 leading-relaxed">
                {{ entry.content }}
              </p>
            </div>
          </div>
        </section>

        <!-- 第四章：城市账单光谱 (City Ledger Breakdown) -->
        <section class="space-y-3">
          <div class="flex items-center justify-between">
            <span class="text-xs font-mono-archive text-[var(--ink-muted)] uppercase tracking-wider">
              CHAPTER IV · 城市账单光谱
            </span>
            <span class="text-xs font-mono-archive font-medium text-[var(--ink-primary)]">
              共 ¥{{ formatMoney(drawerData.ledger_summary.total_spent) }}
            </span>
          </div>

          <div v-if="drawerData.ledger_summary.transaction_count === 0" class="text-xs font-serif-editorial text-[var(--ink-muted)] italic">
            暂无关联此城市的消费账目。
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
  </div>
</template>
