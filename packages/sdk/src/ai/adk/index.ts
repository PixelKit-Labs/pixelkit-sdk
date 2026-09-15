/**
 * @file index.ts
 * @description Google Agent Development Kit (ADK) integration for PixelKit.
 * Provides ADK-compatible Tool interfaces, Specialist Agent abstractions,
 * and a Multi-Agent Diagnostic Team for autonomous hardware health analysis.
 */

import {
  FunctionCallingConfigMode,
  Type,
  type Content,
  type FunctionDeclaration,
  type GoogleGenAI,
  type Schema,
} from '@google/genai';

const MODULE = 'ADK';

export interface ADKTool<I = Record<string, unknown>, O = Record<string, unknown>> {
  name: string;
  description: string;
  declaration: FunctionDeclaration;
  execute: (args: I) => Promise<O> | O;
}

export interface ADKAgentConfig {
  name: string;
  role: string;
  description: string;
  systemInstruction: string;
  tools: ADKTool[];
  model?: string;
  temperature?: number;
  maxSteps?: number;
}

export interface ADKAgentStep {
  name: string;
  args: Record<string, unknown>;
  result: Record<string, unknown>;
  durationMs: number;
}

export interface ADKAgentExecutionResult {
  agentName: string;
  role: string;
  text: string;
  steps: ADKAgentStep[];
}

export interface ADKAgent {
  name: string;
  role: string;
  description: string;
  tools: ADKTool[];
  execute: (
    ai: GoogleGenAI,
    task: string,
    context?: Record<string, unknown>,
  ) => Promise<ADKAgentExecutionResult>;
}

export type DiagnosticSeverity = 'healthy' | 'warning' | 'critical';

export interface DiagnosticReport {
  timestamp: string;
  issue: string;
  verdict: DiagnosticSeverity;
  summary: string;
  specialistResults: ADKAgentExecutionResult[];
  recommendations: string[];
}

export interface DiagnosticTeamOptions {
  model?: string;
  temperature?: number;
  maxStepsPerAgent?: number;
  specialists?: ADKAgent[];
  onAgentComplete?: (result: ADKAgentExecutionResult) => void;
}

/**
 * Creates an ADK-compatible Tool from name, description, parameters schema, and execution handler.
 */
export function createADKTool<I = Record<string, unknown>, O = Record<string, unknown>>(
  name: string,
  description: string,
  parameters: Schema,
  execute: (args: I) => Promise<O> | O,
): ADKTool<I, O> {
  return {
    name,
    description,
    declaration: {
      name,
      description,
      parameters,
    },
    execute,
  };
}

/**
 * Creates an autonomous ADK Agent instance that can reason and execute tools using Gemini.
 */
export function createADKAgent(config: ADKAgentConfig): ADKAgent {
  return {
    name: config.name,
    role: config.role,
    description: config.description,
    tools: config.tools,
    execute: async (
      ai: GoogleGenAI,
      task: string,
      context?: Record<string, unknown>,
    ): Promise<ADKAgentExecutionResult> => {
      const model = config.model ?? 'gemini-3.8-flash';
      const maxSteps = config.maxSteps ?? 4;
      const temperature = config.temperature ?? 0.2;

      const tools =
        config.tools.length > 0
          ? [{ functionDeclarations: config.tools.map(t => t.declaration) }]
          : undefined;

      const toolMap = new Map<string, ADKTool>();
      for (const t of config.tools) {
        toolMap.set(t.name, t);
      }

      const promptWithContext = context
        ? `${task}\n\nOperating Context:\n${JSON.stringify(context, null, 2)}`
        : task;

      const contents: Content[] = [
        {
          role: 'user',
          parts: [{ text: promptWithContext }],
        },
      ];

      const steps: ADKAgentStep[] = [];

      for (let step = 0; step < maxSteps; step++) {
        const res = await ai.models.generateContent({
          model,
          contents,
          config: {
            systemInstruction: config.systemInstruction,
            tools,
            toolConfig: tools
              ? { functionCallingConfig: { mode: FunctionCallingConfigMode.AUTO } }
              : undefined,
            temperature,
          },
        });

        const calls = res.functionCalls ?? [];
        const modelContent = res.candidates?.[0]?.content;
        if (modelContent) {
          contents.push(modelContent);
        }

        if (calls.length === 0) {
          return {
            agentName: config.name,
            role: config.role,
            text: res.text ?? '',
            steps,
          };
        }

        for (const call of calls) {
          const callName = call.name ?? '';
          const targetTool = toolMap.get(callName);
          const start = performance.now();

          let result: Record<string, unknown>;
          if (targetTool) {
            try {
              result = (await targetTool.execute(call.args as any)) ?? { ok: true };
            } catch (err: any) {
              result = { ok: false, error: err?.message ?? String(err) };
            }
          } else {
            result = { ok: false, error: `Tool '${callName}' not available to ${config.name}` };
          }

          const durationMs = Math.round(performance.now() - start);
          const stepInfo: ADKAgentStep = {
            name: callName,
            args: call.args as Record<string, unknown>,
            result,
            durationMs,
          };
          steps.push(stepInfo);
        }

        contents.push({
          role: 'user',
          parts: calls.map((c, i) => ({
            functionResponse: {
              id: c.id,
              name: c.name ?? '',
              response: steps[steps.length - calls.length + i].result,
            },
          })),
        });
      }

      return {
        agentName: config.name,
        role: config.role,
        text: 'Diagnostics step threshold reached.',
        steps,
      };
    },
  };
}

