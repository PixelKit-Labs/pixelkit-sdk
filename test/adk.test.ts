import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { Type } from '@google/genai';
import {
  createADKAgent,
  createADKTool,
  runDiagnosticTeam,
} from '../packages/sdk/src/ai/adk/index.ts';
import { createCapabilityAdapter, createUnavailableCapabilityAdapter } from '../packages/sdk/src/ai/tools/registry.ts';
import { createTraceContext } from '../packages/sdk/src/core/observability.ts';

function readTemperatureTool() {
  return createADKTool({
    name: 'read_temp',
    description: 'Read temperature',
    parameters: { type: Type.OBJECT, properties: {} },
    outputSchema: {
      type: 'OBJECT',
      properties: { surfaceC: { type: 'NUMBER' }, traceId: { type: 'STRING' } },
      required: ['surfaceC', 'traceId'],
    },
    effect: 'read',
    risk: 'low',
    availability: () => ({ available: true }),
    execute: (_args, execution) => ({ surfaceC: 34.2, traceId: execution.trace.traceId }),
  });
}

function twoTurnClient() {
  let turn = 0;
  return {
    models: {
      generateContent: async () => {
        turn += 1;
        if (turn === 1) return {
          responseId: 'provider-tool',
          functionCalls: [{ id: 'tool-call', name: 'read_temp', args: {} }],
          candidates: [{ content: { role: 'model', parts: [] } }],
        };
        return {
          responseId: 'provider-final', text: 'temperature observed', functionCalls: [],
          candidates: [{ finishReason: 'STOP', content: { role: 'model', parts: [{ text: 'temperature observed' }] } }],
        };
      },
    },
  };
}

describe('ADK explicit capability and trace ownership', () => {
  test('worker and tool spans remain children of the application run', async () => {
    const tool = readTemperatureTool();
    const adapter = createCapabilityAdapter({ provider: 'device', tools: [tool] });
    const root = createTraceContext({ traceId: 'app-trace', spanId: 'app-root', runId: 'run-1' });
    const agent = createADKAgent({
      name: 'Thermal', role: 'thermal', description: 'thermal worker',
      systemInstruction: 'Use tools', toolNames: ['read_temp'],
    });
    const result = await agent.execute(twoTurnClient() as never, 'read', { context: root, capabilityAdapter: adapter });
    assert.equal(result.status, 'completed');
    assert.equal(result.context.traceId, 'app-trace');
    assert.equal(result.context.parentSpanId, 'app-root');
    assert.equal(result.context.workerRunId, 'run-1:Thermal');
    assert.equal(result.steps[0].id, 'tool-call');
    assert.equal(result.steps[0].context.traceId, 'app-trace');
    assert.equal(result.steps[0].result.policyOutcome, 'not_required');
  });

  test('empty adapters stop workers before provider execution', async () => {
    let providerCalls = 0;
    const client = { models: { generateContent: async () => { providerCalls += 1; return {}; } } };
    const agent = createADKAgent({
      name: 'Thermal', role: 'thermal', description: 'thermal worker',
      systemInstruction: 'Use tools', toolNames: ['read_temp'],
    });
    const result = await agent.execute(client as never, 'read', {
      context: createTraceContext({ runId: 'empty' }),
      capabilityAdapter: createUnavailableCapabilityAdapter(),
    });
    assert.equal(result.status, 'unavailable');
    assert.equal(result.text, '');
    assert.equal(providerCalls, 0);
  });

  test('diagnostic team rejects an empty adapter without synthesizing observations', async () => {
    let providerCalls = 0;
    const client = { models: { generateContent: async () => { providerCalls += 1; return {}; } } };
    const report = await runDiagnosticTeam(client as never, 'battery issue', {
      context: createTraceContext({ runId: 'team' }),
      capabilityAdapter: createUnavailableCapabilityAdapter(),
    });
    assert.equal(report.status, 'unavailable');
    assert.equal(report.verdict, 'unavailable');
    assert.equal(report.summary, '');
    assert.equal(providerCalls, 0);
  });
});
