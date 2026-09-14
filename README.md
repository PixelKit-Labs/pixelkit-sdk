<p align="center">
  <img src="./PixelKit_readme.jpg" alt="PixelKit" width="300">
</p>

<p align="center">
  PixelKit is an SDK for building Expo and React Native applications on Google Pixel devices.
  It provides typed React hooks for the CPU, GPU and TPU, device sensors, radios, secure hardware, camera and audio,
  display and power telemetry, haptics, on-device AI, and Cloud AI.
</p>

<p align="center">
  <a href="https://pixelkit-labs.github.io/pixelkit-docs/">Documentation</a>
  &middot;
  <a href="https://github.com/PixelKit-Labs/pixelkit-template">Template</a>
  &middot;
  <a href="https://github.com/PixelKit-Labs/pixelkit-sdk/issues/new?labels=bug">Report a bug</a>
</p>

## Install

```bash
npx expo install @pixelkit-labs/sdk @pixelkit-labs/native
```

On-device ML is a separate install, because it adds 19 ML Kit artifacts to your APK:

```bash
npx expo install @pixelkit-labs/mlkit
```

```tsx
import { useCPU } from '@pixelkit-labs/sdk';
import { useGeminiNano } from '@pixelkit-labs/sdk/mlkit';

function Compute() {
  const cpu = useCPU();
  // cpu.source is 'hardware' | 'derived' | 'unavailable'; curMHz is null when it cannot be read
  return <Text>{cpu.cores[0]?.curMHz ?? '—'} MHz</Text>;
}
```

## Requirements

| | |
| :--- | :--- |
| Platform | Android only |
| Expo SDK | `~57.0.20` |
| React Native | `0.86.3` |
| React | `19.2.3` |
| Build | A development build — `npx expo run:android`, or an EAS development profile |

PixelKit cannot run in Expo Go. The hooks call two Kotlin Expo Modules that have to be compiled
into the app, and Expo Go contains only the native code Expo shipped.

## Supported devices

Built for the Google Pixel 11 Pro, Pro Fold and Pro XL. It degrades rather than fails elsewhere:
**13 of the 51 hooks are pure Expo and JavaScript** — camera, audio, sensors, location, biometrics,
the keystore, cloud Gemini — and work on any Android device. Another 37 call the Kotlin modules and
report `unsupported` where the silicon is not there. `useHiLight` is the exception to both: Android
restricts the camera-bar LEDs to privileged apps, so it drives them through a local ADB daemon.

```bash
npx @pixelkit-labs/cli doctor   # tells you which case you are in
```

## Hooks

**Silicon and system** — `useCPU`, `useGPU`, `useMemory`, `useADPF`, `useADPFHintSession`, `useTPU`,
`useBatteryShare`, `useChargingIntelligence`, `usePerfetto`, `useDevice`, `useDisplay`, `useNetwork`,
`useCellular`, `useCapabilities`

**Sensors and capture** — `useSensors`, `useAltimeter`, `useThermometer`, `useLocation`, `useCamera`,
`useCameraExtensions`, `useVideo`, `useMediaLibrary`, `useAudio`, `useMicrophoneArray`,
`useSpatialAudio`, `useHealthConnect`

**Actuators** — `useHaptics`, `useTorch`, `useHiLight`

**Radios** — `useBLE`, `useChannelSounding`, `useNFC`, `useUWB`, `useRadios`, `useWifi7MLO`,
`useWifiRTT`, `useSatelliteNTN`

**Security** — `useBiometrics`, `useSecurity`, `useKeyAgreement`, `usePrivateSpace`,
`usePlayIntegrity`

**AI** — `useGemini` (multi-turn chat, streaming, safety thresholds, Google Search grounding, token
counting), `useSpeechAI` (voice capture and transcription, on-device streaming or cloud),
`useSpeech` (text to speech), `useAppFunctions` (expose your app's capabilities to the system Gemini
assistant), `useTPU` (what the AICore stack actually exposes)

**AI, from `@pixelkit-labs/sdk/mlkit`** — `useGeminiNano` (Gemini Nano through AICore),
`useGenAITasks` (summarize, proofread, rewrite), `useVisionAI` (cloud Gemini multimodal plus
on-device barcode, face, text, labels, objects, pose, segmentation, document scanning and digital
ink), `useNaturalLanguageAI` (language ID, offline translation across 58 languages, smart reply,
entity extraction), `useEmbeddings` (on-device text embeddings and cosine similarity)

Inputs, outputs and a contract for every function are in the
[documentation](https://pixelkit-labs.github.io/pixelkit-docs/).

Every hook also reports where its value came from — `source: 'hardware' | 'derived' | 'unavailable'` —
and returns `null` rather than a substitute when a reading cannot be taken. The reasoning is in
[Provenance](https://pixelkit-labs.github.io/pixelkit-docs/api/silicon-compute/observability-provenance/).

## Packages

| | |
| :--- | :--- |
| `@pixelkit-labs/sdk` | The 51 hooks, the types they return, and the observability layer |
| `@pixelkit-labs/native` | Kotlin Expo Module for telemetry and actuators. No third-party dependencies. |
| `@pixelkit-labs/mlkit` | Kotlin Expo Module for on-device ML Kit and Gemini Nano. Opt-in. |

They version in lockstep, and `@pixelkit-labs/sdk` pins the other two exactly.

## Repositories

- **[pixelkit-template](https://github.com/PixelKit-Labs/pixelkit-template)** — a working four-tab
  app demonstrating every hook on a real device. Press **Use this template** to start from it.
- **[pixelkit-docs](https://github.com/PixelKit-Labs/pixelkit-docs)** — the source of the
  [documentation site](https://pixelkit-labs.github.io/pixelkit-docs/).
- **[pixelkit-cli](https://github.com/PixelKit-Labs/pixelkit-cli)** — `pixelkit doctor`.

## Developing

```bash
npm install
npm run typecheck
npm run build      # compiles all three packages to build/ with declarations
npm run test:e2e   # runs autonomous hardware verification via ARTEMIS
```

See [Automated E2E Testing with ARTEMIS](./test/artemis/README.md) for running hardware test recipes on a physical Pixel or emulator. [CONTRIBUTING.md](./CONTRIBUTING.md) covers the two rules that fail a build rather than a review.

## Licence

MIT.

