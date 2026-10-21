/**
 * Audio — a small generative engine.
 *
 * No sample files: everything is synthesised with the Web Audio API so the
 * site ships with zero audio payload and the texture can react continuously
 * to scroll velocity rather than to discrete cues.
 *
 * Layers:
 *   · a low drone (two detuned saws through a lowpass)
 *   · a filtered noise bed = "the market" hiss
 *   · a resonant band that opens as you scroll = "tension"
 *   · a bright bell on each act change
 */

export class Ambience {
  private ctx: AudioContext | null = null
  private master!: GainNode
  private droneGain!: GainNode
  private droneFilter!: BiquadFilterNode
  private noiseGain!: GainNode
  private noiseFilter!: BiquadFilterNode
  private tension!: GainNode
  private started = false
  private muted = true

  async start() {
    if (this.started) {
      if (this.ctx?.state === 'suspended') await this.ctx.resume()
      return
    }
    const Ctor = window.AudioContext || (window as any).webkitAudioContext
    if (!Ctor) return
    const ctx = new Ctor()
    this.ctx = ctx
    this.started = true

    this.master = ctx.createGain()
    this.master.gain.value = 0
    this.master.connect(ctx.destination)

    // ── drone: two detuned saws, slightly detuned from each other ──
    this.droneFilter = ctx.createBiquadFilter()
    this.droneFilter.type = 'lowpass'
    this.droneFilter.frequency.value = 340
    this.droneFilter.Q.value = 3.2
    this.droneFilter.connect(this.master)

    this.droneGain = ctx.createGain()
    this.droneGain.gain.value = 0.1
    this.droneGain.connect(this.droneFilter)

    for (const [freq, detune] of [
      [55, -7],
      [55, 6],
      [82.4, 3],
    ] as const) {
      const osc = ctx.createOscillator()
      osc.type = 'sawtooth'
      osc.frequency.value = freq
      osc.detune.value = detune
      const g = ctx.createGain()
      g.gain.value = 0.34
      osc.connect(g).connect(this.droneGain)
      osc.start()
      // slow drift so it never feels static
      const lfo = ctx.createOscillator()
      lfo.frequency.value = 0.045 + Math.random() * 0.05
      const lfoGain = ctx.createGain()
      lfoGain.gain.value = 4
      lfo.connect(lfoGain).connect(osc.detune)
      lfo.start()
    }

    // ── noise bed: the market hiss ──
    const len = ctx.sampleRate * 4
    const buf = ctx.createBuffer(1, len, ctx.sampleRate)
    const data = buf.getChannelData(0)
    let last = 0
    for (let i = 0; i < len; i++) {
      const white = Math.random() * 2 - 1
      // brown-ish noise: less harsh, more "room"
      last = (last + 0.02 * white) / 1.02
      data[i] = last * 3.2
    }
    const noise = ctx.createBufferSource()
    noise.buffer = buf
    noise.loop = true

    this.noiseFilter = ctx.createBiquadFilter()
    this.noiseFilter.type = 'bandpass'
    this.noiseFilter.frequency.value = 780
    this.noiseFilter.Q.value = 0.85
    this.noiseGain = ctx.createGain()
    this.noiseGain.gain.value = 0.05
    noise.connect(this.noiseFilter).connect(this.noiseGain).connect(this.master)
    noise.start()

    // ── tension bus: a resonant peak that opens with scroll velocity ──
    this.tension = ctx.createGain()
    this.tension.gain.value = 0
    const tensionFilter = ctx.createBiquadFilter()
    tensionFilter.type = 'peaking'
    tensionFilter.frequency.value = 2200
    tensionFilter.Q.value = 6
    this.tension.connect(tensionFilter).connect(this.master)
    const tensionNoise = ctx.createBufferSource()
    tensionNoise.buffer = buf
    tensionNoise.loop = true
    tensionNoise.connect(this.tension)
    tensionNoise.start()

    this.muted = false
    this.master.gain.setTargetAtTime(0.5, ctx.currentTime, 1.4)
  }

  toggle(): boolean {
    if (!this.ctx) return true
    this.muted = !this.muted
    this.master.gain.setTargetAtTime(this.muted ? 0 : 0.5, this.ctx.currentTime, 0.4)
    return this.muted
  }

  get isMuted() {
    return this.muted
  }

  /**
   * @param velocity 0..1 scroll speed
   * @param energy   0..1 act energy
   */
  update(velocity: number, energy: number) {
    if (!this.ctx || this.muted) return
    const now = this.ctx.currentTime
    this.droneFilter.frequency.setTargetAtTime(280 + energy * 420, now, 0.6)
    this.droneGain.gain.setTargetAtTime(0.07 + energy * 0.07, now, 0.6)
    this.noiseFilter.frequency.setTargetAtTime(600 + energy * 1500, now, 0.4)
    this.noiseGain.gain.setTargetAtTime(0.028 + energy * 0.035, now, 0.4)
    this.tension.gain.setTargetAtTime(Math.min(0.05, velocity * 0.05), now, 0.15)
  }

  /** A struck bell — used on act change. */
  ping(freq = 660) {
    if (!this.ctx || this.muted) return
    const ctx = this.ctx
    const now = ctx.currentTime
    const osc = ctx.createOscillator()
    osc.type = 'triangle'
    osc.frequency.value = freq
    const osc2 = ctx.createOscillator()
    osc2.type = 'sine'
    osc2.frequency.value = freq * 2.01
    const g = ctx.createGain()
    g.gain.setValueAtTime(0, now)
    g.gain.linearRampToValueAtTime(0.09, now + 0.012)
    g.gain.exponentialRampToValueAtTime(0.0001, now + 2.6)
    const g2 = ctx.createGain()
    g2.gain.value = 0.28
    osc.connect(g)
    osc2.connect(g2).connect(g)
    g.connect(this.master)
    osc.start(now)
    osc2.start(now)
    osc.stop(now + 2.7)
    osc2.stop(now + 2.7)
  }
}
