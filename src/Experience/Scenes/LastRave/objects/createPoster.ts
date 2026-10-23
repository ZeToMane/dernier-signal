import {
  Color,
  DoubleSide,
  Mesh,
  PlaneGeometry,
  ShaderMaterial,
  Vector3,
  type Texture,
} from 'three'

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
  /** How long the wind sound plays before the poster takes off (seconds). */
  windSoundLead: number
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
  y: -0.2,
  z: 0.121,
  rotX: 0,
  rotY: 0,
  rotZ: -0.1,
  windSoundLead: 0.1,
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
  uniform sampler2D uMap;
  uniform sampler2D uNormalMap;
  uniform sampler2D uRoughnessMap;
  uniform float uHasMap;
  uniform float uHasNormal;
  uniform float uHasRoughness;
  uniform float uNormalScale;

  // Scene lights (view space) — same bunkers lights as the concrete wall.
  uniform vec3 uAmbient;
  uniform vec3 uKeyColor;
  uniform vec3 uKeyDir;
  uniform vec3 uRoomColor;
  uniform vec3 uRoomPos;
  uniform float uRoomDistance;
  uniform float uRoomDecay;
  uniform vec3 uGlowColor;
  uniform vec3 uGlowPos;
  uniform float uGlowIntensity;
  uniform float uGlowDistance;
  uniform float uGlowDecay;

  varying vec2 vUv;
  varying vec3 vViewPos;

  vec3 perturbNormal(vec3 N, vec3 mapN) {
    vec3 dp1 = dFdx(vViewPos);
    vec3 dp2 = dFdy(vViewPos);
    vec2 duv1 = dFdx(vUv);
    vec2 duv2 = dFdy(vUv);
    vec3 dp2perp = cross(dp2, N);
    vec3 dp1perp = cross(N, dp1);
    vec3 T = dp2perp * duv1.x + dp1perp * duv2.x;
    vec3 B = dp2perp * duv1.y + dp1perp * duv2.y;
    // Guard: degenerate derivatives (grazing / sub-pixel) would give inf → NaN.
    float invmax = inversesqrt(max(max(dot(T, T), dot(B, B)), 1e-12));
    return normalize(mat3(T * invmax, B * invmax, N) * mapN);
  }

  float punctualAttenuation(float dist, float cutoff, float decay) {
    float atten = 1.0 / max(pow(dist, max(decay, 0.01)), 0.01);
    if (cutoff > 0.0) {
      float ratio = clamp(1.0 - pow(dist / cutoff, 4.0), 0.0, 1.0);
      atten *= ratio * ratio;
    }
    return atten;
  }

  void main() {
    vec3 cr = cross(dFdx(vViewPos), dFdy(vViewPos));
    float crLen = length(cr);
    vec3 geoN = crLen > 1e-10 ? cr / crLen : vec3(0.0, 0.0, 1.0);
    vec3 n = geoN;
    if (uHasNormal > 0.5) {
      vec3 mapN = texture2D(uNormalMap, vUv).xyz * 2.0 - 1.0;
      mapN.xy *= uNormalScale;
      n = perturbNormal(geoN, mapN);
    }
    if (!gl_FrontFacing) n = -n;

    vec4 texel = uHasMap > 0.5 ? texture2D(uMap, vUv) : vec4(uPaper, 1.0);
    if (texel.a < 0.02) discard;
    vec3 base = texel.rgb;
    if (!gl_FrontFacing) base = uPaper * 0.7;

    float rough = uHasRoughness > 0.5 ? texture2D(uRoughnessMap, vUv).r : 0.75;
    rough = clamp((rough - 0.35) * 1.7 + 0.35, 0.0, 1.0);
    float gloss = 1.0 - rough;

    vec3 lit = uAmbient;

    float kd = max(0.0, dot(n, uKeyDir));
    lit += uKeyColor * kd;
    vec3 Hk = normalize(uKeyDir + vec3(0.0, 0.0, 1.0));
    lit += uKeyColor * pow(max(0.0, dot(n, Hk)), mix(6.0, 32.0, gloss)) * gloss * 0.25;

    vec3 toRoom = uRoomPos - vViewPos;
    float roomDist = length(toRoom);
    vec3 Lr = toRoom / max(roomDist, 1e-4);
    float roomAtten = punctualAttenuation(roomDist, uRoomDistance, uRoomDecay);
    float rd = max(0.0, dot(n, Lr));
    lit += uRoomColor * rd * roomAtten;

    if (uGlowIntensity > 0.001) {
      vec3 toGlow = uGlowPos - vViewPos;
      float glowDist = length(toGlow);
      vec3 Lg = toGlow / max(glowDist, 1e-4);
      float glowAtten = punctualAttenuation(glowDist, uGlowDistance, uGlowDecay);
      float gd = max(0.0, dot(n, Lg));
      lit += uGlowColor * uGlowIntensity * (gd * 0.85 + 0.15) * glowAtten;
    }

    vec3 color = base * lit;
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
      uMap: { value: null as Texture | null },
      uNormalMap: { value: null as Texture | null },
      uRoughnessMap: { value: null as Texture | null },
      uHasMap: { value: 0 },
      uHasNormal: { value: 0 },
      uHasRoughness: { value: 0 },
      uNormalScale: { value: 1.45 },
      uAmbient: { value: new Color(0, 0, 0) },
      uKeyColor: { value: new Color(0, 0, 0) },
      uKeyDir: { value: new Vector3(0.3, 0.5, 0.8) },
      uRoomColor: { value: new Color(0, 0, 0) },
      uRoomPos: { value: new Vector3(0, 0, 1.4) },
      uRoomDistance: { value: 8 },
      uRoomDecay: { value: 2 },
      uGlowColor: { value: new Color('#22f08f') },
      uGlowPos: { value: new Vector3(0, 0, 0.55) },
      uGlowIntensity: { value: 0 },
      uGlowDistance: { value: 7 },
      uGlowDecay: { value: 1.4 },
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
  let normalEnabled = true

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
    setNormalMap(texture: Texture | null, scale = 1.45) {
      if (gone) return
      material.uniforms.uNormalMap.value = texture
      material.uniforms.uNormalScale.value = scale
      material.uniforms.uHasNormal.value = texture && normalEnabled ? 1 : 0
    },
    /** Debug: show / hide the normal map without unloading it. */
    setNormalEnabled(enabled: boolean) {
      if (gone) return
      normalEnabled = enabled
      const hasMap = material.uniforms.uNormalMap.value != null
      material.uniforms.uHasNormal.value = enabled && hasMap ? 1 : 0
    },
    setRoughnessMap(texture: Texture | null) {
      if (gone) return
      material.uniforms.uRoughnessMap.value = texture
      material.uniforms.uHasRoughness.value = texture ? 1 : 0
    },
    fitHeight(height: number) {
      viewHeight = height
      if (!gone && !flight) applyRest()
    },
    /** Sync bunker lights (view-space positions / dirs) so the paper matches the wall. */
    setSceneLights(lights: {
      ambient: Color
      keyColor: Color
      keyDir: Vector3
      roomColor: Color
      roomPos: Vector3
      roomDistance: number
      roomDecay: number
      glowColor: Color
      glowPos: Vector3
      glowIntensity: number
      glowDistance: number
      glowDecay: number
    }) {
      if (gone) return
      const u = material.uniforms
      ;(u.uAmbient.value as Color).copy(lights.ambient)
      ;(u.uKeyColor.value as Color).copy(lights.keyColor)
      ;(u.uKeyDir.value as Vector3).copy(lights.keyDir).normalize()
      ;(u.uRoomColor.value as Color).copy(lights.roomColor)
      ;(u.uRoomPos.value as Vector3).copy(lights.roomPos)
      u.uRoomDistance.value = lights.roomDistance
      u.uRoomDecay.value = lights.roomDecay
      ;(u.uGlowColor.value as Color).copy(lights.glowColor)
      ;(u.uGlowPos.value as Vector3).copy(lights.glowPos)
      u.uGlowIntensity.value = lights.glowIntensity
      u.uGlowDistance.value = lights.glowDistance
      u.uGlowDecay.value = lights.glowDecay
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
