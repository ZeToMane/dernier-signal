import { BufferGeometry, Float32BufferAttribute, Group, LineBasicMaterial, LineSegments, Vector3 } from 'three'
import { PALETTE } from '../layout'

const PARALLELS = 9
const MERIDIANS = 12
const SEGMENTS = 64
const FLOAT_GAP = 0.09
const FLOAT_GAP_BOOST = 0.42
const FLOAT_SPEED = 1.1
const ROT_SPEED = 0.25
const ROT_SPEED_BOOST = 14
const BOOST_DURATION = 0.65

type BoostAnim = { elapsed: number; duration: number }

function circleSegments(
  pointAt: (angle: number) => Vector3,
  positions: number[],
  from = 0,
  to = Math.PI * 2,
) {
  const span = to - from
  for (let i = 0; i < SEGMENTS; i++) {
    const a = from + (i / SEGMENTS) * span
    const b = from + ((i + 1) / SEGMENTS) * span
    const pa = pointAt(a)
    const pb = pointAt(b)
    positions.push(pa.x, pa.y, pa.z, pb.x, pb.y, pb.z)
  }
}

function lines(positions: number[], material: LineBasicMaterial) {
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3))
  const segments = new LineSegments(geometry, material)
  segments.renderOrder = 1
  return segments
}

function buildHemisphere(material: LineBasicMaterial, northern: boolean) {
  const positions: number[] = []
  const latStart = northern ? Math.ceil(PARALLELS / 2) : 1
  const latEnd = northern ? PARALLELS : Math.floor(PARALLELS / 2)

  for (let i = latStart; i < latEnd; i++) {
    const latitude = (i / PARALLELS) * Math.PI - Math.PI / 2
    const y = Math.sin(latitude)
    const radius = Math.cos(latitude)
    circleSegments((a) => new Vector3(Math.cos(a) * radius, y, Math.sin(a) * radius), positions)
  }

  const from = northern ? 0 : Math.PI
  const to = northern ? Math.PI : Math.PI * 2
  for (let j = 0; j < MERIDIANS; j++) {
    const theta = (j / MERIDIANS) * Math.PI
    circleSegments(
      (a) => new Vector3(Math.cos(a) * Math.cos(theta), Math.sin(a), Math.cos(a) * Math.sin(theta)),
      positions,
      from,
      to,
    )
  }

  circleSegments((a) => new Vector3(Math.cos(a), 0, Math.sin(a)), positions)

  return lines(positions, material)
}

function burstEnvelope(anim: BoostAnim | null) {
  if (!anim) return 0
  const t = Math.min(1, anim.elapsed / anim.duration)
  if (t < 0.12) return t / 0.12
  if (t < 0.4) return 1
  return Math.max(0, 1 - (t - 0.4) / 0.6)
}

/** Soft in/out for the split — less snappy than the rotation boost. */
function gapEnvelope(anim: BoostAnim | null) {
  if (!anim) return 0
  const t = Math.min(1, anim.elapsed / anim.duration)
  // Ease out to open, hold, ease in to close.
  if (t < 0.35) {
    const u = t / 0.35
    return u * u * (3 - 2 * u)
  }
  if (t < 0.55) return 1
  const u = (t - 0.55) / 0.45
  const s = u * u * (3 - 2 * u)
  return 1 - s
}

const APPEAR_DELAY = 0.28
const APPEAR_DURATION = 0.55

function easeOutBack(t: number) {
  const c = 1.45
  const t1 = t - 1
  return 1 + c * t1 * t1 * t1 + (c - 1) * t1 * t1
}

/** Wireframe globe split at the equator — halves float apart / together. */
export function createGlobe() {
  const material = new LineBasicMaterial({
    color: PALETTE.green,
    transparent: true,
    opacity: 0,
    depthTest: false,
    toneMapped: false,
  })

  const upper = buildHemisphere(material, true)
  const lower = buildHemisphere(material, false)

  const group = new Group()
  group.add(upper, lower)

  let boost: BoostAnim | null = null
  let rotationY = 0
  let gapCurrent = 0
  let power = 0
  let powerTarget = 0
  /** World scale set from main — appear multiplies on top. */
  let baseScale = 1
  /** Seconds since setPowered(true); drives delayed scale-in. */
  let appearElapsed = 0
  group.visible = false
  group.scale.setScalar(0)

  const appear01 = () => {
    if (powerTarget < 0.5) return 0
    const raw = (appearElapsed - APPEAR_DELAY) / APPEAR_DURATION
    if (raw <= 0) return 0
    return easeOutBack(Math.min(1, raw))
  }

  return {
    group,
    setScale(scale: number) {
      baseScale = scale
      group.scale.setScalar(baseScale * appear01())
    },
    triggerBoost() {
      boost = { elapsed: 0, duration: BOOST_DURATION }
    },
    setPowered(on: boolean) {
      if (on) {
        if (powerTarget < 0.5) appearElapsed = 0
        powerTarget = 1
      } else {
        powerTarget = 0
        power = 0
        appearElapsed = 0
        group.scale.setScalar(0)
        material.opacity = 0
      }
    },
    update(time: number, dt: number) {
      if (powerTarget > 0.5) appearElapsed += dt

      const appear = appear01()
      power += (powerTarget * Math.min(1, appear / 0.85) - power) * Math.min(1, dt * 5)
      if (powerTarget === 1 && appear >= 1 && power > 0.995) power = 1

      group.visible = power > 0.01 || appear > 0.01
      group.scale.setScalar(baseScale * appear)

      // Flickers while materializing, then settles.
      const warming = appear < 1 || power < 1
      const flicker = warming && Math.random() < 0.28 ? 0.2 : 1
      material.opacity = 0.85 * power * flicker

      if (boost) {
        boost.elapsed += dt
        if (boost.elapsed >= boost.duration) boost = null
      }

      const spinBoost = burstEnvelope(boost)
      const splitBoost = gapEnvelope(boost)
      // Spin a bit faster while appearing so it feels like the sphere is booting.
      const appearSpin = appear < 1 ? (1 - appear) * 6 : 0
      rotationY += dt * (ROT_SPEED + appearSpin + spinBoost * (ROT_SPEED_BOOST - ROT_SPEED))

      const idleGap = (0.5 + 0.5 * Math.sin(time * FLOAT_SPEED)) * FLOAT_GAP
      const gapTarget = idleGap + (FLOAT_GAP_BOOST - idleGap) * splitBoost
      // Extra lerp so the split eases instead of snapping with the spin.
      gapCurrent += (gapTarget - gapCurrent) * Math.min(1, dt * 6)

      upper.position.y = gapCurrent
      lower.position.y = -gapCurrent
      upper.rotation.y = rotationY
      lower.rotation.y = rotationY
    },
  }
}
