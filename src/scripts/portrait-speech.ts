import { SpeechVisemes } from './portrait-visemes.ts';

export type MouthShape = { open: number; round: number; wide: number };
export type Viseme = 'rest' | 'A' | 'E' | 'I' | 'O' | 'U' | 'MBP' | 'FV' | 'L';
export type VisemeCue = { start: number; end: number; shape: Viseme };
export const REST: MouthShape = { open: 0, round: 0, wide: 0 };
export const SHAPES: Record<Viseme, MouthShape> = {
  rest: REST, A: { open: .85, round: 0, wide: .15 },
  E: { open: .42, round: 0, wide: .8 }, I: { open: .28, round: 0, wide: 1 },
  O: { open: .7, round: .85, wide: 0 }, U: { open: .35, round: 1, wide: 0 },
  MBP: REST, FV: { open: .1, round: 0, wide: .4 }, L: { open: .45, round: 0, wide: .25 },
};
const unit = (n: number | undefined) => Number.isFinite(n) ? Math.max(0, Math.min(1, n!)) : 0;
export function cleanShape(value: Partial<MouthShape>): MouthShape {
  return { open: unit(value.open), round: unit(value.round), wide: unit(value.wide) };
}
export function levelToMouth(rms: number): number {
  return Number.isFinite(rms) ? unit((rms - .012) * 7.5) ** .7 : 0;
}
/** 0 when this frame is well below the reply's recent peak (a gap between syllables), 1 near the peak. */
export function syllableGate(level: number, peak: number): number {
  if (!(level > 0) || !(peak > 0)) return 0;
  const ratio = level / Math.max(peak, .2);
  const t = Math.max(0, Math.min(1, (ratio - .45) / .4));
  return t * t * (3 - 2 * t);
}
export function cueAt(cues: VisemeCue[], time: number): MouthShape {
  const cue = cues.find(c => time >= c.start && time < c.end);
  return cue ? SHAPES[cue.shape] : REST;
}
export function visemeAt(cues: VisemeCue[], time: number): Viseme {
  return cues.find(c => time >= c.start && time < c.end)?.shape ?? 'rest';
}
export function validateCues(cues: VisemeCue[]): VisemeCue[] {
  return cues.filter(c => Number.isFinite(c.start) && Number.isFinite(c.end) && c.start >= 0 && c.end > c.start && Object.hasOwn(SHAPES, c.shape))
    .map(c => ({ ...c })).sort((a,b) => a.start-b.start);
}

/** Provider-independent output-audio/viseme bridge. Never requests a microphone. */
export class PortraitSpeech {
  private context?: AudioContext;
  private mediaNodes = new Map<HTMLMediaElement, MediaElementAudioSourceNode>();
  private analyser?: AnalyserNode;
  private source?: AudioNode;
  private samples = new Float32Array(2048);
  private spectrum = new Uint8Array(1024);
  private sampleRate = 48000;
  private fftSize = 2048;
  private audioMs = 0;
  private lips = new SpeechVisemes();
  private manual: MouthShape = { ...REST };
  private mode: 'manual' | 'audio' | 'visemes' = 'manual';
  private cues: VisemeCue[] = [];
  private clock: () => number = () => 0;
  private connection = 0;
  /** Recent loudness peak, so the syllable gate adapts to how loud this reply is. */
  private peak = 0;
  readonly current: MouthShape = { ...REST };
  viseme: Viseme = 'rest';
  /** Reply loudness, 0–1, for head and brow motion. */
  level = 0;

