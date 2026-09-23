import test from 'node:test';
import assert from 'node:assert/strict';
import { portraitTurn } from '../src/scripts/portrait-turn.ts';

const base = { attention: false, playing: true, dragging: false, speaking: false, warmedUp: true };

test('Ask Caleb holds the bust on a front view and blocks idle orbit', () => {
  assert.equal(portraitTurn({ ...base, attention: true }), 'front');
  assert.equal(portraitTurn({ ...base, attention: true, dragging: true, speaking: true, playing: true }), 'front');
  assert.equal(portraitTurn(base), 'idle');
});

test('drag, speech, and reduced motion keep their existing turns', () => {
  assert.equal(portraitTurn({ ...base, dragging: true }), 'still');
  assert.equal(portraitTurn({ ...base, speaking: true }), 'face');
  assert.equal(portraitTurn({ ...base, playing: false }), 'still');
  assert.equal(portraitTurn({ ...base, warmedUp: false }), 'still');
});
