<p align="center">
  <img src="./PixelKit_readme.jpg" alt="PixelKit" width="320">
</p>

<p align="center">
  <strong>PixelKit</strong> is the Expo & React Native SDK for Google Pixel hardware and on-device AI.
  <br>
  Build apps that leverage Tensor silicon telemetry, ADPF thermal headroom, Gemini Nano edge AI,
  real-time Gemini Live bidirectional voice streaming, battery share, Wi-Fi 7 MLO, and camera/acoustic hardware.
</p>

<p align="center">
  <a href="https://pixelkit-labs.github.io/pixelkit-docs/">Documentation</a>
  &middot;
  <a href="https://github.com/PixelKit-Labs/pixelkit-template">Showcase App</a>
  &middot;
  <a href="https://pixelkit-labs.github.io/pixelkit-docs/api/openapi/">OpenAPI Spec</a>
  &middot;
  <a href="https://github.com/PixelKit-Labs/pixelkit-sdk/issues/new?labels=bug">Report an issue</a>
</p>

---

## Highlights

- **Tensor Silicon & Thermals**: Live CPU core frequencies, GPU clock/load, ADPF thermal headroom hints, and Perfetto system tracing.
- **On-Device Edge AI**: Run Gemini Nano locally via AICore TPU, generate 512/768-dim text embeddings, perform offline translation (58 languages), and run ML Kit vision tasks with zero server dependencies.
- **Cloud AI & Gemini Live Duplex**: Stream bidirectional voice and text over WebSockets in real time (`useGeminiLive`), query autonomous hardware diagnostic agents, and deploy ADK multi-agent triage teams.
- **Modern Sensors & Acoustics**: Directional 3-microphone beamforming arrays, non-contact MLX90632 FIR thermometer, and ICAO barometric altimeter with climb rates.
- **Next-Gen Radios & Security**: Wi-Fi 7 Multi-Link Operation (MLO), 802.11mc/az Wi-Fi RTT sub-meter indoor ranging, Satellite NTN states, Android 15 Private Space isolation, and Titan M2 StrongBox ECDH key agreement.
- **Hardware Actuators**: Camera-bar HiLight LED sequences, custom LRA haptics, torch control, and reverse wireless Qi battery power sharing.

---

## Quickstart

```bash
# Core SDK: silicon telemetry, sensors, radios, security, actuators, cloud AI
npx expo install @pixelkit-labs/sdk @pixelkit-labs/native

# On-device Edge AI: Gemini Nano, ML Kit vision & translation, local embeddings (opt-in)
npx expo install @pixelkit-labs/mlkit
```

### Example: Hardware Monitoring & Edge AI

```tsx
import React from 'react';
import { View, Text, Button } from 'react-native';
import { useCPU, useADPF } from '@pixelkit-labs/sdk';
import { useGeminiNano } from '@pixelkit-labs/sdk/mlkit';

export function HardwareTelemetryScreen() {
  const cpu = useCPU();
  const { thermalHeadroom, thermalStatus } = useADPF();
  const { isAvailable, generateText } = useGeminiNano();

  const runOnDeviceAnalysis = async () => {
    const prompt = `CPU Frequency: ${cpu.cores[0]?.curMHz} MHz. Thermal Status: ${thermalStatus}. Provide hardware advice.`;
    const response = await generateText(prompt);
    console.log('Gemini Nano analysis:', response);
  };

  return (
    <View style={{ padding: 16 }}>
      <Text>CPU Core 0: {cpu.cores[0]?.curMHz ?? '—'} MHz</Text>
      <Text>Thermal Headroom: {thermalHeadroom?.toFixed(2) ?? '—'}</Text>
      <Button
        title="Analyze with Gemini Nano"
        disabled={!isAvailable}
        onPress={runOnDeviceAnalysis}
      />
    </View>
  );
}
```

---

## Hooks (53 Total)

Every hook is typed, observed, and tested across real hardware:

