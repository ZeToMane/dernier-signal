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
  /** Bunker room tone (always on). */
  ambientVolume: number
  /** How much the room tone drops while the music plays (0 = no duck, 1 = silent). */
  ambientDuck: number
  /** Screen hum at full screen power (follows boot + flicker). */
  humVolume: number
  /** Hidden watcher's breathing bed (ducks under the music like the room tone). */
  breathVolume: number
}

export const DEFAULT_SOUND_DESIGN: SoundDesignParams = {
  enabled: true,
  volume: 0.8,
  pitchSpread: 1,
  stereo: 0.6,
  ambientVolume: 0.35,
  ambientDuck: 0.5,
  humVolume: 0.35,
  breathVolume: 0.15,
}

/** HUD cues + scene events (poster, …). */
export type SceneSfx =
  | HudSfx
  | { type: 'poster-wind' }
  | { type: 'poster-rip' }
  | { type: 'screen-on' }
  | { type: 'screen-off' }
  | { type: 'merge-glitch' }
  /** Torch `index` (0..2) clicks on; `pan` -1 left … 1 right. */
  | { type: 'lamp-on'; index: number; pan: number }

type Cue = {
  sample: string
  volume: number
  /** Base playback rate (pitch). */
  rate: number
  /** ± random rate around `rate`, scaled by `pitchSpread`. */
  jitter: number
  /** Minimum seconds between two plays of this cue (cascades would turn to noise). */
  gap: number
  /** Play a slice of the sample: [min, max] length in seconds, random start inside the file. */
  slice?: [number, number]
}

/**
 * HUD cue → sample. Short UI sounds re-pitched so repeats never sound copied:
 * panels blip in (higher) / out (lower), typing ticks, modules click,
 * signals beep higher each object, lock + boot use the burst samples.
 */
/** Cues left out stay silent (e.g. `lock` — buried under the drop). */
const CUES: Partial<Record<SceneSfx['type'], Cue>> = {
  // HUD boot blips — sit under the electrical screen-on sound.
  'power-on': { sample: 'blipBurst', volume: 0.3, rate: 1, jitter: 0, gap: 0.5 },
  'panel-in': { sample: 'blip', volume: 0.2, rate: 1.1, jitter: 0.18, gap: 0.035 },
  'panel-out': { sample: 'blip', volume: 0.16, rate: 0.72, jitter: 0.1, gap: 0.035 },
  'type-start': { sample: 'ticBurst', volume: 0.1, rate: 1, jitter: 0.12, gap: 0.09 },
  module: { sample: 'click', volume: 0.22, rate: 1, jitter: 0.12, gap: 0.06 },
  // Sample picked per object in SIGNAL_SAMPLES below.
  signal: { sample: 'addSignal2', volume: 0.6, rate: 1, jitter: 0, gap: 0.2 },
  network: { sample: 'blipBurst', volume: 0.5, rate: 1.25, jitter: 0, gap: 0.5 },
  // Outro « LA FÊTE N'EST PAS MORTE » — same hard tear as the drop merge.
  'outro-in': { sample: 'glitchHard', volume: 0.5, rate: 1, jitter: 0.06, gap: 0.3, slice: [0.55, 0.6] },
  'outro-out': { sample: 'glitchHard', volume: 0.45, rate: 1.05, jitter: 0.06, gap: 0.3, slice: [0.2, 0.25] },
  'outro-type': { sample: 'tic', volume: 0.22, rate: 1, jitter: 0.15, gap: 0.03 },
  // Outro glitch bursts: tiny random slices of the hard tear, never the same twice.
  'outro-glitch': { sample: 'glitchHard', volume: 0.28, rate: 1, jitter: 0.2, gap: 0.12, slice: [0.08, 0.22] },
  'text-glitch': { sample: 'tic', volume: 0.06, rate: 1.4, jitter: 0.2, gap: 0.1 },
  // Gust that tears the poster off, then the paper ripping off the wall.
  'poster-wind': { sample: 'windPoster', volume: 0.55, rate: 1, jitter: 0.05, gap: 0.5 },
  'poster-rip': { sample: 'paperRip', volume: 0.7, rate: 1, jitter: 0.06, gap: 0.5 },
  // Electrical thump + CRT warm-up when the screen powers on.
  // Drop: the traces fuse — hard digital tear, synced with the screen + post glitch.
  'merge-glitch': { sample: 'glitchHard', volume: 0.6, rate: 1, jitter: 0, gap: 2, slice: [1.1, 1.1] },
  // Torch switch click — sample picked per torch (lamp1..3).
  'lamp-on': { sample: 'lamp1', volume: 0.7, rate: 1, jitter: 0.03, gap: 0 },
  'screen-on': { sample: 'screenOn', volume: 0.45, rate: 1, jitter: 0, gap: 1 },
  // End of the show: old CRT dies with the music.
  'screen-off': { sample: 'screenOff', volume: 0.6, rate: 1, jitter: 0, gap: 1 },
}

