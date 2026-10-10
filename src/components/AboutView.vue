<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import {
  ArrowUpRight,
  Edit3,
  MapPin,
  Mail,
  Github,
  Maximize2,
  Camera,
  Compass,
  Coffee,
  Laptop,
  User,
} from 'lucide-vue-next'
import type { UserProfile, CuratorProfile } from '../types'
import { loadCuratorProfile } from '../utils/profile'
import ProfileEditModal from './ProfileEditModal.vue'
import EditorialLightbox from './EditorialLightbox.vue'

const props = defineProps<{
  profile?: CuratorProfile | null
}>()

const emit = defineEmits<{
  (e: 'profileUpdated', profile: UserProfile): void
}>()

// 内部编辑用的完整 UserProfile（合并 prop 与本地）
const localProfile = ref<UserProfile>(loadCuratorProfile())
const isEditOpen = ref(false)
const isLightboxOpen = ref(false)
const selectedCategory = ref<string>('all')

// 当父组件传入的 profile prop 变化时，合并到 localProfile
watch(
  () => props.profile,
  (newP) => {
    if (newP) {
      localProfile.value = {
        ...localProfile.value,
        name: newP.name || localProfile.value.name,
        title: newP.title || localProfile.value.title,
        bio: newP.bio || localProfile.value.bio,
        location: newP.location || localProfile.value.location,
        avatar: newP.avatar || newP.avatar_url || localProfile.value.avatar,
        avatar_key: newP.avatar_key || localProfile.value.avatar_key,
        philosophy: newP.philosophy || newP.motto || localProfile.value.philosophy,
        email: newP.email || localProfile.value.email,
        github: newP.github || newP.social_links?.github || localProfile.value.github,
        current_city: newP.current_city || localProfile.value.current_city,
        motto: newP.motto || localProfile.value.motto,
        gearList: newP.gearList || newP.edc_gear || localProfile.value.gearList,
      }
    }
  },
  { immediate: true }
)

const categories = computed(() => {
  const set = new Set<string>()
  localProfile.value.gearList.forEach((g) => {
    if (g.category) set.add(g.category)
  })
  return Array.from(set)
})

const filteredGear = computed(() => {
  if (selectedCategory.value === 'all') return localProfile.value.gearList
  return localProfile.value.gearList.filter((g) => g.category === selectedCategory.value)
})

const handleProfileUpdated = (updated: UserProfile) => {
  localProfile.value = updated
  emit('profileUpdated', updated)
}

// GitHub 用户名提取
const githubUsername = computed(() => {
  const url = localProfile.value.github || ''
  const match = url.match(/github\.com\/([^/]+)/)
  return match ? match[1] : 'GitHub'
})

// 城市提取
const cityDisplay = computed(() => {
  return (
    localProfile.value.current_city ||
    localProfile.value.location.split('·')[1]?.trim() ||
    '杭州'
  )
})

// 主理人核心信条与手艺四重奏
const craftPrinciples = [
  {
    num: '01',
    icon: Camera,
    title: '真实大于表演',
    en: 'Reality over Performance',
    desc: '记录真切发生过的饭食、底片与疲惫，拒绝为面试官量身定制的无瑕履历。',
  },
  {
    num: '02',
    icon: Compass,
    title: '时间是唯一刻度',
    en: 'Time as the Sole Scale',
    desc: '不以成就排资论辈，散页按日期落印，每一次微小的思索都拥有同等重量。',
  },
  {
    num: '03',
    icon: Coffee,
    title: '器物与手艺的体温',
    en: 'Warmth of Tangible Craft',
    desc: '手摇磨豆机的阻尼、旁轴机械快门的脆响，具体物理世界给予人充沛的安宁。',
  },
  {
    num: '04',
    icon: Laptop,
    title: '代码作为表达工具',
    en: 'Code as Pure Medium',
    desc: '雕琢高并发状态机，搭建本地优先的软件，技术回归服务于自由而具体的个体。',
  },
]

