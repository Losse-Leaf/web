/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/vue" />

/**
 * 由 vite.config.ts 的 define 从 package.json 注入。
 * 用于前端展示的产品版本，与导出 schema 版本（EXPORT_SCHEMA_VERSION）无关。
 */
declare const __APP_VERSION__: string
