/**
 * @file geminiClient.ts
 * @description Google Gen AI SDK client factory and API key persistence in SecureStore (Android Keystore).
 */

import { GoogleGenAI } from '@google/genai';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import {
  API_KEY_STORAGE_KEY,
  LEGACY_API_KEY_STORAGE_KEY,
  deleteCredential,
  readCredential,
  writeCredential,
  type CredentialStore,
} from './credentialStore';

const credentialStore: CredentialStore = {
  get: key => SecureStore.getItemAsync(key),
  set: (key, value) => SecureStore.setItemAsync(key, value),
  remove: key => SecureStore.deleteItemAsync(key),
};

/** Browser persistence is unsupported; erase plaintext remnants from earlier SDK versions. */
function removeBrowserCredentialCopies(): boolean {
  try {
    if (typeof localStorage === 'undefined') return false;
    localStorage.removeItem(API_KEY_STORAGE_KEY);
    localStorage.removeItem(LEGACY_API_KEY_STORAGE_KEY);
    return localStorage.getItem(API_KEY_STORAGE_KEY) === null
      && localStorage.getItem(LEGACY_API_KEY_STORAGE_KEY) === null;
  } catch {
    return false;
  }
}

/** Cloud model used for chat, vision and transcription (Gemini API "Models" page, Sept 2026). */
export const GEMINI_MODEL = 'gemini-3.8-flash';

/** Error raised by AI hooks when no key is configured. There is no simulated fallback. */
export const NO_API_KEY_MESSAGE =
  'No Gemini API key configured. Native builds store the key in the Titan-backed SecureStore; browser credential persistence is unavailable.';

/**
 * Retrieves the sole application-owned Gemini credential. A legacy value is migrated once into
 * the canonical slot and removed; environment variables are intentionally not credential owners.
 */
export async function getStoredApiKey(): Promise<string | null> {
  if (Platform.OS === 'web') {
    removeBrowserCredentialCopies();
    return null;
  }
  try { return await readCredential(credentialStore); }
  catch { return null; }
}

/** Writes and verifies the canonical Gemini credential. Browser persistence is unavailable. */
export async function saveApiKey(key: string): Promise<boolean> {
  if (Platform.OS === 'web') {
    removeBrowserCredentialCopies();
    return false;
  }
  try { return await writeCredential(credentialStore, key); }
  catch { return false; }
}

/** Removes and verifies native credentials; browser removal cleans legacy plaintext remnants. */
export async function removeApiKey(): Promise<boolean> {
  if (Platform.OS === 'web') return removeBrowserCredentialCopies();
  try { return await deleteCredential(credentialStore); }
  catch { return false; }
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
