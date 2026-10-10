<script setup lang="ts">
import { ref, watch, onMounted } from 'vue'
import { X, Check, Trash2, Plus, RotateCcw, Camera, Loader2, User } from 'lucide-vue-next'
import type { CuratorProfile, GearItem } from '../types'
import { DEFAULT_PROFILE, saveCuratorProfile } from '../utils/profile'
import { uploadUnifiedFile, updateCuratorProfile, createTransaction } from '../utils/api'

const props = defineProps<{
  isOpen: boolean
  profile: CuratorProfile
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'updated', profile: CuratorProfile): void
}>()

const cloneProfile = (p: CuratorProfile): CuratorProfile => ({
  ...p,
  edc_gear: p.edc_gear ? p.edc_gear.map((item) => ({ ...item })) : [],
})

const form = ref<CuratorProfile>(cloneProfile(props.profile))
const activeTab = ref<'base' | 'gear'>('base')

// 头像上传与相对路径状态
const fileInputRef = ref<HTMLInputElement | null>(null)
const isUploadingAvatar = ref(false)
const avatarUploadProgress = ref(0)
const avatarUploadError = ref('')
const avatarKey = ref(props.profile.avatar_key || '')

// 保存状态
const isSaving = ref(false)
const saveError = ref('')

// 装备新增区
const newGearCategory = ref('影像与暗房')
const newGearName = ref('')
const newGearSpec = ref('')
const newGearStatus = ref('日常自用')
const newGearNote = ref('')
const newGearPrice = ref('')
const newGearPurchaseDate = ref(new Date().toISOString().slice(0, 10))
const syncBuyTransaction = ref(true)
const showAddGear = ref(false)

const categories = [
  '影像与暗房',
  '工作台与算力',
  '手冲咖啡工坊',
  '夜骑巡航',
  '纸笔与日常',
]

// 仅在弹窗打开时同步并克隆表单状态，移除全局深监听与 JSON 频繁序列化开销 (FE-07)
watch(
  () => props.isOpen,
  (open) => {
    if (open) {
      form.value = cloneProfile(props.profile)
      avatarKey.value = props.profile.avatar_key || ''
      avatarUploadError.value = ''
      saveError.value = ''
    }
  },
  { immediate: true }
)

const triggerSelectAvatar = () => {
  fileInputRef.value?.click()
}

const handleAvatarFileChange = async (e: Event) => {
  const target = e.target as HTMLInputElement
  const file = target.files?.[0]
  if (!file) return
  await processAvatarUpload(file)
  target.value = ''
}

const handleAvatarDrop = async (e: DragEvent) => {
  const file = e.dataTransfer?.files?.[0]
  if (file && file.type.startsWith('image/')) {
    await processAvatarUpload(file)
  }
}

const processAvatarUpload = async (file: File) => {
  if (file.size > 20 * 1024 * 1024) {
    avatarUploadError.value = '图片大小不能超过 20MB'
    return
  }

  isUploadingAvatar.value = true
  avatarUploadProgress.value = 10
  avatarUploadError.value = ''

  try {
    const res = await uploadUnifiedFile(file, 'avatar', (pct) => {
      avatarUploadProgress.value = Math.max(10, pct)
    })
    // 获得后端相对路径与有效访问 URL
    avatarKey.value = res.object_key
    form.value.avatar_url = res.url
    form.value.avatar_key = res.object_key
  } catch (err: any) {
    // 离线/未配置存储时优雅降级：FileReader 本地暂存
    const reader = new FileReader()
    reader.onload = (ev) => {
      if (ev.target?.result) {
        form.value.avatar_url = ev.target.result as string
      }
    }
    reader.readAsDataURL(file)
    avatarUploadError.value = err?.message || '后端直传失败，已自动转为本地暂存'
  } finally {
    isUploadingAvatar.value = false
  }
}

