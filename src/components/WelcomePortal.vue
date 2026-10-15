<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import {
  BookOpen,
  KeyRound,
  PenTool,
  Check,
  RotateCw,
  Copy,
  ShieldCheck,
  Sparkles,
  ArrowRight,
  ArrowLeft,
  Sun,
  Moon,
  Camera,
  Compass,
  Layers,
  Clock,
  Laptop,
  AlertCircle,
} from 'lucide-vue-next'
import CityPicker from './CityPicker.vue'
import { audio } from '../utils/audio'
import { getBeijingYear } from '../utils/format'
import { markEnteredArchive, clearEnteredArchive } from '../utils/auth'
import {
  fetchSystemStatus,
  bootstrapSystem,
  confirmPairingTicket,
  pollPairingTicketStatus,
  verifyMasterPasscode,
  detectBrowserDeviceName,
  getAdminToken,
  setAdminToken,
  removeAdminToken,
  fetchPairQRCode,
} from '../utils/api'
import type { SystemStatus, BootstrapResult } from '../types'

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
const passcode = ref('')
const isLoggingIn = ref(false)
const loginError = ref('')

// 阶段判定 (RC-59 / RC-60)：
// 当 status.initialized === false 时，无条件清空失效的本地残留 Token 并独占渲染阶段一「唯一首次装帧两步向导」
const isBootstrapOnlyStage = computed(() => !status.value.initialized)

// 阶段一：首次装帧两步闭环向导状态 (Step 1: 双次设密 -> Step 2: 散页风二维码/配对深链与设备激活)
const bootstrapStep = ref<1 | 2>(1)
const bootstrapForm = ref({
  curator_name: '',
  city_code: '',
  location: '',
  master_passcode: '',
  confirm_passcode: '',
})
const isBootstrapping = ref(false)
const isConfirmingWebDevice = ref(false)
const bootstrapError = ref('')
const bootstrapTicket = ref<BootstrapResult | null>(null)
const pairCountdown = ref(300)
const pairCopied = ref(false)
const selectedCandidateUrl = ref('')
const isSwitchingNode = ref(false)
let countdownTimer: number | null = null
let pollTimer: number | null = null

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

const onBootstrapCitySelect = (city: { code: string; name: string } | null) => {
  if (!city || (!city.code && !city.name)) {
    bootstrapForm.value.city_code = ''
    bootstrapForm.value.location = ''
    return
  }
  bootstrapForm.value.city_code = city.code || ''
  bootstrapForm.value.location = city.name || ''
}

// 停止配对轮询与倒计时
const stopBootstrapPairingTimers = () => {
  if (countdownTimer) {
    clearInterval(countdownTimer)
    countdownTimer = null
  }
  if (pollTimer) {
    clearInterval(pollTimer)
    pollTimer = null
  }
}

const startBootstrapCountdown = (seconds: number) => {
  if (countdownTimer) clearInterval(countdownTimer)
  pairCountdown.value = seconds
  countdownTimer = window.setInterval(() => {
    if (pairCountdown.value > 0) {
      pairCountdown.value--
    } else {
      stopBootstrapPairingTimers()
    }
  }, 1000)
}

// 启动每 2 秒轮询 GET /api/v1/auth/pair/status?ticket=... (RC-59)
const startBootstrapStatusPolling = (ticket: string) => {
  if (pollTimer) clearInterval(pollTimer)
  pollTimer = window.setInterval(async () => {
    try {
      const res = await pollPairingTicketStatus(ticket)
      if (res.status === 'paired' || res.initialized) {
        if (res.web_token) {
          setAdminToken(res.web_token)
        }
        stopBootstrapPairingTimers()
        audio.playShutter()
        status.value.initialized = true
        isCurator.value = true // 配对成功即主理人，无需重复判定 (FE-22)
        markEnteredArchive()
        emit('bootstrapped')
        emit('enter')
      } else if (res.status === 'expired') {
        pairCountdown.value = 0
        stopBootstrapPairingTimers()
      }
    } catch (err) {
      console.warn('Pairing status poll jitter:', err)
    }
  }, 2000)
}

