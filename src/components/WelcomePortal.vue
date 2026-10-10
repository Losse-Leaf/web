<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import {
  BookOpen,
  KeyRound,
  PenTool,
  QrCode,
  Check,
  RotateCw,
  Copy,
  ShieldCheck,
  Sparkles,
  ArrowRight,
  Lock,
  Sun,
  Moon,
  Camera,
  Compass,
  Layers,
  Smartphone,
} from 'lucide-vue-next'
import { audio } from '../utils/audio'
import { markEnteredArchive, clearEnteredArchive } from '../utils/auth'
import {
  fetchSystemStatus,
  bootstrapSystem,
  createQRLoginSession,
  pollQRLoginSession,
  verifyMasterPasscode,
  getAdminToken,
  removeAdminToken,
} from '../utils/api'
import type { SystemStatus, QRLoginSession } from '../types'

const props = defineProps<{
  theme: 'paper' | 'darkroom'
  systemStatus?: SystemStatus | null
}>()

const emit = defineEmits<{
  (e: 'enter'): void
  (e: 'toggleTheme'): void
  (e: 'bootstrapped'): void
}>()

// 视图子模式：'landing' (封面主页), 'qr' (扫码登入), 'passcode' (口令登入), 'bootstrap' (首次装帧)
const currentMode = ref<'landing' | 'qr' | 'passcode' | 'bootstrap'>('landing')

// 本地系统状态缓存 (由后端 GET /api/v1/system/status 驱动)
const status = ref<SystemStatus>({
  initialized: true,
  site_name: '散页',
  curator_name: '',
})

// 登录状态
const isCurator = ref(Boolean(getAdminToken()))
const passcode = ref('')
const isLoggingIn = ref(false)
const loginError = ref('')

// 首次装帧表单 (纯空白输入，严禁预置任何特定个人身份与英文名)
const bootstrapForm = ref({
  curator_name: '',
  location: '',
  master_passcode: '',
  master_key: '',
})
const isBootstrapping = ref(false)
const bootstrapError = ref('')

// 扫码登录会话状态
const qrSession = ref<QRLoginSession | null>(null)
const qrTimeRemaining = ref(120)
const qrCopied = ref(false)
const isQrPolling = ref(false)
let qrTimer: number | null = null
let pollTimer: number | null = null

// 检查是否已有凭据
const checkCuratorAuth = () => {
  isCurator.value = Boolean(getAdminToken())
}

// 1. 静心翻阅 · 游客直接进入主网站
const handleEnterAsGuest = () => {
  audio.playTink()
  markEnteredArchive()
  emit('enter')
}

// 2. 扫码登录逻辑
const startQRLogin = async () => {
  audio.playTink()
  currentMode.value = 'qr'
  loginError.value = ''
  await refreshQRSession()
}

const refreshQRSession = async () => {
  stopQRPolling()
  try {
    const sess = await createQRLoginSession()
    qrSession.value = sess
    qrTimeRemaining.value = sess.expires_in_seconds || 120
    startQRCountdown()
    startQRPolling(sess.session_id)
  } catch (err: any) {
    loginError.value = err?.message || '获取登录二维码失败'
  }
}

const startQRCountdown = () => {
  if (qrTimer) clearInterval(qrTimer)
  qrTimer = window.setInterval(() => {
    if (qrTimeRemaining.value > 0) {
      qrTimeRemaining.value--
    } else {
      stopQRPolling()
    }
  }, 1000)
}

const startQRPolling = (sessionId: string) => {
  if (pollTimer) clearInterval(pollTimer)
  isQrPolling.value = true
  pollTimer = window.setInterval(async () => {
    try {
      const res = await pollQRLoginSession(sessionId)
      if (res.status === 'authorized' && res.token) {
        audio.playTink()
        stopQRPolling()
        isCurator.value = true
        markEnteredArchive()
        emit('enter')
      } else if (res.status === 'expired') {
        stopQRPolling()
      }
    } catch {
      // ignore
    }
  }, 2000)
}

const stopQRPolling = () => {
  if (qrTimer) {
    clearInterval(qrTimer)
    qrTimer = null
  }
  if (pollTimer) {
    clearInterval(pollTimer)
    pollTimer = null
  }
  isQrPolling.value = false
}

const copyQRDeepLink = async () => {
  if (!qrSession.value) return
  audio.playTink()
  try {
    await navigator.clipboard.writeText(qrSession.value.qr_payload)
    qrCopied.value = true
    setTimeout(() => {
      qrCopied.value = false
    }, 2000)
  } catch {}
}

