import test from 'node:test';
import assert from 'node:assert/strict';
import { MOUTH_FIT, parseMouthFit, formatMouthFit, fitFromCorners, mouthCorners } from '../src/scripts/portrait-mouth.ts';
import { deform, pointVertex, aperture } from '../src/scripts/portrait-shaders.ts';

test('a mouth link round-trips and bad values keep the default', () => {
  const fit = parseMouthFit('0.05,0.02,0.18,-0.1,0.045,0.028,0.04');
  assert.equal(formatMouthFit(fit), '0.050,0.020,0.180,-0.100,0.045,0.028,0.040');
  assert.deepEqual(parseMouthFit(null), MOUTH_FIT);
  const partial = parseMouthFit('x,,9');
  assert.equal(partial.cx, MOUTH_FIT.cx);
  assert.equal(partial.cy, MOUTH_FIT.cy);
  assert.equal(partial.halfWidth, 0.3, 'out-of-range width clamps');
});

test('dragged corners define the lip line and swap safely', () => {
  const fit = fitFromCorners({ x: 0.22, y: 0 }, { x: -0.16, y: 0.038 }, MOUTH_FIT);
  assert.ok(Math.abs(fit.cx - 0.03) < 1e-3 && Math.abs(fit.halfWidth - 0.19) < 1e-3);
  assert.ok(Math.abs(fit.slope + 0.1) < 1e-3);
  const { left, right } = mouthCorners(fit);
  assert.ok(Math.abs(left.x + 0.16) < 1e-3 && Math.abs(right.y) < 1e-3);
});

test('lips, leveling, and the opening all use the same mouth frame', () => {
  assert.match(deform, /levelMouth\(p\)/);
  assert.match(pointVertex, /levelMouth\(position\)/);
  assert.match(aperture, /mouthScan\.z\*\.68/);
  assert.doesNotMatch(aperture, /\.19\*/);
});
