<script setup lang="ts">
import { ref, onMounted, watch } from 'vue'
import {
  X,
  Smartphone,
  Laptop,
  ShieldCheck,
  RefreshCw,
  Trash2,
  Copy,
  Check,
  Clock,
} from 'lucide-vue-next'
import type { TrustedDevice, PairingTicketResult } from '../types'
import { initPairingTicket, fetchTrustedDevices, revokeTrustedDevice } from '../utils/api'
import { audio } from '../utils/audio'

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
let countdownTimer: number | null = null



const startCountdown = (sec: number) => {
  if (countdownTimer) clearInterval(countdownTimer)
  countdownSeconds.value = sec
  countdownTimer = window.setInterval(() => {
    if (countdownSeconds.value > 0) {
      countdownSeconds.value--
    } else {
      if (countdownTimer) clearInterval(countdownTimer)
      currentTicket.value = null
    }
  }, 1000)
}

const generateTicket = async () => {
  audio.playTink()
  isLoadingTicket.value = true
  try {
    const res = await initPairingTicket()
    currentTicket.value = res
    startCountdown(res.expires_in_seconds || 300)
  } catch {
    // 降级为本地演示工单
    const randomPin = String(Math.floor(100000 + Math.random() * 900000))
    const mockTicket = `pair_tk_${Math.random().toString(36).substring(2, 10)}`
    currentTicket.value = {
      ticket: mockTicket,
      pin_code: randomPin,
      expires_at: new Date(Date.now() + 300000).toISOString(),
      expires_in_seconds: 300,
      qr_payload: `looseleaf://pair?ticket=${mockTicket}&hub=${window.location.origin}`,
    }
    startCountdown(300)
  } finally {
    isLoadingTicket.value = false
  }
}

const loadDevices = async () => {
  isLoadingDevices.value = true
  try {
    const res = await fetchTrustedDevices()
    devices.value = res || []
  } catch {
    devices.value = []
  } finally {
    isLoadingDevices.value = false
  }
}

const handleRevoke = async (id: number) => {
  audio.playTink()
  if (!confirm('确定解绑并吊销该设备的免密信任？解绑后该设备需重新扫码配对。')) return
  try {
    await revokeTrustedDevice(id)
  } catch {}
  devices.value = devices.value.filter((d) => d.id !== id)
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
  } catch {}
}

