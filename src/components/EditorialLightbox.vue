<script setup lang="ts">
import { ref, watch, onBeforeUnmount } from 'vue'
import { X, Camera, MapPin, Calendar } from 'lucide-vue-next'

const props = defineProps<{
  isOpen: boolean
  imageUrl: string
  title?: string
  meta?: string
  location?: string
  date?: string
}>()

const emit = defineEmits<{
  (e: 'close'): void
}>()

/**
 * MOB-P2-83：移动端灯箱手势
 * - 双指捏合 → 缩放（1× ~ 4×）
 * - 单指下滑 → 关闭（这是 iOS/Android 相册的标准手势）
 * - 单击 → 关闭（未放大时）
 * 桌面端保持原有行为。
 */
const scale = ref(1)
// 手势舞台 DOM 引用：touchmove 需要以 non-passive 方式挂载/卸载
const imageStageRef = ref<HTMLElement | null>(null)
const offsetX = ref(0)
const offsetY = ref(0)
const dragging = ref(false)
const swipeY = ref(0)
const pinchStartDistance = ref(0)
const pinchStartScale = ref(1)
const panStart = ref({ x: 0, y: 0 })

const reset = () => {
  scale.value = 1
  offsetX.value = 0
  offsetY.value = 0
  swipeY.value = 0
  dragging.value = false
}

const distance = (t1: Touch, t2: Touch) =>
  Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY)

const onTouchStart = (e: TouchEvent) => {
  if (e.touches.length === 2) {
    pinchStartDistance.value = distance(e.touches[0], e.touches[1])
    pinchStartScale.value = scale.value
  } else if (e.touches.length === 1) {
    dragging.value = true
    panStart.value = { x: e.touches[0].clientX, y: e.touches[0].clientY }
  }
}

const onTouchMove = (e: TouchEvent) => {
  if (e.touches.length === 2 && pinchStartDistance.value > 0) {
    e.preventDefault()
    const d = distance(e.touches[0], e.touches[1])
    const next = Math.min(4, Math.max(1, pinchStartScale.value * (d / pinchStartDistance.value)))
    scale.value = next
  } else if (e.touches.length === 1 && dragging.value) {
    const dy = e.touches[0].clientY - panStart.value.y
    const dx = e.touches[0].clientX - panStart.value.x
    if (scale.value > 1.02) {
      // 放大状态下：拖拽平移
      e.preventDefault()
      offsetX.value = dx
      offsetY.value = dy
    } else {
      // 未放大：向下拖拽准备关闭
      if (dy > 0) swipeY.value = dy
    }
  }
}

const onTouchEnd = () => {
  pinchStartDistance.value = 0
  if (!dragging.value) return
  dragging.value = false
  if (scale.value <= 1.02 && swipeY.value > 90) {
    emit('close')
  }
  swipeY.value = 0
}

const handleKeydown = (e: KeyboardEvent) => {
  if (e.key === 'Escape' && props.isOpen) {
    emit('close')
  }
}

watch(
  () => props.isOpen,
  (open) => {
    if (open) {
      window.addEventListener('keydown', handleKeydown)
      document.body.style.overflow = 'hidden'
      reset()
    } else {
      window.removeEventListener('keydown', handleKeydown)
      document.body.style.overflow = ''
    }
    // 捏合缩放/放大平移需要 preventDefault，touchmove 监听必须 non-passive：
    // Vue 的 .passive 修饰符会让 preventDefault 变成 no-op（浏览器忽略并告警），
    // iOS 上双指捏合会同时缩放整个页面。touchstart 保持 passive 不影响。
    const el = imageStageRef.value
    if (el) {
      if (open) el.addEventListener('touchmove', onTouchMove, { passive: false })
      else el.removeEventListener('touchmove', onTouchMove)
    }
  },
  { immediate: true }
)

onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleKeydown)
  imageStageRef.value?.removeEventListener('touchmove', onTouchMove)
  document.body.style.overflow = ''
})
</script>

