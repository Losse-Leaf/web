<script setup lang="ts">
import { computed } from 'vue'
import { ArrowUpRight } from 'lucide-vue-next'
import { getBeijingYear } from '../utils/format'
import type { SiteConfig, CuratorProfile } from '../types'

defineProps<{
  config?: SiteConfig | null
  profile?: CuratorProfile | null
}>()

const emit = defineEmits<{
  (e: 'openWelcome'): void
}>()

// 版权年份按北京时间基准 (RC-134)
const currentYear = computed(() => getBeijingYear())
</script>

<template>
  <footer
    class="border-t border-[var(--border-subtle)] bg-[var(--bg-archive)] py-16 text-left transition-colors duration-300"
    style="padding-bottom: calc(4rem + env(safe-area-inset-bottom, 0px));"
  >
    <div class="max-w-5xl mx-auto px-4 sm:px-8 space-y-8 font-mono-archive text-xs text-[var(--ink-muted)]">
      
      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-6 pb-6 border-b border-[var(--border-subtle)]">
        <div>
          <span class="text-[var(--ink-primary)] font-semibold tracking-wider font-serif-editorial text-sm">
            《散页》
          </span>
          <p class="mt-1 text-[11px] text-[var(--ink-secondary)] font-serif-editorial">
            个人生活手账与时光档案 · 记录做过的事、看过的风景、思考过的念头。
          </p>
        </div>

        <div class="flex items-center gap-4 text-[11px]">
          <span v-if="profile?.location">{{ profile.location }}</span>
          <span v-if="profile?.location">·</span>
          <button
            @click="emit('openWelcome')"
            class="hover:text-[var(--ink-primary)] hover-underline cursor-pointer transition-colors opacity-70 hover:opacity-100"
            title="查看创刊扉页"
          >
            扉页
          </button>
        </div>
      </div>

      <!-- 版权与开源署名解耦 (RC-52) -->
      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 text-[11px]">
        <div>
          © 2024–{{ currentYear }} 《散页》<span v-if="profile?.name"> · {{ profile.name }}</span>
        </div>
        <div class="flex items-center gap-4">
          <a
            href="https://github.com/Losse-Leaf"
            target="_blank"
            rel="noopener noreferrer"
            class="hover:text-[var(--ink-primary)] inline-flex items-center gap-1 transition-colors"
          >
            <span>开源项目 Loose Leaf · Crafted by @YN1753</span>
            <ArrowUpRight class="w-3 h-3 opacity-60" />
          </a>
        </div>
      </div>

    </div>
  </footer>
</template>
