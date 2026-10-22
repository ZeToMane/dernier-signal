import { Pane } from 'tweakpane'
import type { Hud } from '../hud/Hud'
import type { MeterFluidParams } from '../hud/meterFluid'
import { HUD_MODULES } from '../hud/modules'
import type { CameraMotionParams } from '../objects/cameraMotion'
import type { PosterParams } from '../objects/createPoster'
import type { WallLightParams } from '../objects/createWall'
import type { FlashlightParams } from '../LastRave'
import type { CableSpec } from '../objects/environment/createEnvironment'
import type { PostFxParams } from '../postfx/createPostFx'
import type { SoundDesignParams } from '../audio/soundDesign'

type PostFxDebug = {
  params: PostFxParams
  onToggle: (enabled: boolean) => void
  testKick: () => void
  testGlitch: (wild: boolean) => void
  specularAA: { value: number }
  sound: SoundDesignParams
}

function bindSound(pane: Pane, sound: SoundDesignParams) {
  const folder = pane.addFolder({ title: 'Sound design', expanded: true })
  folder.addBinding(sound, 'enabled', { label: 'Activé' })
  folder.addBinding(sound, 'volume', { min: 0, max: 2, step: 0.01, label: 'Volume SFX' })
  folder.addBinding(sound, 'pitchSpread', { min: 0, max: 2, step: 0.01, label: 'Variation pitch' })
  folder.addBinding(sound, 'stereo', { min: 0, max: 1, step: 0.01, label: 'Stéréo' })
}

function bindPostFx(pane: Pane, fx: PostFxDebug) {
  const { params } = fx
  const root = pane.addFolder({ title: 'Post-process', expanded: true })
  root.addBinding(params, 'enabled', { label: 'Activé' }).on('change', (ev) => fx.onToggle(ev.value))
  root.addBinding(params, 'resolution', { min: 0.5, max: 2, step: 0.25, label: 'Résolution max' })
  root.addBinding(params, 'smaa', { label: 'Antialiasing SMAA' })
  root.addBinding(params, 'msaa', { label: 'MSAA (bug Mac)' })
  root.addBinding(params, 'exposure', { min: 0.2, max: 3, step: 0.01, label: 'Exposition' })
  root.addBinding(fx.specularAA, 'value', { min: 0, max: 4, step: 0.05, label: 'Anti-scintillement' })

  const bloom = root.addFolder({ title: 'Bloom', expanded: false })
  bloom.addBinding(params.bloom, 'enabled', { label: 'Activé' })
  bloom.addBinding(params.bloom, 'intensity', { min: 0, max: 5, step: 0.01, label: 'Intensité' })
  bloom.addBinding(params.bloom, 'threshold', { min: 0, max: 1.5, step: 0.01, label: 'Seuil' })
  bloom.addBinding(params.bloom, 'smoothing', { min: 0, max: 1, step: 0.01, label: 'Douceur seuil' })
  bloom.addBinding(params.bloom, 'radius', { min: 0, max: 1, step: 0.01, label: 'Rayon' })

  const vignette = root.addFolder({ title: 'Vignette', expanded: false })
  vignette.addBinding(params.vignette, 'enabled', { label: 'Activé' })
  vignette.addBinding(params.vignette, 'offset', { min: 0, max: 1, step: 0.01, label: 'Taille' })
  vignette.addBinding(params.vignette, 'darkness', { min: 0, max: 1.5, step: 0.01, label: 'Noirceur' })

  const chroma = root.addFolder({ title: 'Aberration chromatique', expanded: false })
  chroma.addBinding(params.chroma, 'enabled', { label: 'Activé' })
  chroma.addBinding(params.chroma, 'base', { min: 0, max: 0.005, step: 0.0001, label: 'Au repos' })
  chroma.addBinding(params.chroma, 'peak', { min: 0, max: 0.04, step: 0.0005, label: 'Pic événement' })
  chroma.addBinding(params.chroma, 'decay', { min: 0.5, max: 10, step: 0.1, label: 'Retombée' })
  chroma.addButton({ title: 'Tester un pic' }).on('click', fx.testKick)

  const edge = root.addFolder({ title: 'Flou des bords', expanded: false })
  edge.addBinding(params.edgeBlur, 'enabled', { label: 'Activé' })
  edge.addBinding(params.edgeBlur, 'start', { min: 0, max: 1, step: 0.01, label: 'Début' })
  edge.addBinding(params.edgeBlur, 'strength', { min: 0, max: 20, step: 0.1, label: 'Force (px)' })

  const glitch = root.addFolder({ title: 'Glitch', expanded: false })
  glitch.addBinding(params.glitch, 'enabled', { label: 'Activé' })
  glitch.addBinding(params.glitch, 'duration', { min: 0.05, max: 1.5, step: 0.01, label: 'Durée test (s)' })
  glitch.addButton({ title: 'Tester (léger)' }).on('click', () => fx.testGlitch(false))
  glitch.addButton({ title: 'Tester (fort)' }).on('click', () => fx.testGlitch(true))
}

