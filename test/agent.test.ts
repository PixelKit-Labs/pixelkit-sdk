import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  createCapabilityAdapter,
  createUnavailableCapabilityAdapter,
  runCloudAgent,
  type CapabilityTool,
} from '../packages/sdk/src/ai/tools/registry.ts';
import { createTraceContext } from '../packages/sdk/src/core/observability.ts';

const outputSchema = { type: 'OBJECT' as const, properties: { observed: { type: 'STRING' as const } }, required: ['observed'] };

function adapter(provider: string, observed: string) {
  const tool: CapabilityTool = {
    name: 'read_source', description: 'Read source', inputSchema: { type: 'OBJECT', properties: {} },
    outputSchema, effect: 'read', risk: 'low', availability: () => ({ available: true }),
    execute: () => ({ observed }),
  };
  return createCapabilityAdapter({ provider, tools: [tool] });
}

function mockClient(toolName = 'read_source') {
  let turn = 0;
  return {
    models: {
      generateContent: async () => {
        turn += 1;
        if (turn === 1) return {
          responseId: `provider-${toolName}`,
          functionCalls: [{ id: `call-${toolName}`, name: toolName, args: {} }],
          candidates: [{ content: { role: 'model', parts: [{ functionCall: { name: toolName, args: {} } }] } }],
        };
        return {
          responseId: `provider-final-${toolName}`,
          text: 'done', functionCalls: [],
          usageMetadata: { promptTokenCount: 4, candidatesTokenCount: 1 },
          candidates: [{ finishReason: 'STOP', content: { role: 'model', parts: [{ text: 'done' }] } }],
        };
      },
    },
  };
}

describe('cloud agent explicit runs', () => {
  test('empty adapter returns unavailable before contacting the provider', async () => {
    let calls = 0;
    const client = { models: { generateContent: async () => { calls += 1; return {}; } } };
    const context = createTraceContext({ traceId: 'trace-empty', runId: 'run-empty' });
    const result = await runCloudAgent(client as never, 'read', [], {
      capabilityAdapter: createUnavailableCapabilityAdapter(), context,
    });
    assert.equal(result.stoppedReason, 'unavailable');
    assert.equal(result.unavailableReason, 'capability_adapter_empty');
    assert.equal(result.text, '');
    assert.equal(calls, 0);
  });

  test('two concurrent runs use only their supplied adapter and trace context', async () => {
    const firstContext = createTraceContext({ traceId: 'trace-one', runId: 'run-one' });
    const secondContext = createTraceContext({ traceId: 'trace-two', runId: 'run-two' });
    const [first, second] = await Promise.all([
      runCloudAgent(mockClient() as never, 'read', [], { capabilityAdapter: adapter('one', 'one'), context: firstContext }),
      runCloudAgent(mockClient() as never, 'read', [], { capabilityAdapter: adapter('two', 'two'), context: secondContext }),
    ]);
    assert.equal((first.steps[0].result.result as { observed: string }).observed, 'one');
    assert.equal(first.steps[0].result.provider, 'one');
    assert.equal(first.steps[0].context.traceId, 'trace-one');
    assert.equal((second.steps[0].result.result as { observed: string }).observed, 'two');
    assert.equal(second.steps[0].result.provider, 'two');
    assert.equal(second.steps[0].context.traceId, 'trace-two');
  });

  test('returns provider ids and actual usage without replacing application ownership', async () => {
    const context = createTraceContext({ traceId: 'application-trace', runId: 'run' });
    const result = await runCloudAgent(mockClient() as never, 'read', [], {
      capabilityAdapter: adapter('device', 'value'), context,
    });
    assert.equal(result.context.traceId, 'application-trace');
    assert.equal(result.providerRequestId, 'provider-final-read_source');
    assert.deepEqual(result.usage, { promptTokenCount: 4, candidatesTokenCount: 1 });
    assert.equal(result.stoppedReason, 'completed');
  });
});
