/**
 * @file registry.ts
 * @description Unified Hardware Tool Registry for Google Gen AI SDK (`@google/genai`)
 * and the Google Agent Development Kit (ADK). Converts strongly-typed parameter definitions into Gemini
 * FunctionDeclaration schemas, validates arguments, and executes tools with structured observability.
 * Also includes the autonomous multi-turn cloud agent loop (runCloudAgent).
 */

import { FunctionCallingConfigMode, Type, type Content, type FunctionDeclaration, type GoogleGenAI, type Schema } from '@google/genai';

const MODULE = 'ToolRegistry';

export type ToolType = 'STRING' | 'NUMBER' | 'INTEGER' | 'BOOLEAN' | 'ARRAY' | 'OBJECT';

export interface ToolPropertySchema {
  type: ToolType;
  description?: string;
  enum?: string[];
  nullable?: boolean;
  properties?: Record<string, ToolPropertySchema>;
  items?: ToolPropertySchema;
  required?: string[];
}

export interface ToolParametersSchema {
  type: 'OBJECT';
  properties: Record<string, ToolPropertySchema>;
  required?: string[];
  description?: string;
}

export interface ToolDef<I = any, O = any> {
  /** Unique snake_case name the AI model references (e.g. 'set_torch', 'get_thermal_headroom'). */
  name: string;
  /** One clear, imperative sentence describing what the tool does. */
  description: string;
  /** Input parameter schema. */
  parameters: ToolParametersSchema;
  /** Async or sync execution handler receiving validated parameters. */
  execute: (args: I) => Promise<O> | O;
  /** Set false to hide from lightweight models with limited context. */
  onDevice?: boolean;
}

export interface ToolExecutionResult {
  ok: boolean;
  result?: unknown;
  error?: string;
  issues?: string[];
}

export interface HardwareContext {
  torch?: {
    isTorchOn: boolean;
    isStrobing: boolean;
    toggleTorch: () => Promise<void>;
    startStrobe: () => Promise<void>;
    stopStrobe: () => Promise<void>;
  };
  haptics?: {
    triggerHaptic: (
      pattern: 'selection' | 'light' | 'medium' | 'heavy' | 'success' | 'warning' | 'error',
    ) => Promise<void>;
  };
  hilight?: {
    mode: string;
    currentColor: string;
    setMode: (mode: any) => Promise<void> | void;
    setColor: (color: string) => Promise<void> | void;
  };
  adpf?: {
    cpuHeadroom: number | null;
    gpuHeadroom: number | null;
    thermalStatus: string | null;
    currentFps: number | null;
  };
  altimeter?: {
    altitudeM: number | null;
    pressureHpa: number | null;
    verticalVelocityMps: number | null;
    trend: string;
    calibrateSeaLevel: (hpa: number) => void;
  };
  batteryShare?: {
    isSupported: boolean;
    isActive: boolean;
    isReceiverDetected: boolean;
    transmittedWatts: number | null;
    setBatteryShare: (enabled: boolean) => Promise<boolean>;
  };
  thermometer?: {
    isSupported: boolean;
    surfaceTemperatureC: number | null;
    surfaceTemperatureF: number | null;
    ambientTemperatureC: number | null;
    mode: string;
  };
  charging?: {
    stateOfHealthPercent: number | null;
    cycleCount: number | null;
    chargingTier: string | null;
    chargingWattage: number | null;
  };
  wifi7?: {
    isSupported: boolean;
    isMloActive: boolean;
    aggregateSpeedMbps: number | null;
    links: Array<{ band: string; rssi: number; rxLinkSpeedMbps: number; txLinkSpeedMbps: number }>;
  };
}

export const DEFAULT_AGENT_MODEL = 'gemini-3.8-flash';
export const DEFAULT_MAX_STEPS = 6;

export interface AgentStepInfo {
  step: number;
  call: { id?: string; name: string; args: any };
  result: unknown;
  durationMs: number;
}

