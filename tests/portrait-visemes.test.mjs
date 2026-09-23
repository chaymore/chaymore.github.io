import test from 'node:test';
import assert from 'node:assert/strict';
import { SpeechVisemes, PORTRAIT_VISEME } from '../src/scripts/portrait-visemes.ts';
import { PortraitSpeech, REST, SHAPES } from '../src/scripts/portrait-speech.ts';

const BANDS = [[50, 200], [200, 400], [400, 800], [800, 1500], [1500, 2500], [2500, 4000], [4000, 8000]];

function spectrumFromBands(levels) {
  const sampleRate = 48000, fftSize = 2048, bin = sampleRate / fftSize;
  const spectrum = new Uint8Array(fftSize / 2);
  levels.forEach((level, index) => {
    const [start, end] = BANDS[index];
    spectrum.fill(Math.round(level * 255), Math.round(start / bin), Math.min(Math.round(end / bin), spectrum.length));
  });
  return { spectrum, sampleRate, fftSize };
}

function settle(levels) {
  const lips = new SpeechVisemes();
  const frame = spectrumFromBands(levels);
  let shape = 'rest';
  for (let i = 0; i < 8; i++) shape = lips.read(frame.spectrum, frame.sampleRate, frame.fftSize, i * 20);
  return shape;
}

test('silence and an empty analyser stay at rest', () => {
  const lips = new SpeechVisemes();
  const quiet = spectrumFromBands([0, 0, 0, 0, 0, 0, 0]);
  for (let i = 0; i < 6; i++) assert.equal(lips.read(quiet.spectrum, quiet.sampleRate, quiet.fftSize, i * 16), 'rest');
  assert.equal(lips.read(new Uint8Array(), 48000, 2048, 100), 'rest');
  assert.equal(PORTRAIT_VISEME.viseme_PP, 'MBP');
  assert.equal(PORTRAIT_VISEME.viseme_aa, 'A');
  assert.equal(PORTRAIT_VISEME.viseme_SS, 'I');
});

test('sustained formants select different portrait shapes', () => {
  assert.equal(settle([0.4, 0.5, 0.58, 0.56, 0.14, 0.01, 0]), 'A');
  assert.equal(settle([0.52, 0.64, 0.65, 0.47, 0.39, 0.09, 0]), 'E');
  assert.equal(settle([0.66, 0.79, 0.49, 0.37, 0.36, 0.12, 0]), 'I');
  assert.equal(settle([0.44, 0.57, 0.68, 0.42, 0.07, 0, 0]), 'O');
  assert.equal(settle([0.61, 0.77, 0.54, 0.39, 0.06, 0, 0]), 'U');
  assert.equal(settle([0, 0, 0, 0, 0, 0.01, 0.56]), 'I');
  assert.equal(settle([0, 0, 0, 0, 0.26, 0.51, 0.07]), 'FV');
});

test('a vowel does not stick after the signal returns to silence', () => {
  const lips = new SpeechVisemes();
  const vowel = spectrumFromBands([0.02, 0.7, 0.4, 0.15, 0.05, 0, 0]);
  const quiet = spectrumFromBands([0, 0, 0, 0, 0, 0, 0]);
  for (let i = 0; i < 8; i++) lips.read(vowel.spectrum, vowel.sampleRate, vowel.fftSize, i * 20);
  assert.equal(lips.read(quiet.spectrum, quiet.sampleRate, quiet.fftSize, 200), 'rest');
});

test('identical loudness with different spectra drives different mouth shapes', async () => {
  globalThis.HTMLMediaElement = class {};
  globalThis.MediaStream = class {};
  let levels = [0.52, 0.64, 0.65, 0.47, 0.39, 0.09, 0];
  const analyser = () => ({
    fftSize: 0,
    smoothingTimeConstant: 0,
    frequencyBinCount: 1024,
    getFloatTimeDomainData(data) { data.fill(0.08); },
    getByteFrequencyData(data) {
      const frame = spectrumFromBands(levels);
      data.set(frame.spectrum.subarray(0, data.length));
    },
    disconnect() {},
  });
  const context = { state: 'running', sampleRate: 48000, createAnalyser: analyser };
  const source = () => ({ context, connect() {}, disconnect() {} });
  const driver = new PortraitSpeech();
  await driver.connectAudio(source());
  levels = [0.52, 0.64, 0.65, 0.47, 0.39, 0.09, 0];
  for (let i = 0; i < 40; i++) driver.update(1 / 60);
  assert.equal(driver.viseme, 'E');
  assert.ok(driver.current.wide > driver.current.round);
  levels = [0.44, 0.57, 0.68, 0.42, 0.07, 0, 0];
  for (let i = 0; i < 40; i++) driver.update(1 / 60);
  assert.equal(driver.viseme, 'O');
  assert.ok(driver.current.round > 0.5);
  assert.ok(driver.current.round > driver.current.wide);
  assert.ok(Math.abs(driver.current.open - SHAPES.O.open) < 0.15);
  levels = [0, 0, 0, 0, 0, 0, 0];
  const quiet = new PortraitSpeech();
  const silentAnalyser = () => ({
    fftSize: 2048,
    frequencyBinCount: 1024,
    smoothingTimeConstant: 0,
    getFloatTimeDomainData(data) { data.fill(0); },
    getByteFrequencyData(data) { data.fill(0); },
    disconnect() {},
  });
  await quiet.connectAudio({ context: { state: 'running', sampleRate: 48000, createAnalyser: silentAnalyser }, connect() {}, disconnect() {} });
  for (let i = 0; i < 30; i++) quiet.update(1 / 60);
  assert.equal(quiet.viseme, 'rest');
  assert.deepEqual(quiet.current, REST);
});