// 3. 口令直接登录
const handlePasscodeLogin = async () => {
  if (!passcode.value.trim()) return
  audio.playTink()
  isLoggingIn.value = true
  loginError.value = ''
  try {
    await verifyMasterPasscode(passcode.value.trim())
    isCurator.value = true
    passcode.value = ''
    markEnteredArchive()
    emit('enter')
  } catch (err: any) {
    loginError.value = err?.message || '主理人口令不正确，请重新输入'
  } finally {
    isLoggingIn.value = false
  }
}

// 4. 首次装帧自留地 (Day-0 Bootstrap)
const handleBootstrapSubmit = async () => {
  if (!bootstrapForm.value.curator_name.trim()) {
    bootstrapError.value = '请输入主理人称谓'
    return
  }
  if (!bootstrapForm.value.master_passcode.trim()) {
    bootstrapError.value = '请设定专属主理人口令（用于未来身份验证）'
    return
  }

  audio.playTink()
  isBootstrapping.value = true
  bootstrapError.value = ''
  try {
    await bootstrapSystem({
      curator_name: bootstrapForm.value.curator_name.trim(),
      location: bootstrapForm.value.location.trim() || undefined,
      master_passcode: bootstrapForm.value.master_passcode.trim(),
      master_key: bootstrapForm.value.master_key.trim() || undefined,
    })
    status.value.initialized = true
    isCurator.value = true
    markEnteredArchive()
    emit('bootstrapped')
    emit('enter')
  } catch (err: any) {
    bootstrapError.value = err?.message || '装帧创建失败，请核对环境变量与服务器配置'
  } finally {
    isBootstrapping.value = false
  }
}

// 5. 退出主理人身份
const handleLogout = () => {
  audio.playTink()
  removeAdminToken()
  clearEnteredArchive()
  isCurator.value = false
  currentMode.value = 'landing'
}