/**
 * Creates default specialist diagnostic agents equipped with ADK tools.
 */
export function createDiagnosticSpecialists(tools: ADKTool[]): {
  silicon: ADKAgent;
  battery: ADKAgent;
  radios: ADKAgent;
} {
  const toolMap = new Map<string, ADKTool>();
  for (const t of tools) toolMap.set(t.name, t);

  const getTools = (...names: string[]) =>
    names.map(n => toolMap.get(n)).filter((t): t is ADKTool => t !== undefined);

  const silicon = createADKAgent({
    name: 'SiliconDiagnosticAgent',
    role: 'Tensor G6 Silicon & Thermal Architect',
    description: 'Diagnoses CPU/GPU performance headroom, thermal throttling, and MLX90632 surface temperatures.',
    systemInstruction:
      'You are the Silicon Diagnostic Agent for Google Pixel hardware. Inspect ADPF thermal headroom, throttling state, and infrared thermometer surface readings. Report exact hardware values or state clearly if unavailable. Assess if thermal throttling is occurring.',
    tools: getTools('get_thermal_headroom', 'get_thermometer'),
  });

  const battery = createADKAgent({
    name: 'BatteryDiagnosticAgent',
    role: 'Power & Battery Charging Specialist',
    description: 'Diagnoses battery state of health, charge cycle counts, fast-charging tiers, and reverse wireless power sharing (Battery Share).',
    systemInstruction:
      'You are the Battery Diagnostic Agent. Inspect battery health, cycle count, active charging wattage, charging tier, and Battery Share state. Evaluate battery wear and power distribution safety.',
    tools: getTools('get_battery_health', 'set_battery_share'),
  });

  const radios = createADKAgent({
    name: 'RadiosDiagnosticAgent',
    role: 'RF & Multi-Link Network Specialist',
    description: 'Diagnoses Wi-Fi 7 Multi-Link Operation (MLO) bonded links across 2.4/5/6 GHz, atmospheric barometric pressure trends, and RF connectivity.',
    systemInstruction:
      'You are the Radios & Sensor Diagnostic Agent. Inspect Wi-Fi 7 MLO aggregation links, RSSI per band, and barometric trends. Determine whether wireless throughput or atmospheric environmental factors are impacting device performance.',
    tools: getTools('get_wifi7_status', 'get_barometer'),
  });

  return { silicon, battery, radios };
}

/**
 * Executes a multi-agent diagnostic team triage sweep across Pixel hardware.
 * Coordinately invokes specialists, synthesizes observations, and generates a structured DiagnosticReport.
 */
export async function runDiagnosticTeam(
  ai: GoogleGenAI,
  issueDescription: string,
  tools: ADKTool[] = [],
  options: DiagnosticTeamOptions = {},
): Promise<DiagnosticReport> {
  const model = options.model ?? 'gemini-3.8-flash';
  const specialists = options.specialists ?? Object.values(createDiagnosticSpecialists(tools));

  // Step 1: Run each specialist concurrently to gather hardware facts
  const specialistResults = await Promise.all(
    specialists.map(async specialist => {
      const result = await specialist.execute(
        ai,
        `Diagnose user reported issue: "${issueDescription}". Gather real-time hardware telemetry and report your findings.`,
      );
      options.onAgentComplete?.(result);
      return result;
    }),
  );

  // Step 2: Coordinator synthesizes specialist findings into a unified report
  const synthesisPrompt = `
You are the Lead Hardware Diagnostic Coordinator for a Google Pixel 11 Pro.
User Reported Issue: "${issueDescription}"

Specialist Diagnostic Findings:
${specialistResults
  .map(
    r =>
      `### ${r.agentName} (${r.role}):\n${r.text}\nExecuted Tools: ${r.steps.map(s => `${s.name}(${JSON.stringify(s.args)}) -> ${JSON.stringify(s.result)}`).join('; ') || 'None'}`,
  )
  .join('\n\n')}

Analyze all findings above. Follow the Zero-Simulation Principle (never fabricate missing readings; report "unavailable" as unmeasurable).
Provide your response strictly in JSON format with this exact structure:
{
  "verdict": "healthy" | "warning" | "critical",
  "summary": "1-3 concise sentences summarizing root cause and hardware status",
  "recommendations": ["clear, actionable next steps or remediation items"]
}
`;

  const synthesisRes = await ai.models.generateContent({
    model,
    contents: [{ role: 'user', parts: [{ text: synthesisPrompt }] }],
    config: {
      temperature: 0.1,
    },
  });

  const rawText = synthesisRes.text?.trim() ?? '';
  let parsed: { verdict?: DiagnosticSeverity; summary?: string; recommendations?: string[] } = {};

  try {
    const jsonMatch = rawText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      parsed = JSON.parse(jsonMatch[0]);
    }
  } catch {
    parsed = {
      verdict: 'warning',
      summary: rawText.slice(0, 200),
      recommendations: ['Review specialist findings manually.'],
    };
  }

  return {
    timestamp: new Date().toISOString(),
    issue: issueDescription,
    verdict: parsed.verdict ?? 'warning',
    summary: parsed.summary ?? 'Diagnostic completed with specialist analysis.',
    specialistResults,
    recommendations: parsed.recommendations ?? [],
  };
}
