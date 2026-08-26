import test from 'node:test';
import assert from 'node:assert/strict';
import { getEffectiveAnimationDuration, getLandingSettleDelay, getSowPath, getSowStepDelay, LANDING_SETTLE_MS, MAX_SOW_ANIMATION_MS, MIN_SOW_TRAVEL_MS, SOW_STEP_MS } from '../js/ui/move-animation.js';

test('visual sow path follows engine order and skips the opponent store', () => {
  assert.deepEqual(getSowPath(0, 6, 1), [1, 2, 3, 4, 5, 6]);
  assert.deepEqual(getSowPath(12, 2, 1), [0, 1]);
  assert.deepEqual(getSowPath(5, 2, 2), [7, 8]);
  assert.equal(SOW_STEP_MS, 220);
  assert.equal(LANDING_SETTLE_MS, 80);
  assert.equal(getSowStepDelay(6), SOW_STEP_MS);
  assert.equal(getLandingSettleDelay(6), LANDING_SETTLE_MS);
  assert.equal(getSowStepDelay(9), 190);
  assert.equal(getSowStepDelay(13), 160);
  assert.ok((getSowStepDelay(19) + getLandingSettleDelay(19)) * 19 <= MAX_SOW_ANIMATION_MS);
  assert.ok((getSowStepDelay(30) + getLandingSettleDelay(30)) * 30 <= MAX_SOW_ANIMATION_MS);
  assert.ok((getSowStepDelay(72) + getLandingSettleDelay(72)) * 72 <= MAX_SOW_ANIMATION_MS);
});

test('animation speed converts to duration and protects critical travel visibility', () => {
  assert.equal(getEffectiveAnimationDuration(SOW_STEP_MS, 1, MIN_SOW_TRAVEL_MS), 220);
  assert.equal(getEffectiveAnimationDuration(SOW_STEP_MS, .5, MIN_SOW_TRAVEL_MS), 440);
  assert.equal(getEffectiveAnimationDuration(SOW_STEP_MS, 2, MIN_SOW_TRAVEL_MS), 110);
  assert.equal(getEffectiveAnimationDuration(130, 2, MIN_SOW_TRAVEL_MS), MIN_SOW_TRAVEL_MS);
  assert.equal(getEffectiveAnimationDuration(100, .25), 400);
});