/** Object found 1 / 2 / 3 → sample. */
const SIGNAL_SAMPLES = ['addSignal', 'addSignal2', 'addSignal3']

export type SoundDesign = ReturnType<typeof createSoundDesign>

/** Plays the HUD's sound cues on the engine's SFX bus. */
export function createSoundDesign(
  audio: AudioEngine,
  params: SoundDesignParams = { ...DEFAULT_SOUND_DESIGN },
) {
  const lastPlayed = new Map<string, number>()
  type Loop = ReturnType<AudioEngine['playLoop']>
  let ambient: Loop = null
  let hum: Loop = null
  let breath: Loop = null

  return {
    params,
    /**
     * Drive the looping beds each frame: room tone (ducked under the music) and
     * the screen hum (tracks power, dips with the neon flicker). Loops start as
     * soon as audio is unlocked.
     */
    updateBeds(state: { screenPower: number; flicker: number; musicPlaying: boolean }) {
      if (!ambient) ambient = audio.playLoop('ambient')
      if (!hum) hum = audio.playLoop('screenHum')
      if (!breath) breath = audio.playLoop('breath')
      const on = params.enabled ? 1 : 0
      audio.setSfxVolume(params.volume)
      const duck = state.musicPlaying ? 1 - params.ambientDuck : 1
      ambient?.setVolume(params.ambientVolume * duck * on, 0.6)
      breath?.setVolume(params.breathVolume * duck * on, 0.6)
      // Fast glide so the boot flicker stutters the hum like a bad contact.
      hum?.setVolume(params.humVolume * state.screenPower * state.flicker * on, 0.03)
    },
    play(cue: SceneSfx) {
      if (!params.enabled) return
      const def = CUES[cue.type]
      if (!def) return
      const now = performance.now() / 1000
      const key = cue.type === 'lamp-on' ? `lamp-${cue.index}` : cue.type
      if (now - (lastPlayed.get(key) ?? -Infinity) < def.gap) return
      lastPlayed.set(key, now)

      audio.setSfxVolume(params.volume)
      let rate = def.rate + (Math.random() * 2 - 1) * def.jitter * params.pitchSpread
      let sample = def.sample
      if (cue.type === 'signal') sample = SIGNAL_SAMPLES[cue.count - 1] ?? def.sample
      if (cue.type === 'lamp-on') sample = `lamp${cue.index + 1}`
      const pan =
        'x' in cue
          ? ((cue.x / DESIGN.width) * 2 - 1) * params.stereo
          : 'pan' in cue
            ? cue.pan * params.stereo
            : 0
      let offset = 0
      let duration: number | undefined
      if (def.slice) {
        duration = def.slice[0] + Math.random() * (def.slice[1] - def.slice[0])
        // Random start for short slices; long ones start at the attack.
        offset = duration < 0.5 ? Math.random() * Math.max(0, 1.9 - duration) : 0
      }
      audio.playSfx(sample, {
        volume: def.volume,
        rate: Math.max(0.25, rate),
        pan,
        offset,
        duration,
      })
    },
  }
}
