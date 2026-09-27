import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  API_KEY_STORAGE_KEY,
  LEGACY_API_KEY_STORAGE_KEY,
  deleteCredential,
  readCredential,
  writeCredential,
  type CredentialStore,
} from '../packages/sdk/src/ai/credentialStore.ts';

function memoryStore(initial: Record<string, string> = {}): { store: CredentialStore; values: Map<string, string> } {
  const values = new Map(Object.entries(initial));
  return {
    values,
    store: {
      get: async key => values.get(key) ?? null,
      set: async (key, value) => { values.set(key, value); },
      remove: async key => { values.delete(key); },
    },
  };
}

describe('Gemini credential lifecycle', () => {
  test('write verifies canonical ownership and removes legacy storage', async () => {
    const { store, values } = memoryStore({ [LEGACY_API_KEY_STORAGE_KEY]: 'old' });
    assert.equal(await writeCredential(store, 'new-secret'), true);
    assert.equal(values.get(API_KEY_STORAGE_KEY), 'new-secret');
    assert.equal(values.has(LEGACY_API_KEY_STORAGE_KEY), false);
  });

  test('read migrates a legacy credential once and does not use alternate owners', async () => {
    const { store, values } = memoryStore({ [LEGACY_API_KEY_STORAGE_KEY]: 'legacy-secret' });
    assert.equal(await readCredential(store), 'legacy-secret');
    assert.equal(values.get(API_KEY_STORAGE_KEY), 'legacy-secret');
    assert.equal(values.has(LEGACY_API_KEY_STORAGE_KEY), false);
  });

  test('read removes a stale legacy owner when canonical storage already exists', async () => {
    const { store, values } = memoryStore({
      [API_KEY_STORAGE_KEY]: 'canonical-secret',
      [LEGACY_API_KEY_STORAGE_KEY]: 'stale-secret',
    });
    assert.equal(await readCredential(store), 'canonical-secret');
    assert.equal(values.has(LEGACY_API_KEY_STORAGE_KEY), false);
  });

  test('write rolls both owners back when legacy removal partially fails', async () => {
    const { store: backing, values } = memoryStore({
      [API_KEY_STORAGE_KEY]: 'prior-canonical',
      [LEGACY_API_KEY_STORAGE_KEY]: 'prior-legacy',
    });
    let failLegacyRemoval = true;
    const store: CredentialStore = {
      get: backing.get,
      set: backing.set,
      remove: async key => {
        if (key === LEGACY_API_KEY_STORAGE_KEY && failLegacyRemoval) {
          failLegacyRemoval = false;
          throw new Error('storage unavailable');
        }
        await backing.remove(key);
      },
    };
    assert.equal(await writeCredential(store, 'replacement'), false);
    assert.equal(values.get(API_KEY_STORAGE_KEY), 'prior-canonical');
    assert.equal(values.get(LEGACY_API_KEY_STORAGE_KEY), 'prior-legacy');
  });

  test('write rolls canonical state back when legacy deletion cannot be verified', async () => {
    const { store: backing, values } = memoryStore({
      [API_KEY_STORAGE_KEY]: 'prior-canonical',
      [LEGACY_API_KEY_STORAGE_KEY]: 'prior-legacy',
    });
    const store: CredentialStore = {
      get: backing.get,
      set: backing.set,
      remove: async key => {
        if (key !== LEGACY_API_KEY_STORAGE_KEY) await backing.remove(key);
      },
    };
    assert.equal(await writeCredential(store, 'replacement'), false);
    assert.equal(values.get(API_KEY_STORAGE_KEY), 'prior-canonical');
    assert.equal(values.get(LEGACY_API_KEY_STORAGE_KEY), 'prior-legacy');
  });

  test('delete removes and verifies canonical and legacy credentials', async () => {
    const { store } = memoryStore({
      [API_KEY_STORAGE_KEY]: 'canonical',
      [LEGACY_API_KEY_STORAGE_KEY]: 'legacy',
    });
    assert.equal(await deleteCredential(store), true);
    assert.equal(await readCredential(store), null);
  });

  test('delete reports false when storage still returns a credential', async () => {
    const store: CredentialStore = {
      get: async key => key === API_KEY_STORAGE_KEY ? 'undeletable' : null,
      set: async () => undefined,
      remove: async () => undefined,
    };
    assert.equal(await deleteCredential(store), false);
  });
});