const formatDateTime = (iso: string) => {
  try {
    const d = new Date(iso)
    if (isNaN(d.getTime())) return iso
    const pad = (n: number) => String(n).padStart(2, '0')
    return `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
  } catch {
    return iso
  }
}

watch(
  () => props.isOpen,
  (open) => {
    if (open) {
      loadDevices()
      if (!currentTicket.value) {
        generateTicket()
      }
    } else {
      if (countdownTimer) clearInterval(countdownTimer)
    }
  }
)

onMounted(() => {
  if (props.isOpen) {
    loadDevices()
    generateTicket()
  }
})
</script>

<template>
  <div
    v-if="isOpen"
    class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/45 backdrop-blur-xs transition-opacity duration-200"
    @click.self="emit('close')"
  >
    <div
      class="w-full max-w-xl bg-[var(--bg-archive)] border border-[var(--border-subtle)] rounded-xs shadow-2xl p-4 sm:p-8 text-left space-y-6 max-h-[90dvh] overflow-y-auto animate-in fade-in zoom-in-95 duration-200"
    >
      <!-- 弹窗标题 -->
      <div class="flex items-center justify-between pb-4 border-b border-[var(--border-subtle)]">
        <div class="space-y-1">
          <div class="flex items-center gap-2">
            <h2 class="font-serif-editorial text-2xl text-[var(--ink-primary)] font-medium">
              设备免密配对与管理
            </h2>
            <ShieldCheck class="w-4 h-4 text-[var(--accent-moss)]" />
          </div>
          <p class="font-mono-archive text-xs text-[var(--ink-muted)]">
            受信任设备免密协同中枢
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
          配对新设备 (PIN / 扫码)
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

      <!-- 板块 1：生成配对 PIN 码与二维码 -->
      <div v-if="activeTab === 'pair'" class="space-y-6">
        <div class="p-4 bg-[var(--bg-subtle)]/70 rounded-xs border border-[var(--border-subtle)] space-y-4">
          <div class="flex items-center justify-between text-xs font-mono-archive text-[var(--ink-muted)]">
            <span>配对凭据有效期</span>
            <span class="flex items-center gap-1 text-[var(--accent-warm)]">
              <Clock class="w-3.5 h-3.5" />
              <span>{{ countdownSeconds }}s</span>
            </span>
          </div>

          <!-- 6 位高辨识度 PIN 码 -->
          <div class="text-center py-3 space-y-2">
            <div class="text-[11px] font-mono-archive text-[var(--ink-muted)] tracking-widest">
              6位免密握手 PIN 码
            </div>
            <div class="font-mono-archive text-4xl sm:text-5xl tracking-widest font-semibold text-[var(--ink-primary)] select-all">
              {{ currentTicket?.pin_code || '------' }}
            </div>
            <p class="text-xs font-serif-editorial text-[var(--ink-secondary)] pt-1">
              在手机 App 或 macOS 桌面端“连接中枢”页面输入此 PIN 码即可瞬间授信绑定。
            </p>
          </div>

          <!-- 配对专属协议 Deep Link -->
          <div class="pt-2 border-t border-[var(--border-subtle)]/60 flex items-center justify-between gap-3 text-xs font-mono-archive">
            <div class="truncate text-[11px] text-[var(--ink-muted)] select-all">
              {{ currentTicket?.qr_payload || 'looseleaf://pair' }}
            </div>
            <button
              @click="copyPayload"
              class="px-2.5 py-1 shrink-0 border border-[var(--border-subtle)] hover:border-[var(--ink-primary)] rounded-xs cursor-pointer flex items-center gap-1 text-[var(--ink-secondary)] hover:text-[var(--ink-primary)] transition-colors"
            >
              <component :is="copied ? Check : Copy" class="w-3.5 h-3.5" />
              <span>{{ copied ? '已复制' : '复制配对链接' }}</span>
            </button>
          </div>
        </div>

        <!-- 刷新工单按钮 -->
        <div class="flex items-center justify-between text-xs font-mono-archive text-[var(--ink-muted)]">
          <span class="text-[11px]">配对成功后下发高熵密钥，存入原生系统 Keychain / KeyStore。</span>
          <button
            @click="generateTicket"
            class="flex items-center gap-1 hover:text-[var(--ink-primary)] cursor-pointer text-xs"
          >
            <RefreshCw class="w-3.5 h-3.5" :class="{ 'animate-spin': isLoadingTicket }" />
            <span>重新生成</span>
          </button>
        </div>
      </div>

      <!-- 板块 2：受信任设备列表 -->
      <div v-else class="space-y-4 max-h-[350px] overflow-y-auto pr-1">
        <div v-if="devices.length === 0" class="py-12 text-center text-xs font-mono-archive text-[var(--ink-muted)] space-y-1">
          <p>暂无已配对的外部终端设备</p>
          <p class="text-[11px] opacity-70">点击上方“配对新设备”为您的手机或 Mac 桌面端授权。</p>
        </div>

        <div
          v-for="dev in devices"
          :key="dev.id"
          class="p-3.5 rounded-xs border border-[var(--border-subtle)] bg-[var(--bg-subtle)]/40 flex items-center justify-between group hover:border-[var(--border-divider)] transition-colors"
        >
          <div class="flex items-center gap-3">
            <div class="w-9 h-9 rounded-xs border border-[var(--border-subtle)] bg-[var(--bg-archive)] flex items-center justify-center text-[var(--ink-secondary)] shrink-0">
              <Laptop v-if="dev.platform === 'macos'" class="w-4 h-4" />
              <Smartphone v-else class="w-4 h-4" />
            </div>

            <div class="space-y-0.5">
              <div class="flex items-center gap-2">
                <span class="font-serif-editorial text-sm font-medium text-[var(--ink-primary)]">{{ dev.name }}</span>
                <span class="text-[10px] font-mono-archive uppercase px-1 py-0.2 rounded-xs border border-[var(--border-subtle)] bg-[var(--bg-archive)] text-[var(--ink-muted)]">
                  {{ dev.platform }}
                </span>
                <span class="w-1.5 h-1.5 rounded-full bg-[var(--accent-moss)]" title="已信任"></span>
              </div>
              <div class="text-[11px] font-mono-archive text-[var(--ink-muted)] flex items-center gap-3">
                <span>配对时间：{{ formatDateTime(dev.paired_at) }}</span>
                <span>最后活跃：{{ formatDateTime(dev.last_active_at) }}</span>
              </div>
            </div>
          </div>

          <button
            @click="handleRevoke(dev.id)"
            class="p-1.5 text-[var(--ink-muted)] hover:text-red-700 hover:bg-red-500/10 rounded-xs transition-colors cursor-pointer"
            title="吊销并解除信任"
          >
            <Trash2 class="w-4 h-4" />
          </button>
        </div>
      </div>

      <!-- 底部协议说明 -->
      <div class="pt-3 border-t border-[var(--border-subtle)] text-[11px] font-mono-archive text-[var(--ink-muted)] flex items-center justify-between">
        <span>协议契约：docs/backend.md § 5.7</span>
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