export interface CloudAgentOptions {
  /** Model to use for reasoning, defaults to 'gemini-3.8-flash' */
  model?: string;
  /** System instruction prompt guiding agent behavior and personality */
  systemInstruction?: string;
  /** Maximum number of tool execution turns before stopping (prevents runaway loops) */
  maxSteps?: number;
  /** Sampling temperature, lower (0.2) is recommended for deterministic tool calling */
  temperature?: number;
  /** Specific subset of tools to make available; defaults to listTools() */
  tools?: ToolDef[];
  /** Callback fired as each tool executes for live UI streaming or logging */
  onStep?: (step: AgentStepInfo) => void;
}

export interface CloudAgentResult {
  text: string;
  contents: Content[];
  steps: AgentStepInfo[];
  totalSteps: number;
  stoppedReason: 'completed' | 'max_steps_exceeded';
}

const toolsMap = new Map<string, ToolDef>();

function log(event: string, data?: Record<string, unknown>, level: 'info' | 'warn' | 'error' = 'info'): void {
  const prefix = `[PixelKit] ${MODULE}: ${event}`;
  if (level === 'error') {
    console.error(prefix, data ? JSON.stringify(data) : '');
  } else if (level === 'warn') {
    console.warn(prefix, data ? JSON.stringify(data) : '');
  } else {
    console.log(prefix, data ? JSON.stringify(data) : '');
  }
}

/**
 * Registers a tool definition in the global registry.
 */
export function defineTool<I = any, O = any>(def: ToolDef<I, O>): ToolDef<I, O> {
  toolsMap.set(def.name, def as ToolDef);
  return def;
}

/**
 * Retrieves a tool by its registered name.
 */
export function getTool(name: string): ToolDef | undefined {
  return toolsMap.get(name);
}

/**
 * Lists all registered tools, optionally filtering for on-device friendly tools.
 */
export function listTools(opts?: { onDevice?: boolean }): ToolDef[] {
  return [...toolsMap.values()].filter(t => (opts?.onDevice ? t.onDevice !== false : true));
}

/**
 * Clears the registry (useful for test resets).
 */
export function clearTools(): void {
  toolsMap.clear();
}

/**
 * Validates incoming arguments against a ToolParametersSchema without external dependencies.
 */
export function validateParameters(
  schema: ToolParametersSchema,
  args: unknown,
): { success: true; data: any } | { success: false; issues: string[] } {
  if (typeof args !== 'object' || args === null || Array.isArray(args)) {
    return { success: false, issues: ['Arguments must be a valid JSON object'] };
  }

  const issues: string[] = [];
  const obj = args as Record<string, any>;

  // Check required fields
  if (schema.required) {
    for (const req of schema.required) {
      if (obj[req] === undefined || obj[req] === null) {
        issues.push(`Missing required parameter: '${req}'`);
      }
    }
  }

  // Validate declared properties
  for (const [propName, propDef] of Object.entries(schema.properties)) {
    const val = obj[propName];
    if (val === undefined) continue;

    if (val === null) {
      if (!propDef.nullable) {
        issues.push(`Parameter '${propName}' cannot be null`);
      }
      continue;
    }

    switch (propDef.type) {
      case 'STRING':
        if (typeof val !== 'string') issues.push(`Parameter '${propName}' must be a string`);
        break;
      case 'NUMBER':
      case 'INTEGER':
        if (typeof val !== 'number' || Number.isNaN(val)) issues.push(`Parameter '${propName}' must be a number`);
        break;
      case 'BOOLEAN':
        if (typeof val !== 'boolean') issues.push(`Parameter '${propName}' must be a boolean`);
        break;
      case 'ARRAY':
        if (!Array.isArray(val)) issues.push(`Parameter '${propName}' must be an array`);
        break;
      case 'OBJECT':
        if (typeof val !== 'object' || Array.isArray(val)) issues.push(`Parameter '${propName}' must be an object`);
        break;
    }

    if (propDef.enum && propDef.enum.length > 0) {
      if (!propDef.enum.includes(val)) {
        issues.push(`Parameter '${propName}' must be one of [${propDef.enum.join(', ')}], got '${val}'`);
      }
    }
  }

  if (issues.length > 0) {
    return { success: false, issues };
  }

  return { success: true, data: obj };
}

/**
 * Converts a ToolPropertySchema into a Google Gen AI Schema.
 */
