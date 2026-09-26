import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  HOLD_TO_TALK_MS,
  createSpeechSession,
  normalizeTranscript,
  speechFeedback,
  speechRecognitionConstructor,
  talkReleaseAction,
} from '../src/scripts/portrait-speech-input.ts';

class FakeRecognition {
  static instances = [];
  constructor() {
    this.lang = '';
    this.continuous = true;
    this.interimResults = false;
    this.onresult = null;
    this.onerror = null;
    this.onend = null;
    FakeRecognition.instances.push(this);
  }
  start() {}
  stop() { queueMicrotask(() => this.onend?.()); }
  abort() {
    this.onerror?.({ error: 'aborted' });
    queueMicrotask(() => this.onend?.());
  }
  emit(chunks) {
    const results = chunks.map(([transcript, isFinal]) => Object.assign([{ transcript }], { isFinal, length: 1 }));
    this.onresult?.({ results });
  }
  fail(error) {
    this.onerror?.({ error });
    queueMicrotask(() => this.onend?.());
  }
}

function session(options = {}) {
  FakeRecognition.instances = [];
  const events = [];
  const speech = createSpeechSession(FakeRecognition, {
    onInterim: text => events.push(['interim', text]),
    onFinal: text => events.push(['final', text]),
    onError: message => events.push(['error', message]),
    onListening: on => events.push(['listen', on]),
  }, options);
  return { speech, events, recognition: () => FakeRecognition.instances.at(-1) };
}

const flush = () => new Promise(resolve => setTimeout(resolve, 0));

test('transcripts collapse whitespace and stay within the composer limit', () => {
  assert.equal(normalizeTranscript('  what   are\nyou   building?  '), 'what are you building?');
  assert.equal(normalizeTranscript('x'.repeat(800)).length, 600);
  assert.equal(normalizeTranscript('   '), '');
});

test('speech feedback stays short and ignores aborts', () => {
  assert.equal(speechFeedback('aborted'), null);
  assert.equal(speechFeedback('not-allowed'), 'Microphone permission denied.');
  assert.equal(speechFeedback('unsupported'), 'Speech input isn’t available in this browser.');
  assert.equal(speechFeedback('insecure'), 'Speech input isn’t available in this browser.');
  assert.equal(speechFeedback('no-speech'), 'Didn’t catch that.');
  assert.equal(speechFeedback('audio-capture'), 'No microphone was found.');
  assert.equal(speechFeedback('network'), 'Speech recognition is unavailable.');
  assert.equal(speechFeedback('service-not-allowed'), 'Speech recognition is unavailable.');
  assert.equal(speechFeedback('mystery'), 'Speech recognition is unavailable.');
});

test('speech recognition is available only in a secure context with a constructor', () => {
  const Ctor = class {};
  assert.equal(speechRecognitionConstructor({ isSecureContext: false, SpeechRecognition: Ctor }), null);
  assert.equal(speechRecognitionConstructor({ isSecureContext: true }), null);
  assert.equal(speechRecognitionConstructor({ webkitSpeechRecognition: Ctor }), Ctor);
  assert.equal(speechRecognitionConstructor({ SpeechRecognition: Ctor, webkitSpeechRecognition: class {} }), Ctor);
});

test('tap keeps listening and hold or a second press commits', () => {
  assert.equal(talkReleaseAction(false, HOLD_TO_TALK_MS - 1), 'keep');
  assert.equal(talkReleaseAction(false, HOLD_TO_TALK_MS), 'stop');
  assert.equal(talkReleaseAction(true, 10), 'stop');
});

test('a finished phrase is committed once and interim text is normalized', async () => {
  const { speech, events, recognition } = session({ lang: 'en-GB' });
  speech.start();
  const recognitionNode = recognition();
  assert.equal(recognitionNode.lang, 'en-GB');
  assert.equal(recognitionNode.continuous, false);
  assert.equal(recognitionNode.interimResults, true);
  recognitionNode.emit([['hello ', true], ['  there', false]]);
  recognitionNode.stop();
  await flush();
  assert.deepEqual(events, [
    ['listen', true],
    ['interim', 'hello there'],
    ['listen', false],
    ['final', 'hello there'],
  ]);
  recognitionNode.onend?.();
  assert.equal(events.filter(event => event[0] === 'final').length, 1);
  assert.equal(speech.listening, false);
});

test('hold release commits the latest interim phrase', async () => {
  const { speech, events, recognition } = session();
  speech.start();
  recognition().emit([['  what are you working on  ', false]]);
  speech.stop();
  await flush();
  assert.deepEqual(events.at(-1), ['final', 'what are you working on']);
});

test('permission, capture, and empty results surface one message and do not submit', async () => {
  for (const [code, message] of [['not-allowed', 'Microphone permission denied.'], ['audio-capture', 'No microphone was found.']]) {
    const { speech, events, recognition } = session();
    speech.start();
    recognition().fail(code);
    await flush();
    assert.deepEqual(events.filter(event => event[0] === 'error'), [['error', message]]);
    assert.equal(events.some(event => event[0] === 'final'), false);
    assert.equal(speech.listening, false);
  }
  const empty = session();
  empty.speech.start();
  empty.recognition().onend?.();
  assert.deepEqual(empty.events.at(-1), ['error', 'Didn’t catch that.']);
});

test('abort drops a partial transcript and a failed start stays idle', async () => {
  const { speech, events, recognition } = session();
  speech.start();
  recognition().emit([['partial', false]]);
  speech.abort();
  await flush();
  assert.equal(events.some(event => event[0] === 'final' || event[0] === 'error'), false);
  assert.equal(speech.listening, false);

  class Boom extends FakeRecognition { start() { throw new Error('blocked'); } }
  const failed = [];
  const broken = createSpeechSession(Boom, {
    onFinal: () => failed.push('final'),
    onError: message => failed.push(message),
    onListening: () => failed.push('listen'),
  });
  broken.start();
  assert.deepEqual(failed, ['Speech recognition is unavailable.']);
  assert.equal(broken.listening, false);
});

test('starting twice does not open a second recognizer', () => {
  const { speech } = session();
  speech.start();
  speech.start();
  assert.equal(FakeRecognition.instances.length, 1);
});

test('a recognizer that ends inside start does not stay listening', () => {
  class Immediate extends FakeRecognition {
    start() { this.onend?.(); }
  }
  const events = [];
  const speech = createSpeechSession(Immediate, {
    onFinal: text => events.push(['final', text]),
    onError: message => events.push(['error', message]),
    onListening: on => events.push(['listen', on]),
  });
  speech.start();
  assert.equal(speech.listening, false);
  assert.deepEqual(events, [['error', 'Didn’t catch that.']]);
});

test('user speech never opens a microphone stream for mouth analysis', () => {
  const input = readFileSync(new URL('../src/scripts/portrait-speech-input.ts', import.meta.url), 'utf8');
  const chat = readFileSync(new URL('../src/scripts/portrait-chat.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(input, /getUserMedia\s*\(|connectAudio\s*\(|new\s+MediaRecorder|new\s+MediaStream/);
  assert.doesNotMatch(chat, /getUserMedia\s*\(|new\s+MediaRecorder/);
  assert.match(chat, /connectAudio\(element\)/);
});
