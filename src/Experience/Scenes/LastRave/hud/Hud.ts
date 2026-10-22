import { CanvasTexture, SRGBColorSpace } from 'three'
import { DESIGN, PALETTE } from '../layout'
import { FLUID_PRESETS, MeterFluid, type MeterFluidParams } from './meterFluid'
import { HUD_MODULES, SIGNAL_MODULES, type HudModule, type ModuleId } from './modules'
import {
  CHROME_BAR,
  CHROME_ID,
  CHROME_SPLIT_X,
  SIGNAL_BIG_PANELS,
  SIGNAL_LAYOUT,
  SignalScreen,
  type HudPainter,
} from './signalScreen'

export type HudScreen = 'intro' | 'signal' | 'outro' | 'end'

/** Signal screen stays on the merged trace this long after « RÉSEAU RÉACTIVÉ ». */
const OUTRO_HOLD = 4
const OUTRO_LINES = ['LA FÊTE', "N'EST PAS MORTE"]
/** Pause before the first glyph, type speed (chars/s), hold once fully written. */
const OUTRO_TYPE_DELAY = 0.2
const OUTRO_TYPE_RATE = 20
const OUTRO_TEXT_HOLD = 1
/** Arrival glitch length / exit glitch length (s). */
const OUTRO_GLITCH_IN = 0.6
const OUTRO_GLITCH_OUT = 0.18

const TEXTURE_WIDTH = 2048
const TITLE_FONT = 'Orbitron'
const MONO_FONT = '"Share Tech Mono"'
const ANIM_DURATION = 1.35
/** Short punchy burst when a fluid panel is triggered. */
const FLUID_BURST_DURATION = 0.65
/** Scramble alphabet for digital type-in (hex / terminal junk). */
const TYPE_SCRAMBLE = '01ABCDEF#$%<>/|*+=─█▓░ЖХ¤'

type ModuleAnim = {
  elapsed: number
  duration: number
}

type Rect = { x: number; y: number; w: number; h: number }

type LayoutBootState = {
  startAt: number
  duration: number
  seed: number
  /** Misaligned spawn offset — snaps in like a bad packet. */
  ox: number
  oy: number
  /** Primary open axis — horizontal slash or vertical beam. */
  axis: 'h' | 'v'
  /** Reverse playback — the panel deconstructs and stays hidden once done. */
  out?: boolean
}

type LayoutPose = Rect & {
  alpha: number
  /** 0..1 settle progress after start. */
  t: number
  contentAlpha: number
  /** Horizontal ghost offset while materializing. */
  glitch: number
}

type LayoutPiece = Rect & {
  id: string
  corner?: number
}

type GaugeState = {
  value: number
  target: number
  speed: number
}

type ReadoutState = {
  value: number
  /** Seconds until the next random jump. */
  nextIn: number
}

type TypewriteState = {
  /** Absolute meterTime when this line begins writing. */
  startAt: number
  /** Characters unlocked per second. */
  rate: number
}

export async function loadHudFonts() {
  await Promise.all([
    document.fonts.load(`900 48px ${TITLE_FONT}`),
    document.fonts.load(`16px ${MONO_FONT}`),
  ])
}

export class Hud {
  readonly canvas = document.createElement('canvas')
  readonly texture: CanvasTexture
  private readonly ctx: CanvasRenderingContext2D
  private readonly scale = TEXTURE_WIDTH / DESIGN.width
  private readonly anims = new Map<ModuleId, ModuleAnim>()
  /** One fluid field + params per panel (each bound by its own Tweakpane folder). */
  private readonly fluids = new Map<
    ModuleId,
    { field: MeterFluid; timeOffset: number; params: MeterFluidParams; label: string }
  >([
    [
      'left-meter',
      {
        field: new MeterFluid(64, 176),
        timeOffset: 0,
        params: { ...FLUID_PRESETS.meter },
        label: 'Meter',
      },
    ],
    [
      'left-protocol-a',
      {
        field: new MeterFluid(40, 52),
        timeOffset: 19.4,
        params: { ...FLUID_PRESETS.protocolA },
        label: 'Protocol A',
      },
    ],
    [
      'right-b',
      {
        field: new MeterFluid(72, 72),
        timeOffset: 37.1,
        params: { ...FLUID_PRESETS.cellB },
        label: 'Cell B',
      },
    ],
    [
      's2-small-a',
      {
        field: new MeterFluid(72, 72),
        timeOffset: 51.8,
        params: { ...FLUID_PRESETS.cellB },
        label: 'Signal Fluid',
      },
    ],
  ])
  private meterTime = 0
  /** Per-line glitch timers — each phrase fires on its own, never in sync. */
  private readonly textGlitches = new Map<
    string,
    { nextAt: number; until: number; display: string }
  >()
  /** Digital type-in per phrase — scramble then lock left→right. */
  private readonly typewrites = new Map<string, TypewriteState>()
  /** Extra delay budget so lines don't all boot in sync. */
  private typewriteSeq = 0
  /** Per-rect boot — expand / glitch / snap into the HUD grid. */
  private readonly layoutBoot = new Map<string, LayoutBootState>()
  /** Integrated phase per panel — boost changes speed, never teleports the pattern. */
  private readonly motionPhase = new Map<ModuleId, number>()
  /** Off = black screen behind the poster; on = full HUD boot. */
  private powered = false
  private readonly gauges: GaugeState[] = [
    { value: 0.5, target: 0.5, speed: 0.08 },
    { value: 0.22, target: 0.22, speed: 0.06 },
  ]
  private gaugeBoost: ModuleAnim | null = null
  private readonly signal: GaugeState = { value: 82, target: 82, speed: 12 }
  private readonly freq: ReadoutState = { value: 143.7, nextIn: 0.25 }
  /** REC indicator — irregular on/off blink. */
  private recLit = true
  private recNextFlipAt = 0.4
  /** Top-left status dots — each blinks on its own schedule. */
  private readonly statusDots = [
    { lit: true, nextFlipAt: 0.2 },
    { lit: true, nextFlipAt: 0.55 },
    { lit: true, nextFlipAt: 0.9 },
  ]
  private screen: HudScreen = 'intro'
  private readonly signalScreen = new SignalScreen()
  /** Global overdrive when a new signal is found — opacity / gauges / glitch spike. */
  private signalPulse: ModuleAnim | null = null
  /** Screen swap waiting for the old inner panels to finish deconstructing. */
  private pendingSwitch: { screen: HudScreen; count: number; at: number } | null = null
  /** Big centered title after the signal screen tears down — then black. */
  private outro: { startAt: number; endAt: number } | null = null
  private readonly painter: HudPainter

  /** Params per fluid panel, for Tweakpane. */
  getFluidParams(): { id: ModuleId; label: string; params: MeterFluidParams }[] {
    return [...this.fluids.entries()].map(([id, entry]) => ({
      id,
      label: entry.label,
      params: entry.params,
    }))
  }

  constructor() {
    this.canvas.width = TEXTURE_WIDTH
    this.canvas.height = Math.round(DESIGN.height * this.scale)
    this.ctx = this.canvas.getContext('2d')!
    this.texture = new CanvasTexture(this.canvas)
    this.texture.colorSpace = SRGBColorSpace
    this.painter = {
      ctx: this.ctx,
      time: () => this.meterTime,
      pose: (id, final) => this.poseOf(id, final),
      stroke: (pose, corner) => this.strokeLayout(pose, corner),
      inLayout: (final, pose, draw) => this.inLayout(final, pose, draw),
      text: (...args) => this.text(...args),
      resolve: (value, id) => this.resolveText(value, id),
      line: (x1, y1, x2, y2, color) => this.line(x1, y1, x2, y2, color),
      statusLit: (index) => this.statusDots[index]?.lit ?? true,
      liveLit: () => this.recLit,
      pulse: () => this.signalPulse01(),
      titleFont: TITLE_FONT,
      monoFont: MONO_FONT,
    }
  }

