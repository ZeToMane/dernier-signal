/** Design space of the HUD, in mockup pixels. Every HUD coordinate is expressed in these units. */
export const DESIGN = { width: 841, height: 484 }

export const SCREEN_WIDTH = 3.4
export const SCREEN_HEIGHT = (SCREEN_WIDTH * DESIGN.height) / DESIGN.width

export const GLOBE = { x: 710, y: 190, radius: 80 }

/** Accent variants — `green` is the default bunker look, `pink` the alternate. */
export const ACCENTS = {
  green: { main: '#22f08f', rgb: '34, 240, 143', core: '#e6fff2', text: '#74f0a4', shade: '#0a2414' },
  pink: { main: '#ff59bb', rgb: '255, 89, 187', core: '#ffeaf6', text: '#ff9ad4', shade: '#24081a' },
}

export type AccentName = keyof typeof ACCENTS

/** `green*` = the live accent color (mutated by `setAccent`, read every frame). */
export const PALETTE = {
  background: '#020806',
  green: ACCENTS.green.main,
  greenRgb: ACCENTS.green.rgb,
  greenCore: ACCENTS.green.core,
  /** Big outro title fill — a lighter tint of the accent. */
  greenText: ACCENTS.green.text,
  greenShade: ACCENTS.green.shade,
  greenDim: `rgba(${ACCENTS.green.rgb}, 0.45)`,
  greenFaint: `rgba(${ACCENTS.green.rgb}, 0.18)`,
}

export function setAccent(name: AccentName) {
  const accent = ACCENTS[name]
  PALETTE.green = accent.main
  PALETTE.greenRgb = accent.rgb
  PALETTE.greenCore = accent.core
  PALETTE.greenText = accent.text
  PALETTE.greenShade = accent.shade
  PALETTE.greenDim = `rgba(${accent.rgb}, 0.45)`
  PALETTE.greenFaint = `rgba(${accent.rgb}, 0.18)`
}

export const designToScreen = (x: number, y: number) => ({
  x: (x / DESIGN.width - 0.5) * SCREEN_WIDTH,
  y: (0.5 - y / DESIGN.height) * SCREEN_HEIGHT,
})

export const designToScreenLength = (length: number) => (length / DESIGN.width) * SCREEN_WIDTH
