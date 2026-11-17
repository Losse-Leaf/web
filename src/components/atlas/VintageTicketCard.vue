<script setup lang="ts">
import { ChevronRight } from 'lucide-vue-next'
import { PROVINCE_SHORT_MAP, formatVisitStampCount } from '../../utils/atlasHelpers'

export interface TicketCityItem {
  code: string
  name: string
  shortName: string
  province: string
  epithet: string
  visitCount: number
  firstVisitedAt: string
  latestVisitedAt: string
  latestNote?: string
}

defineProps<{
  city: TicketCityItem
  mode: 'region' | 'timeline'
  yearLabel?: string
}>()

const emit = defineEmits<{
  (e: 'select', city: TicketCityItem): void
}>()
</script>

<template>
  <div
    @click="emit('select', city)"
    class="vintage-ticket-card relative bg-[#FAF7F0] dark:bg-[#1C1A18] border border-[#D5CDC0] dark:border-[#383430] rounded-xs shadow-[0_6px_24px_rgba(0,0,0,0.06)] hover:shadow-[0_12px_32px_rgba(0,0,0,0.12)] transition-all duration-300 overflow-hidden flex flex-col md:flex-row cursor-pointer group"
  >
    <!-- 左联：副券 / 旅客存根 -->
    <div class="w-full md:w-52 shrink-0 bg-[#F2EDE2] dark:bg-[#23201D] border-b md:border-b-0 md:border-r-2 border-dashed border-[#C5BBAA] dark:border-[#423D38] p-5 flex flex-col justify-between relative overflow-hidden">
      <!-- 针孔咬痕咬角 (桌面端右侧纵切口，移动端底部横切口) -->
      <div class="absolute -right-3 -top-3 w-6 h-6 rounded-full bg-[var(--bg-archive)] border border-[#D5CDC0] dark:border-[#383430] hidden md:block"></div>
      <div class="absolute -right-3 -bottom-3 w-6 h-6 rounded-full bg-[var(--bg-archive)] border border-[#D5CDC0] dark:border-[#383430] hidden md:block"></div>
      <div class="absolute -left-3 -bottom-3 w-6 h-6 rounded-full bg-[var(--bg-archive)] border border-[#D5CDC0] dark:border-[#383430] md:hidden block"></div>
      <div class="absolute -right-3 -bottom-3 w-6 h-6 rounded-full bg-[var(--bg-archive)] border border-[#D5CDC0] dark:border-[#383430] md:hidden block"></div>

      <div class="space-y-3">
        <div class="flex items-center justify-between">
          <span class="text-[11px] font-mono-archive text-[var(--ink-muted)] tracking-wider">
            存根 #{{ city.code.slice(0, 4) }}
          </span>
          <div class="flex items-center gap-[1.5px] h-3.5 opacity-65">
            <div class="w-[1px] h-full bg-[var(--ink-primary)]"></div>
            <div class="w-[2px] h-full bg-[var(--ink-primary)]"></div>
            <div class="w-[1px] h-full bg-[var(--ink-primary)]"></div>
            <div class="w-[3px] h-full bg-[var(--ink-primary)]"></div>
            <div v-if="mode === 'region'" class="w-[1px] h-full bg-[var(--ink-primary)]"></div>
            <div v-if="mode === 'region'" class="w-[2px] h-full bg-[var(--ink-primary)]"></div>
          </div>
        </div>

        <div class="space-y-1">
          <div class="text-xs font-serif-editorial text-[#b94a3b] font-medium tracking-wider">
            {{ city.province }} · {{ city.shortName }}
          </div>
          <div class="font-serif-editorial text-2xl font-bold tracking-wide text-[var(--ink-primary)] group-hover:text-[#b94a3b] transition-colors">
            {{ city.name }}
          </div>
        </div>
      </div>

      <div class="pt-4 border-t border-[#D5CDC0]/60 dark:border-[#383430]/60 flex items-center justify-between text-[11px] font-serif-editorial">
        <span class="text-[var(--ink-muted)]">
          {{ mode === 'region' ? '旅客存根' : city.latestVisitedAt }}
        </span>
        <div class="w-6 h-6 rounded-xs border border-[#b94a3b] flex items-center justify-center font-bold text-xs text-[#b94a3b] bg-[#b94a3b]/5">
          {{ PROVINCE_SHORT_MAP[city.province] || city.province.slice(0, 1) }}
        </div>
      </div>
    </div>

    <!-- 右联：正券 / 乘车票面 -->
    <div class="flex-1 p-5 sm:p-6 flex flex-col justify-between space-y-4 relative">
      <div class="flex items-center justify-between pb-2.5 border-b border-[#D5CDC0]/70 dark:border-[#383430]/70 text-[11px] font-serif-editorial text-[var(--ink-muted)] tracking-wider">
        <template v-if="mode === 'region'">
          <span>散页客票 · 山川行迹</span>
          <span>头等舱 · 登程</span>
          <span class="hidden sm:inline font-mono-archive text-[11px]">编号 {{ city.code }}</span>
        </template>
        <template v-else>
          <span>散页客票 · 编年行迹</span>
          <span>{{ yearLabel }} 岁次卷</span>
        </template>
      </div>

      <!-- 路线段 -->
      <div class="flex items-center justify-between gap-4">
        <div>
          <div class="text-[11px] font-serif-editorial text-[var(--ink-muted)]">出发地</div>
          <div class="font-serif-editorial text-sm font-medium text-[var(--ink-secondary)]">起步站</div>
        </div>

        <div class="flex-1 flex items-center justify-center gap-2 text-[var(--ink-muted)] opacity-60">
          <span class="w-full border-t border-dashed border-[var(--border-subtle)]"></span>
          <span class="w-1.5 h-1.5 rotate-45 border border-current shrink-0"></span>
          <span class="w-full border-t border-dashed border-[var(--border-subtle)]"></span>
        </div>

        <div class="text-right">
          <div class="text-[11px] font-serif-editorial text-[#b94a3b] font-medium">目的地</div>
          <div class="font-serif-editorial text-2xl font-medium tracking-tight text-[var(--ink-primary)]">
            {{ city.name }}
          </div>
        </div>
      </div>

      <!-- 复古双圈波浪橡皮邮戳与手札笺注 -->
      <div class="py-1 flex items-center justify-between gap-4">
        <div class="space-y-1.5 flex-1 text-left">
          <div class="text-xs font-serif-editorial text-[var(--ink-secondary)] italic">
            {{ city.epithet }}
          </div>
          <div v-if="city.latestNote" class="text-xs font-serif-editorial text-[var(--ink-primary)] line-clamp-1">
            “{{ city.latestNote }}”
          </div>
          <div v-if="mode === 'region'" class="text-[11px] font-mono-archive text-[var(--ink-muted)]">
            首访: {{ city.firstVisitedAt || '早年' }}
            <span v-if="city.latestVisitedAt && city.latestVisitedAt !== city.firstVisitedAt" class="ml-2">
              最近: {{ city.latestVisitedAt }}
            </span>
          </div>
        </div>

        <div class="shrink-0 transform rotate-[-6deg] group-hover:rotate-0 transition-transform duration-300">
          <div class="border-2 border-[#b94a3b]/85 rounded-full w-20 h-20 p-0.5 flex items-center justify-center relative shadow-[inset_0_0_6px_rgba(185,74,59,0.18)] bg-[#b94a3b]/[0.02]">
            <div class="border border-[#b94a3b]/70 rounded-full w-full h-full flex flex-col items-center justify-center text-[#b94a3b] text-center select-none">
              <span class="text-[8px] font-serif-editorial font-bold tracking-widest">散页 藏</span>
              <span class="text-[11px] font-serif-editorial font-bold my-0.5">
                {{ city.latestVisitedAt || city.firstVisitedAt || '留步' }}
              </span>
              <span class="text-[8px] font-serif-editorial border-t border-[#b94a3b]/60 px-1 pt-0.5">
                {{ formatVisitStampCount(city.visitCount) }}
              </span>
            </div>
            <!-- 右侧波浪邮戳切线 (纯矢量绘制) -->
            <svg
              v-if="mode === 'region'"
              class="absolute -right-6 top-1/2 -translate-y-1/2 w-5 h-7 text-[#b94a3b]/70 select-none pointer-events-none"
              viewBox="0 0 24 28"
              fill="none"
              aria-hidden="true"
            >
              <path d="M1 5 Q4 2 7 5 T13 5 T19 5 T23 5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" />
              <path d="M1 14 Q4 11 7 14 T13 14 T19 14 T23 14" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" />
              <path d="M1 23 Q4 20 7 23 T13 23 T19 23 T23 23" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" />
            </svg>
          </div>
        </div>
      </div>

      <!-- 票面底栏 -->
      <div class="pt-2.5 border-t border-[#D5CDC0]/60 dark:border-[#383430]/60 flex items-center justify-between text-[11px] font-serif-editorial text-[var(--ink-muted)] group-hover:text-[var(--ink-primary)] transition-colors">
        <span>
          {{ mode === 'region' ? `已钤印归册 · ${city.province}` : `已钤印归册 · 编号 ${city.code}` }}
        </span>
        <div class="flex items-center gap-1 font-medium text-[var(--ink-primary)]">
          <span>翻阅回忆抽屉 (4章节)</span>
          <ChevronRight class="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
        </div>
      </div>
    </div>
  </div>
</template>
