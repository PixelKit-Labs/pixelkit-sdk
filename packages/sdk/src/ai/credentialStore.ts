export const API_KEY_STORAGE_KEY = 'PIXELKIT_GEMINI_API_KEY';
export const LEGACY_API_KEY_STORAGE_KEY = 'PIXELFORGE_GEMINI_API_KEY';

export interface CredentialStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
}

/** Reads canonical storage and removes any stale legacy owner before returning the credential. */
export async function readCredential(store: CredentialStore): Promise<string | null> {
  const canonical = await store.get(API_KEY_STORAGE_KEY);
  if (canonical) {
    await store.remove(LEGACY_API_KEY_STORAGE_KEY);
    return await store.get(LEGACY_API_KEY_STORAGE_KEY) === null ? canonical : null;
  }
  const legacy = await store.get(LEGACY_API_KEY_STORAGE_KEY);
  if (!legacy) return null;
  return await writeCredential(store, legacy) ? legacy : null;
}

async function restoreCredentialState(
  store: CredentialStore,
  canonical: string | null,
  legacy: string | null,
): Promise<void> {
  try {
    if (canonical === null) await store.remove(API_KEY_STORAGE_KEY);
    else await store.set(API_KEY_STORAGE_KEY, canonical);
  } catch {
    // The write remains failed; continue restoring the independent legacy slot.
  }
  try {
    if (legacy === null) await store.remove(LEGACY_API_KEY_STORAGE_KEY);
    else await store.set(LEGACY_API_KEY_STORAGE_KEY, legacy);
  } catch {
    // The caller still receives false; storage errors never become fabricated success.
  }
}

/** Transactionally stores one canonical credential, verifies it, and removes legacy ownership. */
export async function writeCredential(store: CredentialStore, value: string): Promise<boolean> {
  if (!value.trim()) return false;
  let priorCanonical: string | null;
  let priorLegacy: string | null;
  try {
    priorCanonical = await store.get(API_KEY_STORAGE_KEY);
    priorLegacy = await store.get(LEGACY_API_KEY_STORAGE_KEY);
  } catch {
    return false;
  }
  try {
    await store.set(API_KEY_STORAGE_KEY, value);
    if (await store.get(API_KEY_STORAGE_KEY) !== value) {
      await restoreCredentialState(store, priorCanonical, priorLegacy);
      return false;
    }
    await store.remove(LEGACY_API_KEY_STORAGE_KEY);
    const verifiedCanonical = await store.get(API_KEY_STORAGE_KEY);
    const verifiedLegacy = await store.get(LEGACY_API_KEY_STORAGE_KEY);
    if (verifiedCanonical === value && verifiedLegacy === null) return true;
  } catch {
    // Roll back both owners below.
  }
  await restoreCredentialState(store, priorCanonical, priorLegacy);
  return false;
}

/** Deletes both possible storage keys and verifies neither remains readable. */
export async function deleteCredential(store: CredentialStore): Promise<boolean> {
  await Promise.all([
    store.remove(API_KEY_STORAGE_KEY),
    store.remove(LEGACY_API_KEY_STORAGE_KEY),
  ]);
  const [canonical, legacy] = await Promise.all([
    store.get(API_KEY_STORAGE_KEY),
    store.get(LEGACY_API_KEY_STORAGE_KEY),
  ]);
  return canonical === null && legacy === null;
}