  get isPowered() {
    return this.powered
  }

  get currentScreen() {
    return this.screen
  }

  /** Globe only lives on the settled intro screen (hidden while panels swap). */
  get showsGlobe() {
    return this.powered && this.screen === 'intro' && !this.pendingSwitch
  }

  get signalsFound() {
    return this.signalScreen.count
  }

  /** Bind the playable chart to the signal graph (peaks = notes). */
  setRhythmChart(notes: { time: number; lane: number }[], loopDuration: number) {
    this.signalScreen.setChart(notes, loopDuration)
  }

  /** Keep the graph locked to the AudioEngine song clock. */
  setRhythmSongTime(songTime: number | null) {
    this.signalScreen.setSongTime(songTime)
  }

  /** Visual feedback: collapse the peak for a caught note. */
  registerRhythmHit(lane: number, noteTime: number, absSongTime: number) {
    this.signalScreen.registerHit(lane, noteTime, absSongTime)
  }

  /**
   * 0 = back to the intro screen; 1..3 = objects found; 4 = network reactivated. The first
   * object swaps to the signal screen (layout re-boot), each next one unlocks one more trace.
   */
  setSignalStage(count: number) {
    const target: HudScreen = count > 0 ? 'signal' : 'intro'
    const n = Math.max(0, count)

    // Leaving the outro / black end: full reboot, chrome included.
    if (this.screen === 'outro' || this.screen === 'end' || this.pendingSwitch?.screen === 'outro') {
      this.pendingSwitch = null
      this.outro = null
      this.signalScreen.setFound(0, this.meterTime)
      this.screen = target
      if (this.powered) {
        this.armLayoutBoot()
        this.triggerTexts()
      }
      this.applySignalCount(n, 0.6)
      return
    }

    if (this.pendingSwitch) {
      this.pendingSwitch.screen = target
      this.pendingSwitch.count = n
      return
    }

    if (target === this.screen) {
      this.applySignalCount(n, 0)
      return
    }

    // Still booting (or off): swap straight away, no teardown of a half-built layout.
    if (!this.powered || this.isLayoutBooting()) {
      this.screen = target
      if (this.powered) {
        this.armLayoutBoot()
        this.triggerTexts()
      }
      this.applySignalCount(n, 0.6)
      return
    }

    // Inner panels deconstruct, then the next screen's panels build — frame + chrome stay put.
    const outDuration = this.armLayoutTeardown()
    this.pendingSwitch = { screen: target, count: n, at: this.meterTime + outDuration }
  }

  private applySignalCount(count: number, firstDelay: number) {
    const prev = this.signalScreen.count
    this.signalScreen.setFound(count, this.meterTime, firstDelay)
    // Each newly found object fires a global overdrive pulse.
    if (count > prev && count <= 3) {
      this.trigger('s2-small-a')
      this.trigger('s2-small-b')
      // Longer overdrive — matches the acquire burst on the graph.
      this.signalPulse = { elapsed: 0, duration: 1.15 }
    } else if (count > prev) {
      this.trigger('s2-small-a')
      this.trigger('s2-small-b')
      this.armFramePulse()
    }
  }

  private finishScreenSwitch() {
    const pending = this.pendingSwitch
    if (!pending) return
    this.pendingSwitch = null
    this.screen = pending.screen
    if (pending.screen === 'outro') {
      this.layoutBoot.clear()
      const chars = OUTRO_LINES.join('').length
      const startAt = this.meterTime
      this.outro = {
        startAt,
        endAt: startAt + OUTRO_TYPE_DELAY + chars / OUTRO_TYPE_RATE + OUTRO_TEXT_HOLD,
      }
      return
    }
    this.armLayoutBoot(true)
    this.triggerTexts()
    this.applySignalCount(pending.count, 0.55)
  }

  /** Everything on the signal screen deconstructs (frame + top bar too), then the outro title. */
  private startOutro() {
    const outDuration = this.armLayoutTeardown(true)
    this.pendingSwitch = { screen: 'outro', count: 4, at: this.meterTime + outDuration + 0.25 }
  }

  private isLayoutBooting() {
    for (const boot of this.layoutBoot.values()) {
      if (!boot.out && this.meterTime < boot.startAt + boot.duration) return true
    }
    return false
  }

  /** Fast attack → short peak → decay for the global signal overdrive. */
  private signalPulse01() {
    return this.burstEnvelope(this.signalPulse)
  }

  /** Soft frame brighten used on both screens when something boosts. */
  private armFramePulse() {
    this.signalPulse = { elapsed: 0, duration: 0.8 }
  }

  /** Switch the screen on (layout boot + type-in) or back to black. */
  setPowered(on: boolean) {
    if (on === this.powered) return
    this.powered = on
    if (on) {
      this.armLayoutBoot()
      this.triggerTexts()
    } else {
      this.layoutBoot.clear()
      this.anims.clear()
      this.gaugeBoost = null
      this.screen = 'intro'
      this.pendingSwitch = null
      this.outro = null
      this.signalScreen.setFound(0, this.meterTime)
    }
    this.draw()
  }

  trigger(id: ModuleId) {
    const kind =
      HUD_MODULES.find((module) => module.id === id)?.kind ??
      SIGNAL_MODULES.find((module) => module.id === id)?.kind
    const duration =
      kind === 'fluid' || kind === 'spokes' || kind === 'wires' || kind === 'points'
        ? FLUID_BURST_DURATION
        : ANIM_DURATION
    this.anims.set(id, { elapsed: 0, duration })
    this.armFramePulse()
  }

  /** Same short burst envelope as the HUD frames — fills both gauges to max. */
  triggerGauges() {
    this.gaugeBoost = { elapsed: 0, duration: FLUID_BURST_DURATION }
    this.armFramePulse()
  }

  /** Restart digital type-in on all HUD phrases (bug re-boot). */
  triggerTexts() {
    this.typewrites.clear()
    this.typewriteSeq = 0
  }

  /** Rebuild the green grid — rectangles materialize with a hacker boot glitch. */
  triggerLayout() {
    if (!this.powered) {
      this.setPowered(true)
      return
    }
    this.armLayoutBoot()
    this.triggerTexts()
  }

  update(dt: number) {
    this.meterTime += dt
    if (!this.powered) return
    this.signalScreen.update(dt, this.meterTime)
    this.updateGauges(dt)
    this.driftGauge(this.signal, dt, 65, 99, 0.4, 8, 22)
    this.tickReadout(this.freq, dt, 110, 170)
    this.updateRecBlink()
    this.updateStatusDots()

    for (const [id, anim] of this.anims) {
      anim.elapsed += dt
      if (anim.elapsed >= anim.duration) this.anims.delete(id)
    }

    if (this.gaugeBoost) {
      this.gaugeBoost.elapsed += dt
      if (this.gaugeBoost.elapsed >= this.gaugeBoost.duration) this.gaugeBoost = null
    }

    if (this.signalPulse) {
      this.signalPulse.elapsed += dt
      if (this.signalPulse.elapsed >= this.signalPulse.duration) this.signalPulse = null
    }

    if (this.pendingSwitch && this.meterTime >= this.pendingSwitch.at) this.finishScreenSwitch()

    if (
      this.screen === 'signal' &&
      !this.pendingSwitch &&
      this.signalScreen.lockedFor(this.meterTime) >= OUTRO_HOLD
    ) {
      this.startOutro()
    }
    if (this.screen === 'outro' && this.outro && this.meterTime >= this.outro.endAt) {
      this.screen = 'end'
      this.outro = null
    }

    this.advanceMotion(dt)

    // Fluid panels + gauges are always live.
    this.draw()
  }

