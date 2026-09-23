export type FacePose = { blink: number; brow: number };

/** 0 at the start and end of a blink, 1 at the closed peak. */
export function blinkAmount(unit: number): number {
  if (!(unit > 0) || unit >= 1) return 0;
  return unit < 0.32 ? Math.sin((unit / 0.32) * Math.PI / 2) : Math.cos(((unit - 0.32) / 0.68) * Math.PI / 2);
}

/**
 * Sparse blinks and a very small brow drift for the stippled bust.
 * Motion stays off when the visitor prefers reduced motion.
 */
export function createFaceMotion(rand: () => number = Math.random) {
  let elapsed = 0;
  let nextBlink = 2.4 + rand() * 2.2;
  let blinkStart = -1;
  let blinkDuration = 0.14;
  let doubleBlink = false;
  let brow = 0;
  let wasSpeaking = false;

  const gap = (speaking: boolean) => (speaking ? 2.1 : 3.2) + rand() * (speaking ? 2.2 : 2.6);

  return {
    update(dt: number, state: { speaking: boolean; reducedMotion: boolean }): FacePose {
      const step = Number.isFinite(dt) ? Math.max(0, Math.min(0.05, dt)) : 0;
      elapsed += step;
      if (state.reducedMotion) {
        blinkStart = -1;
        doubleBlink = false;
        wasSpeaking = state.speaking;
        brow += (0 - brow) * (1 - Math.exp(-step * 8));
        if (Math.abs(brow) < 0.0001) brow = 0;
        return { blink: 0, brow };
      }
      if (state.speaking && !wasSpeaking && blinkStart < 0 && rand() < 0.35) {
        blinkStart = elapsed + 0.1;
        blinkDuration = 0.17;
        doubleBlink = false;
      }
      wasSpeaking = state.speaking;

      let blink = 0;
      if (blinkStart >= 0) {
        const unit = (elapsed - blinkStart) / blinkDuration;
        if (unit >= 1) {
          const again = doubleBlink;
          doubleBlink = false;
          blinkStart = -1;
          if (again) {
            blinkStart = elapsed + 0.07;
            blinkDuration = 0.15;
          } else nextBlink = elapsed + gap(state.speaking);
        } else if (unit > 0) blink = blinkAmount(unit);
      } else if (elapsed >= nextBlink) {
        blinkStart = elapsed;
        blinkDuration = 0.16 + rand() * 0.05;
        doubleBlink = rand() < 0.15;
      }

      const idle = Math.sin(elapsed * 0.65) * 0.1 + Math.sin(elapsed * 0.23 + 1.2) * 0.06;
      const lift = state.speaking ? 0.2 + Math.sin(elapsed * 1.4) * 0.12 : 0;
      const target = Math.max(-0.55, Math.min(0.55, idle + lift));
      brow += (target - brow) * (1 - Math.exp(-step * (state.speaking ? 2.4 : 1.2)));
      if (Math.abs(brow) < 0.0001) brow = 0;
      return { blink, brow };
    },
  };
}
