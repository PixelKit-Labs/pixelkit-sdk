/** ADK-style workers backed by explicit per-run capability adapters. */
import {
  FunctionCallingConfigMode,
  type Content,
  type GoogleGenAI,
  type Schema,
} from '@google/genai';
import {
  createCapabilityAdapter,
  probeCapabilityAdapter,
  runTool,
  toGeminiParametersSchema,
  toToolFunctionResponse,
  type CapabilityAdapter,
  type CapabilityAvailability,
  type CapabilityEffect,
  type CapabilityExecutionContext,
  type CapabilityRisk,
  type CapabilityTool,
  type ToolExecutionResult,
} from '../tools/registry';
import {
  beginTrace,
  withTraceContextFields,
  logEvent,
  type ObservabilityOptions,
  type TraceContext,
} from '../../core/observability';

const MODULE = 'ADK';

export type ADKTool<I = Record<string, unknown>, O = Record<string, unknown>> = CapabilityTool<I, O>;

export interface ADKAgentConfig {
  name: string;
  role: string;
  description: string;
  systemInstruction: string;
  toolNames: readonly string[];
  model?: string;
  temperature?: number;
  maxSteps?: number;
}

export interface ADKRunOptions extends ObservabilityOptions {
  context: TraceContext;
  capabilityAdapter: CapabilityAdapter;
  signal?: AbortSignal;
}

export interface ADKAgentStep {
  id: string;
  name: string;
  args: Record<string, unknown>;
  result: ToolExecutionResult;
  durationMs: number;
  context: TraceContext;
}

export interface ADKAgentExecutionResult {
  agentName: string;
  role: string;
  text: string;
  steps: ADKAgentStep[];
  status: 'completed' | 'budget_exhausted' | 'unavailable' | 'cancelled';
  context: TraceContext;
  unavailableReason?: string;
  providerRequestId?: string;
  usage?: Record<string, number>;
}

export interface ADKAgent {
  readonly name: string;
  readonly role: string;
  readonly description: string;
  readonly toolNames: readonly string[];
  execute(
    ai: GoogleGenAI,
    task: string,
    run: ADKRunOptions,
    operatingContext?: Record<string, unknown>,
  ): Promise<ADKAgentExecutionResult>;
}

export type DiagnosticSeverity = 'healthy' | 'warning' | 'critical' | 'unavailable';

export interface DiagnosticReport {
  timestamp: string;
  issue: string;
  verdict: DiagnosticSeverity;
  summary: string;
  specialistResults: ADKAgentExecutionResult[];
  recommendations: string[];
  status: 'completed' | 'unavailable' | 'cancelled';
  context: TraceContext;
}

export interface DiagnosticTeamOptions {
  model?: string;
  temperature?: number;
  maxStepsPerAgent?: number;
  specialists?: ADKAgent[];
  onAgentComplete?: (result: ADKAgentExecutionResult) => void;
}

/** Creates a capability tool for use in an adapter; effect and availability are never inferred. */
export function createADKTool<I = Record<string, unknown>, O = Record<string, unknown>>(input: {
  name: string;
  description: string;
  parameters: Schema;
  outputSchema: CapabilityTool['outputSchema'];
  effect: CapabilityEffect;
  risk: CapabilityRisk;
  availability: (context: TraceContext) => CapabilityAvailability | Promise<CapabilityAvailability>;
  execute: (args: I, context: CapabilityExecutionContext) => O | Promise<O>;
  deadlineMs?: number;
}): ADKTool<I, O> {
  const parameters = input.parameters as unknown as { type?: string; properties?: Record<string, unknown>; required?: string[] };
  if (parameters.type !== 'OBJECT') throw new Error('ADK tool parameters must be an OBJECT schema');
  return Object.freeze({
    name: input.name,
    description: input.description,
    inputSchema: {
      type: 'OBJECT' as const,
      properties: (parameters.properties ?? {}) as CapabilityTool['inputSchema']['properties'],
      required: parameters.required,
    },
    outputSchema: input.outputSchema,
    effect: input.effect,
    risk: input.risk,
    availability: input.availability,
    execute: input.execute,
    deadlineMs: input.deadlineMs,
  });
}