export type LightingParams = {
  ambient: number
  room: number
  key: number
  screenGlow: number
}

export const DEFAULT_LIGHTING_PARAMS: LightingParams = {
  ambient: 0.12,
  room: 8,
  key: 0.25,
  screenGlow: 22,
}

function bindFluidParams(folder: ReturnType<Pane['addFolder']>, params: MeterFluidParams) {
  folder.addBinding(params, 'speed', { min: 0, max: 1.5, step: 0.01, label: 'Speed' })
  folder.addBinding(params, 'threshold', { min: 0.1, max: 0.9, step: 0.01, label: 'Threshold' })
  folder.addBinding(params, 'scaleX', { min: 0.5, max: 8, step: 0.1, label: 'Scale X' })
  folder.addBinding(params, 'scaleY', { min: 0.5, max: 8, step: 0.1, label: 'Scale Y' })
  folder.addBinding(params, 'warp', { min: 0, max: 4, step: 0.05, label: 'Warp' })
  folder.addBinding(params, 'detail', { min: 0, max: 1, step: 0.01, label: 'Detail' })
  folder.addBinding(params, 'scanline', { min: 0.1, max: 1, step: 0.01, label: 'Scanline' })
  folder.addBinding(params, 'color', { label: 'Color' })
  folder.addBinding(params, 'boostSpeed', { min: 0, max: 3, step: 0.01, label: 'Boost speed' })
  folder.addBinding(params, 'boostFill', { min: 0, max: 0.5, step: 0.01, label: 'Boost fill' })
}

function bindCameraMotion(pane: Pane, motion: CameraMotionParams) {
  const camera = pane.addFolder({ title: 'Camera', expanded: true })
  camera.addBinding(motion, 'enabled', { label: 'Activée' })
  camera.addBinding(motion, 'amount', { min: 0, max: 2, step: 0.01, label: 'Quantité' })

  const explore = camera.addFolder({ title: 'Exploration', expanded: true })
  explore.addBinding(motion, 'speed', { min: 0, max: 3, step: 0.01, label: 'Vitesse' })
  explore.addBinding(motion, 'swayX', { min: 0, max: 0.3, step: 0.001, label: 'Latéral (X)' })
  explore.addBinding(motion, 'swayY', { min: 0, max: 0.3, step: 0.001, label: 'Vertical (Y)' })
  explore.addBinding(motion, 'dolly', { min: 0, max: 1, step: 0.005, label: 'Avancée (Z)' })
  explore.addBinding(motion, 'lookAhead', { min: 0, max: 2, step: 0.01, label: 'Anticipation' })

  const body = camera.addFolder({ title: 'Respiration / stress', expanded: true })
  body.addBinding(motion, 'breath', { min: 0, max: 0.03, step: 0.0005, label: 'Respiration' })
  body.addBinding(motion, 'stress', { min: 0, max: 1, step: 0.01, label: 'Stress' })
  body.addBinding(motion, 'shake', { min: 0, max: 0.02, step: 0.0005, label: 'Tremblement' })
  body.addBinding(motion, 'stressTilt', { min: 0, max: 0.02, step: 0.0005, label: 'Tension (roll)' })

  const tilt = camera.addFolder({ title: 'Cadrage', expanded: true })
  tilt.addBinding(motion, 'roll', { min: 0, max: 0.05, step: 0.001, label: 'Roulis' })
  tilt.addBinding(motion, 'pitch', { min: 0, max: 0.05, step: 0.001, label: 'Tangage' })
  tilt.addBinding(motion, 'tiltLerp', { min: 0.5, max: 8, step: 0.1, label: 'Lissage' })
}

