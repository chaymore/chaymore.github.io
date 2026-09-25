export type FacePose = {
  blink: number;
  brow: number;
  /** Eye rotation in head space, radians: +x looks to the portrait's left (viewer's right), +y looks up. */
  gazeX: number;
  gazeY: number;
  /** Head rotation around the neck, radians. +pitch nods down. */
  headPitch: number;
  headYaw: number;
  headRoll: number;
  /** Small vertical breathing offset in portrait units. */
  breath: number;
};

export type FaceInput = {
  speaking: boolean;
  reducedMotion: boolean;
  /** Reply loudness, 0–1. Drives nods and brow emphasis. */
  level?: number;
  /** Where the eyes want to look, in head space radians. Null lets the eyes wander. */
  look?: { x: number; y: number } | null;
};

export const REST_POSE: FacePose = { blink: 0, brow: 0, gazeX: 0, gazeY: 0, headPitch: 0, headYaw: 0, headRoll: 0, breath: 0 };

/** 0 at the start and end of a blink, 1 at the closed peak. The lid closes fast and opens slower. */
export function blinkAmount(unit: number): number {
  if (!(unit > 0) || unit >= 1) return 0;
  return unit < 0.3 ? Math.sin((unit / 0.3) * Math.PI / 2) : Math.cos(((unit - 0.3) / 0.7) * Math.PI / 2) ** 1.4;
}

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

/** Critically damped spring. Stiffness sets speed; no overshoot unless kicked. */
function spring(stiffness: number) {
  const damping = 2 * Math.sqrt(stiffness);
  return {
    x: 0,
    v: 0,
    step(target: number, dt: number) {
      this.v += (stiffness * (target - this.x) - damping * this.v) * dt;
      this.x += this.v * dt;
      return this.x;
    },
  };
}

/**
 * Procedural face and head motion for the stippled bust: blinks, saccadic gaze,
 * speech-driven nods and tilts, brow emphasis, and breathing.
 * Everything holds still when the visitor prefers reduced motion.
 */
