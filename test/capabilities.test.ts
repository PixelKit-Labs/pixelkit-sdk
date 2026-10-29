/**
 * @file capabilities.test.ts
 * @description Behavioural tests for `resolveCapabilities` and `verifyCapabilities`.
 *
 * Everything else in this repository is checked statically: the type checker proves the code is
 * well-formed, the parity check proves every exported hook has somewhere to try it, and the
 * documentation contract proves every documented field exists on its type. None of those execute a
 * line of logic, so none would notice a wrong answer.
 *
 * `capabilities.ts` is where that gap costs most. It is hand-maintained hardware knowledge — which
 * Pixel generation gained UWB, which gained the HiLight array, which Gemini Nano tier AICore serves
 * — derived from research rather than from anything the compiler can check. It is what decides
 * `unsupported` rather than a reading, so a wrong answer here reads as absent hardware. Change
 * `generation >= 11` to `>= 12` and every static check still passes while `useHiLight` goes dark on
 * every Pixel 11 Pro.
 *
 * These are pure functions, so this needs no device, no emulator, no React and no mocks. Run with
 * `npm test` — Node's own test runner, executing TypeScript directly, so it adds no dependency.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { capabilityProvenance, resolveCapabilities, verifyCapabilities } from '../packages/sdk/src/core/capabilities.ts';

/** Android 17 on a current device; the API-level gates gate on 36 and 37. */
const API_37 = 37;

describe('resolveCapabilities: Pixel generations', () => {
  test('Pixel 11 Pro has the full Pro feature set', () => {
    const c = resolveCapabilities('Pixel 11 Pro', API_37, true);
    assert.equal(c.isPixel, true);
    assert.equal(c.pixelGeneration, 11);
    assert.equal(c.isProModel, true);
    assert.equal(c.hasHiLight, true, 'the camera-bar LED array is the 11 Pro headline feature');
    assert.equal(c.hasUWB, true);
    assert.equal(c.hasTitanM3, true);
    assert.equal(c.geminiNanoTier, 'nano-v4');
  });

  test('Pixel 11 without Pro has no HiLight and no UWB', () => {
    const c = resolveCapabilities('Pixel 11', API_37, true);
    assert.equal(c.pixelGeneration, 11);
    assert.equal(c.isProModel, false);
    assert.equal(c.hasHiLight, false, 'HiLight is Pro and Fold only, not every 11');
    assert.equal(c.hasUWB, false, 'UWB is Pro and Fold only');
    assert.equal(c.geminiNanoTier, 'nano-v4', 'the Nano tier follows the generation, not the trim');
  });

  test('Pixel 11 Pro Fold counts as foldable and keeps both Pro features', () => {
    const c = resolveCapabilities('Pixel 11 Pro Fold', API_37, true);
    assert.equal(c.isFoldable, true);
    assert.equal(c.hasHiLight, true);
    assert.equal(c.hasUWB, true);
  });

  test('Pixel 9 Pro is a generation below HiLight but still has UWB', () => {
    const c = resolveCapabilities('Pixel 9 Pro', API_37, true);
    assert.equal(c.hasHiLight, false, 'the LED array arrived with the 11 Pro');
    assert.equal(c.hasUWB, true);
    assert.equal(c.hasTitanM3, false);
    assert.equal(c.geminiNanoTier, 'nano-v3');
  });

  test('Pixel 8 serves the oldest supported Nano tier', () => {
    assert.equal(resolveCapabilities('Pixel 8', API_37, true).geminiNanoTier, 'nano-v2');
  });

  test('Pixel 6 Pro has UWB but predates Gemini Nano', () => {
    const c = resolveCapabilities('Pixel 6 Pro', API_37, true);
    assert.equal(c.hasUWB, true, 'UWB goes back to the 6 Pro');
    assert.equal(c.geminiNanoTier, 'none', 'Nano starts at the 8');
  });

  test('an "a" model is the generation without the Pro hardware', () => {
    const c = resolveCapabilities('Pixel 9a', API_37, true);
    assert.equal(c.pixelGeneration, 9);
    assert.equal(c.isProModel, false);
    assert.equal(c.hasUWB, false, 'the a series has no UWB');
  });
});

describe('resolveCapabilities: not a Pixel', () => {
  test('another Android phone reports no Pixel hardware rather than guessing', () => {
    const c = resolveCapabilities('SM-S928B', API_37, true);
    assert.equal(c.isPixel, false);
    assert.equal(c.pixelGeneration, null);
    assert.equal(c.hasHiLight, false);
    assert.equal(c.hasUWB, false);
    assert.equal(c.hasTitanM3, false);
    assert.equal(c.geminiNanoTier, 'none');
  });

  test('a missing model name does not throw and does not claim a device', () => {
    for (const value of [null, undefined, '', '   ']) {
      const c = resolveCapabilities(value, API_37, true);
      assert.equal(c.isPixel, false, `model ${JSON.stringify(value)} should not read as a Pixel`);
      assert.equal(c.modelName, 'Unknown device');
    }
  });
});

