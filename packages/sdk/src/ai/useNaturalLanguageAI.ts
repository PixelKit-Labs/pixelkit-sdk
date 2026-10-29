/**
 * @file useNaturalLanguageAI.ts
 * @description Real on-device Natural Language intelligence powered by Google ML Kit and AICore.
 * Features:
 * - Language Identification (50+ languages detected with confidence scores)
 * - On-Device Machine Translation (ML Kit Translate languages; each language model downloads once, then runs offline)
 * - Smart Reply Generation (context-aware conversational reply suggestions)
 * - Entity Extraction (dates, flight numbers, addresses, tracking numbers, money, phone numbers; English text only)
 *
 * Observability:
 * - `source` is 'hardware' once at least one on-device operation has returned a result, and 'unavailable' before that or when PixelNano is absent (web/Expo Go).
 * - Hardware latencies are recorded via `recordMetric` and `logEvent`.
 */

import { useState, useCallback } from 'react';
import PixelNano, {
  type LanguageIdResult,
  type TranslationResult,
  type SmartReplyResult,
  type EntityExtractionResult,
} from '@pixelkit-labs/mlkit';
import { logEvent, recordMetric, type TelemetrySource } from '../core/observability';

const MODULE = 'useNaturalLanguageAI';

export function useNaturalLanguageAI() {
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const [languageResult, setLanguageResult] = useState<LanguageIdResult | null>(null);
  const [translationResult, setTranslationResult] = useState<TranslationResult | null>(null);
  const [smartReplyResult, setSmartReplyResult] = useState<SmartReplyResult | null>(null);
  const [entityResult, setEntityResult] = useState<EntityExtractionResult | null>(null);

  // 'hardware' only after an operation has returned a result; the native module being linked does not prove ML Kit answered.
  const source: TelemetrySource =
    PixelNano && (languageResult != null || translationResult != null || smartReplyResult != null || entityResult != null)
      ? 'hardware'
      : 'unavailable';

  /**
   * Identifies the language of the provided text on-device.
   */
  const identifyLanguage = useCallback(async (text: string): Promise<LanguageIdResult | null> => {
    if (!PixelNano) {
      setError('PixelNano module is unavailable in this environment');
      return null;
    }
    setIsProcessing(true);
    setError(null);
    try {
      const result = await PixelNano.identifyLanguage(text);
      setLanguageResult(result);
      recordMetric(MODULE, 'languageIdLatencyMs', result.latencyMs, 'hardware');
      logEvent(MODULE, 'identifyLanguage', { language: result.languageCode, latencyMs: result.latencyMs });
      return result;
    } catch (e: any) {
      const msg = e?.message ?? 'Language identification failed';
      setError(msg);
      logEvent(MODULE, 'identifyLanguage error', { message: msg }, 'error');
      return null;
    } finally {
      setIsProcessing(false);
    }
  }, []);

  /**
   * Translates text between two languages ML Kit Translate supports, on-device. A language tag it does
   * not support rejects (the hook sets `error` and resolves null); no other language is substituted.
   */
  const translate = useCallback(
    async (text: string, sourceLang: string = 'en', targetLang: string = 'es'): Promise<TranslationResult | null> => {
      if (!PixelNano) {
        setError('PixelNano module is unavailable in this environment');
        return null;
      }
      setIsProcessing(true);
      setError(null);
      try {
        const result = await PixelNano.translate(text, sourceLang, targetLang);
        setTranslationResult(result);
        recordMetric(MODULE, 'translateLatencyMs', result.latencyMs, 'hardware');
        logEvent(MODULE, 'translate', { sourceLang, targetLang, latencyMs: result.latencyMs });
        return result;
      } catch (e: any) {
        const msg = e?.message ?? 'Translation failed';
        setError(msg);
        logEvent(MODULE, 'translate error', { message: msg }, 'error');
        return null;
      } finally {
        setIsProcessing(false);
      }
    },
    []
  );

  /**
   * Generates smart reply suggestions from chat message history.
   */
  const suggestReplies = useCallback(
    async (
      history: Array<{ text: string; timestamp?: number; isLocalUser?: boolean; sender?: string }>
    ): Promise<SmartReplyResult | null> => {
      if (!PixelNano) {
        setError('PixelNano module is unavailable in this environment');
        return null;
      }
      setIsProcessing(true);
      setError(null);
      try {
        const result = await PixelNano.suggestReplies(history);
        setSmartReplyResult(result);
        recordMetric(MODULE, 'smartReplyLatencyMs', result.latencyMs, 'hardware');
        logEvent(MODULE, 'suggestReplies', { count: result.suggestions.length, latencyMs: result.latencyMs });
        return result;
      } catch (e: any) {
        const msg = e?.message ?? 'Smart reply failed';
        setError(msg);
        logEvent(MODULE, 'suggestReplies error', { message: msg }, 'error');
        return null;
      } finally {
        setIsProcessing(false);
      }
    },
    []
  );

  /**
   * Extracts structured entities (dates, tracking codes, money, phone numbers) from English text.
   */
  const extractEntities = useCallback(async (text: string): Promise<EntityExtractionResult | null> => {
    if (!PixelNano) {
      setError('PixelNano module is unavailable in this environment');
      return null;
    }
    setIsProcessing(true);
    setError(null);
    try {
      const result = await PixelNano.extractEntities(text);
      setEntityResult(result);
      recordMetric(MODULE, 'entityExtractionLatencyMs', result.latencyMs, 'hardware');
      logEvent(MODULE, 'extractEntities', { count: result.entities.length, latencyMs: result.latencyMs });
      return result;
    } catch (e: any) {
      const msg = e?.message ?? 'Entity extraction failed';
      setError(msg);
      logEvent(MODULE, 'extractEntities error', { message: msg }, 'error');
      return null;
    } finally {
      setIsProcessing(false);
    }
  }, []);

  return {
    isProcessing,
    error,
    languageResult,
    translationResult,
    smartReplyResult,
    entityResult,
    source,
    identifyLanguage,
    translate,
    suggestReplies,
    extractEntities,
  };
}
