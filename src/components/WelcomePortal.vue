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
  AlertCircle,
} from 'lucide-vue-next'
import { getBeijingDotDate, getBeijingYear } from '../utils/format'
import {
  markEnteredArchive,
  clearEnteredArchive,
  redirectToOIDCLogin,
  logoutAndReload,
} from '../utils/auth'
import {
  claimDevice,
  getAdminToken,
  removeAdminToken,
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
  oidc_enabled: false,
  oidc_provider_name: 'Vesper Auth',
})

const isOIDCEnabled = computed(() => Boolean(status.value.oidc_enabled))

// 主理人凭证状态（响应式跟随 getAdminToken 与 /auth/session 探针结果）
const isCurator = computed(() => Boolean(getAdminToken()))

// 阶段判定 (RC-59 / RC-60)：
// 当 status.initialized === false 时，独占渲染阶段一「首次创刊向导」
const isBootstrapOnlyStage = computed(() => claimSuccess.value || !status.value.initialized)

// 阶段一（纯局域网兜底模式）：一次性认领码认领首台设备
const claimCode = ref('')
const isClaiming = ref(false)
const claimError = ref('')
const claimSuccess = ref(false)

const applySystemStatus = (s: SystemStatus) => {
  status.value = s
  if (!s.initialized) {
    removeAdminToken()
    clearEnteredArchive()
  }
}

const handleOIDCLogin = () => {
  redirectToOIDCLogin('/')
}

// 提交认领码：POST /api/v1/auth/claim，成功后当前浏览器成为首台受信任设备
const handleClaimSubmit = async () => {
  const code = claimCode.value.trim().toUpperCase()
  if (!code) {
    claimError.value = '请输入服务启动时打印的认领码'
    return
  }

  isClaiming.value = true
  claimError.value = ''
  try {
    await claimDevice({ code })
    claimSuccess.value = true
    status.value.initialized = true
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
  emit('enter')
}

// 阶段二（已初始化）：1. 访客通道直接进入
const handleEnterAsGuest = () => {
  if (isBootstrapOnlyStage.value) return
  markEnteredArchive()
  emit('enter')
}

// 退出主人身份
const handleLogout = () => logoutAndReload()

const todayDisplay = computed(() => getBeijingDotDate())

// 阶段一：首次创刊流程说明（按 OIDC 单点登录 / 局域网认领码自适应切换）
const bootstrapGuides = computed(() => {
  if (isOIDCEnabled.value) {
    return [
      {
        num: '01',
        title: '验证 Vesper Auth 通行证',
        desc: '通过统一身份认证中心完成 Passkey 或主理人凭证核验，无需翻找服务器启动日志。',
      },
      {
        num: '02',
        title: '自动完成创刊与会话签发',
        desc: '主理人白名单核验通过后，自动激活私人档案馆并为本浏览器签发 HttpOnly 会话凭证。',
      },
      {
        num: '03',
        title: '跨端设备一键接入',
        desc: 'macOS 桌面端与 Android 随行端同样支持通过 Vesper Auth 通行证一键绑定。',
      },
    ]
  }
  return [
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
      title: '建议配置 OAuth 2.0 统一登录',
      desc: '在服务端启用 Vesper Auth (OIDC) 后，所有桌面端与移动端均可直接通过账号登录同步。',
    },
  ]
})