  setMouth(shape: Partial<MouthShape>) { this.mode = 'manual'; this.manual = cleanShape(shape); }
  setVisemes(cues: VisemeCue[], clock: () => number) {
    this.cues = validateCues(cues); this.clock = clock; this.mode = 'visemes';
  }
  reset() { this.level = 0; this.peak = 0; this.mode = 'manual'; this.manual = { ...REST }; this.viseme = 'rest'; this.audioMs = 0; this.lips.reset(); }
  disconnect() {
    this.connection++;
    if (this.source && this.analyser) this.source.disconnect(this.analyser);
    this.analyser?.disconnect(); this.analyser = undefined; this.source = undefined;
    this.reset();
  }
  async connectAudio(input: HTMLMediaElement | AudioNode | MediaStream) {
    this.disconnect();
    const connection = this.connection;
    let context: AudioContext;
    let source: AudioNode;
    if (input instanceof HTMLMediaElement) {
      context = this.context ??= new AudioContext();
      let node = this.mediaNodes.get(input);
      if (!node) {
        node = context.createMediaElementSource(input);
        node.connect(context.destination); // Preserve the element's audible playback.
        this.mediaNodes.set(input, node);
      }
      source = node;
    } else if (input instanceof MediaStream) {
      context = this.context ??= new AudioContext();
      source = context.createMediaStreamSource(input); // Analysis only; no feedback loop.
    } else {
      context = input.context as AudioContext;
      source = input; // Caller owns playback routing for an existing audio graph.
    }
    if (context.state === 'suspended') await context.resume();
    if (connection !== this.connection) return () => {};
    const analyser = context.createAnalyser();
    analyser.fftSize = 2048; analyser.smoothingTimeConstant = .5;
    this.samples = new Float32Array(analyser.fftSize || 2048);
    this.spectrum = new Uint8Array(analyser.frequencyBinCount || (analyser.fftSize || 2048) / 2);
    this.sampleRate = context.sampleRate || 48000;
    this.fftSize = analyser.fftSize || 2048;
    source.connect(analyser); this.source = source; this.analyser = analyser;
    this.mode = 'audio';
    return () => { if (connection === this.connection) this.disconnect(); };
  }
  update(dt: number): MouthShape {
    let target = this.manual;
    let level = 0;
    if (this.mode === 'visemes') {
      const time = this.clock();
      this.viseme = visemeAt(this.cues, time);
      target = SHAPES[this.viseme];
      level = target.open;
    } else if (this.mode === 'audio' && this.analyser) {
      this.analyser.getFloatTimeDomainData(this.samples);
      let sum = 0;
      for (const value of this.samples) sum += value*value;
      const rms = Math.sqrt(sum/this.samples.length);
      this.analyser.getByteFrequencyData(this.spectrum);
      this.audioMs += Math.min(100, Math.max(0, Number.isFinite(dt) ? dt*1000 : 0));
      const detected = this.lips.read(this.spectrum, this.sampleRate, this.fftSize, this.audioMs);
      level = levelToMouth(rms);
      // Shape comes from the viseme. How far it opens follows the syllable envelope, so the
      // lips meet in the quiet gaps between syllables instead of hovering half open.
      const ms = Math.min(100, Math.max(0, Number.isFinite(dt) ? dt * 1000 : 0));
      this.peak = Math.max(level, this.peak * Math.exp(-ms / 900));
      const gate = syllableGate(level, this.peak);
      if (level === 0 || gate === 0 || detected === 'MBP') { this.viseme = level === 0 ? 'rest' : detected; target = REST; }
      else {
        this.viseme = detected;
        const shape = SHAPES[detected];
        target = { open: shape.open * gate, round: shape.round * Math.max(gate, .4), wide: shape.wide * Math.max(gate, .4) };
      }
    } else { this.viseme = 'rest'; level = target.open; }
    const step = Math.max(0, Math.min(.1, Number.isFinite(dt) ? dt : 0));
    this.level += (level - this.level) * (1 - Math.exp(-step * 20));
    for (const key of ['open','round','wide'] as const) {
      // The jaw is heavier than the lips: opening eases a little slower than lip shaping,
      // which blends neighbouring visemes instead of snapping between them.
      // Closing is quick: lips snap shut on consonants and pauses faster than the jaw opens.
      const speed = key === 'open' ? (target[key] > this.current[key] ? 26 : 34) : (target[key] > this.current[key] ? 30 : 26);
      this.current[key] += (target[key]-this.current[key]) * (1-Math.exp(-step*speed));
      if (this.current[key] < .0001) this.current[key] = 0;
    }
    return this.current;
  }
  dispose() {
    this.disconnect();
    for (const node of this.mediaNodes.values()) node.disconnect();
    this.mediaNodes.clear();
    void this.context?.close();
  }
}
