/** Tiny two-tone liquid field. Cheap CPU "shader" — more filaments via warp + fbm. */

export type MeterFluidParams = {
  speed: number
  threshold: number
  scaleX: number
  scaleY: number
  warp: number
  detail: number
  scanline: number
  color: string
  boostSpeed: number
  boostFill: number
}

/** Tuned defaults from Tweakpane (Meter / Protocol A / Cell B). */
export const FLUID_PRESETS = {
  meter: {
    speed: 0.16,
    threshold: 0.48,
    scaleX: 0.5,
    scaleY: 1,
    warp: 2.4,
    detail: 0.72,
    scanline: 0.62,
    color: '#22f08f',
    boostSpeed: 1.4,
    boostFill: 0.22,
  },
  protocolA: {
    speed: 0.2,
    threshold: 0.6,
    scaleX: 0.2,
    scaleY: 0.2,
    warp: 4,
    detail: 0.75,
    scanline: 0.62,
    color: '#22f08f',
    boostSpeed: 1.4,
    boostFill: 0.22,
  },
  cellB: {
    speed: 0.2,
    threshold: 0.48,
    scaleX: 0.5,
    scaleY: 0.5,
    warp: 1.55,
    detail: 0.5,
    scanline: 0.62,
    color: '#22f08f',
    boostSpeed: 1.4,
    boostFill: 0.22,
  },
} as const satisfies Record<string, MeterFluidParams>

export const DEFAULT_METER_FLUID_PARAMS: MeterFluidParams = { ...FLUID_PRESETS.meter }

function parseHexColor(hex: string): [number, number, number] {
  const raw = hex.replace('#', '')
  const full = raw.length === 3 ? raw.split('').map((c) => c + c).join('') : raw
  const value = Number.parseInt(full, 16)
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255]
}

function hash(x: number, y: number) {
  const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453
  return n - Math.floor(n)
}

function valueNoise(x: number, y: number) {
  const x0 = Math.floor(x)
  const y0 = Math.floor(y)
  const fx = x - x0
  const fy = y - y0
  const ux = fx * fx * (3 - 2 * fx)
  const uy = fy * fy * (3 - 2 * fy)
  const a = hash(x0, y0)
  const b = hash(x0 + 1, y0)
  const c = hash(x0, y0 + 1)
  const d = hash(x0 + 1, y0 + 1)
  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy
}

/** 3 octaves — macro swirls + medium veins + fine grit. */
function fbm(x: number, y: number) {
  return (
    valueNoise(x, y) * 0.5 +
    valueNoise(x * 2.05, y * 2.05) * 0.28 +
    valueNoise(x * 4.2, y * 4.2) * 0.15 +
    valueNoise(x * 8.4, y * 8.4) * 0.07
  )
}

export class MeterFluid {
  readonly canvas = document.createElement('canvas')
  private readonly ctx: CanvasRenderingContext2D
  private readonly image: ImageData
  private readonly width: number
  private readonly height: number

  constructor(width = 64, height = 176) {
    this.width = width
    this.height = height
    this.canvas.width = width
    this.canvas.height = height
    this.ctx = this.canvas.getContext('2d', { willReadFrequently: true })!
    this.image = this.ctx.createImageData(width, height)
  }

  /**
   * `boost` 0..1: short "excitement" burst — faster flow, stronger warp,
   * UV jitter, more fill, brighter green.
   */
  render(time: number, params: MeterFluidParams, boost = 0) {
    const { width, height, image } = this
    const data = image.data
    const [r, g, b] = parseHexColor(params.color)
    const speed = params.speed + boost * (params.boostSpeed + 0.8)
    const threshold = params.threshold - boost * params.boostFill
    const scaleX = params.scaleX * (1 + boost * 1.6)
    const scaleY = params.scaleY * (1 + boost * 1.6)
    const warp = params.warp + boost * 3.2
    const detail = Math.min(1, params.detail + boost * 0.35)
    const { scanline } = params
    const t = time * speed
    // Chaotic time kick so the field jumps instead of only speeding up.
    const chaos = boost * Math.sin(time * 28) * 0.55
    const bright = 1 + boost * 0.55

    for (let y = 0; y < height; y++) {
      const v = y / height + chaos * 0.08 * Math.sin(y * 0.35 + time * 12)
      const scan = 0.55 + 0.45 * (y % 2 === 0 ? scanline : 1)

      for (let x = 0; x < width; x++) {
        const u = x / width + chaos * 0.08 * Math.cos(x * 0.4 + time * 15)

        const qX = fbm(u * scaleX + t + chaos, v * scaleY - t * 0.4)
        const qY = fbm(u * scaleX + 4.1, v * scaleY + t * 0.35 - chaos)
        const rX = fbm(u * scaleX + warp * qX + t * 0.2, v * scaleY + warp * qY)
        const rY = fbm(u * scaleX + warp * qX + 2.7, v * scaleY + warp * qY - t * 0.15)

        let n = fbm(u * scaleX + warp * rX, v * scaleY + warp * rY)

        const filament = valueNoise(
          u * scaleX * (7 + boost * 6) + rX * 5 + t * (0.5 + boost * 2),
          v * scaleY * (11 + boost * 6) + rY * 5 - t * 0.3,
        )
        const ridges = 1 - Math.abs(filament * 2 - 1)
        n = n * (1 - detail * 0.45) + ridges * detail * 0.55

        const i = (y * width + x) * 4
        if (n > threshold + 0.1) {
          data[i] = Math.min(255, r * 1.08 * scan * bright)
          data[i + 1] = Math.min(255, g * 1.08 * scan * bright)
          data[i + 2] = Math.min(255, b * 1.08 * scan * bright)
          data[i + 3] = 255
        } else if (n > threshold) {
          const edge = (n - threshold) / 0.1
          const shade = (0.45 + edge * 0.55) * scan * bright
          data[i] = Math.min(255, r * shade)
          data[i + 1] = Math.min(255, g * shade)
          data[i + 2] = Math.min(255, b * shade)
          data[i + 3] = 255
        } else if (n > threshold - 0.04 * detail) {
          const wisp = ((n - (threshold - 0.04 * detail)) / (0.04 * detail)) * 0.35 * scan * bright
          data[i] = r * wisp
          data[i + 1] = g * wisp
          data[i + 2] = b * wisp
          data[i + 3] = 255
        } else {
          data[i] = 0
          data[i + 1] = 0
          data[i + 2] = 0
          data[i + 3] = 255
        }
      }
    }

    this.ctx.putImageData(image, 0, 0)
  }
}
