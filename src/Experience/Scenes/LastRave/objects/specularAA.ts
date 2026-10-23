import { MeshStandardMaterial, type Material, type Object3D } from 'three'

/**
 * Shared strength for every patched material (0 = off, 1 = standard).
 * Debug slider writes `.value` directly — no recompile.
 */
export const specularAA = { value: 1 }

const PATCHED = Symbol('specularAA')

/**
 * Specular anti-aliasing (Kaplanyan / Tokuyoshi): where the shading normal
 * changes a lot inside one pixel (fine normal maps, distant detail), widen the
 * highlight by raising roughness. Kills the sparkle / shimmer on reflective
 * texels when the camera moves; flat areas are untouched.
 */
export function applySpecularAA(material: Material) {
  if (!(material instanceof MeshStandardMaterial)) return
  const tagged = material as MeshStandardMaterial & { [PATCHED]?: true }
  if (tagged[PATCHED]) return
  tagged[PATCHED] = true

  const previous = material.onBeforeCompile.bind(material)
  material.onBeforeCompile = (shader, renderer) => {
    previous(shader, renderer)
    shader.uniforms.uSpecularAA = specularAA
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uSpecularAA;')
      .replace(
        '#include <normal_fragment_maps>',
        /* glsl */ `
        #include <normal_fragment_maps>
        {
          vec3 dndx = dFdx(normal);
          vec3 dndy = dFdy(normal);
          float variance = 0.25 * (dot(dndx, dndx) + dot(dndy, dndy));
          float kernel = min(2.0 * variance * uSpecularAA, 0.18 * uSpecularAA);
          roughnessFactor = sqrt(clamp(roughnessFactor * roughnessFactor + kernel, 0.0, 1.0));
        }
        `,
      )
  }
  const previousKey = material.customProgramCacheKey.bind(material)
  material.customProgramCacheKey = () => `${previousKey()}|specAA`
  material.needsUpdate = true
}

/** Patch every standard material under `root` (arrays included). */
export function applySpecularAATo(root: Object3D) {
  root.traverse((obj) => {
    const material = (obj as { material?: Material | Material[] }).material
    if (!material) return
    for (const m of Array.isArray(material) ? material : [material]) applySpecularAA(m)
  })
}
