import tailwindcss from '@tailwindcss/vite'
import vue from '@vitejs/plugin-vue'
import { VitePWA } from 'vite-plugin-pwa'
import { readFileSync } from 'node:fs'
import path from 'path'
import { defineConfig, type Plugin } from 'vite'

// 版本号唯一来源：package.json。CI 会校验它与 WEB_VERSION / release tag 一致。
const appPackage = JSON.parse(
  readFileSync(new URL('./package.json', import.meta.url), 'utf8'),
) as { version: string }
const APP_VERSION = appPackage.version

/**
 * P0-3 / P0-4：
 * - favicon 的 ?v= 查询串由产品版本注入，不再手写；
 * - 字体 preload 不写固定路径：构建时从 bundle 里找 Vite 实际生成的
 *   `Newsreader-2-<hash>.woff2`，再替换 index.html 中的占位注释。
 *   找不到就保持注释（不输出 preload），宁可少一条预加载也不留 404。
 */
function versionAndFontPreloadPlugin(version: string): Plugin {
  return {
    name: 'looseleaf-version-font-preload',
    transformIndexHtml: {
      order: 'post',
      handler(html, ctx) {
        let next = html.replace(
          /\/favicon\.svg(?:\?v=[^"']*)?/,
          `/favicon.svg?v=${version}`,
        )

        // dev server 没有 bundle，跳过字体注入（字体仍会由 CSS 正常加载）。
        if (!ctx.bundle) return next

        const fontAsset = Object.values(ctx.bundle).find(
          (asset) =>
            asset.type === 'asset' &&
            /(^|\/)Newsreader-2-[A-Za-z0-9_-]+\.woff2$/.test(asset.fileName),
        )

        if (fontAsset) {
          next = next.replace(
            '<!-- looseleaf:newsreader-preload -->',
            `<link rel="preload" href="/${fontAsset.fileName}" as="font" type="font/woff2" crossorigin />`,
          )
        }

        return next
      },
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(APP_VERSION),
  },
  plugins: [
    vue(),
    tailwindcss(),
    versionAndFontPreloadPlugin(APP_VERSION),
    // MOB-P2-81：补上 Service Worker —— 此前完全没有离线能力，
    // 弱网 / 地铁里打开就是白屏。App Shell 走预缓存，
    // 接口数据走 NetworkFirst（离线时回落到最近一次成功的响应）。
    VitePWA({
      // P0-5：autoUpdate 会让新 SW 静默 skipWaiting 接管旧页面，
      // 旧页再去请求已删除的懒加载旧 hash chunk 就是 404。
      // 改为 prompt，由 PwaUpdatePrompt 明确询问后再更新。
      registerType: 'prompt',
      includeAssets: ['favicon.svg', 'icons/apple-touch-icon.png'],
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
        // P0-2：Workbox 的 RegExpRoute 是对 url.href 做匹配的，
        // 同源 URL 的 href 以 https:// 开头，/^\/api\/v1\// 永远不可能命中。
        // 这里改用 RouteMatchCallback，按 url.pathname 判断。
        runtimeCaching: [
          {
            // 只缓存 GET；登录 / 配对 / 设备等鉴权接口不进缓存；
            // 备份、系统状态、存储配置等管理端接口也一律旁路，
            // 避免把主理人凭据或灾备清单落到 Cache Storage。
            urlPattern: ({ request, url }) =>
              request.method === 'GET' &&
              url.pathname.startsWith('/api/v1/') &&
              !url.pathname.startsWith('/api/v1/auth/') &&
              !url.pathname.startsWith('/api/v1/system/') &&
              !url.pathname.startsWith('/api/v1/storage/'),
            handler: 'NetworkFirst',
            options: {
              cacheName: 'looseleaf-api',
              networkTimeoutSeconds: 8,
              expiration: { maxEntries: 120, maxAgeSeconds: 60 * 60 * 24 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            // 媒体同样只缓存 GET；CacheFirst 语义保持不变。
            urlPattern: ({ request, url }) =>
              request.method === 'GET' && url.pathname.startsWith('/media/'),
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
