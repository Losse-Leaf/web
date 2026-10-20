import { createApp } from 'vue'
// MOB-P1-98：本地字体（此前 CSS 引用了字体名却从未加载，全部回退系统字体）
import './fonts.css'
import './style.css'
import App from './App.vue'

createApp(App).mount('#app')