const handleSave = async () => {
  isSaving.value = true
  saveError.value = ''

  // 1. 规范清洗字段：彻底杜绝英文名，信条与座右铭合一，城市与坐标合一 (RC-31, RC-52)
  if (!form.value.motto?.trim()) {
    form.value.motto = DEFAULT_PROFILE.motto
  }
  if (!form.value.location?.trim()) {
    form.value.location = ''
  }
  form.value.current_city = form.value.location ? (form.value.location.split('·')[1]?.trim() || form.value.location.trim()) : ''

  // 2. 尝试向后端更新持久化 (PUT /api/v1/profile, RG-09, RC-29, RC-31, RC-32)
  try {
    await updateCuratorProfile({
      name: form.value.name,
      title: form.value.title,
      bio: form.value.bio,
      location: form.value.location,
      current_city: form.value.current_city,
      avatar_key: avatarKey.value || form.value.avatar_key || undefined,
      avatar_url: form.value.avatar_url,
      motto: form.value.motto,
      email: form.value.email,
      github: form.value.github,
      social_links: {
        email: form.value.email || '',
        github: form.value.github || '',
      },
      edc_gear: form.value.edc_gear,
    })
  } catch (err: any) {
    console.warn('后端更新主理人档案失败，自动依赖本地缓存:', err)
  }

  // 3. 前端持久化缓存到 localStorage，节省资源，支持离线秒开
  saveCuratorProfile(form.value)
  emit('updated', form.value)
  isSaving.value = false
  emit('close')
}

const handleResetDefault = () => {
  if (!confirm('确定恢复为默认主理人资料与预置设备清单？')) return
  form.value = cloneProfile(DEFAULT_PROFILE)
}

const handleAddGear = async () => {
  if (!newGearName.value.trim()) return
  const priceFloat = parseFloat(newGearPrice.value)
  const priceCents = !isNaN(priceFloat) && priceFloat > 0 ? Math.round(priceFloat * 100) : undefined

  const item: GearItem = {
    id: `gear-${Date.now()}`,
    category: newGearCategory.value,
    name: newGearName.value.trim(),
    spec: newGearSpec.value.trim(),
    status: newGearStatus.value.trim() || '日常自用',
    note: newGearNote.value.trim(),
    price_cents: priceCents,
    purchase_date: newGearPurchaseDate.value || new Date().toISOString().slice(0, 10),
  }
  if (!form.value.edc_gear) form.value.edc_gear = []
  form.value.edc_gear.push(item)

  // 路径 A：买入双向生成支出账单 (RC-53)
  if (syncBuyTransaction.value && priceCents && priceCents > 0) {
    try {
      await createTransaction({
        type: 'expense',
        category: '购物',
        amount: priceCents,
        title: `购入设备: ${item.name}`,
        note: item.spec || item.note,
        payment_method: '微信支付',
        occurred_at: newGearPurchaseDate.value ? `${newGearPurchaseDate.value}T12:00:00` : new Date().toISOString(),
      })
    } catch (err) {
      console.warn('同步生成购买支出流水失败:', err)
    }
  }

  newGearName.value = ''
  newGearSpec.value = ''
  newGearNote.value = ''
  newGearPrice.value = ''
  newGearPurchaseDate.value = new Date().toISOString().slice(0, 10)
  syncBuyTransaction.value = true
  showAddGear.value = false
}

const handleSellGear = async (idx: number) => {
  const item = form.value.edc_gear?.[idx]
  if (!item) return
  const input = prompt(`请输入「${item.name}」转让/出二手回血金额 (¥):`, item.price_cents ? (item.price_cents / 100).toFixed(2) : '')
  if (input === null) return
  const soldFloat = parseFloat(input)
  if (isNaN(soldFloat) || soldFloat < 0) {
    alert('请输入有效金额')
    return
  }
  const soldCents = Math.round(soldFloat * 100)
  item.status = '已出二手'
  item.sold_price = soldCents
  item.sold_date = new Date().toISOString().slice(0, 10)

  // 路径 B：闲置转售 · 卖出自动生成回血收入账单 (RC-53)
  if (soldCents > 0) {
    try {
      await createTransaction({
        type: 'income',
        category: '二手回血',
        amount: soldCents,
        title: `设备转售回血: ${item.name}`,
        note: `转让回收资金，设备原购置于 ${item.purchase_date || '此前'}`,
        payment_method: '微信支付',
        occurred_at: new Date().toISOString(),
      })
    } catch (err) {
      console.warn('同步生成二手回血收入流水失败:', err)
    }
  }
}

