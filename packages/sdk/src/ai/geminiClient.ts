/**
 * @file geminiClient.ts
 * @description Google Gen AI SDK client factory and API key persistence in SecureStore (Android Keystore).
 */

import { GoogleGenAI } from '@google/genai';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const API_KEY_STORAGE_KEY = 'PIXELKIT_GEMINI_API_KEY';
const LEGACY_API_KEY_STORAGE_KEY = 'PIXELFORGE_GEMINI_API_KEY';

/** Cloud model used for chat, vision and transcription (Gemini API "Models" page, Sept 2026). */
export const GEMINI_MODEL = 'gemini-3.8-flash';

/** Error raised by AI hooks when no key is configured. There is no simulated fallback. */
export const NO_API_KEY_MESSAGE =
  'No Gemini API key configured. Open "Configure Gemini API Key" in the AI Lab; the key is stored in the Titan-backed SecureStore.';

/**
 * Retrieves the stored Gemini API key from Titan M3 Keystore or environment variables.
 * @returns Promise resolving to API key string or null if not yet configured.
 */
export async function getStoredApiKey(): Promise<string | null> {
  try {
    if (Platform.OS === 'web') {
      return (
        localStorage.getItem(API_KEY_STORAGE_KEY) ||
        localStorage.getItem(LEGACY_API_KEY_STORAGE_KEY) ||
        process.env.EXPO_PUBLIC_GEMINI_API_KEY ||
        null
      );
    }
    const secureKey =
      (await SecureStore.getItemAsync(API_KEY_STORAGE_KEY)) ||
      (await SecureStore.getItemAsync(LEGACY_API_KEY_STORAGE_KEY));
    return secureKey || process.env.EXPO_PUBLIC_GEMINI_API_KEY || null;
  } catch {
    return process.env.EXPO_PUBLIC_GEMINI_API_KEY || null;
  }
}

/**
 * Writes the Gemini API key to SecureStore (Android Keystore-backed).
 * @param key The Google Gemini API key (e.g. AIzaSy...).
 * @returns Promise resolving to true on successful write.
 */
export async function saveApiKey(key: string): Promise<boolean> {
  try {
    if (Platform.OS === 'web') {
      localStorage.setItem(API_KEY_STORAGE_KEY, key);
      return true;
    }
    await SecureStore.setItemAsync(API_KEY_STORAGE_KEY, key);
    return true;
  } catch {
    return false;
  }
}

/** Default models list when API list is loading or unauthenticated */
export const DEFAULT_MODELS = [
  'gemini-3.8-flash',
  'gemini-3.8-live',
  'gemini-3.8-live-extended-thinking',
  'gemini-2.5-flash',
  'gemini-2.5-pro',
  'gemini-2.0-flash',
  'gemini-2.0-flash-lite',
];

/**
 * Fetches available Gemini models dynamically from Google's API via client.models.list().
 * Falls back to curated defaults when offline or unconfigured.
 */
export async function listAvailableModels(apiKey?: string | null): Promise<string[]> {
  const key = apiKey ?? (await getStoredApiKey());
  if (!key) return DEFAULT_MODELS;
  try {
    const client = createGeminiClient(key);
    const response = await client.models.list();
    const models: string[] = [];
    for await (const m of response) {
      const id = m.name ? m.name.replace(/^models\//, '') : '';
      if (id && (id.includes('gemini') || id.includes('flash') || id.includes('pro') || id.includes('live'))) {
        if (!id.includes('embedding') && !id.includes('aqa')) {
          models.push(id);
        }
      }
    }
    return models.length > 0 ? models : DEFAULT_MODELS;
  } catch {
    return DEFAULT_MODELS;
  }
}

/**
 * Instantiates the official Google Gen AI SDK client with configured API key.
 * @param apiKey Valid Gemini API key.
 * @returns Initialized GoogleGenAI instance.
 */
export function createGeminiClient(apiKey: string): GoogleGenAI {
  return new GoogleGenAI({ apiKey });
}
