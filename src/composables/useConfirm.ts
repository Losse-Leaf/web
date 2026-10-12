import { ref } from 'vue'

/**
 * 全站统一的确认 / 提示弹窗中枢 (FE-21)
 * 替代散落各处的原生 confirm() / alert()：原生弹窗阻塞 JS 线程、
 * 与纸墨风自定义模态割裂、移动端体验差。此处为 Promise 化的单一入口。
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

const confirmRequest = ref<ConfirmRequest | null>(null)
let resolver: ((value: boolean) => void) | null = null

const respond = (value: boolean) => {
  const done = resolver
  resolver = null
  confirmRequest.value = null
  done?.(value)
}

export function useConfirm() {
  return { confirmRequest, askConfirm, showAlert, respond }
}

/** 询问确认，返回用户是否确认 */
export function askConfirm(options: ConfirmOptions | string): Promise<boolean> {
  const opts: ConfirmOptions = typeof options === 'string' ? { message: options } : options
  confirmRequest.value = {
    mode: 'confirm',
    title: '请确认',
    confirmText: '确认',
    cancelText: '取消',
    ...opts,
  }
  return new Promise<boolean>((resolve) => {
    resolver = resolve
  })
}

/** 单按钮提示（替代原生 alert） */
export function showAlert(options: ConfirmOptions | string): Promise<void> {
  const opts: ConfirmOptions = typeof options === 'string' ? { message: options } : options
  confirmRequest.value = {
    mode: 'alert',
    title: '提示',
    confirmText: '知道了',
    ...opts,
  }
  return new Promise<void>((resolve) => {
    resolver = () => resolve()
  })
}