/**
 * PCM estéreo interleaved (Float32) → salida al sampleRate del AudioContext.
 * Ring con pre-buffer para jitter IPC. En underrun breve: silencio puntual sin
 * apagar la ruta (antes `isPlaying=false` forzaba ~100 ms de silencio y sonaba
 * muy entrecortado).
 */
const CHANNELS = 2

class WasapiPcmWorkletProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super()
    const po = options.processorOptions || {}
    this.pcmSampleRate = typeof po.pcmSampleRate === 'number' ? po.pcmSampleRate : 48_000
    /** ~2 s de colchón @ 48 kHz (ajustable por processorOptions) */
    this.capFrames =
      typeof po.ringCapacityFrames === 'number' ? po.ringCapacityFrames : Math.floor(this.pcmSampleRate * 2)
    /** Umbral de arranque: ~100 ms de PCM antes de drenar */
    const preMs = typeof po.prebufferMs === 'number' ? po.prebufferMs : 100
    this.prebufferFrames = Math.max(256, Math.floor(this.pcmSampleRate * (preMs / 1000)))

    this.ring = new Float32Array(this.capFrames * CHANNELS)
    this.writeCount = 0
    /** Posición de lectura fraccionaria en frames PCM (no se fuerza con clamps destructivos) */
    this.readPos = 0
    this.ratio = this.pcmSampleRate / sampleRate
    this.isPlaying = false

    this.port.onmessage = (e) => {
      try {
        const m = e.data
        if (!m || m.type !== 'pcm' || !(m.buffer instanceof ArrayBuffer)) return
        const src = new Float32Array(m.buffer)
        const n = Math.floor(src.length / CHANNELS)
        const cap = this.capFrames
        for (let i = 0; i < n; i++) {
          const idx = this.writeCount % cap
          const o = idx * CHANNELS
          this.ring[o] = src[i * CHANNELS]
          this.ring[o + 1] = src[i * CHANNELS + 1]
          this.writeCount++
        }
      } catch {
        /* noop */
      }
    }
  }

  /** Frames PCM listos para leer desde readPos (sin sobrescritura circular) */
  _availableFramesForRead() {
    const W = this.writeCount
    if (W < 2) return 0
    const cap = this.capFrames
    const f0 = Math.floor(this.readPos)
    if (f0 + 1 >= W) return 0
    if (f0 < W - cap) return 0
    return W - this.readPos
  }

  process(_inputs, outputs) {
    try {
      const out0 = outputs[0][0]
      const out1 = outputs[0][1]
      if (!out0 || !out1) return true

      const W = this.writeCount
      const avail = W - this.readPos

      if (!this.isPlaying) {
        if (avail >= this.prebufferFrames) {
          this.isPlaying = true
        }
      }

      for (let i = 0; i < out0.length; i++) {
        if (!this.isPlaying) {
          out0[i] = 0
          out1[i] = 0
          continue
        }

        if (this._availableFramesForRead() < 2) {
          out0[i] = 0
          out1[i] = 0
          /* readPos sin tocar: el siguiente sample puede volver a tener datos */
          continue
        }

        const f0 = Math.floor(this.readPos)
        const frac = this.readPos - f0
        const cap = this.capFrames
        const i0 = ((f0 % cap) + cap) % cap
        const i1 = (((f0 + 1) % cap) + cap) % cap
        const o0 = i0 * CHANNELS
        const o1 = i1 * CHANNELS
        const L0 = this.ring[o0]
        const R0 = this.ring[o0 + 1]
        const L1 = this.ring[o1]
        const R1 = this.ring[o1 + 1]
        out0[i] = L0 + frac * (L1 - L0)
        out1[i] = R0 + frac * (R1 - R0)
        this.readPos += this.ratio
      }
    } catch {
      /* noop */
    }
    return true
  }
}

registerProcessor('wasapi-pcm-worklet', WasapiPcmWorkletProcessor)
