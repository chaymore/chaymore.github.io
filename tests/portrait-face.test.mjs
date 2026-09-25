import test from 'node:test';
import assert from 'node:assert/strict';
import { blinkAmount, createFaceMotion, REST_POSE } from '../src/scripts/portrait-face.ts';
import { deform, pointVertex, eyeVertex, lids } from '../src/scripts/portrait-shaders.ts';

test('a blink closes briefly and returns to open', () => {
  assert.equal(blinkAmount(0), 0);
  assert.equal(blinkAmount(1), 0);
  assert.ok(blinkAmount(0.32) > 0.99);
  assert.ok(blinkAmount(0.16) > 0.5 && blinkAmount(0.16) < 1);
});

test('blinks stay sparse, brows stay small, and reduced motion holds still', () => {
  const face = createFaceMotion(() => 0.5);
  let peak = 0;
  let blinks = 0;
  let above = false;
  for (let t = 0; t < 4; t += 1 / 60) {
    const pose = face.update(1 / 60, { speaking: false, reducedMotion: false });
    assert.ok(pose.blink >= 0 && pose.blink <= 1);
    assert.ok(Math.abs(pose.brow) <= 0.55);
    if (pose.blink > 0.8) peak = Math.max(peak, pose.blink);
    if (pose.blink > 0.5 && !above) { blinks += 1; above = true; }
    if (pose.blink < 0.2) above = false;
  }
  assert.equal(blinks, 1);
  assert.ok(peak > 0.9);

  const still = createFaceMotion(() => 0);
  for (let i = 0; i < 300; i++) {
    const pose = still.update(1 / 60, { speaking: false, reducedMotion: true });
    assert.equal(pose.blink, 0);
    assert.equal(pose.brow, 0);
  }
});

test('speech lifts the brow slightly without leaving the subtle range', () => {
  const idle = createFaceMotion(() => 0.8);
  const speaking = createFaceMotion(() => 0.8);
  let idleBrow = 0, speakBrow = 0;
  for (let i = 0; i < 180; i++) {
    idleBrow = idle.update(1 / 60, { speaking: false, reducedMotion: false }).brow;
    speakBrow = speaking.update(1 / 60, { speaking: true, reducedMotion: false }).brow;
  }
  assert.ok(speakBrow > idleBrow + 0.05);
  assert.ok(speakBrow < 0.55);
});

test('blinks and brows deform the same stipple shader as the mouth', () => {
  assert.match(deform, /uniform float blink/);
  assert.match(deform, /uniform float brow/);
  assert.match(pointVertex, /eyeLids\(/);
  assert.match(pointVertex, /return express\(p\)/);
  assert.doesNotMatch(deform, /getUserMedia/);
});

test('the jaw hinges instead of only dropping the lower lip', () => {
  assert.match(deform, /jawPivot/);
  assert.match(deform, /mouth\.x \* \.075/);
});

test('modeled irises follow the gaze and are clipped by the same lids as the stipples', () => {
  assert.match(eyeVertex, /uniform vec2 gaze/);
  assert.match(eyeVertex, /eyeLids\(p\.xy/);
  assert.match(eyeVertex, /glint/);
  assert.match(lids, /mix\(upperOpen, lower/);
});

test('reduced motion holds the head, eyes, brows, and lids at rest', () => {
  const face = createFaceMotion(() => 0.3);
  for (let i = 0; i < 300; i++) {
    const pose = face.update(1 / 60, { speaking: i > 100, reducedMotion: true, level: 0.8, look: { x: 0.3, y: 0.1 } });
    assert.deepEqual(pose, REST_POSE);
  }
});

test('the eyes jump to a look target in saccades and then hold', () => {
  const face = createFaceMotion(() => 0.5);
  const xs = [];
  for (let i = 0; i < 120; i++) xs.push(face.update(1 / 60, { speaking: false, reducedMotion: false, look: { x: 0.25, y: 0.05 } }).gazeX);
  assert.ok(Math.abs(xs[20] - 0.25) < 0.03, `gaze settles quickly, got ${xs[20]}`);
  assert.ok(Math.abs(xs.at(-1) - 0.25) < 0.03);
  const far = face.update(1 / 60, { speaking: false, reducedMotion: false, look: { x: 2, y: -2 } });
  assert.ok(Math.abs(far.gazeX) <= 0.46 && Math.abs(far.gazeY) <= 0.31);
});

test('speech rhythm nods the head within a natural range', () => {
  const quiet = createFaceMotion(() => 0.5);
  const talking = createFaceMotion(() => 0.5);
  let quietPeak = 0, talkPeak = 0;
  for (let i = 0; i < 360; i++) {
    const syllable = Math.max(0, Math.sin(i * 0.9)) * 0.8;
    quietPeak = Math.max(quietPeak, Math.abs(quiet.update(1 / 60, { speaking: false, reducedMotion: false, level: 0 }).headPitch));
    const pose = talking.update(1 / 60, { speaking: true, reducedMotion: false, level: syllable });
    talkPeak = Math.max(talkPeak, Math.abs(pose.headPitch));
    assert.ok(Math.abs(pose.headYaw) <= 0.12 && Math.abs(pose.headRoll) <= 0.08 && pose.headPitch <= 0.12);
  }
  assert.ok(talkPeak > quietPeak * 1.5, `nods ${talkPeak} vs idle ${quietPeak}`);
});
