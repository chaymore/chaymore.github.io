import test from 'node:test';
import assert from 'node:assert/strict';
import { blinkAmount, createFaceMotion } from '../src/scripts/portrait-face.ts';
import { deform, pointVertex } from '../src/scripts/portrait-shaders.ts';

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
  assert.match(pointVertex, /blinkIris/);
  assert.match(pointVertex, /return express\(p\)/);
  assert.doesNotMatch(deform, /getUserMedia/);
});
