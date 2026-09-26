/** Fish Audio voice cloning through OpenRouter, with the existing MAI voice as fallback. */

export const MAI_MODEL = 'microsoft/mai-voice-2-flash';
export const MAI_VOICE = 'en-US-Harper:MAI-Voice-2';
/** Free spike model. Set FISH_TTS_MODEL to `fish-audio/s2.1-pro` for the paid model. */
export const DEFAULT_FISH_MODEL = 'fish-audio/s2.1-pro-free:free';
export const DEFAULT_REFERENCE_KEY = 'caleb-reference.wav';
/** OpenRouter rejects reference audio above 15 MiB decoded (20 MiB of base64). */
export const MAX_REFERENCE_BYTES = 15 * 1024 * 1024;
const MAX_TRANSCRIPT_CHARS = 10_000;

export type VoiceMode = 'clone' | 'synthetic';
export type VoiceStatus = VoiceMode | 'misconfigured';

export interface VoiceReferenceBucket {
  head(key: string): Promise<{ etag?: string; httpMetadata?: { contentType?: string } } | null>;
  get(key: string): Promise<{ arrayBuffer(): Promise<ArrayBuffer>; httpMetadata?: { contentType?: string } } | null>;
}

export interface SpeechEnv {
  TTS_MODEL?: string;
  TTS_VOICE?: string;
  FISH_TTS_MODEL?: string;
  FISH_REFERENCE_ID?: string;
  FISH_REFERENCE_TRANSCRIPT?: string;
  FISH_REFERENCE_AUDIO?: string;
  FISH_REFERENCE_KEY?: string;
  VOICE_REFERENCE?: VoiceReferenceBucket;
}

interface AudioReference {
  kind: 'audio';
  dataUri: string;
  transcript?: string;
}

interface IdReference {
  kind: 'id';
  id: string;
}

type CloneReference = AudioReference | IdReference;

export interface SpeechPlan {
  mode: VoiceMode;
  body: Record<string, unknown>;
}

export class VoiceReferenceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'VoiceReferenceError';
  }
}

let referenceCache: { key: string; etag: string; dataUri: string; checked: number } | undefined;
/** How long to trust the cached reference before checking R2 for a replacement. */
const REFERENCE_RECHECK_MS = 10 * 60 * 1000;

export function resetReferenceCache() {
  referenceCache = undefined;
}

/** Forces the next request to check R2 for a replaced reference. */
export function expireReferenceCache() {
  if (referenceCache) referenceCache.checked = 0;
}

export async function voiceStatus(env: SpeechEnv): Promise<VoiceStatus> {
  try {
    return (await resolveReference(env)) ? 'clone' : 'synthetic';
  } catch (error) {
    if (error instanceof VoiceReferenceError) {
      console.error('Voice reference', error.message);
      return 'misconfigured';
    }
    throw error;
  }
}

export async function planSpeech(text: string, env: SpeechEnv): Promise<SpeechPlan> {
  const reference = await resolveReference(env);
  if (!reference) {
    return {
      mode: 'synthetic',
      body: {
        model: env.TTS_MODEL?.trim() || MAI_MODEL,
        voice: env.TTS_VOICE?.trim() || MAI_VOICE,
        input: text,
        response_format: 'mp3',
      },
    };
  }
  return { mode: 'clone', body: fishBody(text, reference, fishModel(env)) };
}

export function speechResponseHeaders(cors: HeadersInit, mode: VoiceMode): Headers {
  const headers = new Headers(cors);
  headers.set('content-type', 'audio/mpeg');
  headers.set('cache-control', 'no-store');
  headers.set('access-control-expose-headers', 'x-portrait-voice');
  headers.set('x-portrait-voice', mode);
  return headers;
}

async function resolveReference(env: SpeechEnv): Promise<CloneReference | null> {
  const id = env.FISH_REFERENCE_ID?.trim() ?? '';
  if (id) {
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(id)) {
      throw new VoiceReferenceError('FISH_REFERENCE_ID is not a Fish voice id.');
    }
    return { kind: 'id', id };
  }

  const inline = env.FISH_REFERENCE_AUDIO?.trim() ?? '';
  if (inline) return { kind: 'audio', dataUri: dataUriFromEncoded(inline), transcript: transcript(env) };

  const key = env.FISH_REFERENCE_KEY?.trim() ?? '';
  if (key && !env.VOICE_REFERENCE) {
    console.warn('FISH_REFERENCE_KEY is set but the VOICE_REFERENCE R2 bucket is not bound.');
  }
  if (!env.VOICE_REFERENCE) return null;

  const objectKey = key || DEFAULT_REFERENCE_KEY;
  if (objectKey.includes('..') || !/^[A-Za-z0-9._/-]{1,200}$/.test(objectKey)) {
    throw new VoiceReferenceError('FISH_REFERENCE_KEY is not a usable R2 object key.');
  }
  if (referenceCache?.key === objectKey && Date.now() - referenceCache.checked < REFERENCE_RECHECK_MS) {
    return { kind: 'audio', dataUri: referenceCache.dataUri, transcript: transcript(env) };
  }
  const head = await env.VOICE_REFERENCE.head(objectKey);
  if (!head) return null;
  const etag = head.etag ?? '';
  if (referenceCache?.key === objectKey && referenceCache.etag === etag) {
    referenceCache.checked = Date.now();
    return { kind: 'audio', dataUri: referenceCache.dataUri, transcript: transcript(env) };
  }
  const object = await env.VOICE_REFERENCE.get(objectKey);
  if (!object) throw new VoiceReferenceError('The voice reference disappeared while it was being read.');
  const bytes = new Uint8Array(await object.arrayBuffer());
  const hint = object.httpMetadata?.contentType || head.httpMetadata?.contentType || objectKey;
  const dataUri = dataUriFromBytes(bytes, hint);
  referenceCache = { key: objectKey, etag, dataUri, checked: Date.now() };
  return { kind: 'audio', dataUri, transcript: transcript(env) };
}

