import { Pane } from 'tweakpane'
import type { Hud } from '../hud/Hud'
import type { MeterFluidParams } from '../hud/meterFluid'
import { HUD_MODULES } from '../hud/modules'
import type { CameraMotionParams } from '../objects/cameraMotion'
import type { PosterParams } from '../objects/createPoster'
import type { WallLightParams } from '../objects/createWall'

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

  const move = camera.addFolder({ title: 'Mouvement XY', expanded: true })
  move.addBinding(motion, 'swayX', { min: 0, max: 0.2, step: 0.001, label: 'Sway X' })
  move.addBinding(motion, 'swayY', { min: 0, max: 0.2, step: 0.001, label: 'Sway Y' })

  const tilt = camera.addFolder({ title: 'Tangage', expanded: true })
  tilt.addBinding(motion, 'roll', { min: 0, max: 0.05, step: 0.001, label: 'Roll' })
  tilt.addBinding(motion, 'pitch', { min: 0, max: 0.05, step: 0.001, label: 'Pitch' })
  tilt.addBinding(motion, 'tiltLerp', { min: 0.5, max: 8, step: 0.1, label: 'Lerp' })
  tilt.addBinding(motion, 'stressTilt', { min: 0, max: 0.03, step: 0.001, label: 'Stress tilt' })
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
) {
  const pane = new Pane({ title: 'The Last Rave', expanded: true })

  bindLightingParams(pane, lighting)
  bindWallLightParams(pane, wallLight, actions.onWallLightChange)

  const screenFx = pane.addFolder({ title: 'Écran HUD', expanded: true })
  screenFx
    .addBinding(screenRoughness, 'enabled', { label: 'Roughness map' })
    .on('change', (ev) => actions.onScreenRoughnessToggle(ev.value))

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
