<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import {
  BookOpen,
  KeyRound,
  PenTool,
  Check,
  ShieldCheck,
  Sparkles,
  ArrowRight,
  Sun,
  Moon,
  Camera,
  Compass,
  Layers,
  ScanLine,
  AlertCircle,
} from 'lucide-vue-next'
import { audio } from '../utils/audio'
import { getBeijingDotDate, getBeijingYear } from '../utils/format'
import { markEnteredArchive, clearEnteredArchive } from '../utils/auth'
import {
  claimDevice,
  getAdminToken,
  removeAdminToken,
  clearApiCache,
} from '../utils/api'
import type { SystemStatus } from '../types'

const props = defineProps<{
  theme: 'paper' | 'darkroom'
  systemStatus?: SystemStatus | null
}>()

// 版权年份按北京时间基准 (RC-134)
const currentYear = getBeijingYear()

const emit = defineEmits<{
  (e: 'enter'): void
  (e: 'toggleTheme'): void
  (e: 'bootstrapped'): void
}>()

// 本地系统状态缓存 (由后端 GET /api/v1/system/status 驱动)
const status = ref<SystemStatus>({
  initialized: true,
  site_name: '散页',
  curator_name: '',
})

// 主理人凭证状态
const isCurator = ref(Boolean(getAdminToken()))

// 阶段判定 (RC-59 / RC-60)：
// 当 status.initialized === false 时，无条件清空失效的本地残留 Token 并独占渲染阶段一「首次认领码输入页」
// 认领成功后（claimSuccess）驻留阶段一的成功页，直到用户点「翻开扉页」主动进馆 ——
// 期间系统状态刷新为 initialized=true 也不得把扉页翻到阶段二（与 App.vue
// handleBootstrapped 只预取数据、不自动进馆的口径一致）。
const isBootstrapOnlyStage = computed(() => claimSuccess.value || !status.value.initialized)

// 阶段一：一次性认领码认领首台设备
// 认领码由服务在启动时打印到标准输出（systemd 用 journalctl -u loose-leaf 查看），
// 15 分钟内有效；过期或连续输错 5 次作废，需重启服务获取新码。
const claimCode = ref('')
const isClaiming = ref(false)
const claimError = ref('')
const claimSuccess = ref(false)

const checkCuratorAuth = () => {
  isCurator.value = Boolean(getAdminToken())
}

const applySystemStatus = (s: SystemStatus) => {
  status.value = s
  if (!s.initialized) {
    removeAdminToken()
    clearEnteredArchive()
    isCurator.value = false
  } else {
    checkCuratorAuth()
  }
}

// 提交认领码：POST /api/v1/auth/claim，成功后当前浏览器成为首台受信任设备
const handleClaimSubmit = async () => {
  const code = claimCode.value.trim().toUpperCase()
  if (!code) {
    claimError.value = '请输入服务启动时打印的认领码'
    return
  }

  audio.playTink()
  isClaiming.value = true
  claimError.value = ''
  try {
    await claimDevice({ code })
    audio.playShutter()
    claimSuccess.value = true
    status.value.initialized = true
    isCurator.value = true
    markEnteredArchive()
    emit('bootstrapped')
  } catch (err: any) {
    claimError.value = err?.message || '认领码不正确或已失效，请核对服务启动日志'
  } finally {
    isClaiming.value = false
  }
}

// 认领成功后进入展厅
const handleClaimEnter = () => {
  audio.playPaperFlip()
  emit('enter')
}

// 阶段二（已初始化）：1. 访客通道直接进入
const handleEnterAsGuest = () => {
  if (isBootstrapOnlyStage.value) return
  audio.playPaperFlip()
  markEnteredArchive()
  emit('enter')
}

// 退出主人身份
const handleLogout = async () => {
  audio.playTink()
  removeAdminToken()
  clearEnteredArchive()
  isCurator.value = false
  // 与页脚登出保持一致：清掉 API 快照与 Workbox 运行时缓存。
  await clearApiCache()
  // 单例 composable（entries / transactions / profile）不会因为清缓存而自动归零；
  // 不刷新的话，随后以访客身份进入仍能在时间流里看到主人账目。整页重载最干净。
  window.location.reload()
}

const todayDisplay = computed(() => getBeijingDotDate())

