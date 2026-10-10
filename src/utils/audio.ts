const SOUND_PREF_KEY = 'looseleaf_sound_enabled'

class AudioEngine {
  private ctx: AudioContext | null = null
  public soundEnabled: boolean = true

  constructor() {
    try {
      const saved = localStorage.getItem(SOUND_PREF_KEY)
      if (saved !== null) {
        this.soundEnabled = saved === 'true'
      }
    } catch {}

    // 移动端 Safari 初次点击解锁 AudioContext
    if (typeof window !== 'undefined') {
      const unlockAudio = () => {
        if (this.ctx && this.ctx.state === 'suspended') {
          this.ctx.resume().catch(() => {})
        }
        window.removeEventListener('pointerdown', unlockAudio)
        window.removeEventListener('keydown', unlockAudio)
      }
      window.addEventListener('pointerdown', unlockAudio, { passive: true })
      window.addEventListener('keydown', unlockAudio, { passive: true })
    }
  }

  public setSoundEnabled(val: boolean) {
    this.soundEnabled = val
    try {
      localStorage.setItem(SOUND_PREF_KEY, String(val))
    } catch {}
  }

  public toggleSound(): boolean {
    const next = !this.soundEnabled
    this.setSoundEnabled(next)
    return next
  }

  private initContext() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      if (AudioCtx) {
        this.ctx = new AudioCtx()
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume()
    }
  }

  // 机械相机快门声 (Mechanical Shutter Click)
  public playShutter() {
    if (!this.soundEnabled) return
    try {
      this.initContext()
      if (!this.ctx) return

      const now = this.ctx.currentTime

      // 第一次快门释放咔哒声
      this.createClick(now, 1200, 0.015, 0.15)
      // 第二次帘幕闭合咔哒声
      this.createClick(now + 0.035, 800, 0.018, 0.12)
    } catch {
      // 浏览器安全策略容错
    }
  }

  // 纸张翻转 / 卡片轻微扑通声 (Paper Flip)
  public playPaperFlip() {
    if (!this.soundEnabled) return
    try {
      this.initContext()
      if (!this.ctx) return

      const now = this.ctx.currentTime
      const osc = this.ctx.createOscillator()
      const gain = this.ctx.createGain()
      const filter = this.ctx.createBiquadFilter()

      osc.type = 'sine'
      osc.frequency.setValueAtTime(140, now)
      osc.frequency.exponentialRampToValueAtTime(45, now + 0.06)

      filter.type = 'lowpass'
      filter.frequency.setValueAtTime(300, now)

      gain.gain.setValueAtTime(0.08, now)
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.06)

      osc.connect(filter)
      filter.connect(gain)
      gain.connect(this.ctx.destination)

      osc.start(now)
      osc.stop(now + 0.07)
    } catch {
      // 忽略音频异常
    }
  }

  // 轻微金属敲击 / 按钮微触感 (Tink)
  public playTink() {
    if (!this.soundEnabled) return
    try {
      this.initContext()
      if (!this.ctx) return

      const now = this.ctx.currentTime
      const osc = this.ctx.createOscillator()
      const gain = this.ctx.createGain()

      osc.type = 'triangle'
      osc.frequency.setValueAtTime(2400, now)
      osc.frequency.exponentialRampToValueAtTime(1200, now + 0.03)

      gain.gain.setValueAtTime(0.04, now)
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.03)

      osc.connect(gain)
      gain.connect(this.ctx.destination)

      osc.start(now)
      osc.stop(now + 0.04)
    } catch {
      // 忽略
    }
  }

  private createClick(time: number, freq: number, duration: number, volume: number) {
    if (!this.ctx) return
    const osc = this.ctx.createOscillator()
    const gain = this.ctx.createGain()
    const filter = this.ctx.createBiquadFilter()

    osc.type = 'sine'
    osc.frequency.setValueAtTime(freq, time)
    osc.frequency.exponentialRampToValueAtTime(freq * 0.3, time + duration)

    filter.type = 'bandpass'
    filter.frequency.setValueAtTime(freq, time)
    filter.Q.setValueAtTime(3, time)

    gain.gain.setValueAtTime(volume, time)
    gain.gain.exponentialRampToValueAtTime(0.001, time + duration)

    osc.connect(filter)
    filter.connect(gain)
    gain.connect(this.ctx.destination)

    osc.start(time)
    osc.stop(time + duration)
  }
}

export const audio = new AudioEngine()
