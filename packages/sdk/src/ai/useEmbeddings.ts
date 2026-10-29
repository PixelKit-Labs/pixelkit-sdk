/**
 * @file useEmbeddings.ts
 * @description On-device text vector embeddings and cosine similarity scoring.
 *
 * Inference runs the MediaPipe Tasks TextEmbedder (TFLite) on the CPU (XNNPACK, no delegate
 * configured), not on the Tensor TPU. It needs a `.tflite` embedder model with TFLite metadata at
 * `<app filesDir>/models/text_embedder.tflite`; the library does not bundle or download one.
 *
 * Zero-simulation: when the file is absent or fails to load, `isAvailable` is false,
 * `source` is 'unavailable' and `unavailableReason` carries the native reason. `embed` rejects
 * (and sets `error`) instead of returning an empty vector. `vectorDimension` is the model's real
 * output length and stays null until the native side reports it.
 */

import { useState, useEffect, useCallback } from 'react';
import PixelNano, { isPixelNanoAvailable } from '@pixelkit-labs/mlkit';
import { logEvent, logError, recordMetric, traced, type TelemetrySource } from '../core/observability';
import { computeCosineSimilarity, assertRealEmbedding } from '../core/embeddingsMath';

const MODULE = 'useEmbeddings';

export interface EmbeddingsTelemetry {
  /** True only when the model file exists, loaded, and produced a vector for a probe input. */
  isAvailable: boolean;
  /** Whether an embedding inference is currently running. */
  isLoading: boolean;
  /** Real output length of the model's embedding vector; null until a load or an embed reported it. */
  vectorDimension: number | null;
  /** Reason the embedder is unavailable (missing model file, load failure); null when available. */
  unavailableReason: string | null;
  /** Error message if embedding generation failed. */
  error: string | null;
  /** 'hardware' when the model is available and the last embed did not fail; otherwise 'unavailable'. */
  source: TelemetrySource;
  /** Computes an L2-normalised float vector for the text. Rejects if the model is unavailable or returns no vector. */
  embed: (text: string) => Promise<number[]>;
  /** Computes cosine similarity between two float vectors (-1.0 to 1.0). */
  cosineSimilarity: (vecA: number[], vecB: number[]) => number;
}

export { computeCosineSimilarity };

export function useEmbeddings(): EmbeddingsTelemetry {
  const [isAvailable, setIsAvailable] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [vectorDimension, setVectorDimension] = useState<number | null>(null);
  const [unavailableReason, setUnavailableReason] = useState<string | null>(null);
  const [lastEmbedFailed, setLastEmbedFailed] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const source: TelemetrySource =
    isPixelNanoAvailable && isAvailable && !lastEmbedFailed ? 'hardware' : 'unavailable';

  useEffect(() => {
    if (!PixelNano) {
      setIsAvailable(false);
      setUnavailableReason('PixelNano native module is not installed in this build');
      return;
    }

    traced(MODULE, 'getEmbeddingStatus', () => PixelNano!.getEmbeddingStatus())
      .then((status) => {
        setIsAvailable(status.available);
        setUnavailableReason(status.available ? null : status.reason ?? 'unknown');
        setVectorDimension(status.dimension ?? null);
        recordMetric(MODULE, 'isEmbeddingModelAvailable', status.available, 'hardware');
        logEvent(MODULE, 'checked embedding model availability', {
          available: status.available,
          reason: status.reason,
          dimension: status.dimension,
        });
      })
      .catch((e: unknown) => {
        const err = logError(MODULE, 'check embedding availability failed', e);
        setIsAvailable(false);
        setUnavailableReason(err.message);
      });
  }, []);

  const embed = useCallback(async (text: string): Promise<number[]> => {
    setError(null);
    if (!PixelNano) {
      const message = 'PixelNano module unavailable';
      setError(message);
      throw new Error(message);
    }
    if (!text || text.trim().length === 0) {
      const message = 'Input text must not be empty';
      setError(message);
      throw new Error(message);
    }

    setIsLoading(true);
    try {
      const res = await traced(MODULE, 'generateEmbedding', () => PixelNano!.generateEmbedding(text));
      const vector = assertRealEmbedding(res);
      setVectorDimension(vector.length);
      setLastEmbedFailed(false);
      setIsAvailable(true);
      setUnavailableReason(null);
      recordMetric(MODULE, 'embeddingLatencyMs', res.latencyMs, 'hardware');
      logEvent(MODULE, 'generated embedding', {
        dim: vector.length,
        latencyMs: res.latencyMs,
      });
      return vector;
    } catch (e: unknown) {
      const err = logError(MODULE, 'generateEmbedding failed', e);
      setLastEmbedFailed(true);
      setError(err.message);
      throw e;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const cosineSimilarity = useCallback((vecA: number[], vecB: number[]): number => {
    return computeCosineSimilarity(vecA, vecB);
  }, []);

  return {
    isAvailable,
    isLoading,
    vectorDimension,
    unavailableReason,
    error,
    source,
    embed,
    cosineSimilarity,
  };
}
