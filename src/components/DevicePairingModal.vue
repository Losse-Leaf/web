<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from 'vue'
import {
  X,
  Smartphone,
  Laptop,
  Globe,
  ShieldCheck,
  RefreshCw,
  Trash2,
  Copy,
  Check,
  Clock,
  AlertCircle,
  Edit2,
} from 'lucide-vue-next'
import type { TrustedDevice, PairingTicketResult } from '../types'
import {
  initPairingTicket,
  pollPairingTicketStatus,
  fetchTrustedDevices,
  revokeTrustedDevice,
  updateTrustedDeviceName,
  fetchPairQRCode,
} from '../utils/api'
import { audio } from '../utils/audio'
import { askConfirm } from '../composables/useConfirm'
import { parseOccurredDate } from '../utils/format'

const props = defineProps<{
  isOpen: boolean
}>()

const emit = defineEmits<{
  (e: 'close'): void
}>()

const activeTab = ref<'pair' | 'devices'>('pair')
const devices = ref<TrustedDevice[]>([])
const currentTicket = ref<PairingTicketResult | null>(null)
const isLoadingTicket = ref(false)
const isLoadingDevices = ref(false)
const countdownSeconds = ref(300)
const copied = ref(false)
const ticketError = ref('')
const pairingSuccess = ref(false)
const selectedCandidateUrl = ref('')
const isSwitchingNode = ref(false)
let countdownTimer: number | null = null
let pollTimer: number | null = null
let initialDeviceCount = 0

const startCountdown = (sec: number) => {
  if (countdownTimer) clearInterval(countdownTimer)
  countdownSeconds.value = sec
  countdownTimer = window.setInterval(() => {
    if (countdownSeconds.value > 0) {
      countdownSeconds.value--
    } else {
      if (countdownTimer) clearInterval(countdownTimer)
      currentTicket.value = null
      stopPairingPolling()
    }
  }, 1000)
}

const onPairingDetected = async () => {
  audio.playShutter()
  pairingSuccess.value = true
  stopPairingPolling()
  if (countdownTimer) {
    clearInterval(countdownTimer)
    countdownTimer = null
  }
  await loadDevices()
  setTimeout(() => {
    pairingSuccess.value = false
    currentTicket.value = null
  }, 5000)
}

// 配对状态心跳轮询：同时支持 /auth/pair/status?ticket=... 与设备列表比对 (RG-06, BE-19, RC-61)
const startPairingPolling = () => {
  stopPairingPolling()
  initialDeviceCount = devices.value.length
  pollTimer = window.setInterval(async () => {
    try {
      const ticketId = currentTicket.value?.ticket
      if (ticketId) {
        try {
          const statusRes = await pollPairingTicketStatus(ticketId)
          if (statusRes.status === 'paired') {
            await onPairingDetected()
            return
          }
          if (statusRes.status === 'expired') {
            countdownSeconds.value = 0
            stopPairingPolling()
            return
          }
        } catch (err) {
          console.warn('Pairing status poll fallback:', err)
        }
      }

      const latestDevices = await fetchTrustedDevices()
      if (latestDevices && latestDevices.length > initialDeviceCount) {
        devices.value = latestDevices
        await onPairingDetected()
      }
    } catch (err) {
      console.warn('Polling devices jitter:', err)
    }
  }, 2000)
}

const stopPairingPolling = () => {
  if (pollTimer) {
    clearInterval(pollTimer)
    pollTimer = null
  }
}

const generateTicket = async () => {
  audio.playTink()
  isLoadingTicket.value = true
  ticketError.value = ''
  pairingSuccess.value = false
  try {
    const res = await initPairingTicket({
      hub_url: window.location.origin,
    })
    currentTicket.value = res
    selectedCandidateUrl.value = res.hub_url || ''
    startCountdown(res.expires_in_seconds || 300)
    startPairingPolling()
  } catch (err: any) {
    ticketError.value = err?.message || '获取配对工单失败，请检查服务连接'
    currentTicket.value = null
    stopPairingPolling()
  } finally {
    isLoadingTicket.value = false
  }
}

