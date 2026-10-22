import {
  HalfFloatType,
  Uniform,
  Vector2,
  type Camera,
  type Scene,
  type WebGLRenderer,
} from 'three'
import {
  BloomEffect,
  ChromaticAberrationEffect,
  Effect,
  EffectAttribute,
  EffectComposer,
  EffectPass,
  GlitchEffect,
  GlitchMode,
  RenderPass,
  SMAAEffect,
  SMAAPreset,
  ToneMappingEffect,
  ToneMappingMode,
  VignetteEffect,
} from 'postprocessing'

export type PostFxParams = {
  enabled: boolean
  /** Max render pixel ratio (Retina = 2). Every post pass re-reads the full frame, so this is the big perf lever. */
  resolution: number
  /**
   * MSAA on the scene render. Off by default: multisampled half-float targets
   * flash black blocks on Apple GPUs + Chrome — SMAA (post, final image) instead.
   */
  msaa: boolean
  smaa: boolean
  exposure: number
  bloom: { enabled: boolean; intensity: number; threshold: number; smoothing: number; radius: number }
  vignette: { enabled: boolean; offset: number; darkness: number }
  /** Chromatic aberration: tiny at rest, spikes on events (`kick`). */
  chroma: { enabled: boolean; base: number; peak: number; decay: number }
  /** Radial blur toward the corners — foreground cables feel in front of the lens. */
  edgeBlur: { enabled: boolean; start: number; strength: number }
  glitch: { enabled: boolean; duration: number }
  /** Barrel lens: center bulges, corners stay pinned (no black borders). */
  fisheye: { enabled: boolean; strength: number }
}

export const DEFAULT_POSTFX_PARAMS: PostFxParams = {
  enabled: true,
  resolution: 1.5,
  msaa: false,
  smaa: true,
  exposure: 1,
  bloom: { enabled: true, intensity: 1.1, threshold: 0.55, smoothing: 0.25, radius: 0.7 },
  vignette: { enabled: true, offset: 0.32, darkness: 0.6 },
  chroma: { enabled: true, base: 0.0005, peak: 0.012, decay: 3.5 },
  edgeBlur: { enabled: true, start: 0.55, strength: 6 },
  glitch: { enabled: true, duration: 0.28 },
  fisheye: { enabled: true, strength: 0.08 },
}

const edgeBlurShader = /* glsl */ `
  uniform float uStart;
  uniform float uStrength;

  void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
    vec2 p = (uv - 0.5) * vec2(aspect, 1.0);
    float d = length(p) / length(vec2(0.5 * aspect, 0.5));
    float k = smoothstep(uStart, 1.0, d);
    if (k < 0.001 || uStrength < 0.01) {
      outputColor = inputColor;
      return;
    }
    // Golden-angle disc, radius grows toward the corners.
    float r = k * uStrength;
    vec4 acc = inputColor;
    for (int i = 0; i < 12; i++) {
      float fi = float(i);
      float a = fi * 2.39996;
      float rr = r * sqrt((fi + 0.5) / 12.0);
      acc += texture2D(inputBuffer, uv + vec2(cos(a), sin(a)) * rr * texelSize);
    }
    outputColor = acc / 13.0;
  }
`

class EdgeBlurEffect extends Effect {
  constructor() {
    super('EdgeBlurEffect', edgeBlurShader, {
      attributes: EffectAttribute.CONVOLUTION,
      uniforms: new Map<string, Uniform>([
        ['uStart', new Uniform(0.55)],
        ['uStrength', new Uniform(6)],
      ]),
    })
  }
}

const fisheyeShader = /* glsl */ `
  uniform float uStrength;

  void mainUv(inout vec2 uv) {
    // Aspect-correct radius; corners (r = rMax) map onto themselves.
    vec2 d = (uv - 0.5) * vec2(aspect, 1.0);
    float r2 = dot(d, d);
    float rMax2 = dot(vec2(0.5 * aspect, 0.5), vec2(0.5 * aspect, 0.5));
    float f = (1.0 + uStrength * r2) / (1.0 + uStrength * rMax2);
    uv = 0.5 + (uv - 0.5) * f;
  }

  // inputColor is already sampled at the warped uv. Also scrubs NaN / inf / huge
  // values so one bad pixel can't smear black blocks through the bloom mips.
  void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
    vec4 c = inputColor;
    if (any(isnan(c)) || any(isinf(c))) c = vec4(0.0, 0.0, 0.0, 1.0);
    outputColor = clamp(c, 0.0, 64.0);
  }
`

class FisheyeEffect extends Effect {
  constructor() {
    super('FisheyeEffect', fisheyeShader, {
      uniforms: new Map<string, Uniform>([['uStrength', new Uniform(0.25)]]),
    })
  }
}

export type PostFx = ReturnType<typeof createPostFx>

/**
 * Bunker post chain: fisheye → edge blur → glitch (drop only) → bloom / chroma / tone map /
 * vignette. Everything tweakable live through `params`.
 */
