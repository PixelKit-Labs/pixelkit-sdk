import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { SpeechCallbackOwnership } from '../packages/sdk/src/ai/speechCallbackOwnership.ts';
import type {
  AndroidTtsIdentity,
  GeminiLiveAudioIdentity,
} from '../packages/native/index.ts';

describe('speech callback ownership', () => {
  it('accepts ordered callbacks for its utterance exactly once', () => {
    const ownership = new SpeechCallbackOwnership('utterance-a');
    assert.equal(ownership.accept('utterance-a', 'start', 10), true);
    assert.equal(ownership.accept('utterance-a', 'start', 10), false);
    assert.equal(ownership.accept('utterance-a', 'done', 20), true);
  });

  it('ignores callbacks for a replaced utterance and every late terminal callback', () => {
    const ownership = new SpeechCallbackOwnership('utterance-old');
    assert.equal(ownership.accept('utterance-new', 'start', 10), false);
    assert.equal(ownership.accept('utterance-old', 'replaced', 20), true);
    assert.equal(ownership.accept('utterance-old', 'done', 30), false);
    assert.equal(ownership.accept('utterance-old', 'error', 40), false);
  });

  it('closes cancellation before a late playback start', () => {
    const ownership = new SpeechCallbackOwnership('utterance-cancelled');
    assert.equal(ownership.accept('utterance-cancelled', 'stop', 10), true);
    assert.equal(ownership.accept('utterance-cancelled', 'start', 20), false);
  });
});

describe('speech output identity types', () => {
  it('keeps Gemini Live cloud audio distinct from Android TTS identity', () => {
    const live: GeminiLiveAudioIdentity = {
      audioSource: 'gemini_live_audio',
      provider: 'google_gemini_live',
      model: 'models/gemini-live',
      voiceName: 'Aoede',
    };
    const android: AndroidTtsIdentity = {
      audioSource: 'android_tts',
      requestedPackage: 'com.example.tts',
      installedPackage: 'com.example.tts',
      installedVersionName: '1.2.3',
      installedVersionCode: 12,
      resolvedEnginePackage: 'com.example.tts',
      resolvedEngineName: 'Example TTS',
      initializationStatus: 'ready',
      available: true,
      identityVerified: true,
      bindingEvidence: 'active_engine_api',
      selectedVoice: null,
      selectedLocale: 'en-US',
      executionProvider: null,
      executionProviderObserved: false,
      installationOwner: 'external_app',
      managesExternalInstallOrModels: false,
    };

    assert.equal(live.audioSource, 'gemini_live_audio');
    assert.equal(android.audioSource, 'android_tts');
    assert.equal(android.executionProvider, null);
    assert.equal(android.managesExternalInstallOrModels, false);
  });
});