const handleSelectCandidate = async (candUrl: string) => {
  if (!currentTicket.value || selectedCandidateUrl.value === candUrl) return
  audio.playTink()
  selectedCandidateUrl.value = candUrl
  isSwitchingNode.value = true
  try {
    const res = await fetchPairQRCode(candUrl, currentTicket.value.ticket)
    currentTicket.value = {
      ...currentTicket.value,
      hub_url: res.hub_url,
      qr_payload: res.qr_payload,
      qr_code_data_url: res.qr_code_data_url,
    }
  } catch (err) {
    console.warn('Switching QR code endpoint failed:', err)
  } finally {
    isSwitchingNode.value = false
  }
}

const loadDevices = async () => {
  isLoadingDevices.value = true
  try {
    const res = await fetchTrustedDevices()
    devices.value = res || []
  } catch (err) {
    console.error('Failed to load trusted devices:', err)
    devices.value = []
  } finally {
    isLoadingDevices.value = false
  }
}

const handleRevoke = async (id: number) => {
  audio.playTink()
  const ok = await askConfirm({
    title: '解绑设备',
    message: '确定解绑并吊销该设备的免密信任？解绑后该设备需重新扫码配对。',
    confirmText: '解绑',
    danger: true,
  })
  if (!ok) return
  try {
    await revokeTrustedDevice(id)
  } catch (err) {
    console.error('Failed to revoke device:', err)
  }
  devices.value = devices.value.filter((d) => d.id !== id)
}

const editingDeviceKey = ref<string | number | null>(null)
const editingDeviceName = ref('')
const isSavingDeviceName = ref(false)

const getDeviceKey = (dev: TrustedDevice): string | number => {
  return dev.device_id || dev.id
}

const startRenameDevice = (dev: TrustedDevice) => {
  audio.playTink()
  editingDeviceKey.value = getDeviceKey(dev)
  editingDeviceName.value = dev.name || ''
}

const cancelRenameDevice = () => {
  editingDeviceKey.value = null
  editingDeviceName.value = ''
}

const saveRenameDevice = async (dev: TrustedDevice) => {
  const cleanName = editingDeviceName.value.trim()
  if (!cleanName || isSavingDeviceName.value) return
  isSavingDeviceName.value = true
  try {
    const targetId = dev.device_id || dev.id
    const updated = await updateTrustedDeviceName(targetId, cleanName)
    dev.name = updated?.name || cleanName
    audio.playTink()
    editingDeviceKey.value = null
    editingDeviceName.value = ''
  } catch (err) {
    console.error('Failed to rename device:', err)
  } finally {
    isSavingDeviceName.value = false
  }
}

const copyPayload = async () => {
  if (!currentTicket.value) return
  audio.playTink()
  try {
    await navigator.clipboard.writeText(currentTicket.value.qr_payload)
    copied.value = true
    setTimeout(() => {
      copied.value = false
    }, 2500)
  } catch (err) {
    console.warn('Clipboard write failed:', err)
  }
}

// 设备配对时间按北京时间展示 (RC-134)
const formatDateTime = (iso: string) => {
  if (!iso) return ''
  const parsed = parseOccurredDate(iso)
  return `${parsed.dotDate} ${parsed.time}`
}

watch(
  () => props.isOpen,
  (open) => {
    if (open) {
      loadDevices()
      generateTicket()
    } else {
      if (countdownTimer) clearInterval(countdownTimer)
      stopPairingPolling()
      ticketError.value = ''
      pairingSuccess.value = false
    }
  }
)

onMounted(() => {
  if (props.isOpen) {
    loadDevices()
    generateTicket()
  }
})

onUnmounted(() => {
  if (countdownTimer) clearInterval(countdownTimer)
  stopPairingPolling()
})
</script>

