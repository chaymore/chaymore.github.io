import type { Viseme } from './portrait-speech';

/**
 * Real-time viseme estimates for the stippled portrait.
 *
 * Band scoring is adapted from wawa-lipsync (MIT):
 * Copyright (c) 2025 Wassim SAMAD
 * https://github.com/wass08/wawa-lipsync
 *
 * The published helper opens its own AudioContext and claims the media element,
 * which this portrait cannot do: playback already uses one media-element source.
 * Scoring therefore runs on the portrait's existing analyser. Vowel choice uses
 * formant ratios on those bands; the stock vowel table follows spectral tilt and
 * collapses most speech into one shape on this rig. There is no microphone input.
 */

const WAWA = {
  sil: 'viseme_sil', PP: 'viseme_PP', FF: 'viseme_FF', TH: 'viseme_TH',
  DD: 'viseme_DD', kk: 'viseme_kk', CH: 'viseme_CH', SS: 'viseme_SS',
  nn: 'viseme_nn', RR: 'viseme_RR', aa: 'viseme_aa', E: 'viseme_E',
  I: 'viseme_I', O: 'viseme_O', U: 'viseme_U',
} as const;
type Wawa = typeof WAWA[keyof typeof WAWA];

const ORDER: Wawa[] = [
  WAWA.sil, WAWA.PP, WAWA.FF, WAWA.TH, WAWA.DD, WAWA.kk, WAWA.CH, WAWA.SS,
  WAWA.nn, WAWA.RR, WAWA.aa, WAWA.E, WAWA.I, WAWA.O, WAWA.U,
];

const STATE: Record<Wawa, 'silence' | 'vowel' | 'plosive' | 'fricative'> = {
  viseme_sil: 'silence', viseme_PP: 'plosive', viseme_FF: 'fricative', viseme_TH: 'fricative',
  viseme_DD: 'plosive', viseme_kk: 'plosive', viseme_CH: 'fricative', viseme_SS: 'fricative',
  viseme_nn: 'plosive', viseme_RR: 'fricative', viseme_aa: 'vowel', viseme_E: 'vowel',
  viseme_I: 'vowel', viseme_O: 'vowel', viseme_U: 'vowel',
};

/** Oculus-style visemes folded into the portrait's existing shape names. */
export const PORTRAIT_VISEME: Record<Wawa, Viseme> = {
  viseme_sil: 'rest', viseme_PP: 'MBP', viseme_FF: 'FV', viseme_TH: 'FV',
  viseme_DD: 'L', viseme_kk: 'E', viseme_CH: 'E', viseme_SS: 'I',
  viseme_nn: 'L', viseme_RR: 'U', viseme_aa: 'A', viseme_E: 'E',
  viseme_I: 'I', viseme_O: 'O', viseme_U: 'U',
};

const BANDS: [number, number][] = [
  [50, 200], [200, 400], [400, 800], [800, 1500], [1500, 2500], [2500, 4000], [4000, 8000],
];

interface Feature { bands: number[]; volume: number; centroid: number }

const mean = (values: ArrayLike<number>, start: number, end: number) => {
  const last = Math.min(end, values.length);
  if (start >= last) return 0;
  let sum = 0;
  for (let i = start; i < last; i++) sum += values[i];
  return sum / (last - start);
};

function featuresOf(spectrum: Uint8Array, sampleRate: number, fftSize: number): Feature {
  const bin = sampleRate / Math.max(1, fftSize);
  const bands = BANDS.map(([start, end]) => mean(spectrum, Math.round(start / bin), Math.min(Math.round(end / bin), spectrum.length)) / 255);
  const maxBin = Math.min(spectrum.length, Math.max(1, Math.round(8000 / bin)));
  let sum = 0, weighted = 0;
  for (let i = 0; i < maxBin; i++) {
    const amp = spectrum[i] / 255;
    sum += amp;
    weighted += i * bin * amp;
  }
  return { bands, volume: bands.reduce((total, band) => total + band, 0) / bands.length, centroid: sum > 0 ? weighted / sum : 0 };
}

/** Formant ratios on the current frame. Null when this frame is not a vowel. */
function vowelViseme(bands: number[]): Wawa | null {
  const [, b2, b3, b4, b5, b6, b7] = bands;
  const lowMid = b2 + b3 + b4;
  const high = b6 + b7;
  if (lowMid < 0.22) return null;
  if (high > lowMid * 0.85 && b7 > 0.22) return null;
  const b2Ratio = b2 / (b3 + 0.05);
  const b4Ratio = b4 / (b3 + 0.05);
  const b5Ratio = b5 / (b3 + 0.05);
  // Back rounded vowels keep F2 weak. Front vowels carry energy above 1.5 kHz.
  if (b2Ratio > 1.15 && b5Ratio < 0.35) return WAWA.U;
  if (b2Ratio > 1.2 && b5Ratio > 0.45) return WAWA.I;
  if (b5Ratio < 0.28 && b4Ratio < 0.85 && b2Ratio < 1.15) return WAWA.O;
  if (b4Ratio > 0.85 && b5Ratio < 0.5) return WAWA.aa;
  if (b5Ratio > 0.4 && b2Ratio < 1.25) return WAWA.E;
  return b3 >= b2 ? WAWA.O : WAWA.aa;
}