  private updateRecBlink() {
    if (this.meterTime < this.recNextFlipAt) return
    this.recLit = !this.recLit
    // Uneven cadence: longer on, shorter/jittery off (recording feel).
    this.recNextFlipAt =
      this.meterTime +
      (this.recLit ? 0.35 + Math.random() * 0.9 : 0.05 + Math.random() * 0.22)
  }

  private updateStatusDots() {
    for (const dot of this.statusDots) {
      if (this.meterTime < dot.nextFlipAt) continue
      dot.lit = !dot.lit
      dot.nextFlipAt =
        this.meterTime +
        (dot.lit ? 0.4 + Math.random() * 1.2 : 0.06 + Math.random() * 0.28)
    }
  }

  /**
   * Digital type-in: left→right unlock with a short scramble trail.
   * Returns '' before startAt so lines appear to boot in.
   */
  private typewriteText(value: string, id: string): string {
    let state = this.typewrites.get(id)
    if (!state) {
      const stagger = this.typewriteSeq * (0.04 + Math.random() * 0.07)
      this.typewriteSeq += 1
      state = {
        startAt: this.meterTime + stagger + Math.random() * 0.12,
        rate: 14 + Math.random() * 18,
      }
      this.typewrites.set(id, state)
    }

    if (this.meterTime < state.startAt) return ''

    const elapsed = this.meterTime - state.startAt
    const unlocked = Math.min(value.length, Math.floor(elapsed * state.rate))
    if (unlocked >= value.length) return value

    const trail = 2
    let out = ''
    for (let i = 0; i < value.length; i++) {
      const ch = value[i]!
      if (i < unlocked) {
        // Rare micro-glitch on already-locked glyphs while still typing.
        if (ch !== ' ' && Math.random() < 0.04) {
          out += TYPE_SCRAMBLE[Math.floor(Math.random() * TYPE_SCRAMBLE.length)]!
        } else {
          out += ch
        }
      } else if (i < unlocked + trail) {
        if (ch === ' ') out += ' '
        else out += TYPE_SCRAMBLE[Math.floor(Math.random() * TYPE_SCRAMBLE.length)]!
      } else {
        break
      }
    }
    return out
  }

  /** One letter dropout per phrase, on its own random schedule (never synced). */
  private maybeGlitchText(value: string, id = value) {
    if (value.length < 2) return value

    let state = this.textGlitches.get(id)
    if (!state) {
      state = {
        nextAt: this.meterTime + 4 + Math.random() * 14,
        until: 0,
        display: value,
      }
      this.textGlitches.set(id, state)
    }

    if (this.meterTime >= state.nextAt) {
      state.display = this.dropOneLetter(value)
      state.until = this.meterTime + 0.1 + Math.random() * 0.12
      state.nextAt = state.until + 6 + Math.random() * 14
    }

    if (this.meterTime < state.until) return state.display
    return value
  }

  private dropOneLetter(value: string) {
    const chars = [...value]
    const indices: number[] = []
    for (let i = 0; i < chars.length; i++) {
      if (/[0-9A-Za-zÀ-ÖØ-öø-ÿ]/.test(chars[i]!)) indices.push(i)
    }
    if (indices.length === 0) return value
    const idx = indices[Math.floor(Math.random() * indices.length)]!
    chars[idx] = ' '
    return chars.join('')
  }

  /** Burst-scramble every phrase while the signal overdrive pulse is firing. */
  private pulseScramble(value: string) {
    const pulse = this.signalPulse01()
    if (pulse < 0.05) return value
    let out = ''
    for (const ch of value) {
      if (ch !== ' ' && Math.random() < pulse * 0.55) {
        out += TYPE_SCRAMBLE[Math.floor(Math.random() * TYPE_SCRAMBLE.length)]!
      } else {
        out += ch
      }
    }
    return out
  }

  /** Type-in first; once complete, occasional letter-drop glitch. */
  private resolveText(value: string, id: string, animate = true) {
    if (!animate) return this.pulseScramble(this.maybeGlitchText(value, id))
    const typed = this.typewriteText(value, id)
    if (typed.length < value.length) return this.pulseScramble(typed)
    return this.pulseScramble(this.maybeGlitchText(value, id))
  }

  private layoutDefs(): LayoutPiece[] {
    if (this.screen === 'signal') return SIGNAL_LAYOUT
    if (this.screen === 'outro' || this.screen === 'end') return []
    const cellB = HUD_MODULES.find((m) => m.id === 'right-b')!
    const cellC = HUD_MODULES.find((m) => m.id === 'right-c')!
    return [
      { id: 'frame', x: 6, y: 6, w: DESIGN.width - 12, h: DESIGN.height - 12, corner: 10 },
      { id: CHROME_ID, ...CHROME_BAR },
      { id: 'message', x: 159, y: 108, w: 432, h: 283, corner: 6 },
      { id: 'globe', x: 598, y: 51, w: 225, h: 280, corner: 8 },
      ...HUD_MODULES.map((m) => ({ id: m.id, x: m.x, y: m.y, w: m.w, h: m.h })),
      {
        id: 'incoming',
        x: cellB.x,
        y: 426,
        w: cellC.x + cellC.w - cellB.x,
        h: 20,
      },
      { id: 'gauge-a', x: 159, y: 436, w: 204, h: 4 },
      { id: 'gauge-b', x: 382, y: 436, w: 206, h: 4 },
    ]
  }

  /** Outer frame + top status bar persist across screen swaps. */
  private isPersistentChrome(id: string) {
    return id === 'frame' || id === CHROME_ID
  }

  private pickOpenAxis(piece: LayoutPiece): 'h' | 'v' {
    const ratio = piece.w / Math.max(1, piece.h)
    // Tall panels lean vertical; wide bars lean horizontal; mix the rest.
    if (ratio < 0.65) return Math.random() < 0.75 ? 'v' : 'h'
    if (ratio > 2.2) return Math.random() < 0.8 ? 'h' : 'v'
    return Math.random() < 0.5 ? 'h' : 'v'
  }

  /** Reverse boot on the current panels; returns seconds until all are gone. */
  private armLayoutTeardown(includeChrome = false) {
    this.layoutBoot.clear()
    let delay = 0
    let end = 0
    // Full teardown: inner panels first, frame + top bar go last.
    const pieces = includeChrome
      ? [
          ...this.layoutDefs().filter((piece) => !this.isPersistentChrome(piece.id)),
          ...this.layoutDefs().filter((piece) => this.isPersistentChrome(piece.id)),
        ]
      : this.layoutDefs()
    for (const piece of pieces) {
      if (!includeChrome && this.isPersistentChrome(piece.id)) continue
      const duration = 0.18 + Math.random() * 0.14
      this.layoutBoot.set(piece.id, {
        startAt: this.meterTime + delay,
        duration,
        seed: Math.random() * 64,
        ox: (Math.random() - 0.5) * 36,
        oy: (Math.random() - 0.5) * 28,
        axis: this.pickOpenAxis(piece),
        out: true,
      })
      end = Math.max(end, delay + duration)
      delay += 0.02 + Math.random() * 0.035
    }
    return end + 0.06
  }

