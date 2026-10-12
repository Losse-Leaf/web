import type { LifeEntry, Transaction, Project, CuratorProfile } from '../types'
import { loadCuratorProfile } from '../utils/profile'
import { parseOccurredDate, getBeijingDateString } from '../utils/format'

export function useExport() {
  const triggerDownload = (filename: string, content: string, mime: string) => {
    const blob = new Blob([content], { type: mime })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  // 1. 导出完整 JSON 归档备份
  const exportJSON = (data: {
    entries: LifeEntry[]
    transactions: Transaction[]
    projects: Project[]
    profile?: CuratorProfile
  }) => {
    const backup = {
      version: '1.1.0',
      exported_at: new Date().toISOString(),
      generator: '散页 · 生活档案与时光手账',
      profile: data.profile || loadCuratorProfile(),
      stats: {
        total_entries: data.entries.length,
        total_transactions: data.transactions.length,
        total_projects: data.projects.length,
      },
      data: {
        entries: data.entries,
        transactions: data.transactions,
        projects: data.projects,
      },
    }
    const jsonStr = JSON.stringify(backup, null, 2)
    const today = getBeijingDateString().replace(/-/g, '')
    triggerDownload(`loose-leaf-backup-${today}.json`, jsonStr, 'application/json;charset=utf-8')
  }

  // 2. 导出生活档案为 Markdown 出版文稿
  const exportMarkdown = (entries: LifeEntry[]) => {
    const lines: string[] = []
    lines.push('# 《散页》· 生活档案完整导出')
    lines.push(`> 导出时间：${new Date().toLocaleString('zh-CN')}  `)
    lines.push(`> 总在册条目：${entries.length} 篇\n`)
    lines.push('---\n')

    entries.forEach((e) => {
      const { dotDate, time } = parseOccurredDate(e.occurred_at)
      const dateStr = dotDate
      const timeStr = time
      const typeStr = e.type || 'life'
      const title = e.title || '无题'

      lines.push(`## [${typeStr.toUpperCase()}] ${title}`)
      lines.push(`*印记时间：${dateStr} ${timeStr}*`)
      if (e.location) lines.push(`*地点：${e.location}*`)
      lines.push('')
      lines.push(e.content)
      lines.push('')

      if (e.attachments && e.attachments.length > 0) {
        lines.push('### 附件相片：')
        e.attachments.forEach((att) => {
          lines.push(`![${att.original_filename}](${att.url})`)
        })
        lines.push('')
      }

      lines.push('---\n')
    })

    const mdStr = lines.join('\n')
    const today = getBeijingDateString().replace(/-/g, '')
    triggerDownload(`loose-leaf-entries-${today}.md`, mdStr, 'text/markdown;charset=utf-8')
  }

  // 3. 导出记账流水为 CSV (带 UTF-8 BOM 避免 Excel 中文乱码)
  const exportTransactionsCSV = (transactions: Transaction[]) => {
    const headers = ['ID', '日期时间', '收支类型', '分类', '金额(元)', '事项说明', '备注', '支付渠道']
    const rows: string[][] = [headers]

    transactions.forEach((tx) => {
      const typeLabel = tx.type === 'income' ? '收入' : '支出'
      const amountYuan = (tx.amount / 100).toFixed(2)
      const parsed = parseOccurredDate(tx.occurred_at)
      const dateStr = tx.occurred_at ? `${parsed.dotDate} ${parsed.time}` : ''
      rows.push([
        String(tx.id),
        `"${dateStr}"`,
        `"${typeLabel}"`,
        `"${tx.category || ''}"`,
        amountYuan,
        `"${(tx.title || '').replace(/"/g, '""')}"`,
        `"${(tx.note || '').replace(/"/g, '""')}"`,
        `"${tx.payment_method || ''}"`,
      ])
    })

    const csvContent = '\uFEFF' + rows.map((r) => r.join(',')).join('\n')
    const today = getBeijingDateString().replace(/-/g, '')
    triggerDownload(`loose-leaf-transactions-${today}.csv`, csvContent, 'text/csv;charset=utf-8')
  }

  return {
    exportJSON,
    exportMarkdown,
    exportTransactionsCSV,
  }
}