function convertPropertyToGeminiSchema(prop: ToolPropertySchema): Schema {
  const typeMap: Record<ToolType, Type> = {
    STRING: Type.STRING,
    NUMBER: Type.NUMBER,
    INTEGER: Type.INTEGER,
    BOOLEAN: Type.BOOLEAN,
    ARRAY: Type.ARRAY,
    OBJECT: Type.OBJECT,
  };

  const geminiSchema: Schema = {
    type: typeMap[prop.type] || Type.STRING,
    description: prop.description,
    nullable: prop.nullable,
  };

  if (prop.enum && prop.enum.length > 0) {
    geminiSchema.enum = prop.enum;
  }

  if (prop.type === 'ARRAY' && prop.items) {
    geminiSchema.items = convertPropertyToGeminiSchema(prop.items);
  }

  if (prop.type === 'OBJECT' && prop.properties) {
    const properties: Record<string, Schema> = {};
    for (const [key, child] of Object.entries(prop.properties)) {
      properties[key] = convertPropertyToGeminiSchema(child);
    }
    geminiSchema.properties = properties;
    if (prop.required) {
      geminiSchema.required = prop.required;
    }
  }

  return geminiSchema;
}

/**
 * Converts a ToolParametersSchema into a root Gemini Schema.
 */
export function toGeminiParametersSchema(params: ToolParametersSchema): Schema {
  const properties: Record<string, Schema> = {};
  for (const [key, prop] of Object.entries(params.properties)) {
    properties[key] = convertPropertyToGeminiSchema(prop);
  }
  return {
    type: Type.OBJECT,
    description: params.description,
    properties,
    required: params.required || [],
  };
}

/**
 * Converts registered tools into Google Gen AI SDK FunctionDeclarations.
 */
export function toFunctionDeclarations(defs: ToolDef[] = listTools()): FunctionDeclaration[] {
  return defs.map(t => ({
    name: t.name,
    description: t.description,
    parameters: toGeminiParametersSchema(t.parameters),
  }));
}

/**
 * Validates arguments and executes a tool with observability.
 * Never throws — returns a structured JSON-serializable result for the model.
 */
export async function runTool(name: string, rawArgs: unknown): Promise<ToolExecutionResult> {
  const t = getTool(name);
  if (!t) {
    log('unknown_tool', { name }, 'warn');
    return { ok: false, error: `unknown_tool:${name}` };
  }

  const validation = validateParameters(t.parameters, rawArgs ?? {});
  if (!validation.success) {
    log('invalid_arguments', { name, issues: validation.issues }, 'warn');
    return { ok: false, error: 'invalid_arguments', issues: validation.issues };
  }

  const start = performance.now();
  try {
    const result = await t.execute(validation.data);
    const durationMs = Math.round(performance.now() - start);
    log('tool_executed', { name, durationMs }, 'info');
    return { ok: true, result };
  } catch (err: any) {
    const message = err?.message || String(err);
    log('tool_failed', { name, message }, 'error');
    return { ok: false, error: message || 'tool_failed' };
  }
}

/**
 * Executes a multi-turn autonomous agent loop with Gemini and PixelKit hardware tools.
 */