function bindPosterParams(folder: ReturnType<Pane['addFolder']>, params: PosterParams) {
  const pose = folder.addFolder({ title: 'Pose', expanded: true })
  pose.addBinding(params, 'height', { min: 0.4, max: 2.5, step: 0.01, label: 'Taille' })
  pose.addBinding(params, 'x', { min: -3, max: 3, step: 0.01, label: 'Pos X' })
  pose.addBinding(params, 'y', { min: -3, max: 3, step: 0.01, label: 'Pos Y' })
  pose.addBinding(params, 'z', { min: -1, max: 2, step: 0.005, label: 'Pos Z' })
  pose.addBinding(params, 'rotX', { min: -1, max: 1, step: 0.01, label: 'Rot X' })
  pose.addBinding(params, 'rotY', { min: -1, max: 1, step: 0.01, label: 'Rot Y' })
  pose.addBinding(params, 'rotZ', { min: -1, max: 1, step: 0.01, label: 'Rot Z' })

  const fly = folder.addFolder({ title: 'Envol', expanded: true })
  fly.addBinding(params, 'windDuration', { min: 0.1, max: 1.5, step: 0.05, label: 'Vent durée' })
  fly.addBinding(params, 'windLead', { min: 0, max: 0.5, step: 0.01, label: 'Vent avance' })
  fly.addBinding(params, 'wind', { min: 0, max: 4, step: 0.05, label: 'Vent force' })
  fly.addBinding(params, 'windCamX', { min: 0, max: 3, step: 0.05, label: 'Punch X' })
  fly.addBinding(params, 'windCamY', { min: 0, max: 2, step: 0.05, label: 'Punch Y' })
  fly.addBinding(params, 'windCamZ', { min: 0, max: 1.5, step: 0.05, label: 'Punch Z (recul)' })
  fly.addBinding(params, 'windCamRoll', { min: 0, max: 1.5, step: 0.05, label: 'Punch roll' })
  fly.addBinding(params, 'windCamHit', { min: 0.02, max: 0.25, step: 0.01, label: 'Punch hit' })
  fly.addBinding(params, 'windCamRecover', { min: 0.2, max: 3, step: 0.05, label: 'Punch recover' })
  fly.addBinding(params, 'duration', { min: 0.3, max: 2, step: 0.05, label: 'Slide durée' })
  fly.addBinding(params, 'peel', { min: 0, max: 2, step: 0.05, label: 'Déformation' })
  fly.addBinding(params, 'drift', { min: 0, max: 5, step: 0.05, label: 'Droite' })
  fly.addBinding(params, 'fall', { min: 0, max: 3, step: 0.05, label: 'Bas' })
  fly.addBinding(params, 'out', { min: 0, max: 2, step: 0.05, label: 'Avant (Z)' })
}

function bindCables(
  pane: Pane,
  cables: { specs: CableSpec[]; rebuild: (index: number) => void },
) {
  const folder = pane.addFolder({ title: 'Câbles', expanded: true })
  folder.addButton({ title: 'Copier la config (console + presse-papier)' }).on('click', () => {
    const round = (v: number) => Math.round(v * 1000) / 1000
    const json = JSON.stringify(
      cables.specs.map((c) => ({
        radius: round(c.radius),
        points: c.points.map((p) => [round(p.x), round(p.y), round(p.z)]),
      })),
    )
    console.log(json)
    navigator.clipboard?.writeText(json).catch(() => {})
  })

  cables.specs.forEach((spec, i) => {
    const cable = folder.addFolder({ title: `Câble ${i + 1}`, expanded: false })
    const rebuild = () => cables.rebuild(i)
    cable
      .addBinding(spec, 'radius', { min: 0.005, max: 0.15, step: 0.001, label: 'Épaisseur' })
      .on('change', rebuild)
    spec.points.forEach((point, j) => {
      const pt = cable.addFolder({ title: `Point ${j + 1}`, expanded: false })
      pt.addBinding(point, 'x', { min: -4, max: 4, step: 0.01, label: 'X' }).on('change', rebuild)
      pt.addBinding(point, 'y', { min: -3, max: 3, step: 0.01, label: 'Y' }).on('change', rebuild)
      pt.addBinding(point, 'z', { min: 0.15, max: 2, step: 0.005, label: 'Z' }).on('change', rebuild)
    })
  })
}

