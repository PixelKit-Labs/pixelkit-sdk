# @pixelkit-labs/mlkit

Expo module (Kotlin) for the on-device Google ML Kit surface:

| Family | What it covers |
| :--- | :--- |
| GenAI | Gemini Nano through the Prompt API on AICore, plus summarization, proofreading, rewriting |
| Vision | barcode, face, face mesh, text recognition, image labeling, object detection, digital ink, pose, selfie and subject segmentation, document scanner |
| Natural language | language identification, translation, smart reply, entity extraction |
| Embeddings | on-device text embeddings through the MediaPipe Tasks TextEmbedder (TFLite, CPU) from a model file you supply at `filesDir/models/text_embedder.tflite` (must carry TFLite metadata; not bundled, not downloaded), plus cosine similarity. Reports unavailable with a reason when the file is missing or fails to load |

**This is the expensive one.** It pulls in 19 ML Kit artifacts, compiles with
`-Xskip-metadata-version-check`, and pins every `kotlin-stdlib` in the consuming build, because
`genai-prompt` requires Kotlin 2.3.21 while Expo 57 compiles with 2.1.20. That is why it is a
separate package from [`@pixelkit-labs/native`](https://www.npmjs.com/package/@pixelkit-labs/native): if you
only want CPU clocks and battery temperature, you should not pay for any of this.

**Android only. Requires a development build**, and Gemini Nano additionally requires a device with
AICore and the model downloaded. The TypeScript bridge uses `requireOptionalNativeModule`, so it
resolves to `null` rather than throwing when the native side is absent, letting callers report
`unavailable`.

Normally installed as a dependency of [`@pixelkit-labs/sdk`](https://www.npmjs.com/package/@pixelkit-labs/sdk), which
wraps it in `useGeminiNano`, `useGenAITasks`, `useVisionAI`, `useNaturalLanguageAI`, and `useEmbeddings`.

```bash
npx expo install @pixelkit-labs/mlkit
```

## Documentation

[https://pixelkit-labs.github.io/pixelkit-docs/](https://pixelkit-labs.github.io/pixelkit-docs/) — every hook with its inputs, outputs and
a contract for each function it exposes.

## Licence

MIT
