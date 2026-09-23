/**
 * Browser speech-to-text for Ask Caleb.
 * Uses the Web Speech API only. It never calls getUserMedia and never feeds the portrait mouth analyser.
 */

export const HOLD_TO_TALK_MS = 400;

const FEEDBACK: Record<string, string> = {
  unsupported: 'Speech input isn’t available in this browser.',
  insecure: 'Speech input isn’t available in this browser.',
  'not-allowed': 'Microphone permission denied.',
  'service-not-allowed': 'Speech recognition is unavailable.',
  'no-speech': 'Didn’t catch that.',
  'audio-capture': 'No microphone was found.',
  network: 'Speech recognition is unavailable.',
  'language-not-supported': 'Speech recognition is unavailable.',
  unavailable: 'Speech recognition is unavailable.',
};

export interface RecognitionAlternative { transcript?: string }
export interface RecognitionResult extends ArrayLike<RecognitionAlternative> { isFinal?: boolean }
export interface RecognitionEvent { results: ArrayLike<RecognitionResult> }
export interface RecognitionErrorEvent { error?: string }

export interface RecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: RecognitionEvent) => void) | null;
  onerror: ((event: RecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

export type RecognitionCtor = new () => RecognitionLike;

export interface SpeechHost {
  isSecureContext?: boolean;
  SpeechRecognition?: RecognitionCtor;
  webkitSpeechRecognition?: RecognitionCtor;
}

export interface SpeechSessionHandlers {
  onInterim?: (text: string) => void;
  onFinal: (text: string) => void;
  onError: (message: string) => void;
  onListening?: (listening: boolean) => void;
}

export interface SpeechSession {
  readonly listening: boolean;
  start(): void;
  stop(): void;
  abort(): void;
}

/** Short status copy for permission, support, and empty-result failures. `null` means the error should be ignored. */
export function speechFeedback(code: string): string | null {
  if (code === 'aborted') return null;
  return FEEDBACK[code] ?? FEEDBACK.unavailable;
}

export function normalizeTranscript(value: string, max = 600): string {
  return value.replace(/\s+/g, ' ').trim().slice(0, max);
}

export function transcriptFromResults(results: ArrayLike<ArrayLike<{ transcript?: string }>>): string {
  let text = '';
  for (let i = 0; i < results.length; i++) text += results[i]?.[0]?.transcript ?? '';
  return text;
}

export function speechRecognitionConstructor(host: SpeechHost): RecognitionCtor | null {
  if (host.isSecureContext === false) return null;
  const ctor = host.SpeechRecognition ?? host.webkitSpeechRecognition;
  return typeof ctor === 'function' ? ctor : null;
}

/**
 * Quick tap starts a phrase and lets the browser finish it.
 * A press held past {@link HOLD_TO_TALK_MS}, or any press while already listening, commits on release.
 */
export function talkReleaseAction(startedWhileListening: boolean, elapsedMs: number): 'keep' | 'stop' {
  if (!startedWhileListening && elapsedMs < HOLD_TO_TALK_MS) return 'keep';
  return 'stop';
}

export function createSpeechSession(
  Recognition: RecognitionCtor,
  handlers: SpeechSessionHandlers,
  options: { lang?: string } = {},
): SpeechSession {
  let recognition: RecognitionLike | undefined;
  let listening = false;
  let discarded = false;
  let failed = false;
  let settled = false;
  let raw = '';

  const finish = () => {
    if (settled) return;
    settled = true;
    const wasListening = listening;
    listening = false;
    recognition = undefined;
    if (wasListening) handlers.onListening?.(false);
    if (discarded || failed) return;
    const text = normalizeTranscript(raw);
    if (!text) handlers.onError(speechFeedback('no-speech')!);
    else handlers.onFinal(text);
  };

  return {
    get listening() { return listening; },
    start() {
      if (listening) return;
      discarded = false;
      failed = false;
      settled = false;
      raw = '';
      const next = new Recognition();
      next.lang = options.lang || 'en-US';
      next.continuous = false;
      next.interimResults = true;
      next.onresult = event => {
        raw = transcriptFromResults(event.results);
        handlers.onInterim?.(normalizeTranscript(raw));
      };
      next.onerror = event => {
        const code = event.error || 'unavailable';
        if (code === 'aborted') { discarded = true; return; }
        failed = true;
        const message = speechFeedback(code);
        if (message) handlers.onError(message);
      };
      next.onend = finish;
      recognition = next;
      try {
        next.start();
      } catch {
        failed = true;
        settled = true;
        recognition = undefined;
        handlers.onError(speechFeedback('unavailable')!);
        return;
      }
      if (settled) return;
      listening = true;
      handlers.onListening?.(true);
    },
    stop() {
      if (!recognition || settled) return;
      try { recognition.stop(); }
      catch { finish(); }
    },
    abort() {
      discarded = true;
      if (!recognition || settled) return;
      try { recognition.abort(); }
      catch { finish(); }
    },
  };
}
