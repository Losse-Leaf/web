<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import {
  X,
  Calendar,
  Compass,
  Printer,
} from 'lucide-vue-next'
import { fetchAnnualAlmanacSummary, getAdminToken } from '../utils/api'
import { formatMoney, getBeijingYear } from '../utils/format'
import type { AnnualAlmanacSummary } from '../types'

const props = defineProps<{
  isOpen: boolean
  initialYear?: number
  availableYears?: number[]
}>()

const emit = defineEmits<{
  (e: 'close'): void
}>()

const isAdmin = computed(() => Boolean(getAdminToken()))
const currentYear = ref(props.initialYear || getBeijingYear())
const summary = ref<AnnualAlmanacSummary | null>(null)
const isLoading = ref(false)
const errorMsg = ref('')

const computedYears = computed(() => {
  const beijingYear = getBeijingYear()
  if (props.availableYears && props.availableYears.length > 0) {
    const minYr = Math.min(...props.availableYears, beijingYear)
    const list: number[] = []
    for (let y = beijingYear; y >= minYr; y--) {
      list.push(y)
    }
    return list
  }
  return [beijingYear]
})

const loadAlmanac = async (year: number) => {
  try {
    isLoading.value = true
    errorMsg.value = ''
    const data = await fetchAnnualAlmanacSummary(year)
    summary.value = data
  } catch (err: any) {
    errorMsg.value = err.message || '加载年度年鉴失败'
  } finally {
    isLoading.value = false
  }
}

watch(
  () => props.initialYear,
  (y) => {
    if (y) {
      currentYear.value = y
      loadAlmanac(y)
    }
  }
)

onMounted(() => {
  loadAlmanac(currentYear.value)
})

const handlePrint = () => {
  window.print()
}

// 格式化日期简写
const formatDate = (dateStr?: string) => {
  if (!dateStr) return ''
  return dateStr.slice(0, 10).replace(/-/g, '.')
}
</script>