export function createADKAgent(config: ADKAgentConfig): ADKAgent {
  return Object.freeze({
    name: config.name,
    role: config.role,
    description: config.description,
    toolNames: Object.freeze([...config.toolNames]),
    async execute(
      ai: GoogleGenAI,
      task: string,
      run: ADKRunOptions,
      operatingContext?: Record<string, unknown>,
    ): Promise<ADKAgentExecutionResult> {
      const workerRunId = run.context.workerRunId ?? `${run.context.runId ?? run.context.traceId}:${config.name}`;
      const workerOwner = withTraceContextFields(run.context, { workerRunId });
      const workerScope = beginTrace(MODULE, 'worker', 'hardware', { worker: config.name }, { ...run, context: workerOwner });
      const workerContext = workerScope.context;
      const observation: ADKRunOptions = { ...run, context: workerContext };
      const selectedTools = run.capabilityAdapter.tools.filter(tool => config.toolNames.includes(tool.name));
      if (selectedTools.length === 0) {
        logEvent(MODULE, 'worker_unavailable', { worker: config.name, reason: 'worker_capabilities_empty' }, 'warn', observation);
        workerScope.end('unavailable', { reason: 'worker_capabilities_empty' });
        return {
          agentName: config.name, role: config.role, text: '', steps: [], status: 'unavailable',
          context: workerContext, unavailableReason: 'worker_capabilities_empty',
        };
      }
      const selectedAdapter = createCapabilityAdapter({
        provider: run.capabilityAdapter.provider,
        tools: selectedTools,
        authorizeEffect: run.capabilityAdapter.authorizeEffect,
      });
      const probe = await probeCapabilityAdapter(selectedAdapter, workerContext, run.signal);
      if (run.signal?.aborted) {
        workerScope.end('cancelled');
        return { agentName: config.name, role: config.role, text: '', steps: [], status: 'cancelled', context: workerContext };
      }
      if (probe.availableTools.length === 0) {
        logEvent(MODULE, 'worker_unavailable', {
          worker: config.name,
          reason: 'worker_capabilities_unavailable',
          unavailableCapabilities: probe.unavailable,
        }, 'warn', observation);
        workerScope.end('unavailable', { reason: 'worker_capabilities_unavailable' });
        return {
          agentName: config.name, role: config.role, text: '', steps: [], status: 'unavailable',
          context: workerContext, unavailableReason: 'worker_capabilities_unavailable',
        };
      }
      const workerAdapter = createCapabilityAdapter({
        provider: selectedAdapter.provider,
        tools: probe.availableTools,
        authorizeEffect: selectedAdapter.authorizeEffect,
      });
      const model = config.model ?? 'gemini-3.8-flash';
      const maxSteps = config.maxSteps ?? 4;
      const declarations = probe.availableTools.map(tool => ({
        name: tool.name,
        description: tool.description,
        parameters: toGeminiParametersSchema(tool.inputSchema),
      }));
      const prompt = operatingContext
        ? `${task}\n\nOperating Context:\n${JSON.stringify(operatingContext, null, 2)}`
        : task;
      const contents: Content[] = [{ role: 'user', parts: [{ text: prompt }] }];
      const steps: ADKAgentStep[] = [];
      let providerRequestId: string | undefined;
      let usage: Record<string, number> | undefined;
      logEvent(MODULE, 'worker_started', { worker: config.name, model }, 'info', observation);

      for (let step = 0; step < maxSteps; step++) {
        if (run.signal?.aborted) {
          logEvent(MODULE, 'worker_cancelled', { worker: config.name }, 'warn', observation);
          workerScope.end('cancelled');
          return { agentName: config.name, role: config.role, text: '', steps, status: 'cancelled', context: workerContext, providerRequestId, usage };
        }
        const providerSpan = beginTrace(MODULE, 'worker_provider_request', 'hardware', { worker: config.name, model, step: step + 1 }, observation);
        try {
          const response = await ai.models.generateContent({
            model,
            contents,
            config: {
              systemInstruction: config.systemInstruction,
              tools: [{ functionDeclarations: declarations }],
              toolConfig: { functionCallingConfig: { mode: FunctionCallingConfigMode.AUTO } },
              temperature: config.temperature ?? 0.2,
            },
          });
          if (run.signal?.aborted) {
            providerSpan.end('cancelled');
            logEvent(MODULE, 'worker_cancelled', { worker: config.name }, 'warn', observation);
            workerScope.end('cancelled', { providerRequestId });
            return { agentName: config.name, role: config.role, text: '', steps, status: 'cancelled', context: workerContext, providerRequestId, usage };
          }
          const responseRecord = response as unknown as Record<string, unknown>;
          providerRequestId = typeof responseRecord.responseId === 'string' ? responseRecord.responseId : providerRequestId;
          const usageMetadata = responseRecord.usageMetadata as Record<string, unknown> | undefined;
          if (usageMetadata) usage = Object.fromEntries(Object.entries(usageMetadata).filter((entry): entry is [string, number] => typeof entry[1] === 'number'));
          logEvent(MODULE, 'first_response', { providerRequestId, ...(usage ? { usage } : {}) }, 'info', {
            ...observation,
            context: providerRequestId
              ? withTraceContextFields(providerSpan.context, { providerRequestId })
              : providerSpan.context,
          });
          providerSpan.end('ok', { providerRequestId, ...(usage ? { usage } : {}) });
          const calls = response.functionCalls ?? [];
          const modelContent = response.candidates?.[0]?.content;
          if (modelContent) contents.push(modelContent);
          if (calls.length === 0) {
            logEvent(MODULE, 'worker_completed', { worker: config.name, providerRequestId, finishReason: response.candidates?.[0]?.finishReason, ...(usage ? { usage } : {}) }, 'info', observation);
            workerScope.end('ok', { providerRequestId, ...(usage ? { usage } : {}) });
            return { agentName: config.name, role: config.role, text: response.text ?? '', steps, status: 'completed', context: workerContext, providerRequestId, usage };
          }
          for (const call of calls) {
            const toolCallId = call.id ?? `${workerRunId}:tool:${steps.length + 1}`;
            const started = performance.now();
            const result = await runTool(workerAdapter, call.name ?? '', call.args, {
              context: providerSpan.context, sink: run.sink, redaction: run.redaction,
              signal: run.signal, toolCallId,
            });
            steps.push({
              id: toolCallId,
              name: call.name ?? '',
              args: (call.args ?? {}) as Record<string, unknown>,
              result,
              durationMs: Math.round(performance.now() - started),
              context: result.context,
            });
          }
          contents.push({
            role: 'user',
            parts: calls.map((call, index) => ({
              functionResponse: {
                id: call.id,
                name: call.name ?? '',
                response: toToolFunctionResponse(steps[steps.length - calls.length + index].result),
              },
            })),
          });
        } catch (error) {
          providerSpan.end(run.signal?.aborted ? 'cancelled' : 'error', undefined, error);
          workerScope.end(run.signal?.aborted ? 'cancelled' : 'error', undefined, error);
          throw error;
        }
      }
      logEvent(MODULE, 'worker_budget_exhausted', { worker: config.name, maxSteps }, 'warn', observation);
      workerScope.end('ok', { terminal: 'budget_exhausted', providerRequestId });
      return { agentName: config.name, role: config.role, text: '', steps, status: 'budget_exhausted', context: workerContext, providerRequestId, usage };
    },
  });
}

