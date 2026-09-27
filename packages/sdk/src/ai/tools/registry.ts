/** Explicit per-run capability adapters for Gemini, Live, and ADK tool execution. */
import {
  FunctionCallingConfigMode,
  Type,
  type Content,
  type FunctionDeclaration,
  type GoogleGenAI,
  type Schema,
} from '@google/genai';
import {
  beginTrace,
  withTraceContextFields,
  createTraceContext,
  logEvent,
  normalizeError,
  type ObservabilityOptions,
  type TraceContext,
} from '../../core/observability';

const MODULE = 'CapabilityAdapter';

export type ToolType = 'STRING' | 'NUMBER' | 'INTEGER' | 'BOOLEAN' | 'ARRAY' | 'OBJECT';
export type CapabilityEffect = 'read' | 'effect';
export type CapabilityRisk = 'low' | 'medium' | 'high';
export type PolicyOutcome = 'not_required' | 'approved' | 'denied' | 'unavailable';
export type ToolExecutionStatus = 'success' | 'unavailable' | 'denied' | 'invalid' | 'error' | 'timeout' | 'cancelled';

export interface ToolPropertySchema {
  type: ToolType;
  description?: string;
  enum?: readonly string[];
  nullable?: boolean;
  properties?: Readonly<Record<string, ToolPropertySchema>>;
  items?: ToolPropertySchema;
  required?: readonly string[];
}

export interface ToolParametersSchema {
  type: 'OBJECT';
  properties: Readonly<Record<string, ToolPropertySchema>>;
  required?: readonly string[];
  description?: string;
}

export interface CapabilityAvailability {
  available: boolean;
  reason?: string;
}

export interface CapabilityExecutionContext {
  readonly trace: TraceContext;
  readonly signal: AbortSignal;
  readonly toolCallId: string;
  readonly provider: string;
}

export interface CapabilityTool<I = unknown, O = unknown> {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: ToolParametersSchema;
  readonly outputSchema: ToolPropertySchema;
  readonly effect: CapabilityEffect;
  readonly risk: CapabilityRisk;
  readonly deadlineMs?: number;
  readonly onDevice?: boolean;
  readonly availability: (context: TraceContext) => CapabilityAvailability | Promise<CapabilityAvailability>;
  execute(args: I, context: CapabilityExecutionContext): O | Promise<O>;
}

export interface EffectProposal {
  readonly toolName: string;
  readonly toolCallId: string;
  readonly provider: string;
  readonly risk: CapabilityRisk;
  readonly arguments: unknown;
  readonly trace: TraceContext;
  readonly signal: AbortSignal;
}

export interface PolicyDecision {
  readonly outcome: 'approved' | 'denied';
  readonly reason?: string;
}

export type EffectPolicyGateway = (proposal: EffectProposal) => PolicyDecision | Promise<PolicyDecision>;

/** Immutable tool-set. Executors and effect policy remain owned by the application that creates it. */
export interface CapabilityAdapter {
  readonly provider: string;
  readonly tools: readonly CapabilityTool[];
  readonly authorizeEffect?: EffectPolicyGateway;
}

export interface ToolExecutionOptions extends ObservabilityOptions {
  context?: TraceContext;
  toolCallId: string;
  signal?: AbortSignal;
  deadlineMs?: number;
}

export interface ToolExecutionResult {
  ok: boolean;
  status: ToolExecutionStatus;
  toolCallId: string;
  provider: string;
  policyOutcome: PolicyOutcome;
  context: TraceContext;
  result?: unknown;
  error?: string;
  issues?: string[];
}

export interface HardwareContext {
  torch?: { isTorchOn: boolean; isStrobing: boolean; toggleTorch: () => Promise<void>; startStrobe: () => Promise<void>; stopStrobe: () => Promise<void> };
  haptics?: { triggerHaptic: (pattern: 'selection' | 'light' | 'medium' | 'heavy' | 'success' | 'warning' | 'error') => Promise<void> };
  hilight?: { mode: string; currentColor: string; setMode: (mode: unknown) => Promise<void> | void; setColor: (color: string) => Promise<void> | void };
  adpf?: { cpuHeadroom: number | null; gpuHeadroom: number | null; thermalStatus: string | null; currentFps: number | null };
  altimeter?: { altitudeM: number | null; pressureHpa: number | null; verticalVelocityMps: number | null; trend: string; calibrateSeaLevel: (hpa: number) => void };
  batteryShare?: { isSupported: boolean; isActive: boolean; isReceiverDetected: boolean; transmittedWatts: number | null; setBatteryShare: (enabled: boolean) => Promise<boolean> };
  thermometer?: { isSupported: boolean; surfaceTemperatureC: number | null; surfaceTemperatureF: number | null; ambientTemperatureC: number | null; mode: string };
  charging?: { stateOfHealthPercent: number | null; cycleCount: number | null; chargingTier: string | null; chargingWattage: number | null };
  wifi7?: { isSupported: boolean; isMloActive: boolean; aggregateSpeedMbps: number | null; links: Array<{ band: string; rssi: number; rxLinkSpeedMbps: number; txLinkSpeedMbps: number }> };
}