const removeGear = (idx: number) => {
  form.value.edc_gear?.splice(idx, 1)
}

const handleKeydown = (e: KeyboardEvent) => {
  if (e.key === 'Escape' && props.isOpen) {
    emit('close')
  }
}

onMounted(() => {
  window.addEventListener('keydown', handleKeydown)
})
</script>

<template>
  <div
    v-if="isOpen"
    class="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/45 backdrop-blur-xs animate-in fade-in duration-200"
    @click.self="emit('close')"
  >
    <div
      class="bg-[var(--bg-archive)] border border-[var(--border-subtle)] shadow-[0_20px_60px_rgba(0,0,0,0.15)] w-full max-w-2xl max-h-[88dvh] sm:max-h-[92vh] overflow-y-auto rounded-xs p-4 sm:p-8 text-left space-y-6"
    >
      <!-- 弹窗顶栏 -->
      <div class="flex items-center justify-between border-b border-[var(--border-subtle)] pb-4">
        <div>
          <h2 class="font-serif-editorial text-2xl font-medium text-[var(--ink-primary)]">
            编辑主理人档案与设备
          </h2>
          <span class="font-mono-archive text-[11px] text-[var(--ink-muted)]">
            主理人档案与随身装备管理
          </span>
        </div>

        <button
          @click="emit('close')"
          class="p-1 text-[var(--ink-muted)] hover:text-[var(--ink-primary)] cursor-pointer"
        >
          <X class="w-5 h-5" />
        </button>
      </div>

      <!-- 分页切换：基础资料 · 设备清单 -->
      <div class="flex items-center gap-6 text-xs font-mono-archive border-b border-[var(--border-subtle)] pb-2">
        <button
          @click="activeTab = 'base'"
          class="py-1 cursor-pointer transition-colors"
          :class="activeTab === 'base' ? 'text-[var(--ink-primary)] font-semibold border-b-2 border-[var(--ink-primary)]' : 'text-[var(--ink-muted)] hover:text-[var(--ink-primary)]'"
        >
          主理人基本资料
        </button>
        <button
          @click="activeTab = 'gear'"
          class="py-1 cursor-pointer transition-colors"
          :class="activeTab === 'gear' ? 'text-[var(--ink-primary)] font-semibold border-b-2 border-[var(--ink-primary)]' : 'text-[var(--ink-muted)] hover:text-[var(--ink-primary)]'"
        >
          随身与桌面设备 ({{ (form.edc_gear || []).length }})
        </button>
      </div>

      <!-- 1. 基础资料表单 (纯文件上传 + 精简 7 项) -->
      <div v-if="activeTab === 'base'" class="space-y-6">
        
        <!-- 肖像文件上传与暗房装裱画框 (告别手工填 URL，纯本地选图/拖拽) -->
        <input
          ref="fileInputRef"
          type="file"
          accept="image/*"
          class="hidden"
          @change="handleAvatarFileChange"
        />

        <div class="p-4 rounded-xs border border-[var(--border-subtle)] bg-[var(--bg-subtle)]/30 space-y-3">
          <div class="flex items-center justify-between text-[11px] font-mono-archive text-[var(--ink-muted)] border-b border-[var(--border-subtle)]/60 pb-2">
            <span>01 肖像印记与头像上传</span>
            <span v-if="avatarKey" class="text-emerald-600 truncate max-w-[200px]" :title="avatarKey">
              相对路径: {{ avatarKey }}
            </span>
          </div>

          <div class="flex flex-col sm:flex-row items-center sm:items-start gap-5">
            <!-- 肖像画框（支持点击选择与拖拽） -->
            <div
              @click="triggerSelectAvatar"
              @dragover.prevent
              @drop.prevent="handleAvatarDrop"
              class="w-24 h-24 rounded-xs bg-[var(--bg-archive)] border-2 border-dashed border-[var(--border-subtle)] hover:border-[var(--ink-primary)] overflow-hidden shrink-0 relative cursor-pointer group transition-colors shadow-xs"
              title="点击或拖拽本地照片更换肖像"
            >
              <img
                v-if="form.avatar_url"
                :src="form.avatar_url"
                alt="头像预览"
                class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
              />
              <div
                v-else
                class="w-full h-full flex flex-col items-center justify-center bg-[var(--bg-subtle)] text-[var(--ink-muted)] space-y-1 select-none"
              >
                <User class="w-8 h-8 stroke-1" />
                <span class="text-[10px] font-mono-archive">选择肖像</span>
              </div>

              <!-- 悬浮蒙版 -->
              <div class="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center text-white text-[10px] font-mono-archive gap-1">
                <Camera class="w-4 h-4" />
                <span>更换肖像</span>
              </div>

              <!-- 上传中进度覆盖层 -->
              <div
                v-if="isUploadingAvatar"
                class="absolute inset-0 bg-black/75 backdrop-blur-xs flex flex-col items-center justify-center text-white text-[10px] font-mono-archive p-2 text-center"
              >
                <Loader2 class="w-4 h-4 animate-spin text-[var(--accent-warm)] mb-1" />
                <span>{{ avatarUploadProgress }}%</span>
              </div>
            </div>

            <!-- 右侧说明与动作按钮 -->
            <div class="flex-grow space-y-2 text-center sm:text-left">
              <div class="flex flex-wrap items-center justify-center sm:justify-start gap-3">
                <button
                  @click="triggerSelectAvatar"
                  :disabled="isUploadingAvatar"
                  type="button"
                  class="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono-archive bg-[var(--ink-primary)] text-[var(--bg-archive)] hover:opacity-90 disabled:opacity-50 rounded-xs cursor-pointer transition-opacity"
                >
                  <Camera class="w-3.5 h-3.5" />
                  <span>选择本地照片上传</span>
                </button>
                <span class="text-[11px] font-mono-archive text-[var(--ink-muted)]">
                  支持 JPG / PNG / WebP（最大 20MB）
                </span>
              </div>

              <p class="text-xs font-serif-editorial text-[var(--ink-secondary)] leading-relaxed">
                直接选择你的真实照片或拖入画框。系统将自动上传至后端并获得相对路径，保存后将永久缓存至本地，无需记住或填写任何图床外链。
              </p>

              <div v-if="avatarUploadError" class="text-xs font-mono-archive text-amber-600">
                {{ avatarUploadError }}
              </div>
            </div>
          </div>
        </div>

        <!-- 印信与身份 (称谓 + 城市坐标) -->
        <div class="space-y-3">
          <div class="text-[11px] font-mono-archive text-[var(--ink-muted)] uppercase tracking-wider">
            02 印信与称谓
          </div>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div class="space-y-1">
              <label class="block text-xs font-mono-archive text-[var(--ink-muted)]">主理人称谓 *</label>
              <input
                v-model="form.name"
                type="text"
                placeholder="例如: 散页主理人"
                class="w-full px-3 py-2 text-sm font-serif-editorial bg-transparent border border-[var(--border-subtle)] focus:border-[var(--ink-primary)] rounded-xs outline-none"
              />
            </div>

            <div class="space-y-1">
              <label class="block text-xs font-mono-archive text-[var(--ink-muted)]">常居城市 / 身处坐标 *</label>
              <input
                v-model="form.location"
                type="text"
                placeholder="例如: 中国 · 杭州 / 旅居中"
                class="w-full px-3 py-2 text-sm font-serif-editorial bg-transparent border border-[var(--border-subtle)] focus:border-[var(--ink-primary)] rounded-xs outline-none"
              />
            </div>
          </div>
        </div>

        <!-- 手艺定位与生活信条 -->
        <div class="space-y-3">
          <div class="text-[11px] font-mono-archive text-[var(--ink-muted)] uppercase tracking-wider">
            03 手艺定位与生活信条
          </div>

          <div class="space-y-1">
            <label class="block text-xs font-mono-archive text-[var(--ink-muted)]">角色签名与手艺标签</label>
            <input
              v-model="form.title"
              type="text"
              placeholder="例如: 独立创作者 · 摄影与阅读爱好者 · 城市漫游者"
              class="w-full px-3 py-2 text-sm font-serif-editorial bg-transparent border border-[var(--border-subtle)] focus:border-[var(--ink-primary)] rounded-xs outline-none"
            />
          </div>

          <div class="space-y-1">
            <label class="block text-xs font-mono-archive text-[var(--ink-muted)]">主理人生活信条</label>
            <input
              v-model="form.motto"
              type="text"
              placeholder="例如: 生活大于项目，真实大于表演。"
              class="w-full px-3 py-2 text-sm font-serif-editorial bg-transparent border border-[var(--border-subtle)] focus:border-[var(--ink-primary)] rounded-xs outline-none"
            />
          </div>

          <div class="space-y-1">
            <label class="block text-xs font-mono-archive text-[var(--ink-muted)]">主理人自白手记</label>
            <textarea
              v-model="form.bio"
              rows="5"
              placeholder="写下一段关于你、关于生活哲学的真诚自白..."
              class="w-full px-3 py-2 text-sm font-serif-editorial leading-relaxed bg-transparent border border-[var(--border-subtle)] focus:border-[var(--ink-primary)] rounded-xs outline-none resize-y"
            ></textarea>
          </div>
        </div>

        <!-- 外部公开联络通道 -->
        <div class="space-y-3">
          <div class="text-[11px] font-mono-archive text-[var(--ink-muted)] uppercase tracking-wider">
            04 外部公开联络通道
          </div>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div class="space-y-1">
              <label class="block text-xs font-mono-archive text-[var(--ink-muted)]">公开联络邮箱</label>
              <input
                v-model="form.email"
                type="text"
                placeholder="例如: curator@looseleaf.me"
                class="w-full px-3 py-2 text-xs font-mono-archive bg-transparent border border-[var(--border-subtle)] focus:border-[var(--ink-primary)] rounded-xs outline-none"
              />
            </div>

            <div class="space-y-1">
              <label class="block text-xs font-mono-archive text-[var(--ink-muted)]">GitHub 主页链接</label>
              <input
                v-model="form.github"
                type="text"
                placeholder="例如: https://github.com/your-username"
                class="w-full px-3 py-2 text-xs font-mono-archive bg-transparent border border-[var(--border-subtle)] focus:border-[var(--ink-primary)] rounded-xs outline-none"
              />
            </div>
          </div>
        </div>

      </div>

      <!-- 2. 设备清单表单 -->
      <div v-else-if="activeTab === 'gear'" class="space-y-6">
        <!-- 顶部操作栏 -->
        <div class="flex items-center justify-between">
          <span class="text-xs font-mono-archive text-[var(--ink-muted)]">
            已收录 {{ (form.edc_gear || []).length }} 项设备器物
          </span>

          <button
            @click="showAddGear = !showAddGear"
            type="button"
            class="inline-flex items-center gap-1.5 px-3 py-1 text-xs font-mono-archive border border-[var(--border-subtle)] hover:border-[var(--ink-primary)] rounded-xs cursor-pointer transition-colors"
          >
            <Plus class="w-3.5 h-3.5" />
            <span>{{ showAddGear ? '取消添加' : '＋ 添加新设备' }}</span>
          </button>
        </div>

        <!-- 展开的添加设备小抽屉 -->
        <div
          v-if="showAddGear"
          class="p-4 rounded-xs border border-[var(--border-subtle)] bg-[var(--bg-subtle)]/40 space-y-3"
        >
          <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label class="block text-[11px] font-mono-archive text-[var(--ink-muted)] mb-1">类目</label>
              <select
                v-model="newGearCategory"
                class="w-full px-2.5 py-1.5 text-xs font-mono-archive bg-[var(--bg-archive)] border border-[var(--border-subtle)] rounded-xs outline-none"
              >
                <option v-for="cat in categories" :key="cat" :value="cat">{{ cat }}</option>
              </select>
            </div>

            <div>
              <label class="block text-[11px] font-mono-archive text-[var(--ink-muted)] mb-1">设备名称 *</label>
              <input
                v-model="newGearName"
                type="text"
                placeholder="例如: 随身相机 / 笔记本电脑"
                class="w-full px-2.5 py-1.5 text-xs font-mono-archive bg-[var(--bg-archive)] border border-[var(--border-subtle)] rounded-xs outline-none"
              />
            </div>

            <div>
              <label class="block text-[11px] font-mono-archive text-[var(--ink-muted)] mb-1">状态标签</label>
              <input
                v-model="newGearStatus"
                type="text"
                placeholder="例如: 随身主力"
                class="w-full px-2.5 py-1.5 text-xs font-mono-archive bg-[var(--bg-archive)] border border-[var(--border-subtle)] rounded-xs outline-none"
              />
            </div>
          </div>

          <div>
            <label class="block text-[11px] font-mono-archive text-[var(--ink-muted)] mb-1">具体规格 / 型号说明</label>
            <input
              v-model="newGearSpec"
              type="text"
              placeholder="例如: 38mm f/2.8 Carl Zeiss T*"
              class="w-full px-2.5 py-1.5 text-xs font-mono-archive bg-[var(--bg-archive)] border border-[var(--border-subtle)] rounded-xs outline-none"
            />
          </div>

          <div>
            <label class="block text-[11px] font-mono-archive text-[var(--ink-muted)] mb-1">使用感受 / 体验笔记</label>
            <input
              v-model="newGearNote"
              type="text"
              placeholder="例如: 快门清脆，成色完好"
              class="w-full px-2.5 py-1.5 text-xs font-mono-archive bg-[var(--bg-archive)] border border-[var(--border-subtle)] rounded-xs outline-none"
            />
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label class="block text-[11px] font-mono-archive text-[var(--ink-muted)] mb-1">购入金额 (¥，选填)</label>
              <input
                v-model="newGearPrice"
                type="number"
                step="0.01"
                placeholder="例如: 3200.00"
                class="w-full px-2.5 py-1.5 text-xs font-mono-archive bg-[var(--bg-archive)] border border-[var(--border-subtle)] rounded-xs outline-none"
              />
            </div>

            <div>
              <label class="block text-[11px] font-mono-archive text-[var(--ink-muted)] mb-1">购置日期</label>
              <input
                v-model="newGearPurchaseDate"
                type="date"
                class="w-full px-2.5 py-1.5 text-xs font-mono-archive bg-[var(--bg-archive)] border border-[var(--border-subtle)] rounded-xs outline-none"
              />
            </div>
          </div>

          <div class="flex items-center gap-2 pt-1">
            <input
              id="syncBuyTx"
              v-model="syncBuyTransaction"
              type="checkbox"
              class="rounded-xs cursor-pointer accent-[var(--ink-primary)]"
            />
            <label for="syncBuyTx" class="text-xs font-mono-archive text-[var(--ink-secondary)] cursor-pointer select-none">
              同步在账本中生成一条支出账单（金额与购入日期对应）
            </label>
          </div>

          <div class="flex justify-end pt-2">
            <button
              @click="handleAddGear"
              type="button"
              class="px-4 py-1.5 text-xs font-mono-archive bg-[var(--ink-primary)] text-[var(--bg-archive)] rounded-xs cursor-pointer hover:opacity-90"
            >
              确认添入列表
            </button>
          </div>
        </div>

        <!-- 设备列表渲染 -->
        <div class="divide-y divide-[var(--border-subtle)]/70 max-h-[46vh] overflow-y-auto pr-1">
          <div
            v-for="(item, idx) in (form.edc_gear || [])"
            :key="item.id || idx"
            class="py-3 flex items-start justify-between gap-4 group"
          >
            <div class="space-y-1">
              <div class="flex flex-wrap items-center gap-2">
                <span class="text-[10px] font-mono-archive px-1.5 py-0.2 rounded-xs border border-[var(--border-subtle)] text-[var(--ink-muted)]">
                  {{ item.category }}
                </span>
                <span class="font-serif-editorial text-base text-[var(--ink-primary)] font-medium">
                  {{ item.name }}
                </span>
                <span v-if="item.status" class="text-[11px] font-mono-archive" :class="item.status === '已出二手' ? 'text-amber-600' : 'text-[var(--accent-warm)]'">
                  · {{ item.status }}
                </span>
                <span v-if="item.price_cents" class="text-[10px] font-mono-archive text-[var(--ink-muted)]">
                  (购入 ¥{{ (item.price_cents / 100).toFixed(2) }})
                </span>
                <span v-if="item.sold_price" class="text-[10px] font-mono-archive text-emerald-700">
                  (回血 ¥{{ (item.sold_price / 100).toFixed(2) }})
                </span>
              </div>
              <p v-if="item.spec" class="text-xs font-mono-archive text-[var(--ink-muted)]">
                {{ item.spec }}
              </p>
              <p v-if="item.note" class="text-xs font-serif-editorial text-[var(--ink-secondary)] italic">
                “{{ item.note }}”
              </p>
            </div>

            <div class="flex items-center gap-2 shrink-0">
              <button
                v-if="item.status !== '已出二手'"
                @click="handleSellGear(idx)"
                type="button"
                class="text-[11px] font-mono-archive px-2 py-0.5 border border-[var(--border-subtle)] hover:border-[var(--ink-primary)] rounded-xs text-[var(--ink-secondary)] hover:text-[var(--ink-primary)] cursor-pointer transition-colors"
                title="标记为已出二手并自动生成回血账单"
              >
                出二手回血
              </button>

              <button
                @click="removeGear(idx)"
                class="text-[var(--ink-muted)] hover:text-red-700 p-1 cursor-pointer opacity-70 group-hover:opacity-100 transition-opacity"
                title="删除此项"
              >
                <Trash2 class="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- 底部控制栏 -->
      <div class="pt-4 border-t border-[var(--border-subtle)] flex items-center justify-between">
        <button
          @click="handleResetDefault"
          type="button"
          class="inline-flex items-center gap-1 text-xs font-mono-archive text-[var(--ink-muted)] hover:text-[var(--ink-primary)] cursor-pointer"
        >
          <RotateCcw class="w-3.5 h-3.5" />
          <span>恢复预置数据</span>
        </button>

        <div class="flex items-center gap-3">
          <button
            @click="emit('close')"
            type="button"
            class="px-4 py-2 text-xs font-mono-archive text-[var(--ink-muted)] hover:text-[var(--ink-primary)] cursor-pointer"
          >
            取消
          </button>
          <button
            @click="handleSave"
            :disabled="isSaving || isUploadingAvatar"
            type="button"
            class="px-5 py-2 text-xs font-mono-archive bg-[var(--ink-primary)] text-[var(--bg-archive)] hover:opacity-90 disabled:opacity-50 rounded-xs transition-opacity cursor-pointer flex items-center gap-1.5"
          >
            <Loader2 v-if="isSaving" class="w-3.5 h-3.5 animate-spin" />
            <Check v-else class="w-3.5 h-3.5" />
            <span>{{ isSaving ? '保存与同步中...' : '保存资料' }}</span>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
