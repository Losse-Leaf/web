import { createApp } from 'vue'
// MOB-P1-98：本地字体（此前 CSS 引用了字体名却从未加载，全部回退系统字体）
import './fonts.css'
import './style.css'
import App from './App.vue'

createApp(App).mount('#app')

// ── MOB-OPT-P3: 前端异常监控 ──────────────────────────────────
// 未捕获的 JS 错误与 Promise rejection 统一记录到控制台（后续可对接上报服务）。
// 移动端出错时用户通常只会关闭——无监控 = 无感知。
window.addEventListener('error', (event) => {
  console.error('[LooseLeaf Error]', event.error || event.message)
})
window.addEventListener('unhandledrejection', (event) => {
  console.error('[LooseLeaf Unhandled Rejection]', event.reason)
})