export const DEFAULT_AGENT_MODEL = 'gemini-3.8-flash';
export const DEFAULT_MAX_STEPS = 6;

export interface AgentStepInfo {
  step: number;
  call: { id: string; name: string; args: unknown };
  result: ToolExecutionResult;
  durationMs: number;
  context: TraceContext;
}

export interface CloudAgentOptions extends ObservabilityOptions {
  capabilityAdapter: CapabilityAdapter;
  context: TraceContext;
  model?: string;
  systemInstruction?: string;
  maxSteps?: number;
  temperature?: number;
  signal?: AbortSignal;
  onStep?: (step: AgentStepInfo) => void;
}

export interface CloudAgentResult {
  text: string;
  contents: Content[];
  steps: AgentStepInfo[];
  totalSteps: number;
  stoppedReason: 'completed' | 'max_steps_exceeded' | 'unavailable' | 'cancelled';
  context: TraceContext;
  unavailableReason?: string;
  providerRequestId?: string;
  usage?: Record<string, number>;
}

export function toToolFunctionResponse(result: ToolExecutionResult): Record<string, unknown> {
  return result.ok
    ? {
        output: result.result,
        toolCallId: result.toolCallId,
        capabilityProvider: result.provider,
        policyOutcome: result.policyOutcome,
      }
    : {
        error: result.error,
        status: result.status,
        issues: result.issues,
        toolCallId: result.toolCallId,
        capabilityProvider: result.provider,
        policyOutcome: result.policyOutcome,
      };
}

function freezePropertySchema(schema: ToolPropertySchema): ToolPropertySchema {
  const properties = schema.properties
    ? Object.freeze(Object.fromEntries(
        Object.entries(schema.properties).map(([key, value]) => [key, freezePropertySchema(value)]),
      ))
    : undefined;
  return Object.freeze({
    ...schema,
    ...(schema.enum ? { enum: Object.freeze([...schema.enum]) } : {}),
    ...(schema.required ? { required: Object.freeze([...schema.required]) } : {}),
    ...(properties ? { properties } : {}),
    ...(schema.items ? { items: freezePropertySchema(schema.items) } : {}),
  });
}

function freezeTool<I, O>(tool: CapabilityTool<I, O>): CapabilityTool<I, O> {
  return Object.freeze({
    ...tool,
    inputSchema: Object.freeze({
      ...tool.inputSchema,
      properties: Object.freeze(Object.fromEntries(
        Object.entries(tool.inputSchema.properties).map(([key, value]) => [key, freezePropertySchema(value)]),
      )),
      ...(tool.inputSchema.required
        ? { required: Object.freeze([...tool.inputSchema.required]) }
        : {}),
    }),
    outputSchema: freezePropertySchema(tool.outputSchema),
  });
}

export function createCapabilityAdapter(input: {
  provider: string;
  tools: readonly CapabilityTool[];
  authorizeEffect?: EffectPolicyGateway;
}): CapabilityAdapter {
  if (!input.provider.trim()) throw new Error('Capability provider is required');
  const names = new Set<string>();
  const tools = input.tools.map(tool => {
    if (!/^[A-Za-z_][A-Za-z0-9_.:-]{0,127}$/.test(tool.name) || names.has(tool.name)) {
      throw new Error(`Duplicate or invalid capability name: ${tool.name}`);
    }
    names.add(tool.name);
    return freezeTool(tool);
  });
  return Object.freeze({
    provider: input.provider,
    tools: Object.freeze(tools),
    ...(input.authorizeEffect ? { authorizeEffect: input.authorizeEffect } : {}),
  });
}

export function createUnavailableCapabilityAdapter(provider = 'unavailable'): CapabilityAdapter {
  return createCapabilityAdapter({ provider, tools: [] });
}

export interface CapabilityProbeResult {
  provider: string;
  availableTools: readonly CapabilityTool[];
  unavailable: Readonly<Record<string, string>>;
}

/** Resolves run-time availability without executing a capability or asking the model. */
export async function probeCapabilityAdapter(
  adapter: CapabilityAdapter,
  context: TraceContext,
  signal?: AbortSignal,
): Promise<CapabilityProbeResult> {
  const availableTools: CapabilityTool[] = [];
  const unavailable: Record<string, string> = {};
  for (const tool of adapter.tools) {
    if (signal?.aborted) {
      unavailable[tool.name] = 'cancelled';
      continue;
    }
    if (tool.effect === 'effect' && !adapter.authorizeEffect) {
      unavailable[tool.name] = 'effect_policy_unavailable';
      continue;
    }
    try {
      const result = await tool.availability(context);
      if (result.available) availableTools.push(tool);
      else unavailable[tool.name] = result.reason ?? 'capability_unavailable';
    } catch {
      unavailable[tool.name] = 'availability_probe_failed';
    }
  }
  return Object.freeze({
    provider: adapter.provider,
    availableTools: Object.freeze(availableTools),
    unavailable: Object.freeze(unavailable),
  });
}