onMounted(() => {
  window.addEventListener('looseleaf-profile-updated', ((e: CustomEvent<UserProfile>) => {
    if (e.detail) localProfile.value = e.detail
  }) as EventListener)
})
</script>

<template>
  <div class="max-w-5xl mx-auto px-4 sm:px-8 py-10 sm:py-20 text-left space-y-16 sm:space-y-24">
    
    <!-- 标头 Hero：出版物级刊首题记与主理人导言 -->
    <header class="space-y-8 border-b border-[var(--border-subtle)] pb-12 sm:pb-16">
      
      <!-- 刊首编目元信息 -->
      <div class="flex flex-wrap items-center justify-between gap-4 text-xs font-mono-archive text-[var(--ink-muted)]">
        <div class="flex items-center gap-2 tracking-widest uppercase">
          <span class="inline-block w-2 h-2 rounded-full bg-[var(--accent-warm)]"></span>
          <span>编目 001 · 主理人档案</span>
        </div>
        
        <div class="flex items-center gap-4">
          <span>坐标：{{ cityDisplay }}</span>
          <span>·</span>
          <button
            @click="isEditOpen = true"
            class="inline-flex items-center gap-1.5 px-3 py-1 text-xs font-mono-archive border border-[var(--border-subtle)] hover:border-[var(--ink-primary)] rounded-xs transition-colors cursor-pointer text-[var(--ink-secondary)] hover:text-[var(--ink-primary)]"
            title="自定义头像、简介与设备清单"
          >
            <Edit3 class="w-3.5 h-3.5" />
            <span>编辑主理人档案与器物</span>
          </button>
        </div>
      </div>

      <!-- 刊名主标题与副标 -->
      <div class="space-y-4">
        <div class="flex flex-col sm:flex-row sm:items-baseline gap-2 sm:gap-6">
          <h1 class="font-serif-editorial text-4xl sm:text-6xl font-normal tracking-tight text-[var(--ink-primary)]">
            {{ localProfile.name }}
          </h1>
          <span class="font-mono-archive text-sm sm:text-base tracking-widest text-[var(--ink-muted)]">
            主理人 · 散页生活档案
          </span>
        </div>

        <p class="font-serif-editorial text-lg sm:text-xl text-[var(--ink-secondary)] max-w-3xl leading-relaxed">
          {{ localProfile.title }}
        </p>
      </div>

      <!-- 大幅金句信条横幅 (Manifesto Banner) -->
      <div class="pt-4">
        <blockquote class="p-6 sm:p-8 rounded-xs bg-[var(--bg-subtle)]/50 border-l-3 border-[var(--accent-warm)] relative overflow-hidden">
          <div class="font-serif-editorial text-xl sm:text-2xl text-[var(--ink-primary)] italic leading-relaxed">
            “{{ localProfile.philosophy || localProfile.motto || '生活大于项目，真实大于表演。' }}”
          </div>
          <div class="mt-3 font-mono-archive text-xs text-[var(--ink-muted)] uppercase tracking-wider flex items-center gap-2">
            <span>— 主理人生活信条</span>
          </div>
        </blockquote>
      </div>

    </header>

    <!-- 核心板块 1：胶片装裱肖像 + 极简身份档案卡片 -->
    <section class="grid grid-cols-1 md:grid-cols-12 gap-8 sm:gap-12 items-start">
      
      <!-- 左栏 (5列)：暗房装裱画框与快速触达 -->
      <div class="md:col-span-5 space-y-6">
        
        <!-- 拟物暗房装裱底片画框 -->
        <div
          class="bg-[var(--bg-subtle)]/70 p-3 sm:p-4 rounded-xs border border-[var(--border-subtle)] shadow-[0_4px_20px_rgba(0,0,0,0.03)] cursor-zoom-in group transition-transform duration-300"
          @click="isLightboxOpen = true"
          title="点击在暗房灯箱中查看肖像"
        >
          <!-- 照片本体 -->
          <div class="relative overflow-hidden rounded-xs bg-[var(--bg-archive)] aspect-square border border-[var(--border-subtle)]/60">
            <img
              v-if="localProfile.avatar"
              :src="localProfile.avatar"
              :alt="localProfile.name"
              class="w-full h-full object-cover group-hover:scale-[1.025] transition-transform duration-700 ease-out"
            />
            <div
              v-else
              class="w-full h-full flex flex-col items-center justify-center bg-[var(--bg-subtle)] text-[var(--ink-muted)] space-y-2 select-none"
            >
              <User class="w-12 h-12 stroke-1" />
              <span class="text-[11px] font-mono-archive tracking-wider">暂未上传肖像</span>
            </div>
            
            <div class="absolute inset-0 bg-black/0 group-hover:bg-black/15 transition-colors duration-300 pointer-events-none" />

            <!-- 悬浮灯箱提示徽标 -->
            <div class="absolute bottom-3 right-3 px-2 py-1 bg-black/75 backdrop-blur-xs text-white text-[10px] font-mono-archive rounded-xs opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1.5 shadow-sm">
              <Maximize2 class="w-3 h-3" />
              <span>暗房灯箱</span>
            </div>
          </div>

          <!-- 胶片装裱边框底款参数 -->
          <div class="pt-3 px-1 flex items-center justify-between text-[11px] font-mono-archive text-[var(--ink-muted)]">
            <span class="tracking-widest">EXP. 01 · 35mm 肖像</span>
            <span class="text-[var(--ink-secondary)]">{{ cityDisplay }} · 档案馆收录</span>
          </div>
        </div>

        <!-- 身份档案索引卡片 (Index Card) -->
        <div class="p-5 rounded-xs border border-[var(--border-subtle)] bg-[var(--bg-subtle)]/30 space-y-4 font-mono-archive text-xs">
          
          <div class="border-b border-[var(--border-subtle)] pb-3">
            <span class="text-[10px] tracking-wider text-[var(--ink-muted)] block">身份档案编目</span>
            <div class="font-serif-editorial text-lg text-[var(--ink-primary)] font-medium pt-0.5">
              {{ localProfile.name }}
            </div>
          </div>

          <div class="space-y-2.5 text-[var(--ink-secondary)]">
            <div class="flex items-center gap-2">
              <MapPin class="w-3.5 h-3.5 text-[var(--accent-warm)] shrink-0" />
              <span>{{ localProfile.location }}</span>
            </div>
            
            <div class="flex items-center gap-2">
              <Mail class="w-3.5 h-3.5 text-[var(--accent-warm)] shrink-0" />
              <a :href="`mailto:${localProfile.email}`" class="hover-underline truncate" :title="localProfile.email">
                {{ localProfile.email }}
              </a>
            </div>

            <div class="flex items-center gap-2">
              <Github class="w-3.5 h-3.5 text-[var(--accent-warm)] shrink-0" />
              <a
                :href="localProfile.github"
                target="_blank"
                rel="noopener noreferrer"
                class="hover-underline inline-flex items-center gap-1 text-[var(--ink-primary)]"
              >
                <span>GitHub @{{ githubUsername }}</span>
                <ArrowUpRight class="w-3 h-3" />
              </a>
            </div>
          </div>

          <div class="pt-2 border-t border-[var(--border-subtle)]/60 text-[11px] text-[var(--ink-muted)] flex justify-between">
            <span>档案状态：常态更新中</span>
            <span>2024–PRESENT</span>
          </div>

        </div>

      </div>

      <!-- 右栏 (7列)：自白书与创刊宣言 -->
      <div class="md:col-span-7 space-y-10">
        
        <!-- 核心自白 -->
        <section class="space-y-4">
          <div class="flex items-center gap-2 font-mono-archive text-xs text-[var(--ink-muted)]">
            <span class="text-[var(--accent-warm)] font-medium">01</span>
            <h3 class="tracking-wider">主理人自白</h3>
          </div>
          
          <p class="font-serif-editorial text-base sm:text-lg text-[var(--ink-primary)] leading-relaxed whitespace-pre-line">
            {{ localProfile.bio }}
          </p>
        </section>

        <!-- 为什么做《散页》 -->
        <section class="space-y-4 pt-6 border-t border-[var(--border-subtle)]">
          <div class="flex items-center gap-2 font-mono-archive text-xs text-[var(--ink-muted)]">
            <span class="text-[var(--accent-warm)] font-medium">02</span>
            <h3 class="tracking-wider">创刊初衷</h3>
          </div>

          <div class="font-serif-editorial text-base sm:text-lg text-[var(--ink-secondary)] leading-relaxed space-y-3.5">
            <p>
              在当下的互联网上，很多人的个人主页变成了千篇一律的职业履历展厅：满屏的技能徽章、KPI 指标、格式化的项目卡片与给招聘者看的说辞。
            </p>
            <p>
              但我渐渐发现，那些真正构成我生命质感的东西——读完一本书时的触动、和朋友在深夜连麦打游戏的畅快、秋天满觉陇落满青石板的金桂底片——在那些标准的简历模板里根本无处安放。
            </p>
            <p class="text-[var(--ink-primary)]">
              所以我决定推翻传统模板，把这里做成一本<strong>散页生活档案</strong>。时间是这里唯一的刻度。无论是一张底片、一段随笔、一个亲手造的轮子，还是一包咖啡豆的萃取数据，它们都是我生命中真真切切发生过的印记。
            </p>
          </div>
        </section>

      </div>

    </section>

    <!-- 核心板块 2：主理人手艺与生活原则 (The Principles of Craft) -->
    <section class="space-y-8 pt-8 border-t border-[var(--border-subtle)]">
      
      <div class="flex flex-col sm:flex-row sm:items-baseline justify-between gap-2">
        <div>
          <span class="font-mono-archive text-xs tracking-wider text-[var(--ink-muted)]">
            生活信条与创作原则
          </span>
          <h2 class="font-serif-editorial text-2xl sm:text-3xl font-normal text-[var(--ink-primary)] mt-1">
            四重刻度：如何在这里度过每一天
          </h2>
        </div>
        <span class="font-mono-archive text-xs text-[var(--ink-muted)]">
          生活与手艺的四重支柱
        </span>
      </div>

      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div
          v-for="p in craftPrinciples"
          :key="p.num"
          class="p-5 rounded-xs border border-[var(--border-subtle)] bg-[var(--bg-subtle)]/30 hover:border-[var(--border-divider)] transition-all space-y-2.5"
        >
          <div class="flex items-center justify-between text-xs font-mono-archive">
            <div class="flex items-center gap-1.5 text-[var(--accent-warm)]">
              <component :is="p.icon" class="w-3.5 h-3.5" />
              <span class="font-medium">{{ p.num }}</span>
            </div>
            <span class="text-[10px] text-[var(--ink-muted)] uppercase tracking-wider">{{ p.en }}</span>
          </div>

          <h3 class="font-serif-editorial text-lg text-[var(--ink-primary)] font-medium">
            {{ p.title }}
          </h3>

          <p class="font-serif-editorial text-xs sm:text-sm text-[var(--ink-secondary)] leading-relaxed">
            {{ p.desc }}
          </p>
        </div>
      </div>

    </section>

    <!-- 核心板块 3：随身与桌面器物生活图鉴 (The Gear, Desk & EDC Catalog) -->
    <section class="space-y-8 pt-8 border-t border-[var(--border-subtle)]">
      
      <div class="flex flex-col sm:flex-row sm:items-baseline justify-between gap-4">
        <div>
          <div class="flex items-center gap-2">
            <span class="font-mono-archive text-xs tracking-wider text-[var(--ink-muted)]">
              随身与桌面器物图鉴
            </span>
            <span class="font-mono-archive text-xs tracking-widest text-[var(--accent-warm)]">
              · 随身与桌面图鉴
            </span>
          </div>
          <h2 class="font-serif-editorial text-2xl sm:text-3xl font-normal text-[var(--ink-primary)] mt-1">
            长久陪伴日常的手艺工具与装备
          </h2>
        </div>

        <div class="font-mono-archive text-xs text-[var(--ink-muted)]">
          已编目收录 <strong class="text-[var(--ink-primary)]">{{ localProfile.gearList.length }}</strong> 件器物
        </div>
      </div>

      <!-- 器物类别切换栏 (胶囊式筛选标签) -->
      <div
        v-if="categories.length > 1"
        class="flex flex-wrap items-center gap-2 text-xs font-mono-archive border-b border-[var(--border-subtle)] pb-4"
      >
        <button
          @click="selectedCategory = 'all'"
          class="px-3 py-1.5 rounded-xs border transition-all cursor-pointer"
          :class="
            selectedCategory === 'all'
              ? 'border-[var(--ink-primary)] bg-[var(--ink-primary)] text-[var(--bg-archive)] font-medium shadow-xs'
              : 'border-[var(--border-subtle)] text-[var(--ink-secondary)] hover:border-[var(--border-divider)] hover:text-[var(--ink-primary)]'
          "
        >
          全部器物 ({{ localProfile.gearList.length }})
        </button>

        <button
          v-for="cat in categories"
          :key="cat"
          @click="selectedCategory = cat"
          class="px-3 py-1.5 rounded-xs border transition-all cursor-pointer"
          :class="
            selectedCategory === cat
              ? 'border-[var(--ink-primary)] bg-[var(--ink-primary)] text-[var(--bg-archive)] font-medium shadow-xs'
              : 'border-[var(--border-subtle)] text-[var(--ink-secondary)] hover:border-[var(--border-divider)] hover:text-[var(--ink-primary)]'
          "
        >
          {{ cat }} ({{ localProfile.gearList.filter(g => g.category === cat).length }})
        </button>
      </div>

      <!-- 纸本器物图鉴卡片网格 (Editorial Index Card Layout) -->
      <div
        v-if="filteredGear.length === 0"
        class="py-16 text-center space-y-2 font-serif-editorial text-[var(--ink-muted)] border border-[var(--border-subtle)] bg-[var(--bg-subtle)]/30 rounded-xs"
      >
        <p class="text-base text-[var(--ink-secondary)]">暂无器物收录</p>
        <p class="font-mono-archive text-xs">点击上方「编辑主理人档案」可登记属于你的随行器材与工坊装备</p>
      </div>
      <div v-else class="grid grid-cols-1 md:grid-cols-2 gap-6">
        <article
          v-for="(gear, idx) in filteredGear"
          :key="gear.id || gear.name"
          class="p-6 rounded-xs border border-[var(--border-subtle)] bg-[var(--bg-subtle)]/40 hover:border-[var(--border-divider)] hover:shadow-[0_4px_20px_rgba(0,0,0,0.03)] transition-all space-y-3.5 relative group"
        >
          <!-- 卡片顶栏：编号 + 类别 + 状态徽标 -->
          <div class="flex items-center justify-between text-[11px] font-mono-archive">
            <div class="flex items-center gap-2">
              <span class="text-[var(--ink-muted)]">NO. {{ String(idx + 1).padStart(2, '0') }}</span>
              <span class="text-[var(--border-divider)]">/</span>
              <span class="text-[var(--ink-secondary)] uppercase tracking-wider font-medium">
                {{ gear.category }}
              </span>
            </div>

            <span
              v-if="gear.status"
              class="border border-[var(--accent-warm)]/30 bg-[var(--accent-warm)]/5 px-2 py-0.5 rounded-xs text-[10px] text-[var(--accent-warm)] font-medium"
            >
              {{ gear.status }}
            </span>
          </div>

          <!-- 设备名称与规格 -->
          <div class="space-y-1">
            <h3 class="font-serif-editorial text-xl font-medium text-[var(--ink-primary)] tracking-tight">
              {{ gear.name }}
            </h3>
            <p v-if="gear.spec" class="font-mono-archive text-xs text-[var(--ink-muted)] leading-relaxed">
              {{ gear.spec }}
            </p>
          </div>

          <!-- 主理人注记 (Field Note) -->
          <div v-if="gear.note" class="pt-2 border-t border-[var(--border-subtle)]/60">
            <p class="font-serif-editorial text-sm text-[var(--ink-secondary)] italic leading-relaxed">
              “{{ gear.note }}”
            </p>
          </div>
        </article>
      </div>

    </section>

    <!-- 核心板块 4：底款与来信通道 (Colophon & Direct Correspondence) -->
    <footer class="pt-12 border-t border-[var(--border-subtle)] space-y-8">
      
      <div class="p-8 rounded-xs border border-[var(--border-subtle)] bg-[var(--bg-subtle)]/30 flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div class="space-y-2">
          <div class="font-mono-archive text-xs tracking-widest text-[var(--accent-warm)]">
            来信通道 · 联络主理人
          </div>
          <h3 class="font-serif-editorial text-2xl font-normal text-[var(--ink-primary)]">
            写一封信给主理人
          </h3>
          <p class="font-serif-editorial text-sm text-[var(--ink-secondary)] max-w-xl">
            若你对手冲萃取、旁轴胶片冲洗、Go 架构或是某个具体的生活瞬间有所共鸣，随时欢迎来信交流。
          </p>
        </div>

        <div class="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 font-mono-archive text-xs shrink-0">
          <a
            :href="`mailto:${localProfile.email}`"
            class="px-5 py-2.5 rounded-xs bg-[var(--ink-primary)] text-[var(--bg-archive)] hover:opacity-90 transition-opacity text-center flex items-center justify-center gap-1.5"
          >
            <Mail class="w-3.5 h-3.5" />
            <span>发送邮件 (MAIL)</span>
          </a>

          <a
            :href="localProfile.github"
            target="_blank"
            rel="noopener noreferrer"
            class="px-4 py-2.5 rounded-xs border border-[var(--border-subtle)] hover:border-[var(--ink-primary)] text-[var(--ink-secondary)] hover:text-[var(--ink-primary)] transition-colors text-center flex items-center justify-center gap-1.5"
          >
            <Github class="w-3.5 h-3.5" />
            <span>GitHub @{{ githubUsername }}</span>
            <ArrowUpRight class="w-3 h-3" />
          </a>
        </div>
      </div>

      <!-- 版权与馆藏签名底款 (Colophon) -->
      <div class="flex flex-col sm:flex-row items-center justify-between gap-4 text-xs font-mono-archive text-[var(--ink-muted)] pt-4">
        <span>《散页》· 时光手账与生活档案 · 杭城西子湖畔</span>
        <span>出版底款 · 严谨编目 · 2024–{{ new Date().getFullYear() }}</span>
      </div>

    </footer>

    <!-- 编辑资料弹窗 (保持双向通信与保存能力) -->
    <ProfileEditModal
      :isOpen="isEditOpen"
      :profile="localProfile"
      @close="isEditOpen = false"
      @updated="handleProfileUpdated"
    />

    <!-- 暗房肖像大图灯箱 -->
    <EditorialLightbox
      :isOpen="isLightboxOpen"
      :imageUrl="localProfile.avatar"
      :title="`${localProfile.name} · 主理人肖像`"
      :meta="'35mm PORTRAIT ARCHIVE'"
      :location="localProfile.location"
      :date="'2026 档案收录'"
      @close="isLightboxOpen = false"
    />

  </div>
</template>
