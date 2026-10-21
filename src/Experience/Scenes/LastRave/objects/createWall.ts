import { CanvasTexture, Mesh, MeshStandardMaterial, PlaneGeometry, SRGBColorSpace } from 'three'

const WALL_WIDTH = 16
const WALL_HEIGHT = 9

function seededRandom(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function createWallTexture() {
  const canvas = document.createElement('canvas')
  canvas.width = 2048
  canvas.height = 1152
  const ctx = canvas.getContext('2d')!
  const random = seededRandom(7)

  ctx.fillStyle = '#080a09'
  ctx.fillRect(0, 0, canvas.width, canvas.height)

  for (let y = 0; y < canvas.height; ) {
    const rowHeight = 60 + random() * 140
    for (let x = 0; x < canvas.width; ) {
      const panelWidth = 80 + random() * 220
      const shade = 10 + Math.floor(random() * 10)
      ctx.fillStyle = `rgb(${shade}, ${shade + 3}, ${shade + 2})`
      ctx.fillRect(x + 3, y + 3, panelWidth - 6, rowHeight - 6)
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.03)'
      ctx.lineWidth = 1
      ctx.strokeRect(x + 5, y + 5, panelWidth - 10, rowHeight - 10)
      x += panelWidth
    }
    y += rowHeight
  }

  ctx.strokeStyle = 'rgba(40, 255, 160, 0.07)'
  ctx.lineWidth = 2
  for (let i = 0; i < 70; i++) {
    let x = random() * canvas.width
    let y = random() * canvas.height
    ctx.beginPath()
    ctx.moveTo(x, y)
    for (let step = 0; step < 4; step++) {
      if (random() > 0.5) x += (random() - 0.5) * 300
      else y += (random() - 0.5) * 300
      ctx.lineTo(x, y)
    }
    ctx.stroke()
  }

  const grain = ctx.getImageData(0, 0, canvas.width, canvas.height)
  for (let i = 0; i < grain.data.length; i += 4) {
    const noise = (random() - 0.5) * 14
    grain.data[i] += noise
    grain.data[i + 1] += noise
    grain.data[i + 2] += noise
  }
  ctx.putImageData(grain, 0, 0)

  const texture = new CanvasTexture(canvas)
  texture.colorSpace = SRGBColorSpace
  return texture
}

export function createWall() {
  return new Mesh(
    new PlaneGeometry(WALL_WIDTH, WALL_HEIGHT),
    new MeshStandardMaterial({ map: createWallTexture(), roughness: 0.85, metalness: 0.2 }),
  )
}
