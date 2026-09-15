/**
 * @file useCloudHardwareAgent.ts
 * @description React hook for autonomous multi-turn cloud hardware reasoning loops
 * using Google Gen AI SDK (`@google/genai`) and the unified PixelKit hardware tool registry.
 *
 * Adheres to the Zero-Simulation Principle: reports source: 'unavailable' and returns an
 * error if no Gemini API key is configured.
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import type { Content, GoogleGenAI } from '@google/genai';
import {
  runCloudAgent,
  DEFAULT_AGENT_MODEL,
  DEFAULT_MAX_STEPS,
  type AgentStepInfo,
  type CloudAgentOptions,
  type CloudAgentResult,
} from './agent/cloudAgent';
import { getStoredApiKey, createGeminiClient } from './geminiClient';
import { logEvent, logError, recordMetric, type TelemetrySource } from '../core/observability';

const MODULE = 'useCloudHardwareAgent';

export interface CloudHardwareAgentTelemetry {
  /** Whether the agent reasoning loop is actively executing multi-turn tool steps. */
  isRunning: boolean;
  /** Ordered list of tool execution steps taken by the model during the latest execution. */
  steps: AgentStepInfo[];
  /** Latest response text returned by the agent. */
  lastResponse: string | null;
  /** Complete result payload of the last agent execution including stop reason. */
  lastResult: CloudAgentResult | null;
  /** Full conversation turn history with model tool calls and function outputs. */
  history: Content[];
  /** Error message if agent initialization, network, or execution failed. */
  error: string | null;
  /** Provenance of the data: 'hardware' when an API key is present, or 'unavailable'. */
  source: TelemetrySource;
  /** Dispatches an autonomous reasoning prompt with multi-turn tool execution. */
  ask: (prompt: string, customOptions?: CloudAgentOptions) => Promise<CloudAgentResult | null>;
  /** Resets the agent memory, step history, and conversation state. */
  reset: () => void;
}

export function useCloudHardwareAgent(defaultOptions: CloudAgentOptions = {}): CloudHardwareAgentTelemetry {
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [steps, setSteps] = useState<AgentStepInfo[]>([]);
  const [lastResponse, setLastResponse] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<CloudAgentResult | null>(null);
  const [history, setHistory] = useState<Content[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [apiKey, setApiKey] = useState<string | null>(null);

  const clientRef = useRef<GoogleGenAI | null>(null);

  useEffect(() => {
    getStoredApiKey().then(k => {
      setApiKey(k);
      if (k) {
        clientRef.current = createGeminiClient(k);
      }
    });
  }, []);

  const reset = useCallback(() => {
    setSteps([]);
    setLastResponse(null);
    setLastResult(null);
    setHistory([]);
    setError(null);
    setIsRunning(false);
    logEvent(MODULE, 'reset', {});
  }, []);

  const ask = useCallback(
    async (prompt: string, customOptions?: CloudAgentOptions): Promise<CloudAgentResult | null> => {
      const q = prompt.trim();
      if (!q) return null;

      let key = apiKey;
      if (!key) {
        key = await getStoredApiKey();
        if (key) {
          setApiKey(key);
          clientRef.current = createGeminiClient(key);
        }
      }

      if (!key || !clientRef.current) {
        const msg = 'No Gemini API key configured. Store an API key to use autonomous cloud hardware agents.';
        setError(msg);
        logError(MODULE, 'no_api_key', { message: msg });
        return null;
      }

      setIsRunning(true);
      setError(null);
      setSteps([]);
      const start = performance.now();
      logEvent(MODULE, 'start_agent_loop', { prompt: q });

      try {
        const mergedOptions: CloudAgentOptions = {
          ...defaultOptions,
          ...customOptions,
          onStep: (stepInfo: AgentStepInfo) => {
            setSteps(prev => [...prev, stepInfo]);
            defaultOptions.onStep?.(stepInfo);
            customOptions?.onStep?.(stepInfo);
          },
        };

        const result = await runCloudAgent(clientRef.current, q, history, mergedOptions);
        const durationMs = Math.round(performance.now() - start);

        setLastResult(result);
        setLastResponse(result.text);
        setHistory(result.contents);
        recordMetric(MODULE, 'agent_loop_duration', durationMs, 'hardware');
        logEvent(MODULE, 'agent_loop_completed', {
          stepsCount: result.steps.length,
          stoppedReason: result.stoppedReason,
          durationMs,
        });

        return result;
      } catch (err: any) {
        const msg = err?.message || String(err);
        setError(msg);
        logError(MODULE, 'agent_loop_failed', { message: msg });
        return null;
      } finally {
        setIsRunning(false);
      }
    },
    [apiKey, defaultOptions, history],
  );

  const source: TelemetrySource = apiKey ? 'hardware' : 'unavailable';

  return {
    isRunning,
    steps,
    lastResponse,
    lastResult,
    history,
    error,
    source,
    ask,
    reset,
  };
}