export function validateParameters(
  schema: ToolParametersSchema,
  args: unknown,
): { success: true; data: Record<string, unknown> } | { success: false; issues: string[] } {
  const issues: string[] = [];
  if (args == null || typeof args !== 'object' || Array.isArray(args)) {
    return { success: false, issues: ['Arguments must be an object'] };
  }
  const input = args as Record<string, unknown>;
  for (const key of Object.keys(input)) {
    if (!(key in schema.properties)) issues.push(`Unknown parameter: '${key}'`);
  }
  for (const required of schema.required ?? []) {
    if (!(required in input) || input[required] === undefined || input[required] === null) {
      issues.push(`Missing required parameter: '${required}'`);
    }
  }
  const validateProperty = (property: ToolPropertySchema, value: unknown, path: string): void => {
    if (value == null) {
      if (!property.nullable) issues.push(`Parameter '${path}' cannot be null`);
      return;
    }
    const actual = Array.isArray(value) ? 'array' : typeof value;
    const expected: Record<ToolType, string> = {
      STRING: 'string', NUMBER: 'number', INTEGER: 'number', BOOLEAN: 'boolean', ARRAY: 'array', OBJECT: 'object',
    };
    if (actual !== expected[property.type] || (property.type === 'INTEGER' && !Number.isInteger(value))) {
      issues.push(`Parameter '${path}' must be a ${property.type.toLowerCase()}`);
      return;
    }
    if (property.enum && typeof value === 'string' && !property.enum.includes(value)) {
      issues.push(`Parameter '${path}' must be one of [${property.enum.join(', ')}]`);
    }
    if (property.type === 'ARRAY' && property.items) {
      (value as unknown[]).forEach((item, index) => validateProperty(property.items!, item, `${path}[${index}]`));
    }
    if (property.type === 'OBJECT' && property.properties) {
      const objectValue = value as Record<string, unknown>;
      for (const required of property.required ?? []) {
        if (!(required in objectValue)) issues.push(`Missing required parameter: '${path}.${required}'`);
      }
      for (const [key, child] of Object.entries(property.properties)) {
        if (key in objectValue) validateProperty(child, objectValue[key], `${path}.${key}`);
      }
      for (const key of Object.keys(objectValue)) {
        if (!(key in property.properties)) issues.push(`Unknown parameter: '${path}.${key}'`);
      }
    }
  };
  for (const [key, property] of Object.entries(schema.properties)) {
    if (key in input && input[key] !== undefined) validateProperty(property, input[key], key);
  }
  return issues.length > 0 ? { success: false, issues } : { success: true, data: input };
}

function convertPropertyToGeminiSchema(property: ToolPropertySchema): Schema {
  const types: Record<ToolType, Type> = {
    STRING: Type.STRING, NUMBER: Type.NUMBER, INTEGER: Type.INTEGER,
    BOOLEAN: Type.BOOLEAN, ARRAY: Type.ARRAY, OBJECT: Type.OBJECT,
  };
  const schema: Schema = {
    type: types[property.type], description: property.description,
    enum: property.enum ? [...property.enum] : undefined, nullable: property.nullable,
  };
  if (property.properties) {
    schema.properties = Object.fromEntries(Object.entries(property.properties).map(([key, child]) => [key, convertPropertyToGeminiSchema(child)]));
  }
  if (property.items) schema.items = convertPropertyToGeminiSchema(property.items);
  if (property.required) schema.required = [...property.required];
  return schema;
}

export function toGeminiParametersSchema(parameters: ToolParametersSchema): Schema {
  return {
    type: Type.OBJECT,
    description: parameters.description,
    properties: Object.fromEntries(Object.entries(parameters.properties).map(([key, property]) => [key, convertPropertyToGeminiSchema(property)])),
    required: parameters.required ? [...parameters.required] : [],
  };
}

export function toFunctionDeclarations(tools: readonly CapabilityTool[]): FunctionDeclaration[] {
  return tools.map(tool => ({
    name: tool.name,
    description: tool.description,
    parameters: toGeminiParametersSchema(tool.inputSchema),
    response: convertPropertyToGeminiSchema(tool.outputSchema),
  }));
}

function resultBase(adapter: CapabilityAdapter, context: TraceContext, toolCallId: string) {
  return { provider: adapter.provider, context, toolCallId };
}

