# @pixelkit-labs/sdk

PixelKit is an SDK for building Expo and React Native applications on Google Pixel devices. It
provides typed React hooks for device sensors, radios, secure hardware, camera and audio, display
and power telemetry, haptics, on-device AI, and Cloud AI.

Telemetry, sensors, radios, security and cloud Gemini:

```bash
npx expo install @pixelkit-labs/sdk @pixelkit-labs/native
```

On-device ML - Gemini Nano, vision, natural language - is opt-in, because it puts 19 ML Kit
artifacts in your APK. Install it only if you want those hooks:

```bash
npx expo install @pixelkit-labs/mlkit
```

```tsx
import { useCPU, useGemini } from '@pixelkit-labs/sdk';
import { useGeminiNano } from '@pixelkit-labs/sdk/mlkit'; // only with @pixelkit-labs/mlkit installed

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

This cannot run in Expo Go. The hooks call two Kotlin Expo Modules that have to be compiled into
the app, and Expo Go contains only the native code Expo shipped.

## Supported devices

Built for the Google Pixel 11 Pro, Pro Fold and Pro XL. It degrades rather than fails elsewhere:
13 of the 51 hooks are pure Expo and JavaScript and work on any Android device; another 37 call the
Kotlin modules and report `unsupported` where the silicon is not there. `useHiLight` is neither: it
drives the camera-bar LEDs through a local ADB daemon, because Android restricts them to privileged
apps.

```bash
npx @pixelkit-labs/cli doctor   # tells you which case you are in
```

## What is in it

| Area | Hooks |
| :--- | :--- |
| Silicon & System | `useCPU`, `useGPU`, `useTPU`, `useMemory`, `useADPF`, `useADPFHintSession`, `usePerfetto`, `useBatteryShare`, `useChargingIntelligence`, `useDevice`, `useDisplay`, `useNetwork`, `useCellular`, `useCapabilities` |
| Sensors & Capture | `useSensors`, `useAltimeter`, `useThermometer`, `useLocation`, `useCamera`, `useCameraExtensions`, `useHealthConnect`, `useVideo`, `useMediaLibrary`, `useAudio`, `useMicrophoneArray`, `useSpatialAudio` |
| Actuators | `useHaptics`, `useTorch`, `useHiLight` |
| Radios | `useBLE`, `useChannelSounding`, `useNFC`, `useUWB`, `useRadios`, `useWifi7MLO`, `useWifiRTT`, `useSatelliteNTN` |
| Security | `useBiometrics`, `useSecurity`, `useKeyAgreement`, `usePrivateSpace`, `usePlayIntegrity` |
| AI (main entry) | `useGemini`, `useAppFunctions`, `useSpeechAI`, `useSpeech` |
| AI (`@pixelkit-labs/sdk/mlkit`) | `useGeminiNano`, `useGenAITasks`, `useVisionAI`, `useNaturalLanguageAI`, `useEmbeddings` |

Plus the observability layer (`traced`, `logError`, `useObservability`) that every hook
reports through, and `<PixelKitDevTools />` in-app HUD.

Every hook also reports where its value came from — `source: 'hardware' | 'derived' | 'unavailable'` —
and returns `null` rather than a substitute when a reading cannot be taken.

## Observability

Every function that touches hardware, the network, a native module or the file system is wrapped
in `traced()`, so it is timed and correlated, and surfaces failure through an `error` field rather
than an empty catch. `useObservability()` gives you the event log, the slowest traces and the error
counts at runtime.

## Documentation

Full input and output tables for all 51 hooks, with a contract for every function:
[the documentation](https://pixelkit-labs.github.io/pixelkit-docs/).

## Licence

MIT