// Step 1 提交：校验双次密钥一致并上报 window.location.origin 获取散页纸墨风配对凭据 (RC-59)
const handleBootstrapStep1Submit = async () => {
  const name = bootstrapForm.value.curator_name.trim()
  const pass = bootstrapForm.value.master_passcode.trim()
  const confirmPass = bootstrapForm.value.confirm_passcode.trim()

  if (!name) {
    bootstrapError.value = '请输入主理人称谓'
    return
  }
  if (!pass) {
    bootstrapError.value = '请设定管理员密钥'
    return
  }
  if (!confirmPass) {
    bootstrapError.value = '请再次输入确认管理员密钥'
    return
  }
  if (pass !== confirmPass) {
    bootstrapError.value = '两次输入的管理员密钥不一致，请重新核对'
    return
  }

  audio.playTink()
  isBootstrapping.value = true
  bootstrapError.value = ''

  try {
    const res = await bootstrapSystem({
      curator_name: name,
      location: bootstrapForm.value.location.trim() || undefined,
      master_passcode: pass,
      confirm_passcode: confirmPass,
      hub_url: window.location.origin,
    })

    // 后端返回首台设备配对工单 (ticket / qr_payload)，进入 Step 2 等待首台设备绑定激活
    if (res.ticket) {
      bootstrapTicket.value = res
      selectedCandidateUrl.value = res.hub_url || ''
      bootstrapStep.value = 2
      startBootstrapCountdown(res.expires_in_seconds || 300)
      startBootstrapStatusPolling(res.ticket)
    }
  } catch (err: any) {
    bootstrapError.value = err?.message || '发起首次装帧失败，请检查后端服务连接'
  } finally {
    isBootstrapping.value = false
  }
}

const handleSelectCandidate = async (candUrl: string) => {
  if (!bootstrapTicket.value || selectedCandidateUrl.value === candUrl) return
  audio.playTink()
  selectedCandidateUrl.value = candUrl
  isSwitchingNode.value = true
  try {
    const res = await fetchPairQRCode(candUrl, bootstrapTicket.value.ticket)
    bootstrapTicket.value = {
      ...bootstrapTicket.value,
      hub_url: res.hub_url,
      qr_payload: res.qr_payload,
      qr_code_data_url: res.qr_code_data_url,
    }
  } catch (err) {
    console.warn('Switching bootstrap QR endpoint failed:', err)
  } finally {
    isSwitchingNode.value = false
  }
}

// Step 2 开发调试一键暗门：直接将当前浏览器作为首台设备完成装帧并激活系统 (RC-59)
const handleQuickConfirmCurrentBrowser = async () => {
  if (!bootstrapTicket.value?.ticket) return
  audio.playTink()
  isConfirmingWebDevice.value = true
  bootstrapError.value = ''

  try {
    const res = await confirmPairingTicket({
      ticket: bootstrapTicket.value.ticket,
      platform: 'web',
      device_name: detectBrowserDeviceName(),
    })
    if (res.device_token) {
      setAdminToken(res.device_token)
    }
    stopBootstrapPairingTimers()
    audio.playShutter()
    status.value.initialized = true
    isCurator.value = true
    markEnteredArchive()
    emit('bootstrapped')
    emit('enter')
  } catch (err: any) {
    bootstrapError.value = err?.message || '本机设备装帧激活失败，请重试'
  } finally {
    isConfirmingWebDevice.value = false
  }
}

const handleReturnToStep1 = () => {
  audio.playTink()
  stopBootstrapPairingTimers()
  bootstrapError.value = ''
  bootstrapStep.value = 1
}

const copyBootstrapPayload = async () => {
  if (!bootstrapTicket.value?.qr_payload) return
  audio.playTink()
  try {
    await navigator.clipboard.writeText(bootstrapTicket.value.qr_payload)
    pairCopied.value = true
    setTimeout(() => {
      pairCopied.value = false
    }, 2000)
  } catch (err) {
    console.warn('Clipboard write failed:', err)
  }
}

// 阶段二（已初始化）：1. 访客通道直接进入
const handleEnterAsGuest = () => {
  if (isBootstrapOnlyStage.value) return
  audio.playPaperFlip()
  markEnteredArchive()
  emit('enter')
}

