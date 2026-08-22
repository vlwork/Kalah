import test from 'node:test';
import assert from 'node:assert/strict';
import { getSowPath, getSowStepDelay, MAX_SOW_ANIMATION_MS, SOW_STEP_MS } from '../js/ui/move-animation.js';

test('visual sow path follows engine order and skips the opponent store', () => {
  assert.deepEqual(getSowPath(0, 6, 1), [1, 2, 3, 4, 5, 6]);
  assert.deepEqual(getSowPath(12, 2, 1), [0, 1]);
  assert.deepEqual(getSowPath(5, 2, 2), [7, 8]);
  assert.ok(SOW_STEP_MS >= 120);
  assert.equal(getSowStepDelay(6), SOW_STEP_MS);
  assert.ok(getSowStepDelay(30) * 30 <= MAX_SOW_ANIMATION_MS);
});