<template>
  <div
    v-if="isOpen"
    class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/45 backdrop-blur-xs transition-opacity duration-200"
    @click.self="emit('close')"
  >
    <div
      class="w-full max-w-xl min-h-[440px] bg-[var(--bg-archive)] border border-[var(--border-subtle)] rounded-xs shadow-2xl p-4 sm:p-8 text-left space-y-6 max-h-[90dvh] overflow-y-auto animate-in fade-in zoom-in-95 duration-200"
    >
      <!-- 弹窗标题 -->
      <div class="flex items-center justify-between pb-4 border-b border-[var(--border-subtle)]">
        <div class="space-y-1">
          <div class="flex items-center gap-2">
            <h2 class="font-serif-editorial text-2xl text-[var(--ink-primary)] font-medium">
              受信任设备与多端配对
            </h2>
            <ShieldCheck class="w-4 h-4 text-[var(--accent-moss)]" />
          </div>
          <p class="font-mono-archive text-xs text-[var(--ink-muted)]">
            多端设备授权与管理
          </p>
        </div>
        <button
          @click="emit('close')"
          class="p-1 text-[var(--ink-muted)] hover:text-[var(--ink-primary)] cursor-pointer"
        >
          <X class="w-5 h-5" />
        </button>
      </div>

      <!-- 选项卡切换：配对新设备 / 已信任设备组 -->
      <div class="flex items-center gap-6 border-b border-[var(--border-subtle)] text-xs font-mono-archive">
        <button
          @click="activeTab = 'pair'"
          class="pb-2.5 transition-colors cursor-pointer"
          :class="activeTab === 'pair'
            ? 'text-[var(--ink-primary)] font-semibold border-b-2 border-[var(--ink-primary)]'
            : 'text-[var(--ink-muted)] hover:text-[var(--ink-primary)]'"
        >
          配对新设备 (扫码 / 链接)
        </button>
        <button
          @click="activeTab = 'devices'"
          class="pb-2.5 transition-colors cursor-pointer flex items-center gap-1.5"
          :class="activeTab === 'devices'
            ? 'text-[var(--ink-primary)] font-semibold border-b-2 border-[var(--ink-primary)]'
            : 'text-[var(--ink-muted)] hover:text-[var(--ink-primary)]'"
        >
          <span>已信任设备组</span>
          <span class="px-1.5 py-0.2 rounded-xs bg-[var(--bg-subtle)] text-[10px]">{{ devices.length }}</span>
        </button>
      </div>

      <!-- 板块 1：散页纸墨风二维码与配对链接 -->
      <div v-if="activeTab === 'pair'" class="space-y-6">
        <!-- 配对成功横幅 -->
        <div
          v-if="pairingSuccess"
          class="p-3 bg-[var(--accent-moss)]/10 border border-[var(--accent-moss)]/30 rounded-xs flex items-center gap-2 text-xs font-serif-editorial text-[var(--accent-moss)]"
        >
          <Check class="w-4 h-4 shrink-0" />
          <span>新终端已成功握手并授信，散页已记录此设备。</span>
        </div>

        <!-- 错误提示横幅 -->
        <div
          v-if="ticketError"
          class="p-3 bg-red-500/10 border border-red-500/30 rounded-xs flex items-center justify-between gap-2 text-xs font-mono-archive text-red-600 dark:text-red-400"
        >
          <div class="flex items-center gap-2">
            <AlertCircle class="w-4 h-4 shrink-0" />
            <span>{{ ticketError }}</span>
          </div>
          <button
            @click="generateTicket"
            class="underline hover:opacity-80 cursor-pointer text-[11px]"
          >
            重试
          </button>
        </div>

        <div class="p-4 sm:p-5 bg-[var(--bg-subtle)]/70 rounded-xs border border-[var(--border-subtle)] space-y-5">
          <div class="flex items-center justify-between text-xs font-mono-archive text-[var(--ink-muted)]">
            <span>配对凭据有效期（单次核销）</span>
            <span class="flex items-center gap-1 text-[var(--accent-warm)]">
              <Clock class="w-3.5 h-3.5" />
              <span>{{ countdownSeconds }}s</span>
            </span>
          </div>

          <!-- 散页纸墨风二维码暗房装裱框 + 配对指引与操作 -->
          <div class="flex flex-col sm:flex-row items-center gap-6 py-1">
            <!-- 散页纸墨风二维码装裱容器：.film-frame + 四角复古裁切基准线 + #F9F8F5 棉纸内衬 -->
            <div class="film-frame p-4 rounded-xs relative inline-flex flex-col items-center shrink-0">
              <span class="pointer-events-none absolute top-1.5 left-1.5 w-3 h-3 border-t-2 border-l-2 border-[var(--accent-warm)]/80"></span>
              <span class="pointer-events-none absolute top-1.5 right-1.5 w-3 h-3 border-t-2 border-r-2 border-[var(--accent-warm)]/80"></span>
              <span class="pointer-events-none absolute bottom-1.5 left-1.5 w-3 h-3 border-b-2 border-l-2 border-[var(--accent-warm)]/80"></span>
              <span class="pointer-events-none absolute bottom-1.5 right-1.5 w-3 h-3 border-b-2 border-r-2 border-[var(--accent-warm)]/80"></span>

              <div class="p-3 bg-[#F9F8F5] text-[#181716] rounded-xs border border-[#181716]/15 shadow-inner relative">
                <img
                  v-if="currentTicket?.qr_code_data_url"
                  :src="currentTicket.qr_code_data_url"
                  alt="散页纸墨风配对二维码"
                  class="w-36 h-36 sm:w-40 sm:h-40 object-contain block"
                />
                <div
                  v-else
                  class="w-36 h-36 sm:w-40 sm:h-40 flex items-center justify-center text-[11px] font-mono-archive text-[#57544e] text-center px-3"
                >
                  {{ isLoadingTicket ? '正在生成配对凭据...' : '扫描二维码或复制配对链接' }}
                </div>
              </div>

              <div class="mt-2 text-[10px] font-mono-archive text-[var(--ink-muted)] text-center">
                <span>纸墨二维码 · 5分钟内有效</span>
              </div>
            </div>

            <!-- 多端免密配对说明与中枢信息 -->
            <div class="flex-1 text-center sm:text-left space-y-3">
              <h4 class="font-serif-editorial text-lg sm:text-xl font-medium text-[var(--ink-primary)]">
                扫码连接 或 复制配对链接
              </h4>

              <div class="space-y-2 text-xs font-serif-editorial text-[var(--ink-secondary)] leading-relaxed">
                <p>
                  <strong class="font-medium text-[var(--ink-primary)] font-mono-archive">移动端随行记录</strong>：使用 iOS 或 Android 客户端扫描左侧纸墨二维码。
                </p>
                <p>
                  <strong class="font-medium text-[var(--ink-primary)] font-mono-archive">macOS 桌面工作台</strong>：复制下方配对链接并在客户端设置中一键粘贴，系统将自动识别中枢地址并完成设备钤印。
                </p>
              </div>

              <!-- 接入节点智能切换胶囊 -->
              <div v-if="(currentTicket?.candidates || []).length > 1" class="space-y-1.5 pt-1">
                <div class="text-[11px] font-mono-archive text-[var(--ink-muted)] flex items-center justify-between">
                  <span>选择连接节点：</span>
                  <span v-if="isSwitchingNode" class="text-[var(--accent-warm)]">正在更新二维码...</span>
                </div>
                <div class="flex flex-wrap gap-1.5 font-mono-archive text-[11px]">
                  <button
                    v-for="cand in currentTicket?.candidates"
                    :key="cand.url"
                    type="button"
                    @click="handleSelectCandidate(cand.url)"
                    class="px-2.5 py-1 rounded-xs border transition-colors cursor-pointer flex items-center gap-1"
                    :class="
                      selectedCandidateUrl === cand.url
                        ? 'border-[var(--accent-warm)] bg-[var(--accent-warm)]/10 text-[var(--accent-warm)] font-medium'
                        : 'border-[var(--border-subtle)] text-[var(--ink-secondary)] hover:border-[var(--ink-primary)] hover:text-[var(--ink-primary)]'
                    "
                  >
                    <span>{{ cand.type === 'tailscale' ? '📡' : (cand.type === 'lan' ? '📶' : '🌐') }}</span>
                    <span>{{ cand.label }}</span>
                    <span class="opacity-70 text-[10px]">({{ cand.ip }})</span>
                  </button>
                </div>
              </div>

              <div
                v-if="currentTicket?.hub_url"
                class="pt-1 text-[11px] font-mono-archive text-[var(--ink-muted)] flex items-center justify-center sm:justify-start gap-1"
              >
                <span>中枢节点：</span>
                <span class="text-[var(--ink-secondary)] select-all">{{ currentTicket.hub_url }}</span>
              </div>
            </div>
          </div>

          <!-- 配对专属协议 Deep Link -->
          <div class="pt-3 border-t border-[var(--border-subtle)]/60 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 text-xs font-mono-archive">
            <div class="truncate text-[11px] text-[var(--ink-muted)] select-all bg-[var(--bg-archive)]/60 px-2.5 py-1.5 rounded-xs border border-[var(--border-subtle)]/40 font-mono-archive">
              {{ currentTicket?.qr_payload || 'looseleaf://pair' }}
            </div>
            <button
              @click="copyPayload"
              class="px-3.5 py-1.5 shrink-0 border border-[var(--border-subtle)] hover:border-[var(--ink-primary)] bg-[var(--bg-archive)] rounded-xs cursor-pointer flex items-center justify-center gap-1.5 text-[var(--ink-secondary)] hover:text-[var(--ink-primary)] transition-colors"
            >
              <component :is="copied ? Check : Copy" class="w-3.5 h-3.5 text-[var(--accent-warm)]" />
              <span>{{ copied ? '已复制配对链接' : '复制配对链接' }}</span>
            </button>
          </div>
        </div>

        <!-- 刷新工单按钮 -->
        <div class="flex items-center justify-between text-xs font-mono-archive text-[var(--ink-muted)]">
          <span class="text-[11px]">新设备扫码后自动完成授权，无需输入密码。</span>
          <button
            @click="generateTicket"
            class="flex items-center gap-1 hover:text-[var(--ink-primary)] cursor-pointer text-xs"
          >
            <RefreshCw class="w-3.5 h-3.5" :class="{ 'animate-spin': isLoadingTicket }" />
            <span>重新生成</span>
          </button>
        </div>
      </div>

      <!-- 板块 2：受信任设备列表 (展示专属 device_id RC-61) -->
      <div v-else class="space-y-3.5 max-h-[360px] overflow-y-auto pr-1">
        <div v-if="devices.length === 0" class="py-12 text-center text-xs font-mono-archive text-[var(--ink-muted)] space-y-1">
          <p>暂无已配对的受信任终端设备</p>
          <p class="text-[11px] opacity-70">点击上方「配对新设备」为您的手机或 Mac 桌面端授权。</p>
        </div>

        <div
          v-for="dev in devices"
          :key="dev.id"
          class="p-3.5 rounded-xs border border-[var(--border-subtle)] bg-[var(--bg-subtle)]/40 flex items-center justify-between gap-3 group hover:border-[var(--border-divider)] transition-colors"
        >
          <div class="flex items-start sm:items-center gap-3 min-w-0">
            <div class="w-9 h-9 rounded-xs border border-[var(--border-subtle)] bg-[var(--bg-archive)] flex items-center justify-center text-[var(--ink-secondary)] shrink-0">
              <Laptop v-if="dev.platform === 'macos'" class="w-4 h-4" />
              <Globe v-else-if="dev.platform === 'web'" class="w-4 h-4" />
              <Smartphone v-else class="w-4 h-4" />
            </div>

            <div class="space-y-1 min-w-0">
              <div class="flex flex-wrap items-center gap-2">
                <template v-if="editingDeviceKey === getDeviceKey(dev)">
                  <input
                    v-model="editingDeviceName"
                    type="text"
                    maxlength="40"
                    @keyup.enter="saveRenameDevice(dev)"
                    @keyup.esc="cancelRenameDevice"
                    class="px-2 py-0.5 text-sm font-serif-editorial bg-[var(--bg-archive)] border border-[var(--ink-primary)] rounded-xs outline-none text-[var(--ink-primary)] w-36 sm:w-44"
                  />
                  <button
                    type="button"
                    @click="saveRenameDevice(dev)"
                    :disabled="isSavingDeviceName"
                    class="px-2 py-0.5 text-[11px] font-mono-archive bg-[var(--ink-primary)] text-[var(--bg-archive)] rounded-xs cursor-pointer"
                  >
                    保存
                  </button>
                  <button
                    type="button"
                    @click="cancelRenameDevice"
                    class="px-1.5 py-0.5 text-[11px] font-mono-archive text-[var(--ink-muted)] hover:text-[var(--ink-primary)] cursor-pointer"
                  >
                    取消
                  </button>
                </template>
                <template v-else>
                  <span class="font-serif-editorial text-sm font-medium text-[var(--ink-primary)]">
                    {{ dev.name }}
                  </span>
                  <button
                    type="button"
                    @click="startRenameDevice(dev)"
                    class="inline-flex items-center gap-0.5 px-1.5 py-0.2 text-[10px] font-mono-archive text-[var(--ink-muted)] hover:text-[var(--ink-primary)] border border-transparent hover:border-[var(--border-subtle)] rounded-xs cursor-pointer transition-colors"
                    title="修改设备显示名称"
                  >
                    <Edit2 class="w-2.5 h-2.5" />
                    <span>改名</span>
                  </button>
                </template>
                <span class="text-[10px] font-mono-archive uppercase px-1.5 py-0.2 rounded-xs border border-[var(--border-subtle)] bg-[var(--bg-archive)] text-[var(--ink-muted)]">
                  {{ dev.platform }}
                </span>
                <span
                  v-if="dev.device_id"
                  class="text-[10px] font-mono-archive px-1.5 py-0.2 rounded-xs bg-[var(--bg-subtle)] border border-[var(--border-subtle)] text-[var(--ink-secondary)] select-all"
                  title="设备唯一标识"
                >
                  {{ dev.device_id }}
                </span>
                <span class="w-1.5 h-1.5 rounded-full bg-[var(--accent-moss)]" title="已授信激活"></span>
              </div>
              <div class="text-[11px] font-mono-archive text-[var(--ink-muted)] flex flex-wrap items-center gap-x-3 gap-y-0.5">
                <span>首次配对：{{ formatDateTime(dev.paired_at) }}</span>
                <span>最后活跃：{{ formatDateTime(dev.last_active_at) }}</span>
              </div>
            </div>
          </div>

          <button
            @click="handleRevoke(dev.id)"
            class="px-2.5 py-1.5 text-xs font-mono-archive text-[var(--ink-muted)] hover:text-red-700 hover:bg-red-500/10 border border-transparent hover:border-red-500/20 rounded-xs transition-colors cursor-pointer shrink-0 flex items-center gap-1"
            title="吊销并解除配对"
          >
            <Trash2 class="w-3.5 h-3.5" />
            <span class="hidden sm:inline">解除配对</span>
          </button>
        </div>
      </div>

      <!-- 底部底款 -->
      <div class="pt-3 border-t border-[var(--border-subtle)] text-[11px] font-mono-archive text-[var(--ink-muted)] flex items-center justify-between">
        <span>每台设备均持有独立授权凭据，可随时单独解除</span>
        <button
          @click="emit('close')"
          class="hover:text-[var(--ink-primary)] cursor-pointer hover-underline"
        >
          完成并关闭
        </button>
      </div>
    </div>
  </div>
</template>
