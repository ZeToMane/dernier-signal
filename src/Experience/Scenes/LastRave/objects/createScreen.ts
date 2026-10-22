import {
  Color,
  Group,
  Mesh,
  MeshStandardMaterial,
  NoColorSpace,
  PlaneGeometry,
  type Texture,
} from 'three'
import { SCREEN_HEIGHT, SCREEN_WIDTH } from '../layout'

/** Slight offset so the HUD plane sits in front of the wall. */
export const SCREEN_SURFACE_Z = 0.051

const OVERLAY_OPACITY = 0.4

export type Screen = ReturnType<typeof createScreen>

export function createScreen(hudTexture: Texture) {
  const group = new Group()
  let roughnessEnabled = true
  let roughnessMap: Texture | null = null
  let overlayMap: Texture | null = null

  const material = new MeshStandardMaterial({
    map: hudTexture,
    roughness: 1,
    metalness: 0,
    toneMapped: false,
    // Keep HUD readable in the dark bunker while roughness still catches lights.
    emissive: new Color('#ffffff'),
    emissiveMap: hudTexture,
    emissiveIntensity: 0.55,
  })

  material.onBeforeCompile = (shader) => {
    shader.uniforms.uOverlay = { value: overlayMap }
    shader.uniforms.uHasOverlay = { value: overlayMap ? 1 : 0 }
    shader.uniforms.uOverlayOpacity = { value: OVERLAY_OPACITY }
    material.userData.shader = shader

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        /* glsl */ `
        #include <common>
        uniform sampler2D uOverlay;
        uniform float uHasOverlay;
        uniform float uOverlayOpacity;

        float softLightChannel(float base, float blend) {
          return blend < 0.5
            ? (2.0 * base * blend + base * base * (1.0 - 2.0 * blend))
            : (sqrt(base) * (2.0 * blend - 1.0) + 2.0 * base * (1.0 - blend));
        }
        `,
      )
      .replace(
        '#include <map_fragment>',
        /* glsl */ `
        #include <map_fragment>
        #ifdef USE_MAP
          if (uHasOverlay > 0.5) {
            vec3 over = texture2D(uOverlay, vMapUv).rgb;
            vec3 soft = vec3(
              softLightChannel(diffuseColor.r, over.r),
              softLightChannel(diffuseColor.g, over.g),
              softLightChannel(diffuseColor.b, over.b)
            );
            diffuseColor.rgb = mix(diffuseColor.rgb, soft, uOverlayOpacity);
          }
        #endif
        `,
      )
  }

  const surface = new Mesh(
    new PlaneGeometry(SCREEN_WIDTH, SCREEN_HEIGHT),
    material,
  )
  surface.position.z = SCREEN_SURFACE_Z
  group.add(surface)

  const applyRoughness = () => {
    if (roughnessMap) roughnessMap.colorSpace = NoColorSpace
    material.roughnessMap = roughnessEnabled ? roughnessMap : null
    material.roughness = 1
    material.metalness = 0
    material.needsUpdate = true
  }

  const syncOverlayUniforms = () => {
    const shader = material.userData.shader as
      | { uniforms: Record<string, { value: unknown }> }
      | undefined
    if (!shader) return
    shader.uniforms.uOverlay.value = overlayMap
    shader.uniforms.uHasOverlay.value = overlayMap ? 1 : 0
  }

  return {
    group,
    setOverlay(texture: Texture | null) {
      overlayMap = texture
      syncOverlayUniforms()
    },
    setRoughnessMap(texture: Texture | null) {
      roughnessMap = texture
      applyRoughness()
    },
    setRoughnessEnabled(enabled: boolean) {
      roughnessEnabled = enabled
      applyRoughness()
    },
  }
}
