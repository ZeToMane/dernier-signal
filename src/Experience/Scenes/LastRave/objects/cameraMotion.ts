export type CameraMotionParams = {
  /** Master switch for the explorer rig. */
  enabled: boolean
  /** Global amount (0 = locked off, 1 = as tuned). */
  amount: number
  /** Pace of the exploration drift. */
  speed: number
  /** Exploration: slow truck (X) / pedestal (Y) amplitude. */
  swayX: number
  swayY: number
  /** Exploration: dolly toward the wall (Z, push-in only so frame edges never show). */
  dolly: number
  /** Camera aims ahead of its own move (operator anticipation). */
  lookAhead: number
  /** Breathing bob amplitude (rate speeds up with stress). */
  breath: number
  /** Baseline stress 0..1 — drives breath rate + handheld shake. */
  stress: number
  /** Handheld shake amplitude at full stress. */
  shake: number
  /** Slow dutch roll drift. */
  roll: number
  /** Slow look-up / look-down drift. */
  pitch: number
  /** Smoothing toward the targets (higher = snappier). */
  tiltLerp: number
  /** Extra nervous tilt oscillation at full stress. */
  stressTilt: number
}

export const DEFAULT_CAMERA_MOTION: CameraMotionParams = {
  enabled: true,
  amount: 1.41,
  speed: 1,
  swayX: 0.261,
  swayY: 0.267,
  dolly: 0.3,
  lookAhead: 1.02,
  breath: 0.025,
  stress: 0.21,
  shake: 0.0055,
  roll: 0.015,
  pitch: 0.018,
  tiltLerp: 2.5,
  stressTilt: 0.0075,
}

/** Smooth 1D value noise in [-1, 1] (quintic fade, hashed lattice). */
function noise1(x: number) {
  const i = Math.floor(x)
  const f = x - i
  const hash = (n: number) => {
    const s = Math.sin(n * 127.1 + 311.7) * 43758.5453
    return (s - Math.floor(s)) * 2 - 1
  }
  const u = f * f * f * (f * (f * 6 - 15) + 10)
  return hash(i) + (hash(i + 1) - hash(i)) * u
}

/** Two octaves — organic, never periodic-looking. */
const fbm = (x: number, seed: number) => noise1(x + seed) * 0.7 + noise1(x * 2.3 + seed * 1.7) * 0.3

export type CameraOffsets = { x: number; y: number; z: number; lookX: number; lookY: number; roll: number }

/**
 * Cinematic "someone exploring, scared" rig — layered on top of the base framing:
 * - exploration: slow composed truck / pedestal / push-in, camera leads its move;
 * - breathing: vertical bob + tiny push, rate rises with stress;
 * - stress: slow baseline swell + event spikes (`startle`), feeds shake / breath;
 * - handheld: high-frequency noise on aim + position, scaled by stress.
 */
export function createCameraRig(params: CameraMotionParams) {
  const out: CameraOffsets = { x: 0, y: 0, z: 0, lookX: 0, lookY: 0, roll: 0 }
  /** Smoothed slow layers (exploration + framing); fast layers are added after. */
  const slow: CameraOffsets = { x: 0, y: 0, z: 0, lookX: 0, lookY: 0, roll: 0 }
  let breathPhase = 0
  let startle = 0
  let prevX = 0
  let prevY = 0

  return {
    params,
    offsets: out,
    /** Event spike (0..1) — poster punch, screen boot, signal, drop. */
    startle(amount: number) {
      startle = Math.max(startle, amount)
    },
    update(time: number, dt: number) {
      const p = params
      const step = Math.min(dt, 0.1)
      const a = p.enabled ? p.amount : 0
      const t = time * p.speed

      startle = Math.max(0, startle - step * 0.45)
      // Baseline stress breathes slowly on its own, startles push it up.
      const swell = 0.5 + 0.5 * noise1(time * 0.06 + 40)
      const stress = Math.min(1, p.stress * (0.6 + 0.8 * swell) + startle)

      // Exploration — slow, composed.
      const ex = fbm(t * 0.045, 1.3) * p.swayX
      const ey = fbm(t * 0.038, 7.9) * p.swayY
      const ez = -(0.5 + 0.5 * fbm(t * 0.03, 13.1)) * p.dolly

      // Breathing — 14 → 24 breaths/min with stress, short inhale / long exhale.
      breathPhase += step * Math.PI * 2 * (0.23 + 0.17 * stress)
      const breath = Math.sin(breathPhase) + 0.25 * Math.sin(breathPhase * 2 + 0.6)
      const by = breath * p.breath * (0.8 + 0.6 * stress)
      const bz = -breath * p.breath * 0.6

      // Handheld sway — slow, soft wobble (1–3 Hz), a bit stronger when stressed.
      const shakeAmt = p.shake * (0.4 + stress * 1.2)
      const sx = (noise1(time * 1.3 + 3) * 0.7 + noise1(time * 2.9 + 9) * 0.3) * shakeAmt
      const sy = (noise1(time * 1.1 + 21) * 0.7 + noise1(time * 2.6 + 4) * 0.3) * shakeAmt

      // Lead the move: aim a bit ahead of where the camera is drifting.
      const vx = (ex - prevX) / Math.max(step, 1e-3)
      const vy = (ey - prevY) / Math.max(step, 1e-3)
      prevX = ex
      prevY = ey

      // Slow layers are eased (no pops when params change); fast ones ride on top raw.
      const k = Math.min(1, step * p.tiltLerp)
      slow.x += (ex * a - slow.x) * k
      slow.y += (ey * a - slow.y) * k
      slow.z += (ez * a - slow.z) * k
      slow.lookX += ((ex * 0.35 + vx * p.lookAhead) * a - slow.lookX) * k
      slow.lookY += ((ey * 0.35 + vy * p.lookAhead + fbm(t * 0.05, 31.4) * p.pitch * 5) * a - slow.lookY) * k
      slow.roll += (fbm(t * 0.04, 55.5) * p.roll * a - slow.roll) * k

      const tension =
        p.stressTilt * stress * (noise1(time * 1.7 + 17) + noise1(time * 3.1 + 2) * 0.5)
      out.x = slow.x + sx * a
      out.y = slow.y + (by + sy) * a
      out.z = slow.z + bz * a
      out.lookX = slow.lookX + sx * 3 * a
      out.lookY = slow.lookY + (by * 0.5 + sy * 3) * a
      out.roll = slow.roll + tension * a
      return out
    },
  }
}
