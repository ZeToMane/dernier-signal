import { MeshStandardMaterial, type Material, type Object3D, type Texture } from 'three'

const MAP_KEYS = [
  'map',
  'normalMap',
  'roughnessMap',
  'metalnessMap',
  'aoMap',
  'emissiveMap',
  'bumpMap',
  'displacementMap',
  'alphaMap',
  'lightMap',
] as const

type MapKey = (typeof MAP_KEYS)[number]

/** Maps pulled off each material, so the toggle can put them back. */
const stripped = new WeakMap<Material, Partial<Record<MapKey, Texture>>>()

/**
 * Debug: strip (or restore) every texture map on the standard materials under
 * `root` — raw shading only. Textures in `keep` (e.g. the live HUD) stay on.
 */
export function setTexturesEnabled(root: Object3D, enabled: boolean, keep: Texture[] = []) {
  root.traverse((obj) => {
    const material = (obj as { material?: Material | Material[] }).material
    if (!material) return
    for (const m of Array.isArray(material) ? material : [material]) {
      if (!(m instanceof MeshStandardMaterial)) continue
      if (enabled) {
        const saved = stripped.get(m)
        if (!saved) continue
        Object.assign(m, saved)
        stripped.delete(m)
      } else {
        if (stripped.has(m)) continue
        const saved: Partial<Record<MapKey, Texture>> = {}
        for (const key of MAP_KEYS) {
          const texture = m[key]
          if (!texture || keep.includes(texture)) continue
          saved[key] = texture
          m[key] = null
        }
        stripped.set(m, saved)
      }
      m.needsUpdate = true
    }
  })
}