function bindLightingParams(pane: Pane, lighting: LightingParams) {
  const folder = pane.addFolder({ title: 'Lumière', expanded: true })
  folder.addBinding(lighting, 'ambient', { min: 0, max: 2, step: 0.01, label: 'Ambiante' })
  folder.addBinding(lighting, 'room', { min: 0, max: 80, step: 0.5, label: 'Room (écran off)' })
  folder.addBinding(lighting, 'key', { min: 0, max: 4, step: 0.05, label: 'Directionnelle' })
  folder.addBinding(lighting, 'screenGlow', { min: 0, max: 40, step: 0.5, label: 'Glow écran' })
}

function bindWallLightParams(
  pane: Pane,
  wall: WallLightParams,
  onChange: () => void,
) {
  const folder = pane.addFolder({ title: 'Mur béton (lumière)', expanded: true })
  folder
    .addBinding(wall, 'color', { label: 'Teinte' })
    .on('change', onChange)
  folder
    .addBinding(wall, 'roughness', { min: 0, max: 1, step: 0.01, label: 'Roughness' })
    .on('change', onChange)
  folder
    .addBinding(wall, 'metalness', { min: 0, max: 1, step: 0.01, label: 'Metalness' })
    .on('change', onChange)
  folder
    .addBinding(wall, 'normalScale', {
      min: 0,
      max: 2,
      step: 0.01,
      label: 'Relief (normal)',
    })
    .on('change', onChange)
}