export async function runTool(
  adapter: CapabilityAdapter,
  name: string,
  rawArgs: unknown,
  options: ToolExecutionOptions,
): Promise<ToolExecutionResult> {
  const parent = options.context ?? createTraceContext({ toolCallId: options.toolCallId });
  const owner = withTraceContextFields(parent, { toolCallId: options.toolCallId });
  const scope = beginTrace(MODULE, 'tool', 'hardware', {
    schemaName: name, capabilityProvider: adapter.provider, toolCallId: options.toolCallId,
  }, { ...options, context: owner });
  const base = resultBase(adapter, scope.context, options.toolCallId);
  const tool = adapter.tools.find(candidate => candidate.name === name);
  if (!tool) {
    scope.event('tool_proposed', {
      schemaName: name, capabilityProvider: adapter.provider, toolCallId: options.toolCallId,
      policyOutcome: 'unavailable',
    }, 'warn');
    const result: ToolExecutionResult = { ...base, ok: false, status: 'unavailable', policyOutcome: 'unavailable', error: `unknown_tool:${name}` };
    scope.event('tool_result', { schemaName: name, capabilityProvider: adapter.provider, toolCallId: options.toolCallId, policyOutcome: result.policyOutcome, status: result.status }, 'warn');
    scope.end('unavailable');
    return result;
  }
  const validation = validateParameters(tool.inputSchema, rawArgs ?? {});
  if (!validation.success) {
    scope.event('tool_proposed', {
      schemaName: name, capabilityProvider: adapter.provider, toolCallId: options.toolCallId,
      policyOutcome: tool.effect === 'read' ? 'not_required' : 'unavailable', effect: tool.effect, risk: tool.risk,
    }, 'warn');
    const result: ToolExecutionResult = { ...base, ok: false, status: 'invalid', policyOutcome: tool.effect === 'read' ? 'not_required' : 'unavailable', error: 'invalid_arguments', issues: validation.issues };
    scope.event('tool_result', { schemaName: name, capabilityProvider: adapter.provider, toolCallId: options.toolCallId, policyOutcome: result.policyOutcome, status: result.status }, 'warn');
    scope.end('error', undefined, result.error);
    return result;
  }
  if (options.signal?.aborted) {
    scope.event('tool_proposed', {
      schemaName: name, capabilityProvider: adapter.provider, toolCallId: options.toolCallId,
      policyOutcome: 'unavailable', effect: tool.effect, risk: tool.risk,
    }, 'warn');
    const result: ToolExecutionResult = { ...base, ok: false, status: 'cancelled', policyOutcome: 'unavailable', error: 'cancelled' };
    scope.event('tool_result', {
      schemaName: name, capabilityProvider: adapter.provider, toolCallId: options.toolCallId,
      policyOutcome: result.policyOutcome, status: result.status,
    }, 'warn');
    scope.end('cancelled');
    return result;
  }
  let availability: CapabilityAvailability;
  try {
    availability = await tool.availability(scope.context);
  } catch (error) {
    scope.event('tool_proposed', {
      schemaName: name, capabilityProvider: adapter.provider, toolCallId: options.toolCallId,
      policyOutcome: 'unavailable', effect: tool.effect, risk: tool.risk,
    }, 'warn');
    const result: ToolExecutionResult = { ...base, ok: false, status: 'error', policyOutcome: 'unavailable', error: 'availability_probe_failed' };
    scope.event('tool_result', { schemaName: name, capabilityProvider: adapter.provider, toolCallId: options.toolCallId, policyOutcome: result.policyOutcome, status: result.status }, 'error');
    scope.end('error', undefined, error);
    return result;
  }
  if (!availability.available) {
    scope.event('tool_proposed', {
      schemaName: name, capabilityProvider: adapter.provider, toolCallId: options.toolCallId,
      policyOutcome: 'unavailable', effect: tool.effect, risk: tool.risk,
    }, 'warn');
    const result: ToolExecutionResult = { ...base, ok: false, status: 'unavailable', policyOutcome: 'unavailable', error: availability.reason ?? 'capability_unavailable' };
    scope.event('tool_result', { schemaName: name, capabilityProvider: adapter.provider, toolCallId: options.toolCallId, policyOutcome: result.policyOutcome, status: result.status }, 'warn');
    scope.end('unavailable');
    return result;
  }

  let policyOutcome: PolicyOutcome = 'not_required';
  if (tool.effect === 'effect') {
    if (!adapter.authorizeEffect) {
      scope.event('tool_proposed', {
        schemaName: name, capabilityProvider: adapter.provider, toolCallId: options.toolCallId,
        policyOutcome: 'unavailable', effect: tool.effect, risk: tool.risk,
      }, 'warn');
      const result: ToolExecutionResult = { ...base, ok: false, status: 'unavailable', policyOutcome: 'unavailable', error: 'effect_policy_unavailable' };
      scope.event('tool_result', { schemaName: name, capabilityProvider: adapter.provider, toolCallId: options.toolCallId, policyOutcome: result.policyOutcome, status: result.status }, 'warn');
      scope.end('unavailable');
      return result;
    }
    let policy: PolicyDecision;
    try {
      policy = await adapter.authorizeEffect({
        toolName: name, toolCallId: options.toolCallId, provider: adapter.provider,
        risk: tool.risk, arguments: validation.data, trace: scope.context,
        signal: options.signal ?? new AbortController().signal,
      });
    } catch (error) {
      scope.event('tool_proposed', {
        schemaName: name, capabilityProvider: adapter.provider, toolCallId: options.toolCallId,
        policyOutcome: 'unavailable', effect: tool.effect, risk: tool.risk,
      }, 'error');
      const result: ToolExecutionResult = { ...base, ok: false, status: 'error', policyOutcome: 'unavailable', error: 'effect_policy_failed' };
      scope.event('tool_result', { schemaName: name, capabilityProvider: adapter.provider, toolCallId: options.toolCallId, policyOutcome: result.policyOutcome, status: result.status }, 'error');
      scope.end('error', undefined, error);
      return result;
    }
    policyOutcome = policy.outcome;
    if (policy.outcome !== 'approved') {
      scope.event('tool_proposed', {
        schemaName: name, capabilityProvider: adapter.provider, toolCallId: options.toolCallId,
        policyOutcome, effect: tool.effect, risk: tool.risk,
      }, 'warn');
      const result: ToolExecutionResult = { ...base, ok: false, status: 'denied', policyOutcome, error: policy.reason ?? 'effect_denied' };
      scope.event('tool_result', { schemaName: name, capabilityProvider: adapter.provider, toolCallId: options.toolCallId, policyOutcome, status: result.status }, 'warn');
      scope.end('ok', { policyOutcome, status: result.status });
      return result;
    }
  }

  if (options.signal?.aborted) {
    scope.event('tool_proposed', {
      schemaName: name, capabilityProvider: adapter.provider, toolCallId: options.toolCallId,
      policyOutcome, effect: tool.effect, risk: tool.risk,
    }, 'warn');
    const result: ToolExecutionResult = { ...base, ok: false, status: 'cancelled', policyOutcome, error: 'cancelled' };
    scope.event('tool_result', {
      schemaName: name,
      capabilityProvider: adapter.provider,
      toolCallId: options.toolCallId,
      policyOutcome,
      status: result.status,
    }, 'warn');
    scope.end('cancelled', { policyOutcome });
    return result;
  }
  scope.event('tool_proposed', {
    schemaName: name, capabilityProvider: adapter.provider, toolCallId: options.toolCallId,
    policyOutcome, effect: tool.effect, risk: tool.risk,
  });
  const controller = new AbortController();
  const externalAbort = () => controller.abort(options.signal?.reason);
  options.signal?.addEventListener('abort', externalAbort, { once: true });
  const deadlineMs = options.deadlineMs ?? tool.deadlineMs;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    const execution = Promise.resolve(tool.execute(validation.data, {
      trace: scope.context, signal: controller.signal, toolCallId: options.toolCallId, provider: adapter.provider,
    }));
    const resultValue = deadlineMs == null
      ? await execution
      : await Promise.race([
          execution,
          new Promise<never>((_, reject) => {
            timeout = setTimeout(() => { controller.abort('deadline'); reject(new Error('tool_deadline_exceeded')); }, deadlineMs);
          }),
        ]);
    const outputValidation = validateParameters(
      { type: 'OBJECT', properties: { output: tool.outputSchema }, required: ['output'] },
      { output: resultValue },
    );
    if (!outputValidation.success) {
      const invalidResult: ToolExecutionResult = {
        ...base,
        ok: false,
        status: 'error',
        policyOutcome,
        error: 'invalid_tool_result',
        issues: outputValidation.issues,
      };
      scope.event('tool_result', {
        schemaName: name,
        capabilityProvider: adapter.provider,
        toolCallId: options.toolCallId,
        policyOutcome,
        status: invalidResult.status,
      }, 'error');
      scope.end('error', { policyOutcome, status: invalidResult.status }, invalidResult.error);
      return invalidResult;
    }
    const result: ToolExecutionResult = { ...base, ok: true, status: 'success', policyOutcome, result: resultValue };
    scope.event('tool_result', { schemaName: name, capabilityProvider: adapter.provider, toolCallId: options.toolCallId, policyOutcome, status: result.status });
    scope.end('ok', { policyOutcome, status: result.status });
    return result;
  } catch (error) {
    const normalized = normalizeError(error);
    const timedOut = normalized.message === 'tool_deadline_exceeded';
    const cancelled = !timedOut && controller.signal.aborted;
    const status: ToolExecutionStatus = timedOut ? 'timeout' : cancelled ? 'cancelled' : 'error';
    const result: ToolExecutionResult = { ...base, ok: false, status, policyOutcome, error: normalized.message };
    scope.event('tool_result', { schemaName: name, capabilityProvider: adapter.provider, toolCallId: options.toolCallId, policyOutcome, status }, status === 'error' ? 'error' : 'warn');
    scope.end(timedOut ? 'timeout' : cancelled ? 'cancelled' : 'error', { policyOutcome, status }, error);
    return result;
  } finally {
    if (timeout) clearTimeout(timeout);
    options.signal?.removeEventListener('abort', externalAbort);
  }
}

