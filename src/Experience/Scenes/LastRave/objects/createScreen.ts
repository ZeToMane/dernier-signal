import { Group, Mesh, MeshBasicMaterial, PlaneGeometry, type Texture } from 'three'
import { SCREEN_HEIGHT, SCREEN_WIDTH } from '../layout'

/** Slight offset so the HUD plane sits in front of the wall. */
export const SCREEN_SURFACE_Z = 0.051

export function createScreen(hudTexture: Texture) {
  const group = new Group()

  const surface = new Mesh(
    new PlaneGeometry(SCREEN_WIDTH, SCREEN_HEIGHT),
    new MeshBasicMaterial({ map: hudTexture, toneMapped: false }),
  )
  surface.position.z = SCREEN_SURFACE_Z

  group.add(surface)
  return group
}