export function createPostFx(
  renderer: WebGLRenderer,
  scene: Scene,
  camera: Camera,
  params: PostFxParams = structuredClone(DEFAULT_POSTFX_PARAMS),
) {
  const composer = new EffectComposer(renderer, {
    frameBufferType: HalfFloatType,
    // MSAA on the scene render — the post chain disables the canvas antialias.
    multisampling: params.msaa ? Math.min(4, renderer.capabilities.maxSamples) : 0,
  })
  const msaaSamples = Math.min(4, renderer.capabilities.maxSamples)
  composer.addPass(new RenderPass(scene, camera))

  // UV warp + NaN scrub — own pass so later convolutions read the warped image.
  // Always on (strength 0 = identity) so the scrub never drops out of the chain.
  const fisheye = new FisheyeEffect()
  const fisheyePass = new EffectPass(camera, fisheye)
  composer.addPass(fisheyePass)

  const edgeBlur = new EdgeBlurEffect()
  const edgePass = new EffectPass(camera, edgeBlur)
  composer.addPass(edgePass)

  const chromaOffset = new Vector2()
  const glitch = new GlitchEffect({ strength: new Vector2(0.15, 0.6), columns: 0.04, ratio: 0.85 })
  glitch.mode = GlitchMode.DISABLED
  const glitchPass = new EffectPass(camera, glitch)
  // Only runs while a glitch plays (it's not the last pass, so toggling is safe).
  glitchPass.enabled = false
  composer.addPass(glitchPass)

  // Antialias (own pass: SMAA is a convolution). Kept before the last pass —
  // toggling the final pass off would leave nothing rendering to screen.
  const smaaPass = new EffectPass(camera, new SMAAEffect({ preset: SMAAPreset.HIGH }))
  smaaPass.enabled = params.smaa
  composer.addPass(smaaPass)

  const bloom = new BloomEffect({
    mipmapBlur: true,
    intensity: params.bloom.intensity,
    luminanceThreshold: params.bloom.threshold,
    luminanceSmoothing: params.bloom.smoothing,
    radius: params.bloom.radius,
  })
  const chroma = new ChromaticAberrationEffect({
    offset: chromaOffset,
    radialModulation: true,
    modulationOffset: 0.2,
  })
  const toneMapping = new ToneMappingEffect({ mode: ToneMappingMode.ACES_FILMIC })
  const vignette = new VignetteEffect({ offset: params.vignette.offset, darkness: params.vignette.darkness })

  // Bloom reads HDR (before tone mapping); vignette sits on the final image.
  composer.addPass(new EffectPass(camera, bloom, chroma, toneMapping, vignette))

  let width = 1
  let height = 1
  const applyResolution = () => {
    const ratio = Math.min(window.devicePixelRatio, params.resolution)
    if (renderer.getPixelRatio() !== ratio) renderer.setPixelRatio(ratio)
    composer.setSize(width, height)
  }

  let kick = 0
  let glitchLeft = 0
  let glitchDrive = 0

  const sync = () => {
    const p = params
    if (Math.min(window.devicePixelRatio, p.resolution) !== renderer.getPixelRatio()) applyResolution()
    const samples = p.msaa ? msaaSamples : 0
    if (composer.multisampling !== samples) composer.multisampling = samples
    smaaPass.enabled = p.smaa
    bloom.intensity = p.bloom.enabled ? p.bloom.intensity : 0
    bloom.luminanceMaterial.threshold = p.bloom.threshold
    bloom.luminanceMaterial.smoothing = p.bloom.smoothing
    bloom.mipmapBlurPass.radius = p.bloom.radius

    vignette.offset = p.vignette.offset
    vignette.darkness = p.vignette.enabled ? p.vignette.darkness : 0

    // ACES pass reads the renderer exposure uniform.
    renderer.toneMappingExposure = p.exposure


    fisheye.uniforms.get('uStrength')!.value = p.fisheye.enabled ? p.fisheye.strength : 0

    edgePass.enabled = p.edgeBlur.enabled
    edgeBlur.uniforms.get('uStart')!.value = p.edgeBlur.start
    edgeBlur.uniforms.get('uStrength')!.value = p.edgeBlur.strength
  }

  return {
    params,
    /** Event spike for the chromatic aberration (0..1+, decays on its own). */
    kick(amount = 1) {
      kick = Math.max(kick, amount)
    },
    /** Debug: short digital glitch burst — `wild` for the strong one. */
    glitch(wild = false) {
      if (!params.glitch.enabled) return
      glitch.mode = wild ? GlitchMode.CONSTANT_WILD : GlitchMode.CONSTANT_MILD
      glitchLeft = params.glitch.duration * (wild ? 1.8 : 1)
    },
    /** Live 0..1 drive, synced to the HUD merge tear — glitch runs while > 0. */
    setGlitchLevel(level: number) {
      glitchDrive = level
    },
    setSize(w: number, h: number) {
      width = w
      height = h
      applyResolution()
    },
    render(dt: number) {
      sync()

      kick = Math.max(0, kick - dt * params.chroma.decay * kick - dt * 0.05)
      const amount = params.chroma.enabled ? params.chroma.base + params.chroma.peak * kick : 0
      chromaOffset.set(amount, amount * 0.6)

      glitchLeft = Math.max(0, glitchLeft - dt)
      const driven = params.glitch.enabled && glitchDrive > 0.05
      if (driven) {
        glitch.mode = glitchDrive > 0.5 ? GlitchMode.CONSTANT_WILD : GlitchMode.CONSTANT_MILD
        kick = Math.max(kick, glitchDrive)
      }
      glitchPass.enabled = driven || glitchLeft > 0
      if (!glitchPass.enabled) glitch.mode = GlitchMode.DISABLED

      composer.render(dt)
    },
    dispose() {
      composer.dispose()
    },
  }
}
