import { DESIGN, PALETTE } from '../layout'

type Rect = { x: number; y: number; w: number; h: number }

type PoseLike = Rect & { alpha: number; t: number; contentAlpha: number; glitch: number }

/** Drawing helpers borrowed from the Hud (layout boot, type-in text, blink states). */
export type HudPainter = {
  ctx: CanvasRenderingContext2D
  time: () => number
  pose: (id: string, final: Rect) => PoseLike | null
  stroke: (pose: PoseLike, corner?: number) => void
  inLayout: (final: Rect, pose: PoseLike, draw: () => void) => void
  text: (
    value: string,
    x: number,
    y: number,
    size: number,
    color: string,
    align?: CanvasTextAlign,
    spacing?: number,
    glitchId?: string,
    animate?: boolean,
  ) => void
  resolve: (value: string, id: string) => string
  line: (x1: number, y1: number, x2: number, y2: number, color: string) => void
  statusLit: (index: number) => boolean
  liveLit: () => boolean
  /** 0..1 global overdrive spike fired on each new signal. */
  pulse: () => number
  titleFont: string
  monoFont: string
}

const FRAME: Rect = { x: 6, y: 6, w: DESIGN.width - 12, h: DESIGN.height - 12 }
/** Shared top chrome — stays on screen across intro ↔ signal. */
export const CHROME_BAR: Rect = { x: 31, y: 14, w: 790, h: 20 }
export const CHROME_SPLIT_X = 683
export const CHROME_ID = 'chrome'
const STABLE: Rect = { x: 33, y: 54, w: 131, h: 44 }
const STABLE_SPLIT_X = 99
const GRAPH: Rect = { x: 31, y: 117, w: 589, h: 304 }
const COUNT: Rect = { x: 641, y: 48, w: 168, h: 56 }
const ACCURACY: Rect = { x: 641, y: 117, w: 168, h: 169 }
const ACCURACY_HEADER_H = 36
const SMALL_A: Rect = { x: 641, y: 304, w: 75, h: 74 }
const SMALL_B: Rect = { x: 734, y: 304, w: 75, h: 74 }
const INCOMING: Rect = { x: 641, y: 401, w: 168, h: 19 }
const INCOMING_SPLIT_X = 700
const CURSOR_X = 121
const BOTTOM_LINE_Y = 448
const BOTTOM: Rect = { x: 31, y: 445, w: 778, h: 18 }

/** Boot order / shapes for the layout glitch when this screen appears. */
export const SIGNAL_LAYOUT: (Rect & { id: string; corner?: number })[] = [
  { id: 'frame', ...FRAME, corner: 10 },
  { id: CHROME_ID, ...CHROME_BAR },
  { id: 's2-stable', ...STABLE },
  { id: 's2-graph', ...GRAPH, corner: 6 },
  { id: 's2-count', ...COUNT },
  { id: 's2-acc', ...ACCURACY, corner: 6 },
  { id: 's2-small-a', ...SMALL_A },
  { id: 's2-small-b', ...SMALL_B },
  { id: 's2-incoming', ...INCOMING },
  // Last — bottom rule + footer text materialize after the rest.
  { id: 's2-bottom', ...BOTTOM },
]

export const SIGNAL_BIG_PANELS = new Set(['s2-graph', 's2-acc'])

/** A note to play: starts `at` seconds into the loop, lasts `len` seconds. */
type Note = {
  at: number
  len: number
  /** Accent multiplier on the curve amp (default 1). */
  amp?: number
  /** Oscillations inside this hit (default: curve's `cycles`). */
  cycles?: number
}

type CurveConfig = {
  color: string
  /** Peak height in design px. */
  amp: number
  /** Oscillations inside one note peak. */
  cycles: number
  /** Pattern length in seconds — the note chart repeats after this. */
  loop: number
  notes: Note[]
  seed: number
}

/** Lane traces — notes come from the rhythm chart via `setChart`. */
const CURVES: CurveConfig[] = [
  {
    color: '#f0c75e',
    amp: 22,
    cycles: 2.5,
    loop: 6,
    notes: [],
    seed: 1.7,
  },
  {
    get color() {
      return PALETTE.greenLane
    },
    amp: 20,
    cycles: 2,
    loop: 6,
    notes: [],
    seed: 4.3,
  },
  {
    color: '#3cc6e6',
    amp: 20,
    cycles: 3,
    loop: 6,
    notes: [],
    seed: 8.9,
  },
]

/** Visual width of a hit peak (seconds). */
const NOTE_PEAK_LEN = 0.22

/** Chart scroll speed (design px / s), right → left, shared by all traces. */
const SCROLL_SPEED = 70
const REVEAL_DURATION = 0.9
/** How fast the displayed accuracy chases the real one (1/s). */
const ACCURACY_LERP = 4
/** Final stage: the three traces converge onto this line. */
const MERGED_Y = GRAPH.y + GRAPH.h / 2
/** Extra gain once the network is locked — big club peaks. */
const MERGED_AMP = 1.85
/** Faster scroll for the merged techno trace only. */
const RAVE_SCROLL = 145
/**
 * Reactivation timeline (s from the trigger):
 * vibrate → converge (loose) → sync rhythm + color → single surge, flash, glitch, title.
 */
const RAVE = { vibrate: 0.5, converge: 1.5, sync: 2, lock: 2.5 }
/** The surge sweeps the graph during [sync, sync + SURGE_DURATION]. */
const SURGE_DURATION = 0.42
const SURGE_AMP = 115
/** Flash peaks when the surge crosses mid-graph. */
const FLASH_AT = 2.24

/**
 * Shared phrase the traces lock onto — two bars of kick with accents,
 * off-beat ghosts, a long wobble hit and a roll building into the next bar.
 */
const SYNC_CURVE: CurveConfig = {
  get color() {
    return PALETTE.green
  },
  amp: 22,
  cycles: 2,
  loop: 8,
  notes: [
    // Bar A
    { at: 0, len: 0.34, amp: 1.25, cycles: 2.5 },
    { at: 0.5, len: 0.2, amp: 0.65, cycles: 1.5 },
    { at: 0.75, len: 0.12, amp: 0.35, cycles: 1 },
    { at: 1, len: 0.26, amp: 0.9 },
    { at: 1.5, len: 0.2, amp: 0.65, cycles: 1.5 },
    { at: 2, len: 0.42, amp: 1.1, cycles: 3.5 },
    { at: 2.5, len: 0.2, amp: 0.6, cycles: 1.5 },
    { at: 3, len: 0.26, amp: 0.85 },
    { at: 3.25, len: 0.12, amp: 0.4, cycles: 1 },
    { at: 3.5, len: 0.14, amp: 0.55, cycles: 1 },
    { at: 3.625, len: 0.12, amp: 0.7, cycles: 1 },
    { at: 3.75, len: 0.12, amp: 0.85, cycles: 1 },
    { at: 3.875, len: 0.12, amp: 1, cycles: 1 },
    // Bar B
    { at: 4, len: 0.38, amp: 1.35, cycles: 3 },
    { at: 4.5, len: 0.2, amp: 0.6, cycles: 1.5 },
    { at: 5, len: 0.26, amp: 0.9 },
    { at: 5.25, len: 0.12, amp: 0.45, cycles: 1 },
    { at: 5.5, len: 0.2, amp: 0.7, cycles: 1.5 },
    { at: 6, len: 0.5, amp: 1.05, cycles: 4.5 },
    { at: 6.75, len: 0.12, amp: 0.5, cycles: 1 },
    { at: 7, len: 0.26, amp: 0.9 },
    { at: 7.5, len: 0.1, amp: 0.45, cycles: 1 },
    { at: 7.625, len: 0.1, amp: 0.6, cycles: 1 },
    { at: 7.75, len: 0.1, amp: 0.8, cycles: 1 },
    { at: 7.875, len: 0.1, amp: 1, cycles: 1 },
  ],
  seed: 3.1,
}

