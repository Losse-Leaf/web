<script setup lang="ts">
import { ArrowUpRight } from 'lucide-vue-next'
import type { SiteConfig, CuratorProfile } from '../types'

defineProps<{
  config?: SiteConfig | null
  profile?: CuratorProfile | null
}>()

const emit = defineEmits<{
  (e: 'openWelcome'): void
}>()
</script>

<template>
  <footer
    class="border-t border-[var(--border-subtle)] bg-[var(--bg-archive)] py-16 text-left transition-colors duration-300"
    style="padding-bottom: calc(4rem + env(safe-area-inset-bottom, 0px));"
  >
    <div class="max-w-5xl mx-auto px-4 sm:px-8 space-y-8 font-mono-archive text-xs text-[var(--ink-muted)]">
      
      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-6 pb-8 border-b border-[var(--border-subtle)]">
        <div>
          <span class="text-[var(--ink-primary)] font-semibold tracking-wider font-serif-editorial text-sm">
            《散页》
          </span>
          <p class="mt-1 text-[11px] text-[var(--ink-secondary)] font-serif-editorial">
            个人生活手账与时光档案 · 记录做过的事、看过的风景、思考过的念头。
          </p>
        </div>

        <!-- 规范工信部备案号 (严格合规) -->
        <div class="flex items-center gap-3">
          <a
            :href="config?.icp_link || 'https://beian.miit.gov.cn'"
            target="_blank"
            rel="noopener noreferrer"
            class="hover:text-[var(--ink-primary)] hover-underline transition-colors py-1 inline-flex items-center gap-1 text-[var(--ink-secondary)]"
          >
            <span>{{ config?.icp_number || '浙ICP备2026081664号' }}</span>
            <ArrowUpRight class="w-3 h-3 opacity-60" />
          </a>
        </div>
      </div>

      <!-- 版权与定位 -->
      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 text-[11px]">
        <div>
          © 2024–{{ new Date().getFullYear() }} 《散页》 · {{ profile?.motto || '真实生活大于一切。' }}
        </div>
        <div class="flex items-center gap-4">
          <a
            :href="profile?.social_links?.github || profile?.github || 'https://github.com/YN1753'"
            target="_blank"
            rel="noopener noreferrer"
            class="hover:text-[var(--ink-primary)]"
          >
            <span>{{ (profile?.social_links?.github || profile?.github || 'https://github.com/YN1753').replace('https://', '') }}</span>
          </a>
          <span>·</span>
          <span>{{ profile?.location || config?.default_location || '中国 · 杭州' }}</span>
          <span>·</span>
          <button
            @click="emit('openWelcome')"
            class="hover:text-[var(--ink-primary)] hover-underline cursor-pointer transition-colors opacity-70 hover:opacity-100"
            title="查看创刊扉页"
          >
            扉页
          </button>
        </div>
      </div>

    </div>
  </footer>
</template>
