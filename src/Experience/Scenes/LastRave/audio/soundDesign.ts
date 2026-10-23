import type AudioEngine from '../../../Audio/AudioEngine'
import type { HudSfx } from '../hud/Hud'
import { DESIGN } from '../layout'

export type SoundDesignParams = {
  enabled: boolean
  /** SFX bus volume (music is separate). */
  volume: number
  /** Random pitch spread per hit (0 = every hit identical). */
  pitchSpread: number
  /** Stereo width from the HUD x position (0 = mono). */
  stereo: number
}

export const DEFAULT_SOUND_DESIGN: SoundDesignParams = {
  enabled: true,
  volume: 0.8,
  pitchSpread: 1,
  stereo: 0.6,
}

type Cue = {
  sample: string
  volume: number
  /** Base playback rate (pitch). */
  rate: number
  /** ± random rate around `rate`, scaled by `pitchSpread`. */
  jitter: number
  /** Minimum seconds between two plays of this cue (cascades would turn to noise). */
  gap: number
}

/**
 * HUD cue → sample. Short UI sounds re-pitched so repeats never sound copied:
 * panels blip in (higher) / out (lower), typing ticks, modules click,
 * signals beep higher each object, lock + boot use the burst samples.
 */
const CUES: Record<HudSfx['type'], Cue> = {
  'power-on': { sample: 'blipBurst', volume: 0.55, rate: 1, jitter: 0, gap: 0.5 },
  'panel-in': { sample: 'blip', volume: 0.2, rate: 1.1, jitter: 0.18, gap: 0.035 },
  'panel-out': { sample: 'blip', volume: 0.16, rate: 0.72, jitter: 0.1, gap: 0.035 },
  'type-start': { sample: 'ticBurst', volume: 0.1, rate: 1, jitter: 0.12, gap: 0.09 },
  module: { sample: 'click', volume: 0.22, rate: 1, jitter: 0.12, gap: 0.06 },
  signal: { sample: 'beep', volume: 0.5, rate: 1, jitter: 0, gap: 0.2 },
  network: { sample: 'blipBurst', volume: 0.5, rate: 1.25, jitter: 0, gap: 0.5 },
  lock: { sample: 'beep', volume: 0.55, rate: 1.5, jitter: 0, gap: 0.5 },
  'outro-in': { sample: 'click2', volume: 0.4, rate: 0.8, jitter: 0.05, gap: 0.3 },
  'outro-type': { sample: 'tic', volume: 0.22, rate: 1, jitter: 0.15, gap: 0.03 },
  'outro-glitch': { sample: 'click2', volume: 0.16, rate: 1, jitter: 0.3, gap: 0.12 },
  'text-glitch': { sample: 'tic', volume: 0.06, rate: 1.4, jitter: 0.2, gap: 0.1 },
}

export type SoundDesign = ReturnType<typeof createSoundDesign>

/** Plays the HUD's sound cues on the engine's SFX bus. */
export function createSoundDesign(
  audio: AudioEngine,
  params: SoundDesignParams = { ...DEFAULT_SOUND_DESIGN },
) {
  const lastPlayed = new Map<string, number>()

  return {
    params,
    play(cue: HudSfx) {
      if (!params.enabled) return
      const def = CUES[cue.type]
      const now = performance.now() / 1000
      if (now - (lastPlayed.get(cue.type) ?? -Infinity) < def.gap) return
      lastPlayed.set(cue.type, now)

      audio.setSfxVolume(params.volume)
      let rate = def.rate + (Math.random() * 2 - 1) * def.jitter * params.pitchSpread
      // Each found signal beeps a step higher (1 → 3).
      if (cue.type === 'signal') rate *= 1 + 0.12 * (cue.count - 1)
      const pan = 'x' in cue ? ((cue.x / DESIGN.width) * 2 - 1) * params.stereo : 0
      audio.playSfx(def.sample, { volume: def.volume, rate: Math.max(0.25, rate), pan })
    },
  }
}
