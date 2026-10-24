// 统一格式化工具：复用模块级 Intl.NumberFormat，消除每次调用重建开销 (FE-04, RC-27)
const moneyFormatter = new Intl.NumberFormat('zh-CN', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

/**
 * 格式化以“分”为单位的金额为两位小数标准货币展示串 (如 1250 -> 12.50)
 */
export function formatMoney(cents: number): string {
  return moneyFormatter.format((cents || 0) / 100)
}

// ==========================================
// 时区契约 (RC-134)：全站时间基准为中国北京时间 UTC+8
// 后端返回带 +08:00 偏移的 ISO 串；无论浏览器处于何地，展示一律按北京时间还原，
// 避免「服务器 UTC 部署 → 显示整体偏移 8 小时」的漂移。
// ==========================================
const BEIJING_OFFSET_MINUTES = 8 * 60

/**
 * 将任意时刻转换为「北京墙上时间」的伪 UTC Date（此后一律用 getUTC* 读取）。
 *
 * 只加固定 +8 小时，**不能**再叠加 `getTimezoneOffset()`：
 * 后者是「本地时间相对 UTC 的分钟差」（UTC+8 为 -480），再 +480 等于抵消，
 * 结果 Date 仍是原瞬间，`getUTC*` 读出来是 UTC 而不是北京时间（整体早 8 小时）。
 */
export function toBeijingDate(d: Date): Date {
  return new Date(d.getTime() + BEIJING_OFFSET_MINUTES * 60000)
}

/** 当前的北京时间（伪 UTC Date，请配合 getUTC* 读取） */
export function getBeijingNow(): Date {
  return toBeijingDate(new Date())
}

/** 北京时间日期串 YYYY-MM-DD */
export function getBeijingDateString(): string {
  return getBeijingDateTimeString().slice(0, 10)
}

/** 北京时间日期时刻串 YYYY-MM-DDTHH:mm（后端 FlexTime 的无时区标准格式） */
export function getBeijingDateTimeString(): string {
  const d = getBeijingNow()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`
}

/**
 * 生成带 +08:00 偏移的标准北京时间 ISO8601 字符串 (YYYY-MM-DDTHH:mm:ss+08:00)
 * 对齐 macOS 与 Android 原生端契约，消除无时区歧义与 UTC 零点漂移
 */
export function getBeijingISOString(dateStrOrDate?: string | Date): string {
  if (!dateStrOrDate) {
    return `${getBeijingDateTimeString()}:00+08:00`
  }
  if (typeof dateStrOrDate === 'string') {
    const clean = dateStrOrDate.trim()
    if (!clean) return `${getBeijingDateTimeString()}:00+08:00`
    if (clean.includes('+08:00')) return clean
    if (clean.endsWith('Z')) {
      const d = new Date(clean)
      return getBeijingISOString(d)
    }
    if (clean.length === 10) return `${clean}T12:00:00+08:00`
    if (clean.length === 16) return `${clean}:00+08:00`
    if (clean.length === 19) return `${clean}+08:00`
    return clean
  }
  const d = toBeijingDate(dateStrOrDate)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}+08:00`
}

/** 北京时间年份 */
export function getBeijingYear(): number {
  return getBeijingNow().getUTCFullYear()
}

export interface BeijingCalendar {
  year: number
  month: number // 1~12
  day: number // 1~31
  hour: number // 0~23
  minute: number // 0~59
  second: number // 0~59
  dayOfWeek: number // 0=周日 … 6=周六
}

/**
 * 北京墙上时间的日历字段（锚定 +08:00，不依赖浏览器本地时区）
 *
 * 供「今天的日期 / 本月 / 星期几」这类日历判断统一取值 (RC-134)：
 * 组件里原先散落的 `new Date().getFullYear()/getMonth()/getDate()/getDay()`
 * 在非北京时区的浏览器上会取到错误的「今天」。
 */
export function getBeijingCalendar(d: Date = new Date()): BeijingCalendar {
  const bj = toBeijingDate(d)
  return {
    year: bj.getUTCFullYear(),
    month: bj.getUTCMonth() + 1,
    day: bj.getUTCDate(),
    hour: bj.getUTCHours(),
    minute: bj.getUTCMinutes(),
    second: bj.getUTCSeconds(),
    dayOfWeek: bj.getUTCDay(),
  }
}

/** 北京时间某年某月（1~12）的天数（公历日历运算，与时区无关） */
export function getBeijingDaysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

/** 北京时间某日某时的绝对 epoch 毫秒（例：beijingDateToUtcMs(2026, 10, 1) = 北京 10 月 1 日 00:00） */
export function beijingDateToUtcMs(
  year: number,
  month: number,
  day: number,
  hour = 0,
  minute = 0
): number {
  return Date.UTC(year, month - 1, day, hour, minute) - BEIJING_OFFSET_MINUTES * 60000
}

/** 北京时间日期串 YYYY.MM.DD（出版风格展示） */
export function getBeijingDotDate(): string {
  return getBeijingDateString().replace(/-/g, '.')
}

export interface ParsedOccurredDate {
  year: string      // e.g. "2026"
  month: string     // e.g. "10"
  day: string       // e.g. "09"
  time: string      // e.g. "14:20"
  dateKey: string   // e.g. "2026-10-09"
  dotDate: string   // e.g. "2026.10.09"
  timestamp: number // e.g. epoch ms
}

/**
 * 统一解析 occurred_at 时间戳并返回全场景格式化结构 (RC-48)
 * 消除散落在组件中的重复 new Date 与补零逻辑，统一从权威字段 occurred_at 派生
 * 时区：统一按北京时间展示 (RC-134)
 */
export function parseOccurredDate(occurredAt?: string): ParsedOccurredDate {
  let d: Date
  if (occurredAt) {
    d = new Date(occurredAt)
    if (isNaN(d.getTime())) {
      d = new Date(occurredAt.replace(/\./g, '-'))
    }
  } else {
    d = new Date()
  }

  if (isNaN(d.getTime())) {
    d = new Date()
  }

  const pad = (n: number) => String(n).padStart(2, '0')
  const bj = toBeijingDate(d)
  const year = String(bj.getUTCFullYear())
  const month = pad(bj.getUTCMonth() + 1)
  const day = pad(bj.getUTCDate())
  const time = `${pad(bj.getUTCHours())}:${pad(bj.getUTCMinutes())}`
  const dateKey = `${year}-${month}-${day}`
  const dotDate = `${year}.${month}.${day}`

  return {
    year,
    month,
    day,
    time,
    dateKey,
    dotDate,
    timestamp: d.getTime(),
  }
}

function escapeHtml(raw: string): string {
  return raw
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function formatEditorialInline(raw: string): string {
  const escaped = escapeHtml(raw)
  return escaped
    .replace(
      /`([^`]+)`/g,
      '<code class="px-1.5 py-0.5 mx-0.5 text-[0.88em] font-mono-archive bg-[var(--bg-subtle)] border border-[var(--border-subtle)] rounded-xs text-[var(--ink-primary)]">$1</code>'
    )
    .replace(
      /\*\*([^*]+)\*\*/g,
      '<strong class="font-semibold text-[var(--ink-primary)]">$1</strong>'
    )
}

/**
 * 轻量出版级排版渲染 (支持 > 引言、- [ ] / - [x] 清单、行内 `code` 与 **加粗**，严格转义防 XSS)
 */
export function renderEditorialContent(content?: string): string {
  if (!content) return ''
  const lines = content.split(/\r?\n/)
  return lines
    .map((line) => {
      if (/^>\s?/.test(line)) {
        const inner = formatEditorialInline(line.replace(/^>\s?/, ''))
        return `<blockquote class="my-2 pl-4 pr-3 py-1.5 border-l-2 border-[var(--accent-warm)] bg-[var(--bg-subtle)]/45 rounded-r-xs italic text-[var(--ink-primary)]/90 font-serif-editorial relative"><span class="text-[var(--accent-warm)]/50 font-serif-editorial mr-1 select-none">“</span>${inner}</blockquote>`
      }
      if (/^[-*]\s+\[\s\]\s+/.test(line)) {
        const inner = formatEditorialInline(line.replace(/^[-*]\s+\[\s\]\s+/, ''))
        return `<div class="my-1.5 flex items-baseline gap-2.5"><span class="inline-flex items-center justify-center w-3.5 h-3.5 rounded-xs border border-[var(--ink-muted)]/80 bg-[var(--bg-archive)] text-[11px] font-mono-archive leading-none select-none shrink-0 text-transparent">&#9744;</span><span class="text-[var(--ink-primary)]">${inner}</span></div>`
      }
      if (/^[-*]\s+\[[xX]\]\s+/.test(line)) {
        const inner = formatEditorialInline(line.replace(/^[-*]\s+\[[xX]\]\s+/, ''))
        return `<div class="my-1.5 flex items-baseline gap-2.5 text-[var(--ink-muted)]"><span class="inline-flex items-center justify-center w-3.5 h-3.5 rounded-xs border border-[var(--accent-warm)] bg-[var(--accent-warm)]/15 text-[var(--accent-warm)] text-[11px] font-mono-archive leading-none select-none shrink-0">&#10003;</span><span class="line-through decoration-[var(--accent-warm)]/45">${inner}</span></div>`
      }
      if (!line.trim()) {
        return '<div class="h-3"></div>'
      }
      return `<div>${formatEditorialInline(line)}</div>`
    })
    .join('')
}