export function createDiagnosticSpecialists(): {
  silicon: ADKAgent;
  battery: ADKAgent;
  radios: ADKAgent;
} {
  return {
    silicon: createADKAgent({
      name: 'SiliconDiagnosticAgent', role: 'Tensor Silicon & Thermal Architect',
      description: 'Diagnoses performance headroom, thermal throttling, and surface temperatures.',
      systemInstruction: 'Report only tool results actually observed. Mark unavailable values as unavailable.',
      toolNames: ['get_thermal_headroom', 'get_thermometer'],
    }),
    battery: createADKAgent({
      name: 'BatteryDiagnosticAgent', role: 'Power & Battery Charging Specialist',
      description: 'Diagnoses battery health, charging, and reverse wireless power sharing.',
      systemInstruction: 'Report only tool results actually observed. Effects require application approval.',
      toolNames: ['get_battery_health', 'set_battery_share'],
    }),
    radios: createADKAgent({
      name: 'RadiosDiagnosticAgent', role: 'RF & Multi-Link Network Specialist',
      description: 'Diagnoses Wi-Fi multi-link and barometric conditions.',
      systemInstruction: 'Report only tool results actually observed. Mark unavailable values as unavailable.',
      toolNames: ['get_wifi7_status', 'get_barometer'],
    }),
  };
}

