/**
 * Tonos cortos para eventos de canal de voz (Web Audio, sin assets).
 * Volúmen bajo para no competir con la conversación.
 */

let sharedCtx: AudioContext | null = null

function getContext(): AudioContext {
  if (typeof window === 'undefined') {
    throw new Error('voiceChannelSounds only runs in the browser')
  }
  if (!sharedCtx || sharedCtx.state === 'closed') {
    sharedCtx = new AudioContext()
  }
  return sharedCtx
}

function withEnvelope(
  _ctx: AudioContext,
  osc: OscillatorNode,
  gain: GainNode,
  peak: number,
  durationSec: number,
  startAt: number,
): void {
  gain.gain.setValueAtTime(0.0001, startAt)
  gain.gain.exponentialRampToValueAtTime(peak, startAt + 0.015)
  gain.gain.exponentialRampToValueAtTime(0.0001, startAt + durationSec)
  osc.start(startAt)
  osc.stop(startAt + durationSec + 0.02)
}

async function playSequence(
  tones: { freq: number; duration: number; peak?: number }[],
): Promise<void> {
  try {
    const ctx = getContext()
    if (ctx.state === 'suspended') {
      await ctx.resume()
    }
    const t0 = ctx.currentTime
    let offset = 0
    for (const tone of tones) {
      const peak = tone.peak ?? 0.06
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.value = tone.freq
      osc.connect(gain)
      gain.connect(ctx.destination)
      withEnvelope(ctx, osc, gain, peak, tone.duration / 1000, t0 + offset)
      offset += tone.duration / 1000 + 0.02
    }
  } catch {
    // Autoplay u otro error: ignorar sin romper la UI
  }
}

/** Alguien entra al canal de voz (después de que ya estás conectado). */
export function playVoiceParticipantJoined(): void {
  void playSequence([
    { freq: 523, duration: 70 },
    { freq: 659, duration: 85, peak: 0.07 },
  ])
}

/** Alguien sale del canal de voz. */
export function playVoiceParticipantLeft(): void {
  void playSequence([
    { freq: 659, duration: 70 },
    { freq: 392, duration: 90, peak: 0.055 },
  ])
}

/** Empieza a compartir pantalla (vídeo). */
export function playVoiceScreenShareStarted(): void {
  void playSequence([
    { freq: 880, duration: 55, peak: 0.065 },
    { freq: 1320, duration: 75, peak: 0.055 },
  ])
}

/** Deja de compartir pantalla. */
export function playVoiceScreenShareStopped(): void {
  void playSequence([
    { freq: 660, duration: 75, peak: 0.05 },
    { freq: 440, duration: 90, peak: 0.045 },
  ])
}
