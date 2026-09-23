import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_FISH_MODEL,
  MAI_MODEL,
  MAI_VOICE,
  VoiceReferenceError,
  bytesToBase64,
  planSpeech,
  resetReferenceCache,
  speechResponseHeaders,
  voiceStatus,
} from '../portrait-worker/src/speech.ts';

function wavBytes() {
  const bytes = new Uint8Array(16);
  bytes.set([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x41, 0x56, 0x45], 0);
  return bytes;
}

function bucket(objects) {
  const gets = [];
  return {
    gets,
    async head(key) {
      const object = objects.get(key);
      return object ? { etag: object.etag, httpMetadata: object.httpMetadata } : null;
    },
    async get(key) {
      gets.push(key);
      const object = objects.get(key);
      if (!object) return null;
      return { arrayBuffer: async () => object.bytes.buffer.slice(object.bytes.byteOffset, object.bytes.byteOffset + object.bytes.byteLength), httpMetadata: object.httpMetadata };
    },
  };
}

test('speech stays on the MAI voice until a reference is configured', async () => {
  const plan = await planSpeech('Hello', {});
  assert.equal(plan.mode, 'synthetic');
  assert.deepEqual(plan.body, {
    model: MAI_MODEL,
    voice: MAI_VOICE,
    input: 'Hello',
    response_format: 'mp3',
  });
  assert.equal(await voiceStatus({}), 'synthetic');
  const headers = speechResponseHeaders({ 'access-control-allow-origin': 'https://calebhaymore.com' }, plan.mode);
  assert.equal(headers.get('content-type'), 'audio/mpeg');
  assert.equal(headers.get('x-portrait-voice'), 'synthetic');
  assert.equal(headers.get('access-control-expose-headers'), 'x-portrait-voice');
});

test('a Fish voice id is sent as the OpenRouter voice and reference_id', async () => {
  const plan = await planSpeech('Hello from the clone.', {
    FISH_REFERENCE_ID: ' 52ff7eb6f4d945bab60262f738dc34a7 ',
    FISH_REFERENCE_AUDIO: bytesToBase64(wavBytes()),
  });
  assert.equal(plan.mode, 'clone');
  assert.equal(plan.body.model, DEFAULT_FISH_MODEL);
  assert.equal(plan.body.voice, '52ff7eb6f4d945bab60262f738dc34a7');
  assert.equal(plan.body.response_format, 'mp3');
  assert.equal(plan.body.input_references, undefined);
  assert.deepEqual(plan.body.provider, {
    options: { 'fish-audio': { reference_id: '52ff7eb6f4d945bab60262f738dc34a7' } },
  });
});

test('FISH_TTS_MODEL selects the paid Fish model without changing the MP3 contract', async () => {
  const plan = await planSpeech('Paid path.', {
    FISH_REFERENCE_ID: 'model-id',
    FISH_TTS_MODEL: 'fish-audio/s2.1-pro',
  });
  assert.equal(plan.body.model, 'fish-audio/s2.1-pro');
  assert.equal(plan.body.response_format, 'mp3');
});

test('raw base64 reference audio is sniffed and sent as a data URI', async () => {
  const plan = await planSpeech('Local clip.', { FISH_REFERENCE_AUDIO: bytesToBase64(wavBytes()) });
  assert.equal(plan.body.voice, undefined);
  assert.equal(plan.body.input_references[0].input_audio.data, `data:audio/wav;base64,${bytesToBase64(wavBytes())}`);
  assert.equal(plan.body.input_references.length, 1);
});

test('inline reference audio uses input_references and an optional transcript', async () => {
  const plan = await planSpeech('Stateless clone.', {
    FISH_REFERENCE_AUDIO: `data:audio/wav;base64,${bytesToBase64(wavBytes())}`,
    FISH_REFERENCE_TRANSCRIPT: ' This is the reference. ',
  });
  assert.equal(plan.mode, 'clone');
  assert.equal(plan.body.voice, undefined);
  assert.equal(plan.body.provider, undefined);
  assert.deepEqual(plan.body.input_references, [
    { type: 'input_audio', input_audio: { data: `data:audio/wav;base64,${bytesToBase64(wavBytes())}` } },
    { type: 'text', text: 'This is the reference.' },
  ]);
});

test('an R2 clip is cloned, cached by etag, and a missing object keeps Harper', async () => {
  resetReferenceCache();
  const audio = wavBytes();
  const store = new Map([['caleb-reference.wav', { etag: 'v1', bytes: audio }]]);
  const bound = bucket(store);
  const first = await planSpeech('From storage.', { VOICE_REFERENCE: bound });
  const second = await planSpeech('From storage again.', { VOICE_REFERENCE: bound });
  assert.equal(bound.gets.length, 1);
  assert.equal(first.body.input_references[0].input_audio.data.startsWith('data:audio/wav;base64,'), true);
  assert.equal(second.body.input_references[0].input_audio.data, first.body.input_references[0].input_audio.data);

  store.set('caleb-reference.wav', { etag: 'v2', bytes: audio });
  await planSpeech('Updated clip.', { VOICE_REFERENCE: bound });
  assert.equal(bound.gets.length, 2);

  const empty = bucket(new Map());
  const fallback = await planSpeech('No object.', { VOICE_REFERENCE: empty });
  assert.equal(fallback.mode, 'synthetic');
  assert.equal(fallback.body.model, MAI_MODEL);
  resetReferenceCache();
});

test('a broken reference is reported instead of silently using Harper', async () => {
  await assert.rejects(() => planSpeech('Nope.', { FISH_REFERENCE_ID: 'not a voice' }), VoiceReferenceError);
  await assert.rejects(() => planSpeech('Nope.', { FISH_REFERENCE_AUDIO: '%%%' }), VoiceReferenceError);
  await assert.rejects(
    () => planSpeech('Nope.', { FISH_REFERENCE_ID: 'model-id', FISH_TTS_MODEL: 'microsoft/mai-voice-2-flash' }),
    VoiceReferenceError,
  );
  assert.equal(await voiceStatus({ FISH_REFERENCE_AUDIO: '%%%' }), 'misconfigured');
  const headers = speechResponseHeaders({}, 'clone');
  assert.equal(headers.get('x-portrait-voice'), 'clone');
  assert.equal(headers.get('content-type'), 'audio/mpeg');
});