<template>
  <div
    v-if="isOpen"
    class="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-[var(--ink-primary)]/50 backdrop-blur-xs animate-in fade-in duration-200"
    @click.self="emit('close')"
  >
    <div
      class="bg-[var(--bg-archive)] border border-[var(--border-subtle)] w-full max-w-4xl rounded-xs shadow-2xl p-6 sm:p-10 max-h-[95vh] overflow-y-auto text-left space-y-12 print:p-0 print:border-none print:shadow-none print:max-h-none print:overflow-visible"
    >
      <!-- 顶栏工具行 (打印模式自动隐藏) -->
      <div class="flex items-center justify-between pb-4 border-b border-[var(--border-subtle)] print:hidden">
        <!-- 年份切换器 (从最初记录的年份到当前年份) -->
        <div class="flex items-center gap-2 overflow-x-auto py-1 font-mono-archive text-sm max-w-md">
          <button
            v-for="yr in computedYears"
            :key="yr"
            type="button"
            @click="currentYear = yr; loadAlmanac(yr)"
            class="px-2.5 py-1 rounded-xs border text-xs transition-colors cursor-pointer whitespace-nowrap"
            :class="currentYear === yr
              ? 'bg-[var(--accent-warm)] text-[var(--bg-paper)] border-[var(--accent-warm)] font-medium shadow-xs'
              : 'bg-transparent text-[var(--ink-secondary)] border-[var(--border-subtle)] hover:border-[var(--ink-primary)] hover:text-[var(--ink-primary)]'"
          >
            {{ yr }} 年
          </button>
        </div>

        <div class="flex items-center gap-2">
          <button
            @click="handlePrint"
            type="button"
            class="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono-archive border border-[var(--border-subtle)] hover:border-[var(--ink-primary)] rounded-xs transition-colors cursor-pointer text-[var(--ink-secondary)] hover:text-[var(--ink-primary)]"
            title="打印或一键导出为 A4 PDF 装订本"
          >
            <Printer class="w-3.5 h-3.5" />
            <span>打印 / 存为 PDF</span>
          </button>

          <button
            @click="emit('close')"
            class="text-[var(--ink-muted)] hover:text-[var(--ink-primary)] p-1 cursor-pointer transition-colors"
          >
            <X class="w-4 h-4" />
          </button>
        </div>
      </div>

      <!-- 载入中与错误提示 -->
      <div v-if="isLoading" class="text-xs font-mono-archive text-[var(--ink-muted)] py-20 text-center">
        正在装订 {{ currentYear }} 年度生活年鉴...
      </div>

      <div v-else-if="errorMsg" class="p-4 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800/40 text-red-700 dark:text-red-300 text-xs font-mono-archive rounded-xs">
        {{ errorMsg }}
      </div>

      <!-- 五幕生活长卷内容区 -->
      <div v-else-if="summary" class="space-y-16 print:space-y-12">

        <!-- 第一幕：岁月卷首 (Prologue) -->
        <section class="space-y-6 pb-12 border-b border-[var(--border-subtle)] page-break-after print:pb-0 print:border-none">
          <div class="space-y-2">
            <span class="text-xs font-mono-archive tracking-widest text-[var(--ink-muted)] uppercase block">
              ACT I · PROLOGUE
            </span>
            <h1 class="font-serif-editorial text-3xl sm:text-4xl text-[var(--ink-primary)] font-medium tracking-tight">
              {{ currentYear }} · 岁月卷首
            </h1>
            <p class="font-serif-editorial text-sm text-[var(--ink-secondary)] leading-relaxed italic pt-1 prose-editorial">
              “将散落于四季的时光纸页，汇聚为一本可随时翻阅的真实生活年鉴。时间是这里唯一的刻度。”
            </p>
          </div>

          <!-- 核心指标印章网格 -->
          <div class="grid grid-cols-2 sm:grid-cols-4 gap-4 p-5 rounded-xs border border-[var(--border-subtle)] bg-[var(--bg-subtle)]/40 font-mono-archive text-xs">
            <div>
              <span class="text-[var(--ink-muted)] block text-[11px]">记录散页</span>
              <span class="font-serif-editorial text-2xl text-[var(--ink-primary)] font-medium">
                {{ summary.prologue.total_entries }} <span class="text-xs text-[var(--ink-muted)]">篇</span>
              </span>
            </div>
            <div>
              <span class="text-[var(--ink-muted)] block text-[11px]">倾注文字</span>
              <span class="font-serif-editorial text-2xl text-[var(--ink-primary)] font-medium">
                {{ (summary.prologue.total_words / 1000).toFixed(1) }}k <span class="text-xs text-[var(--ink-muted)]">字</span>
              </span>
            </div>
            <div>
              <span class="text-[var(--ink-muted)] block text-[11px]">记录天数</span>
              <span class="font-serif-editorial text-2xl text-[var(--ink-primary)] font-medium">
                {{ summary.prologue.active_days }} <span class="text-xs text-[var(--ink-muted)]">天</span>
              </span>
            </div>
            <div>
              <span class="text-[var(--ink-muted)] block text-[11px]">点亮城市</span>
              <span class="font-serif-editorial text-2xl text-[var(--accent-moss)] font-medium">
                {{ summary.atlas.total_cities }} <span class="text-xs text-[var(--ink-muted)]">座</span>
              </span>
            </div>
          </div>

          <!-- 时间跨度注记 -->
          <div v-if="summary.prologue.first_date" class="text-xs font-mono-archive text-[var(--ink-muted)] flex items-center gap-2">
            <Calendar class="w-3.5 h-3.5" />
            <span>这一年：自 {{ formatDate(summary.prologue.first_date) }} 至 {{ formatDate(summary.prologue.last_date) }}</span>
          </div>
        </section>

        <!-- 第二幕：山川行迹 (Atlas) -->
        <section class="space-y-6 pb-12 border-b border-[var(--border-subtle)] page-break-after print:pb-0 print:border-none">
          <div class="space-y-1">
            <span class="text-xs font-mono-archive tracking-widest text-[var(--ink-muted)] uppercase block">
              ACT II · ATLAS
            </span>
            <h2 class="font-serif-editorial text-2xl text-[var(--ink-primary)] font-medium">
              山川行迹 · 丈量空间
            </h2>
            <p class="font-serif-editorial text-xs text-[var(--ink-muted)]">
              这一年踏过的山水与城市记忆。
            </p>
          </div>

          <div v-if="summary.atlas.cities.length === 0" class="text-xs font-mono-archive text-[var(--ink-muted)] py-6">
            本年度暂未录入出行足迹。
          </div>

          <div v-else class="space-y-4">
            <!-- 城市纸签流 -->
            <div class="flex flex-wrap items-center gap-2 font-mono-archive text-xs">
              <span
                v-for="c in summary.atlas.cities"
                :key="c.city_code"
                class="px-2.5 py-1 bg-[var(--bg-subtle)] border border-[var(--border-subtle)] rounded-xs text-[var(--ink-primary)] flex items-center gap-1.5"
              >
                <Compass class="w-3 h-3 text-[var(--accent-warm)]" />
                <span>{{ c.city_name }}</span>
              </span>
            </div>

            <!-- 足迹时间线 -->
            <div class="space-y-2 pt-2">
              <div
                v-for="f in summary.atlas.footprints"
                :key="f.id"
                class="p-3 bg-[var(--bg-subtle)]/30 border border-[var(--border-subtle)] rounded-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2 font-mono-archive text-xs"
              >
                <div class="flex items-center gap-2">
                  <span class="font-serif-editorial text-sm font-medium text-[var(--ink-primary)]">
                    {{ f.city_name }}
                  </span>
                  <span v-if="f.note" class="text-xs font-serif-editorial text-[var(--ink-secondary)] italic">
                    · “{{ f.note }}”
                  </span>
                </div>
                <span class="text-[11px] text-[var(--ink-muted)]">
                  {{ formatDate(f.visited_at) }}
                </span>
              </div>
            </div>
          </div>
        </section>

        <!-- 第三幕：心愿圆满 (Wishes) -->
        <section class="space-y-6 pb-12 border-b border-[var(--border-subtle)] page-break-after print:pb-0 print:border-none">
          <div class="space-y-1">
            <span class="text-xs font-mono-archive tracking-widest text-[var(--ink-muted)] uppercase block">
              ACT III · WISHES
            </span>
            <h2 class="font-serif-editorial text-2xl text-[var(--ink-primary)] font-medium">
              心愿圆满 · 愿景沉淀
            </h2>
            <p class="font-serif-editorial text-xs text-[var(--ink-muted)]">
              好物入手、旅程奔赴与人生阶段突破的回响。
            </p>
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4 rounded-xs border border-[var(--border-subtle)] bg-[var(--bg-subtle)]/40 font-mono-archive text-xs">
            <div>
              <span class="text-[var(--ink-muted)] block text-[11px]">本年度达成心愿</span>
              <span class="font-serif-editorial text-xl text-[var(--accent-moss)] font-medium">
                {{ summary.wishes.fulfilled_count }} 项
              </span>
            </div>
            <div v-if="isAdmin">
              <span class="text-[var(--ink-muted)] block text-[11px]">实际心愿投资总额</span>
              <span class="font-serif-editorial text-xl text-[var(--ink-primary)] font-medium">
                ¥{{ formatMoney(summary.wishes.total_actual) }}
              </span>
            </div>
          </div>

          <div v-if="summary.wishes.wishes.length > 0" class="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div
              v-for="w in summary.wishes.wishes"
              :key="w.id"
              class="p-3 bg-[var(--bg-subtle)]/30 border border-[var(--border-subtle)] rounded-xs space-y-1 font-mono-archive text-xs"
            >
              <div class="flex items-center justify-between">
                <span class="font-serif-editorial text-sm font-medium text-[var(--ink-primary)]">
                  {{ w.title }}
                </span>
                <span v-if="isAdmin" class="text-[11px] text-[var(--accent-moss)] font-medium">
                  ¥{{ formatMoney(w.actual_cost || w.budget) }}
                </span>
              </div>
              <p v-if="w.note" class="text-[11px] font-serif-editorial text-[var(--ink-muted)] italic">
                “{{ w.note }}”
              </p>
            </div>
          </div>
        </section>

        <!-- 第四幕：浮光掠影 (Highlights) -->
        <section
          class="space-y-6 page-break-after print:pb-0 print:border-none"
          :class="isAdmin ? 'pb-12 border-b border-[var(--border-subtle)]' : 'pb-4'"
        >
          <div class="space-y-1">
            <span class="text-xs font-mono-archive tracking-widest text-[var(--ink-muted)] uppercase block">
              ACT IV · HIGHLIGHTS
            </span>
            <h2 class="font-serif-editorial text-2xl text-[var(--ink-primary)] font-medium">
              浮光掠影 · 四季流转
            </h2>
            <p class="font-serif-editorial text-xs text-[var(--ink-muted)]">
              春夏秋冬各抽选一条高光随笔散页。
            </p>
          </div>

          <!-- 四季卡片 -->
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <!-- 春 -->
            <div class="p-4 bg-[var(--bg-subtle)]/30 border border-[var(--border-subtle)] rounded-xs space-y-2">
              <span class="text-[10px] font-mono-archive text-[var(--accent-moss)] font-medium tracking-wider block">
                春生 · 春季篇
              </span>
              <div v-if="summary.highlights.spring">
                <h4 class="font-serif-editorial text-sm font-medium text-[var(--ink-primary)]">
                  {{ summary.highlights.spring?.title }}
                </h4>
                <p class="font-serif-editorial text-xs text-[var(--ink-secondary)] mt-1 line-clamp-3 leading-relaxed">
                  {{ summary.highlights.spring?.content }}
                </p>
              </div>
              <p v-else class="text-xs font-mono-archive text-[var(--ink-muted)]">
                春季暂无记录
              </p>
            </div>

            <!-- 夏 -->
            <div class="p-4 bg-[var(--bg-subtle)]/30 border border-[var(--border-subtle)] rounded-xs space-y-2">
              <span class="text-[10px] font-mono-archive text-[var(--accent-warm)] font-medium tracking-wider block">
                夏长 · 夏季篇
              </span>
              <div v-if="summary.highlights.summer">
                <h4 class="font-serif-editorial text-sm font-medium text-[var(--ink-primary)]">
                  {{ summary.highlights.summer?.title }}
                </h4>
                <p class="font-serif-editorial text-xs text-[var(--ink-secondary)] mt-1 line-clamp-3 leading-relaxed">
                  {{ summary.highlights.summer?.content }}
                </p>
              </div>
              <p v-else class="text-xs font-mono-archive text-[var(--ink-muted)]">
                夏季暂无记录
              </p>
            </div>

            <!-- 秋 -->
            <div class="p-4 bg-[var(--bg-subtle)]/30 border border-[var(--border-subtle)] rounded-xs space-y-2">
              <span class="text-[10px] font-mono-archive text-amber-600 font-medium tracking-wider block">
                秋收 · 秋季篇
              </span>
              <div v-if="summary.highlights.autumn">
                <h4 class="font-serif-editorial text-sm font-medium text-[var(--ink-primary)]">
                  {{ summary.highlights.autumn?.title }}
                </h4>
                <p class="font-serif-editorial text-xs text-[var(--ink-secondary)] mt-1 line-clamp-3 leading-relaxed">
                  {{ summary.highlights.autumn?.content }}
                </p>
              </div>
              <p v-else class="text-xs font-mono-archive text-[var(--ink-muted)]">
                秋季暂无记录
              </p>
            </div>

            <!-- 冬 -->
            <div class="p-4 bg-[var(--bg-subtle)]/30 border border-[var(--border-subtle)] rounded-xs space-y-2">
              <span class="text-[10px] font-mono-archive text-sky-700 font-medium tracking-wider block">
                冬藏 · 冬季篇
              </span>
              <div v-if="summary.highlights.winter">
                <h4 class="font-serif-editorial text-sm font-medium text-[var(--ink-primary)]">
                  {{ summary.highlights.winter?.title }}
                </h4>
                <p class="font-serif-editorial text-xs text-[var(--ink-secondary)] mt-1 line-clamp-3 leading-relaxed">
                  {{ summary.highlights.winter?.content }}
                </p>
              </div>
              <p v-else class="text-xs font-mono-archive text-[var(--ink-muted)]">
                冬季暂无记录
              </p>
            </div>
          </div>

          <!-- 精选菲林相片画廊 -->
          <div v-if="summary.highlights.photos.length > 0" class="pt-4 space-y-3">
            <span class="text-xs font-mono-archive text-[var(--ink-muted)] block">
              年度精选菲林胶片 ({{ summary.highlights.photos.length }} 张)
            </span>
            <div class="grid grid-cols-3 sm:grid-cols-6 gap-2">
              <div
                v-for="photo in summary.highlights.photos.slice(0, 6)"
                :key="photo.id"
                class="aspect-square bg-[var(--bg-subtle)] border border-[var(--border-subtle)] overflow-hidden rounded-xs"
              >
                <img
                  :src="photo.url"
                  loading="lazy"
                  class="w-full h-full object-cover"
                  alt="年度相片"
                />
              </div>
            </div>
          </div>
        </section>

        <!-- 第五幕：柴米油盐 (Finances，仅主理人可见 RC-57) -->
        <section v-if="isAdmin" class="space-y-6 pb-6">
          <div class="space-y-1">
            <span class="text-xs font-mono-archive tracking-widest text-[var(--ink-muted)] uppercase block">
              ACT V · FINANCES
            </span>
            <h2 class="font-serif-editorial text-2xl text-[var(--ink-primary)] font-medium">
              柴米油盐 · 财务平衡
            </h2>
            <p class="font-serif-editorial text-xs text-[var(--ink-muted)]">
              真实的生活收支流向与取悦自己的成本。
            </p>
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-3 gap-6 p-5 rounded-xs border border-[var(--border-subtle)] bg-[var(--bg-subtle)]/40 font-mono-archive text-xs">
            <div>
              <span class="text-[var(--ink-muted)] block text-[11px]">年度总支出</span>
              <span class="font-serif-editorial text-2xl text-[var(--ink-primary)] font-medium">
                ¥{{ formatMoney(summary.finances.total_expense) }}
              </span>
            </div>
            <div>
              <span class="text-[var(--ink-muted)] block text-[11px]">年度总收入</span>
              <span class="font-serif-editorial text-2xl text-[var(--accent-moss)] font-medium">
                ¥{{ formatMoney(summary.finances.total_income) }}
              </span>
            </div>
            <div>
              <span class="text-[var(--ink-muted)] block text-[11px]">年度收支结余</span>
              <span
                class="font-serif-editorial text-2xl font-medium"
                :class="summary.finances.balance >= 0 ? 'text-[var(--ink-primary)]' : 'text-red-700'"
              >
                {{ summary.finances.balance < 0 ? '-' : '' }}¥{{ formatMoney(Math.abs(summary.finances.balance)) }}
              </span>
            </div>
          </div>

          <!-- 取悦自己的成本指标 -->
          <div v-if="summary.finances.wish_spending_ratio > 0" class="p-3 bg-[var(--bg-subtle)]/40 border border-[var(--border-subtle)] rounded-xs font-mono-archive text-xs flex items-center justify-between">
            <span class="text-[var(--ink-muted)]">心愿与向往开销占全年支出比例 (取悦自己的成本)</span>
            <span class="font-serif-editorial text-base text-[var(--ink-primary)] font-semibold">
              {{ summary.finances.wish_spending_ratio.toFixed(1) }}%
            </span>
          </div>

          <!-- 分类细目 -->
          <div v-if="summary.finances.categories.length > 0" class="space-y-2 pt-2">
            <span class="text-xs font-mono-archive text-[var(--ink-muted)] block">支出品类结构</span>
            <div class="grid grid-cols-2 sm:grid-cols-4 gap-2 font-mono-archive text-xs">
              <div
                v-for="cat in summary.finances.categories"
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

      <!-- 卷末出版底款 (实体书翻页底款印章) -->
      <footer class="pt-10 border-t border-[var(--border-subtle)] text-center space-y-2 font-serif-editorial text-xs text-[var(--ink-muted)]">
        <p>《散页》· {{ currentYear }} 年度生活年鉴 · 纯本地优先与数据主权</p>
        <p class="font-mono-archive text-[10px]">CRAFTED WITH MEMORY & CARE</p>
      </footer>
    </div>
  </div>
</template>

<style scoped>
@media print {
  body {
    background-color: white !important;
    color: black !important;
  }
}
</style>