// 阶段一：首次认领流程说明
const bootstrapGuides = [
  {
    num: '01',
    title: '查看服务启动日志',
    desc: '首次运行会在标准输出打印 8 位认领码（systemd 部署用 journalctl -u loose-leaf 查看）。',
  },
  {
    num: '02',
    title: '输入认领码认领首台设备',
    desc: '认领码 15 分钟内有效；过期或连续输错 5 次会作废，重启服务即可获取新码。',
  },
  {
    num: '03',
    title: '建议再配对一台设备作为备份',
    desc: '认领成功后可随时在「设备管理」为手机或桌面端签发配对二维码。',
  },
]

// 阶段二：档案馆三大篇章概览
const archiveChapters = [
  {
    num: '01',
    icon: Compass,
    title: '时间流与日常印记',
    desc: '行迹、随笔、微小触动与具体的日常饭食。',
  },
  {
    num: '02',
    icon: Camera,
    title: '35mm 胶片暗房',
    desc: '光影定格、银盐暗房与四季街头的体温。',
  },
  {
    num: '03',
    icon: Layers,
    title: '手艺造物与收支光谱',
    desc: '亲手创造的作品、造物工坊与真实账簿。',
  },
]

watch(
  () => props.systemStatus,
  (newS) => {
    if (newS) {
      applySystemStatus(newS)
    }
  },
  { immediate: true }
)

// WEB-5：系统状态由 App.vue 统一请求并作为 prop 传入，欢迎扉页不再重复请求
// /system/status（此前首屏会打两次：WelcomePortal + App）。
</script>

