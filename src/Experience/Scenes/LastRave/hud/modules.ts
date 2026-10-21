export type ModuleId =
  | 'left-sector'
  | 'left-meter'
  | 'left-protocol-a'
  | 'left-protocol-b'
  | 'right-a'
  | 'right-b'
  | 'right-c'
  | 's2-small-a'
  | 's2-small-b'

export type ModuleAnimKind = 'wires' | 'fluid' | 'pulse' | 'grid' | 'spokes' | 'points' | 'noise' | 'burst'

export type HudModule = {
  id: ModuleId
  label: string
  x: number
  y: number
  w: number
  h: number
  kind: ModuleAnimKind
}

/** Empty HUD panels: 4 left (bottom split in 2) + 3 under the globe. */
export const HUD_MODULES: HudModule[] = [
  { id: 'left-sector', label: 'Gauche 1 — Sector', x: 16, y: 44, w: 109, h: 87, kind: 'wires' },
  { id: 'left-meter', label: 'Gauche 2 — Meter', x: 16, y: 164, w: 57, h: 157, kind: 'fluid' },
  { id: 'left-protocol-a', label: 'Gauche 3 — Protocol A', x: 16, y: 413, w: 28, h: 38, kind: 'fluid' },
  { id: 'left-protocol-b', label: 'Gauche 4 — Protocol B', x: 44, y: 413, w: 29, h: 38, kind: 'wires' },
  { id: 'right-a', label: 'Droite 1 — Cell A', x: 598, y: 344, w: 68, h: 69, kind: 'spokes' },
  { id: 'right-b', label: 'Droite 2 — Cell B', x: 678, y: 344, w: 67, h: 69, kind: 'fluid' },
  { id: 'right-c', label: 'Droite 3 — Cell C', x: 758, y: 344, w: 65, h: 69, kind: 'points' },
]

/** Bottom-right cells on the signal screen (fluid + wires with center cross). */
export const SIGNAL_MODULES: HudModule[] = [
  { id: 's2-small-a', label: 'Signal — Fluid', x: 641, y: 304, w: 75, h: 74, kind: 'fluid' },
  { id: 's2-small-b', label: 'Signal — Wires', x: 734, y: 304, w: 75, h: 74, kind: 'wires' },
]