// 阶段二（已初始化）：2. 主人通道内联管理员密钥钤印进入 (RC-60)
const handlePasscodeLogin = async () => {
  if (!passcode.value.trim()) {
    loginError.value = '请输入管理员密钥'
    return
  }
  audio.playTink()
  isLoggingIn.value = true
  loginError.value = ''
  try {
    await verifyMasterPasscode(passcode.value.trim())
    audio.playShutter()
    isCurator.value = true
    passcode.value = ''
    markEnteredArchive()
    emit('enter')
  } catch (err: any) {
    loginError.value = err?.message || '管理员密钥不正确，请重新核对'
  } finally {
    isLoggingIn.value = false
  }
}

// 退出主人身份
const handleLogout = () => {
  audio.playTink()
  removeAdminToken()
  clearEnteredArchive()
  isCurator.value = false
}

const todayDisplay = computed(() => {
  const now = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${now.getFullYear()}.${pad(now.getMonth() + 1)}.${pad(now.getDate())}`
})

// 阶段一：首次装帧三步流程说明
const bootstrapGuides = [
  {
    num: '01',
    title: '设定主理人称谓与专属密钥',
    desc: '铭刻您的称谓、常居城市与管理员密钥，守护私人账簿与生活手稿。',
  },
  {
    num: '02',
    title: '生成首台设备配对印信',
    desc: '生成专属纸墨二维码与配对链接，供随身手机或桌面端扫码接入。',
  },
  {
    num: '03',
    title: '首台设备授信后开启展厅',
    desc: '支持移动端扫码、桌面端粘贴配对链接，或直接将当前浏览器设为首台受信任设备。',
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

onMounted(async () => {
  checkCuratorAuth()
  try {
    const s = await fetchSystemStatus()
    applySystemStatus(s)
  } catch (err) {
    console.error('Failed to fetch system status in portal:', err)
  }
})

onUnmounted(() => {
  stopBootstrapPairingTimers()
})
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
          {{ isBootstrapOnlyStage ? 'VOL. 01 · 创刊装帧' : 'VOL. 01 · 创刊扉页' }}
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
             阶段一：未初始化冷启动（!initialized && !isCurator）—— 独占式「首次装帧向导」(RC-59)
             严禁渲染任何访客入口或模式切换按钮
             ===================================================================== -->
        <div
          v-if="isBootstrapOnlyStage"
          class="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-16 items-center"
        >
          <!-- 左页：素胚典藏封皮与装帧导言 -->
          <div class="lg:col-span-6 space-y-8 text-left">
            <div class="flex items-center gap-3">
              <span class="px-2 py-0.5 rounded-xs border border-[var(--accent-warm)]/40 bg-[var(--accent-warm)]/10 text-[10px] font-mono-archive tracking-widest text-[var(--accent-warm)]">
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
              “此档案馆尚处素胚状态。请主理人设定专属密钥并完成首台设备钤印，装帧完成后方可开启日常记录与公开展览。”
            </blockquote>

            <div class="space-y-3 pt-1">
              <div class="text-[11px] font-mono-archive text-[var(--ink-muted)] tracking-wider">
                装帧流程说明
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

          <!-- 右页：唯一首次装帧两步闭环向导 -->
          <div class="lg:col-span-6">
            <div class="p-6 sm:p-8 rounded-xs border border-[var(--accent-warm)]/60 bg-[var(--bg-subtle)]/40 shadow-xl space-y-6 text-left min-h-[430px] flex flex-col justify-between">
              <!-- 向导页眉 -->
              <div class="flex items-center justify-between border-b border-[var(--border-subtle)] pb-4 shrink-0">
                <div class="flex items-center gap-2.5">
                  <PenTool class="w-4 h-4 text-[var(--accent-warm)]" />
                  <span class="font-serif-editorial text-lg sm:text-xl font-medium text-[var(--ink-primary)]">
                    首次装帧 · 筑造私人档案馆
                  </span>
                </div>
                <span class="px-2 py-0.5 rounded-xs bg-[var(--accent-warm)]/15 text-[var(--accent-warm)] text-[10px] font-mono-archive tracking-widest">
                  STEP 0{{ bootstrapStep }} / 02
                </span>
              </div>

              <!-- Step 1: 设定主理人档案与双重确认密钥 -->
              <div v-if="bootstrapStep === 1" class="space-y-5 flex-1">
                <p class="font-serif-editorial text-xs sm:text-sm text-[var(--ink-secondary)] leading-relaxed">
                  第一步：请填写主理人称谓并设定管理员密钥，随后进入首台设备授信激活。
                </p>

                <div class="space-y-4 font-mono-archive text-xs">
                  <div class="space-y-1.5">
                    <label class="block text-[var(--ink-muted)]">主理人称谓 *</label>
                    <input
                      v-model="bootstrapForm.curator_name"
                      type="text"
                      placeholder="请输入主理人称谓"
                      class="w-full px-3 py-2 bg-[var(--bg-archive)] border border-[var(--border-subtle)] focus:border-[var(--ink-primary)] rounded-xs outline-none text-[var(--ink-primary)]"
                    />
                  </div>

                  <div class="space-y-1.5">
                    <div class="flex items-center justify-between">
                      <label class="block text-[var(--ink-muted)]">常驻城市 (选填)</label>
                      <span v-if="bootstrapForm.location" class="text-[11px] text-[var(--accent-moss)]">
                        已选：{{ bootstrapForm.location }}
                      </span>
                    </div>
                    <CityPicker
                      v-model="bootstrapForm.city_code"
                      placeholder="输入城市名称或拼音检索常驻城市..."
                      @select="onBootstrapCitySelect"
                    />
                  </div>

                  <div class="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                    <div class="space-y-1.5">
                      <label class="block text-[var(--ink-muted)]">管理员密钥 *</label>
                      <input
                        v-model="bootstrapForm.master_passcode"
                        type="password"
                        placeholder="设定专属管理员密钥"
                        class="w-full px-3 py-2 bg-[var(--bg-archive)] border border-[var(--border-subtle)] focus:border-[var(--ink-primary)] rounded-xs outline-none text-[var(--ink-primary)]"
                      />
                    </div>
                    <div class="space-y-1.5">
                      <label class="block text-[var(--ink-muted)]">确认管理员密钥 *</label>
                      <input
                        v-model="bootstrapForm.confirm_passcode"
                        type="password"
                        placeholder="再次输入以确认密钥"
                        @keydown.enter="handleBootstrapStep1Submit"
                        class="w-full px-3 py-2 bg-[var(--bg-archive)] border border-[var(--border-subtle)] focus:border-[var(--ink-primary)] rounded-xs outline-none text-[var(--ink-primary)]"
                      />
                    </div>
                  </div>

                  <div
                    v-if="bootstrapError"
                    class="p-2.5 rounded-xs bg-red-500/10 border border-red-500/30 text-red-600 dark:text-red-400 text-[11px] flex items-center gap-2"
                  >
                    <AlertCircle class="w-3.5 h-3.5 shrink-0" />
                    <span>{{ bootstrapError }}</span>
                  </div>

                  <button
                    @click="handleBootstrapStep1Submit"
                    :disabled="isBootstrapping"
                    class="w-full py-3 px-4 bg-[var(--accent-warm)] text-white text-xs font-mono-archive rounded-xs cursor-pointer hover:opacity-90 disabled:opacity-50 transition-opacity flex items-center justify-center gap-2 shadow-sm"
                  >
                    <Sparkles class="w-3.5 h-3.5" />
                    <span>{{ isBootstrapping ? '正在生成首台设备配对凭据...' : '下一步 · 生成首台设备配对凭据 →' }}</span>
                  </button>
                </div>
              </div>

              <!-- Step 2: 首台设备绑定与系统激活 (散页纸墨风二维码装裱 + 开发一键暗门 RC-59 / RC-61) -->
              <div v-else class="space-y-5">
                <div class="flex items-center justify-between text-xs font-mono-archive text-[var(--ink-muted)]">
                  <button
                    @click="handleReturnToStep1"
                    class="inline-flex items-center gap-1 hover:text-[var(--ink-primary)] cursor-pointer transition-colors"
                  >
                    <ArrowLeft class="w-3.5 h-3.5" />
                    <span>返回修改密钥</span>
                  </button>
                  <span class="inline-flex items-center gap-1.5 text-[var(--accent-warm)]">
                    <Clock class="w-3.5 h-3.5" />
                    <span>配对有效期 {{ pairCountdown }}s</span>
                  </span>
                </div>

                <!-- 散页纸墨风二维码暗房装裱框 + 配对深链 -->
                <div class="p-4 sm:p-5 bg-[var(--bg-archive)]/80 border border-[var(--border-subtle)] rounded-xs flex flex-col sm:flex-row items-center gap-5">
                  <!-- 散页纸墨风二维码装裱容器 (.film-frame + 四角复古裁切基准线 + #F9F8F5 棉纸内衬 RC-61) -->
                  <div class="film-frame p-4 rounded-xs relative inline-flex flex-col items-center shrink-0">
                    <span class="pointer-events-none absolute top-1.5 left-1.5 w-2.5 h-2.5 border-t-2 border-l-2 border-[var(--accent-warm)]/80"></span>
                    <span class="pointer-events-none absolute top-1.5 right-1.5 w-2.5 h-2.5 border-t-2 border-r-2 border-[var(--accent-warm)]/80"></span>
                    <span class="pointer-events-none absolute bottom-1.5 left-1.5 w-2.5 h-2.5 border-b-2 border-l-2 border-[var(--accent-warm)]/80"></span>
                    <span class="pointer-events-none absolute bottom-1.5 right-1.5 w-2.5 h-2.5 border-b-2 border-r-2 border-[var(--accent-warm)]/80"></span>

                    <div class="p-2.5 bg-[#F9F8F5] text-[#181716] rounded-xs border border-[#181716]/15 shadow-inner relative">
                      <img
                        v-if="bootstrapTicket?.qr_code_data_url"
                        :src="bootstrapTicket.qr_code_data_url"
                        alt="首台设备配对二维码"
                        class="w-36 h-36 object-contain block"
                      />
                      <div
                        v-else
                        class="w-36 h-36 flex items-center justify-center text-[11px] font-mono-archive text-[#57544e] text-center px-2"
                      >
                        使用移动端扫码或复制配对深链
                      </div>

                      <!-- 过期遮罩 -->
                      <div
                        v-if="pairCountdown <= 0"
                        class="absolute inset-0 bg-[#F9F8F5]/95 flex flex-col items-center justify-center p-3 text-center space-y-2"
                      >
                        <span class="text-[11px] font-mono-archive text-[#57544e]">配对凭据已过期</span>
                        <button
                          @click="handleBootstrapStep1Submit"
                          class="px-2.5 py-1 bg-[#181716] text-[#F9F8F5] text-[10px] font-mono-archive rounded-xs cursor-pointer inline-flex items-center gap-1"
                        >
                          <RotateCw class="w-3 h-3" />
                          <span>重新生成</span>
                        </button>
                      </div>
                    </div>

                    <div class="mt-2 flex items-center justify-center w-full text-[10px] font-mono-archive text-[var(--ink-muted)] tracking-wider px-0.5">
                      <span>扫码或复制链接接入</span>
                    </div>
                  </div>

                  <!-- 右侧：首台设备扫码/链接配对与实时监听状态 -->
                  <div class="flex-1 space-y-3 text-center sm:text-left">
                    <div class="space-y-1">
                      <div class="text-[11px] font-mono-archive text-[var(--accent-warm)] tracking-widest uppercase">
                        INITIAL DEVICE PAIRING · 首台设备授信
                      </div>
                      <h4 class="font-serif-editorial text-base sm:text-lg font-medium text-[var(--ink-primary)]">
                        扫码极速接入 或 复制配对深链
                      </h4>
                    </div>

                    <div class="flex items-center justify-center sm:justify-start gap-2 text-xs font-mono-archive text-[var(--accent-moss)]">
                      <span class="inline-block w-2 h-2 rounded-full bg-[var(--accent-moss)] animate-pulse"></span>
                      <span>正在监听首台设备接入...</span>
                    </div>

                    <p class="font-serif-editorial text-xs text-[var(--ink-secondary)] leading-relaxed">
                      请使用移动端扫描左侧纸墨二维码，或复制配对深链至 macOS 客户端一键完成设备钤印；接入后本页将自动激活并进入展厅。
                    </p>

                    <!-- 接入节点智能切换胶囊 -->
                    <div v-if="(bootstrapTicket?.candidates || []).length > 1" class="space-y-1.5 pt-1">
                      <div class="text-[11px] font-mono-archive text-[var(--ink-muted)] flex items-center justify-between">
                        <span>选择连接节点：</span>
                        <span v-if="isSwitchingNode" class="text-[var(--accent-warm)]">正在更新二维码...</span>
                      </div>
                      <div class="flex flex-wrap gap-1.5 font-mono-archive text-[11px]">
                        <button
                          v-for="cand in bootstrapTicket?.candidates"
                          :key="cand.url"
                          type="button"
                          @click="handleSelectCandidate(cand.url)"
                          class="px-2.5 py-1.5 rounded-xs border transition-colors cursor-pointer inline-flex items-center gap-1.5 whitespace-nowrap text-xs select-none"
                          :class="
                            selectedCandidateUrl === cand.url
                              ? 'border-[var(--accent-warm)] bg-[var(--accent-warm)]/10 text-[var(--accent-warm)] font-medium'
                              : 'border-[var(--border-subtle)] text-[var(--ink-secondary)] hover:border-[var(--ink-primary)] hover:text-[var(--ink-primary)]'
                          "
                        >
                          <span
                            class="w-1.5 h-1.5 rounded-full shrink-0"
                            :class="selectedCandidateUrl === cand.url ? 'bg-[var(--accent-warm)]' : 'bg-[var(--border-divider)]'"
                          ></span>
                          <span>{{ cand.label }}</span>
                          <span class="opacity-70 text-[11px] font-mono-archive">({{ cand.ip }})</span>
                        </button>
                      </div>
                    </div>

                    <div
                      v-if="bootstrapTicket?.qr_payload"
                      class="pt-1 flex flex-wrap items-center justify-center sm:justify-start gap-2 text-[11px] font-mono-archive"
                    >
                      <button
                        @click="copyBootstrapPayload"
                        class="px-3 py-1.5 border border-[var(--border-subtle)] hover:border-[var(--ink-primary)] bg-[var(--bg-archive)] rounded-xs cursor-pointer inline-flex items-center gap-1.5 text-[var(--ink-secondary)] hover:text-[var(--ink-primary)] transition-colors"
                      >
                        <component :is="pairCopied ? Check : Copy" class="w-3.5 h-3.5 text-[var(--accent-warm)]" />
                        <span>{{ pairCopied ? '已复制配对深链' : '复制配对深链' }}</span>
                      </button>
                      <span v-if="bootstrapTicket?.hub_url" class="text-[10px] text-[var(--ink-muted)] truncate max-w-[200px]">
                        {{ bootstrapTicket.hub_url }}
                      </span>
                    </div>
                  </div>
                </div>

                <div
                  v-if="bootstrapError"
                  class="p-2.5 rounded-xs bg-red-500/10 border border-red-500/30 text-red-600 dark:text-red-400 text-[11px] font-mono-archive flex items-center gap-2"
                >
                  <AlertCircle class="w-3.5 h-3.5 shrink-0" />
                  <span>{{ bootstrapError }}</span>
                </div>

                <!-- 本机浏览器直连激活 -->
                <div class="pt-3 border-t border-dashed border-[var(--border-divider)] space-y-2">
                  <button
                    @click="handleQuickConfirmCurrentBrowser"
                    :disabled="isConfirmingWebDevice || pairCountdown <= 0"
                    class="w-full py-2.5 px-4 rounded-xs border border-[var(--ink-primary)] bg-[var(--ink-primary)] text-[var(--bg-archive)] hover:opacity-90 disabled:opacity-50 transition-opacity cursor-pointer text-xs font-mono-archive flex items-center justify-center gap-2 shadow-sm"
                  >
                    <Laptop class="w-3.5 h-3.5 text-[var(--accent-warm)]" />
                    <span>
                      {{
                        isConfirmingWebDevice
                          ? '正在将当前浏览器设为首台设备...'
                          : '在此浏览器直接完成装帧并进入展厅 →'
                      }}
                    </span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- =====================================================================
             阶段二：已初始化日常访问（initialized === true）—— 极简双通道对开扉页 (RC-60)
             上半区访客直入 + 下半区内联密钥登堂，彻底移除网页反向扫码与子页面切换
             ===================================================================== -->
        <div
          v-else
          class="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-16 items-center book-spine-crease relative"
        >
          <!-- 左页：典藏装帧手记与全馆编目 -->
          <div class="lg:col-span-6 space-y-8 text-left">
            <div class="flex items-center gap-3">
              <span class="px-2 py-0.5 rounded-xs border border-[var(--border-subtle)] bg-[var(--bg-subtle)]/70 text-[10px] font-mono-archive tracking-widest text-[var(--ink-muted)]">
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
                  <div class="flex items-center justify-between text-[10px] font-mono-archive">
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
                  <span class="px-2 py-0.5 rounded-xs border border-[var(--border-subtle)] bg-[var(--bg-archive)] text-[10px] font-mono-archive text-[var(--ink-muted)] tracking-wider">
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
                <span class="px-3 py-0.5 bg-[var(--bg-archive)] border border-[var(--border-subtle)] rounded-xs text-[10px] font-mono-archive text-[var(--ink-muted)] tracking-widest shrink-0 -my-2.5">
                  散页 · 主人钤印通道
                </span>
              </div>

              <!-- 下半区：主人通道 · 管理员密钥钤印 (直接内联，无需二次切换) -->
              <div class="p-6 sm:p-8 pt-7 bg-[var(--bg-archive)]/55 space-y-4">
                <div class="flex items-center justify-between">
                  <div class="flex items-center gap-2">
                    <KeyRound class="w-4 h-4 text-[var(--accent-warm)]" />
                    <span class="font-serif-editorial text-base sm:text-lg font-medium text-[var(--ink-primary)]">
                      主人通道 · 管理员密钥钤印
                    </span>
                  </div>
                  <span
                    v-if="isCurator"
                    class="text-[10px] font-mono-archive text-[var(--accent-moss)] flex items-center gap-1"
                  >
                    <Check class="w-3 h-3" />
                    <span>本机凭证已就绪</span>
                  </span>
                </div>

                <p class="font-serif-editorial text-xs text-[var(--ink-muted)] leading-relaxed">
                  输入首次装帧设定的管理员密钥，为当前浏览器签发专属受信任设备令牌，解锁记录编纂、私密账簿与多端配对中枢。
                </p>

                <!-- 若本机已持有管理员凭证，提供一键以主人身份直入或注销 -->
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

                <!-- 内联管理员密钥输入框 + 钤印进入按钮 -->
                <div class="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 pt-1">
                  <input
                    v-model="passcode"
                    type="password"
                    placeholder="请输入管理员密钥..."
                    @keydown.enter="handlePasscodeLogin"
                    class="flex-1 px-3.5 py-2.5 text-xs font-mono-archive bg-[var(--bg-archive)] border border-[var(--border-subtle)] focus:border-[var(--ink-primary)] rounded-xs outline-none text-[var(--ink-primary)]"
                  />
                  <button
                    @click="handlePasscodeLogin"
                    :disabled="isLoggingIn || !passcode.trim()"
                    class="px-5 py-2.5 bg-[var(--accent-warm)] text-white text-xs font-mono-archive rounded-xs cursor-pointer hover:opacity-90 disabled:opacity-50 transition-opacity inline-flex items-center justify-center gap-1.5 shrink-0 shadow-xs"
                  >
                    <span>{{ isLoggingIn ? '钤印核验中...' : '钤印进入' }}</span>
                    <ArrowRight class="w-3.5 h-3.5" />
                  </button>
                </div>

                <div
                  v-if="loginError"
                  class="text-xs font-mono-archive text-red-600 dark:text-red-400 flex items-center gap-1.5"
                >
                  <AlertCircle class="w-3.5 h-3.5 shrink-0" />
                  <span>{{ loginError }}</span>
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