// 阶段二：档案馆三大篇章概览
const archiveChapters = [
  {
    num: '01',
    icon: Compass,
    title: '散页与日常印记',
    desc: '随笔、微小触动、生活刻度与具体日常。',
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
    title: '收支账簿与心愿单',
    desc: '日常收支光谱、信贷分期与生活向往。',
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
                个人生活志 · 日常 · 记账 · 心愿
              </div>
            </div>

            <blockquote class="p-5 sm:p-6 rounded-xs bg-[var(--bg-subtle)]/50 border-l-2 border-[var(--accent-warm)] text-[var(--ink-secondary)] font-serif-editorial text-base sm:text-lg italic leading-relaxed">
              <template v-if="isOIDCEnabled">
                “此档案馆尚处素胚状态。请通过 Vesper Auth 通行证完成主理人身份核验，一键激活创刊并开启日常记录。”
              </template>
              <template v-else>
                “此档案馆尚处素胚状态。请查看服务启动日志中的认领码完成首次认领，随后开启日常记录与公开展览。”
              </template>
            </blockquote>

            <div class="space-y-3 pt-1">
              <div class="text-[11px] font-mono-archive text-[var(--ink-muted)] tracking-wider">
                {{ isOIDCEnabled ? '创刊激活流程说明' : '首次认领流程说明' }}
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

          <!-- 右页：首次创刊激活卡片（Vesper Auth SSO 或纯局域网认领码兜底） -->
          <div class="lg:col-span-6">
            <div class="p-6 sm:p-8 rounded-xs border border-[var(--accent-warm)]/60 bg-[var(--bg-subtle)]/40 shadow-xl space-y-6 text-left min-h-[430px] flex flex-col justify-between">
              <!-- 页眉 -->
              <div class="flex items-center justify-between border-b border-[var(--border-subtle)] pb-4 shrink-0">
                <div class="flex items-center gap-2.5">
                  <PenTool class="w-4 h-4 text-[var(--accent-warm)]" />
                  <span class="font-serif-editorial text-lg sm:text-xl font-medium text-[var(--ink-primary)]">
                    {{ isOIDCEnabled ? '首次创刊 · 通行证一键激活' : '首次认领 · 筑造私人档案馆' }}
                  </span>
                </div>
                <span class="px-2 py-0.5 rounded-xs bg-[var(--accent-warm)]/15 text-[var(--accent-warm)] text-[11px] font-mono-archive tracking-widest">
                  {{ isOIDCEnabled ? 'SSO' : 'CLAIM' }}
                </span>
              </div>

              <!-- 认领成功：提示备份后进入展厅 -->
              <div v-if="claimSuccess" class="space-y-5 flex-1 flex flex-col justify-center">
                <div class="p-4 rounded-xs border border-[var(--accent-moss)]/35 bg-[var(--accent-moss)]/10 flex items-start gap-3">
                  <Check class="w-4 h-4 text-[var(--accent-moss)] shrink-0 mt-0.5" />
                  <div class="space-y-1.5">
                    <div class="font-serif-editorial text-sm font-medium text-[var(--ink-primary)]">
                      主理人会话已激活
                    </div>
                    <p class="font-serif-editorial text-xs text-[var(--ink-secondary)] leading-relaxed">
                      你现在可以进入展厅开始记录，也可以随时在服务端配置 OAuth 2.0 登录以同步多端客户端。
                    </p>
                  </div>
                </div>

                <button
                  @click="handleClaimEnter"
                  class="w-full min-h-[44px] py-3 px-4 bg-[var(--accent-warm)] text-white text-xs font-mono-archive rounded-xs cursor-pointer hover:opacity-90 transition-opacity flex items-center justify-center gap-2 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-warm)]"
                >
                  <span>翻开扉页 · 进入展厅</span>
                  <ArrowRight class="w-3.5 h-3.5" />
                </button>
              </div>

              <!-- OIDC 统一单点登录一键创刊激活 -->
              <div v-else-if="isOIDCEnabled" class="space-y-6 flex-1 flex flex-col justify-between">
                <div class="space-y-4">
                  <p class="font-serif-editorial text-xs sm:text-sm text-[var(--ink-secondary)] leading-relaxed">
                    本档案馆已接入统一身份认证中心。主理人首次通过通行证核验后，系统将在同一事务内自动激活创刊，并为当前浏览器签发受保护的会话凭证。
                  </p>

                  <div class="p-4 rounded-xs border border-[var(--border-subtle)] bg-[var(--bg-archive)]/65 space-y-2">
                    <div class="text-xs font-serif-editorial font-medium text-[var(--ink-primary)] flex items-center gap-2">
                      <ShieldCheck class="w-3.5 h-3.5 text-[var(--accent-moss)] shrink-0" />
                      <span>单一主理人白名单准入</span>
                    </div>
                    <p class="text-[11px] font-serif-editorial text-[var(--ink-muted)] leading-relaxed">
                      仅允许预先授权的主理人通行证账号完成创刊与管理；若已在同一浏览器的其他同域服务登录 Vesper Auth，将直接无感进入主理人模式。
                    </p>
                  </div>
                </div>

                <div class="space-y-4 font-mono-archive text-xs">
                  <button
                    type="button"
                    @click="handleOIDCLogin"
                    class="w-full min-h-[48px] py-3.5 px-4 bg-[var(--accent-warm)] text-white text-xs font-mono-archive rounded-xs cursor-pointer hover:opacity-90 active:scale-[0.99] transition-all flex items-center justify-center gap-2 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-warm)]"
                  >
                    <KeyRound class="w-3.5 h-3.5" />
                    <span>通过 Vesper Auth 通行证进入</span>
                    <ArrowRight class="w-3.5 h-3.5" />
                  </button>

                  <p class="text-[11px] font-mono-archive text-[var(--ink-muted)] leading-relaxed border-t border-[var(--border-subtle)]/60 pt-3">
                    认证协议：OAuth 2.0 / OpenID Connect + PKCE (S256) · 会话由 HttpOnly Cookie 承载。
                  </p>
                </div>
              </div>

              <!-- 局域网离线部署兜底：认领码输入 -->
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
                    class="min-h-[36px] flex items-center"
                  >
                    <div
                      v-if="claimError"
                      class="w-full p-2 rounded-xs bg-red-500/10 border border-red-500/30 text-red-600 dark:text-red-400 text-[11px] flex items-start gap-2"
                    >
                      <AlertCircle class="w-3.5 h-3.5 shrink-0 mt-0.5" />
                      <span>{{ claimError }}</span>
                    </div>
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
                个人生活志 · 日常 · 记账 · 心愿
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
                  免密零门槛畅读公开生活档案：翻阅日常散页、35mm 银盐底片影集、心愿单与年度生活年鉴。
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

              <!-- 下半区：主理人账号登录 -->
              <div class="p-6 sm:p-8 pt-7 bg-[var(--bg-archive)]/55 space-y-4">
                <div class="flex items-center justify-between">
                  <div class="flex items-center gap-2">
                    <KeyRound class="w-4 h-4 text-[var(--accent-warm)]" />
                    <span class="font-serif-editorial text-base sm:text-lg font-medium text-[var(--ink-primary)]">
                      {{ isOIDCEnabled ? '主理人登录 · Vesper Auth' : '主理人登录' }}
                    </span>
                  </div>
                  <span
                    class="text-[11px] font-mono-archive text-[var(--accent-moss)] flex items-center gap-1 transition-opacity"
                    :class="isCurator ? 'opacity-100' : 'opacity-0 pointer-events-none'"
                  >
                    <Check class="w-3 h-3" />
                    <span>已登录</span>
                  </span>
                </div>

                <!-- 若当前浏览器已登录，一键以主理人身份直入或退出 -->
                <div
                  v-if="isCurator"
                  class="p-3.5 rounded-xs border border-[var(--accent-moss)]/35 bg-[var(--accent-moss)]/10 flex items-center justify-between gap-3 text-xs font-mono-archive min-h-[128px]"
                >
                  <div class="flex items-center gap-2 text-[var(--accent-moss)]">
                    <ShieldCheck class="w-4 h-4 shrink-0" />
                    <span>当前已登录主理人账号</span>
                  </div>
                  <div class="flex items-center gap-3 shrink-0">
                    <button
                      @click="handleEnterAsGuest"
                      class="px-3 py-1.5 bg-[var(--ink-primary)] text-[var(--bg-archive)] rounded-xs cursor-pointer hover:opacity-90 transition-opacity"
                    >
                      进入展厅 →
                    </button>
                    <button
                      @click="handleLogout"
                      class="text-[var(--ink-muted)] hover:text-red-600 cursor-pointer underline"
                    >
                      退出登录
                    </button>
                  </div>
                </div>

                <!-- 未登录且启用了 OIDC：使用 Vesper Auth 账号登录 -->
                <div
                  v-else-if="isOIDCEnabled"
                  class="p-4 rounded-xs border border-[var(--border-subtle)] bg-[var(--bg-subtle)]/40 flex flex-col justify-between gap-3.5 min-h-[128px]"
                >
                  <p class="font-serif-editorial text-xs text-[var(--ink-secondary)] leading-relaxed">
                    使用 Vesper Auth 账号完成身份验证，进入完整个人档案与账本管理。
                  </p>
                  <button
                    type="button"
                    @click="handleOIDCLogin"
                    class="w-full min-h-[44px] py-2.5 px-4 bg-[var(--accent-warm)] text-white text-xs font-mono-archive rounded-xs cursor-pointer hover:opacity-90 active:scale-[0.99] transition-all flex items-center justify-center gap-2 shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-warm)]"
                  >
                    <KeyRound class="w-3.5 h-3.5" />
                    <span>使用 Vesper Auth 登录</span>
                    <ArrowRight class="w-3.5 h-3.5" />
                  </button>
                </div>

                <!-- 纯局域网离线部署兜底：浏览器会话与认领说明 -->
                <div
                  v-else
                  class="p-3.5 rounded-xs border border-[var(--border-subtle)] bg-[var(--bg-subtle)]/40 flex items-start gap-3 min-h-[128px]"
                >
                  <KeyRound class="w-4 h-4 text-[var(--accent-warm)] shrink-0 mt-0.5" />
                  <div class="space-y-1">
                    <p class="font-serif-editorial text-xs text-[var(--ink-secondary)] leading-relaxed">
                      当前未启用 OAuth 2.0 单点登录，且本浏览器尚未持有主理人会话。
                    </p>
                    <p class="text-[11px] font-mono-archive text-[var(--ink-muted)]">
                      如需为本浏览器重新建立管理会话，请在服务端开启 OIDC 配置或通过恢复参数重开首次认领入口。
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
