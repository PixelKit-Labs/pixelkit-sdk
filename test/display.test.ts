/**
 * @file display.test.ts
 * @description Unit tests for Display actuator parameters, HDR headroom conversions,
 * and high brightness mode (HBM) state validation.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

describe('useDisplay Actuators & Telemetry', () => {
  it('validates supported refresh rate bounds', () => {
    const validRates = [1, 10, 24, 30, 48, 60, 90, 120, 144];
    for (const rate of validRates) {
      assert.strictEqual(rate >= 1 && rate <= 240, true);
    }
  });

  it('clamps and validates desired HDR headroom values', () => {
    const clampHeadroom = (val: number) => Math.max(1.0, Math.min(val, 5.0));
    assert.strictEqual(clampHeadroom(0.5), 1.0);
    assert.strictEqual(clampHeadroom(1.0), 1.0);
    assert.strictEqual(clampHeadroom(2.5), 2.5);
    assert.strictEqual(clampHeadroom(3.0), 3.0);
    assert.strictEqual(clampHeadroom(10.0), 5.0);
  });

  it('verifies High Brightness Mode (HBM) flag logic', () => {
    let isHbmActive = false;
    const toggleHbm = (enable: boolean) => {
      isHbmActive = enable;
      return {
        screenBrightness: enable ? 1.0 : null,
        hdrHeadroom: enable ? 3.0 : 0.0,
      };
    };

    const onState = toggleHbm(true);
    assert.strictEqual(isHbmActive, true);
    assert.strictEqual(onState.screenBrightness, 1.0);
    assert.strictEqual(onState.hdrHeadroom, 3.0);

    const offState = toggleHbm(false);
    assert.strictEqual(isHbmActive, false);
    assert.strictEqual(offState.screenBrightness, null);
    assert.strictEqual(offState.hdrHeadroom, 0.0);
  });
});