/** Kick detection on the music's low end: rise over the running average → beat. */
const BEAT = { avgRate: 1.5, threshold: 0.12, decay: 9 }

/** Slow swell under the merged trace so the line itself breathes. */
const carrierAt = (wx: number, time: number) =>
  Math.sin(wx * 0.012 + time * 0.6) * 6 + Math.sin(wx * 0.031 - time * 1.1) * 2.5

const hash01 = (n: number) => {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453
  return x - Math.floor(x)
}

/**
 * Merged-trace peaks — four-on-the-floor techno: huge kicks, busy hats, fast scroll energy.
 * Hit strength fades in/out; overlapping notes are summed (no hard jumps).
 */
const evolvingPeakAt = (wx: number, time: number) => {
  const phase = time * 0.14
  // Always pumping — floor stays high, peaks into full teuf.
  const energy = 0.72 + 0.28 * (0.5 + 0.5 * Math.sin(phase) * Math.sin(phase * 0.37 + 0.9))
  const chaos = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(phase * 0.71 + 2.1))
  const sharp = 0.55 + 0.45 * (0.5 + 0.5 * Math.sin(phase * 0.33 + 1.4))
  const gate = 0.82 + 0.18 * Math.sin(phase * 0.22 + 0.4)

  const t = wx / RAVE_SCROLL
  const step = 0.1 // ~150bpm 16ths — denser grid
  const i0 = Math.floor(t / step)
  let peak = 0

  for (let di = -4; di <= 4; di++) {
    const i = i0 + di
    const at = i * step
    const h = hash01(i * 1.713)
    const h2 = hash01(i * 0.91 + 2.2)
    const bar = ((i % 16) + 16) % 16
    const down = bar === 0
    const kick = bar % 4 === 0
    const hat = bar % 2 === 1
    const chance =
      gate *
      energy *
      (down ? 1 : kick ? 0.95 : hat ? 0.35 + chaos * 0.45 : 0.12 + chaos * 0.35)
    const soft = clamp01((chance - h + 0.08) / 0.2)
    if (soft <= 0.001) continue

    // Punchy kicks, short hats, occasional long bass wobble on the 1.
    const len = down
      ? 0.16 + h2 * 0.12
      : kick
        ? 0.09 + h2 * 0.06
        : hat
          ? 0.04 + h2 * 0.04
          : 0.06 + h2 * 0.08
    const d = t - at
    if (d < 0 || d > len) continue
    const u = d / len
    // Sharper attack for club kicks (still 0 at ends).
    const env = Math.pow(Math.sin(u * Math.PI), 0.75 + sharp * 0.9)
    const amp =
      (20 + energy * 26) *
      (down ? 1.35 : kick ? 1.05 : hat ? 0.22 + h2 * 0.2 : 0.35 + h2 * 0.3) *
      soft
    const cycles = down ? 2 + Math.round(h2 * 2) : kick ? 1 + Math.round(h2) : 1
    const wave = Math.sin(u * cycles * Math.PI * 2)
    peak += wave * env * amp * (0.85 + chaos * 0.25)
  }
  // Soft clamp so stacked hats don't explode past the graph.
  const lim = GRAPH.h * 0.28
  return peak > lim ? lim + (peak - lim) * 0.1 : peak < -lim ? -lim + (peak + lim) * 0.1 : peak
}

/** Keep peaks inside the graph when lanes redistribute. */
const LANE_MARGIN = 40
/** How fast existing traces slide to their new lane (1/s). */
const LANE_LERP = 6
/**
 * Impact when a new signal unlocks:
 * vibrate + parasites → lanes spring apart → reveal scan + flash/glitch.
 */
const ACQUIRE = { duration: 1.15, vibrate: 0.28, spring: 0.7, flashAt: 0.38 }

/** Evenly spaced baseline Y for curve `index` among `n` active traces. */
const laneTarget = (index: number, n: number) => {
  if (n <= 0) return MERGED_Y
  const usable = GRAPH.h - LANE_MARGIN * 2
  return GRAPH.y + LANE_MARGIN + (usable * (index + 1)) / (n + 1)
}

const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}

const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2)

const easeOutBack = (t: number) => {
  const c = 1.55
  const t1 = t - 1
  return 1 + c * t1 * t1 * t1 + (c - 1) * t1 * t1
}

const clamp01 = (x: number) => Math.max(0, Math.min(1, x))

const hexRgb = (hex: string) => {
  const v = parseInt(hex.slice(1), 16)
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255] as const
}

const mixHex = (a: string, b: string, t: number) => {
  const ca = hexRgb(a)
  const cb = hexRgb(b)
  const c = ca.map((v, i) => Math.round(v + (cb[i]! - v) * t))
  return `rgb(${c[0]}, ${c[1]}, ${c[2]})`
}

