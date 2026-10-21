export type CameraMotionParams = {
  /** Position sway */
  swayX: number
  swayY: number
  /** Tilt (tangage / roulis) */
  roll: number
  pitch: number
  tiltLerp: number
  /** Extra nervous tilt oscillation (no heartbeat). */
  stressTilt: number
}

export const DEFAULT_CAMERA_MOTION: CameraMotionParams = {
  swayX: 0.15,
  swayY: 0.15,
  roll: 0.005,
  pitch: 0.025,
  tiltLerp: 2.5,
  stressTilt: 0.01,
}