<template>
  <div class="min-h-screen w-full bg-[var(--bg-archive)] text-[var(--ink-primary)] flex flex-col justify-between selection:bg-[var(--accent-warm)]/15 selection:text-[var(--accent-warm)] transition-colors duration-300 relative select-none">
    <!-- 原生纸张微噪点覆盖层 -->
    <div class="paper-grain-overlay" aria-hidden="true" />

    <!-- 顶栏：刊印编号、今日自然日期与暗房模式切换 -->
    <header
      class="w-full border-b border-[var(--border-subtle)] bg-[var(--bg-archive)]/80 backdrop-blur-md px-6 sm:px-12 py-4 flex items-center justify-between text-xs font-mono-archive text-[var(--ink-muted)] relative z-20"
      style="padding-top: max(1rem, env(safe-area-inset-top, 1rem));"
    >
      <div class="flex items-center gap-3">
        <span class="inline-block w-2 h-2 rounded-full bg-[var(--accent-warm)] animate-pulse"></span>
        <span class="font-serif-editorial text-sm text-[var(--ink-primary)] font-medium">
          《 散 页 》
        </span>
        <span class="text-[var(--border-divider)]">/</span>
        <span class="font-serif-editorial text-xs text-[var(--ink-secondary)]">
          个人生活志
        </span>
        <span class="hidden sm:inline text-[var(--border-divider)]">/</span>
        <span class="hidden sm:inline uppercase tracking-widest text-[11px]">
          {{ isBootstrapOnlyStage ? 'VOL. 01 · 首次认领' : 'VOL. 01 · 创刊扉页' }}
        </span>
      </div>

      <div class="flex items-center gap-4">
        <span>{{ todayDisplay }}</span>
        <span>/</span>
        <button
          @click="emit('toggleTheme')"
          class="p-1.5 text-[var(--ink-secondary)] hover:text-[var(--ink-primary)] rounded-xs border border-[var(--border-subtle)] hover:border-[var(--border-divider)] cursor-pointer transition-colors"
          :title="theme === 'darkroom' ? '切换为暖色棉纸模式' : '切换为胶片暗房模式'"
        >
          <Moon v-if="theme === 'paper'" class="w-3.5 h-3.5" />
          <Sun v-else class="w-3.5 h-3.5 text-amber-500" />
        </button>
      </div>
    </header>

    <!-- 中央核心装帧区：出版物级宽幅双页跨页排版 -->
    <main class="flex-grow flex items-center justify-center px-4 sm:px-10 lg:px-16 py-10 sm:py-16 relative z-20">
      <div class="w-full max-w-6xl mx-auto">
        <!-- =====================================================================
             阶段一：未初始化冷启动（!initialized）—— 独占式「首次认领码输入页」
             严禁渲染任何访客入口或模式切换按钮
             ===================================================================== -->
        <div
          v-if="isBootstrapOnlyStage"
          class="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-16 items-center"
        >
          <!-- 左页：素胚典藏封皮与装帧导言 -->
          <div class="lg:col-span-6 space-y-8 text-left">
            <div class="flex items-center gap-3">
              <span class="px-2 py-0.5 rounded-xs border border-[var(--accent-warm)]/40 bg-[var(--accent-warm)]/10 text-[11px] font-mono-archive tracking-widest text-[var(--accent-warm)]">
                卷一 · 素胚待装帧
              </span>
              <span class="text-xs font-mono-archive tracking-wider text-[var(--ink-muted)]">
                典藏本 · 银盐纸张装帧
              </span>
            </div>

            <div class="space-y-4">
              <div class="flex items-baseline gap-4">
                <h1 class="font-serif-editorial text-5xl sm:text-7xl font-normal tracking-tight text-[var(--ink-primary)]">
                  《 散 页 》
                </h1>
                <div class="inline-flex items-center justify-center px-2 py-1 border border-[var(--accent-warm)] text-[var(--accent-warm)] text-xs font-serif-editorial rounded-xs rotate-[-3deg] shadow-2xs">
                  散页 藏
                </div>
              </div>
              <div class="font-serif-editorial text-xs tracking-wider text-[var(--ink-muted)]">
                个人生活志 · 日常 · 资产 · 心愿 · 行迹 · 造物
              </div>
            </div>

            <blockquote class="p-5 sm:p-6 rounded-xs bg-[var(--bg-subtle)]/50 border-l-2 border-[var(--accent-warm)] text-[var(--ink-secondary)] font-serif-editorial text-base sm:text-lg italic leading-relaxed">
              “此档案馆尚处素胚状态。请查看服务启动日志中的认领码完成首次认领，随后开启日常记录与公开展览。”
            </blockquote>

            <div class="space-y-3 pt-1">
              <div class="text-[11px] font-mono-archive text-[var(--ink-muted)] tracking-wider">
                首次认领流程说明
              </div>
              <div class="space-y-2.5">
                <div
                  v-for="item in bootstrapGuides"
                  :key="item.num"
                  class="p-3.5 rounded-xs border border-[var(--border-subtle)] bg-[var(--bg-subtle)]/30 flex items-start gap-3"
                >
                  <span class="font-mono-archive text-xs font-semibold text-[var(--accent-warm)] pt-0.5 shrink-0">
                    {{ item.num }}
                  </span>
                  <div class="space-y-0.5">
                    <div class="font-serif-editorial text-xs font-medium text-[var(--ink-primary)]">
                      {{ item.title }}
                    </div>
                    <p class="font-serif-editorial text-[11px] text-[var(--ink-muted)] leading-relaxed">
                      {{ item.desc }}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div class="pt-2 flex flex-wrap items-center gap-x-6 gap-y-1 text-[11px] font-mono-archive text-[var(--ink-muted)] border-t border-[var(--border-subtle)]/60">
              <span>纸张：120g 哑光棉纸</span>
              <span>·</span>
              <span>显影：银盐黑白相纸</span>
              <span>·</span>
              <span>主权：本地优先与私有</span>
            </div>
          </div>

          <!-- 右页：唯一首次认领码输入页 -->
          <div class="lg:col-span-6">
            <div class="p-6 sm:p-8 rounded-xs border border-[var(--accent-warm)]/60 bg-[var(--bg-subtle)]/40 shadow-xl space-y-6 text-left min-h-[430px] flex flex-col justify-between">
              <!-- 页眉 -->
              <div class="flex items-center justify-between border-b border-[var(--border-subtle)] pb-4 shrink-0">
                <div class="flex items-center gap-2.5">
                  <PenTool class="w-4 h-4 text-[var(--accent-warm)]" />
                  <span class="font-serif-editorial text-lg sm:text-xl font-medium text-[var(--ink-primary)]">
                    首次认领 · 筑造私人档案馆
                  </span>
                </div>
                <span class="px-2 py-0.5 rounded-xs bg-[var(--accent-warm)]/15 text-[var(--accent-warm)] text-[11px] font-mono-archive tracking-widest">
                  CLAIM
                </span>
              </div>

              <!-- 认领成功：提示备份后进入展厅 -->
              <div v-if="claimSuccess" class="space-y-5 flex-1 flex flex-col justify-center">
                <div class="p-4 rounded-xs border border-[var(--accent-moss)]/35 bg-[var(--accent-moss)]/10 flex items-start gap-3">
                  <Check class="w-4 h-4 text-[var(--accent-moss)] shrink-0 mt-0.5" />
                  <div class="space-y-1.5">
                    <div class="font-serif-editorial text-sm font-medium text-[var(--ink-primary)]">
                      已认领为首台受信任设备
                    </div>
                    <p class="font-serif-editorial text-xs text-[var(--ink-secondary)] leading-relaxed">
                      建议再配对一台设备作为备份。
                    </p>
                  </div>
                </div>

                <button
                  @click="handleClaimEnter"
                  class="w-full py-3 px-4 bg-[var(--accent-warm)] text-white text-xs font-mono-archive rounded-xs cursor-pointer hover:opacity-90 transition-opacity flex items-center justify-center gap-2 shadow-sm"
                >
                  <span>翻开扉页 · 进入展厅</span>
                  <ArrowRight class="w-3.5 h-3.5" />
                </button>
              </div>

              <!-- 认领码输入 -->
              <div v-else class="space-y-5 flex-1">
                <p class="font-serif-editorial text-xs sm:text-sm text-[var(--ink-secondary)] leading-relaxed">
                  请输入服务启动时打印的 8 位认领码（格式 XXXX-XXXX），认领当前浏览器为首台受信任设备。
                </p>

                <div class="space-y-4 font-mono-archive text-xs">
                  <div class="space-y-1.5">
                    <label class="block text-[var(--ink-muted)]">认领码 *</label>
                    <input
                      v-model="claimCode"
                      type="text"
                      inputmode="text"
                      autocomplete="one-time-code"
                      spellcheck="false"
                      placeholder="XXXX-XXXX"
                      maxlength="9"
                      @keydown.enter="handleClaimSubmit"
                      class="w-full px-3 py-2.5 text-center text-base tracking-[0.3em] uppercase bg-[var(--bg-archive)] border border-[var(--border-subtle)] focus:border-[var(--ink-primary)] rounded-xs outline-none text-[var(--ink-primary)]"
                    />
                  </div>

                  <div
                    v-if="claimError"
                    class="p-2.5 rounded-xs bg-red-500/10 border border-red-500/30 text-red-600 dark:text-red-400 text-[11px] flex items-start gap-2"
                  >
                    <AlertCircle class="w-3.5 h-3.5 shrink-0 mt-0.5" />
                    <span>{{ claimError }}</span>
                  </div>

                  <button
                    @click="handleClaimSubmit"
                    :disabled="isClaiming || !claimCode.trim()"
                    class="w-full py-3 px-4 bg-[var(--accent-warm)] text-white text-xs font-mono-archive rounded-xs cursor-pointer hover:opacity-90 disabled:opacity-50 transition-opacity flex items-center justify-center gap-2 shadow-sm"
                  >
                    <Sparkles class="w-3.5 h-3.5" />
                    <span>{{ isClaiming ? '正在核验认领码...' : '钤印认领 · 成为档案馆主人 →' }}</span>
                  </button>

                  <p class="text-[11px] font-mono-archive text-[var(--ink-muted)] leading-relaxed border-t border-[var(--border-subtle)]/60 pt-3">
                    认领码 15 分钟内有效，只出现在服务标准输出（systemd 部署用
                    journalctl -u loose-leaf 查看）；过期或连续输错 5 次会作废，重启服务即可获取新码。
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- =====================================================================
             阶段二：已初始化日常访问（initialized === true）—— 极简双通道对开扉页 (RC-60)
             上半区访客直入 + 下半区主人通道（会话直入 / 扫码配对）
             ===================================================================== -->
        <div
          v-else
          class="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-16 items-center book-spine-crease relative"
        >
          <!-- 左页：典藏装帧手记与全馆编目 -->
          <div class="lg:col-span-6 space-y-8 text-left">
            <div class="flex items-center gap-3">
              <span class="px-2 py-0.5 rounded-xs border border-[var(--border-subtle)] bg-[var(--bg-subtle)]/70 text-[11px] font-mono-archive tracking-widest text-[var(--ink-muted)]">
                卷一 · 典藏本
              </span>
              <span class="text-xs font-mono-archive tracking-wider text-[var(--ink-muted)]">
                典藏本 · 银盐纸张装帧
              </span>
            </div>

            <div class="space-y-4">
              <div class="flex items-baseline gap-4">
                <h1 class="font-serif-editorial text-5xl sm:text-7xl font-normal tracking-tight text-[var(--ink-primary)]">
                  《 散 页 》
                </h1>
                <div class="vermilion-seal px-2 py-0.5 text-xs">
                  散页 藏
                </div>
              </div>

              <div class="font-serif-editorial text-xs tracking-wider text-[var(--ink-muted)]">
                个人生活志 · 日常 · 资产 · 心愿 · 行迹 · 造物
              </div>
            </div>

            <blockquote class="p-5 sm:p-6 rounded-xs bg-[var(--bg-subtle)]/50 border-l-2 border-[var(--accent-warm)] text-[var(--ink-secondary)] font-serif-editorial text-base sm:text-lg italic leading-relaxed">
              “认认真真过好具体的生活，保持安宁与自洽。时间是这里唯一的刻度。”
            </blockquote>

            <div class="space-y-3 pt-2">
              <div class="text-[11px] font-mono-archive text-[var(--ink-muted)] tracking-wider flex items-center justify-between">
                <span>档案馆三大篇章</span>
                <span class="opacity-70">VOL. 01 · 编目手记</span>
              </div>
              <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div
                  v-for="ch in archiveChapters"
                  :key="ch.num"
                  class="p-3.5 rounded-xs border border-[var(--border-subtle)] bg-[var(--bg-subtle)]/30 hover:bg-[var(--bg-subtle)]/60 transition-colors space-y-2 group"
                >
                  <div class="flex items-center justify-between text-[11px] font-mono-archive">
                    <span class="text-[var(--accent-warm)] font-medium">{{ ch.num }}</span>
                    <component :is="ch.icon" class="w-3.5 h-3.5 text-[var(--ink-muted)] group-hover:text-[var(--accent-warm)] transition-colors" />
                  </div>
                  <div class="font-serif-editorial text-xs font-medium text-[var(--ink-primary)]">
                    {{ ch.title }}
                  </div>
                  <p class="font-serif-editorial text-[11px] text-[var(--ink-muted)] leading-relaxed">
                    {{ ch.desc }}
                  </p>
                  <!-- 微缩装帧视窗条 -->
                  <div class="pt-1">
                    <div v-if="ch.num === '01'" class="h-0.5 w-full bg-gradient-to-r from-[var(--accent-warm)]/60 to-transparent rounded-full"></div>
                    <div v-else-if="ch.num === '02'" class="h-0.5 w-full bg-gradient-to-r from-emerald-600/60 to-transparent rounded-full"></div>
                    <div v-else class="h-0.5 w-full bg-gradient-to-r from-[var(--accent-indigo)]/60 to-transparent rounded-full"></div>
                  </div>
                </div>
              </div>
            </div>

            <div class="pt-2 flex flex-wrap items-center gap-x-6 gap-y-1 text-[11px] font-mono-archive text-[var(--ink-muted)] border-t border-[var(--border-subtle)]/60">
              <span>纸张：120g 哑光棉纸</span>
              <span>·</span>
              <span>显影：银盐黑白相纸</span>
              <span>·</span>
              <span>主权：本地优先与私有</span>
            </div>
          </div>

          <!-- 右页：上下一体化典藏书签式双通道卡片 (RC-60) -->
          <div class="lg:col-span-6">
            <div class="rounded-xs border border-[var(--border-subtle)] bg-[var(--bg-subtle)]/35 shadow-xl overflow-hidden text-left">
              <!-- 上半区：访客通道 · 静心翻阅 -->
              <div class="p-6 sm:p-8 space-y-5">
                <div class="flex items-center justify-between">
                  <div class="flex items-center gap-2.5">
                    <BookOpen class="w-4 h-4 text-[var(--accent-warm)]" />
                    <span class="font-serif-editorial text-lg sm:text-xl font-medium text-[var(--ink-primary)]">
                      访客通道 · 静心翻阅
                    </span>
                  </div>
                  <span class="px-2 py-0.5 rounded-xs border border-[var(--border-subtle)] bg-[var(--bg-archive)] text-[11px] font-mono-archive text-[var(--ink-muted)] tracking-wider">
                    公开阅览 · 免密直达
                  </span>
                </div>

                <p class="font-serif-editorial text-xs sm:text-sm text-[var(--ink-secondary)] leading-relaxed">
                  免密零门槛畅读公开生活档案：翻阅日常时间流、35mm 银盐底片影集、手艺造物、心愿单与城市行迹地图。
                </p>

                <button
                  @click="handleEnterAsGuest"
                  class="w-full p-4 sm:p-5 rounded-xs border-2 border-[var(--ink-primary)] bg-[var(--ink-primary)] text-[var(--bg-archive)] hover:opacity-95 transition-all cursor-pointer text-left flex items-center justify-between group shadow-md"
                >
                  <div class="space-y-1">
                    <div class="font-serif-editorial text-lg sm:text-xl font-normal flex items-center gap-2.5">
                      <span>静心翻阅 · 以访客身份进入</span>
                    </div>
                    <div class="font-mono-archive text-[11px] opacity-75">
                      翻开扉页，进入公开生活档案展厅
                    </div>
                  </div>
                  <div class="p-2.5 rounded-full bg-white/10 group-hover:translate-x-1.5 transition-transform shrink-0">
                    <ArrowRight class="w-5 h-5" />
                  </div>
                </button>
              </div>

              <!-- 压凹虚线与火漆印记分割条 -->
              <div class="relative flex items-center justify-center px-6">
                <div class="w-full border-t border-dashed border-[var(--border-divider)]"></div>
                <span class="px-3 py-0.5 bg-[var(--bg-archive)] border border-[var(--border-subtle)] rounded-xs text-[11px] font-mono-archive text-[var(--ink-muted)] tracking-widest shrink-0 -my-2.5">
                  散页 · 主人钤印通道
                </span>
              </div>

              <!-- 下半区：主人通道 · 会话直入 / 设备配对 -->
              <div class="p-6 sm:p-8 pt-7 bg-[var(--bg-archive)]/55 space-y-4">
                <div class="flex items-center justify-between">
                  <div class="flex items-center gap-2">
                    <KeyRound class="w-4 h-4 text-[var(--accent-warm)]" />
                    <span class="font-serif-editorial text-base sm:text-lg font-medium text-[var(--ink-primary)]">
                      主人通道 · 设备配对钤印
                    </span>
                  </div>
                  <span
                    v-if="isCurator"
                    class="text-[11px] font-mono-archive text-[var(--accent-moss)] flex items-center gap-1"
                  >
                    <Check class="w-3 h-3" />
                    <span>本机凭证已就绪</span>
                  </span>
                </div>

                <!-- 若本机已持有有效会话，一键以主人身份直入或注销 -->
                <div
                  v-if="isCurator"
                  class="p-3.5 rounded-xs border border-[var(--accent-moss)]/35 bg-[var(--accent-moss)]/10 flex items-center justify-between gap-3 text-xs font-mono-archive"
                >
                  <div class="flex items-center gap-2 text-[var(--accent-moss)]">
                    <ShieldCheck class="w-4 h-4 shrink-0" />
                    <span>当前浏览器已授信为主理人设备</span>
                  </div>
                  <div class="flex items-center gap-3 shrink-0">
                    <button
                      @click="handleEnterAsGuest"
                      class="px-3 py-1.5 bg-[var(--ink-primary)] text-[var(--bg-archive)] rounded-xs cursor-pointer hover:opacity-90 transition-opacity"
                    >
                      主人直入 →
                    </button>
                    <button
                      @click="handleLogout"
                      class="text-[var(--ink-muted)] hover:text-red-600 cursor-pointer underline"
                    >
                      注销
                    </button>
                  </div>
                </div>

                <!-- 未持有会话：唯一的接入方式是设备配对 -->
                <div
                  v-else
                  class="p-3.5 rounded-xs border border-[var(--border-subtle)] bg-[var(--bg-subtle)]/40 flex items-start gap-3"
                >
                  <ScanLine class="w-4 h-4 text-[var(--accent-warm)] shrink-0 mt-0.5" />
                  <div class="space-y-1">
                    <p class="font-serif-editorial text-xs text-[var(--ink-secondary)] leading-relaxed">
                      请在一台已配对的设备上打开「设置 → 设备配对」，生成新的配对二维码或链接，再用本浏览器扫码或粘贴接入。
                    </p>
                    <p class="text-[11px] font-mono-archive text-[var(--ink-muted)]">
                      若所有设备均已丢失，请删除服务器数据文件用认领码重新开始。
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>

    <!-- 页脚：实体书底款声明 -->
    <footer
      class="w-full border-t border-[var(--border-subtle)] px-6 sm:px-12 py-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs font-mono-archive text-[var(--ink-muted)] relative z-20"
      style="padding-bottom: max(1.5rem, env(safe-area-inset-bottom, 1.5rem));"
    >
      <div class="flex items-center gap-2">
        <ShieldCheck class="w-3.5 h-3.5 text-[var(--accent-moss)]" />
        <span>《散页》· 个人生活志 · 本地优先与数据主权</span>
      </div>

      <div class="flex items-center gap-4">
        <span>© 2024–{{ currentYear }} 《散页》</span>
      </div>
    </footer>
  </div>
</template>
