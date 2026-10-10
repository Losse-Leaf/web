<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { X, Plus, Trash2, Calendar, Check } from 'lucide-vue-next'
import {
  fetchCreditChannels,
  createCreditChannel,
  updateCreditChannel,
  deleteCreditChannel,
} from '../utils/api'
import type { CreditChannel } from '../types'

const props = defineProps<{
  isOpen: boolean
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'channelsUpdated'): void
}>()

const channels = ref<CreditChannel[]>([])
const isLoading = ref(false)
const errorMsg = ref('')

// 新建信贷渠道表单
const newName = ref('')
const newRepaymentDay = ref<number>(10)
const newColor = ref('var(--accent-warm)')
const isCreating = ref(false)

// 编辑中状态 map: channelId -> { name, repayment_day, isSaving }
const editingMap = ref<Record<number, { repayment_day: number; name: string; isSaving?: boolean }>>({})

const daysOptions = Array.from({ length: 31 }, (_, i) => i + 1)

const loadChannels = async () => {
  try {
    isLoading.value = true
    errorMsg.value = ''
    const list = await fetchCreditChannels()
    channels.value = list
    // 初始化编辑状态
    const map: Record<number, { repayment_day: number; name: string }> = {}
    list.forEach((ch) => {
      if (ch.id) {
        map[ch.id] = { repayment_day: ch.repayment_day, name: ch.name }
      }
    })
    editingMap.value = map
  } catch (err: any) {
    errorMsg.value = '加载信贷渠道失败: ' + (err.message || '网络异常')
  } finally {
    isLoading.value = false
  }
}

const handleCreateChannel = async () => {
  const name = newName.value.trim()
  if (!name) {
    errorMsg.value = '请输入信贷渠道名称'
    return
  }
  if (newRepaymentDay.value < 1 || newRepaymentDay.value > 31) {
    errorMsg.value = '每月还款日必须在 1 至 31 日之间'
    return
  }

  try {
    isCreating.value = true
    errorMsg.value = ''
    await createCreditChannel({
      name,
      repayment_day: newRepaymentDay.value,
      color: newColor.value,
    })
    newName.value = ''
    newRepaymentDay.value = 10
    await loadChannels()
    emit('channelsUpdated')
  } catch (err: any) {
    errorMsg.value = err.message || '创建渠道失败'
  } finally {
    isCreating.value = false
  }
}

const handleSaveChannel = async (ch: CreditChannel) => {
  if (!ch.id) return
  const edit = editingMap.value[ch.id]
  if (!edit) return

  if (edit.repayment_day < 1 || edit.repayment_day > 31) {
    errorMsg.value = '还款日必须在 1 至 31 日之间'
    return
  }

  try {
    edit.isSaving = true
    errorMsg.value = ''
    await updateCreditChannel(ch.id, {
      name: edit.name.trim() || ch.name,
      repayment_day: edit.repayment_day,
    })
    await loadChannels()
    emit('channelsUpdated')
  } catch (err: any) {
    errorMsg.value = err.message || '更新渠道失败'
  } finally {
    if (editingMap.value[ch.id]) {
      editingMap.value[ch.id].isSaving = false
    }
  }
}

const handleDeleteChannel = async (ch: CreditChannel) => {
  if (!ch.id) return
  if (!confirm(`确定删除信贷渠道「${ch.name}」？关联的分期账单仍将保留`)) return

  try {
    errorMsg.value = ''
    await deleteCreditChannel(ch.id)
    await loadChannels()
    emit('channelsUpdated')
  } catch (err: any) {
    errorMsg.value = err.message || '删除渠道失败'
  }
}

onMounted(() => {
  loadChannels()
})
</script>

