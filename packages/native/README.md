# @pixelkit-labs/native

Expo module (Kotlin) for Google Pixel telemetry and actuators: SoC identity, CPU clusters and
per-core frequencies, memory, thermal and ADPF headroom & hint sessions, reverse wireless Qi charging,
battery cycles and health, display modes, GPU, MLX90632 FIR thermometer, acoustic microphone arrays,
Wi-Fi 7 MLO, Wi-Fi RTT ranging, satellite NTN, Private Space isolation, Titan M2 StrongBox ECDH key agreement,
torch, and haptic envelopes.

The module also exposes Android's installed speech engines and explicit per-utterance TTS engine selection. It uses the platform TTS service; model weights and speaker settings stay with the separately installed engine.

**Zero third-party dependencies.** It reads Android framework APIs and the kernel directly, so it
adds nothing to your dependency graph. Its sibling [`@pixelkit-labs/mlkit`](https://www.npmjs.com/package/@pixelkit-labs/mlkit)
is a separate package precisely so that telemetry does not drag ML Kit in behind it.

**Android only. Requires a development build** — the module must be compiled in, so it does not
work in Expo Go. The TypeScript bridge uses `requireOptionalNativeModule`, so it resolves to `null`
rather than throwing when the native side is absent, letting callers report `unavailable`.

Normally installed as a dependency of [`@pixelkit-labs/sdk`](https://www.npmjs.com/package/@pixelkit-labs/sdk), which
wraps it in typed React hooks. Install it directly if you want the raw module.

```bash
npx expo install @pixelkit-labs/native
```

## Documentation

[https://pixelkit-labs.github.io/pixelkit-docs/](https://pixelkit-labs.github.io/pixelkit-docs/) — every hook with its inputs, outputs and
a contract for each function it exposes.

## Licence

MIT
