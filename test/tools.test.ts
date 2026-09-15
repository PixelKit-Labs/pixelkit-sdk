/**
 * @file tools.test.ts
 * @description Unit tests for the Unified Hardware Tool Registry and Gemini / ADK function calling.
 */

import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  defineTool,
  getTool,
  listTools,
  clearTools,
  toFunctionDeclarations,
  runTool,
  validateParameters,
  registerHardwareTools,
} from '../packages/sdk/src/ai/tools/registry.ts';

describe('Unified Tool Registry & Gemini Declarations', () => {
  beforeEach(() => {
    clearTools();
  });

  test('defineTool registers and getTool retrieves definition', () => {
    defineTool({
      name: 'test_action',
      description: 'A test action',
      parameters: {
        type: 'OBJECT',
        properties: {
          power: { type: 'NUMBER', description: 'Power in watts' },
        },
        required: ['power'],
      },
      execute: ({ power }: { power: number }) => ({ success: true, power }),
    });

    const retrieved = getTool('test_action');
    assert.ok(retrieved);
    assert.equal(retrieved.name, 'test_action');
    assert.equal(retrieved.description, 'A test action');
    assert.equal(listTools().length, 1);
  });

  test('validateParameters enforces required parameters and types', () => {
    const schema = {
      type: 'OBJECT' as const,
      properties: {
        name: { type: 'STRING' as const },
        count: { type: 'NUMBER' as const },
        active: { type: 'BOOLEAN' as const },
        mode: { type: 'STRING' as const, enum: ['fast', 'slow'] },
      },
      required: ['name', 'count'],
    };

    // Valid inputs
    const valid = validateParameters(schema, { name: 'Pixel', count: 11, active: true, mode: 'fast' });
    assert.equal(valid.success, true);

    // Missing required field
    const missing = validateParameters(schema, { count: 11 });
    assert.equal(missing.success, false);
    if (!missing.success) {
      assert.ok(missing.issues.some(i => i.includes('Missing required parameter: \'name\'')));
    }

    // Type mismatch
    const typeMismatch = validateParameters(schema, { name: 'Pixel', count: 'eleven' as any });
    assert.equal(typeMismatch.success, false);
    if (!typeMismatch.success) {
      assert.ok(typeMismatch.issues.some(i => i.includes('must be a number')));
    }

    // Invalid enum value
    const invalidEnum = validateParameters(schema, { name: 'Pixel', count: 11, mode: 'turbo' });
    assert.equal(invalidEnum.success, false);
    if (!invalidEnum.success) {
      assert.ok(invalidEnum.issues.some(i => i.includes('must be one of [fast, slow]')));
    }
  });

  test('toFunctionDeclarations converts schemas to Google Gen AI format', () => {
    defineTool({
      name: 'adjust_brightness',
      description: 'Sets screen brightness percentage',
      parameters: {
        type: 'OBJECT',
        properties: {
          level: { type: 'NUMBER', description: 'Brightness level from 0.0 to 1.0' },
          smooth: { type: 'BOOLEAN', description: 'Animate smoothly' },
        },
        required: ['level'],
      },
      execute: () => ({ ok: true }),
    });

    const declarations = toFunctionDeclarations();
    assert.equal(declarations.length, 1);
    const decl = declarations[0];
    assert.equal(decl.name, 'adjust_brightness');
    assert.equal(decl.description, 'Sets screen brightness percentage');
    assert.ok(decl.parameters);
    assert.deepEqual(decl.parameters.required, ['level']);
    assert.ok(decl.parameters.properties?.level);
    assert.ok(decl.parameters.properties?.smooth);
  });

  test('runTool validates, executes, and handles errors gracefully', async () => {
    defineTool({
      name: 'multiply',
      description: 'Multiplies two numbers',
      parameters: {
        type: 'OBJECT',
        properties: {
          a: { type: 'NUMBER' },
          b: { type: 'NUMBER' },
        },
        required: ['a', 'b'],
      },
      execute: ({ a, b }: { a: number; b: number }) => {
        if (a < 0) throw new Error('Negative numbers rejected');
        return a * b;
      },
    });

    // Success call
    const success = await runTool('multiply', { a: 6, b: 7 });
    assert.equal(success.ok, true);
    assert.equal(success.result, 42);

    // Validation failure (missing b)
    const invalid = await runTool('multiply', { a: 6 });
    assert.equal(invalid.ok, false);
    assert.equal(invalid.error, 'invalid_arguments');

    // Execution error
    const failed = await runTool('multiply', { a: -5, b: 2 });
    assert.equal(failed.ok, false);
    assert.equal(failed.error, 'Negative numbers rejected');

    // Unknown tool
    const unknown = await runTool('nonexistent_tool', {});
    assert.equal(unknown.ok, false);
    assert.ok(unknown.error?.includes('unknown_tool'));
  });

  test('registerHardwareTools binds real hardware handlers and zero-simulation fallbacks', async () => {
    let torchState = false;
    let hapticFired: string | null = null;

    registerHardwareTools({
      torch: {
        isTorchOn: torchState,
        isStrobing: false,
        toggleTorch: async () => {
          torchState = !torchState;
        },
        startStrobe: async () => {},
        stopStrobe: async () => {},
      },
      haptics: {
        triggerHaptic: async pattern => {
          hapticFired = pattern;
        },
      },
      altimeter: {
        altitudeM: 1042.5,
        pressureHpa: 895.2,
        verticalVelocityMps: 1.2,
        trend: 'rising',
        calibrateSeaLevel: () => {},
      },
      // Thermometer omitted to test zero-simulation fallback
      thermometer: undefined,
    });

    // Test torch execution
    const torchRes = await runTool('set_torch', { on: true });
    assert.equal(torchRes.ok, true);
    assert.equal(torchState, true);

    // Test haptic execution
    const hapticRes = await runTool('play_haptic', { pattern: 'success' });
    assert.equal(hapticRes.ok, true);
    assert.equal(hapticFired, 'success');

    // Test barometer read
    const baroRes = await runTool('get_barometer', {});
    assert.equal(baroRes.ok, true);
    assert.deepEqual(baroRes.result, {
      altitudeM: 1042.5,
      pressureHpa: 895.2,
      verticalVelocityMps: 1.2,
      trend: 'rising',
    });

    // Test zero-simulation: unprovided hardware reports error, never fakes temperature
    const thermoRes = await runTool('get_thermometer', {});
    assert.equal(thermoRes.ok, true);
    assert.deepEqual(thermoRes.result, {
      isSupported: false,
      error: 'fir_thermometer_unsupported',
    });
  });
});
