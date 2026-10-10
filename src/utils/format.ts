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
