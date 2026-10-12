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

/** 将任意时刻转换为「北京墙上时间」的伪 UTC Date（此后一律用 getUTC* 读取） */
export function toBeijingDate(d: Date): Date {
  return new Date(d.getTime() + (d.getTimezoneOffset() + BEIJING_OFFSET_MINUTES) * 60000)
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

/** 北京时间年份 */
export function getBeijingYear(): number {
  return getBeijingNow().getUTCFullYear()
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