function fishModel(env: SpeechEnv) {
  const model = env.FISH_TTS_MODEL?.trim() || DEFAULT_FISH_MODEL;
  if (!/^fish-audio\/[A-Za-z0-9._:-]+$/.test(model)) {
    throw new VoiceReferenceError('FISH_TTS_MODEL must be a fish-audio model slug.');
  }
  return model;
}

function fishBody(text: string, reference: CloneReference, model: string): Record<string, unknown> {
  if (reference.kind === 'id') {
    return {
      model,
      input: text,
      voice: reference.id,
      response_format: 'mp3',
      provider: { options: { 'fish-audio': { reference_id: reference.id } } },
    };
  }
  const input_references: Array<Record<string, unknown>> = [
    { type: 'input_audio', input_audio: { data: reference.dataUri } },
  ];
  if (reference.transcript) input_references.push({ type: 'text', text: reference.transcript });
  return { model, input: text, response_format: 'mp3', input_references };
}

function transcript(env: SpeechEnv) {
  const text = env.FISH_REFERENCE_TRANSCRIPT?.trim() ?? '';
  if (!text) return undefined;
  if (text.length > MAX_TRANSCRIPT_CHARS) {
    throw new VoiceReferenceError('FISH_REFERENCE_TRANSCRIPT is longer than 10000 characters.');
  }
  return text;
}

function dataUriFromEncoded(value: string) {
  const dataUri = value.match(/^data:(audio\/[a-z0-9.+-]+);base64,([A-Za-z0-9+/=\s]+)$/i);
  if (dataUri) {
    const bytes = decodeBase64(dataUri[2]);
    assertReferenceSize(bytes);
    return `data:${dataUri[1].toLowerCase()};base64,${bytesToBase64(bytes)}`;
  }
  return dataUriFromBytes(decodeBase64(value));
}

function dataUriFromBytes(bytes: Uint8Array, hint?: string) {
  assertReferenceSize(bytes);
  return `data:${sniffAudioType(bytes, hint)};base64,${bytesToBase64(bytes)}`;
}

function assertReferenceSize(bytes: Uint8Array) {
  if (!bytes.length) throw new VoiceReferenceError('The voice reference audio is empty.');
  if (bytes.length > MAX_REFERENCE_BYTES) {
    throw new VoiceReferenceError('The voice reference audio is larger than 15 MiB.');
  }
}

function decodeBase64(value: string) {
  const cleaned = value.replace(/\s/g, '');
  if (!cleaned || cleaned.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(cleaned)) {
    throw new VoiceReferenceError('The voice reference audio is not valid base64.');
  }
  const binary = atob(cleaned);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export function bytesToBase64(bytes: Uint8Array) {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    const slice = bytes.subarray(i, Math.min(i + chunk, bytes.length));
    for (let j = 0; j < slice.length; j++) binary += String.fromCharCode(slice[j]);
  }
  return btoa(binary);
}

function sniffAudioType(bytes: Uint8Array, hint?: string) {
  if (bytes.length >= 12 && ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 12) === 'WAVE') return 'audio/wav';
  if (bytes.length >= 3 && ascii(bytes, 0, 3) === 'ID3') return 'audio/mpeg';
  if (bytes.length >= 2 && bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0) return 'audio/mpeg';
  if (bytes.length >= 4 && ascii(bytes, 0, 4) === 'fLaC') return 'audio/flac';
  const hinted = audioTypeFromHint(hint);
  if (hinted) return hinted;
  throw new VoiceReferenceError('The voice reference must be WAV, MP3, or FLAC.');
}

function audioTypeFromHint(hint?: string) {
  if (!hint) return undefined;
  const value = hint.toLowerCase();
  if (value.includes('wav')) return 'audio/wav';
  if (value.includes('mpeg') || value.includes('mp3')) return 'audio/mpeg';
  if (value.includes('flac')) return 'audio/flac';
  return undefined;
}

function ascii(bytes: Uint8Array, start: number, end: number) {
  let text = '';
  for (let i = start; i < end; i++) text += String.fromCharCode(bytes[i]);
  return text;
}