export async function runDiagnosticTeam(
  ai: GoogleGenAI,
  issueDescription: string,
  run: ADKRunOptions,
  options: DiagnosticTeamOptions = {},
): Promise<DiagnosticReport> {
  if (!run.capabilityAdapter || run.capabilityAdapter.tools.length === 0) {
    logEvent(MODULE, 'team_unavailable', { reason: 'capability_adapter_empty' }, 'warn', run);
    return {
      timestamp: new Date().toISOString(), issue: issueDescription, verdict: 'unavailable', summary: '',
      specialistResults: [], recommendations: [], status: 'unavailable', context: run.context,
    };
  }
  const specialists = options.specialists ?? Object.values(createDiagnosticSpecialists());
  const specialistResults = await Promise.all(specialists.map(async (specialist, index) => {
    const context = withTraceContextFields(run.context, {
      workerRunId: `${run.context.runId ?? run.context.traceId}:worker:${index + 1}`,
    });
    const result = await specialist.execute(ai, `Diagnose user reported issue: "${issueDescription}".`, { ...run, context });
    options.onAgentComplete?.(result);
    return result;
  }));
  if (run.signal?.aborted) {
    return {
      timestamp: new Date().toISOString(), issue: issueDescription, verdict: 'unavailable', summary: '',
      specialistResults, recommendations: [], status: 'cancelled', context: run.context,
    };
  }
  const synthesisContext = withTraceContextFields(run.context, { workerRunId: `${run.context.runId ?? run.context.traceId}:coordinator` });
  const synthesis = beginTrace(MODULE, 'team_synthesis', 'hardware', { model: options.model ?? 'gemini-3.8-flash' }, { ...run, context: synthesisContext });
  try {
    const response = await ai.models.generateContent({
      model: options.model ?? 'gemini-3.8-flash',
      contents: [{ role: 'user', parts: [{ text: JSON.stringify({
        instruction: 'Return JSON with verdict, summary, and recommendations. Never invent unavailable observations.',
        issue: issueDescription,
        specialists: specialistResults.map(result => ({ agentName: result.agentName, status: result.status, text: result.text, steps: result.steps.map(step => ({ name: step.name, result: step.result })) })),
      }) }] }],
      config: { temperature: options.temperature ?? 0.1 },
    });
    if (run.signal?.aborted) {
      synthesis.end('cancelled');
      return {
        timestamp: new Date().toISOString(),
        issue: issueDescription,
        verdict: 'unavailable',
        summary: '',
        specialistResults,
        recommendations: [],
        status: 'cancelled',
        context: run.context,
      };
    }
    const raw = response.text?.trim() ?? '';
    let parsed: { verdict?: DiagnosticSeverity; summary?: string; recommendations?: string[] } = {};
    try {
      const match = raw.match(/\{[\s\S]*\}/);
      if (match) parsed = JSON.parse(match[0]) as typeof parsed;
    } catch {
      parsed = {};
    }
    synthesis.end('ok', {
      providerRequestId: (response as unknown as Record<string, unknown>).responseId,
      finishReason: response.candidates?.[0]?.finishReason,
    });
    return {
      timestamp: new Date().toISOString(),
      issue: issueDescription,
      verdict: parsed.verdict ?? 'unavailable',
      summary: parsed.summary ?? '',
      specialistResults,
      recommendations: parsed.recommendations ?? [],
      status: 'completed',
      context: run.context,
    };
  } catch (error) {
    synthesis.end('error', undefined, error);
    throw error;
  }
}
