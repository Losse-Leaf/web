import { ref } from 'vue'

/**
 * 全站统一的确认 / 提示弹窗中枢 (FE-21)
 * 替代散落各处的原生 confirm() / alert()：原生弹窗阻塞 JS 线程、
 * 与纸墨风自定义模态割裂、移动端体验差。此处为 Promise 化的单一入口。
 *
 * FIFO 队列：确认框是全局单例 UI，但调用方是各处并发逻辑 ——
 * 原先第二个 askConfirm 会直接覆盖 confirmRequest 并丢弃前一个 resolver，
 * 前一个 Promise 永远 pending（悬挂）。现在后来的请求排队，
 * 依次弹窗、依次 resolve。
 */

export interface ConfirmOptions {
  title?: string
  message: string
  confirmText?: string
  cancelText?: string
  danger?: boolean
}

interface ConfirmRequest extends ConfirmOptions {
  mode: 'confirm' | 'alert'
}

interface QueuedRequest {
  request: ConfirmRequest
  resolve: (value: boolean) => void
}

const confirmRequest = ref<ConfirmRequest | null>(null)
const requestQueue: QueuedRequest[] = []
let active: QueuedRequest | null = null

/** 取出队首请求上屏（若无正在展示的请求） */
function pumpQueue(): void {
  if (active || requestQueue.length === 0) return
  active = requestQueue.shift()!
  confirmRequest.value = active.request
}

function enqueue(request: ConfirmRequest, resolve: (value: boolean) => void): void {
  requestQueue.push({ request, resolve })
  pumpQueue()
}

const respond = (value: boolean) => {
  const done = active
  active = null
  confirmRequest.value = null
  done?.resolve(value)
  pumpQueue()
}

export function useConfirm() {
  return { confirmRequest, askConfirm, showAlert, respond }
}

/** 询问确认，返回用户是否确认 */
export function askConfirm(options: ConfirmOptions | string): Promise<boolean> {
  const opts: ConfirmOptions = typeof options === 'string' ? { message: options } : options
  return new Promise<boolean>((resolve) => {
    enqueue(
      {
        mode: 'confirm',
        title: '请确认',
        confirmText: '确认',
        cancelText: '取消',
        ...opts,
      },
      resolve
    )
  })
}

/** 单按钮提示（替代原生 alert） */
export function showAlert(options: ConfirmOptions | string): Promise<void> {
  const opts: ConfirmOptions = typeof options === 'string' ? { message: options } : options
  return new Promise<void>((resolve) => {
    enqueue(
      {
        mode: 'alert',
        title: '提示',
        confirmText: '知道了',
        ...opts,
      },
      () => resolve()
    )
  })
}