function scoresFor(current: Feature, avg: Feature, dVolume: number, dCentroid: number): Record<Wawa, number> {
  const scores = Object.fromEntries(ORDER.map(name => [name, 0])) as Record<Wawa, number>;
  const peak = Math.max(...current.bands);
  // A hot high band is a fricative, not silence, even when the seven-band mean is small.
  if (avg.volume < 0.09 && current.volume < 0.09 && peak < 0.28) scores[WAWA.sil] = 1;

  const [b1, b2, b3, b4, b5, b6, b7] = current.bands;
  if (b7 > 0.3 && b7 > b3 * 1.4 && b7 > b2) scores[WAWA.SS] = 1.15;
  else if (b6 > 0.28 && b6 + b7 > b2 + b3 && b2 + b3 + b4 < 0.3) scores[WAWA.FF] = 1.05;
  else if (b1 > 0.22 && b3 < 0.16 && b4 < 0.14 && b5 < 0.12 && b7 < 0.2) scores[WAWA.PP] = 1.1;

    const vowel = vowelViseme(current.bands);
    if (vowel) scores[vowel] = 1.2;

  for (const name of ORDER) {
    if (STATE[name] !== 'plosive' || scores[name] > 0.5) continue;
    if (dVolume < 0.01) scores[name] -= 0.5;
    if (avg.volume < 0.2) scores[name] += 0.2;
    if (dCentroid > 1000) scores[name] += 0.2;
  }

  if (!vowel && current.centroid > 1000 && current.centroid < 8000 && scores[WAWA.SS] < 1 && scores[WAWA.FF] < 1) {
    if (current.centroid > 7000) scores[WAWA.DD] += 0.6;
    else if (current.centroid > 5000) scores[WAWA.kk] += 0.6;
    else if (current.centroid > 4000) {
      scores[WAWA.PP] += 1;
      if (b7 > 0.25 && current.centroid < 6000) scores[WAWA.DD] += 1.4;
    } else if (scores[WAWA.PP] < 1) scores[WAWA.nn] += 0.55;
  }

  if (!vowel && dCentroid > 1000 && current.centroid > 6000 && avg.centroid > 5000 && b7 > 0.4 && avg.bands[6] > 0.3) {
    scores[WAWA.FF] = Math.max(scores[WAWA.FF], 0.9);
  }
  return scores;
}

/** Stateful analyser-frame classifier. `nowMs` is the playback clock in milliseconds. */
export class SpeechVisemes {
  private history: Feature[] = [];
  private viseme: Wawa = WAWA.sil;
  private since = 0;
  volume = 0;

  reset() {
    this.history = [];
    this.viseme = WAWA.sil;
    this.since = 0;
    this.volume = 0;
  }

  read(spectrum: Uint8Array, sampleRate: number, fftSize: number, nowMs: number): Viseme {
    if (!spectrum?.length || !(sampleRate > 0) || !(fftSize > 0)) return 'rest';
    const current = featuresOf(spectrum, sampleRate, fftSize);
    const previous = this.history.at(-1);
    this.history.push(current);
    if (this.history.length > 6) this.history.shift();
    this.volume = current.volume;
    if (current.volume < 0.02) {
      this.viseme = WAWA.sil;
      this.since = nowMs;
      return 'rest';
    }
    const avg = this.history.reduce((sum, frame) => ({
      volume: sum.volume + frame.volume,
      centroid: sum.centroid + frame.centroid,
      bands: sum.bands.map((band, i) => band + frame.bands[i]),
    }), { volume: 0, centroid: 0, bands: [0, 0, 0, 0, 0, 0, 0] });
    const n = this.history.length;
    const meanFeature: Feature = { volume: avg.volume / n, centroid: avg.centroid / n, bands: avg.bands.map(band => band / n) };
    const scores = scoresFor(current, meanFeature, current.volume - (previous?.volume ?? current.volume), current.centroid - (previous?.centroid ?? current.centroid));
    // Light hysteresis. A late penalty here chops held vowels into flicker.
    if (nowMs - this.since < 90) scores[this.viseme] *= 1.12;
    let best: Wawa = WAWA.sil;
    let bestScore = -Infinity;
    for (const name of ORDER) if (scores[name] > bestScore) { bestScore = scores[name]; best = name; }
    if (best !== this.viseme) { this.viseme = best; this.since = nowMs; }
    return PORTRAIT_VISEME[best];
  }
}