  private armLayoutBoot(keepChrome = false) {
    this.layoutBoot.clear()
    let delay = 0.05
    for (const piece of this.layoutDefs()) {
      if (keepChrome && this.isPersistentChrome(piece.id)) continue
      // Outer frame first, then chrome / big panels; modules cascade as infection.
      const bias =
        piece.id === 'frame'
          ? 0
          : piece.id === CHROME_ID
            ? 0.04
            : piece.id === 'message' || piece.id === 'globe' || SIGNAL_BIG_PANELS.has(piece.id)
              ? 0.08
              : 0.16
      this.layoutBoot.set(piece.id, {
        startAt: this.meterTime + bias + delay,
        duration: 0.28 + Math.random() * 0.28,
        seed: Math.random() * 64,
        ox: (Math.random() - 0.5) * 36,
        oy: (Math.random() - 0.5) * 28,
        axis: this.pickOpenAxis(piece),
      })
      delay += 0.035 + Math.random() * 0.055
    }
  }

  private easeOutBack(t: number) {
    const c = 1.4
    const t1 = t - 1
    return 1 + c * t1 * t1 * t1 + (c - 1) * t1 * t1
  }

  private poseOf(id: string, final: Rect): LayoutPose | null {
    const boot = this.layoutBoot.get(id)
    if (!boot) {
      return { ...final, alpha: 1, t: 1, contentAlpha: 1, glitch: 0 }
    }

    const raw = (this.meterTime - boot.startAt) / boot.duration
    if (boot.out) {
      if (raw < 0) return { ...final, alpha: 1, t: 1, contentAlpha: 1, glitch: 0 }
      if (raw >= 1) return null
    } else if (raw < 0) {
      return null
    }
    const t = boot.out ? 1 - raw : Math.min(1, raw)
    const e = this.easeOutBack(Math.min(1, t))

    // Small panels: slash then fill on the other axis.
    // Big panels (message / globe / frame): both axes together — otherwise it reads as a double open.
    const big = id === 'message' || id === 'globe' || id === 'frame' || SIGNAL_BIG_PANELS.has(id)
    const primaryE = Math.min(1, t / (big ? 0.55 : 0.45))
    const secondaryE = big
      ? primaryE
      : Math.max(0, Math.min(1, (t - 0.18) / 0.55))
    const vertical = boot.axis === 'v'
    const widthE = vertical ? secondaryE : primaryE
    const heightE = vertical ? primaryE : secondaryE
    const w = Math.max(
      vertical ? 1 : 2,
      final.w * (vertical ? 0.02 + 0.98 * widthE * widthE : 0.08 + 0.92 * widthE),
    )
    const h = Math.max(
      vertical ? 2 : 1,
      final.h * (vertical ? 0.08 + 0.92 * heightE : 0.02 + 0.98 * heightE * heightE),
    )

    const settle = Math.min(1, e)
    const cx = final.x + final.w / 2 + boot.ox * (1 - settle)
    const cy = final.y + final.h / 2 + boot.oy * (1 - settle)

    // Digital jitter while still locking — dies hard at the end.
    const unrest = 1 - t
    const glitch =
      unrest > 0.05
        ? Math.sin(this.meterTime * (48 + boot.seed) + boot.seed) * unrest * 5 +
          (Math.random() < 0.08 * unrest ? (Math.random() - 0.5) * 10 : 0)
        : 0

    const alpha = Math.min(1, 0.25 + primaryE * 0.75)
    const contentAlpha = Math.max(0, Math.min(1, (t - 0.55) / 0.35))

    return {
      x: cx - w / 2 + (vertical ? 0 : glitch * 0.35),
      y: cy - h / 2 + (vertical ? glitch * 0.35 : 0),
      w,
      h,
      alpha,
      t,
      contentAlpha,
      glitch,
    }
  }

  private strokeLayout(pose: LayoutPose, corner?: number) {
    const { ctx } = this
    const pulse = Math.max(this.signalPulse01(), this.raveExcite() * 0.8)
    ctx.save()
    ctx.globalAlpha = pose.alpha
    // Soft pulse — slight brighten of the frames, then back to faint.
    ctx.strokeStyle =
      pulse > 0.01 ? `rgba(34, 240, 143, ${0.18 + pulse * 0.12})` : PALETTE.greenFaint
    ctx.lineWidth = 0.6 + pulse * 0.1
    ctx.strokeRect(pose.x, pose.y, pose.w, pose.h)

    // Ghost packet — offset duplicate while materializing.
    if (Math.abs(pose.glitch) > 0.4 && pose.t < 0.92) {
      ctx.strokeStyle = 'rgba(34, 240, 143, 0.12)'
      ctx.strokeRect(pose.x + pose.glitch, pose.y - pose.glitch * 0.4, pose.w, pose.h)
    }

    // Bit ticks on the forming edges (hacking boot residue).
    if (pose.t < 0.95) {
      ctx.strokeStyle = PALETTE.greenDim
      ctx.lineWidth = 0.7
      const ticks = 4
      for (let i = 0; i < ticks; i++) {
        const along = ((i * 37 + pose.t * 50 + pose.glitch * 3) % 100) / 100
        const len = 2 + (i % 3)
        if (i % 2 === 0) {
          const px = pose.x + along * pose.w
          ctx.beginPath()
          ctx.moveTo(px, pose.y)
          ctx.lineTo(px, pose.y + len)
          ctx.stroke()
        } else {
          const py = pose.y + along * pose.h
          ctx.beginPath()
          ctx.moveTo(pose.x, py)
          ctx.lineTo(pose.x + len, py)
          ctx.stroke()
        }
      }
    }

    if (corner && pose.t > 0.5) {
      const c = corner * Math.min(1, (pose.t - 0.5) / 0.35)
      ctx.globalAlpha = pose.alpha * Math.min(1, (pose.t - 0.5) / 0.3)
      this.corners(pose.x, pose.y, pose.w, pose.h, c, PALETTE.greenDim)
    }
    ctx.restore()
  }

  /** Draw content warped into the settling rect (scale from final → pose). */
  private inLayout(final: Rect, pose: LayoutPose, draw: () => void) {
    if (pose.contentAlpha <= 0.01) return
    const { ctx } = this
    ctx.save()
    ctx.globalAlpha = pose.contentAlpha
    ctx.beginPath()
    ctx.rect(pose.x, pose.y, pose.w, pose.h)
    ctx.clip()
    const sx = pose.w / Math.max(1, final.w)
    const sy = pose.h / Math.max(1, final.h)
    ctx.translate(pose.x, pose.y)
    ctx.scale(sx, sy)
    ctx.translate(-final.x, -final.y)
    draw()
    ctx.restore()
  }

  /**
   * Wires / spokes / points: accumulate phase with dt.
   * (Fluids keep their own burst — do not change that path.)
   */
  private advanceMotion(dt: number) {
    for (const module of [...HUD_MODULES, ...SIGNAL_MODULES]) {
      const boost = this.fluidBurstOf(module.id)
      const prev = this.motionPhase.get(module.id) ?? 0
      if (module.kind === 'spokes') {
        this.motionPhase.set(module.id, prev + dt * (0.7 + boost * 3.5))
      } else if (module.kind === 'wires') {
        this.motionPhase.set(module.id, prev + dt * (0.55 + boost * 2.2))
      } else if (module.kind === 'points') {
        this.motionPhase.set(module.id, prev + dt * (0.35 + boost * 1.8))
      }
    }
  }

  private phaseOf(id: ModuleId) {
    return this.motionPhase.get(id) ?? 0
  }

  private updateGauges(dt: number) {
    for (const gauge of this.gauges) {
      this.driftGauge(gauge, dt, 0.08, 0.92, 0.008, 0.06, 0.22)
    }
  }

