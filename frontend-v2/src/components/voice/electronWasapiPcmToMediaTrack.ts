/**
 * PCM del binario WASAPI (`application-loopback`) → `MediaStreamTrack` para LiveKit.
 * Formato nativo del exe Werdox: **48 kHz, estéreo, PCM int16 interleaved** (4 bytes / frame).
 * Si interpretáis eso como float32 (~8 bytes / frame) el audio suena a «ardilla» y entrecortado.
 * Override: `VITE_ELECTRON_WASAPI_PCM_FORMAT=f32` solo si el pipe nativo fuera float32.
 *
 * Orden de preferencia:
 * 1) MediaStreamTrackGenerator + AudioData (WebCodecs), si el track es usable.
 * 2) AudioWorklet + buffer circular (sin ScriptProcessor en el hilo principal).
 *
 * Importante: `onAppLoopbackChunk` debe registrarse **antes** de `startAppLoopbackAudio`,
 * si no Chromium/Electron pierde los primeros chunks IPC.
 */

import wasapiWorkletModuleUrl from './wasapi-pcm-worklet.js?url'

const FALLBACK_SAMPLE_RATE = 48_000
const CHANNELS = 2
/** Frames estéreo por mensaje al worklet (~20 ms @ 48 kHz; alineado con batch IPC del Main). */
const WORKLET_PUSH_FRAMES = 960

export type WasapiPcmFormat = 'f32' | 's16'

function envPcmFormat(): WasapiPcmFormat {
  const v = (import.meta.env?.VITE_ELECTRON_WASAPI_PCM_FORMAT as string | undefined)?.toLowerCase()
  return v === 'f32' ? 'f32' : 's16'
}

function bytesPerFrame(fmt: WasapiPcmFormat): number {
  return fmt === 'f32' ? 8 : 4
}

type InsertableAudioTrackGen = new (opts: { kind: 'audio' }) => {
  track?: MediaStreamTrack
  writable: WritableStream<AudioData>
}

function isUsableMediaStreamTrack(t: unknown): t is MediaStreamTrack {
  return (
    typeof t === 'object' &&
    t !== null &&
    typeof (t as MediaStreamTrack).id === 'string' &&
    (t as MediaStreamTrack).id.length > 0 &&
    typeof (t as MediaStreamTrack).addEventListener === 'function'
  )
}

function absoluteWorkletUrl(resolvedImportUrl: string): string {
  if (typeof window === 'undefined') {
    return resolvedImportUrl
  }
  try {
    return new URL(resolvedImportUrl, window.location.href).href
  } catch {
    return resolvedImportUrl
  }
}

