import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  createHardwareCapabilityAdapter,
  runTool,
  type HardwareContext,
} from '../packages/sdk/src/ai/tools/registry.ts';
import { createTraceContext } from '../packages/sdk/src/core/observability.ts';

const approve = () => ({ outcome: 'approved' as const });

function run(hardware: HardwareContext, name: string, args: unknown) {
  const adapter = createHardwareCapabilityAdapter(hardware, approve);
  return runTool(adapter, name, args, { context: createTraceContext({ runId: 'adapter' }), toolCallId: name });
}

describe('hardware capability adapter reports what the hook returned', () => {
  test('set_torch reports failure instead of the requested state', async () => {
    const result = await run({
      torch: { isStrobing: false, setTorch: async () => false, startStrobe: () => {}, stopStrobe: () => {} },
    }, 'set_torch', { on: true });
    assert.equal(result.ok, false);
    assert.equal(result.status, 'error');
    assert.equal(result.error, 'torch_set_failed');
  });

  test('set_torch returns the requested state only after setTorch succeeded', async () => {
    const result = await run({
      torch: { isStrobing: false, setTorch: async () => true, startStrobe: () => {}, stopStrobe: () => {} },
    }, 'set_torch', { on: true });
    assert.equal(result.ok, true);
    assert.deepEqual(result.result, { on: true, strobe: false });
  });

  test('set_torch strobe reports on as null because individual toggles are not observed', async () => {
    let started = false;
    const result = await run({
      torch: { isStrobing: false, setTorch: async () => true, startStrobe: () => { started = true; }, stopStrobe: () => {} },
    }, 'set_torch', { on: true, strobe: true });
    assert.equal(started, true);
    assert.deepEqual(result.result, { on: null, strobe: true });
  });

  test('play_haptic fails when the hook reports it did not play', async () => {
    const result = await run({ haptics: { triggerHaptic: async () => false } }, 'play_haptic', { pattern: 'light' });
    assert.equal(result.ok, false);
    assert.equal(result.error, 'haptic_not_played');
  });

  test('set_hilight fails when the daemon rejected the command', async () => {
    const result = await run({
      hilight: { mode: 'off', currentColor: '#00E5FF', setMode: async () => false },
    }, 'set_hilight', { mode: 'glow', color: '#FF0000' });
    assert.equal(result.ok, false);
    assert.equal(result.error, 'hilight_command_rejected');
  });

  test('set_hilight rejects a mode outside the enum before calling the hook', async () => {
    let called = false;
    const result = await run({
      hilight: { mode: 'off', currentColor: '#00E5FF', setMode: async () => { called = true; return true; } },
    }, 'set_hilight', { mode: 'disco' });
    assert.equal(called, false);
    assert.equal(result.status, 'invalid');
  });

  test('set_battery_share reports the write result and the re-read state, not the requested one', async () => {
    const result = await run({
      batteryShare: {
        isSupported: true,
        isActive: false,
        transmittedWatts: null,
        setBatteryShare: async () => true,
        refresh: () => ({ isActive: false }),
      },
    }, 'set_battery_share', { enabled: true });
    assert.equal(result.ok, true);
    assert.deepEqual(result.result, { isSupported: true, written: true, isActive: false });
  });

  test('set_battery_share fails when the node write was rejected', async () => {
    const result = await run({
      batteryShare: {
        isSupported: true,
        isActive: false,
        transmittedWatts: null,
        setBatteryShare: async () => false,
      },
    }, 'set_battery_share', { enabled: true });
    assert.equal(result.ok, false);
    assert.equal(result.error, 'battery_share_write_rejected');
  });

  test('set_battery_share leaves isActive null when no re-read is available', async () => {
    const result = await run({
      batteryShare: { isSupported: true, isActive: false, transmittedWatts: null, setBatteryShare: async () => true },
    }, 'set_battery_share', { enabled: true });
    assert.deepEqual(result.result, { isSupported: true, written: true, isActive: null });
  });

  test('get_battery_health passes nulls through and includes chargeLimitAvailable', async () => {
    const result = await run({
      charging: { stateOfHealthPercent: null, cycleCount: 112, chargingTier: null, chargingWattage: null, chargeLimitAvailable: null },
    }, 'get_battery_health', {});
    assert.equal(result.ok, true);
    assert.deepEqual(result.result, {
      stateOfHealthPercent: null, cycleCount: 112, chargingTier: null, chargingWattage: null, chargeLimitAvailable: null,
    });
  });
});