  private driftGauge(
    gauge: GaugeState,
    dt: number,
    min: number,
    max: number,
    snap: number,
    speedMin: number,
    speedMax: number,
  ) {
    const delta = gauge.target - gauge.value
    if (Math.abs(delta) < snap) {
      gauge.target = min + Math.random() * (max - min)
      gauge.speed = speedMin + Math.random() * (speedMax - speedMin)
    } else {
      gauge.value += Math.sign(delta) * Math.min(Math.abs(delta), gauge.speed * dt)
    }
  }

  /** Jump to a random value in [min, max] — not a min↔max sweep. */
  private tickReadout(state: ReadoutState, dt: number, min: number, max: number) {
    state.nextIn -= dt
    if (state.nextIn > 0) return
    state.value = min + Math.random() * (max - min)
    state.nextIn = 0.15 + Math.random() * 0.45
  }

  draw() {
    const { ctx } = this
    ctx.setTransform(this.scale, 0, 0, this.scale, 0, 0)

    if (!this.powered) {
      ctx.fillStyle = '#010302'
      ctx.fillRect(0, 0, DESIGN.width, DESIGN.height)
      this.texture.needsUpdate = true
      return
    }

    ctx.fillStyle = PALETTE.background
    ctx.fillRect(0, 0, DESIGN.width, DESIGN.height)

    // Final screen — black for now.
    if (this.screen === 'end') {
      this.texture.needsUpdate = true
      return
    }

    if (this.screen === 'outro') {
      this.drawOutro()
      this.drawScanlines()
      this.texture.needsUpdate = true
      return
    }

    if (this.screen === 'signal') {
      this.signalScreen.draw(this.painter)
      this.drawChromeBar()
      this.drawSignalModules()
      this.drawTearGlitch(this.signalScreen.glitchLevel(this.meterTime))
      this.drawFlash(this.signalScreen.flashLevel(this.meterTime))
      this.drawScanlines()
      this.texture.needsUpdate = true
      return
    }

    this.drawFrame()
    this.drawChromeBar()
    this.drawLeftColumn()
    this.drawMessage()
    this.drawRightColumn()
    this.drawBottomBar()
    this.drawModules()
    this.drawScanlines()

    this.texture.needsUpdate = true
  }

  private progressOf(id: ModuleId) {
    const anim = this.anims.get(id)
    if (!anim) return 0
    return Math.min(1, anim.elapsed / anim.duration)
  }

  private drawModules() {
    for (const module of HUD_MODULES) {
      const final = { x: module.x, y: module.y, w: module.w, h: module.h }
      const pose = this.poseOf(module.id, final)
      if (!pose) continue

      this.strokeLayout(pose)
      this.inLayout(final, pose, () => {
        if (module.kind === 'fluid') this.drawMeterFluid(module)
        if (module.kind === 'spokes') this.drawSpokes(module)
        if (module.kind === 'wires') this.drawWires(module)
        if (module.kind === 'points') this.drawPoints(module)
        const progress = this.progressOf(module.id)
        if (
          progress > 0 &&
          module.kind !== 'fluid' &&
          module.kind !== 'spokes' &&
          module.kind !== 'wires' &&
          module.kind !== 'points'
        ) {
          this.drawModuleAnim(module, progress)
        }
      })
    }
  }

  /** Bottom cells on screen 2 — frame stroked by SignalScreen, content here. */
  private drawSignalModules() {
    for (const module of SIGNAL_MODULES) {
      const final = { x: module.x, y: module.y, w: module.w, h: module.h }
      const pose = this.poseOf(module.id, final)
      if (!pose) continue
      this.inLayout(final, pose, () => {
        if (module.kind === 'fluid') this.drawMeterFluid(module)
        if (module.kind === 'wires') this.drawWires(module)
      })
    }
  }

  private drawPoints(module: HudModule) {
    const { ctx } = this
    const { x, y, w, h } = module
    const cx = x + w / 2
    const cy = y + h / 2
    const boost = this.fluidBurstOf(module.id)
    const t = this.phaseOf(module.id)
    const half = Math.min(w, h) * 0.48

    ctx.save()
    ctx.beginPath()
    ctx.rect(x + 0.5, y + 0.5, w - 1, h - 1)
    ctx.clip()

    // Faint perspective frame + diagonals (radar grid).
    ctx.strokeStyle = 'rgba(34, 240, 143, 0.18)'
    ctx.lineWidth = 0.5
    ctx.beginPath()
    ctx.moveTo(x + 4, y + 4)
    ctx.lineTo(x + w - 4, y + h - 4)
    ctx.moveTo(x + w - 4, y + 4)
    ctx.lineTo(x + 4, y + h - 4)
    ctx.moveTo(cx, y + 3)
    ctx.lineTo(cx, y + h - 3)
    ctx.moveTo(x + 3, cy)
    ctx.lineTo(x + w - 3, cy)
    ctx.stroke()

    for (const ring of [0.35, 0.62, 0.9]) {
      const rw = (w - 8) * ring
      const rh = (h - 8) * ring
      ctx.strokeRect(cx - rw / 2, cy - rh / 2, rw, rh)
    }

    // Perspective point field drifting toward / from the center.
    const count = 56
    for (let i = 0; i < count; i++) {
      const seed = i * 17.13
      const angle = seed + Math.sin(seed * 0.4) * 0.4
      // Depth 0 (far/center) → 1 (near/edge), looping over time.
      const depth = ((Math.sin(seed * 2.1) * 0.5 + 0.5 + t * (0.22 + (i % 5) * 0.03)) % 1)
      const z = 0.12 + depth * 0.88
      const spread = (0.15 + (i % 7) * 0.09) / z
      const px = cx + Math.cos(angle) * spread * half
      const py = cy + Math.sin(angle) * spread * half
      if (px < x || px > x + w || py < y || py > y + h) continue

      const size = 0.6 + (1 - depth) * 0.5 + boost * 0.4
      const alpha = 0.25 + depth * 0.65
      ctx.fillStyle = `rgba(34, 240, 143, ${alpha})`
      ctx.fillRect(px - size / 2, py - size / 2, size, size)
    }

    // Extra lattice dots for the grid feel.
    for (let gx = -3; gx <= 3; gx++) {
      for (let gy = -3; gy <= 3; gy++) {
        if (gx === 0 && gy === 0) continue
        const z = 0.35 + ((((gx * 0.17 + gy * 0.23 + t * 0.4) % 1) + 1) % 1) * 0.65
        const px = cx + (gx / z) * (half * 0.28)
        const py = cy + (gy / z) * (half * 0.28)
        if (px < x + 2 || px > x + w - 2 || py < y + 2 || py > y + h - 2) continue
        const alpha = 0.2 + (1 - z / 1.2) * 0.55
        ctx.fillStyle = `rgba(34, 240, 143, ${alpha})`
        ctx.fillRect(px - 0.45, py - 0.45, 0.9, 0.9)
      }
    }

    const arm = 4.5 + boost * 2
    ctx.strokeStyle = PALETTE.green
    ctx.lineWidth = 1.2
    ctx.beginPath()
    ctx.moveTo(cx - arm, cy)
    ctx.lineTo(cx + arm, cy)
    ctx.moveTo(cx, cy - arm)
    ctx.lineTo(cx, cy + arm)
    ctx.stroke()
    ctx.restore()
  }