export function createFaceMotion(rand: () => number = Math.random) {
  let elapsed = 0;
  const phase = Array.from({ length: 6 }, () => rand() * Math.PI * 2);

  // Blinks
  let nextBlink = 2.4 + rand() * 2.2;
  let blinkStart = -1;
  let blinkDuration = 0.26;
  let doubleBlink = false;
  const blinkGap = (speaking: boolean) => (speaking ? 2.0 : 3.0) + rand() * (speaking ? 2.4 : 3.0);
  const startBlink = (at: number, duration = 0.22 + rand() * 0.08) => {
    if (blinkStart >= 0) return;
    blinkStart = at;
    blinkDuration = duration;
    doubleBlink = rand() < 0.12;
  };

  // Gaze: fixations joined by fast saccades, plus tiny drift.
  let fixX = 0, fixY = 0;
  let nextSaccade = 0.8 + rand();
  let glanceUntil = -1;
  let microX = 0, microY = 0, nextMicro = 0.3;
  const gazeX = spring(900), gazeY = spring(900);

  // Head and brow
  const pitch = spring(38), yaw = spring(14), roll = spring(14), brow = spring(60);
  let envelope = 0, slow = 0, lastOnset = -1, wasSpeaking = false, newThought = false;
  let phraseYaw = 0, phraseRoll = 0, browKick = 0;

  const saccadeTo = (x: number, y: number) => {
    const jump = Math.hypot(x - fixX, y - fixY);
    fixX = x; fixY = y;
    if (jump > 0.22 && rand() < 0.3) startBlink(elapsed + 0.02);
  };

  return {
    update(dt: number, input: FaceInput): FacePose {
      const step = Number.isFinite(dt) ? clamp(dt, 0, 0.05) : 0;
      elapsed += step;
      if (input.reducedMotion) {
        blinkStart = -1;
        doubleBlink = false;
        wasSpeaking = input.speaking;
        for (const s of [gazeX, gazeY, pitch, yaw, roll, brow]) { s.x = 0; s.v = 0; }
        return { ...REST_POSE };
      }
      const level = clamp(Number.isFinite(input.level) ? input.level! : 0, 0, 1);

      // --- Speech rhythm: fast envelope against a slow baseline gives syllable onsets.
      envelope += (level - envelope) * (1 - Math.exp(-step * (level > envelope ? 30 : 9)));
      slow += (envelope - slow) * (1 - Math.exp(-step * 2.2));
      if (input.speaking && !wasSpeaking) {
        phraseYaw = (rand() - 0.5) * 0.09;
        phraseRoll = (rand() - 0.5) * 0.07;
        browKick = Math.max(browKick, 0.35);
        if (rand() < 0.35) startBlink(elapsed + 0.08, 0.24);
      }
      const rise = envelope - slow;
      if (input.speaking && rise > 0.09 && elapsed - lastOnset > 0.2) {
        newThought = elapsed - lastOnset > 0.9;
        const strength = clamp(rise * 3, 0, 1);
        pitch.v += 0.22 + 0.42 * strength;
        if (strength > 0.45) browKick = Math.max(browKick, 0.25 + 0.4 * strength);
        if (elapsed - lastOnset > 1.2 && rand() < 0.4) {
          phraseYaw = clamp(phraseYaw + (rand() - 0.5) * 0.06, -0.07, 0.07);
          phraseRoll = clamp(phraseRoll + (rand() - 0.5) * 0.04, -0.05, 0.05);
        }
        lastOnset = elapsed;
      }
      if (!input.speaking && wasSpeaking) { phraseYaw = 0; phraseRoll = 0; }
      wasSpeaking = input.speaking;

      // --- Blinks
      let blink = 0;
      if (blinkStart >= 0) {
        const unit = (elapsed - blinkStart) / blinkDuration;
        if (unit >= 1) {
          const again = doubleBlink;
          doubleBlink = false;
          blinkStart = -1;
          if (again) startBlink(elapsed + 0.06, 0.2);
          else nextBlink = elapsed + blinkGap(input.speaking);
        } else if (unit > 0) blink = blinkAmount(unit);
      } else if (elapsed >= nextBlink) startBlink(elapsed);

      // --- Gaze
      const look = input.look;
      if (look && elapsed >= glanceUntil) {
        const lx = clamp(look.x, -0.45, 0.45), ly = clamp(look.y, -0.3, 0.3);
        const off = Math.hypot(lx - fixX, ly - fixY);
        if (off > 0.05 || (off > 0.015 && elapsed >= nextSaccade)) {
          saccadeTo(lx, ly);
          nextSaccade = elapsed + 0.35 + rand() * 0.9;
        }
        // Speakers look away briefly at the start of a thought.
        if (input.speaking && newThought && rand() < 0.3) {
          saccadeTo(lx + (rand() < 0.5 ? -1 : 1) * (0.12 + rand() * 0.1), ly + 0.04 + rand() * 0.08);
          glanceUntil = elapsed + 0.45 + rand() * 0.6;
        }
        newThought = false;
      } else if (!look && elapsed >= nextSaccade) {
        saccadeTo((rand() - 0.5) * 0.3, (rand() - 0.5) * 0.14);
        nextSaccade = elapsed + 0.7 + rand() * 2.0;
      }
      if (elapsed >= nextMicro) {
        microX = (rand() - 0.5) * 0.016;
        microY = (rand() - 0.5) * 0.012;
        nextMicro = elapsed + 0.25 + rand() * 0.45;
      }
      gazeX.step(fixX + microX, step);
      gazeY.step(fixY + microY, step);

      // --- Head: slow idle drift, plus speech nods and phrase tilts.
      const t = elapsed;
      const drift = (i: number, f: number) => Math.sin(t * f + phase[i]) * 0.6 + Math.sin(t * f * 2.3 + phase[i + 1]) * 0.4;
      const talk = input.speaking ? 1 : 0;
      pitch.step(drift(0, 0.31) * 0.012 - envelope * 0.035 * talk, step);
      yaw.step(drift(1, 0.23) * (0.02 + 0.015 * talk) + phraseYaw * talk + gazeX.x * 0.12, step);
      roll.step(drift(2, 0.19) * 0.01 + phraseRoll * talk, step);

      // --- Brows: small idle drift, lifts at phrase starts and stressed syllables.
      browKick *= Math.exp(-step * 2.6);
      const browIdle = Math.sin(t * 0.65 + phase[3]) * 0.08 + Math.sin(t * 0.23 + 1.2) * 0.05;
      const browTarget = clamp(browIdle + (input.speaking ? 0.12 + envelope * 0.25 : 0) + browKick + gazeY.x * 0.8, -0.55, 0.85);
      brow.step(browTarget, step);

      const breath = Math.sin(t * 1.35 + phase[4]) * 0.0035;
      return {
        blink,
        brow: clamp(brow.x, -0.55, 0.85),
        gazeX: gazeX.x,
        gazeY: gazeY.x,
        headPitch: clamp(pitch.x, -0.09, 0.12),
        headYaw: clamp(yaw.x, -0.12, 0.12),
        headRoll: clamp(roll.x, -0.08, 0.08),
        breath,
      };
    },
  };
}