export function createDebugPanel(
  hud: Hud,
  cameraMotion: CameraMotionParams,
  posterParams: PosterParams,
  lighting: LightingParams,
  wallLight: WallLightParams,
  actions: {
    onGlobeBoost: () => void
    onPosterFly: () => void
    onPosterReset: () => void
    onSignalStage: (count: number) => void
    onWallLightChange: () => void
    onPosterNormalToggle: (enabled: boolean) => void
    onScreenRoughnessToggle: (enabled: boolean) => void
  },
  posterNormal: { enabled: boolean },
  screenRoughness: { enabled: boolean },
  flashlights: FlashlightParams,
  debugLight: { enabled: boolean; intensity: number },
  greenLight: {
    enabled: boolean
    intensity: number
    ambientShare: number
    color: string
    dirX: number
    dirY: number
    dirZ: number
  },
  cables: { specs: CableSpec[]; rebuild: (index: number) => void },
  postFx: PostFxDebug,
) {
  const pane = new Pane({ title: 'The Last Rave', expanded: true })

  const fisheye = pane.addFolder({ title: 'Fisheye', expanded: true })
  fisheye.addBinding(postFx.params.fisheye, 'enabled', { label: 'Activé' })
  fisheye.addBinding(postFx.params.fisheye, 'strength', { min: 0, max: 1.5, step: 0.01, label: 'Force' })

  const signal = pane.addFolder({ title: 'Écran 2 — Signal', expanded: true })
  for (const count of [1, 2, 3]) {
    signal
      .addButton({ title: `Objet ${count} trouvé (${count}/3)` })
      .on('click', () => actions.onSignalStage(count))
  }
  signal.addButton({ title: 'Réseau réactivé (final)' }).on('click', () => actions.onSignalStage(4))
  signal.addButton({ title: 'Retour écran 1' }).on('click', () => actions.onSignalStage(0))

  const poster = pane.addFolder({ title: 'Affiche', expanded: true })
  poster.addButton({ title: "Envoler l'affiche" }).on('click', actions.onPosterFly)
  poster.addButton({ title: 'Reset affiche (écran off)' }).on('click', actions.onPosterReset)
  poster
    .addBinding(posterNormal, 'enabled', { label: 'Normal map' })
    .on('change', (ev) => actions.onPosterNormalToggle(ev.value))
  bindPosterParams(poster, posterParams)

  bindPostFx(pane, postFx)
  bindSound(pane, postFx.sound)
  bindLightingParams(pane, lighting)

  const flood = pane.addFolder({ title: 'Lumière debug', expanded: true })
  flood.addBinding(debugLight, 'enabled', { label: 'Tout éclairer' })
  flood.addBinding(debugLight, 'intensity', { min: 0, max: 10, step: 0.1, label: 'Intensité' })

  const green = pane.addFolder({ title: 'Lumière verte', expanded: true })
  green.addBinding(greenLight, 'enabled', { label: 'Activée' })
  green.addBinding(greenLight, 'intensity', { min: 0, max: 3, step: 0.01, label: 'Intensité' })
  green.addBinding(greenLight, 'ambientShare', { min: 0, max: 1, step: 0.01, label: 'Part ambiance' })
  green.addBinding(greenLight, 'color', { label: 'Couleur' })
  green.addBinding(greenLight, 'dirX', { min: -5, max: 5, step: 0.01, label: 'Direction X' })
  green.addBinding(greenLight, 'dirY', { min: -5, max: 5, step: 0.01, label: 'Direction Y' })
  green.addBinding(greenLight, 'dirZ', { min: 0.1, max: 10, step: 0.01, label: 'Direction Z' })

  const torches = pane.addFolder({ title: 'Lampes torches', expanded: true })
  torches.addBinding(flashlights, 'moving', { label: 'Mouvement' })
  torches.addBinding(flashlights, 'period', { min: 6, max: 60, step: 0.5, label: 'Boucle (s)' })
  torches.addBinding(flashlights, 'spread', { min: 1, max: 1.5, step: 0.01, label: 'Écart du bord' })
  torches.addBinding(flashlights, 'z', { min: 0.1, max: 3, step: 0.01, label: 'Distance' })
  torches.addBinding(flashlights, 'tremor', { min: 0, max: 0.15, step: 0.001, label: 'Tremblement' })
  torches.addBinding(flashlights, 'share', { min: 0, max: 1.5, step: 0.01, label: 'Part du glow' })
  torches.addBinding(flashlights, 'variation', { min: 0, max: 1, step: 0.01, label: 'Variation' })
  bindWallLightParams(pane, wallLight, actions.onWallLightChange)
  bindCables(pane, cables)

  const screenFx = pane.addFolder({ title: 'Écran HUD', expanded: true })
  screenFx
    .addBinding(screenRoughness, 'enabled', { label: 'Roughness map' })
    .on('change', (ev) => actions.onScreenRoughnessToggle(ev.value))

  const modules = pane.addFolder({ title: 'Modules HUD', expanded: true })

  for (const module of HUD_MODULES) {
    modules.addButton({ title: module.label }).on('click', () => {
      hud.trigger(module.id)
    })
  }

  modules.addButton({ title: 'Tout déclencher' }).on('click', () => {
    // Bug cascade: 3 tight waves, tiny jitter inside each — infection, not choreography.
    const fire = (delay: number, fn: () => void) => {
      window.setTimeout(fn, delay)
    }
    const wave = (baseDelay: number, actionsList: (() => void)[]) => {
      actionsList.forEach((fn, i) => {
        fire(baseDelay + i * (12 + Math.random() * 28), fn)
      })
    }

    wave(0, [
      () => hud.triggerLayout(),
      () => hud.trigger('left-sector'),
      () => hud.trigger('left-meter'),
      () => hud.triggerGauges(),
    ])
    wave(90 + Math.random() * 40, [
      () => hud.trigger('left-protocol-a'),
      () => hud.trigger('left-protocol-b'),
      () => hud.trigger('right-a'),
    ])
    wave(200 + Math.random() * 50, [
      () => hud.trigger('right-b'),
      () => hud.trigger('right-c'),
      () => actions.onGlobeBoost(),
    ])
  })

  modules.addButton({ title: 'Boot layout' }).on('click', () => {
    hud.triggerLayout()
  })

  modules.addButton({ title: 'Réécrire textes' }).on('click', () => {
    hud.triggerTexts()
  })

  modules.addButton({ title: 'Boost jauges' }).on('click', () => {
    hud.triggerGauges()
  })

  modules.addButton({ title: 'Boost sphère' }).on('click', () => {
    actions.onGlobeBoost()
  })

  const fluids = pane.addFolder({ title: 'Fluid shaders', expanded: false })

  for (const { label, params } of hud.getFluidParams()) {
    const folder = fluids.addFolder({ title: label, expanded: false })
    bindFluidParams(folder, params)
  }

  bindCameraMotion(pane, cameraMotion)

  return pane
}