export async function runCloudAgent(
  ai: GoogleGenAI,
  prompt: string,
  history: Content[] = [],
  options: CloudAgentOptions = {},
): Promise<CloudAgentResult> {
  const model = options.model ?? DEFAULT_AGENT_MODEL;
  const maxSteps = options.maxSteps ?? DEFAULT_MAX_STEPS;
  const temperature = options.temperature ?? 0.2;
  const systemInstruction = options.systemInstruction;
  const toolDefs = options.tools ?? listTools();
  const tools = [{ functionDeclarations: toFunctionDeclarations(toolDefs) }];

  const contents: Content[] = [...history, { role: 'user', parts: [{ text: prompt }] }];
  const steps: AgentStepInfo[] = [];

  for (let step = 0; step < maxSteps; step++) {
    const res = await ai.models.generateContent({
      model,
      contents,
      config: {
        systemInstruction,
        tools,
        toolConfig: { functionCallingConfig: { mode: FunctionCallingConfigMode.AUTO } },
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
        text: res.text ?? '',
        contents,
        steps,
        totalSteps: step,
        stoppedReason: 'completed',
      };
    }

    for (const call of calls) {
      const callName = call.name ?? '';
      const start = performance.now();
      const toolRes = await runTool(callName, call.args);
      const durationMs = Math.round(performance.now() - start);

      const stepInfo: AgentStepInfo = {
        step: step + 1,
        call: { id: call.id, name: callName, args: call.args },
        result: toolRes,
        durationMs,
      };
      steps.push(stepInfo);
      options.onStep?.(stepInfo);
    }

    contents.push({
      role: 'user',
      parts: calls.map((c, i) => ({
        functionResponse: {
          id: c.id,
          name: c.name ?? '',
          response: steps[steps.length - calls.length + i].result as Record<string, unknown>,
        },
      })),
    });
  }

  return {
    text: 'Stopped: maximum tool steps exceeded.',
    contents,
    steps,
    totalSteps: maxSteps,
    stoppedReason: 'max_steps_exceeded',
  };
}

/**
 * Registers PixelKit hardware hooks into the tool registry.
 * Safe to call whenever component hardware context updates.
 */
export function registerHardwareTools(h: HardwareContext): void {
  // 1. Rear Camera-Bar Torch Actuator
  defineTool({
    name: 'set_torch',
    description: 'Turn the rear camera-bar LED flashlight on or off, optionally as an emergency SOS strobe.',
    parameters: {
      type: 'OBJECT',
      properties: {
        on: { type: 'BOOLEAN', description: 'True to turn on, false to turn off' },
        strobe: { type: 'BOOLEAN', description: 'Enable SOS flashing strobe pattern' },
      },
      required: ['on'],
    },
    execute: async ({ on, strobe }: { on: boolean; strobe?: boolean }) => {
      if (!h.torch) return { ok: false, error: 'torch_hardware_unavailable' };
      if (strobe) {
        await h.torch.startStrobe();
        return { on: true, strobe: true };
      }
      if (h.torch.isStrobing) {
        await h.torch.stopStrobe();
      }
      if (on !== h.torch.isTorchOn) {
        await h.torch.toggleTorch();
      }
      return { on, strobe: false };
    },
  });

  // 2. Linear Resonant Haptic Actuator
  defineTool({
    name: 'play_haptic',
    description: 'Play a tactile vibration pattern on the Google Pixel linear resonant haptic actuator.',
    parameters: {
      type: 'OBJECT',
      properties: {
        pattern: {
          type: 'STRING',
          enum: ['selection', 'light', 'medium', 'heavy', 'success', 'warning', 'error'],
          description: 'The tactile vibration envelope to trigger',
        },
      },
      required: ['pattern'],
    },
    execute: async ({
      pattern,
    }: {
      pattern: 'selection' | 'light' | 'medium' | 'heavy' | 'success' | 'warning' | 'error';
    }) => {
      if (!h.haptics) return { ok: false, error: 'haptics_hardware_unavailable' };
      await h.haptics.triggerHaptic(pattern);
      return { played: pattern };
    },
  });

  // 3. Camera-Bar HiLight LED Ring Actuator
  defineTool({
    name: 'set_hilight',
    description: 'Set the rear camera-bar HiLight LED ring colour and animation mode.',
    parameters: {
      type: 'OBJECT',
      properties: {
        mode: {
          type: 'STRING',
          enum: ['off', 'glow', 'breathing', 'pulse', 'gemini_thinking', 'incoming_call', 'notification'],
          description: 'HiLight animation pattern',
        },
        color: {
          type: 'STRING',
          description: 'Hex color string formatted as #RRGGBB (e.g. #4285F4 for Google blue)',
        },
      },
      required: ['mode'],
    },
    execute: async ({ mode, color }: { mode: string; color?: string }) => {
      if (!h.hilight) return { ok: false, error: 'hilight_hardware_unavailable' };
      if (color) await h.hilight.setColor(color);
      await h.hilight.setMode(mode);
      return { mode, color: color ?? h.hilight.currentColor };
    },
  });

  // 4. ADPF Thermal Headroom & FPS Monitor
  defineTool({
    name: 'get_thermal_headroom',
    description: 'Read Android Dynamic Performance Framework (ADPF) CPU/GPU headroom and thermal throttling status.',
    parameters: {
      type: 'OBJECT',
      properties: {},
    },
    onDevice: true,
    execute: async () => {
      if (!h.adpf) return { ok: false, error: 'adpf_unavailable' };
      return {
        cpuHeadroom: h.adpf.cpuHeadroom,
        gpuHeadroom: h.adpf.gpuHeadroom,
        thermalStatus: h.adpf.thermalStatus,
        currentFps: h.adpf.currentFps,
      };
    },
  });

  // 5. ICAO Barometric Altimeter
  defineTool({
    name: 'get_barometer',
    description: 'Read ICAO barometric altitude, atmospheric pressure in hPa, vertical climb/descent rate, and pressure trend.',
    parameters: {
      type: 'OBJECT',
      properties: {},
    },
    onDevice: true,
    execute: async () => {
      if (!h.altimeter) return { ok: false, error: 'barometer_unavailable' };
      return {
        altitudeM: h.altimeter.altitudeM,
        pressureHpa: h.altimeter.pressureHpa,
        verticalVelocityMps: h.altimeter.verticalVelocityMps,
        trend: h.altimeter.trend,
      };
    },
  });

  // 6. Non-Contact FIR Thermometer
  defineTool({
    name: 'get_thermometer',
    description: 'Read non-contact infrared surface and ambient temperature from the MLX90632 sensor (Pixel Pro exclusive).',
    parameters: {
      type: 'OBJECT',
      properties: {},
    },
    onDevice: true,
    execute: async () => {
      if (!h.thermometer || !h.thermometer.isSupported) {
        return { isSupported: false, error: 'fir_thermometer_unsupported' };
      }
      return {
        isSupported: true,
        surfaceTemperatureC: h.thermometer.surfaceTemperatureC,
        surfaceTemperatureF: h.thermometer.surfaceTemperatureF,
        ambientTemperatureC: h.thermometer.ambientTemperatureC,
        mode: h.thermometer.mode,
      };
    },
  });

  // 7. Battery Share (Reverse Wireless Power) Actuator
  defineTool({
    name: 'set_battery_share',
    description: 'Enable or disable reverse wireless power sharing (Battery Share) to charge Qi-compatible accessories.',
    parameters: {
      type: 'OBJECT',
      properties: {
        enabled: { type: 'BOOLEAN', description: 'True to activate reverse charging, false to disable' },
      },
      required: ['enabled'],
    },
    execute: async ({ enabled }: { enabled: boolean }) => {
      if (!h.batteryShare || !h.batteryShare.isSupported) {
        return { isSupported: false, error: 'battery_share_unsupported' };
      }
      const success = await h.batteryShare.setBatteryShare(enabled);
      return { isSupported: true, isActive: success ? enabled : h.batteryShare.isActive };
    },
  });

  // 8. Battery Health & Charging Intelligence
  defineTool({
    name: 'get_battery_health',
    description: 'Read battery cycle count, state of health percentage, real-time charging wattage, and charging speed tier.',
    parameters: {
      type: 'OBJECT',
      properties: {},
    },
    onDevice: true,
    execute: async () => {
      if (!h.charging) return { ok: false, error: 'charging_intelligence_unavailable' };
      return {
        stateOfHealthPercent: h.charging.stateOfHealthPercent,
        cycleCount: h.charging.cycleCount,
        chargingTier: h.charging.chargingTier,
        chargingWattage: h.charging.chargingWattage,
      };
    },
  });

  // 9. Wi-Fi 7 Multi-Link Operation (MLO)
  defineTool({
    name: 'get_wifi7_status',
    description: 'Read Wi-Fi 7 Multi-Link Operation (MLO) bonded links across 2.4GHz, 5GHz, and 6GHz bands with aggregate throughput.',
    parameters: {
      type: 'OBJECT',
      properties: {},
    },
    onDevice: true,
    execute: async () => {
      if (!h.wifi7 || !h.wifi7.isSupported) {
        return { isSupported: false, error: 'wifi7_mlo_unsupported' };
      }
      return {
        isSupported: true,
        isMloActive: h.wifi7.isMloActive,
        aggregateSpeedMbps: h.wifi7.aggregateSpeedMbps,
        links: h.wifi7.links,
      };
    },
  });
}