<template>
  <div
    v-if="isOpen"
    class="fixed inset-0 z-[100] flex flex-col justify-between p-3 sm:p-8 bg-[#121110]/95 backdrop-blur-md text-[#ece9e1] animate-in fade-in duration-200 select-none cursor-default"
    style="padding-top: max(0.75rem, env(safe-area-inset-top, 0px)); padding-bottom: max(0.75rem, env(safe-area-inset-bottom, 0px));"
    @click.self="emit('close')"
  >
    <!-- 顶部暗房灯箱控制栏 -->
    <header class="w-full max-w-6xl mx-auto flex items-center justify-between py-2 border-b border-white/10 text-xs font-mono-archive text-[#98958c]">
      <div class="flex items-center gap-3">
        <span class="text-[#d8764b] font-medium tracking-widest">暗房底片灯箱</span>
        <span class="hidden sm:inline opacity-60">· 胶片原图查看</span>
      </div>

      <button
        @click="emit('close')"
        class="inline-flex items-center gap-1.5 px-3 py-1 text-xs text-[#ece9e1] hover:text-[#d8764b] border border-white/10 hover:border-white/30 rounded-xs transition-colors cursor-pointer"
      >
        <span class="hidden sm:inline">ESC 关闭</span>
        <span class="sm:hidden">关闭</span>
        <X class="w-3.5 h-3.5" />
      </button>
    </header>

    <!-- 中央装裱大图视口（MOB-P2-83：捏合缩放 / 下滑关闭） -->
    <main
      class="flex-grow flex items-center justify-center p-2 sm:p-6 overflow-hidden"
      @click.self="emit('close')"
    >
      <div
        ref="imageStageRef"
        class="relative max-w-5xl max-h-[76dvh] sm:max-h-[76vh] flex flex-col items-center"
        :style="{
          transform: `translate(${offsetX}px, ${offsetY + swipeY}px) scale(${scale})`,
          transition: dragging ? 'none' : 'transform 180ms cubic-bezier(0.16,1,0.3,1)',
          opacity: swipeY > 0 ? Math.max(0.3, 1 - swipeY / 400) : 1
        }"
        @touchstart.passive="onTouchStart"
        @touchmove="onTouchMove"
        @touchend="onTouchEnd"
        @touchcancel="onTouchEnd"
      >
        <img
          :src="imageUrl"
          :alt="title || '底片装裱'"
          class="max-w-full max-h-[76dvh] sm:max-h-[76vh] object-contain rounded-xs shadow-[0_25px_60px_rgba(0,0,0,0.6)] ring-1 ring-white/10 select-none"
          loading="lazy" decoding="async">
      </div>
    </main>

    <!-- 底部出版元信息装裱条 (Passe-partout Strip) -->
    <footer class="w-full max-w-6xl mx-auto py-3 border-t border-white/10 flex flex-wrap items-center justify-between gap-4 text-xs font-mono-archive">
      <div class="space-y-1">
        <h4 v-if="title" class="font-serif-editorial text-base sm:text-lg text-[#ece9e1] font-normal">
          {{ title }}
        </h4>
        <div class="flex flex-wrap items-center gap-x-4 gap-y-1 text-[#98958c]">
          <span v-if="date" class="inline-flex items-center gap-1">
            <Calendar class="w-3 h-3 text-[#d8764b]" />
            <span>{{ date }}</span>
          </span>
          <span v-if="location" class="inline-flex items-center gap-1">
            <MapPin class="w-3 h-3 text-[#d8764b]" />
            <span>{{ location }}</span>
          </span>
          <span v-if="meta" class="inline-flex items-center gap-1 text-[#ece9e1]/80">
            <Camera class="w-3 h-3 text-[#d8764b]" />
            <span>{{ meta }}</span>
          </span>
        </div>
      </div>

      <div class="text-[#78756d] text-[11px] hidden sm:block">
        35mm ARCHIVE · LIFE > PROJECTS
      </div>
    </footer>
  </div>
</template>
