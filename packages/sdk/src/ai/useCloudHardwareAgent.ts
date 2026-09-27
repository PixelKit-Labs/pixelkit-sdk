/** React state around the explicit-capability cloud agent loop. */
import { useState, useCallback, useEffect, useRef } from 'react';
import type { Content, GoogleGenAI } from '@google/genai';
import {
  runCloudAgent,
  type AgentStepInfo,
  type CloudAgentOptions,
  type CloudAgentResult,
} from './agent/cloudAgent';
import { getStoredApiKey, createGeminiClient } from './geminiClient';
import { logError, logEvent, recordMetric, type TelemetrySource } from '../core/observability';

const MODULE = 'useCloudHardwareAgent';

type CloudAgentDefaults = Partial<Omit<CloudAgentOptions, 'capabilityAdapter' | 'context' | 'sink' | 'redaction' | 'signal'>>;

export interface CloudHardwareAgentTelemetry {
  isRunning: boolean;
  steps: AgentStepInfo[];
  lastResponse: string | null;
  lastResult: CloudAgentResult | null;
  history: Content[];
  error: string | null;
  source: TelemetrySource;
  ask: (prompt: string, run: CloudAgentOptions) => Promise<CloudAgentResult | null>;
  reset: () => void;
}

export function useCloudHardwareAgent(defaultOptions: CloudAgentDefaults = {}): CloudHardwareAgentTelemetry {
  const [isRunning, setIsRunning] = useState(false);
  const [steps, setSteps] = useState<AgentStepInfo[]>([]);
  const [lastResponse, setLastResponse] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<CloudAgentResult | null>(null);
  const [history, setHistory] = useState<Content[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [apiKey, setApiKey] = useState<string | null>(null);
  const clientRef = useRef<GoogleGenAI | null>(null);

  useEffect(() => {
    void getStoredApiKey().then(key => {
      setApiKey(key);
      if (key) clientRef.current = createGeminiClient(key);
    });
  }, []);

  const reset = useCallback(() => {
    setSteps([]);
    setLastResponse(null);
    setLastResult(null);
    setHistory([]);
    setError(null);
    setIsRunning(false);
  }, []);

  const ask = useCallback(async (prompt: string, run: CloudAgentOptions): Promise<CloudAgentResult | null> => {
    const value = prompt.trim();
    if (!value) return null;
    const adapter = run.capabilityAdapter;
    if (!adapter || adapter.tools.length === 0) {
      const result: CloudAgentResult = {
        text: '', contents: history, steps: [], totalSteps: 0,
        stoppedReason: 'unavailable', context: run.context,
        unavailableReason: 'capability_adapter_empty',
      };
      setLastResult(result);
      setLastResponse(null);
      setError(result.unavailableReason!);
      logEvent(MODULE, 'unavailable', { reason: result.unavailableReason }, 'warn', run);
      return result;
    }

    let key = apiKey;
    if (!key) {
      key = await getStoredApiKey();
      if (key) {
        setApiKey(key);
        clientRef.current = createGeminiClient(key);
      }
    }
    if (!key || !clientRef.current) {
      const result: CloudAgentResult = {
        text: '', contents: history, steps: [], totalSteps: 0,
        stoppedReason: 'unavailable', context: run.context,
        unavailableReason: 'gemini_api_key_unavailable',
      };
      setLastResult(result);
      setLastResponse(null);
      setError(result.unavailableReason!);
      logEvent(MODULE, 'unavailable', { reason: result.unavailableReason }, 'warn', run);
      return result;
    }

    setIsRunning(true);
    setError(null);
    setSteps([]);
    const started = performance.now();
    logEvent(MODULE, 'request_accepted', {
      capabilityProvider: adapter.provider,
      model: run.model ?? defaultOptions.model,
    }, 'info', run);
    try {
      const options: CloudAgentOptions = {
        ...defaultOptions,
        ...run,
        capabilityAdapter: adapter,
        context: run.context,
        onStep: step => {
          setSteps(previous => [...previous, step]);
          defaultOptions.onStep?.(step);
          run.onStep?.(step);
        },
      };
      const result = await runCloudAgent(clientRef.current, value, history, options);
      const durationMs = Math.round(performance.now() - started);
      setLastResult(result);
      setLastResponse(result.text || null);
      setHistory(result.contents);
      recordMetric(MODULE, 'agentLoopMs', durationMs, 'hardware', run);
      logEvent(MODULE, 'completed', {
        stepsCount: result.steps.length,
        stoppedReason: result.stoppedReason,
        providerRequestId: result.providerRequestId,
        ...(result.usage ? { usage: result.usage } : {}),
      }, 'info', run);
      return result;
    } catch (cause) {
      const normalized = logError(MODULE, 'failed', cause, undefined, run);
      setError(normalized.message);
      return null;
    } finally {
      setIsRunning(false);
    }
  }, [apiKey, defaultOptions, history]);

  return {
    isRunning, steps, lastResponse, lastResult, history, error,
    source: apiKey ? 'hardware' : 'unavailable', ask, reset,
  };
}
