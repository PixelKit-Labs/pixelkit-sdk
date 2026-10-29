/**
 * @file useGenAITasks.ts
 * @description On-device text and image tasks through the PixelNano native module.
 * - Summarization, proofreading, rewriting: the ML Kit GenAI task model is used when it is available;
 *   when it is not (or it throws) the module falls back to a Gemini Nano prompt. Each result's
 *   `engine` field says which path produced it.
 * - Image description: a Gemini Nano multimodal prompt; `engine` is reported on the result.
 *
 * AICore decides where inference runs; this hook does not select or report the processor.
 */

import { useState, useCallback } from 'react';
import PixelNano, {
  type SummarizeOptions,
  type SummarizeResult,
  type ProofreadResult,
  type RewriteResult,
  type ImageDescriptionResult,
} from '@pixelkit-labs/mlkit';
import { logEvent, recordMetric, type TelemetrySource } from '../core/observability';

const MODULE = 'useGenAITasks';

export type TaskTone = 'elaborate' | 'emojify' | 'shorten' | 'friendly' | 'professional' | 'rephrase';

export function useGenAITasks() {
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const [summaryResult, setSummaryResult] = useState<SummarizeResult | null>(null);
  const [proofreadResult, setProofreadResult] = useState<ProofreadResult | null>(null);
  const [rewriteResult, setRewriteResult] = useState<RewriteResult | null>(null);
  const [imageDescriptionResult, setImageDescriptionResult] = useState<ImageDescriptionResult | null>(null);

  // 'hardware' only after a task has produced a result; the native module being linked says nothing
  // about whether AICore can serve the tasks.
  const source: TelemetrySource =
    PixelNano && (summaryResult != null || proofreadResult != null || rewriteResult != null || imageDescriptionResult != null)
      ? 'hardware'
      : 'unavailable';

  /**
   * Summarizes an article or chat transcript on-device using AICore.
   */
  const summarize = useCallback(
    async (text: string, options?: SummarizeOptions): Promise<SummarizeResult | null> => {
      if (!PixelNano) {
        setError('PixelNano module is unavailable in this environment');
        return null;
      }
      setIsRunning(true);
      setError(null);
      try {
        const res = await PixelNano.summarize(text, options);
        setSummaryResult(res);
        recordMetric(MODULE, 'summarizeLatencyMs', res.latencyMs, 'hardware');
        logEvent(MODULE, 'summarize', { latencyMs: res.latencyMs, engine: res.engine });
        return res;
      } catch (e: any) {
        const msg = e?.message ?? 'Summarization failed';
        setError(msg);
        logEvent(MODULE, 'summarize error', { message: msg }, 'error');
        return null;
      } finally {
        setIsRunning(false);
      }
    },
    []
  );

  /**
   * Proofreads text on-device, returning corrected text and improvement suggestions.
   */
  const proofread = useCallback(async (text: string): Promise<ProofreadResult | null> => {
    if (!PixelNano) {
      setError('PixelNano module is unavailable in this environment');
      return null;
    }
    setIsRunning(true);
    setError(null);
    try {
      const res = await PixelNano.proofread(text);
      setProofreadResult(res);
      recordMetric(MODULE, 'proofreadLatencyMs', res.latencyMs, 'hardware');
      logEvent(MODULE, 'proofread', { latencyMs: res.latencyMs, engine: res.engine });
      return res;
    } catch (e: any) {
      const msg = e?.message ?? 'Proofreading failed';
      setError(msg);
      logEvent(MODULE, 'proofread error', { message: msg }, 'error');
      return null;
    } finally {
      setIsRunning(false);
    }
  }, []);

  /**
   * Rewrites text into the specified tone or style on-device.
   */
  const rewrite = useCallback(
    async (text: string, tone: TaskTone = 'professional'): Promise<RewriteResult | null> => {
      if (!PixelNano) {
        setError('PixelNano module is unavailable in this environment');
        return null;
      }
      setIsRunning(true);
      setError(null);
      try {
        const res = await PixelNano.rewrite(text, tone);
        setRewriteResult(res);
        recordMetric(MODULE, 'rewriteLatencyMs', res.latencyMs, 'hardware');
        logEvent(MODULE, 'rewrite', { tone, latencyMs: res.latencyMs, engine: res.engine });
        return res;
      } catch (e: any) {
        const msg = e?.message ?? 'Rewriting failed';
        setError(msg);
        logEvent(MODULE, 'rewrite error', { message: msg }, 'error');
        return null;
      } finally {
        setIsRunning(false);
      }
    },
    []
  );

  /**
   * Describes an image (base64 or file uri) on-device using local multimodal capabilities.
   */
  const describeImage = useCallback(
    async (
      imageInput: string,
      style: 'detailed' | 'caption' | 'labels' | 'concise' = 'concise'
    ): Promise<ImageDescriptionResult | null> => {
      if (!PixelNano) {
        setError('PixelNano module is unavailable in this environment');
        return null;
      }
      setIsRunning(true);
      setError(null);
      try {
        const res = await PixelNano.describeImage(imageInput, style);
        setImageDescriptionResult(res);
        recordMetric(MODULE, 'describeImageLatencyMs', res.latencyMs, 'hardware');
        logEvent(MODULE, 'describeImage', { style, latencyMs: res.latencyMs, engine: res.engine });
        return res;
      } catch (e: any) {
        const msg = e?.message ?? 'Image description failed';
        setError(msg);
        logEvent(MODULE, 'describeImage error', { message: msg }, 'error');
        return null;
      } finally {
        setIsRunning(false);
      }
    },
    []
  );

  return {
    isRunning,
    error,
    source,
    summaryResult,
    proofreadResult,
    rewriteResult,
    imageDescriptionResult,
    summarize,
    proofread,
    rewrite,
    describeImage,
  };
}