const withAlpha = (hex: string, alpha: number) => {
  const [r, g, b] = hexRgb(hex)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

/** Near-flat idle line — soft carrier + a tiny tremble so the trace stays alive. */
const baselineAt = (wx: number, seed: number, time: number) =>
  Math.sin(wx * 0.13 + seed) * Math.sin(wx * 0.031 + time * 0.7) * 0.55 +
  Math.sin(wx * 0.47 + seed * 3 + time * 4) * 0.3 +
  Math.sin(wx * 2.1 + seed * 7 + time * 11) * 0.35 +
  Math.sin(wx * 5.4 + time * 23 + seed) * 0.18

/**
 * Peak offset (design px, up = positive) at chart position `wx`, 0 between notes.
 * Amplitude breathes slowly so the wave packets shrink / grow over time.
 */
const peakAt = (
  wx: number,
  cfg: CurveConfig,
  time: number,
  dampOf?: (noteAt: number, chartTime: number) => number,
) => {
  const loopPx = cfg.loop * SCROLL_SPEED
  const local = ((wx % loopPx) + loopPx) % loopPx
  // Unwrapped chart time under this pixel — identifies which loop occurrence we draw.
  const chartTime = wx / SCROLL_SPEED
  // Slow breathe ±12% + a faster micro-flutter ±5%.
  const breathe =
    1 +
    Math.sin(time * 1.6 + cfg.seed) * 0.12 +
    Math.sin(time * 4.2 + cfg.seed * 2.1) * 0.05
  for (const note of cfg.notes) {
    const start = note.at * SCROLL_SPEED
    const width = note.len * SCROLL_SPEED
    for (const d of [local - start, local - start + loopPx, local - start - loopPx]) {
      if (d < 0 || d > width) continue
      const u = d / width
      const env = Math.sin(u * Math.PI) ** 2
      // Tiny phase jitter so oscillations inside the peak aren't perfectly locked.
      const flutter = Math.sin(time * 7 + cfg.seed * 3 + u * 4) * 0.06
      const cycles = note.cycles ?? cfg.cycles
      const damp = dampOf?.(note.at, chartTime) ?? 1
      return (
        Math.sin(u * cycles * Math.PI * 2 + flutter) *
        env *
        cfg.amp *
        (note.amp ?? 1) *
        breathe *
        damp
      )
    }
  }
  return 0
}

/** Second HUD screen: three signal traces unlocked one by one as objects are found. */
export class SignalScreen {
  private found = 0
  private readonly revealAt = [Infinity, Infinity, Infinity]
  /** Live baseline Y per trace — lerps toward an even split of the graph. */
  private readonly laneY = [MERGED_Y, MERGED_Y, MERGED_Y]
  /** Lane positions when the last acquire started (for spring redistribution). */
  private readonly laneFrom = [MERGED_Y, MERGED_Y, MERGED_Y]
  /** Displayed rhythm accuracy (0–100), eased toward `accuracyTarget`. */
  private accuracy = 0
  private accuracyTarget = 0
  /** Accuracy the player must hold to reactivate the network (tick on the ring). */
  private accuracyThreshold = 0
  /** 0..1 progress of holding the threshold. */
  private accuracyHold = 0
  /** Brief overdrive on Accuracy / UNSTABLE when a new signal is found. */
  private meterBoost: { elapsed: number; duration: number } | null = null
  /** Stage 4 — network reactivated: traces merge, every meter pinned to max. */
  private raveAt: number | null = null
  /** Impact burst when signal 1/2/3 unlocks. */
  private acquireAt: number | null = null
  private acquireIndex = 0
  private now = 0
  /**
   * Audio song time (seconds since LOOP/DROP start). When set, peaks scroll
   * against this clock so a note at `t` crosses the cursor at song time `t`.
   */
  private songTime: number | null = null
  /** Live music low end (0..1), its running average, and the decaying kick pulse. */
  private bass = 0
  private bassAvg = 0
  private beat = 0
  /**
   * Successful hits keyed by absolute song time of the note occurrence.
   * Only that pass is collapsed — the next loop arrives full height.
   */
  private readonly hitDamps: {
    lane: number
    noteAt: number
    /** Absolute song time of this note occurrence (unwrapped). */
    absAt: number
    damp: number
  }[] = []

  /** Inject the playable chart — one peak per note, loop length = track duration. */
  setChart(notes: { time: number; lane: number }[], loopDuration: number) {
    const loop = Math.max(0.001, loopDuration)
    this.hitDamps.length = 0
    for (let i = 0; i < CURVES.length; i++) {
      const curve = CURVES[i]!
      curve.loop = loop
      curve.notes = notes
        .filter((n) => n.lane === i && n.time >= 0 && n.time < loop)
        .map((n) => ({ at: n.time, len: NOTE_PEAK_LEN }))
    }
  }

  setMusicLevel(bass: number) {
    this.bass = bass
  /** Real rhythm accuracy (0–100), the target to hold, and 0..1 hold progress. */
  setAccuracy(value: number, threshold: number, hold: number) {
    this.accuracyTarget = Math.max(0, Math.min(100, value))
    this.accuracyThreshold = threshold
    this.accuracyHold = clamp01(hold)
  }

  /** Drive the graph from the AudioEngine clock (null = decorative / pre-music). */
  setSongTime(songTime: number | null) {
    this.songTime = songTime
  }

  /**
   * Collapse the peak for a successfully caught note.
   * `absSongTime` = unwrapped song time of that occurrence (not the press time).
   */
  registerHit(lane: number, noteTime: number, absSongTime: number) {
    this.hitDamps.push({
      lane,
      noteAt: noteTime,
      absAt: absSongTime,
      damp: 1,
    })
  }

  /**
   * Damp only if this pixel is drawing the exact occurrence that was hit.
   * `chartTime` = wx / SCROLL_SPEED (unwrapped).
   */
  private hitDamp(lane: number, noteAt: number, chartTime: number) {
    let damp = 1
    for (const hit of this.hitDamps) {
      if (hit.lane !== lane) continue
      if (Math.abs(hit.noteAt - noteAt) > 1e-3) continue
      // Same loop pass: chart time under the peak ≈ absolute note time.
      if (Math.abs(chartTime - hit.absAt) > NOTE_PEAK_LEN) continue
      damp = Math.min(damp, hit.damp)
    }
    return damp
  }

  get count() {
    return this.raveAt === null ? this.found : 4
  }

  /** 0..1 eased progress of the whole reactivation (0 when not in the final stage). */
  raveLevel(now = this.now) {
    return easeInOutCubic(clamp01(this.raveTime(now) / RAVE.lock))
  }

  /** Seconds since the reactivation started (negative / -1 when inactive). */
  private raveTime(now: number) {
    return this.raveAt === null ? -1 : now - this.raveAt
  }

  /** Seconds since the network locked (negative / -Infinity before). */
  lockedFor(now: number) {
    return this.raveAt === null ? -Infinity : now - this.raveAt - RAVE.lock
  }

  /** Title / labels flip only once the surge has gone through. */
  private isLocked(now = this.now) {
    return this.raveTime(now) >= RAVE.lock
  }

  /** Seconds since the last signal-acquire burst (-1 when idle). */
  private acquireTime(now: number) {
    return this.acquireAt === null ? -1 : now - this.acquireAt
  }

  /** 0..1 during an acquire burst (0 when idle / done). */
  acquireLevel(now = this.now) {
    const t = this.acquireTime(now)
    if (t < 0 || t >= ACQUIRE.duration) return 0
    return 1 - t / ACQUIRE.duration
  }

  /** Brief full-screen flash — rave surge or signal acquire. */
  flashLevel(now = this.now) {
    const t = this.raveTime(now)
    let rave = 0
    if (t >= FLASH_AT - 0.04) {
      rave = t < FLASH_AT ? (t - (FLASH_AT - 0.04)) / 0.04 : Math.exp(-(t - FLASH_AT) * 16)
    }
    const a = this.acquireTime(now)
    let hit = 0
    if (a >= ACQUIRE.flashAt - 0.05) {
      hit =
        a < ACQUIRE.flashAt
          ? (a - (ACQUIRE.flashAt - 0.05)) / 0.05
          : Math.exp(-(a - ACQUIRE.flashAt) * 14) * 0.7
    }
    return Math.max(rave, hit)
  }

  /** Tear glitch of the merge only (traces fusing into one) — 0 otherwise. */
  raveGlitchLevel(now = this.now) {
    const t = this.raveTime(now)
    const u = (t - (FLASH_AT - 0.02)) / (RAVE.lock + 0.05 - (FLASH_AT - 0.02))
    return u > 0 && u < 1 ? Math.sin(Math.PI * u) ** 0.6 : 0
  }

  /** Horizontal tear glitch — rave lock or signal acquire. */
  glitchLevel(now = this.now) {
    const rave = this.raveGlitchLevel(now)
    const a = this.acquireTime(now)
    const v = (a - 0.12) / 0.55
    const hit = v > 0 && v < 1 ? Math.sin(Math.PI * v) ** 0.7 * 0.85 : 0
    return Math.max(rave, hit)
  }

  /**
   * `firstDelay` lets the first trace wait for the layout boot when the screen just appeared.
   * 1..3 = objects found, 4 = network reactivated.
   */
  setFound(count: number, now: number, firstDelay = 0) {
    const stage = Math.max(0, Math.min(4, count))
    const n = Math.min(3, stage)
    const prev = this.found
    if (n > prev) {
      for (let i = 0; i < 3; i++) this.laneFrom[i] = this.laneY[i]!
    }
    for (let i = 0; i < 3; i++) {
      if (i >= n) {
        this.revealAt[i] = Infinity
      } else if (this.revealAt[i] === Infinity) {
        const at = now + (i === 0 ? firstDelay : 0)
        this.revealAt[i] = at
        // New trace starts mid-graph, then springs onto its lane with the others.
        this.laneFrom[i] = MERGED_Y
        this.laneY[i] = MERGED_Y
        if (n > prev) {
          this.acquireAt = at
          this.acquireIndex = i
        }
      }
    }
    this.found = n
    if (n > prev) this.meterBoost = { elapsed: 0, duration: 1.35 }
    if (n === 0) {
      this.meterBoost = null
      this.acquireAt = null
      for (let i = 0; i < 3; i++) this.laneY[i] = MERGED_Y
    }
    if (stage < 4) this.raveAt = null
    else if (this.raveAt === null) {
      this.acquireAt = null
      this.raveAt = now + (prev < 3 ? firstDelay + 0.6 : 0)
    }
  }

  /**
   * Single overdrive: ease-out race toward 98 (slows hard around ~92), then fall back.
   * Final stage: pinned at the top with a nervous jitter.
   */
  private boostedAccuracy() {
    const rave = this.raveLevel()
    if (rave > 0) {
      const pinned = 99 + Math.sin(this.now * 37) * 0.5 + Math.random() * 0.5
      return this.accuracy + (pinned - this.accuracy) * rave
    }
    const base = this.accuracy
    if (!this.meterBoost) return base
    const t = Math.min(1, this.meterBoost.elapsed / this.meterBoost.duration)
    const TOP = 98

    if (t < 0.58) {
      const u = t / 0.58
      // Strong ease-out — tears through the low %, hangs around 92–98.
      const e = 1 - (1 - u) ** 5
      return base + (TOP - base) * e
    }

    const u = (t - 0.58) / 0.42
    const e = u * u
    return TOP + (base - TOP) * e
  }

  update(dt: number, now = this.now) {
    this.now = now
    this.bassAvg += (this.bass - this.bassAvg) * Math.min(1, dt * BEAT.avgRate)
    const onset = clamp01((this.bass - this.bassAvg) / BEAT.threshold)
    this.beat = Math.max(onset, this.beat * Math.exp(-dt * BEAT.decay))
    if (this.meterBoost) {
      this.meterBoost.elapsed += dt
      if (this.meterBoost.elapsed >= this.meterBoost.duration) this.meterBoost = null
    }

    // Successful hits: drop fast, stay flat until the peak has left the left edge.
    const song = this.songTime ?? now
    const clearAfter = (CURSOR_X - GRAPH.x) / SCROLL_SPEED + NOTE_PEAK_LEN
    for (let i = this.hitDamps.length - 1; i >= 0; i--) {
      const hit = this.hitDamps[i]!
      hit.damp = Math.max(0.05, hit.damp - dt * 10)
      if (song > hit.absAt + clearAfter) this.hitDamps.splice(i, 1)
    }

    this.accuracyRetargetIn -= dt
    if (this.accuracyRetargetIn <= 0) {
      this.accuracyTarget = ACCURACY_MIN + Math.random() * (ACCURACY_MAX - ACCURACY_MIN)
      this.accuracyRetargetIn = 0.35 + Math.random() * 0.9
    }

    this.accuracy += (this.accuracyTarget - this.accuracy) * Math.min(1, dt * ACCURACY_LERP)

    // Redistribute lanes — spring overshoot during acquire, soft lerp otherwise.
    if (this.found > 0) {
      const acqT = this.acquireTime(now)
      if (acqT >= 0 && acqT < ACQUIRE.spring) {
        const u = easeOutBack(clamp01(acqT / ACQUIRE.spring))
        for (let i = 0; i < this.found; i++) {
          const to = laneTarget(i, this.found)
          this.laneY[i] = this.laneFrom[i]! + (to - this.laneFrom[i]!) * u
        }
      } else {
        const k = Math.min(1, dt * LANE_LERP)
        for (let i = 0; i < this.found; i++) {
          const target = laneTarget(i, this.found)
          this.laneY[i] = this.laneY[i]! + (target - this.laneY[i]!) * k
        }
      }
    }
  }

  draw(p: HudPainter) {
    const { ctx } = p
    this.now = p.time()
    const frame = p.pose('frame', FRAME)
    if (frame) p.stroke(frame, 10)
    const chrome = frame?.contentAlpha ?? 0

    this.drawStable(p)
    this.drawGraph(p)
    this.drawCount(p)
    this.drawAccuracy(p)

    for (const [id, rect] of [
      ['s2-small-a', SMALL_A],
      ['s2-small-b', SMALL_B],
    ] as const) {
      const pose = p.pose(id, rect)
      if (pose) p.stroke(pose)
    }

    this.drawIncoming(p)
    this.drawBottomBar(p)

    // Title lands last — after the graph (and other panels) have settled in.
    if (chrome > 0.01) {
      const graph = p.pose('s2-graph', GRAPH)
      if (graph && graph.contentAlpha > 0.85) {
        ctx.save()
        ctx.globalAlpha = chrome * Math.min(1, (graph.contentAlpha - 0.85) / 0.15)
        this.drawTitle(p)
        ctx.restore()
      }
    }
  }

  private titleByCount() {
    if (this.isLocked()) return 'RÉSEAU RÉACTIVÉ'
    if (this.found >= 3) return 'CONNEXION ÉTABLIE'
    if (this.found === 2) return 'FRÉQUENCE DÉTECTÉE'
    return 'RÉTABLISSEMENT DU SIGNAL'
  }

  private drawTitle(p: HudPainter) {
    const { ctx } = p
    const title = this.titleByCount()
    const x = 190
    // Vertically centered on the UNSTABLE box; underline locked to its bottom edge.
    const midY = STABLE.y + STABLE.h / 2
    const underlineY = STABLE.y + STABLE.h
    const locked = this.isLocked()
    ctx.save()
    ctx.shadowColor = PALETTE.green
    ctx.shadowBlur = 12 + (locked ? 10 + Math.sin(this.now * 18) * 6 : 0)
    ctx.fillStyle = PALETTE.green
    ctx.font = `900 23px ${p.titleFont}`
    ctx.letterSpacing = '1.5px'
    ctx.textAlign = 'left'
    ctx.textBaseline = 'middle'
    // New id per stage so the title re-types when it changes.
    ctx.fillText(p.resolve(title, `s2-title-${locked ? 4 : this.found}`), x, midY)
    ctx.restore()
    // Fixed underline — same length for every title stage.
    p.line(x, underlineY, 460, underlineY, PALETTE.greenFaint)
    p.line(476, underlineY, 503, underlineY, PALETTE.greenFaint)
  }

  /** Bottom rule + footer — thin horizontal slash that grows left→right on boot. */
  private drawBottomBar(p: HudPainter) {
    const pose = p.pose('s2-bottom', BOTTOM)
    if (!pose) return
    const { ctx } = p
    ctx.save()
    ctx.globalAlpha = pose.alpha
    // Line tracks the settling width so it reads as a scan building across.
    const x1 = pose.x
    const x2 = pose.x + pose.w
    p.line(x1, BOTTOM_LINE_Y, x2, BOTTOM_LINE_Y, PALETTE.greenFaint)
    ctx.restore()
    p.inLayout(BOTTOM, pose, () => {
      p.text('SYS_772.9 // RAVE_PROTOCOLE', 31, 461, 5.5, PALETTE.greenDim)
    })
  }

  private drawStable(p: HudPainter) {
    const pose = p.pose('s2-stable', STABLE)
    if (!pose) return
    p.stroke(pose)
    p.inLayout(STABLE, pose, () => {
      const { ctx } = p
      p.line(STABLE_SPLIT_X, STABLE.y, STABLE_SPLIT_X, STABLE.y + STABLE.h, PALETTE.greenFaint)
      const label = this.isLocked() ? 'STABLE' : 'UNSTABLE'
      p.text(label, (STABLE.x + STABLE_SPLIT_X) / 2, 79, 7, PALETTE.green, 'center', 0.5, `s2-stable-${label}`)

      const bars = 9
      const shown = this.boostedAccuracy()
      const lit = Math.round((bars * shown) / 100)
      for (let i = 0; i < bars; i++) {
        const h = 6 + i * 0.6
        ctx.fillStyle = i < lit ? PALETTE.green : `rgba(${PALETTE.greenRgb}, 0.15)`
        ctx.fillRect(108 + i * 4.6, 83 - h, 2.6, h)
      }
    })
  }

  private drawGraph(p: HudPainter) {
    const pose = p.pose('s2-graph', GRAPH)
    if (!pose) return
    p.stroke(pose, 6)
    p.inLayout(GRAPH, pose, () => {
      this.drawGrid(p)
      for (let i = 0; i < 3; i++) this.drawCurve(p, i)
      this.drawParasites(p)
      this.drawAcquireBurst(p)
      this.drawMergedCurve(p)

      const { ctx } = p
      ctx.save()
      ctx.shadowColor = PALETTE.green
      ctx.shadowBlur = 6
      ctx.strokeStyle = PALETTE.green
      ctx.fillStyle = PALETTE.green
      ctx.lineWidth = 0.9
      ctx.beginPath()
      ctx.moveTo(CURSOR_X, GRAPH.y)
      ctx.lineTo(CURSOR_X, GRAPH.y + GRAPH.h)
      ctx.stroke()

      // Gauge ticks — mini triangles pointing inward at both ends of the playhead.
      const tw = 4.5
      const th = 5
      ctx.shadowBlur = 4
      ctx.beginPath()
      ctx.moveTo(CURSOR_X, GRAPH.y + th)
      ctx.lineTo(CURSOR_X - tw, GRAPH.y)
      ctx.lineTo(CURSOR_X + tw, GRAPH.y)
      ctx.closePath()
      ctx.fill()
      ctx.beginPath()
      ctx.moveTo(CURSOR_X, GRAPH.y + GRAPH.h - th)
      ctx.lineTo(CURSOR_X - tw, GRAPH.y + GRAPH.h)
      ctx.lineTo(CURSOR_X + tw, GRAPH.y + GRAPH.h)
      ctx.closePath()
      ctx.fill()
      ctx.restore()
    })
  }

  private drawGrid(p: HudPainter) {
    const { ctx } = p
    const right = GRAPH.x + GRAPH.w
    const bottom = GRAPH.y + GRAPH.h
    ctx.lineWidth = 0.4
    const cols = 32
    for (let i = 1; i < cols; i++) {
      const x = GRAPH.x + (GRAPH.w * i) / cols
      ctx.strokeStyle = i % 4 === 0 ? `rgba(${PALETTE.greenRgb}, 0.16)` : `rgba(${PALETTE.greenRgb}, 0.06)`
      ctx.beginPath()
      ctx.moveTo(x, GRAPH.y)
      ctx.lineTo(x, bottom)
      ctx.stroke()
    }
    const rows = 16
    for (let i = 1; i < rows; i++) {
      const y = GRAPH.y + (GRAPH.h * i) / rows
      ctx.strokeStyle = i % 4 === 0 ? `rgba(${PALETTE.greenRgb}, 0.16)` : `rgba(${PALETTE.greenRgb}, 0.06)`
      ctx.beginPath()
      ctx.moveTo(GRAPH.x, y)
      ctx.lineTo(right, y)
      ctx.stroke()
    }
  }

  private drawCurve(p: HudPainter, index: number) {
    const revealAt = this.revealAt[index]!
    const now = p.time()
    if (now < revealAt) return

    const curve = CURVES[index]!
    const { ctx } = p
    const clock = now - revealAt
    const r = Math.min(1, clock / REVEAL_DURATION)
    const revealEase = 1 - (1 - r) * (1 - r) * (1 - r)
    const left = GRAPH.x
    const right = GRAPH.x + GRAPH.w
    // Trace is acquired from the right edge inward.
    const x0 = left + GRAPH.w * (1 - revealEase)
    const t = this.raveTime(now)
    const rave = this.raveAt !== null && t >= 0
    // Handoff: the single merged trace takes over once the rhythms are locked.
    const handoff = rave ? smoothstep(RAVE.sync, RAVE.sync + 0.1, t) : 0
    if (handoff >= 1) return
    const acqT = this.acquireTime(now)
    const acquiring = acqT >= 0 && acqT < ACQUIRE.duration
    const acqVibrate = acquiring ? smoothstep(0, ACQUIRE.vibrate, acqT) * (1 - smoothstep(0.45, 0.85, acqT)) : 0
    const isNew = acquiring && index === this.acquireIndex
    const vibrate = (rave ? smoothstep(0, RAVE.vibrate, t) : 0) + acqVibrate
    const converge = rave ? easeInOutCubic(clamp01((t - RAVE.vibrate) / (RAVE.converge - RAVE.vibrate))) : 0
    const sync = rave ? easeInOutCubic(clamp01((t - RAVE.converge) / (RAVE.sync - RAVE.converge))) : 0

    const flicker = (r < 1 && Math.random() < 0.2 ? 0.4 : 1) * (1 - handoff)
    const pulse = Math.max(p.pulse(), acqVibrate * 0.9)
    const lane = this.laneY[index]!
    // Converge leaves ~20% of the gap + a loose wobble; sync closes it.
    const wobble = Math.sin(now * 5.3 + index * 2.1) * 7 * converge
    const baseY = MERGED_Y + ((lane - MERGED_Y) * (1 - 0.8 * converge) + wobble) * (1 - sync)
    const ampBoost = 1 + vibrate * 0.35 + (isNew ? (1 - r) * 0.55 : 0)
    const color = sync > 0 ? mixHex(curve.color, PALETTE.green, sync) : curve.color

    // Chart position under screen x — a note at `at` sits on the cursor when
    // songTime === at (music clock). Falls back to reveal-local clock before audio.
    const scrollClock = this.songTime ?? clock
    const wxAt = (sx: number) => scrollClock * SCROLL_SPEED + (sx - CURSOR_X)
    // Shared beat clock — identical for the three traces and the merged one.
    const syncWxAt = (sx: number) => t * SCROLL_SPEED + (sx - CURSOR_X)
    const peakFor = (sx: number, wx: number) => {
      const own =
        peakAt(wx, curve, now, (noteAt, chartTime) =>
          this.hitDamp(index, noteAt, chartTime),
        ) * ampBoost
      if (sync <= 0) return own
      return own * (1 - sync) + peakAt(syncWxAt(sx), SYNC_CURVE, now) * sync
    }
    /** Nervous high-frequency tremble while the network wakes up. */
    const shakeAt = (wx: number) =>
      vibrate > 0
        ? vibrate *
          (1 - sync * 0.6) *
          (Math.sin(wx * 3.3 + now * 61 + curve.seed) * 2.2 +
            Math.sin(wx * 1.1 - now * 37 + curve.seed * 2) * 1.4)
        : 0
    const yAt = (wx: number, peak: number) =>
      baseY - baselineAt(wx, curve.seed, now) - shakeAt(wx) - peak
    const step = 0.75

    ctx.save()
    ctx.beginPath()
    ctx.rect(x0, GRAPH.y, right - x0, GRAPH.h)
    ctx.clip()
    ctx.strokeStyle = color
    ctx.shadowColor = color
    ctx.lineJoin = 'round'
    ctx.lineCap = 'round'

    // Flat carrier line + note peaks in one trace — hotter while vibrating / acquiring.
    ctx.globalAlpha = Math.min(1, 0.55 + pulse * 0.3 + vibrate * 0.35 + (isNew ? 0.25 : 0)) * flicker
    ctx.lineWidth = 0.8 + pulse * 0.4 + vibrate * 0.5 + (isNew ? 0.6 : 0)
    ctx.shadowBlur = 3 + pulse * 6 + vibrate * 8 + (isNew ? 14 : 0)
    ctx.beginPath()
    for (let sx = x0; sx <= right; sx += step) {
      const wx = wxAt(sx)
      const y = yAt(wx, peakFor(sx, wx))
      if (sx === x0) ctx.moveTo(sx, y)
      else ctx.lineTo(sx, y)
    }
    ctx.stroke()

    // Peaks redrawn bright; the one crossing the cursor flares (hit window).
    ctx.globalAlpha = flicker
    let path: { x: number; y: number }[] = []
    const flush = () => {
      if (path.length < 2) {
        path = []
        return
      }
      const mid = path[Math.floor(path.length / 2)]!.x
      const span = path[path.length - 1]!.x - path[0]!.x
      const hit = Math.max(0, 1 - Math.abs(mid - CURSOR_X) / (span * 0.5 + 6))
      ctx.lineWidth = 1.1 + hit * 0.8 + pulse * 0.5 + vibrate * 0.4
      ctx.shadowBlur = 8 + hit * 16 + pulse * 10 + vibrate * 10
      ctx.beginPath()
      ctx.moveTo(path[0]!.x, path[0]!.y)
      for (let i = 1; i < path.length; i++) ctx.lineTo(path[i]!.x, path[i]!.y)
      ctx.stroke()
      path = []
    }
    for (let sx = x0; sx <= right; sx += step) {
      const wx = wxAt(sx)
      const peak = peakFor(sx, wx)
      if (peak === 0) {
        flush()
        continue
      }
      path.push({ x: sx, y: yAt(wx, peak) })
    }
    flush()
    ctx.restore()
  }

  /** After sync: one neon trace on the shared beat, hit by a single giant surge. */
  private drawMergedCurve(p: HudPainter) {
    const now = p.time()
    const t = this.raveTime(now)
    if (this.raveAt === null || t < RAVE.sync) return
    const { ctx } = p
    const left = GRAPH.x
    const right = GRAPH.x + GRAPH.w
    const step = 0.75
    const fadeIn = smoothstep(RAVE.sync, RAVE.sync + 0.1, t)
    const grow = 1 + (MERGED_AMP - 1) * smoothstep(RAVE.sync, RAVE.lock, t)
    // Age of the live merged signal — drives generative evolution (not a Y bounce).
    const live = Math.max(0, t - RAVE.sync)

    // Surge: one huge packet crossing right → left.
    const s = clamp01((t - RAVE.sync) / SURGE_DURATION)
    const surging = s > 0 && s < 1
    const surgeX = right + 60 - (GRAPH.w + 120) * easeInOutCubic(s)
    const surgeAmp = SURGE_AMP * smoothstep(0, 0.12, s) * (1 - smoothstep(0.85, 1, s))
    const surgeAt = (sx: number) => {
      if (!surging) return 0
      const d = sx - surgeX
      return Math.exp(-((d / 26) ** 2)) * Math.sin(d * 0.3) * surgeAmp
    }

    const swell = smoothstep(RAVE.sync, RAVE.lock + 0.5, t)
    // Crossfade: brief lock phrase → generative evolving signal.
    const evolve = smoothstep(0.35, 1.1, live)
    // Music kick: the whole line shudders and the peaks pump on each beat.
    const kick = this.beat
    const shudder = (sx: number) =>
      kick > 0.01
        ? kick * (Math.sin(sx * 0.85 + now * 73) * 5 + Math.sin(sx * 0.31 - now * 41) * 3.5)
        : 0
    const yAt = (sx: number) => {
      // Locked phrase still uses chart scroll; live techno runs on the fast rail.
      const wxLock = t * SCROLL_SPEED + (sx - CURSOR_X)
      const wxLive = t * RAVE_SCROLL + (sx - CURSOR_X)
      const locked = peakAt(wxLock, SYNC_CURVE, now) * 1.35
      const evolving = evolvingPeakAt(wxLive, live)
      const peak = (locked * (1 - evolve) + evolving * evolve) * grow * (1 + kick * 0.45)
      return (
        MERGED_Y -
        baselineAt(wxLive, SYNC_CURVE.seed, now) * (0.8 + evolve * 0.4) -
        carrierAt(wxLive, now) * swell * (0.5 + evolve * 0.6) -
        peak -
        surgeAt(sx) -
        shudder(sx)
      )
    }

    ctx.save()
    ctx.beginPath()
    ctx.rect(left, GRAPH.y, GRAPH.w, GRAPH.h)
    ctx.clip()
    ctx.lineJoin = 'round'
    ctx.lineCap = 'round'

    const hot = surging ? Math.sin(Math.PI * s) : 0
    // Soft energy glow — follows the generative density, not a looping Y scale.
    const densityGlow = 0.5 + 0.5 * Math.sin(live * 0.07)

    // Wide halo pass, then a hot white-green core.
    for (const pass of [
      { color: PALETTE.green, width: 4.2 + hot * 2.5 + kick * 1.5, blur: 22 + densityGlow * 12 + hot * 18 + kick * 14, alpha: 0.4 },
      { color: PALETTE.greenCore, width: 1.8 + hot * 1.4 + kick * 0.8, blur: 10 + densityGlow * 8 + hot * 22 + kick * 10, alpha: 1 },
    ]) {
      ctx.globalAlpha = pass.alpha * fadeIn
      ctx.strokeStyle = pass.color
      ctx.shadowColor = PALETTE.green
      ctx.shadowBlur = pass.blur
      ctx.lineWidth = pass.width
      ctx.beginPath()
      for (let sx = left; sx <= right; sx += step) {
        const y = yAt(sx)
        if (sx === left) ctx.moveTo(sx, y)
        else ctx.lineTo(sx, y)
      }
      ctx.stroke()
    }

    // Playhead dot riding the trace on the cursor — flares on each hit.
    const cy = yAt(CURSOR_X)
    const hit = clamp01(Math.abs(cy - MERGED_Y) / 30)
    const r = 3 + hit * 4
    const dot = ctx.createRadialGradient(CURSOR_X, cy, 0, CURSOR_X, cy, r * 3)
    dot.addColorStop(0, `rgba(255, 255, 255, ${fadeIn})`)
    dot.addColorStop(0.3, withAlpha(PALETTE.green, 0.8 * fadeIn))
    dot.addColorStop(1, withAlpha(PALETTE.green, 0))
    ctx.globalAlpha = 1
    ctx.shadowBlur = 0
    ctx.fillStyle = dot
    ctx.beginPath()
    ctx.arc(CURSOR_X, cy, r * 3, 0, Math.PI * 2)
    ctx.fill()

    // Vertical shock front riding with the surge.
    if (surging && surgeX > left && surgeX < right) {
      const scan = ctx.createLinearGradient(0, GRAPH.y, 0, GRAPH.y + GRAPH.h)
      scan.addColorStop(0, withAlpha(PALETTE.green, 0))
      scan.addColorStop(0.5, withAlpha(PALETTE.green, 0.6 * hot))
      scan.addColorStop(1, withAlpha(PALETTE.green, 0))
      ctx.globalAlpha = 1
      ctx.strokeStyle = scan
      ctx.shadowBlur = 12
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(surgeX, GRAPH.y)
      ctx.lineTo(surgeX, GRAPH.y + GRAPH.h)
      ctx.stroke()
    }
    ctx.restore()
  }

  /** Static bursts — rave wake-up or signal acquire. */
  private drawParasites(p: HudPainter) {
    const now = p.time()
    const t = this.raveTime(now)
    const a = this.acquireTime(now)
    const raveLvl =
      this.raveAt !== null && t >= 0
        ? smoothstep(0.05, 0.3, t) * (1 - smoothstep(RAVE.converge + 0.2, RAVE.sync, t))
        : 0
    const acqLvl =
      a >= 0 ? smoothstep(0.02, 0.18, a) * (1 - smoothstep(0.55, 0.95, a)) : 0
    const level = Math.max(raveLvl, acqLvl)
    if (level <= 0.01 || Math.random() > 0.3 + level * 0.55) return
    const { ctx } = p
    const count = 1 + Math.floor(Math.random() * (2 + 4 * level))
    const newColor = CURVES[this.acquireIndex]?.color
    ctx.save()
    ctx.lineWidth = 0.6
    for (let i = 0; i < count; i++) {
      const lane = this.laneY[Math.floor(Math.random() * this.found)] ?? MERGED_Y
      const y = lane + (Math.random() - 0.5) * (36 + level * 20)
      const x = GRAPH.x + Math.random() * (GRAPH.w - 60)
      const w = 12 + Math.random() * (50 + level * 40)
      const color =
        acqLvl > 0.2 && newColor && Math.random() < 0.45
          ? newColor
          : Math.random() < 0.3
            ? '#ffffff'
            : CURVES[Math.floor(Math.random() * 3)]!.color
      ctx.globalAlpha = (0.35 + Math.random() * 0.5) * level
      ctx.strokeStyle = color
      ctx.shadowColor = color
      ctx.shadowBlur = 6
      ctx.beginPath()
      ctx.moveTo(x, y)
      for (let px = x; px < x + w; px += 3) ctx.lineTo(px, y + (Math.random() - 0.5) * (4 + 12 * level))
      ctx.stroke()
    }
    if (Math.random() < 0.3 * level) {
      ctx.globalAlpha = 0.28 * level
      ctx.strokeStyle = PALETTE.green
      ctx.shadowBlur = 0
      const y = GRAPH.y + Math.random() * GRAPH.h
      ctx.beginPath()
      ctx.moveTo(GRAPH.x, y)
      ctx.lineTo(GRAPH.x + GRAPH.w, y)
      ctx.stroke()
    }
    ctx.restore()
  }

  /** Reveal-front scan + lane shockwave when a new signal locks in. */
  private drawAcquireBurst(p: HudPainter) {
    const now = p.time()
    const a = this.acquireTime(now)
    if (a < 0 || a >= ACQUIRE.duration) return
    const { ctx } = p
    const color = CURVES[this.acquireIndex]?.color ?? PALETTE.green
    const reveal = Math.min(1, a / REVEAL_DURATION)
    const revealEase = 1 - (1 - reveal) * (1 - reveal) * (1 - reveal)
    const front = GRAPH.x + GRAPH.w * (1 - revealEase)
    const head = reveal < 1 ? Math.sin(Math.PI * reveal) : 0
    const lane = this.laneY[this.acquireIndex] ?? MERGED_Y

    ctx.save()
    ctx.beginPath()
    ctx.rect(GRAPH.x, GRAPH.y, GRAPH.w, GRAPH.h)
    ctx.clip()

    // Vertical acquisition front sweeping right → left with the new trace.
    if (head > 0.02) {
      const scan = ctx.createLinearGradient(0, GRAPH.y, 0, GRAPH.y + GRAPH.h)
      scan.addColorStop(0, withAlpha(color, 0))
      scan.addColorStop(0.5, withAlpha(color, 0.55 * head))
      scan.addColorStop(1, withAlpha(color, 0))
      ctx.strokeStyle = scan
      ctx.shadowColor = color
      ctx.shadowBlur = 14
      ctx.lineWidth = 1.2
      ctx.beginPath()
      ctx.moveTo(front, GRAPH.y)
      ctx.lineTo(front, GRAPH.y + GRAPH.h)
      ctx.stroke()

      const r = 6 + head * 8
      const glow = ctx.createRadialGradient(front, lane, 0, front, lane, r * 3)
      glow.addColorStop(0, `rgba(255, 255, 255, ${head})`)
      glow.addColorStop(0.3, withAlpha(color, 0.85 * head))
      glow.addColorStop(1, withAlpha(color, 0))
      ctx.shadowBlur = 0
      ctx.fillStyle = glow
      ctx.beginPath()
      ctx.arc(front, lane, r * 3, 0, Math.PI * 2)
      ctx.fill()
    }

    // Expanding ripple on the playhead when the front crosses it.
    const cross = 1 - Math.abs(front - CURSOR_X) / 40
    if (cross > 0) {
      const ring = 8 + (1 - cross) * 50
      ctx.strokeStyle = withAlpha(color, 0.55 * cross)
      ctx.shadowColor = color
      ctx.shadowBlur = 10
      ctx.lineWidth = 1.4
      ctx.beginPath()
      ctx.arc(CURSOR_X, lane, ring, 0, Math.PI * 2)
      ctx.stroke()
    }

    // Soft wash in the new signal's color at flash beat.
    const flash = this.flashLevel(now)
    if (flash > 0.05) {
      ctx.fillStyle = withAlpha(color, flash * 0.12)
      ctx.shadowBlur = 0
      ctx.fillRect(GRAPH.x, GRAPH.y, GRAPH.w, GRAPH.h)
    }
    ctx.restore()
  }

  private drawCount(p: HudPainter) {
    const pose = p.pose('s2-count', COUNT)
    if (!pose) return
    p.stroke(pose)
    p.inLayout(COUNT, pose, () => {
      const rave = this.isLocked()
      p.text(
        rave ? 'NETWORK // ONLINE' : `${this.found}/3 // SIGNALS`,
        COUNT.x + COUNT.w / 2,
        COUNT.y + COUNT.h / 2 + 2.5,
        7.5,
        rave ? PALETTE.green : PALETTE.greenDim,
        'center',
        1,
        rave ? 's2-count-online' : 's2-count',
        rave,
      )
    })
  }

  private drawAccuracy(p: HudPainter) {
    const pose = p.pose('s2-acc', ACCURACY)
    if (!pose) return
    p.stroke(pose, 6)
    p.inLayout(ACCURACY, pose, () => {
      const { ctx } = p
      const headerY = ACCURACY.y + ACCURACY_HEADER_H
      p.line(ACCURACY.x, headerY, ACCURACY.x + ACCURACY.w, headerY, PALETTE.greenFaint)
      p.text('ACCURACY', ACCURACY.x + ACCURACY.w / 2, ACCURACY.y + 22, 8, PALETTE.greenDim, 'center', 1.5)

      const cx = ACCURACY.x + ACCURACY.w / 2
      const cy = headerY + (ACCURACY.h - ACCURACY_HEADER_H) / 2
      const radius = 44
      const shown = this.boostedAccuracy()
      const rave = this.raveLevel() > 0
      const holding = !rave && this.accuracyHold > 0
      // Pulses faster as the hold nears completion.
      const holdPulse = holding ? 0.5 + 0.5 * Math.sin(this.now * (8 + this.accuracyHold * 16)) : 0
      const glow = Math.max(0, (shown - this.accuracy) / 98, holding ? this.accuracyHold * (0.5 + 0.5 * holdPulse) : 0)
      const start = -Math.PI / 2
      ctx.save()
      ctx.lineWidth = 8
      ctx.strokeStyle = `rgba(${PALETTE.greenRgb}, 0.1)`
      ctx.beginPath()
      ctx.arc(cx, cy, radius, 0, Math.PI * 2)
      ctx.stroke()
      ctx.strokeStyle = PALETTE.green
      ctx.shadowColor = PALETTE.green
      ctx.shadowBlur = 8 + glow * 14
      ctx.lineWidth = 8 + glow * 2
      ctx.beginPath()
      ctx.arc(cx, cy, radius, start, start + (Math.PI * 2 * shown) / 100)
      ctx.stroke()

      if (!rave && this.accuracyThreshold > 0) {
        // Target tick across the ring.
        const a = start + (Math.PI * 2 * this.accuracyThreshold) / 100
        ctx.shadowBlur = 0
        ctx.lineWidth = 1.5
        ctx.strokeStyle = shown >= this.accuracyThreshold ? PALETTE.green : PALETTE.greenDim
        ctx.beginPath()
        ctx.moveTo(cx + Math.cos(a) * (radius - 7), cy + Math.sin(a) * (radius - 7))
        ctx.lineTo(cx + Math.cos(a) * (radius + 7), cy + Math.sin(a) * (radius + 7))
        ctx.stroke()
      }

      if (holding) {
        // Outer hold arc: fills while the target accuracy is kept.
        ctx.shadowBlur = 6 + holdPulse * 8
        ctx.lineWidth = 2
        ctx.strokeStyle = PALETTE.green
        ctx.beginPath()
        ctx.arc(cx, cy, radius + 10, start, start + Math.PI * 2 * this.accuracyHold)
        ctx.stroke()
      }
      ctx.restore()

      ctx.fillStyle = PALETTE.green
      ctx.font = `15px ${p.monoFont}`
      ctx.letterSpacing = '0px'
      ctx.textAlign = 'center'
      ctx.fillText(`${Math.round(shown)}%`, cx, cy + 5)
    })
  }

  private drawIncoming(p: HudPainter) {
    const pose = p.pose('s2-incoming', INCOMING)
    if (!pose) return
    p.stroke(pose)
    p.inLayout(INCOMING, pose, () => {
      const { ctx } = p
      p.line(INCOMING_SPLIT_X, INCOMING.y, INCOMING_SPLIT_X, INCOMING.y + INCOMING.h, PALETTE.greenFaint)
      const sq = 5
      const gap = 3.5
      const total = sq * 3 + gap * 2
      const sx = INCOMING.x + (INCOMING_SPLIT_X - INCOMING.x - total) / 2
      const sy = INCOMING.y + (INCOMING.h - sq) / 2
      ctx.lineWidth = 0.7
      for (let i = 0; i < 3; i++) {
        const x = sx + i * (sq + gap)
        if (i < this.found) {
          ctx.fillStyle = PALETTE.green
          ctx.fillRect(x, sy, sq, sq)
        }
        ctx.strokeStyle = i < this.found ? PALETTE.green : PALETTE.greenDim
        ctx.strokeRect(x, sy, sq, sq)
      }
      const online = this.isLocked()
      p.text(
        online ? 'SIGNAL_SYNCED' : 'SIGNAL_INCOMING...',
        INCOMING_SPLIT_X + 7,
        INCOMING.y + 12.5,
        5.5,
        online ? PALETTE.green : PALETTE.greenDim,
        'left',
        1,
        online ? 's2-incoming-online' : undefined,
      )
    })
  }
}
