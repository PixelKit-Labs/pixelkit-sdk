/**
 * @file adk.test.ts
 * @description Unit tests for Google Agent Development Kit (ADK) integration and Multi-Agent Diagnostic Team.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  createADKTool,
  createADKAgent,
  createDiagnosticSpecialists,
  runDiagnosticTeam,
  type ADKTool,
} from '../packages/sdk/src/ai/adk/index.ts';
import { Type } from '@google/genai';

describe('Google Agent Development Kit (ADK) Integration', () => {
  test('createADKTool builds valid ADK tool declaration and executes handler', async () => {
    let executed = false;

    const tool = createADKTool(
      'read_temp',
      'Reads MLX90632 surface temperature in Celsius',
      {
        type: Type.OBJECT,
        properties: {},
      },
      () => {
        executed = true;
        return { surfaceC: 34.2, isCalibrated: true };
      },
    );

    assert.equal(tool.name, 'read_temp');
    assert.equal(tool.declaration.name, 'read_temp');
    assert.equal(tool.declaration.description, 'Reads MLX90632 surface temperature in Celsius');

    const res = await tool.execute({});
    assert.equal(executed, true);
    assert.equal(res.surfaceC, 34.2);
  });

  test('createADKAgent executes tool loops and formats structured response', async () => {
    const testTool = createADKTool(
      'check_cpu_throttling',
      'Checks if CPU is thermal throttled',
      {
        type: Type.OBJECT,
        properties: {},
      },
      () => ({ throttled: true, thermalStatus: 'severe' }),
    );

    let turn = 0;
    const mockAi: any = {
      models: {
        generateContent: async (req: any) => {
          turn++;
          if (turn === 1) {
            return {
              functionCalls: [{ id: 'c1', name: 'check_cpu_throttling', args: {} }],
              candidates: [
                {
                  content: {
                    role: 'model',
                    parts: [{ functionCall: { id: 'c1', name: 'check_cpu_throttling', args: {} } }],
                  },
                },
              ],
            };
          }
          return {
            text: 'Tensor G6 CPU is currently under severe thermal throttling.',
            functionCalls: [],
            candidates: [
              {
                content: {
                  role: 'model',
                  parts: [{ text: 'Tensor G6 CPU is currently under severe thermal throttling.' }],
                },
              },
            ],
          };
        },
      },
    };

    const agent = createADKAgent({
      name: 'ThermalSpecialist',
      role: 'Silicon Thermals',
      description: 'Specializes in thermal profiling',
      systemInstruction: 'Analyze thermal throttling.',
      tools: [testTool],
    });

    const result = await agent.execute(mockAi, 'Is the CPU overheating?');
    assert.equal(result.agentName, 'ThermalSpecialist');
    assert.equal(result.role, 'Silicon Thermals');
    assert.equal(result.steps.length, 1);
    assert.equal(result.steps[0].name, 'check_cpu_throttling');
    assert.deepEqual(result.steps[0].result, { throttled: true, thermalStatus: 'severe' });
    assert.ok(result.text.includes('severe thermal throttling'));
  });

  test('runDiagnosticTeam orchestrates multi-agent specialist sweep and synthesizes report', async () => {
    const tools: ADKTool[] = [
      createADKTool('get_thermal_headroom', 'Gets thermal headroom', { type: Type.OBJECT, properties: {} }, () => ({
        thermalStatus: 'none',
        cpuHeadroom: 0.85,
      })),
      createADKTool('get_battery_health', 'Gets battery health', { type: Type.OBJECT, properties: {} }, () => ({
        stateOfHealthPercent: 98,
        cycleCount: 42,
        chargingTier: 'ultra_rapid',
      })),
      createADKTool('get_wifi7_status', 'Gets Wi-Fi 7 status', { type: Type.OBJECT, properties: {} }, () => ({
        isMloActive: true,
        aggregateSpeedMbps: 2880,
      })),
    ];

    const mockAi: any = {
      models: {
        generateContent: async (req: any) => {
          const sys = req.config?.systemInstruction ?? '';
          const contents = req.contents?.[0]?.parts?.[0]?.text ?? '';

          if (contents.includes('Lead Hardware Diagnostic Coordinator')) {
            // Coordinator synthesis step
            return {
              text: JSON.stringify({
                verdict: 'healthy',
                summary: 'All hardware systems operating within normal parameters. Battery at 98% health and Wi-Fi 7 MLO active at 2.88 Gbps.',
                recommendations: ['Maintain current charging profile', 'No thermal mitigation required'],
              }),
            };
          }

          // Specialists step
          return {
            text: 'Telemetry reading verified normal.',
            functionCalls: [],
            candidates: [
              {
                content: {
                  role: 'model',
                  parts: [{ text: 'Telemetry reading verified normal.' }],
                },
              },
            ],
          };
        },
      },
    };

    const report = await runDiagnosticTeam(mockAi, 'Device checkup after intensive gaming', tools);

    assert.equal(report.issue, 'Device checkup after intensive gaming');
    assert.equal(report.verdict, 'healthy');
    assert.ok(report.summary.includes('All hardware systems operating within normal parameters'));
    assert.equal(report.specialistResults.length, 3);
    assert.equal(report.recommendations.length, 2);
    assert.ok(report.timestamp.length > 0);
  });
});
