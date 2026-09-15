/**
 * @file cloudAgent.ts
 * @description Autonomous multi-turn function calling agent loop for Google Gen AI SDK (`@google/genai`).
 */

export {
  runCloudAgent,
  DEFAULT_AGENT_MODEL,
  DEFAULT_MAX_STEPS,
  type AgentStepInfo,
  type CloudAgentOptions,
  type CloudAgentResult,
} from '../tools/registry';