export async function createWasapiAppLoopbackMediaStreamTrack(processId: string): Promise<{
  mediaStreamTrack: MediaStreamTrack
  dispose: () => Promise<void>
}> {
  const api = typeof window !== 'undefined' ? window.electronAPI : undefined
  if (!api?.startAppLoopbackAudio || !api.onAppLoopbackChunk || !api.stopAppLoopbackAudio) {
    throw new Error('electronAPI: falta soporte WASAPI (preload)')
  }

  const fmt = envPcmFormat()
  const bpf = bytesPerFrame(fmt)
  let pending = new Uint8Array(0)

  const mergePending = (chunk: Uint8Array) => {
    const next = new Uint8Array(pending.length + chunk.length)
    next.set(pending, 0)
    next.set(chunk, pending.length)
    pending = next
  }

  type RouteMode = 'buffer' | 'gen' | 'worklet'
  let mode: RouteMode = 'buffer'

  let genWriter: WritableStreamDefaultWriter<AudioData> | undefined
  let genTimestampUs = 0
  let genSampleRate = FALLBACK_SAMPLE_RATE
  let genAudioDataCtor: (new (init: unknown) => unknown) | undefined

  let workletNode: AudioWorkletNode | null = null
  let batch = new Float32Array(WORKLET_PUSH_FRAMES * CHANNELS)
  let batchFrames = 0

  const flushWorkletBatch = () => {
    if (!workletNode || batchFrames === 0) return
    const slice = batch.subarray(0, batchFrames * CHANNELS)
    const nbytes = slice.byteLength
    /** Sin transfer: algunos entornos Electron/sandbox fallan con ArrayBuffer detached al worklet. */
    const cloneBuf = slice.buffer.slice(slice.byteOffset, slice.byteOffset + nbytes)
    workletNode.port.postMessage({ type: 'pcm', buffer: cloneBuf })
    batch = new Float32Array(WORKLET_PUSH_FRAMES * CHANNELS)
    batchFrames = 0
  }

  const pushWorkletStereoFrame = (l: number, r: number) => {
    if (!workletNode) return
    const o = batchFrames * CHANNELS
    batch[o] = l
    batch[o + 1] = r
    batchFrames++
    if (batchFrames >= WORKLET_PUSH_FRAMES) flushWorkletBatch()
  }

  const drainPendingToGen = () => {
    const writer = genWriter
    const AudioDataCtor = genAudioDataCtor
    if (!writer || !AudioDataCtor) return
    while (pending.length >= bpf) {
      const frameBytes = Math.floor(pending.length / bpf) * bpf
      if (frameBytes < bpf) break
      const slice = pending.subarray(0, frameBytes)
      pending = pending.subarray(frameBytes)
      const frames = frameBytes / bpf
      try {
        const audioData =
          fmt === 'f32'
            ? new AudioDataCtor({
                format: 'f32',
                sampleRate: genSampleRate,
                numberOfChannels: CHANNELS,
                numberOfFrames: frames,
                timestamp: genTimestampUs,
                data: new Float32Array(slice.buffer, slice.byteOffset, frames * CHANNELS),
              })
            : new AudioDataCtor({
                format: 's16',
                sampleRate: genSampleRate,
                numberOfChannels: CHANNELS,
                numberOfFrames: frames,
                timestamp: genTimestampUs,
                data: new Int16Array(slice.buffer, slice.byteOffset, frames * CHANNELS),
              })
        genTimestampUs += (frames / genSampleRate) * 1_000_000
        void writer.write(audioData as AudioData)
      } catch (e) {
        console.warn('[wasapi] AudioData write', e)
      }
    }
  }

  const drainPendingToWorklet = () => {
    if (!workletNode) return
    while (pending.length >= bpf) {
      const slice = pending.subarray(0, bpf)
      pending = pending.subarray(bpf)
      if (fmt === 'f32') {
        const f = new Float32Array(slice.buffer, slice.byteOffset, CHANNELS)
        pushWorkletStereoFrame(f[0], f[1])
      } else {
        const i = new Int16Array(slice.buffer, slice.byteOffset, CHANNELS)
        pushWorkletStereoFrame(i[0] / 32768, i[1] / 32768)
      }
    }
    if (batchFrames > 0) flushWorkletBatch()
  }

  let chunkListenerOff: (() => void) | null = api.onAppLoopbackChunk((chunk: Uint8Array) => {
    mergePending(chunk)
    if (mode === 'gen') drainPendingToGen()
    if (mode === 'worklet') drainPendingToWorklet()
  })

  const started = await api.startAppLoopbackAudio(processId)
  if (!started.ok) {
    chunkListenerOff?.()
    chunkListenerOff = null
    throw new Error(`WASAPI: no se pudo iniciar captura (${started.reason ?? 'unknown'})`)
  }

  const pcmSampleRate = started.sampleRate > 0 ? started.sampleRate : FALLBACK_SAMPLE_RATE
  genSampleRate = pcmSampleRate

  const GenCtor = (globalThis as unknown as { MediaStreamTrackGenerator?: InsertableAudioTrackGen })
    .MediaStreamTrackGenerator
  const AudioDataCtor = (globalThis as unknown as { AudioData?: new (init: unknown) => unknown }).AudioData

  if (GenCtor && AudioDataCtor) {
    const gen = new GenCtor({ kind: 'audio' })
    const maybeTrack = gen.track
    let writer: WritableStreamDefaultWriter<AudioData> | undefined
    try {
      writer = gen.writable.getWriter()
    } catch (e) {
      console.warn('[wasapi] MediaStreamTrackGenerator: getWriter falló; usando AudioWorklet', e)
    }

    if (isUsableMediaStreamTrack(maybeTrack) && writer) {
      const mediaStreamTrack = maybeTrack
      genWriter = writer
      genAudioDataCtor = AudioDataCtor as new (init: unknown) => unknown
      genTimestampUs = 0
      mode = 'gen'
      drainPendingToGen()

      const dispose = async () => {
        mode = 'buffer'
        genWriter = undefined
        genAudioDataCtor = undefined
        chunkListenerOff?.()
        chunkListenerOff = null
        try {
          await writer.close()
        } catch {
          /* noop */
        }
        try {
          mediaStreamTrack.stop()
        } catch {
          /* noop */
        }
        await api.stopAppLoopbackAudio()
      }

      return { mediaStreamTrack, dispose }
    }

    console.warn('[wasapi] MediaStreamTrackGenerator no usable (pista sin id, etc.); usando AudioWorklet')
    try {
      await writer?.close()
    } catch {
      /* noop */
    }
  }

  const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!AC) {
    chunkListenerOff?.()
    chunkListenerOff = null
    await api.stopAppLoopbackAudio()
    throw new Error('AudioContext no disponible')
  }

  const ctx = new AC({
    sampleRate: pcmSampleRate,
    latencyHint: 'interactive',
  })
  await ctx.resume().catch(() => {})

  const contextSampleRate = ctx.sampleRate
  if (contextSampleRate !== pcmSampleRate) {
    console.warn(
      `[wasapi] AudioContext sampleRate=${contextSampleRate} Hz ≠ PCM nativo ${pcmSampleRate} Hz; el worklet resamplea (ratio ${(pcmSampleRate / contextSampleRate).toFixed(4)}).`,
    )
  }

  const workletHref = absoluteWorkletUrl(wasapiWorkletModuleUrl)
  try {
    await ctx.audioWorklet.addModule(workletHref)
  } catch (e) {
    chunkListenerOff?.()
    chunkListenerOff = null
    await ctx.close().catch(() => {})
    await api.stopAppLoopbackAudio()
    throw new Error(`[wasapi] audioWorklet.addModule falló (${workletHref}): ${String(e)}`)
  }

  workletNode = new AudioWorkletNode(ctx, 'wasapi-pcm-worklet', {
    numberOfInputs: 0,
    numberOfOutputs: 1,
    outputChannelCount: [2],
    processorOptions: {
      pcmSampleRate,
      ringCapacityFrames: Math.floor(pcmSampleRate * 2.5),
      prebufferMs: 115,
    },
  })

  const destination = ctx.createMediaStreamDestination()
  workletNode.connect(destination)

  /**
   * En algunos builds Chromium/Electron el motor no “tira” del AudioWorklet hasta que el grafo
   * llega también a `AudioContext.destination`. Ganancia 0 = inaudible pero mantiene el reloj.
   */
  const tapGain = ctx.createGain()
  tapGain.gain.value = 0
  workletNode.connect(tapGain)
  tapGain.connect(ctx.destination)

  console.log('[wasapi] Worklet cargado y conectado a MediaStreamDestination (+ tap silencioso a destination)', workletHref)

  mode = 'worklet'
  drainPendingToWorklet()

  const dispose = async () => {
    mode = 'buffer'
    chunkListenerOff?.()
    chunkListenerOff = null
    flushWorkletBatch()
    const node = workletNode
    workletNode = null
    try {
      node?.disconnect()
    } catch {
      /* noop */
    }
    try {
      tapGain.disconnect()
    } catch {
      /* noop */
    }
    await ctx.close().catch(() => {})
    await api.stopAppLoopbackAudio()
  }

  const outputTrack = destination.stream.getAudioTracks()[0]
  if (!outputTrack?.id) {
    await dispose()
    throw new Error('No se pudo crear pista de audio WASAPI (AudioWorklet)')
  }

  return { mediaStreamTrack: outputTrack, dispose }
}
