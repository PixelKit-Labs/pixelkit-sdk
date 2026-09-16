# @pixelkit-labs/sdk

**PixelKit** is the Expo & React Native SDK for Google Pixel hardware and on-device AI.
It provides 53 typed React hooks for CPU/GPU/TPU silicon, ADPF thermals, modern sensors and acoustics, next-gen radios, Titan M2 security, camera/audio capture, on-device Gemini Nano, and real-time Gemini Live bidirectional duplex streaming.

---

## Installation

```bash
# Core SDK and Kotlin hardware telemetry module
npx expo install @pixelkit-labs/sdk @pixelkit-labs/native

# On-device Edge AI: Gemini Nano, ML Kit vision & translation, local vector embeddings (opt-in)
npx expo install @pixelkit-labs/mlkit
```

---

## Quick Example

```tsx
import React from 'react';
import { View, Text } from 'react-native';
import { useCPU, useADPF, useHiLight } from '@pixelkit-labs/sdk';
import { useGeminiNano } from '@pixelkit-labs/sdk/mlkit';

export function HardwareScreen() {
  const cpu = useCPU();
  const { thermalHeadroom } = useADPF();
  const { isAvailable } = useGeminiNano();

  return (
    <View style={{ padding: 20 }}>
      <Text>CPU Core 0: {cpu.cores[0]?.curMHz ?? '—'} MHz</Text>
      <Text>Thermal Headroom: {thermalHeadroom?.toFixed(2) ?? '—'}</Text>
      <Text>Gemini Nano Ready: {isAvailable ? 'Yes' : 'No'}</Text>
    </View>
  );
}
```

---

## Hooks Overview (53 Total)

| Category | Hooks |
| :--- | :--- |
| **Silicon & System** | `useCPU`, `useGPU`, `useTPU`, `useMemory`, `useADPF`, `useADPFHintSession`, `useBatteryShare`, `useChargingIntelligence`, `usePerfetto`, `useDevice`, `useDisplay`, `useNetwork`, `useCellular`, `useCapabilities` |
| **Sensors & Capture** | `useSensors`, `useAltimeter`, `useThermometer`, `useLocation`, `useCamera`, `useCameraExtensions`, `useVideo`, `useMediaLibrary`, `useAudio`, `useMicrophoneArray`, `useSpatialAudio`, `useHealthConnect` |
| **Actuators** | `useHaptics`, `useTorch`, `useHiLight` |
| **Radios & Wireless** | `useBLE`, `useChannelSounding`, `useNFC`, `useUWB`, `useRadios`, `useWifi7MLO`, `useWifiRTT`, `useSatelliteNTN` |
| **Security & Privacy** | `useBiometrics`, `useSecurity`, `useKeyAgreement`, `usePrivateSpace`, `usePlayIntegrity` |
| **AI (Cloud & Live Duplex)** | `useGemini`, `useCloudHardwareAgent`, `useGeminiLive`, `useSpeechAI`, `useSpeech`, `useAppFunctions` |
| **On-Device AI (`mlkit`)** | `useGeminiNano`, `useGenAITasks`, `useVisionAI`, `useNaturalLanguageAI`, `useEmbeddings` |

---

## Key Capabilities

- **Tensor G6 Silicon**: Real-time per-core cpufreq, GPU clock/load, memory bandwidth, and ADPF thermal headroom.
- **Edge AI on AICore**: Run Gemini Nano locally without network latency or cloud costs, plus local 512/768-dim text embeddings and ML Kit vision pipelines.
- **Real-Time Gemini Live Duplex**: Stream bidirectional voice and text over WebSockets (`useGeminiLive`) with real-time function calling.
- **Acoustic Beamforming & Sensors**: Directional microphone array control (`useMicrophoneArray`), non-contact MLX90632 FIR thermometer (`useThermometer`), and ICAO barometric altimeter (`useAltimeter`).
- **Next-Gen Radios**: Wi-Fi 7 Multi-Link Operation (MLO), 802.11mc/az Wi-Fi RTT ranging, and Satellite NTN emergency states.
- **Hardware Actuators**: Camera-bar HiLight LED sequences, custom LRA haptic waveforms, torch intensity, and reverse wireless battery sharing.
- **Built-in Observability**: Every hardware operation is timed, traced, and logged via `traced()`. Inspect trace latencies and health summaries in the `<PixelKitDevTools />` in-app HUD.
- **Typed Hardware Provenance**: Every hook returns `source: 'hardware' | 'derived' | 'unavailable'`. When a sensor or feature is absent on a device, values cleanly evaluate to `null`.

---

## Requirements

- **Platform**: Android 14+ (API 34+), optimized for Tensor G5/G6 & Android 17 (API 37).
- **Environment**: Expo Development Build (`npx expo run:android`) or EAS Build.
- **Hardware**: Google Pixel 11 Pro, Pro XL, Pro Fold, and Pixel 8/9/10/11 series. Non-Pixel Android devices support JavaScript/Expo hooks and gracefully report `unavailable` for hardware-specific features.

---

## Documentation

Full interactive documentation, API references, parameter schemas, and contracts:
[https://pixelkit-labs.github.io/pixelkit-docs/](https://pixelkit-labs.github.io/pixelkit-docs/)

---

## License

MIT © PixelKit Labs
