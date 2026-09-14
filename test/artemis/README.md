# PixelKit Automated E2E Testing with ARTEMIS

This directory contains automated end-to-end (E2E) test recipes powered by **Google's [ARTEMIS](https://github.com/google/artemis)** autonomous mobile testing framework.

---

## 🎯 Purpose & Philosophy

PixelKit's primary contract is **hardware provenance**:
```ts
// Every hook returns source: 'hardware' | 'derived' | 'unavailable'
const cpu = useCPU();
// cpu.source is 'hardware' on physical Pixel devices
```

Unlike classic UI test suites that test synthetic layouts, PixelKit tests must verify **genuine hardware integration**:
- Thermal and silicon telemetry (`useCPU`, `useGPU`, `useADPF`, `useTPU`)
- Physical actuators (`useHaptics`, `useTorch`, `useHiLight`)
- On-device AI inference (`useGeminiNano`, `useVisionAI` via `@pixelkit-labs/mlkit`)
- Real-time sensor streams (`useSensors`, `useLocation`, `useAudio`)

ARTEMIS acts as an autonomous test engineer: it navigates [`pixelkit-template`](https://github.com/PixelKit-Labs/pixelkit-template) on a real connected Pixel phone or emulator, interacts with UI controls, monitors Logcat for native crashes in `@pixelkit-labs/native`, and verifies that values report `hardware` rather than `unavailable`.

---

## 🚀 Quick Start

### 1. Prerequisites
- **Android Device**: A physical Google Pixel phone connected via USB with **USB Debugging** enabled (or a running Android emulator).
- **ARTEMIS CLI**: Installed globally via `uv tool install -e ../artemis` (or accessible in PATH).
- **Target App**: Build and install `pixelkit-template` onto the device:
  ```bash
  cd ../pixelkit-template
  npx expo run:android
  ```

### 2. Run Tests

```bash
# Run the default silicon telemetry test (Flash mode, fast 3-5s per step)
npm run test:e2e

# Run with deep multi-agent verification & Logcat diagnostics (Pro mode)
npm run test:e2e:pro

# Run a specific recipe:
node scripts/run-artemis-e2e.js silicon
node scripts/run-artemis-e2e.js actuators
node scripts/run-artemis-e2e.js sensors
node scripts/run-artemis-e2e.js ai
node scripts/run-artemis-e2e.js full
node scripts/run-artemis-e2e.js hardware
node scripts/run-artemis-e2e.js nextgen
```

---

## 📋 Available Recipes

| Recipe | File | Focus |
| :--- | :--- | :--- |
| **Silicon Telemetry** | [`recipes/01-silicon-telemetry.md`](./recipes/01-silicon-telemetry.md) | Tests `useCPU`, `useGPU`, `useMemory`, `useADPF`, verifying `source === 'hardware'`. |
| **Actuators & Haptics** | [`recipes/02-actuators-and-haptics.md`](./recipes/02-actuators-and-haptics.md) | Tests `useHaptics` and `useTorch`, ensuring vibration patterns and flash toggle cleanly. |
| **Sensors & Capture** | [`recipes/03-sensors-and-capture.md`](./recipes/03-sensors-and-capture.md) | Tests accelerometer, barometer, location, and camera preview streams. |
| **AI & Gemini Nano** | [`recipes/04-ai-gemini-nano.md`](./recipes/04-ai-gemini-nano.md) | Tests `@pixelkit-labs/mlkit`, AICore availability, and on-device summarization. |
| **Full Sanity Suite** | [`recipes/05-full-sanity-suite.md`](./recipes/05-full-sanity-suite.md) | Traverses all 4 tabs, auditing for zero native Kotlin crashes and complete stability. |
| **Pixel 11 Pro Extensions** | [`recipes/06-pixel-11-pro-hardware.md`](./recipes/06-pixel-11-pro-hardware.md) | Tests Camera Extensions, Spatial Audio, BLE 6.0 Channel Sounding, Titan M2 Key Attestation, Perfetto, and Health Connect. |
| **Next-Gen Hardware & AI** | [`recipes/07-next-gen-hardware.md`](./recipes/07-next-gen-hardware.md) | Tests Altimeter, Mic Array, FIR Thermometer, Battery Share, Charging Intelligence, ADPF Hints, Wi-Fi 7 MLO, Wi-Fi RTT, Satellite NTN, Private Space, Key Agreement, Embeddings. |

---

## 🔌 IDE Integration (Antigravity, Claude Code, Codex)

PixelKit includes native MCP configuration in `.mcp.json`. When developing in Antigravity or Claude Code with a Pixel device connected, you can invoke Artemis directly in chat:

> *"Run the PixelKit silicon test recipe using Artemis and report any hooks returning unavailable."*