const todayDisplay = computed(() => {
  const now = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${now.getFullYear()}.${pad(now.getMonth() + 1)}.${pad(now.getDate())}`
})

// 档案馆三大篇章概览
const archiveChapters = [
  {
    num: '01',
    icon: Compass,
    title: '时间流与日常印记',
    desc: '行迹、随笔、手冲水温曲线与具体的日常饭食。',
  },
  {
    num: '02',
    icon: Camera,
    title: '35mm 胶片暗房',
    desc: '旁轴机械快门、银盐冲洗与四季街头的体温。',
  },
  {
    num: '03',
    icon: Layers,
    title: '手艺造物与收支光谱',
    desc: '干净的高并发状态机、造物工坊与真实账簿。',
  },
]

watch(
  () => props.systemStatus,
  (newS) => {
    if (newS) {
      status.value = newS
      if (!newS.initialized && !isCurator.value) {
        currentMode.value = 'bootstrap'
      }
    }
  },
  { immediate: true }
)

onMounted(async () => {
  checkCuratorAuth()
  try {
    const s = await fetchSystemStatus()
    status.value = s
    if (!s.initialized && !isCurator.value) {
      currentMode.value = 'bootstrap'
    }
  } catch {}
})

onUnmounted(() => {
  stopQRPolling()
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
          个人生活手账与时光档案
        </span>
        <span class="hidden sm:inline text-[var(--border-divider)]">/</span>
        <span class="hidden sm:inline uppercase tracking-widest text-[11px]">
          VOL. 01 · 创刊扉页
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

    <!-- 中央核心装帧区：出版物级宽幅双页跨页排版 (解决大屏空旷问题) -->
    <main class="flex-grow flex items-center justify-center px-4 sm:px-10 lg:px-16 py-10 sm:py-16 relative z-20">
      <div class="w-full max-w-6xl mx-auto">
        
        <!-- 宽幅双栏排版网格 -->
        <div class="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-16 items-center">
          
          <!-- 左栏 (6列)：实体书装帧封面与刊首手记 -->
          <div class="lg:col-span-6 space-y-8 text-left">
            
            <!-- 卷次与装帧标识 -->
            <div class="flex items-center gap-3">
              <span class="px-2 py-0.5 rounded-xs border border-[var(--border-subtle)] bg-[var(--bg-subtle)]/70 text-[10px] font-mono-archive tracking-widest text-[var(--ink-muted)]">
                卷一 · 典藏本
              </span>
              <span class="text-xs font-mono-archive tracking-wider text-[var(--ink-muted)]">
                典藏本 · 银盐纸张装帧
              </span>
            </div>

            <!-- 核心刊名大标题与印章 -->
            <div class="space-y-4">
              <div class="flex items-baseline gap-4">
                <h1 class="font-serif-editorial text-5xl sm:text-7xl font-normal tracking-tight text-[var(--ink-primary)]">
                  《 散 页 》
                </h1>
                <!-- 纯正实体朱红/暖褐印章 -->
                <div class="inline-flex items-center justify-center px-2 py-1 border border-[var(--accent-warm)] text-[var(--accent-warm)] text-xs font-serif-editorial rounded-xs rotate-[-3deg] shadow-2xs">
                  散页 藏
                </div>
              </div>

              <div class="font-serif-editorial text-xs tracking-wider text-[var(--ink-muted)]">
                时光手账 · 琐碎日常与真实印记
              </div>
            </div>

            <!-- 核心刊首金句引言 -->
            <blockquote class="p-5 sm:p-6 rounded-xs bg-[var(--bg-subtle)]/50 border-l-2 border-[var(--accent-warm)] text-[var(--ink-secondary)] font-serif-editorial text-base sm:text-lg italic leading-relaxed">
              “认认真真过好具体的生活，保持安宁与自洽。时间是这里唯一的刻度。”
            </blockquote>

            <!-- 生活档案三大篇章导览 -->
            <div class="space-y-3 pt-2">
              <div class="text-[11px] font-mono-archive text-[var(--ink-muted)] tracking-wider">
                生活档案三大篇章
              </div>
              <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div
                  v-for="ch in archiveChapters"
                  :key="ch.num"
                  class="p-3.5 rounded-xs border border-[var(--border-subtle)] bg-[var(--bg-subtle)]/25 space-y-1.5"
                >
                  <div class="flex items-center justify-between text-[10px] font-mono-archive">
                    <span class="text-[var(--accent-warm)] font-medium">{{ ch.num }}</span>
                    <component :is="ch.icon" class="w-3 h-3 text-[var(--ink-muted)]" />
                  </div>
                  <div class="font-serif-editorial text-xs font-medium text-[var(--ink-primary)]">
                    {{ ch.title }}
                  </div>
                  <p class="font-serif-editorial text-[11px] text-[var(--ink-muted)] leading-tight">
                    {{ ch.desc }}
                  </p>
                </div>
              </div>
            </div>

            <!-- 实体装帧参数条 -->
            <div class="pt-2 flex flex-wrap items-center gap-x-6 gap-y-1 text-[11px] font-mono-archive text-[var(--ink-muted)] border-t border-[var(--border-subtle)]/60">
              <span>纸张：120g 哑光棉纸</span>
              <span>·</span>
              <span>显影：银盐黑白相纸</span>
              <span>·</span>
              <span>主权：本地优先与私有</span>
            </div>

          </div>

          <!-- 右栏 (6列)：三态迎宾行动门户与登入面板 -->
          <div class="lg:col-span-6 space-y-6">
            
            <!-- 模式 1：封面主通道 (Landing Mode) -->
            <div v-if="currentMode === 'landing'" class="space-y-5">
              
              <!-- 核心主卡片：静心翻阅 · 开启档案馆 (超高视觉辨识度) -->
              <button
                @click="handleEnterAsGuest"
                class="w-full p-6 sm:p-8 rounded-xs border-2 border-[var(--ink-primary)] bg-[var(--ink-primary)] text-[var(--bg-archive)] hover:opacity-95 transition-all cursor-pointer text-left flex items-center justify-between group shadow-lg"
              >
                <div class="space-y-2">
                  <div class="flex items-center gap-3">
                    <BookOpen class="w-5 h-5 text-[var(--accent-warm)]" />
                    <span class="font-serif-editorial text-2xl font-normal">
                      静心翻阅 · 翻开散页
                    </span>
                  </div>
                  <p class="font-mono-archive text-xs opacity-75 max-w-sm">
                    零门槛免密进入：浏览全部生活时间流、35mm 胶片影集、手艺造物与收支光谱。
                  </p>
                </div>

                <div class="p-3 rounded-full bg-white/10 group-hover:translate-x-2 transition-transform shrink-0">
                  <ArrowRight class="w-6 h-6" />
                </div>
              </button>

              <!-- 次级双卡片：主理人暗房登入 与 首次装帧筑造 -->
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                
                <!-- 卡片 1：主理人暗房登入 -->
                <div class="p-5 rounded-xs border border-[var(--border-subtle)] bg-[var(--bg-subtle)]/40 hover:border-[var(--border-divider)] transition-all flex flex-col justify-between space-y-4">
                  <div class="space-y-1.5 text-left">
                    <div class="flex items-center justify-between">
                      <div class="flex items-center gap-2">
                        <KeyRound class="w-4 h-4 text-[var(--accent-warm)]" />
                        <span class="font-serif-editorial text-base font-medium text-[var(--ink-primary)]">
                          主理人暗房登入
                        </span>
                      </div>
                      <span v-if="isCurator" class="text-[10px] font-mono-archive text-emerald-600 flex items-center gap-1">
                        <Check class="w-3 h-3" />
                        <span>已就绪</span>
                      </span>
                    </div>
                    <p class="font-mono-archive text-xs text-[var(--ink-muted)]">
                      手机 App 扫码秒进，或输入私密暗号口令。
                    </p>
                  </div>

                  <div class="pt-2 border-t border-[var(--border-subtle)]/60 flex items-center gap-2">
                    <button
                      @click="startQRLogin"
                      class="flex-1 py-2 text-xs font-mono-archive rounded-xs border border-[var(--border-subtle)] hover:border-[var(--ink-primary)] bg-[var(--bg-archive)] cursor-pointer text-center transition-colors flex items-center justify-center gap-1"
                    >
                      <QrCode class="w-3.5 h-3.5" />
                      <span>手机扫码</span>
                    </button>
                    <button
                      @click="currentMode = 'passcode'; loginError = ''"
                      class="flex-1 py-2 text-xs font-mono-archive rounded-xs border border-[var(--border-subtle)] hover:border-[var(--ink-primary)] bg-[var(--bg-archive)] cursor-pointer text-center transition-colors flex items-center justify-center gap-1"
                    >
                      <Lock class="w-3.5 h-3.5" />
                      <span>口令输入</span>
                    </button>
                  </div>
                </div>

                <!-- 卡片 2：首次装帧筑造 -->
                <div
                  class="p-5 rounded-xs border transition-all flex flex-col justify-between space-y-4"
                  :class="
                    !status.initialized
                      ? 'border-[var(--accent-warm)] bg-[var(--accent-warm)]/5 ring-1 ring-[var(--accent-warm)]/30'
                      : 'border-[var(--border-subtle)] bg-[var(--bg-subtle)]/20 opacity-80'
                  "
                >
                  <div class="space-y-1.5 text-left">
                    <div class="flex items-center justify-between">
                      <div class="flex items-center gap-2">
                        <PenTool class="w-4 h-4 text-[var(--accent-warm)]" />
                        <span class="font-serif-editorial text-base font-medium text-[var(--ink-primary)]">
                          首次装帧筑造
                        </span>
                      </div>
                      <span
                        class="text-[10px] font-mono-archive px-1.5 py-0.2 rounded-xs"
                        :class="!status.initialized ? 'bg-[var(--accent-warm)] text-white' : 'bg-[var(--bg-subtle)] text-[var(--ink-muted)]'"
                      >
                        {{ !status.initialized ? '未初始化' : '已封印' }}
                      </span>
                    </div>
                    <p class="font-mono-archive text-xs text-[var(--ink-muted)]">
                      {{ !status.initialized ? '设定主理人称谓与专属口令。' : '初次部署已完成装帧，入口已永久封印。' }}
                    </p>
                  </div>

                  <div class="pt-2 border-t border-[var(--border-subtle)]/60">
                    <button
                      v-if="!status.initialized"
                      @click="currentMode = 'bootstrap'"
                      class="w-full py-2 text-xs font-mono-archive rounded-xs bg-[var(--accent-warm)] text-white cursor-pointer hover:opacity-90 transition-opacity flex items-center justify-center gap-1 shadow-xs"
                    >
                      <Sparkles class="w-3.5 h-3.5" />
                      <span>立即装帧 (Day-0)</span>
                    </button>
                    <div v-else class="text-[11px] font-mono-archive text-[var(--ink-muted)] text-center py-1.5">
                      已封印 · 仅供主理人登入
                    </div>
                  </div>
                </div>

              </div>

              <!-- 主理人已持有凭证提示条 -->
              <div v-if="isCurator" class="p-4 rounded-xs border border-emerald-500/30 bg-emerald-500/5 flex items-center justify-between text-xs font-mono-archive">
                <div class="flex items-center gap-2 text-emerald-700">
                  <ShieldCheck class="w-4 h-4" />
                  <span>主理人权限已就绪</span>
                </div>
                <div class="flex items-center gap-3">
                  <button
                    @click="handleEnterAsGuest"
                    class="px-3 py-1 bg-[var(--ink-primary)] text-white rounded-xs cursor-pointer hover:opacity-90"
                  >
                    直接进入 →
                  </button>
                  <button
                    @click="handleLogout"
                    class="text-[var(--ink-muted)] hover:text-red-600 hover-underline cursor-pointer"
                  >
                    注销
                  </button>
                </div>
              </div>

            </div>

            <!-- 模式 2：手机扫码卡片 (QR Code View) -->
            <div v-else-if="currentMode === 'qr'" class="p-8 rounded-xs border border-[var(--border-subtle)] bg-[var(--bg-subtle)]/40 space-y-6 shadow-md text-left">
              <div class="flex items-center justify-between border-b border-[var(--border-subtle)] pb-3">
                <div class="flex items-center gap-2">
                  <QrCode class="w-4 h-4 text-[var(--accent-warm)]" />
                  <span class="font-serif-editorial text-lg text-[var(--ink-primary)]">手机 App 扫码免密登录</span>
                </div>
                <button
                  @click="currentMode = 'landing'"
                  class="text-xs font-mono-archive text-[var(--ink-muted)] hover:text-[var(--ink-primary)] cursor-pointer"
                >
                  ← 返回封面
                </button>
              </div>

              <div class="flex flex-col items-center justify-center py-2 space-y-4">
                <!-- 真实二维码图像呈现 (RG-02)：后端原生返回 qr_code_data_url 时渲染真图 -->
                <div
                  v-if="qrSession?.qr_code_data_url"
                  class="p-4 bg-white rounded-xs border border-[var(--border-subtle)] shadow-sm relative group"
                >
                  <img
                    :src="qrSession.qr_code_data_url"
                    alt="扫码登录二维码"
                    class="w-48 h-48 sm:w-56 sm:h-56 object-contain"
                  />

                  <div
                    v-if="qrTimeRemaining <= 0"
                    class="absolute inset-0 bg-white/95 backdrop-blur-xs flex flex-col items-center justify-center p-4 text-center space-y-2"
                  >
                    <span class="text-xs font-mono-archive text-[var(--ink-secondary)]">二维码已过期</span>
                    <button
                      @click="refreshQRSession"
                      class="px-3 py-1 bg-[var(--ink-primary)] text-white text-xs font-mono-archive rounded-xs cursor-pointer flex items-center gap-1"
                    >
                      <RotateCw class="w-3 h-3" />
                      <span>刷新二维码</span>
                    </button>
                  </div>
                </div>

                <!-- 未返回视觉二维码时，真实展示免密握手深链并提供便捷复制 (RG-02, RG-04) -->
                <div
                  v-else
                  class="p-6 bg-[var(--bg-subtle)]/70 rounded-xs border border-[var(--border-subtle)] space-y-3 text-center max-w-sm"
                >
                  <div class="flex items-center justify-center gap-2 text-xs font-mono-archive text-[var(--ink-primary)]">
                    <Smartphone class="w-4 h-4 text-[var(--accent-warm)]" />
                    <span>免密登录深链已就绪</span>
                  </div>
                  <p class="font-serif-editorial text-xs text-[var(--ink-secondary)] leading-relaxed">
                    在已配对的设备中打开下方深链，或待后端原生引擎生成视觉二维码后扫码。
                  </p>
                  <div
                    v-if="qrTimeRemaining <= 0"
                    class="pt-2 text-center space-y-2"
                  >
                    <span class="text-xs font-mono-archive text-[var(--ink-secondary)]">凭据已过期</span>
                    <button
                      @click="refreshQRSession"
                      class="px-3 py-1 bg-[var(--ink-primary)] text-white text-xs font-mono-archive rounded-xs cursor-pointer inline-flex items-center gap-1 mx-auto"
                    >
                      <RotateCw class="w-3 h-3" />
                      <span>重新生成</span>
                    </button>
                  </div>
                </div>

                <div class="text-center space-y-1 font-mono-archive text-xs text-[var(--ink-muted)]">
                  <div class="flex items-center justify-center gap-2">
                    <span class="inline-block w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                    <span>等待移动端授信确认... (剩余 {{ qrTimeRemaining }}s)</span>
                  </div>
                  <p class="font-serif-editorial text-xs text-[var(--ink-secondary)]">
                    已配对的移动端在收到授信请求后将自动完成鉴权握手。
                  </p>
                </div>

                <div class="w-full pt-2 flex items-center justify-between text-xs font-mono-archive border-t border-[var(--border-subtle)]">
                  <span class="truncate text-[11px] text-[var(--ink-muted)] max-w-xs">
                    {{ qrSession?.qr_payload }}
                  </span>
                  <button
                    @click="copyQRDeepLink"
                    class="px-2 py-1 border border-[var(--border-subtle)] hover:border-[var(--ink-primary)] rounded-xs cursor-pointer flex items-center gap-1 text-[var(--ink-secondary)] hover:text-[var(--ink-primary)] shrink-0"
                  >
                    <Copy class="w-3 h-3" />
                    <span>{{ qrCopied ? '已复制' : '复制深链' }}</span>
                  </button>
                </div>
              </div>

              <div class="text-center pt-1 border-t border-[var(--border-subtle)]">
                <button
                  @click="currentMode = 'passcode'"
                  class="text-xs font-mono-archive text-[var(--ink-secondary)] hover:text-[var(--ink-primary)] hover-underline cursor-pointer"
                >
                  手机不在身旁？改用主理人口令直接登入 →
                </button>
              </div>
            </div>

            <!-- 模式 3：口令登入卡片 (Passcode View) -->
            <div v-else-if="currentMode === 'passcode'" class="p-8 rounded-xs border border-[var(--border-subtle)] bg-[var(--bg-subtle)]/40 space-y-6 shadow-md text-left">
              <div class="flex items-center justify-between border-b border-[var(--border-subtle)] pb-3">
                <div class="flex items-center gap-2">
                  <Lock class="w-4 h-4 text-[var(--accent-warm)]" />
                  <span class="font-serif-editorial text-lg text-[var(--ink-primary)]">主理人暗号口令登入</span>
                </div>
                <button
                  @click="currentMode = 'landing'"
                  class="text-xs font-mono-archive text-[var(--ink-muted)] hover:text-[var(--ink-primary)] cursor-pointer"
                >
                  ← 返回封面
                </button>
              </div>

              <div class="space-y-4">
                <div class="space-y-1.5">
                  <label class="block text-xs font-mono-archive text-[var(--ink-muted)]">
                    输入私密主理人口令 (MASTER PASSCODE)
                  </label>
                  <input
                    v-model="passcode"
                    type="password"
                    placeholder="请输入首次装帧时设定的口令"
                    @keydown.enter="handlePasscodeLogin"
                    class="w-full px-3 py-2.5 text-sm font-mono-archive bg-[var(--bg-archive)] border border-[var(--border-subtle)] focus:border-[var(--ink-primary)] rounded-xs outline-none"
                  />
                </div>

                <div v-if="loginError" class="text-xs font-mono-archive text-red-600">
                  {{ loginError }}
                </div>

                <button
                  @click="handlePasscodeLogin"
                  :disabled="isLoggingIn || !passcode.trim()"
                  class="w-full py-2.5 px-4 bg-[var(--ink-primary)] text-[var(--bg-archive)] text-xs font-mono-archive rounded-xs cursor-pointer hover:opacity-90 disabled:opacity-50 transition-opacity flex items-center justify-center gap-2"
                >
                  <span>{{ isLoggingIn ? '验证中...' : '核验证据并开启自留地' }}</span>
                  <ArrowRight class="w-3.5 h-3.5" />
                </button>
              </div>

              <div class="text-center pt-1 border-t border-[var(--border-subtle)]">
                <button
                  @click="startQRLogin"
                  class="text-xs font-mono-archive text-[var(--ink-secondary)] hover:text-[var(--ink-primary)] hover-underline cursor-pointer"
                >
                  改用手机 App 扫码登录 →
                </button>
              </div>
            </div>

            <!-- 模式 4：首次装帧向导 (Bootstrap View) -->
            <div v-else-if="currentMode === 'bootstrap'" class="p-8 rounded-xs border border-[var(--accent-warm)] bg-[var(--bg-subtle)]/40 space-y-6 shadow-md text-left">
              <div class="flex items-center justify-between border-b border-[var(--border-subtle)] pb-3">
                <div class="flex items-center gap-2">
                  <PenTool class="w-4 h-4 text-[var(--accent-warm)]" />
                  <span class="font-serif-editorial text-lg text-[var(--ink-primary)]">首次装帧 · 筑造自留地</span>
                </div>
                <button
                  v-if="status.initialized"
                  @click="currentMode = 'landing'"
                  class="text-xs font-mono-archive text-[var(--ink-muted)] hover:text-[var(--ink-primary)] cursor-pointer"
                >
                  ← 返回封面
                </button>
              </div>

              <p class="font-serif-editorial text-xs sm:text-sm text-[var(--ink-secondary)] leading-relaxed">
                欢迎初次部署《散页》。请在此铭刻主理人印信并设定专属口令。完成后当前浏览器将自动获得管理权。
              </p>

              <div class="space-y-4 font-mono-archive text-xs">
                <div class="space-y-1">
                  <label class="block text-[var(--ink-muted)]">主理人称谓 (中文名) *</label>
                  <input
                    v-model="bootstrapForm.curator_name"
                    type="text"
                    placeholder="请输入你的称谓，例如: 迟暮"
                    class="w-full px-3 py-2 bg-[var(--bg-archive)] border border-[var(--border-subtle)] focus:border-[var(--ink-primary)] rounded-xs outline-none"
                  />
                </div>

                <div class="space-y-1">
                  <label class="block text-[var(--ink-muted)]">常居城市坐标</label>
                  <input
                    v-model="bootstrapForm.location"
                    type="text"
                    placeholder="例如: 中国 · 杭州"
                    class="w-full px-3 py-2 bg-[var(--bg-archive)] border border-[var(--border-subtle)] focus:border-[var(--ink-primary)] rounded-xs outline-none"
                  />
                </div>

                <div class="space-y-1">
                  <label class="block text-[var(--ink-muted)]">专属主理人口令 (MASTER PASSCODE) *</label>
                  <input
                    v-model="bootstrapForm.master_passcode"
                    type="password"
                    placeholder="请牢记此口令，用于网页或多端直连鉴权"
                    class="w-full px-3 py-2 bg-[var(--bg-archive)] border border-[var(--border-subtle)] focus:border-[var(--ink-primary)] rounded-xs outline-none"
                  />
                </div>

                <div v-if="status.has_master_key_configured" class="space-y-1">
                  <label class="block text-[var(--accent-warm)]">
                    部署环境变量 Master Key (防抢注核销) *
                  </label>
                  <input
                    v-model="bootstrapForm.master_key"
                    type="password"
                    placeholder="输入服务器环境变量 ADMIN_API_KEY 以完成校验"
                    class="w-full px-3 py-2 bg-[var(--bg-archive)] border border-[var(--accent-warm)] rounded-xs outline-none"
                  />
                </div>

                <div v-if="bootstrapError" class="text-red-600 text-[11px]">
                  {{ bootstrapError }}
                </div>

                <button
                  @click="handleBootstrapSubmit"
                  :disabled="isBootstrapping"
                  class="w-full py-2.5 px-4 bg-[var(--accent-warm)] text-white text-xs font-mono-archive rounded-xs cursor-pointer hover:opacity-90 disabled:opacity-50 transition-opacity flex items-center justify-center gap-2 shadow-xs"
                >
                  <Sparkles class="w-3.5 h-3.5" />
                  <span>{{ isBootstrapping ? '装帧落印中...' : '完成装帧并开启自留地 (Bootstrap Atelier)' }}</span>
                </button>
              </div>
            </div>

          </div>

        </div>

      </div>
    </main>

    <!-- 页脚：实体书底款与备案声明 -->
    <footer
      class="w-full border-t border-[var(--border-subtle)] px-6 sm:px-12 py-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs font-mono-archive text-[var(--ink-muted)] relative z-20"
      style="padding-bottom: max(1.5rem, env(safe-area-inset-bottom, 1.5rem));"
    >
      <div class="flex items-center gap-2">
        <ShieldCheck class="w-3.5 h-3.5 text-emerald-600" />
        <span>《散页》· 个人生活手账与时光档案 · 本地优先与数据主权</span>
      </div>

      <div class="flex items-center gap-4">
        <span>© 2024–{{ new Date().getFullYear() }} 《散页》</span>
      </div>
    </footer>

  </div>
</template>
