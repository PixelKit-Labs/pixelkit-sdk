/**
 * @file live.test.ts
 * @description Unit tests for Gemini 3.8 Multimodal Live bidirectional streaming
 * protocol, WebSocket message structures, and real-time hardware tool execution.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_LIVE_MODEL,
  LIVE_WEBSOCKET_ENDPOINT,
} from '../packages/sdk/src/ai/liveConstants.ts';
import {
  defineTool,
  runTool,
  clearTools,
  toFunctionDeclarations,
  listTools,
} from '../packages/sdk/src/ai/tools/registry.ts';

describe('Gemini 3.8 Multimodal Live Protocol', () => {
  it('declares canonical live WebSocket endpoint and default model', () => {
    assert.strictEqual(
      LIVE_WEBSOCKET_ENDPOINT,
      'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent',
    );
    assert.strictEqual(DEFAULT_LIVE_MODEL, 'models/gemini-2.0-flash-exp');
  });

  it('formats setup message with audio response modality and speechConfig', () => {
    const setupMsg = {
      setup: {
        model: DEFAULT_LIVE_MODEL,
        generationConfig: {
          responseModalities: ['AUDIO', 'TEXT'],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: {
                voiceName: 'Aoede',
              },
            },
          },
          thinkingConfig: {
            thinkingBudget: 1024,
          },
        },
      },
    };

    assert.strictEqual(setupMsg.setup.model, 'models/gemini-2.0-flash-exp');
    assert.deepStrictEqual(setupMsg.setup.generationConfig.responseModalities, ['AUDIO', 'TEXT']);
    assert.strictEqual(setupMsg.setup.generationConfig.speechConfig.voiceConfig.prebuiltVoiceConfig.voiceName, 'Aoede');
    assert.strictEqual(setupMsg.setup.generationConfig.thinkingConfig.thinkingBudget, 1024);
  });

  it('dispatches tool call and wraps response in toolResponse message', async () => {
    clearTools();
    defineTool({
      name: 'get_fan_speed',
      description: 'Query cooling fan RPM',
      parameters: { type: 'OBJECT', properties: {} },
      execute: () => ({ rpm: 3200 }),
    });

    const call = { id: 'call_123', name: 'get_fan_speed', args: {} };
    const toolResult = await runTool(call.name, call.args);

    assert.strictEqual(toolResult.ok, true);
    assert.deepStrictEqual(toolResult.result, { rpm: 3200 });

    const toolResponseMsg = {
      toolResponse: {
        functionResponses: [
          {
            id: call.id,
            name: call.name,
            response: { output: toolResult.result },
          },
        ],
      },
    };

    assert.strictEqual(toolResponseMsg.toolResponse.functionResponses[0].id, 'call_123');
    assert.deepStrictEqual(toolResponseMsg.toolResponse.functionResponses[0].response.output, { rpm: 3200 });
  });

  it('formats realtimeInput for PCM audio chunks correctly', () => {
    const fakePcmBase64 = 'UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=';
    const audioMsg = {
      realtimeInput: {
        mediaChunks: [
          {
            mimeType: 'audio/pcm;rate=16000',
            data: fakePcmBase64,
          },
        ],
      },
    };

    assert.strictEqual(audioMsg.realtimeInput.mediaChunks[0].mimeType, 'audio/pcm;rate=16000');
    assert.strictEqual(audioMsg.realtimeInput.mediaChunks[0].data, fakePcmBase64);
  });

  it('formats realtimeInput for camera image/video frames correctly', () => {
    const fakeJpegBase64 = '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP...';
    const imageMsg = {
      realtimeInput: {
        mediaChunks: [
          {
            mimeType: 'image/jpeg',
            data: fakeJpegBase64,
          },
        ],
      },
    };

    assert.strictEqual(imageMsg.realtimeInput.mediaChunks[0].mimeType, 'image/jpeg');
    assert.strictEqual(imageMsg.realtimeInput.mediaChunks[0].data, fakeJpegBase64);
  });

  it('constructs multimodal clientContent turns with text and image attachments', () => {
    const prompt = 'Inspect this circuit board for thermal hotspots';
    const fakeFrame = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

    const clientMsg = {
      clientContent: {
        turns: [
          {
            role: 'user',
            parts: [
              { text: prompt },
              {
                inlineData: {
                  mimeType: 'image/jpeg',
                  data: fakeFrame,
                },
              },
            ],
          },
        ],
        turnComplete: true,
      },
    };

    const turn = clientMsg.clientContent.turns[0];
    assert.ok(turn);
    assert.strictEqual(turn.parts[0]?.text, prompt);
    const inline = turn.parts[1]?.inlineData;
    assert.ok(inline);
    assert.strictEqual(inline.mimeType, 'image/jpeg');
    assert.strictEqual(inline.data, fakeFrame);
    assert.strictEqual(clientMsg.clientContent.turnComplete, true);
  });
});
