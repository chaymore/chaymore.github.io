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
export function cueAt(cues: VisemeCue[], time: number): MouthShape {
  const cue = cues.find(c => time >= c.start && time < c.end);
  return cue ? SHAPES[cue.shape] : REST;
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
  private samples = new Float32Array(1024);
  private spectrum = new Uint8Array(512);
  private manual: MouthShape = { ...REST };
  private mode: 'manual' | 'audio' | 'visemes' = 'manual';
  private cues: VisemeCue[] = [];
  private clock: () => number = () => 0;
  private connection = 0;
  readonly current: MouthShape = { ...REST };

  setMouth(shape: Partial<MouthShape>) { this.mode = 'manual'; this.manual = cleanShape(shape); }
  setVisemes(cues: VisemeCue[], clock: () => number) {
    this.cues = validateCues(cues); this.clock = clock; this.mode = 'visemes';
  }
  reset() { this.mode = 'manual'; this.manual = { ...REST }; }
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
    analyser.fftSize = 1024; analyser.smoothingTimeConstant = .5;
    source.connect(analyser); this.source = source; this.analyser = analyser;
    this.mode = 'audio';
    return () => { if (connection === this.connection) this.disconnect(); };
  }
  update(dt: number): MouthShape {
    let target = this.manual;
    if (this.mode === 'visemes') target = cueAt(this.cues, this.clock());
    if (this.mode === 'audio' && this.analyser) {
      this.analyser.getFloatTimeDomainData(this.samples);
      let sum = 0;
      for (const value of this.samples) sum += value*value;
      const open = levelToMouth(Math.sqrt(sum/this.samples.length));
      this.analyser.getByteFrequencyData(this.spectrum);
      let low = 0, high = 0;
      for (let i=2; i<14; i++) low += this.spectrum[i];
      for (let i=18; i<60; i++) high += this.spectrum[i];
      const brightness = high/(low+high+1);
      // A speech-like fallback, not a phoneme recognizer. Timed visemes take precedence.
      target = { open, round: open * Math.max(0, .7-brightness), wide: open * brightness * .65 };
    }
    const step = Math.max(0, Math.min(.1, Number.isFinite(dt) ? dt : 0));
    for (const key of ['open','round','wide'] as const) {
      const speed = target[key] > this.current[key] ? 24 : 15;
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