  private drawWires(module: HudModule) {
    const { ctx } = this
    const { x, y, w, h } = module
    const boost = this.fluidBurstOf(module.id)
    const t = this.phaseOf(module.id)
    const strands = 22
    // Long paths that start/end outside the clip so extremities stay hidden.
    const steps = 48
    const stepLen = 5.5 + boost * 1.5
    const margin = 28

    ctx.save()
    ctx.beginPath()
    ctx.rect(x + 1, y + 1, w - 2, h - 2)
    ctx.clip()

    ctx.lineWidth = 0.55
    ctx.lineJoin = 'round'
    ctx.lineCap = 'round'

    for (let s = 0; s < strands; s++) {
      const seed = s * 12.9898
      const side = s % 4
      // Spawn just outside a random edge, then flow across the panel.
      let px: number
      let py: number
      if (side === 0) {
        px = x - margin
        py = y + ((Math.sin(seed) * 0.5 + 0.5) * h)
      } else if (side === 1) {
        px = x + w + margin
        py = y + ((Math.cos(seed) * 0.5 + 0.5) * h)
      } else if (side === 2) {
        px = x + ((Math.sin(seed * 1.3) * 0.5 + 0.5) * w)
        py = y - margin
      } else {
        px = x + ((Math.cos(seed * 1.7) * 0.5 + 0.5) * w)
        py = y + h + margin
      }

      ctx.strokeStyle = `rgba(34, 240, 143, ${0.22 + (s % 5) * 0.08 + boost * 0.2})`
      ctx.beginPath()
      ctx.moveTo(px, py)

      for (let step = 0; step < steps; step++) {
        const nx = px * 0.045
        const ny = py * 0.045
        const angle =
          Math.sin(nx + t + seed) * 1.4 +
          Math.cos(ny - t * 0.8 + seed * 0.3) * 1.1 +
          Math.sin((nx + ny) * 0.7 + t * 1.3) * 0.7
        px += Math.cos(angle) * stepLen
        py += Math.sin(angle) * stepLen
        ctx.lineTo(px, py)
      }
      ctx.stroke()
    }

    // Center crosshair like the reference.
    const cx = x + w / 2
    const cy = y + h / 2
    const arm = 5 + boost * 3
    ctx.strokeStyle = PALETTE.green
    ctx.lineWidth = 1.1
    ctx.beginPath()
    ctx.moveTo(cx - arm, cy)
    ctx.lineTo(cx + arm, cy)
    ctx.moveTo(cx, cy - arm)
    ctx.lineTo(cx, cy + arm)
    ctx.stroke()
    ctx.restore()
  }

  private drawSpokes(module: HudModule) {
    const { ctx } = this
    const { x, y, w, h } = module
    const cx = x + w / 2
    const cy = y + h / 2
    const rays = 14
    const boost = this.fluidBurstOf(module.id)
    const angle = this.phaseOf(module.id)
    // Long enough to hit the corners; the clip keeps them inside the frame.
    const radius = Math.hypot(w, h) * 0.55

    ctx.save()
    ctx.beginPath()
    ctx.rect(x + 0.5, y + 0.5, w - 1, h - 1)
    ctx.clip()

    ctx.strokeStyle = `rgba(34, 240, 143, ${0.75 + boost * 0.25})`
    ctx.lineWidth = 0.7
    ctx.beginPath()
    for (let i = 0; i < rays; i++) {
      const a = angle + (i / rays) * Math.PI * 2
      ctx.moveTo(cx, cy)
      ctx.lineTo(cx + Math.cos(a) * radius, cy + Math.sin(a) * radius)
    }
    ctx.stroke()

    ctx.fillStyle = PALETTE.green
    ctx.beginPath()
    ctx.arc(cx, cy, 1.2 + boost * 1.5, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
  }

  private drawMeterFluid(module: HudModule) {
    const entry = this.fluids.get(module.id)
    if (!entry) return

    entry.field.render(this.meterTime + entry.timeOffset, entry.params, this.fluidBurstOf(module.id))
    this.ctx.drawImage(entry.field.canvas, module.x, module.y, module.w, module.h)
  }

  /**
   * Full boost while the layout rect is still forming; soft decay once it hits size.
   */
  private layoutBoostOf(id: string) {
    const boot = this.layoutBoot.get(id)
    if (!boot) return 0
    const raw = (this.meterTime - boot.startAt) / boot.duration
    if (raw < 0) return 0
    if (raw < 1) return 1
    return Math.max(0, 1 - (raw - 1) / 0.35)
  }

  /** Fast attack → short peak → decay, so the liquid "excites" then settles. */
  private fluidBurstOf(id: ModuleId) {
    return Math.max(
      this.burstEnvelope(this.anims.get(id)),
      this.layoutBoostOf(id),
      this.raveExcite(),
    )
  }

  /** Final stage — modules / frames stay overdriven, pumping on a fast beat. */
  private raveExcite() {
    if (this.screen !== 'signal') return 0
    const rave = this.signalScreen.raveLevel(this.meterTime)
    if (rave <= 0) return 0
    const beat = 0.5 + 0.5 * Math.sin(this.meterTime * Math.PI * 4)
    return rave * (0.75 + beat * 0.25)
  }

  private gaugeBurstOf() {
    return Math.max(
      this.burstEnvelope(this.gaugeBoost),
      this.layoutBoostOf('gauge-a'),
      this.layoutBoostOf('gauge-b'),
    )
  }

  private burstEnvelope(anim: ModuleAnim | null | undefined) {
    if (!anim) return 0
    const t = Math.min(1, anim.elapsed / anim.duration)
    if (t < 0.12) return t / 0.12
    if (t < 0.4) return 1
    return Math.max(0, 1 - (t - 0.4) / 0.6)
  }

  private drawModuleAnim(module: HudModule, progress: number) {
    const intensity = progress < 0.15 ? progress / 0.15 : progress > 0.75 ? (1 - progress) / 0.25 : 1
    const { x, y, w, h, kind } = module
    const { ctx } = this

    ctx.save()
    ctx.beginPath()
    ctx.rect(x, y, w, h)
    ctx.clip()

    switch (kind) {
      case 'pulse':
        this.animPulse(x, y, w, h, progress, intensity)
        break
      case 'grid':
        this.animGrid(x, y, w, h, progress, intensity)
        break
      case 'noise':
        this.animNoise(x, y, w, h, progress, intensity)
        break
      case 'burst':
        this.animBurst(x, y, w, h, progress, intensity)
        break
      case 'wires':
      case 'spokes':
      case 'points':
      case 'fluid':
        break
    }

    ctx.strokeStyle = `rgba(34, 240, 143, ${0.35 + intensity * 0.65})`
    ctx.lineWidth = 1.2
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1)
    ctx.restore()
  }

  private animPulse(x: number, y: number, w: number, h: number, progress: number, intensity: number) {
    const { ctx } = this
    const wave = 0.5 + 0.5 * Math.sin(progress * Math.PI * 4)
    ctx.fillStyle = `rgba(34, 240, 143, ${wave * 0.35 * intensity})`
    ctx.fillRect(x, y, w, h)
    ctx.strokeStyle = `rgba(34, 240, 143, ${intensity})`
    ctx.lineWidth = 1.5
    const inset = 3 + wave * 4
    ctx.strokeRect(x + inset, y + inset, w - inset * 2, h - inset * 2)
  }

  private animGrid(x: number, y: number, w: number, h: number, progress: number, intensity: number) {
    const { ctx } = this
    const cells = 2
    const cellW = w / cells
    const cellH = h / cells
    const lit = Math.floor(progress * cells * cells)
    for (let i = 0; i < cells * cells; i++) {
      const cx = x + (i % cells) * cellW
      const cy = y + Math.floor(i / cells) * cellH
      if (i <= lit) {
        ctx.fillStyle = `rgba(34, 240, 143, ${0.25 * intensity})`
        ctx.fillRect(cx + 1, cy + 1, cellW - 2, cellH - 2)
      }
      ctx.strokeStyle = `rgba(34, 240, 143, ${0.3 * intensity})`
      ctx.strokeRect(cx + 0.5, cy + 0.5, cellW - 1, cellH - 1)
    }
  }