export async function runCloudAgent(
  ai: GoogleGenAI,
  prompt: string,
  history: Content[],
  options: CloudAgentOptions,
): Promise<CloudAgentResult> {
  const context = options.context;
  const adapter = options.capabilityAdapter;
  const contents: Content[] = [...history, { role: 'user', parts: [{ text: prompt }] }];
  const steps: AgentStepInfo[] = [];
  if (!adapter || adapter.tools.length === 0) {
    logEvent(MODULE, 'cloud_agent_unavailable', { reason: 'capability_adapter_empty' }, 'warn', options);
    return { text: '', contents, steps, totalSteps: 0, stoppedReason: 'unavailable', context, unavailableReason: 'capability_adapter_empty' };
  }
  const probe = await probeCapabilityAdapter(adapter, context, options.signal);
  if (options.signal?.aborted) {
    logEvent(MODULE, 'cancelled', { model: options.model ?? DEFAULT_AGENT_MODEL }, 'warn', options);
    return { text: '', contents, steps, totalSteps: 0, stoppedReason: 'cancelled', context };
  }
  if (probe.availableTools.length === 0) {
    logEvent(MODULE, 'cloud_agent_unavailable', {
      reason: 'capabilities_unavailable',
      unavailableCapabilities: probe.unavailable,
    }, 'warn', options);
    return { text: '', contents, steps, totalSteps: 0, stoppedReason: 'unavailable', context, unavailableReason: 'capabilities_unavailable' };
  }
  const model = options.model ?? DEFAULT_AGENT_MODEL;
  const maxSteps = options.maxSteps ?? DEFAULT_MAX_STEPS;
  const tools = [{ functionDeclarations: toFunctionDeclarations(probe.availableTools) }];
  logEvent(MODULE, 'request_accepted', { model, capabilityProvider: adapter.provider }, 'info', options);
  let providerRequestId: string | undefined;
  let usage: Record<string, number> | undefined;

  for (let step = 0; step < maxSteps; step++) {
    if (options.signal?.aborted) {
      logEvent(MODULE, 'cancelled', { model }, 'warn', options);
      return { text: '', contents, steps, totalSteps: step, stoppedReason: 'cancelled', context, providerRequestId, usage };
    }
    const scope = beginTrace(MODULE, 'provider_request', 'hardware', { model, step: step + 1 }, options);
    try {
      const response = await ai.models.generateContent({
        model,
        contents,
        config: {
          systemInstruction: options.systemInstruction,
          tools,
          toolConfig: { functionCallingConfig: { mode: FunctionCallingConfigMode.AUTO } },
          temperature: options.temperature ?? 0.2,
        },
      });
      const responseRecord = response as unknown as Record<string, unknown>;
      providerRequestId = typeof responseRecord.responseId === 'string' ? responseRecord.responseId : providerRequestId;
      const usageMetadata = responseRecord.usageMetadata as Record<string, unknown> | undefined;
      if (usageMetadata) {
        usage = Object.fromEntries(Object.entries(usageMetadata).filter((entry): entry is [string, number] => typeof entry[1] === 'number'));
      }
      if (options.signal?.aborted) {
        scope.end('cancelled', { providerRequestId, ...(usage ? { usage } : {}) });
        logEvent(MODULE, 'cancelled', { model, providerRequestId }, 'warn', options);
        return { text: '', contents, steps, totalSteps: step, stoppedReason: 'cancelled', context, providerRequestId, usage };
      }
      logEvent(MODULE, 'first_response', { model, providerRequestId, ...(usage ? { usage } : {}) }, 'info', {
        ...options,
        context: providerRequestId
          ? withTraceContextFields(scope.context, { providerRequestId })
          : scope.context,
      });
      scope.end('ok', { providerRequestId, ...(usage ? { usage } : {}) });
      const calls = response.functionCalls ?? [];
      const modelContent = response.candidates?.[0]?.content;
      if (modelContent) contents.push(modelContent);
      if (calls.length === 0) {
        logEvent(MODULE, 'completed', { model, finishReason: response.candidates?.[0]?.finishReason, providerRequestId, ...(usage ? { usage } : {}) }, 'info', options);
        return { text: response.text ?? '', contents, steps, totalSteps: step, stoppedReason: 'completed', context, providerRequestId, usage };
      }
      for (const call of calls) {
        const callName = call.name ?? '';
        const toolCallId = call.id ?? `${context.runId ?? context.traceId}:tool:${steps.length + 1}`;
        const started = performance.now();
        const toolResult = await runTool(adapter, callName, call.args, {
          context: scope.context, sink: options.sink, redaction: options.redaction, toolCallId, signal: options.signal,
        });
        const stepInfo: AgentStepInfo = {
          step: step + 1,
          call: { id: toolCallId, name: callName, args: call.args },
          result: toolResult,
          durationMs: Math.round(performance.now() - started),
          context: toolResult.context,
        };
        steps.push(stepInfo);
        options.onStep?.(stepInfo);
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
      scope.end(options.signal?.aborted ? 'cancelled' : 'error', undefined, error);
      throw error;
    }
  }
  logEvent(MODULE, 'budget_exhausted', { model, maxSteps }, 'warn', options);
  return { text: '', contents, steps, totalSteps: maxSteps, stoppedReason: 'max_steps_exceeded', context, providerRequestId, usage };
}

const torchOutput: ToolPropertySchema = { type: 'OBJECT', properties: { on: { type: 'BOOLEAN' }, strobe: { type: 'BOOLEAN' } }, required: ['on', 'strobe'] };
const hapticOutput: ToolPropertySchema = { type: 'OBJECT', properties: { played: { type: 'STRING' } }, required: ['played'] };
const hilightOutput: ToolPropertySchema = { type: 'OBJECT', properties: { mode: { type: 'STRING' }, color: { type: 'STRING', nullable: true } }, required: ['mode'] };
const thermalOutput: ToolPropertySchema = { type: 'OBJECT', properties: {
  cpuHeadroom: { type: 'NUMBER', nullable: true }, gpuHeadroom: { type: 'NUMBER', nullable: true },
  thermalStatus: { type: 'STRING', nullable: true }, currentFps: { type: 'NUMBER', nullable: true },
}, required: ['cpuHeadroom', 'gpuHeadroom', 'thermalStatus', 'currentFps'] };
const barometerOutput: ToolPropertySchema = { type: 'OBJECT', properties: {
  altitudeM: { type: 'NUMBER', nullable: true }, pressureHpa: { type: 'NUMBER', nullable: true },
  verticalVelocityMps: { type: 'NUMBER', nullable: true }, trend: { type: 'STRING' },
}, required: ['altitudeM', 'pressureHpa', 'verticalVelocityMps', 'trend'] };
const thermometerOutput: ToolPropertySchema = { type: 'OBJECT', properties: {
  surfaceTemperatureC: { type: 'NUMBER', nullable: true }, surfaceTemperatureF: { type: 'NUMBER', nullable: true },
  ambientTemperatureC: { type: 'NUMBER', nullable: true }, mode: { type: 'STRING' },
}, required: ['surfaceTemperatureC', 'surfaceTemperatureF', 'ambientTemperatureC', 'mode'] };
const batteryShareOutput: ToolPropertySchema = { type: 'OBJECT', properties: { isSupported: { type: 'BOOLEAN' }, isActive: { type: 'BOOLEAN' } }, required: ['isSupported', 'isActive'] };
const batteryOutput: ToolPropertySchema = { type: 'OBJECT', properties: {
  stateOfHealthPercent: { type: 'NUMBER', nullable: true }, cycleCount: { type: 'INTEGER', nullable: true },
  chargingTier: { type: 'STRING', nullable: true }, chargingWattage: { type: 'NUMBER', nullable: true },
}, required: ['stateOfHealthPercent', 'cycleCount', 'chargingTier', 'chargingWattage'] };
const wifiOutput: ToolPropertySchema = { type: 'OBJECT', properties: {
  isSupported: { type: 'BOOLEAN' }, isMloActive: { type: 'BOOLEAN' }, aggregateSpeedMbps: { type: 'NUMBER', nullable: true },
  links: { type: 'ARRAY', items: { type: 'OBJECT', properties: {
    band: { type: 'STRING' }, rssi: { type: 'NUMBER' }, rxLinkSpeedMbps: { type: 'NUMBER' }, txLinkSpeedMbps: { type: 'NUMBER' },
  }, required: ['band', 'rssi', 'rxLinkSpeedMbps', 'txLinkSpeedMbps'] } },
}, required: ['isSupported', 'isMloActive', 'aggregateSpeedMbps', 'links'] };
const available = (): CapabilityAvailability => ({ available: true });
const unavailable = (reason: string): CapabilityAvailability => ({ available: false, reason });

export function createHardwareCapabilityAdapter(
  hardware: HardwareContext,
  authorizeEffect?: EffectPolicyGateway,
  provider = 'pixelkit-native',
): CapabilityAdapter {
  const tools: CapabilityTool[] = [
    {
      name: 'set_torch', description: 'Turn the rear camera-bar LED flashlight on or off, optionally as an emergency SOS strobe.',
      inputSchema: { type: 'OBJECT', properties: { on: { type: 'BOOLEAN' }, strobe: { type: 'BOOLEAN' } }, required: ['on'] },
      outputSchema: torchOutput, effect: 'effect', risk: 'medium', availability: () => hardware.torch ? available() : unavailable('torch_hardware_unavailable'),
      execute: async (value: unknown) => {
        const { on, strobe } = value as { on: boolean; strobe?: boolean };
        const torch = hardware.torch!;
        if (strobe) { await torch.startStrobe(); return { on: true, strobe: true }; }
        if (torch.isStrobing) await torch.stopStrobe();
        if (on !== torch.isTorchOn) await torch.toggleTorch();
        return { on, strobe: false };
      },
    },
    {
      name: 'play_haptic', description: 'Play a tactile vibration pattern on the Pixel haptic actuator.',
      inputSchema: { type: 'OBJECT', properties: { pattern: { type: 'STRING', enum: ['selection', 'light', 'medium', 'heavy', 'success', 'warning', 'error'] } }, required: ['pattern'] },
      outputSchema: hapticOutput, effect: 'effect', risk: 'low', availability: () => hardware.haptics ? available() : unavailable('haptics_hardware_unavailable'),
      execute: async value => { const pattern = (value as { pattern: 'selection' | 'light' | 'medium' | 'heavy' | 'success' | 'warning' | 'error' }).pattern; await hardware.haptics!.triggerHaptic(pattern); return { played: pattern }; },
    },
    {
      name: 'set_hilight', description: 'Set the rear camera-bar HiLight LED ring colour and animation mode.',
      inputSchema: { type: 'OBJECT', properties: { mode: { type: 'STRING' }, color: { type: 'STRING' } }, required: ['mode'] },
      outputSchema: hilightOutput, effect: 'effect', risk: 'low', availability: () => hardware.hilight ? available() : unavailable('hilight_hardware_unavailable'),
      execute: async value => { const { mode, color } = value as { mode: string; color?: string }; if (color) await hardware.hilight!.setColor(color); await hardware.hilight!.setMode(mode); return { mode, color: color ?? hardware.hilight!.currentColor }; },
    },
    {
      name: 'get_thermal_headroom', description: 'Read ADPF CPU/GPU headroom and thermal throttling status.',
      inputSchema: { type: 'OBJECT', properties: {} }, outputSchema: thermalOutput, effect: 'read', risk: 'low', onDevice: true,
      availability: () => hardware.adpf ? available() : unavailable('adpf_unavailable'), execute: () => ({ ...hardware.adpf! }),
    },
    {
      name: 'get_barometer', description: 'Read barometric altitude, pressure, vertical velocity, and pressure trend.',
      inputSchema: { type: 'OBJECT', properties: {} }, outputSchema: barometerOutput, effect: 'read', risk: 'low', onDevice: true,
      availability: () => hardware.altimeter ? available() : unavailable('barometer_unavailable'),
      execute: () => ({ altitudeM: hardware.altimeter!.altitudeM, pressureHpa: hardware.altimeter!.pressureHpa, verticalVelocityMps: hardware.altimeter!.verticalVelocityMps, trend: hardware.altimeter!.trend }),
    },
    {
      name: 'get_thermometer', description: 'Read non-contact infrared surface and ambient temperature.',
      inputSchema: { type: 'OBJECT', properties: {} }, outputSchema: thermometerOutput, effect: 'read', risk: 'low', onDevice: true,
      availability: () => hardware.thermometer?.isSupported ? available() : unavailable('fir_thermometer_unsupported'),
      execute: () => ({ surfaceTemperatureC: hardware.thermometer!.surfaceTemperatureC, surfaceTemperatureF: hardware.thermometer!.surfaceTemperatureF, ambientTemperatureC: hardware.thermometer!.ambientTemperatureC, mode: hardware.thermometer!.mode }),
    },
    {
      name: 'set_battery_share', description: 'Enable or disable reverse wireless power sharing.',
      inputSchema: { type: 'OBJECT', properties: { enabled: { type: 'BOOLEAN' } }, required: ['enabled'] }, outputSchema: batteryShareOutput,
      effect: 'effect', risk: 'medium', availability: () => hardware.batteryShare?.isSupported ? available() : unavailable('battery_share_unsupported'),
      execute: async value => { const enabled = (value as { enabled: boolean }).enabled; const success = await hardware.batteryShare!.setBatteryShare(enabled); return { isSupported: true, isActive: success ? enabled : hardware.batteryShare!.isActive }; },
    },
    {
      name: 'get_battery_health', description: 'Read battery cycle count, health, charging wattage, and speed tier.',
      inputSchema: { type: 'OBJECT', properties: {} }, outputSchema: batteryOutput, effect: 'read', risk: 'low', onDevice: true,
      availability: () => hardware.charging ? available() : unavailable('charging_intelligence_unavailable'), execute: () => ({ ...hardware.charging! }),
    },
    {
      name: 'get_wifi7_status', description: 'Read Wi-Fi 7 Multi-Link Operation bonded links and throughput.',
      inputSchema: { type: 'OBJECT', properties: {} }, outputSchema: wifiOutput, effect: 'read', risk: 'low', onDevice: true,
      availability: () => hardware.wifi7?.isSupported ? available() : unavailable('wifi7_mlo_unsupported'),
      execute: () => ({ isSupported: true, isMloActive: hardware.wifi7!.isMloActive, aggregateSpeedMbps: hardware.wifi7!.aggregateSpeedMbps, links: hardware.wifi7!.links }),
    },
  ];
  return createCapabilityAdapter({ provider, tools, authorizeEffect });
}
