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
  const year = String(d.getFullYear())
  const month = pad(d.getMonth() + 1)
  const day = pad(d.getDate())
  const time = `${pad(d.getHours())}:${pad(d.getMinutes())}`
  const dateKey = `${year}-${month}-${day}`
  const dotDate = `${year}.${month}.${day}`
  const timestamp = d.getTime()

  return {
    year,
    month,
    day,
    time,
    dateKey,
    dotDate,
    timestamp,
  }
}
