import tailwindcss from '@tailwindcss/vite'
import vue from '@vitejs/plugin-vue'
import { VitePWA } from 'vite-plugin-pwa'
import path from 'path'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    vue(),
    tailwindcss(),
    // MOB-P2-81：补上 Service Worker —— 此前完全没有离线能力，
    // 弱网 / 地铁里打开就是白屏。App Shell 走预缓存，
    // 接口数据走 NetworkFirst（离线时回落到最近一次成功的响应）。
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.png', 'icons/apple-touch-icon.png'],
      manifest: {
        name: '散页',
        short_name: '散页',
        description: '散页个人生活手账与时光档案',
        theme_color: '#f9f8f5',
        background_color: '#f9f8f5',
        display: 'standalone',
        lang: 'zh-CN',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: '/icons/icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,svg,png,ico,woff2}'],
        navigateFallback: 'index.html',
        runtimeCaching: [
          {
            urlPattern: /^\/api\/v1\//,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'looseleaf-api',
              networkTimeoutSeconds: 8,
              expiration: { maxEntries: 120, maxAgeSeconds: 60 * 60 * 24 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            urlPattern: /^\/media\//,
            handler: 'CacheFirst',
            options: {
              cacheName: 'looseleaf-media',
              expiration: { maxEntries: 300, maxAgeSeconds: 60 * 60 * 24 * 30 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
  server: {
    port: 5174,
    proxy: {
      '/api': {
        target: 'http://localhost:8088',
        changeOrigin: true,
      },
      '/media': {
        target: 'http://localhost:8088',
        changeOrigin: true,
      },
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          // MOB-P2-76：原先「lucide」规则实际上把 Vue 运行时（createLucideIcon 先 import vue）
          // 打进了 vendor-lucide，导致命名误导 + vendor-lucide 反向依赖 vendor-vue。
          // 现在把 Vue 运行时单独归入 vendor-vue，图标随各组件内联（tree-shaking 本就正常）。
          if (id.includes('node_modules/vue/') || id.includes('node_modules/@vue/')) {
            return 'vendor-vue'
          }
          // MOB-P2-77：城市字典单独成 chunk。
          // 它的所有使用者都是懒加载组件，独立 chunk 可以与首屏**并行下载**，
          // 不会阻塞首屏渲染（实测：保留独立 chunk 时首屏 entry 127KB，
          // 字典 34KB 并行拉取；把它内联进 entry 反而变成 157KB 阻塞首屏）。
          if (id.includes('src/utils/cities')) {
            return 'atlas-cities-data'
          }
        },
      },
    },
  },
})