  private animNoise(x: number, y: number, w: number, h: number, progress: number, intensity: number) {
    const { ctx } = this
    const cols = 8
    const rows = 8
    const cellW = w / cols
    const cellH = h / rows
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const n = Math.sin((col + 1) * 12.9898 + (row + 1) * 78.233 + progress * 40) * 43758.5453
        const v = n - Math.floor(n)
        if (v > 0.55) {
          ctx.fillStyle = `rgba(34, 240, 143, ${v * 0.55 * intensity})`
          ctx.fillRect(x + col * cellW, y + row * cellH, cellW, cellH)
        }
      }
    }
  }

  private animBurst(x: number, y: number, w: number, h: number, progress: number, intensity: number) {
    const { ctx } = this
    const cx = x + w / 2
    const cy = y + h / 2
    const rays = 10
    ctx.strokeStyle = `rgba(34, 240, 143, ${intensity})`
    ctx.lineWidth = 1
    for (let i = 0; i < rays; i++) {
      const angle = (i / rays) * Math.PI * 2 + progress * 3
      const len = (8 + progress * Math.min(w, h) * 0.45) * intensity
      ctx.beginPath()
      ctx.moveTo(cx, cy)
      ctx.lineTo(cx + Math.cos(angle) * len, cy + Math.sin(angle) * len)
      ctx.stroke()
    }
    ctx.beginPath()
    ctx.arc(cx, cy, 2 + progress * 10, 0, Math.PI * 2)
    ctx.stroke()
  }

  /** Big centered « LA FÊTE N'EST PAS MORTE » — glitch arrival, type-in, short hold. */
  private drawOutro() {
    const outro = this.outro
    if (!outro) return
    const { ctx } = this
    const t = this.meterTime - outro.startAt
    const toEnd = outro.endAt - this.meterTime
    const glitchIn = t < OUTRO_GLITCH_IN ? 1 - t / OUTRO_GLITCH_IN : 0
    const glitchOut = toEnd < OUTRO_GLITCH_OUT ? 1 - toEnd / OUTRO_GLITCH_OUT : 0
    // Rare twitch during the hold so it never feels frozen.
    const twitch = Math.random() < 0.04 ? 0.35 : 0
    const glitch = Math.max(glitchIn, glitchOut, twitch)

    let unlocked = Math.max(0, Math.floor((t - OUTRO_TYPE_DELAY) * OUTRO_TYPE_RATE))
    const size = 50
    const lineGap = 60
    const cx = DESIGN.width / 2
    const top = DESIGN.height / 2 - ((OUTRO_LINES.length - 1) * lineGap) / 2

    ctx.save()
    ctx.font = `900 ${size}px ${TITLE_FONT}`
    ctx.letterSpacing = '3px'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'

    OUTRO_LINES.forEach((line, i) => {
      const shown = this.outroTyped(line, unlocked)
      unlocked = Math.max(0, unlocked - line.length)
      if (!shown) return
      const y = top + i * lineGap
      const jitter = Math.random() < glitch * 0.6 ? (Math.random() - 0.5) * 24 * glitch : 0

      // Split-channel ghosts while glitching.
      if (glitch > 0.05) {
        const dx = (2 + Math.random() * 6) * glitch
        ctx.shadowBlur = 0
        ctx.fillStyle = `rgba(255, 255, 255, ${0.35 * glitch})`
        ctx.fillText(shown, cx + jitter + dx, y)
        ctx.fillStyle = `rgba(34, 240, 143, ${0.5 * glitch})`
        ctx.fillText(shown, cx + jitter - dx, y + 1)
      }

      ctx.shadowColor = PALETTE.green
      ctx.shadowBlur = 22 + glitch * 20
      ctx.fillStyle = PALETTE.green
      ctx.globalAlpha = glitch > 0.5 && Math.random() < 0.25 ? 0.4 : 1
      ctx.fillText(shown, cx + jitter, y)
      ctx.globalAlpha = 1
    })
    ctx.restore()

    this.drawTearGlitch(glitch * 0.8)
  }

  /** Type-in with a short scramble trail; `unlocked` counts glyphs across all lines. */
  private outroTyped(line: string, unlocked: number) {
    if (unlocked <= 0) return ''
    if (unlocked >= line.length) return line
    const trail = 3
    let out = line.slice(0, unlocked)
    for (let i = unlocked; i < Math.min(line.length, unlocked + trail); i++) {
      out += line[i] === ' ' ? ' ' : TYPE_SCRAMBLE[Math.floor(Math.random() * TYPE_SCRAMBLE.length)]!
    }
    return out
  }

  /** Horizontal tear: random strips of the frame shifted sideways. */
  private drawTearGlitch(level: number) {
    if (level <= 0.01) return
    const { ctx, canvas } = this
    ctx.save()
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    const slices = 2 + Math.floor(Math.random() * 6 * level)
    for (let i = 0; i < slices; i++) {
      const h = (3 + Math.random() * 28) * this.scale
      const y = Math.random() * (canvas.height - h)
      const dx = (Math.random() - 0.5) * 2 * 36 * level * this.scale
      ctx.drawImage(canvas, 0, y, canvas.width, h, dx, y, canvas.width, h)
      if (Math.random() < 0.4) {
        ctx.fillStyle = `rgba(34, 240, 143, ${0.08 + Math.random() * 0.12 * level})`
        ctx.fillRect(0, y, canvas.width, Math.max(1, h * 0.15))
      }
    }
    ctx.restore()
  }

  /** Brief additive green wash over the whole screen. */
  private drawFlash(level: number) {
    if (level <= 0.01) return
    const { ctx } = this
    ctx.save()
    ctx.globalCompositeOperation = 'lighter'
    ctx.fillStyle = `rgba(34, 240, 143, ${0.45 * level})`
    ctx.fillRect(0, 0, DESIGN.width, DESIGN.height)
    ctx.restore()
  }

  private drawFrame() {
    const final = { x: 6, y: 6, w: DESIGN.width - 12, h: DESIGN.height - 12 }
    const pose = this.poseOf('frame', final)
    if (!pose) return
    this.strokeLayout(pose, 10)
  }

  /** Top status strip shared by intro + signal — never torn down on screen swap. */
  private drawChromeBar() {
    const { ctx } = this
    const pose = this.poseOf(CHROME_ID, CHROME_BAR)
    if (!pose) return
    this.strokeLayout(pose)
    this.inLayout(CHROME_BAR, pose, () => {
      const cy = CHROME_BAR.y + CHROME_BAR.h / 2
      ;[39, 47, 55].forEach((x, i) => {
        const lit = this.statusDots[i]?.lit ?? true
        ctx.fillStyle = lit ? PALETTE.green : 'rgba(34, 240, 143, 0.12)'
        ctx.beginPath()
        ctx.arc(x, cy, 2.2, 0, Math.PI * 2)
        ctx.fill()
      })
      this.line(63, CHROME_BAR.y, 63, CHROME_BAR.y + CHROME_BAR.h, PALETTE.greenFaint)
      this.text('TRANSMISSION // CLANDESTINE', 70, cy + 2, 5.5, PALETTE.greenDim)
      this.line(CHROME_SPLIT_X, CHROME_BAR.y, CHROME_SPLIT_X, CHROME_BAR.y + CHROME_BAR.h, PALETTE.greenFaint)
      this.text('NODE_004', CHROME_SPLIT_X + 8, cy + 2, 5.5, PALETTE.greenDim)
      this.text('LIVE', 784, cy + 2, 5.5, PALETTE.green)
      ctx.fillStyle = this.recLit ? PALETTE.green : 'rgba(34, 240, 143, 0.12)'
      ctx.beginPath()
      ctx.arc(806, cy, 2.2, 0, Math.PI * 2)
      ctx.fill()
    })
  }

  private drawLeftColumn() {
    const frame = this.poseOf('frame', { x: 6, y: 6, w: DESIGN.width - 12, h: DESIGN.height - 12 })
    const alpha = frame?.contentAlpha ?? 1
    if (alpha <= 0.01) return

    const { ctx } = this
    ctx.save()
    ctx.globalAlpha = alpha
    this.text('SECTOR 7 // GRID 4', 16, 146, 5.5, PALETTE.greenDim)

    const rows: [string, string][] = [
      ['SIGNAL', String(Math.round(this.signal.value))],
      ['FREQ', this.freq.value.toFixed(1)],
      ['NODE', '07'],
      ['SYNC', 'OK'],
      ['LOAD', '64%'],
    ]
    rows.forEach(([label, value], i) => {
      const y = 342 + i * 13
      this.text(label, 16, y, 5.5, PALETTE.greenDim)
      this.text(value, 84, y, 5.5, PALETTE.greenDim, 'right', 1, `readout:${label}`, false)
    })

    this.text('PROTOCOL // LAST SIGNAL', 16, 472, 5.5, PALETTE.greenDim)
    ctx.restore()
  }

  private drawMessage() {
    const final = { x: 159, y: 108, w: 432, h: 283 }
    const pose = this.poseOf('message', final)
    if (!pose) return

    this.strokeLayout(pose, 6)
    // Crosshair ticks around the message panel — appear as it locks.
    if (pose.t > 0.4) {
      const a = Math.min(1, (pose.t - 0.4) / 0.4) * pose.alpha
      const { ctx } = this
      ctx.save()
      ctx.globalAlpha = a
      this.line(520, 100, 591, 100, PALETTE.greenFaint)
      this.line(146, 376, 152, 376, PALETTE.greenDim)
      this.line(158, 46, 158, 52, PALETTE.greenDim)
      this.line(155, 49, 161, 49, PALETTE.greenDim)
      ctx.restore()
    }

    this.inLayout(final, pose, () => {
      const { ctx } = this
      this.text('TRANSMISSION NON AUTORISÉE', 186, 124, 8, PALETTE.greenDim, 'left', 1.5)

      ctx.save()
      ctx.shadowColor = PALETTE.green
      ctx.shadowBlur = 18
      ctx.fillStyle = PALETTE.green
      ctx.font = `900 46px ${TITLE_FONT}`
      ctx.letterSpacing = '2px'
      ctx.textAlign = 'left'
      ;['LA FETE', "N'EST PAS", 'MORTE.'].forEach((line, i) => {
        ctx.fillText(this.resolveText(line, `title:${line}`), 186, 189 + i * 55)
      })
      ctx.restore()

      this.text('>>> A VOUS DE LA FAIRE REVIVRE', 186, 353, 8, PALETTE.greenDim, 'left', 1.5)
    })
  }

  private drawRightColumn() {
    const final = { x: 598, y: 51, w: 225, h: 280 }
    const pose = this.poseOf('globe', final)
    if (pose) this.strokeLayout(pose, 8)

    this.drawSignalIncoming()
  }

  private drawSignalIncoming() {
    const { ctx } = this
    const cellB = HUD_MODULES.find((module) => module.id === 'right-b')!
    const cellC = HUD_MODULES.find((module) => module.id === 'right-c')!
    const final = {
      x: cellB.x,
      y: 426,
      w: cellC.x + cellC.w - cellB.x,
      h: 20,
    }
    const pose = this.poseOf('incoming', final)
    if (!pose) return

    this.strokeLayout(pose)
    const split = final.x + 48
    this.inLayout(final, pose, () => {
      this.line(split, final.y, split, final.y + final.h, PALETTE.greenFaint)

      const sq = 5
      const gap = 3.5
      const total = sq * 3 + gap * 2
      const sx = final.x + (split - final.x - total) / 2
      const sy = final.y + (final.h - sq) / 2
      ctx.strokeStyle = PALETTE.greenDim
      ctx.lineWidth = 0.7
      for (let i = 0; i < 3; i++) {
        ctx.strokeRect(sx + i * (sq + gap), sy, sq, sq)
      }

      this.text('SIGNAL_INCOMING...', split + 8, final.y + 13.5, 6, PALETTE.greenDim)
    })
  }

  private drawBottomBar() {
    const boost = this.gaugeBurstOf()
    this.progressBar(
      'gauge-a',
      159,
      436,
      204,
      this.gauges[0].value + (1 - this.gauges[0].value) * boost,
    )
    this.progressBar(
      'gauge-b',
      382,
      436,
      206,
      this.gauges[1].value + (1 - this.gauges[1].value) * boost,
    )
  }

  private progressBar(id: string, x: number, y: number, width: number, progress: number) {
    const final = { x, y, w: width, h: 4 }
    const pose = this.poseOf(id, final)
    if (!pose) return

    this.strokeLayout(pose)
    this.inLayout(final, pose, () => {
      const { ctx } = this
      const h = 5
      const fillW = Math.max(0, width * progress)
      if (fillW <= 0) return
      for (let row = 0; row < h; row++) {
        const shade = row % 2 === 0 ? 1 : 0.5
        ctx.fillStyle = `rgba(34, 240, 143, ${shade})`
        ctx.fillRect(x, y - 0.5 + row, fillW, 1)
      }
    })
  }

  private drawScanlines() {
    const { ctx, canvas } = this
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.fillStyle = 'rgba(0, 0, 0, 0.28)'
    for (let y = 0; y < canvas.height; y += 3) ctx.fillRect(0, y, canvas.width, 1)

    const vignette = ctx.createRadialGradient(
      canvas.width / 2,
      canvas.height / 2,
      canvas.height * 0.35,
      canvas.width / 2,
      canvas.height / 2,
      canvas.width * 0.65,
    )
    vignette.addColorStop(0, 'rgba(0, 0, 0, 0)')
    vignette.addColorStop(1, 'rgba(0, 0, 0, 0.55)')
    ctx.fillStyle = vignette
    ctx.fillRect(0, 0, canvas.width, canvas.height)
  }

  private text(
    value: string,
    x: number,
    y: number,
    size: number,
    color: string,
    align: CanvasTextAlign = 'left',
    spacing = 1,
    glitchId?: string,
    animate = true,
  ) {
    const { ctx } = this
    const id = glitchId ?? value
    ctx.fillStyle = color
    ctx.font = `${size}px ${MONO_FONT}`
    ctx.letterSpacing = `${spacing}px`
    ctx.textAlign = align
    ctx.fillText(this.resolveText(value, id, animate), x, y)
  }

  private line(x1: number, y1: number, x2: number, y2: number, color: string) {
    const { ctx } = this
    ctx.strokeStyle = color
    ctx.lineWidth = 0.6
    ctx.beginPath()
    ctx.moveTo(x1, y1)
    ctx.lineTo(x2, y2)
    ctx.stroke()
  }

  private corners(x: number, y: number, w: number, h: number, size: number, color: string) {
    const { ctx } = this
    ctx.strokeStyle = color
    ctx.lineWidth = 1.2
    ctx.beginPath()
    for (const [cx, cy, dx, dy] of [
      [x, y, 1, 1],
      [x + w, y, -1, 1],
      [x, y + h, 1, -1],
      [x + w, y + h, -1, -1],
    ]) {
      ctx.moveTo(cx + dx * size, cy)
      ctx.lineTo(cx, cy)
      ctx.lineTo(cx, cy + dy * size)
    }
    ctx.stroke()
  }
}
