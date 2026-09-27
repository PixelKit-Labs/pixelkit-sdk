import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  createCapabilityAdapter,
  createHardwareCapabilityAdapter,
  createUnavailableCapabilityAdapter,
  runTool,
  toFunctionDeclarations,
  validateParameters,
  type CapabilityTool,
} from '../packages/sdk/src/ai/tools/registry.ts';
import { createTraceContext, type ObservabilitySink, type TelemetryEvent } from '../packages/sdk/src/core/observability.ts';

const outputSchema = { type: 'OBJECT' as const, properties: { changed: { type: 'BOOLEAN' as const } }, required: ['changed'] };
const inputSchema = {
  type: 'OBJECT' as const,
  properties: { value: { type: 'NUMBER' as const } },
  required: ['value'],
};

function readTool(name: string, result: unknown): CapabilityTool {
  return {
    name,
    description: `Read ${name}`,
    inputSchema,
    outputSchema: typeof result === 'string'
      ? { type: 'STRING' }
      : { type: 'OBJECT', properties: { measured: { type: 'NUMBER' } }, required: ['measured'] },
    effect: 'read',
    risk: 'low',
    availability: () => ({ available: true }),
    execute: () => result,
  };
}

describe('explicit capability adapters', () => {
  test('adapter snapshots are immutable and isolated per run', async () => {
    const first = createCapabilityAdapter({ provider: 'first', tools: [readTool('read_value', 'one')] });
    const second = createCapabilityAdapter({ provider: 'second', tools: [readTool('read_value', 'two')] });
    const context = createTraceContext({ runId: 'run' });
    const [one, two] = await Promise.all([
      runTool(first, 'read_value', { value: 1 }, { context, toolCallId: 'call-1' }),
      runTool(second, 'read_value', { value: 1 }, { context, toolCallId: 'call-2' }),
    ]);
    assert.equal(one.result, 'one');
    assert.equal(one.provider, 'first');
    assert.equal(two.result, 'two');
    assert.equal(two.provider, 'second');
    assert.notEqual(one.context.spanId, two.context.spanId);
    assert.equal(Object.isFrozen(first.tools), true);
  });

  test('empty and missing capabilities return typed unavailable results', async () => {
    const result = await runTool(
      createUnavailableCapabilityAdapter('none'),
      'read_sensor',
      {},
      { context: createTraceContext({ runId: 'empty' }), toolCallId: 'call-empty' },
    );
    assert.deepEqual({ ok: result.ok, status: result.status, policy: result.policyOutcome }, {
      ok: false, status: 'unavailable', policy: 'unavailable',
    });
    assert.equal(result.result, undefined);
  });

  test('effect execution always traverses the application policy gateway', async () => {
    let executions = 0;
    const effect: CapabilityTool = {
      name: 'set_state', description: 'Set state', inputSchema, outputSchema,
      effect: 'effect', risk: 'high', availability: () => ({ available: true }),
      execute: () => { executions += 1; return { changed: true }; },
    };
    const withoutPolicy = createCapabilityAdapter({ provider: 'device', tools: [effect] });
    const denied = createCapabilityAdapter({
      provider: 'device', tools: [effect], authorizeEffect: () => ({ outcome: 'denied', reason: 'confirmation_required' }),
    });
    const approved = createCapabilityAdapter({
      provider: 'device', tools: [effect], authorizeEffect: proposal => {
        assert.equal(proposal.toolCallId, 'approved-call');
        return { outcome: 'approved' };
      },
    });
    const context = createTraceContext({ runId: 'effect' });
    assert.equal((await runTool(withoutPolicy, 'set_state', { value: 1 }, { context, toolCallId: 'no-policy' })).status, 'unavailable');
    assert.equal((await runTool(denied, 'set_state', { value: 1 }, { context, toolCallId: 'denied-call' })).status, 'denied');
    const result = await runTool(approved, 'set_state', { value: 1 }, { context, toolCallId: 'approved-call' });
    assert.equal(result.status, 'success');
    assert.equal(result.policyOutcome, 'approved');
    assert.equal(executions, 1);
  });

  test('rejects executor output that violates the declared output schema', async () => {
    const adapter = createCapabilityAdapter({
      provider: 'broken',
      tools: [{
        name: 'broken_read',
        description: 'Return the wrong output shape',
        inputSchema: { type: 'OBJECT', properties: {} },
        outputSchema: { type: 'OBJECT', properties: { measured: { type: 'NUMBER' } }, required: ['measured'] },
        effect: 'read',
        risk: 'low',
        availability: () => ({ available: true }),
        execute: () => ({ measured: 'not-a-number' }),
      }],
    });
    const result = await runTool(adapter, 'broken_read', {}, {
      context: createTraceContext({ runId: 'invalid-output' }),
      toolCallId: 'invalid-output-call',
    });
    assert.equal(result.ok, false);
    assert.equal(result.error, 'invalid_tool_result');
  });

  test('tool proposal/result traces expose ids and policy without raw arguments', async () => {
    const events: Readonly<TelemetryEvent>[] = [];
    const sink: ObservabilitySink = {
      event: event => { events.push(event); }, metric: () => undefined, span: () => undefined,
    };
    const adapter = createCapabilityAdapter({
      provider: 'sensor', tools: [readTool('read_value', { measured: 7 })],
    });
    await runTool(adapter, 'read_value', { value: 9 }, {
      context: createTraceContext({ runId: 'trace' }), toolCallId: 'stable-call', sink,
    });
    const proposal = events.find(event => event.event === 'tool_proposed');
    const result = events.find(event => event.event === 'tool_result');
    assert.equal(proposal?.data?.toolCallId, 'stable-call');
    assert.equal(proposal?.data?.capabilityProvider, 'sensor');
    assert.equal(proposal?.data?.policyOutcome, 'not_required');
    assert.equal(result?.data?.status, 'success');
    assert.equal(proposal?.data?.arguments, undefined);
  });
});

describe('schemas and hardware availability', () => {
  test('parameter validation and declarations remain strict', () => {
    assert.equal(validateParameters(inputSchema, { value: 1 }).success, true);
    assert.equal(validateParameters(inputSchema, {}).success, false);
    assert.equal(validateParameters(inputSchema, { value: 1, extra: true }).success, false);
    const declarations = toFunctionDeclarations([readTool('read_value', 1)]);
    assert.equal(declarations[0].name, 'read_value');
    assert.deepEqual(declarations[0].parameters?.required, ['value']);
  });

  test('unavailable hardware never fabricates a successful observation', async () => {
    const adapter = createHardwareCapabilityAdapter({});
    const result = await runTool(adapter, 'get_thermometer', {}, {
      context: createTraceContext({ runId: 'hardware' }), toolCallId: 'thermometer',
    });
    assert.equal(result.status, 'unavailable');
    assert.equal(result.result, undefined);
    assert.equal(result.error, 'fir_thermometer_unsupported');
  });
});
