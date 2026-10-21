import { Color, DoubleSide, Mesh, PlaneGeometry, ShaderMaterial, type Texture } from 'three'

/** A-series portrait ratio (height / width). */
export const POSTER_RATIO = Math.SQRT2

export type PosterParams = {
  /** Multiplier on the auto viewport height (1 = fits the view). */
  height: number
  x: number
  y: number
  z: number
  rotX: number
  rotY: number
  rotZ: number
  /** Wind-wave duration (seconds). */
  windDuration: number
  /** How long the camera gust leads the paper swell (seconds). */
  windLead: number
  /** Wind-wave strength. */
  wind: number
  /** Slide duration in seconds. */
  duration: number
  /** Soft paper bend while leaving. */
  peel: number
  /** Travel to the right. */
  drift: number
  /** Travel downward. */
  fall: number
  /** Travel toward the camera (off the wall). */
  out: number
  /** Camera punch to the right. */
  windCamX: number
  /** Camera punch downward. */
  windCamY: number
  /** Camera pull-back during the punch (toward viewer). */
  windCamZ: number
  /** Optional roll during the punch (secondary). */
  windCamRoll: number
  /** How long the snap takes (seconds). */
  windCamHit: number
  /** How long the dazed recenter takes (seconds). */
  windCamRecover: number
}

export const DEFAULT_POSTER_PARAMS: PosterParams = {
  height: 1.4,
  x: 0.1,
  y: 0,
  z: 0.121,
  rotX: 0,
  rotY: 0,
  rotZ: -0.1,
  windDuration: 0.55,
  windLead: 0.04,
  wind: 0.9,
  duration: 1.35,
  peel: 5,
  drift: 1.85,
  fall: 8,
  out: 1.75,
  windCamX: 0.75,
  windCamY: 0.42,
  windCamZ: 0.22,
  windCamRoll: 0.2,
  windCamHit: 0.2,
  windCamRecover: 2,
}

const vertexShader = /* glsl */ `
  uniform float uPeel;
  uniform float uWind;
  uniform float uWindT;

  varying vec2 vUv;
  varying vec3 vViewPos;

  void main() {
    vUv = uv;
    vec3 p = position;
    float fromBottom = 1.0 - uv.y;

    // Soft broad swell traveling left → right — long curve, not a ball bump.
    float crest = mix(-0.35, 1.35, uWindT);
    float dist = (uv.x - crest) / 0.75;
    float lobe = max(0.0, cos(dist * 3.14159 * 0.5));
    lobe *= lobe;
    float edge = smoothstep(0.0, 0.06, uv.y) * smoothstep(0.0, 0.06, 1.0 - uv.y);
    p.z += lobe * uWind * 0.14 * edge;
    p.y += lobe * uWind * 0.018 * edge;

    // Side-view curl: top stays on the wall, bottom bends away more and more.
    float lift = uPeel * fromBottom * fromBottom;
    p.z += lift * 0.7;
    p.y += lift * 0.1;

    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    vViewPos = mv.xyz;
    gl_Position = projectionMatrix * mv;
  }
`

const fragmentShader = /* glsl */ `
  uniform vec3 uPaper;
  uniform vec3 uGlowColor;
  uniform sampler2D uMap;
  uniform float uHasMap;
  uniform float uLight;
  uniform float uGlow;

  varying vec2 vUv;
  varying vec3 vViewPos;

  void main() {
    vec3 n = normalize(cross(dFdx(vViewPos), dFdy(vViewPos)));
    vec4 texel = uHasMap > 0.5 ? texture2D(uMap, vUv) : vec4(uPaper, 1.0);
    // Only real alpha — never key RGB blacks (they're part of the artwork).
    if (texel.a < 0.02) discard;
    vec3 base = texel.rgb;
    if (!gl_FrontFacing) base = uPaper * 0.7;

    float shade = 0.55 + 0.45 * abs(n.z);
    vec3 color = base * shade * uLight + uGlowColor * uGlow * (0.4 + 0.6 * abs(n.z));
    gl_FragColor = vec4(color, texel.a);

    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`

export type Poster = ReturnType<typeof createPoster>