describe('resolveCapabilities: Android API gates', () => {
  test('API 36 opens ranging, haptic envelopes and AppFunctions', () => {
    const c = resolveCapabilities('Pixel 11 Pro', 36, true);
    assert.equal(c.supportsRangingApi, true);
    assert.equal(c.supportsHapticEnvelopes, true);
    assert.equal(c.supportsAppFunctions, true);
    assert.equal(c.supportsAndroid17Apis, false, '17 needs 37, not 36');
  });

  test('API 35 opens none of them', () => {
    const c = resolveCapabilities('Pixel 11 Pro', 35, true);
    assert.equal(c.supportsRangingApi, false);
    assert.equal(c.supportsHapticEnvelopes, false);
    assert.equal(c.supportsAppFunctions, false);
  });

  test('an unknown API level closes every gate rather than assuming support', () => {
    const c = resolveCapabilities('Pixel 11 Pro', null, true);
    assert.equal(c.androidApiLevel, null);
    assert.equal(c.supportsRangingApi, false);
    assert.equal(c.supportsHapticEnvelopes, false);
    assert.equal(c.supportsAppFunctions, false);
    assert.equal(c.supportsAndroid17Apis, false);
  });
});

describe('resolveCapabilities: provenance of the answer', () => {
  test('says the answer came from the model table, and leaves probe-only fields null', () => {
    const c = resolveCapabilities('Pixel 11 Pro', API_37, true);
    assert.equal(c.verification, 'model-table');
    // These cannot be known from a model name. Reporting null rather than a guess is the same
    // discipline the hooks apply to a reading they cannot take.
    assert.equal(c.hasNFC, null);
    assert.equal(c.hasStrongBox, null);
    assert.equal(c.hasWifiRtt, null);
    assert.equal(c.hasBleChannelSounding, null);
  });
});

describe('verifyCapabilities: the device overrides the table', () => {
  /** A probe that answers from a fixed map and reports AICore as installed. */
  const probe = (features: Record<string, boolean>) => ({
    hasSystemFeature: (name: string) => features[name] ?? false,
    getPackageVersion: () => ({ installed: true, versionName: '1.2.3' }),
  });

  test('a real probe replaces the inferred answer and marks it verified', () => {
    const base = resolveCapabilities('Pixel 11 Pro', API_37, true);
    const c = verifyCapabilities(base, probe({ 'android.hardware.nfc': true, 'android.hardware.uwb': true }));
    assert.equal(c.verification, 'device', 'the answer is now measured, not inferred');
    assert.equal(c.hasNFC, true);
    assert.equal(c.hasUWB, true);
    assert.equal(c.aicoreVersion, '1.2.3');
  });

  test('a device that lacks a feature overrides the table saying it has one', () => {
    const base = resolveCapabilities('Pixel 11 Pro', API_37, true);
    assert.equal(base.hasUWB, true, 'the table expects UWB on an 11 Pro');
    const c = verifyCapabilities(base, probe({ 'android.hardware.uwb': false }));
    assert.equal(c.hasUWB, false, 'the device is the authority when it answers');
  });

  test('a probe that throws degrades to null instead of crashing the hook', () => {
    const base = resolveCapabilities('Pixel 11 Pro', API_37, true);
    const c = verifyCapabilities(base, {
      hasSystemFeature: () => {
        throw new Error('binder transaction failed');
      },
      getPackageVersion: () => {
        throw new Error('package manager unavailable');
      },
    });
    assert.equal(c.hasNFC, null, 'unknown, not false: the probe failed rather than answered');
    assert.equal(c.hasStrongBox, null);
    assert.equal(c.aicoreVersion, null);
    // hasUWB is the one probe result with a table fallback, so a failed probe keeps the inference.
    assert.equal(c.hasUWB, true);
  });
});

describe('capabilityProvenance', () => {
  test('model-table values are derived and unprobed flags are unavailable before device verification', () => {
    const p = capabilityProvenance(resolveCapabilities('Pixel 11 Pro', API_37, true));
    assert.equal(p.hasHiLight, 'derived');
    assert.equal(p.hasTitanM3, 'derived');
    assert.equal(p.geminiNanoTier, 'derived');
    assert.equal(p.hasUWB, 'derived');
    assert.equal(p.hasNFC, 'unavailable');
    assert.equal(p.androidApiLevel, 'hardware');
  });

  test('after device verification probed flags are hardware while table-only fields stay derived', () => {
    const base = resolveCapabilities('Pixel 11 Pro', API_37, true);
    const c = verifyCapabilities(base, {
      hasSystemFeature: () => true,
      getPackageVersion: () => ({ installed: true, versionName: '1.2.3' }),
    });
    const p = capabilityProvenance(c);
    assert.equal(p.hasNFC, 'hardware');
    assert.equal(p.hasStrongBox, 'hardware');
    assert.equal(p.hasUWB, 'hardware');
    assert.equal(p.hasHiLight, 'derived');
    assert.equal(p.hasTitanM3, 'derived');
  });

  test('a probe that failed is unavailable, not hardware', () => {
    const base = resolveCapabilities('Pixel 11 Pro', API_37, true);
    const c = verifyCapabilities(base, {
      hasSystemFeature: () => {
        throw new Error('binder transaction failed');
      },
      getPackageVersion: () => {
        throw new Error('package manager unavailable');
      },
    });
    const p = capabilityProvenance(c);
    assert.equal(p.hasNFC, 'unavailable');
    assert.equal(p.hasStrongBox, 'unavailable');
  });
});
