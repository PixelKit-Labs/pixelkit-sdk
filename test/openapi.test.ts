/**
 * @file openapi.test.ts
 * @description Unit tests for PixelKit OpenAPI 3.1.0 specification generation and Zero-Simulation contracts.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const { buildOpenApiSpec, toYaml } = require('../scripts/export-openapi.js');

describe('PixelKit OpenAPI 3.1 Specification', () => {
  const hooksDir = path.resolve(__dirname, '..', '.pixelkit-docs', 'data', 'hooks');
  const spec = buildOpenApiSpec(hooksDir);

  it('declares OpenAPI 3.1.0 version and info metadata', () => {
    assert.equal(spec.openapi, '3.1.0');
    assert.equal(spec.info.title, 'PixelKit SDK API');
    assert.ok(spec.info.version, 'version must be present');
    assert.ok(spec.info.description.includes('Zero-Simulation Principle'));
  });

  it('contains the 6 canonical category tags', () => {
    const expectedTags = [
      'silicon-compute',
      'neural-ai',
      'sensors-actuators',
      'radios-security',
      'system-media',
      'pro-exclusives',
    ];
    const tagNames = spec.tags.map((t: any) => t.name);
    for (const expected of expectedTags) {
      assert.ok(tagNames.includes(expected), `Missing tag ${expected}`);
    }
  });

  it('exposes /state and /hooks endpoints', () => {
    assert.ok(spec.paths['/state'], 'Missing /state endpoint');
    assert.ok(spec.paths['/state'].get, 'Missing GET /state');
    assert.ok(spec.paths['/hooks'], 'Missing /hooks endpoint');
    assert.ok(spec.paths['/hooks'].get, 'Missing GET /hooks');
  });

  it('includes all 51 hooks as GET endpoints under /hooks/{hookName}', () => {
    const hookFiles = fs.readdirSync(hooksDir).filter((f) => f.endsWith('.json'));
    assert.equal(hookFiles.length, 51, 'Expected 51 hook contract files');

    for (const file of hookFiles) {
      const hook = JSON.parse(fs.readFileSync(path.join(hooksDir, file), 'utf8'));
      const hookPath = `/hooks/${hook.name}`;
      assert.ok(spec.paths[hookPath], `Missing endpoint for hook ${hook.name}`);
      assert.ok(spec.paths[hookPath].get, `Missing GET operation for hook ${hook.name}`);

      const schemaRef = `#/components/schemas/${hook.name}Telemetry`;
      assert.equal(
        spec.paths[hookPath].get.responses['200'].content['application/json'].schema.$ref,
        schemaRef,
        `Hook ${hook.name} response schema does not match ${schemaRef}`
      );
    }
  });

  it('generates POST action endpoints for hooks with actuators', () => {
    // e.g. useTorch -> setTorch
    assert.ok(spec.paths['/hooks/useTorch/actions/setTorch'], 'Missing /hooks/useTorch/actions/setTorch');
    assert.ok(spec.paths['/hooks/useTorch/actions/setTorch'].post, 'Missing POST on setTorch');

    // useThermometer -> setEmissivity
    assert.ok(spec.paths['/hooks/useThermometer/actions/setEmissivity'], 'Missing /hooks/useThermometer/actions/setEmissivity');

    // useBatteryShare -> setBatteryShare
    assert.ok(spec.paths['/hooks/useBatteryShare/actions/setBatteryShare'], 'Missing /hooks/useBatteryShare/actions/setBatteryShare');

    // useHaptics -> selection, light, medium, heavy, playEnvelope
    assert.ok(spec.paths['/hooks/useHaptics/actions/selection'], 'Missing /hooks/useHaptics/actions/selection');
    assert.ok(spec.paths['/hooks/useHaptics/actions/light'], 'Missing /hooks/useHaptics/actions/light');
    assert.ok(spec.paths['/hooks/useHaptics/actions/playEnvelope'], 'Missing /hooks/useHaptics/actions/playEnvelope');
  });

  it('enforces Zero-Simulation Principle on TelemetrySource enum', () => {
    const sourceSchema = spec.components.schemas.TelemetrySource;
    assert.ok(sourceSchema, 'TelemetrySource schema must exist');
    assert.deepEqual(sourceSchema.enum, ['hardware', 'derived', 'unavailable']);
    assert.ok(!sourceSchema.enum.includes('simulated'), 'Simulated values are unrepresentable');
  });

  it('resolves all internal schema references without dangling pointers', () => {
    const schemaKeys = new Set(Object.keys(spec.components.schemas));
    const jsonStr = JSON.stringify(spec);
    const refRegex = /"#\/components\/schemas\/([a-zA-Z0-9_]+)"/g;
    let match;
    const missing = new Set<string>();

    while ((match = refRegex.exec(jsonStr)) !== null) {
      const refName = match[1];
      if (!schemaKeys.has(refName)) {
        missing.add(refName);
      }
    }

    assert.equal(
      missing.size,
      0,
      `Dangling schema references found: ${Array.from(missing).join(', ')}`
    );
  });

  it('serializes cleanly to YAML without undefined tokens', () => {
    const yaml = toYaml(spec);
    assert.ok(yaml.length > 1000, 'YAML string must not be empty');
    assert.ok(!yaml.includes('undefined'), 'YAML must not contain literal undefined');
    assert.ok(yaml.includes('openapi: 3.1.0'), 'YAML must include openapi version');
  });
});