/** Blank poster taped on the wall — wind wave, then slide right and down. */
export function createPoster(params: PosterParams = { ...DEFAULT_POSTER_PARAMS }) {
  const material = new ShaderMaterial({
    uniforms: {
      uPeel: { value: 0 },
      uWind: { value: 0 },
      uWindT: { value: 0 },
      uPaper: { value: new Color('#d9d3c5') },
      uGlowColor: { value: new Color('#22f08f') },
      uMap: { value: null as Texture | null },
      uHasMap: { value: 0 },
      uLight: { value: 0.42 },
      uGlow: { value: 0 },
    },
    vertexShader,
    fragmentShader,
    side: DoubleSide,
    transparent: true,
    depthWrite: false,
  })

  const mesh = new Mesh(new PlaneGeometry(1, POSTER_RATIO, 40, 56), material)
  mesh.renderOrder = 2

  let flight: { elapsed: number } | null = null
  let viewHeight = POSTER_RATIO
  let gone = false

  const applyRest = () => {
    mesh.scale.setScalar((viewHeight * params.height) / POSTER_RATIO)
    mesh.position.set(params.x, params.y, params.z)
    mesh.rotation.set(params.rotX, params.rotY, params.rotZ)
    material.uniforms.uPeel.value = 0
    material.uniforms.uWind.value = 0
    material.uniforms.uWindT.value = 0
    mesh.visible = true
  }

  const dispose = () => {
    if (gone) return
    gone = true
    flight = null
    mesh.removeFromParent()
    mesh.geometry.dispose()
    const map = material.uniforms.uMap.value as Texture | null
    if (map) map.dispose()
    material.dispose()
  }

  applyRest()

  return {
    mesh,
    params,
    get flying() {
      return flight !== null
    },
    get gone() {
      return gone
    },
    /**
     * Camera gust — sharp hit at t≈0, then decays (paper swell follows after `windLead`).
     */
    get windGust() {
      if (gone || !flight) return { strength: 0, t: 0 }
      const windDur = Math.max(0.05, params.windDuration)
      const e = flight.elapsed
      if (e <= 0 || e >= windDur) return { strength: 0, t: Math.min(1, e / windDur) }
      const t = e / windDur
      // Fast attack (not a sine from 0) so the shake is readable immediately.
      const attack = Math.min(1, e / 0.04)
      const decay = Math.exp(-t * 2.8)
      return { strength: attack * decay, t }
    },
    setMap(texture: Texture | null) {
      if (gone) return
      material.uniforms.uMap.value = texture
      material.uniforms.uHasMap.value = texture ? 1 : 0
    },
    fitHeight(height: number) {
      viewHeight = height
      if (!gone && !flight) applyRest()
    },
    setGlow(value: number) {
      if (gone) return
      material.uniforms.uGlow.value = value
    },
    fly() {
      if (gone || flight) return
      flight = { elapsed: 0 }
    },
    /** Put the poster back (only if it was never disposed). */
    reset() {
      if (gone) return false
      flight = null
      applyRest()
      return true
    },
    dispose,
    update(_time: number, dt: number) {
      if (gone) return

      if (!flight) {
        applyRest()
        return
      }

      flight.elapsed += dt
      const e = flight.elapsed
      const slideDur = Math.max(0.2, params.duration)
      // Same clock as the camera punch — detach at peak offset (Punch hit).
      const slideStart = Math.max(0.02, params.windCamHit)

      material.uniforms.uWindT.value = 0
      material.uniforms.uWind.value = 0

      if (e < slideStart) {
        // Gust reaching the paper: bottom edge peels off smoothly (no oscillation).
        const build = e / slideStart
        material.uniforms.uPeel.value = params.peel * 0.12 * build * build
        mesh.position.set(params.x, params.y, params.z)
        mesh.rotation.set(params.rotX, params.rotY, params.rotZ)
        return
      }

      const s = e - slideStart
      const slideT = Math.min(1, s / slideDur)
      // Curl grows from the pre-peel amount; light air flutter on top.
      const curl = 0.12 + 0.88 * (1 - (1 - slideT) * (1 - slideT))
      const flutter = Math.sin(s * 21) * 0.09 * (1 - slideT)
      material.uniforms.uPeel.value = params.peel * Math.max(0.12, curl + flutter)

      // Wind gives the push sideways (fast, then fades); gravity takes over downward.
      const push = (1 - Math.exp(-slideT * 3.2)) / (1 - Math.exp(-3.2))
      const gravity = slideT * slideT
      const scale = mesh.scale.x
      mesh.position.set(
        params.x + params.drift * push * scale,
        params.y - params.fall * gravity * scale,
        params.z + params.out * push * scale + 0.03 * curl * scale,
      )
      mesh.rotation.set(
        params.rotX,
        params.rotY,
        params.rotZ - 0.3 * gravity + Math.sin(s * 9) * 0.035 * (1 - slideT),
      )

      if (slideT >= 1) dispose()
    },
  }
}