### Silicon & System
`useCPU` &middot; `useGPU` &middot; `useTPU` &middot; `useMemory` &middot; `useADPF` &middot; `useADPFHintSession` &middot; `useBatteryShare` &middot; `useChargingIntelligence` &middot; `usePerfetto` &middot; `useDevice` &middot; `useDisplay` &middot; `useNetwork` &middot; `useCellular` &middot; `useCapabilities`

### Sensors & Capture
`useSensors` &middot; `useAltimeter` &middot; `useThermometer` &middot; `useLocation` &middot; `useCamera` &middot; `useCameraExtensions` &middot; `useVideo` &middot; `useMediaLibrary` &middot; `useAudio` &middot; `useMicrophoneArray` &middot; `useSpatialAudio` &middot; `useHealthConnect`

### Actuators
`useHaptics` &middot; `useTorch` &middot; `useHiLight`

### Radios & Wireless
`useBLE` &middot; `useChannelSounding` &middot; `useNFC` &middot; `useUWB` &middot; `useRadios` &middot; `useWifi7MLO` &middot; `useWifiRTT` &middot; `useSatelliteNTN`

### Security & Privacy
`useBiometrics` &middot; `useSecurity` &middot; `useKeyAgreement` &middot; `usePrivateSpace` &middot; `usePlayIntegrity`

### AI & Autonomous Agents (Cloud & Live Duplex)
`useGemini` &middot; `useCloudHardwareAgent` &middot; `useGeminiLive` &middot; `useSpeechAI` &middot; `useSpeech` &middot; `useAppFunctions`

`useSpeech` can request an installed Android TTS engine for one utterance with `enginePackage`, without changing the system default. It rejects a missing service and checks the active engine when Android exposes it. Android can silently fall back after a binding failure and does not provide a public API to verify the active engine on every device; verify playback on the target phone when exact engine identity matters.

### On-Device AI (`@pixelkit-labs/sdk/mlkit`)
`useGeminiNano` &middot; `useGenAITasks` &middot; `useVisionAI` &middot; `useNaturalLanguageAI` &middot; `useEmbeddings`

---

## Technical Features

### Typed Hardware Provenance
Every telemetry hook exposes `source: 'hardware' | 'derived' | 'unavailable'`. When a specific sensor or hardware feature is absent or unreadable on a device, the hook returns clean `null` values and reports `unavailable`. This gives applications deterministic typing and avoids fabricated dummy values.

### Observability on Every Call
Calls touching hardware, native modules, or filesystem are instrumented with `traced()`. Use `useObservability()` or the `<PixelKitDevTools />` in-app HUD to inspect live trace latencies, error distributions, and module health.

---

## Requirements & Compatibility

| Specification | Requirement |
| :--- | :--- |
| **Platform** | Android 14+ (API 34+), optimized for Tensor G5/G6 & Android 17 (API 37) |
| **Framework** | React Native `0.86+`, Expo SDK `~57.0+` |
| **Build** | Expo Development Build (`npx expo run:android`) or EAS Build |
| **Hardware** | Google Pixel 11 Pro, Pro XL, Pro Fold, and Pixel 8/9/10/11 series |

*PixelKit requires an Expo development build because it compiles Kotlin modules directly into your app. 15 hooks are pure JavaScript/Expo APIs and function on any Android device; native silicon and hardware hooks gracefully degrade with `source: 'unavailable'` on non-supported devices.*

Use the CLI doctor to verify your environment:
```bash
npx @pixelkit-labs/cli doctor
```

---

## Ecosystem Repositories

- **[pixelkit-template](https://github.com/PixelKit-Labs/pixelkit-template)**: Complete four-tab demo app demonstrating all 53 hooks, live AI lab, and camera/sensor visualizers.
- **[pixelkit-docs](https://github.com/PixelKit-Labs/pixelkit-docs)**: Full API reference, contracts, and interactive documentation site.
- **[pixelkit-cli](https://github.com/PixelKit-Labs/pixelkit-cli)**: Command-line diagnostics (`pixelkit doctor`) and autonomous hardware triage agent (`pixelkit agent`).

---

## License

MIT © PixelKit Labs
