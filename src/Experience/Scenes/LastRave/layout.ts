/** Design space of the HUD, in mockup pixels. Every HUD coordinate is expressed in these units. */
export const DESIGN = { width: 841, height: 484 }

export const SCREEN_WIDTH = 3.4
export const SCREEN_HEIGHT = (SCREEN_WIDTH * DESIGN.height) / DESIGN.width

export const GLOBE = { x: 710, y: 190, radius: 80 }

export const PALETTE = {
  background: '#020806',
  green: '#22f08f',
  greenDim: 'rgba(34, 240, 143, 0.45)',
  greenFaint: 'rgba(34, 240, 143, 0.18)',
}

export const designToScreen = (x: number, y: number) => ({
  x: (x / DESIGN.width - 0.5) * SCREEN_WIDTH,
  y: (0.5 - y / DESIGN.height) * SCREEN_HEIGHT,
})

export const designToScreenLength = (length: number) => (length / DESIGN.width) * SCREEN_WIDTH