<template>
  <div
    v-if="isOpen"
    class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[var(--ink-primary)]/40 backdrop-blur-xs animate-in fade-in duration-200"
    @click.self="emit('close')"
  >
    <div
      class="bg-[var(--bg-archive)] border border-[var(--border-subtle)] w-full max-w-xl rounded-xs shadow-2xl p-6 sm:p-8 space-y-6 max-h-[90vh] overflow-y-auto text-left"
    >
      <!-- 弹窗标头 -->
      <div class="flex items-start justify-between pb-4 border-b border-[var(--border-subtle)]">
        <div>
          <div class="flex items-center gap-2">
            <h2 class="font-serif-editorial text-2xl text-[var(--ink-primary)] font-medium">
              信贷渠道与独立还款日
            </h2>
            <span class="text-[10px] font-mono-archive px-1.5 py-0.5 border border-[var(--border-subtle)] rounded-xs text-[var(--ink-muted)]">
              RC-53 / FE-15
            </span>
          </div>
          <p class="font-serif-editorial text-xs text-[var(--ink-muted)] mt-1">
            为各信贷渠道（花呗、白条、信用卡等）独立绑定每月还款日 (1~31 日)，资产大盘将精准测算还款倒计时与信贷负债。
          </p>
        </div>
        <button
          @click="emit('close')"
          class="text-[var(--ink-muted)] hover:text-[var(--ink-primary)] p-1 cursor-pointer transition-colors"
        >
          <X class="w-4 h-4" />
        </button>
      </div>

      <!-- 错误提示 -->
      <div v-if="errorMsg" class="p-3 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800/40 text-red-700 dark:text-red-300 text-xs font-mono-archive rounded-xs">
        {{ errorMsg }}
      </div>

      <!-- 渠道列表 -->
      <div class="space-y-4">
        <h3 class="font-mono-archive text-xs font-semibold text-[var(--ink-muted)] tracking-wider">
          已配置信贷渠道 ({{ channels.length }})
        </h3>

        <div v-if="isLoading" class="text-xs font-mono-archive text-[var(--ink-muted)] py-4 text-center">
          正在读取信贷渠道...
        </div>

        <div v-else class="space-y-3">
          <div
            v-for="ch in channels"
            :key="ch.id || ch.code"
            class="p-3.5 bg-[var(--bg-subtle)]/40 border border-[var(--border-subtle)] rounded-xs space-y-2.5 font-mono-archive text-xs"
          >
            <div class="flex items-center justify-between gap-3">
              <div class="flex items-center gap-2">
                <span
                  class="w-2 h-2 rounded-full inline-block"
                  :style="{ backgroundColor: ch.color || 'var(--accent-warm)' }"
                />
                <span v-if="ch.is_builtin" class="font-medium text-[var(--ink-primary)] text-sm">
                  {{ ch.name }}
                </span>
                <input
                  v-else
                  v-if="ch.id && editingMap[ch.id]"
                  v-model="editingMap[ch.id].name"
                  type="text"
                  class="font-medium text-[var(--ink-primary)] text-sm bg-[var(--bg-archive)] border border-[var(--border-subtle)] px-2 py-0.5 rounded-xs outline-none focus:border-[var(--ink-primary)]"
                />
                <span v-if="ch.is_builtin" class="text-[10px] px-1.5 py-0.2 bg-[var(--bg-subtle)] border border-[var(--border-subtle)] rounded-xs text-[var(--ink-muted)]">
                  系统内置
                </span>
              </div>

              <!-- 操作区 -->
              <div class="flex items-center gap-2">
                <button
                  v-if="!ch.is_builtin && ch.id"
                  @click="handleDeleteChannel(ch)"
                  class="text-[var(--ink-muted)] hover:text-red-700 p-1 cursor-pointer transition-colors"
                  title="删除自定义渠道"
                >
                  <Trash2 class="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            <!-- 还款日配置与保存 -->
            <div class="flex flex-wrap items-center justify-between gap-3 pt-1 border-t border-[var(--border-subtle)]/50 text-[11px]">
              <div class="flex items-center gap-2" v-if="ch.id && editingMap[ch.id]">
                <Calendar class="w-3.5 h-3.5 text-[var(--ink-muted)]" />
                <span class="text-[var(--ink-muted)]">每月独立还款日:</span>
                <select
                  v-model.number="editingMap[ch.id].repayment_day"
                  class="px-2 py-1 bg-[var(--bg-archive)] border border-[var(--border-subtle)] rounded-xs outline-none text-[var(--ink-primary)] font-mono-archive cursor-pointer"
                >
                  <option v-for="d in daysOptions" :key="d" :value="d">
                    每月 {{ d }} 号
                  </option>
                </select>
              </div>

              <button
                v-if="ch.id && editingMap[ch.id]"
                @click="handleSaveChannel(ch)"
                type="button"
                :disabled="editingMap[ch.id].isSaving"
                class="inline-flex items-center gap-1 px-2.5 py-1 bg-[var(--bg-archive)] border border-[var(--border-subtle)] hover:border-[var(--ink-primary)] text-[var(--ink-secondary)] hover:text-[var(--ink-primary)] rounded-xs transition-colors cursor-pointer"
              >
                <Check class="w-3 h-3" />
                <span>{{ editingMap[ch.id].isSaving ? '保存中...' : '保存还款日' }}</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- 添加新信贷渠道 -->
      <div class="p-4 bg-[var(--bg-subtle)]/60 border border-[var(--border-subtle)] rounded-xs space-y-3 font-mono-archive text-xs">
        <h4 class="font-medium text-[var(--ink-primary)] flex items-center gap-1.5">
          <Plus class="w-3.5 h-3.5" />
          <span>添加自定义信贷渠道 (信用卡 / 免息分期)</span>
        </h4>

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label class="block text-[11px] text-[var(--ink-muted)] mb-1">渠道名称 *</label>
            <input
              v-model="newName"
              type="text"
              placeholder="例如: 招行信用卡 / Apple免息"
              class="w-full px-2.5 py-1.5 bg-[var(--bg-archive)] border border-[var(--border-subtle)] rounded-xs outline-none text-xs text-[var(--ink-primary)] focus:border-[var(--ink-primary)]"
            />
          </div>

          <div>
            <label class="block text-[11px] text-[var(--ink-muted)] mb-1">每月还款日 *</label>
            <select
              v-model.number="newRepaymentDay"
              class="w-full px-2.5 py-1.5 bg-[var(--bg-archive)] border border-[var(--border-subtle)] rounded-xs outline-none text-xs text-[var(--ink-primary)] cursor-pointer"
            >
              <option v-for="d in daysOptions" :key="d" :value="d">
                每月 {{ d }} 号
              </option>
            </select>
          </div>
        </div>

        <div class="flex items-center justify-end pt-1">
          <button
            @click="handleCreateChannel"
            type="button"
            :disabled="isCreating"
            class="px-3.5 py-1.5 bg-[var(--ink-primary)] text-[var(--bg-archive)] rounded-xs text-xs hover:opacity-90 transition-opacity cursor-pointer inline-flex items-center gap-1"
          >
            <Plus class="w-3.5 h-3.5" />
            <span>{{ isCreating ? '正在添加...' : '确认添加渠道' }}</span>
          </button>
        </div>
      </div>

      <!-- 底部关闭 -->
      <div class="flex items-center justify-end pt-2 border-t border-[var(--border-subtle)]">
        <button
          @click="emit('close')"
          class="px-4 py-1.5 text-xs font-mono-archive bg-[var(--bg-subtle)] hover:bg-[var(--border-subtle)] text-[var(--ink-primary)] rounded-xs cursor-pointer transition-colors"
        >
          关闭
        </button>
      </div>
    </div>
  </div>
</template>
