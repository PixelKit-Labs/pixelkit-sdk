/**
 * @file agent.test.ts
 * @description Unit tests for the autonomous Cloud Agent Loop with function calling.
 */

import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  defineTool,
  clearTools,
  runCloudAgent,
} from '../packages/sdk/src/ai/tools/registry.ts';

// Inlined runCloudAgent test harness logic to verify multi-turn flow with mock Gemini client
describe('Cloud Agent Loop & Autonomous Tool Dispatch', () => {
  beforeEach(() => {
    clearTools();
  });

  test('runCloudAgent dispatches tool calls and folds results back into conversation', async () => {
    let hapticTriggered = false;

    defineTool({
      name: 'play_haptic',
      description: 'Plays a haptic vibration pattern',
      parameters: {
        type: 'OBJECT',
        properties: {
          pattern: { type: 'STRING' },
        },
        required: ['pattern'],
      },
      execute: ({ pattern }: { pattern: string }) => {
        if (pattern === 'success') hapticTriggered = true;
        return { played: pattern };
      },
    });

    let turn = 0;
    const recordedContents: any[] = [];
    const stepsFired: string[] = [];

    // Mock Google Gen AI Client
    const mockAi: any = {
      models: {
        generateContent: async (req: any) => {
          turn++;
          recordedContents.push(...req.contents);

          if (turn === 1) {
            // Model responds with a function call
            return {
              functionCalls: [
                {
                  id: 'call_1',
                  name: 'play_haptic',
                  args: { pattern: 'success' },
                },
              ],
              candidates: [
                {
                  content: {
                    role: 'model',
                    parts: [
                      {
                        functionCall: {
                          id: 'call_1',
                          name: 'play_haptic',
                          args: { pattern: 'success' },
                        },
                      },
                    ],
                  },
                },
              ],
            };
          }

          // Turn 2: Model finishes with final answer
          return {
            text: 'I have played the success haptic pattern.',
            functionCalls: [],
            candidates: [
              {
                content: {
                  role: 'model',
                  parts: [{ text: 'I have played the success haptic pattern.' }],
                },
              },
            ],
          };
        },
      },
    };

    const result = await runCloudAgent(
      mockAi,
      'Please trigger a success haptic pattern',
      [],
      {
        onStep: step => {
          stepsFired.push(step.call.name);
        },
      },
    );

    assert.equal(result.stoppedReason, 'completed');
    assert.equal(result.text, 'I have played the success haptic pattern.');
    assert.equal(hapticTriggered, true);
    assert.equal(result.steps.length, 1);
    assert.equal(result.steps[0].call.name, 'play_haptic');
    assert.deepEqual(stepsFired, ['play_haptic']);
  });

  test('runCloudAgent halts cleanly when maxSteps is exceeded', async () => {
    defineTool({
      name: 'infinite_ping',
      description: 'Pings forever',
      parameters: { type: 'OBJECT', properties: {} },
      execute: () => ({ pong: true }),
    });

    // Mock that keeps emitting tool calls on every step
    const mockAi: any = {
      models: {
        generateContent: async () => ({
          functionCalls: [{ id: 'call_ping', name: 'infinite_ping', args: {} }],
          candidates: [
            {
              content: {
                role: 'model',
                parts: [{ functionCall: { id: 'call_ping', name: 'infinite_ping', args: {} } }],
              },
            },
          ],
        }),
      },
    };

    const result = await runCloudAgent(mockAi, 'Start pinging', [], { maxSteps: 3 });

    assert.equal(result.stoppedReason, 'max_steps_exceeded');
    assert.equal(result.totalSteps, 3);
    assert.ok(result.text.includes('maximum tool steps exceeded'));
  });
});
