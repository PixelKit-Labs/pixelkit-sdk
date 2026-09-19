# Changelog

All notable changes to PixelKit are recorded here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and versions follow [Semantic Versioning](https://semver.org/).

**Rule:** every change to the codebase bumps the patch version by 0.0.1 (`1.0.0 → 1.0.1 → 1.0.2 …`) and adds an entry here in the same commit. Set the version with `node scripts/sync-versions.js <version>`, which moves the root `package.json` and all three packages together and re-pins the packages to each other. Minor and major bumps are decided by the maintainer, not by agents.

## [1.6.33] - 2026-09-19

### Changed
- Consolidated accumulated SDK/native speech and telemetry work with a fresh cross-repository UI review plan in docs/FRESH_START.md.
- Recorded the missing local harness guide as unresolved; prior guide/workbench changelog entries are historical, not evidence of current availability.
- Removed obsolete generated release-pipeline artifacts as part of the existing cleanup; retained release instructions and workflows.
- Excluded local browser scratch output and device evidence from source commits.

## [1.6.32] - 2026-09-19

### Changed
- Restyled the local Delta guide using the supplied documentation reference: dark reading layout, chapter sidebar, page outline, local full-text search, keyboard navigation, and responsive menu. Preserved interactive diagrams and the component workbench.
- Added Chapter 13 with design decisions, source references, glossary, and desktop/mobile browser evidence; enabled CSS/JavaScript asset MIME types in the local server.

## [1.6.31] - 2026-09-19

### Added
- Generated individual source-derived contract pages for all 22 shared mobile component files,
  with detected props, handlers, token references, output boundaries, and audit status.

## [1.6.30] - 2026-09-19

### Added
- Expanded the local UI gallery with the full visual-surface inventory: conversation messages,
  composer, streaming response, action result, confirmation, unavailable state, session header,
  tool trace, modal frame, settings rows, media attachments, reactor modes, screen scaffolding,
  metric grids, camera viewfinder, and Docs cards.

## [1.6.29] - 2026-09-19

### Added
- Local design-system workbench token editor now writes the mobile app's shared token source through
  the localhost review server, allowing Metro to refresh the real UI after token changes.

## [1.6.28] - 2026-09-19

### Added
- Added a visible UI component gallery to the local harness site for buttons, panels, metrics,
  data rows, meters, status primitives, and unavailable states.

## [1.6.27] - 2026-09-19

### Fixed
- Speech recognition startup now waits for Android readiness, rejects service disconnection and
  bounded startup timeout truthfully, preserves explicit on-device routing, and cleans up pending
  sessions on cancellation/unmount instead of leaving recognition running without an owner.
- Removed fabricated native/browser transcription confidence values; unmeasured confidence is null.

### Added
- Added a direct **Design system catalog** entry to the local harness site's system-map sidebar.

## [1.6.26] - 2026-09-19

### Added
- Harness documentation now records the implemented mobile living design-system catalog and its
  shared-source relationship with application components.

## [1.6.25] - 2026-09-19

### Added
- Expanded the local Delta guide landing page with a full site map, architecture entry point,
  and a design-system overview card linking the token-to-runtime boundary.

## [1.6.24] - 2026-09-19

### Added
- Chapter 11 of the local Delta harness guide documents the design-system dependency boundary,
  reusable component decomposition, visual language, migration plan, and evidence status.

## [1.6.23] - 2026-09-19

### Fixed
- Cache permanently unsupported CPU/GPU headroom APIs independently, use platform-default parameters, and correctly normalize all valid Android percentages, including values at or below 1 percent.
- Share thermal headroom samples across native callers to avoid competing pollers; cache permanently denied sysfs paths instead of repeatedly triggering Android access violations.
- Remove fabricated reverse-charging wattage and preserve unavailable readings with provider error details.
- Keep workspace lockfile version metadata synchronized with package manifests.

### Added
- Local chapter-based Delta system guide with diagrams, glossary, references, product decisions and USB verification evidence.
- Agent rules requiring the guide and real-device evidence to remain current after implementation changes.
- Reproducible Gradle source override for validating local native fixes without editing installed package sources.

## [1.6.22] - 2026-09-19

### Fixed
- **Synchronous Torch Info Initialization & Actuator Race Condition Protection (`packages/sdk/src/hardware/useTorch.ts`)**:
  - Initialized `info` state synchronously using `PixelNative?.getTorchInfo() ?? null` initializer to prevent `info` from being `null` on first component render.
  - Decoupled `setTorch` callback from `[info]` dependency and removed premature `!info?.available` rejection, allowing direct hardware actuation via `PixelNative.setTorch(on, strengthLevel)` without failing during initial component mount or state update cycles.

## [1.6.21] - 2026-09-18

### Added
- **`displayContent` Option in `useGeminiNano` & `NanoOptions` (`packages/mlkit/index.ts`, `packages/sdk/src/ai/useGeminiNano.ts`)**:
  - Added optional `displayContent` property to `NanoOptions`.
  - When provided to `nano.sendMessage()`, `useGeminiNano` records `displayContent` as the user message content in `nano.messages` while transmitting the full enriched prompt to the underlying Gemini Nano engine.
  - Prevents internal hardware telemetry directives, action envelopes, and system instruction wrappers from leaking into user-facing chat bubble history.

## [1.6.20] - 2026-09-18

### Added
- **Multimodal On-Device Image Ingestion in `useGeminiNano` (`packages/sdk/src/ai/useGeminiNano.ts`)**:
  - Extended `sendMessage(prompt, sendOptions?: Partial<NanoOptions>)` to forward options including `imageBase64` directly to `PixelNano.stream`.
  - Enables on-device Gemini Nano on Google Pixel 11 Pro to process physical camera snapshots and multimodal prompts natively without cloud fallback.

## [1.6.19] - 2026-09-18

### Fixed
- **Resolved Abstract Class Number Instantiation in Battery Telemetry (`@pixelkit-labs/native`)**:
  - In `PixelNativeExtensions.kt`, removed invalid `Number(w).toDouble()` constructor invocation in `chargingIntelligence()` real-time wattage calculation, directly returning the computed `Double` wattage value `w`.
  - Fixes Android Kotlin compilation under Gradle 9.3.1.

## [1.6.18] - 2026-09-16

### Added
- **Multimodal Camera Streaming for Gemini Live (`packages/sdk/src/ai/useGeminiLive.ts`)**:
  - Extended `useGeminiLive()` to support real-time camera video and image ingestion over full-duplex WebSockets.
  - Added `sendImageChunk(base64Data, mimeType)` and `sendVideoFrame(base64Jpeg)` streaming raw camera frames into `realtimeInput.mediaChunks` alongside audio PCM streams.
  - Added `sendMultimodalTurn(text, images)` allowing conversational prompts with attached camera snapshots.
  - Exposed `isStreamingMedia` tracking media streaming activity.
- **Display Hardware Actuator Controls (`packages/native/`, `packages/sdk/src/hardware/useDisplay.ts`)**:
  - Implemented `setHighBrightnessMode(enabled)` in Kotlin native module and TypeScript hook, forcing `WindowManager.LayoutParams.BRIGHTNESS_OVERRIDE_FULL` and Android 14+ `Window.setDesiredHdrHeadroom(3.0f)` for sunlight legibility boost.
  - Implemented `setPreferredDisplayMode(modeId)` enabling apps to switch active panel configurations (resolution + refresh rate).
  - Implemented `setDesiredHdrHeadroom(headroom)` for granular HDR boost control.
  - Exposed `hdrSdrRatio` (real-time HDR to SDR ratio on Android 14+) and `isHbmActive` state on `useDisplay()`.
- **Unit Tests & Contracts (`test/display.test.ts`, `test/live.test.ts`)**:
  - Added test suite `test/display.test.ts` validating refresh rate bounds, HDR headroom clamping, and HBM flags.
  - Extended `test/live.test.ts` verifying camera image frame chunks and multimodal turn payload serialization.
  - Updated hook contracts and documentation in `pixelkit-docs` for `useDisplay` and `useGeminiLive`.
  - Regenerated OpenAPI 3.1.0 specification (266 paths, 542 schemas).

## [1.6.17] - 2026-09-15

### Added
- **Gemini 3.8 Multimodal Live Streaming Hook (`packages/sdk/src/ai/useGeminiLive.ts`)**:
  - Implemented `useGeminiLive()` establishing full-duplex WebSocket connections to the Gemini Multimodal Live API (`BidiGenerateContent`).
  - Implemented bidirectional streaming for audio PCM packets (16kHz mono), synthesized voice responses, and real-time text.
  - Bound the unified PixelKit hardware tool registry into live streaming turns with real-time automatic tool dispatch and WebSocket `toolResponse` execution.
  - Exposed live extended thinking thought streams (`currentThinking`) and active tool invocation states (`activeToolCalls`).
- **Autonomous Cloud Hardware Agent Hook (`packages/sdk/src/ai/useCloudHardwareAgent.ts`)**:
  - Implemented `useCloudHardwareAgent()` React hook wrapping multi-turn autonomous reasoning loops (`runCloudAgent`).
  - Surfaces real-time intermediate step traces (`steps`), token budgets, and complete conversation history.
- **Unit Tests & Contracts (`test/live.test.ts`)**:
  - Added unit test suite verifying WebSocket endpoint URIs, setup message serialization, tool dispatch wrapping, and audio PCM chunking.
  - Added hook contracts and documentation for `useCloudHardwareAgent` and `useGeminiLive` in `pixelkit-docs` (53 total hooks).

## [1.6.16] - 2026-09-15

### Added
- **ARTEMIS Recipe 08: Cloud Hardware Agents & Google ADK Diagnostics (`test/artemis/recipes/08-cloud-agents-and-adk.md`)**:
  - Added on-device automated end-to-end verification recipe for Google ARTEMIS testing the Unified Hardware Tool Registry, autonomous cloud agent loop (`runCloudAgent`), and the Google ADK multi-agent diagnostic team (`runDiagnosticTeam`).
  - Added `agents` and `adk` runner aliases to `scripts/run-artemis-e2e.js`.
  - Updated repository map in `AGENTS.md`, `CLAUDE.md`, and `GEMINI.md` to reflect recipe coverage through 08.

## [1.6.15] - 2026-09-15

### Added
- **Google Agent Development Kit (ADK) Integration (`packages/sdk/src/ai/adk/`)**:
  - Implemented ADK-compatible tool definitions (`createADKTool`, `ADKTool`) wrapping `@google/genai` FunctionDeclarations with strongly-typed execution handlers.
  - Implemented `createADKAgent()` providing autonomous specialist reasoning agents capable of multi-turn tool loops.
  - Implemented `createDiagnosticSpecialists()` and `runDiagnosticTeam()` orchestrating a multi-agent diagnostic team (Silicon & Thermals Architect, Battery & Power Specialist, Radios & Sensor Specialist, and Lead Diagnostic Coordinator).
  - Generates structured, zero-simulation diagnostic reports (`DiagnosticReport`) with severity verdicts (`healthy` | `warning` | `critical`), root-cause summaries, and actionable hardware recommendations.
  - Added unit test suite `test/adk.test.ts` verifying tool declaration creation, specialist reasoning loops, and coordinator report synthesis.
  - Exported ADK types and team runners from `@pixelkit-labs/sdk`.

## [1.6.14] - 2026-09-15

### Added
- **Autonomous Multi-Turn Cloud Agent Loop (`packages/sdk/src/ai/agent/cloudAgent.ts`, `runCloudAgent`)**:
  - Implemented `runCloudAgent()` executing autonomous multi-turn reasoning loops with Google Gen AI SDK (`@google/genai`).
  - Supports automatic function call dispatch, parallel tool execution, configurable step bounds (`maxSteps`, defaulting to 6 to prevent runaway invocation loops), sampling temperature, live step callbacks (`onStep`), and full execution audit trails (`AgentStepInfo[]`).
  - Added unit test suite `test/agent.test.ts` validating autonomous dispatch, dynamic hardware inspection, multi-step conversation histories, and graceful cutoff on step limit exhaustion.
  - Exported `runCloudAgent`, `DEFAULT_AGENT_MODEL`, `DEFAULT_MAX_STEPS`, and agent types (`CloudAgentOptions`, `CloudAgentResult`, `AgentStepInfo`) from `@pixelkit-labs/sdk`.

## [1.6.13] - 2026-09-15

### Added
- **Unified Hardware Tool Registry for Google Gen AI SDK & ADK (`packages/sdk/src/ai/tools/`)**:
  - Implemented `registry.ts` and `hardwareTools.ts` providing typed tool registration (`defineTool`, `getTool`, `listTools`, `runTool`) and translation to `@google/genai` `FunctionDeclaration` schemas (`toFunctionDeclarations`).
  - Added `registerHardwareTools()` exposing physical actuators (`set_torch`, `play_haptic`, `set_hilight`, `set_battery_share`) and real-time telemetry readers (`get_thermal_headroom`, `get_barometer`, `get_thermometer`, `get_battery_health`, `get_wifi7_status`) with strict Zero-Simulation enforcement.
  - Added complete unit test suite `test/tools.test.ts` with 5 behavioral tests covering parameter validation, Gemini schema conversion, error handling, and hardware execution.

## [1.6.12] - 2026-09-15

### Added
- **Gemini 3.8 Live & Live Extended Thinking Support (`packages/sdk/src/ai/geminiClient.ts`)**:
  Added `gemini-3.8-live` and `gemini-3.8-live-extended-thinking` to `DEFAULT_MODELS` and `listAvailableModels`. This enables developers and the demo app's AI Lab to select Google's September 2026 real-time speech-to-speech dialogue models with asynchronous background reasoning.

## [1.6.11] - 2026-09-13

### Documentation
- **The SDK's description names the compute silicon.** The one-sentence description used in `README.md`, `packages/sdk/README.md` and the `@pixelkit-labs/sdk` npm description listed sensors, radios, secure hardware, camera and audio, telemetry, haptics and AI, and never the CPU, GPU or TPU that `useCPU`, `useGPU` and `useTPU` read. It now leads with them. The npm description changes with the next publish.

## [1.6.10] - 2026-09-13

### Changed
- **OpenAPI Route & Dual Path Resolution (`scripts/export-openapi.js`)**:
  Synchronize OpenAPI specification to both `public/` and `public/api/` in `pixelkit-docs` ensuring seamless resolution for both root and nested relative paths.

## [1.6.9] - 2026-09-13

### Changed
- **Practical CI/CD & Drift Verification Hardening**:
  - `check-openapi.js`: Added cross-platform CRLF/LF line ending normalization to prevent false-positive drift on Windows. Added automated shallow-clone fallback for hook contracts so drift verification never skips in isolated CI environments.
  - `verify.yml`: Reordered `npm run check-openapi` before `npm run build` so that uncommitted specification drift in pull requests is detected before build overwrites it. Added a dedicated pull-request drift check step ensuring `spec/` has no uncommitted changes.
  - Modernized GitHub Actions to `@v7` (`actions/checkout@v7`, `actions/setup-node@v7`) across workflows (`verify.yml`, `release.yml`) matching `pixelkit-template` and eliminating Node 20 deprecation warnings.

## [1.6.8] - 2026-09-13

### Added
- **OpenAPI 3.1.0 Specification Export (`scripts/export-openapi.js`, `spec/openapi.json`, `spec/openapi.yaml`)**:
  Added automated generation of a complete OpenAPI 3.1.0 specification covering all 51 hardware and AI hooks, telemetry endpoints, and physical actuators. Enforces the Zero-Simulation Principle (`source: 'hardware' | 'derived' | 'unavailable'`).
- **Automated CI/CD Synchronization & Drift Verification (`scripts/check-openapi.js`, `.github/workflows/verify.yml`)**:
  Integrated `export:openapi` into `npm run build` and `scripts/sync-versions.js`. Added `check-openapi` to `npm run verify` and CI to guarantee 100% parity with zero drift. Configured automated GitHub Actions commit-back step on `master` pushes.
- **Unit Test Suite for OpenAPI 3.1 (`test/openapi.test.ts`)**:
  Added unit tests verifying metadata, 6 canonical categories, all 51 hook paths, action endpoints, zero-simulation enum constraints, and clean YAML serialization without dangling references.

## [1.6.7] - 2026-09-13

### Documentation
- **The agent guides now say how to keep everything current.** A new rule 7 lists, for each kind of change, every file in every PixelKit repository that has to change with it and which check enforces it — and says plainly where nothing does: ARTEMIS recipes, hook counts stated in prose, and the CLI's default package id. A new rule 8 on coordinating with other agents, which the template's guide already had and this one lacked. Rule 1 now says how to record a change that shipped without an entry. Rule 3 warns that trace correlation is only correct for sequential calls. Rule 6 notes that pushing a `v*` tag publishes to npm, so it happens only when the maintainer asks. The Map names the recipes correctly, 01 through 07, and the unit tests.
- The guides no longer state the number of hooks, which is exactly the kind of figure rule 7 describes as unchecked.

## [1.6.6] - 2026-09-13

### Added
- **The docs contract now checks the README and the agent pages.** `check-docs` fails when `README.md` does not name every exported hook — it had fallen to 32 of 51 — and when `docs/AI_PRIMER.md` or an `ai-guidance` page in pixelkit-docs imports a name that neither `@pixelkit-labs/sdk` nor `@pixelkit-labs/sdk/mlkit` exports, or imports it from the wrong one. The docs checkout now takes `docs/` as well as `data/hooks` so those pages can be read. (`830b3f9`, `cf99c94`)

### Changed
- **README brought to 51 hooks.** The Hooks section names all 51. The degradation sentence is measured from the source: 13 hooks import no Kotlin module, 37 do, and `useHiLight` drives the camera-bar LEDs through a local ADB daemon. `useEmbeddings` is listed under the `/mlkit` subpath, where it is actually exported, and the provenance link points at its own documentation page. `RELEASING.md` and `packages/sdk/README.md` counts updated to 51. (`830b3f9`, `cf99c94`)
- `test/capabilities.test.ts`: dropped the claim that the capability table gates "26 of the 39 hooks", which did not match what imports it. (`830b3f9`)

### Fixed
- **The versioning rule described steps that no longer exist.** The rule at the top of this file said to bump `expo.version` in `app.json` and increment `expo.android.versionCode`; there has been no `app.json` in this repository since the app moved to pixelkit-template. `AGENTS.md`, `CLAUDE.md` and `GEMINI.md` said `sync-versions.js` moves Android build versions in lockstep; it moves the four `package.json` files and nothing else. Both now describe what the script does.

### Recorded late
These landed without an entry in the commit that made them. They are listed so the record is complete, with the release each first shipped in.

| Commit | First shipped | Change |
| :--- | :--- | :--- |
| `46e5dcf` | 1.6.0 | The `getSlowestTraces` test no longer flakes under CI load: its slow operation waits 80 ms instead of 30, so its ordering against the others is not decided by timer jitter. |
| `f4f476d` | 1.6.1 | README, `RELEASING.md`, `packages/sdk/README.md` and the capabilities test comment aligned to 39 hooks. |
| `c569e3b` | not yet released | Removed the `<h1>` title from the top of `README.md`. |
| `696e41c` | not yet released | Added `AGENTS.md`, `CLAUDE.md` and `GEMINI.md`, the identical agent guides. 1.6.3 records a later update to them, not their addition. |
| `830b3f9`, `cf99c94` | not yet released | The README and contract-check changes above. |

## [1.6.5] - 2026-09-13

### Documentation
- **Synchronized Package READMEs**: Updated `packages/sdk/README.md` to index all 51 hooks across their official categories, updated `packages/native/README.md` to detail next-gen hardware telemetry and actuators, updated `packages/mlkit/README.md` with on-device `Embeddings` and `useEmbeddings`, and updated `test/artemis/README.md` with recipe execution examples.

## [1.6.4] - 2026-09-12

### Added
- **ARTEMIS Recipe 07 (Next-Gen Hardware & AI Verification)**: Added `test/artemis/recipes/07-next-gen-hardware.md` defining autonomous on-device test flows for all 12 next-gen capabilities: `useAltimeter`, `useMicrophoneArray`, `useThermometer`, `useBatteryShare`, `useChargingIntelligence`, `useADPFHintSession`, `useWifi7MLO`, `useWifiRTT`, `useSatelliteNTN`, `usePrivateSpace`, `useKeyAgreement`, and `useEmbeddings`.
- **E2E Test Runner Integration**: Added `nextgen` and `expansion` recipe aliases to `scripts/run-artemis-e2e.js` and updated `test/artemis/README.md`.

## [1.6.3] - 2026-09-12

### Documentation
- **Synchronized Agent Guides**: Updated `AGENTS.md`, `CLAUDE.md`, and `GEMINI.md` to reflect the 51-hook expansion architecture across Silicon, Sensors, Radios, Security, and AI. Verified identical SHA-256 hashes across all three files.

## [1.6.2] - 2026-09-12

### Added
- **12 Next-Generation Hardware and AI Capabilities (39 → 51 Hooks)**:
  Expanded the PixelKit SDK from 39 to 51 hooks across Silicon, Sensors, Radios, Security, and AI:
  - **Phase 1 (Sensors & Acoustics)**:
    - `useAltimeter`: Precision barometric altimetry derived from the ICAO standard atmosphere formula ($h = 44330 \times (1 - (P/P_0)^{0.1903})$), smoothed vertical climb velocity in m/s, storm pressure trend detection, and custom QNH sea-level pressure calibration.
    - `useMicrophoneArray`: Multi-mic chassis acoustic array topology from `AudioManager.getMicrophones()`, polar directivity patterns (`cardioid`, `hypercardioid`, `omnidirectional`), and hardware beamforming direction steering (`user`, `away`, `external`, `omni`) with acoustic zoom field dimensions.
    - `useThermometer`: Non-contact infrared temperature measurement interfacing with the Melexis MLX90632 far-infrared (FIR) thermopile sensor on Google Pixel Pro devices (8/9/10/11 Pro), featuring emissivity coefficient tuning and measurement modes (`object`, `body`, `ambient`).
  - **Phase 2 (Silicon & Battery)**:
    - `useBatteryShare`: Google Pixel reverse wireless charging (Qi TX coil) control and telemetry querying the kernel `/sys/class/power_supply/wireless/reverse_chg_mode` subsystem, supporting receiver docking detection, power wattage delivery, and safety battery cutoff percentage limits.
    - `useChargingIntelligence`: In-depth battery health telemetry surfacing lifetime physical charge cycle counts (`BatteryManager.EXTRA_CYCLE_COUNT`), maximum state-of-health percentage ($\text{SoH}$), battery pack manufacture and activation dates, 80% charge protection limit detection, and real-time charging wattage tiering (`slow`, `standard`, `rapid`, `ultra_rapid`).
    - `useADPFHintSession`: Active frame workload deadline negotiation with `android.os.PerformanceHintManager` (ADPF) and the Tensor Energy-Aware Scheduler (EAS), allowing dynamic render target updates and actual duration reporting in nanoseconds.
  - **Phase 3 (Advanced Radios & Mesh)**:
    - `useWifi7MLO`: Wi-Fi 7 (802.11be) Multi-Link Operation telemetry querying affiliated physical links across 2.4 GHz, 5 GHz, and 6 GHz spectrum with 320 MHz channels, calculating combined aggregate PHY throughput.
    - `useWifiRTT`: Fine Timing Measurement (802.11mc / 802.11az) indoor centimeter-level positioning via `WifiRttManager`, measuring round-trip time distances to access point BSSIDs.
    - `useSatelliteNTN`: 3GPP Release-17 Non-Terrestrial Network (NTN) satellite link tracking via Android 15 `TelephonyManager.isSatelliteSupported()`, reporting constellation connection states, provider networks, signal bars, and antenna pointing guidance.
  - **Phase 4 (Security & Edge AI)**:
    - `usePrivateSpace`: Android 15+ (API 35+) Private Space vault isolation detection via `UserManager.isPrivateProfile()`, detecting whether the running process is within the secure partition and auditing auto-lock timeout policies.
    - `useKeyAgreement`: Titan M2 StrongBox Elliptic Curve Diffie-Hellman (ECDH) session key agreement on the NIST P-256 curve (`secp256r1`) via `AndroidKeyStore`, deriving symmetrical shared secrets in hardware without exposing private keys.
    - `useEmbeddings`: On-device 512-dimensional vector embedding generation and cosine similarity scoring on the Google Tensor EdgeTPU via `@pixelkit-labs/mlkit`, enabling offline semantic search and local RAG.
- **Zero-Simulation Principle & Observability**:
  - All 12 hooks strictly enforce `source: 'hardware' | 'derived' | 'unavailable'`. Values default to `null` and em dash (`—`) when hardware is unsupported, with zero fabricated data.
  - All platform invocations wrapped in `traced()`.
- **Documentation Contract Verification**:
  - Synchronized all 51 hook documentation contracts in `pixelkit-docs/data/hooks/` with 100% field parity against generated TypeScript declarations.
- **Test Suite Expansion**:
  - Added unit test suites for altimetry mathematics, charging tiers, radio link aggregation, and vector embeddings, bringing total coverage to 53 passing tests across 17 suites.

## [1.6.1] - 2026-09-09

### Added
- **Web Speech Recognition Support in `useSpeechAI`**:
  Added native browser Web Speech API support (`webkitSpeechRecognition` / `SpeechRecognition`) to `useSpeechAI`. When running on Web, voice input now streams real-time transcript tokens directly from the browser microphone without requiring cloud API keys or native modules.

### Fixed
- **Web Bundler White Screen (`useMediaLibrary.web.ts`)**:
  Added a dedicated web-safe fallback stub for `useMediaLibrary` that reports `available: false` and `source: 'unavailable'` when run in browsers, preventing `expo-media-library`'s native module import from throwing top-level uncaught errors during web bundle execution.
- **Web Battery Telemetry Listener Warning**:
  Guarded battery level and state listener attachments in `useDevice.ts` with `Platform.OS !== 'web'` to eliminate console warnings on web platforms lacking native battery listener support.

## [1.6.0] - 2026-09-09

### Added
- **Full Pixel 11 Pro and Android 17 Hardware Suite (32 → 39 hooks)**:
  Expanded the SDK from 32 to 39 hardware hooks with 7 major native features sitting on Google Tensor G6, Android 17 (API 37), and physical Pixel 11 Pro silicon:
  - `<PixelKitDevTools />`: floating, draggable in-app developer HUD for live monitoring of Choreographer display FPS, ADPF thermal headroom states, and Tensor G6 CPU cluster load.
  - `useCameraExtensions`: direct vendor CameraX HAL extensions providing hardware Night Sight, Ultra HDR 10-bit gainmaps, Portrait Bokeh, and Face Retouch.
  - `useAppFunctions`: Android 17 `IAppFunctionManager` dynamic function registry bridge for system Gemini Assistant execution and tool calling.
  - `useSpatialAudio`: `android.media.Spatializer` API integration and 6-DOF dynamic head tracking with Pixel Buds Pro / Pro 2 via BLE Audio/A2DP.
  - `useChannelSounding`: Bluetooth Core Specification 6.0 Phase-Based Ranging (PBR) and RTT tone exchanges delivering centimeter-accurate proximity and distance anti-spoofing.
  - `usePlayIntegrity`: Google Play Integrity API integration coupled with StrongBox Keystore 400 EC keypair attestation inside the isolated Titan M2 security enclave.
  - `useRadios`: expanded to detect Thread 802.15.4 mesh (`chip0`) and physical Satellite SOS provider availability (`SATELLITE_SOS_PROVIDER_1`).
  - `usePerfetto`: low-overhead system profiling with the Android 17 Perfetto tracing service (`traced` v54.0+) and kernel ftrace ring buffer markers via `android.os.Trace`.
  - `useHealthConnect`: unified Android Health Connect encrypted SQLite data queries paired with direct hardware step counter and PPG heart rate sensor interrupts.
- **ARTEMIS Recipe 06**: automated end-to-end hardware verification recipe (`test/artemis/recipes/06-pixel-11-pro-hardware.md`) covering all newly added hardware extensions with zero native exceptions.
- **Hardware Probing & Capabilities Refinement**:
  - `verifyCapabilities` and `useTPU` now verify both `android.hardware.npu` and `android.hardware.neural_processing_unit`, ensuring true hardware provenance on Pixel 11 Pro.
  - Added 12 comprehensive production guides and 11 interactive Archify vector diagrams across the documentation portal.

## [1.5.5] - 2026-09-08

### Fixed
- **The README described components the SDK does not export.** `packages/sdk/src` contains `ai`,
  `core` and `hardware` and nothing else - the components and the theme went when this repository
  became packages-only at 1.2.0. The package table said "design system", the feature list named
  `Colors`, `Type`, `MetricCard`, `HapticButton`, `ScreenScaffold` and `Decor`, and the quickstart
  imported `MetricCard` from `@pixelkit-labs/sdk`.

  That last one is the one that matters: it is the first code a reader copies, and it would not
  compile. The quickstart now renders the reading directly and shows the em dash a `null` produces.

  Caught while looking for the next thing to test, by listing `src/` rather than trusting an earlier
  reading of it. Nothing else would have caught it: the docs contract checks hooks against their
  types, and a README code sample is checked by nobody.

## [1.5.4] - 2026-09-08

### Added
- 23 behavioural tests for the observability layer, bringing the suite to 39. This is the layer
  rule 10 is enforced by, and its doc comments make promises nothing was executing: that
  `tracedSafe` returning a fallback still counts and logs the failure rather than swallowing it,
  that `noteExpected` is counted but deliberately not logged so a teardown path cannot flood the
  event log, and that anything thrown - a string, an object with no message, `null` - becomes a
  usable message rather than "undefined".

  Mutation-verified: stopping `tracedSafe` from routing through `traced` fails the "never
  swallowed" test, making `noteExpected` log fails one, sorting `getSlowestTraces` ascending fails
  one, and returning `String(null)` from `normalizeError` fails one.

### Fixed
- One test asserted on a field that does not exist. A failure event carries the operation in
  `event` and the message in `data.message`; the test read `message` off the event and compared
  `undefined` against a pattern. It now checks the module, the event name and the message where
  each actually lives.

## [1.5.3] - 2026-09-08

### Added
- **The first behavioural tests.** Every guard in this repository was static: the type checker
  proves the code is well-formed, the parity check proves each exported hook has somewhere to try
  it, and the documentation contract proves each documented field exists on its type. None of them
  execute a line of logic, so none would notice a wrong answer.

  16 tests over `resolveCapabilities` and `verifyCapabilities` in `test/capabilities.test.ts`.
  That file is hand-maintained hardware knowledge - which Pixel generation gained UWB, which gained
  the HiLight array, which Gemini Nano tier AICore serves - and its output decides `unsupported`
  rather than a reading for 19 of the 32 hooks. It is both the most likely thing to be wrong and the
  most consequential when it is, and it is a pure function, so it needs no device or emulator.

  Verified by mutation rather than by passing: changing the HiLight gate from `generation >= 11` to
  `>= 12` fails two tests, moving the Nano v3 boundary fails one, and removing the `?? base.hasUWB`
  fallback in `verifyCapabilities` fails one. Before this, all three changes left CI green while
  `useHiLight` went dark on every Pixel 11 Pro.

- `npm test`, run by both workflows. It adds no dependency: Node runs the TypeScript directly and
  its own test runner reports it, which suits a repository whose devDependencies are two entries.

### Changed
- `npm run verify` runs the tests between the type check and the build. Both CI workflows call the
  individual scripts rather than `verify`, so the step was added to each explicitly - adding it only
  to `verify` would have left CI unchanged.

## [1.5.2] - 2026-09-08

### Changed
- The README stated constraints as argument rather than fact. "Android only" and the provenance
  model each ran several paragraphs defending the design, the sentence about `pixelkit doctor`
  appeared twice verbatim in consecutive sections, and the whole `Provenance` table explained a
  concept the documentation already covers - on a page a reader reaches while writing code rather
  than while deciding whether to install.

  Replaced with **Requirements** and **Supported devices**: the same information as a table, said
  once. The provenance model is one line under the hook list, pointing at the documentation.

### Added
- **The README never stated its peer compatibility.** It pins `expo ~57.0.20`, `react-native
  0.86.3` and `react 19.2.3` exactly, so anyone on a different Expo SDK hits a resolution failure
  with nothing to explain it. That is what a Requirements section is for, and it was the one thing
  the removed prose was crowding out.

## [1.5.1] - 2026-09-08

### Changed
- Every "Documentation" link pointed at the `pixelkit-docs` **repository** rather than the rendered
  site, which now exists at <https://pixelkit-labs.github.io/pixelkit-docs/>. A reader following one
  landed on a source tree instead of the reference. Updated in the repository README hero, the API
  pointer, and `@pixelkit-labs/sdk`'s README; the entry in the repositories table still links the
  repository, because that row is about repositories, and now names the site alongside it.
- `@pixelkit-labs/native` and `@pixelkit-labs/mlkit` had no documentation link at all. Both now
  carry one, which matters most for them: their npm pages are where someone lands after seeing an
  unfamiliar dependency and wanting to know what it is.

## [1.5.0] - 2026-09-08

The positioning was backwards. This corrects it.

### Changed
- **PixelKit leads with on-device AI, not telemetry.** The hardware layer is not a parallel feature
  set - it is the instrumentation that makes on-device inference usable. `useTPU` reports what
  AICore exposes, `useADPF` gives thermal headroom, `capabilities.ts` maps Gemini Nano tiers per
  generation, precisely because inference is thermally expensive and capability-gated and you need
  to know when to fall back to cloud. Describing hardware first and AI as an afterthought sold the
  weaker product.
- The README says the kit **degrades rather than fails** on other hardware: 13 of the 32 hooks are
  pure Expo and JavaScript and work on any Android device; the other 19 need the Kotlin modules and
  report `unsupported` where the silicon is absent. That is a wider and more honest audience than
  "Pixel 11 Pro only", which was never true - `capabilities.ts` covers Pixel 6, 8, 9 and 11.
- npm keywords now name what people search for: `on-device-ai`, `gemini-nano`, `mlkit`,
  `offline-translation`, `document-scanner`, `speech-to-text`.

## [1.4.9] - 2026-09-08

### Changed
- New banner: portrait, 662x806, and 104 kB rather than 2.0 MB - a twentieth of the old file, which
  was most of the repository weight and loaded on every visit to the page.
- The README rendered it at `width="640"`, sized for the old landscape image. At the new aspect that
  is a 779 px tall header, so every word of the description sat below the fold. Now `width="300"`,
  about 365 px tall.

## [1.4.8] - 2026-09-08

### Changed
- "Gemini running on the device itself" described a fraction of the AI surface. It is cloud Gemini
  *and* Gemini Nano, summarize/proofread/rewrite, vision and document scanning, language
  identification, offline translation across 58 languages, smart reply, entity extraction, and
  speech in both directions. The hero and the `@pixelkit-labs/mlkit` description say so.
- The hooks list groups AI by **entry point** rather than by cloud versus on-device, because two
  hooks are both: `useVisionAI` combines cloud Gemini multimodal with on-device ML Kit, and
  `useSpeechAI` uses on-device streaming recognition or cloud Gemini audio. Splitting them by where
  they run would have been wrong about both; splitting by entry point is also what decides your
  import.
- "Hardware and on-device AI" became "Hardware and AI", since half of it is not on-device.

## [1.4.7] - 2026-09-08

### Changed
- Dropped "without writing Kotlin" from the npm description and both README heroes. It framed the
  kit by what you avoid rather than what you get. The remaining references to Kotlin describe what
  `@pixelkit-labs/native` and `@pixelkit-labs/mlkit` actually are, which is a fact worth keeping.

## [1.4.6] - 2026-09-08

### Changed
- The descriptions led with the provenance model, which is an implementation detail, not the
  product. PixelKit is a **development kit for the Google Pixel 11 Pro, Pro Fold and Pro XL**:
  hardware and on-device AI as typed React hooks, so TypeScript, React Native and Expo developers
  can build on the Pixel without writing Kotlin. That is what the npm descriptions, the repository
  descriptions and both README heroes now say.
- 1.4.5 widened the device claim to "Google Pixel hardware" on the reasoning that naming the Pro
  line excluded users. That was wrong about the product: it is built for the Pro line, and the
  descriptions name it again.

## [1.4.5] - 2026-09-08

### Changed
- The descriptions said two different things about what hardware this supports. npm claimed "The
  Google Pixel **11 Pro** as React hooks"; GitHub claimed "The Google Pixel". The narrow one was
  wrong: only `useHiLight` is 11 Pro specific, and CPU, thermals, sensors, radios, biometrics and
  Nano work across Pixels, with the generic hooks working on any Android. Both now say Google Pixel
  hardware, and the package README opener matches.
- The `pixelkit-docs` repository description was "Documentation site for PixelKit", which hid the
  part that matters: it is the contract the SDK is validated against in CI.

## [1.4.4] - 2026-09-08

### Fixed
- The published README for `@pixelkit-labs/sdk` was titled `# pixelkit`, so npm rendered the wrong
  name at the top of the package page.
- `@pixelkit-labs/native` and `@pixelkit-labs/mlkit` both linked to
  `npmjs.com/package/pixelkit`, which 404s - that name was never published. Both now point at
  `@pixelkit-labs/sdk`.
- The repository README still listed `pixelkit` in the packages table.
- The package README listed all seven AI hooks in one row, implying they all import from the main
  entry. Four of them are only reachable through `@pixelkit-labs/sdk/mlkit`, so the row is split and
  says which is which. Someone following the old table would have hit an unresolved import.

## [1.4.3] - 2026-09-08

### Changed
- **The flagship package is `@pixelkit-labs/sdk`, not `pixelkit`.** npm refused the unscoped name
  with `403 Package name too similar to existing package pixel-kit` - an abandoned Angular component
  library last touched in 2022. A registry 404 means unregistered, not publishable: the similarity
  rule only runs at publish time, so the name was never actually available and checking for a 404
  was never sufficient.

  `packages/pixelkit` is now `packages/sdk`, matching `native` and `mlkit`. The subpath is
  `@pixelkit-labs/sdk/mlkit`. Install is `npx expo install @pixelkit-labs/sdk @pixelkit-labs/native`.

### Fixed
- The tag-match guard in `release.yml` iterated `for p in pixelkit native mlkit`, which is a list of
  directory names, and `packages/pixelkit` had become `packages/sdk`. The first `v1.4.3` run failed
  there with `Cannot find module ./packages/pixelkit/package.json` - the guard stopping the release
  rather than letting a rename ship half-checked, which is what it is for.
- The CI consumer-install step still expected `/tmp/pixelkit-$version.tgz`. A scoped tarball is
  named after the full name, so it is `pixelkit-labs-sdk-$version.tgz`. Second time this exact trap
  appeared today, so the comment above the step now names the rule rather than the instance.

### Published
- `@pixelkit-labs/native@1.4.2` and `@pixelkit-labs/mlkit@1.4.2` are live with provenance. They
  succeeded before the third publish failed, so the registry holds two of three; this release moves
  all of them to the same version rather than publishing the SDK alone.

## [1.4.2] - 2026-09-08

### Fixed
- The `v1.4.1` release failed at `npm publish` with `EOTP`: the access token enforced two-factor
  authentication on publish, which no CI can satisfy because there is nobody to enter a code. A
  granular access token replaced it. Nothing reached the registry - the failure was on the first of
  the three publishes - so there was no partial release to unwind, and this is a clean first
  publish rather than a repair.

  Everything before the publish step passed on that run, including the tag-match check, which only
  executes on a real tag push and had until then only been exercised locally.

## [1.4.1] - 2026-09-08

### Fixed
- `release.yml` read `secrets.NPM_TOKEN`, but the secret on the repository is named `PIXELKIT`.
  A workflow reading a secret that does not exist gets an empty string, so the publish would have
  failed on authentication with nothing obviously wrong in the log. The workflow now reads
  `secrets.PIXELKIT` and says in a comment what that secret holds, since the name does not.
  `RELEASING.md` and the pipeline diagram match.

## [1.4.0] - 2026-09-08

The npm organisation is `pixelkit-labs`, so the scope is too. Minor rather than patch because the
package names change, and this is the version intended for the first publish.

### Changed
- **`@pixelkit/native` and `@pixelkit/mlkit` are now `@pixelkit-labs/native` and
  `@pixelkit-labs/mlkit`.** A scope is owned by an npm organisation of the same name, and the
  organisation is `pixelkit-labs`, matching the GitHub org. 72 occurrences across 36 files, plus
  the `peerDependenciesMeta` optional flag, the `sync-versions` name-to-directory map, both
  workflows, the tsconfig paths and the diagram. `pixelkit` stays unscoped, so the install anyone
  types is unchanged.
- `RELEASING.md` names the real prerequisite: a **granular access token** with read and write on
  the `@pixelkit-labs` scope and on the unscoped `pixelkit` package. npm is restricting classic
  tokens that bypass 2FA. On a first publish the unscoped package does not exist and cannot be
  selected by name, so the token has to cover all packages until it does.

### Fixed
- The CI consumer-install step referenced `/tmp/pixelkit-native-$version.tgz`. `npm pack` names a
  scoped tarball after the full name, so it is `pixelkit-labs-native-$version.tgz` now; the old
  path would have failed the step. Caught by packing locally rather than by pushing and waiting.

### Verified
- Both tarballs install into a scratch project and `pixelkit` and `pixelkit/mlkit` both resolve,
  with `pixelkit` depending on `@pixelkit-labs/native@1.4.0`.

## [1.3.4] - 2026-09-08

### Fixed
- **`RELEASING.md` described releasing an app.** It still covered EAS build profiles, keystores,
  `assembleRelease` debug-signing, Play data safety and store screenshots - none of which apply to a
  repository that contains no app. That runbook belongs to `pixelkit-template`, and this one now
  documents what actually happens here: `sync-versions`, the gates, the tag, and `release.yml`
  publishing three packages in dependency order.

  It states the two things a reader cannot infer and will otherwise get wrong: publish order is
  `@pixelkit/native`, `@pixelkit/mlkit`, `pixelkit` because `pixelkit` pins the other two exactly,
  and `dry_run` skips both the publish step *and* the tag-match check, so a green dry run is not
  proof the tag guard works. It also records that npm unpublish is restricted after 72 hours and a
  version number can never be reused, so recovery is always forward.

### Verified
- `release.yml` passes end to end in dry-run mode: checkout, `npm ci`, typecheck, build and
  `npm pack --dry-run` on all three packages.
- The tag-match guard was exercised locally in all three cases - matching tag accepted, wrong tag
  rejected, and a single drifted manifest rejected by name. That last case is the one
  `sync-versions.js` exists to prevent.

## [1.3.3] - 2026-09-08

### Added
- `docs/release-pipeline.html`, a diagram of how a version tag becomes three published packages and
  reaches the template, kept in this repo so it versions with the workflows it describes.
  `docs/release-pipeline.workflow.json` is its source. It records the parts that are easy to get
  wrong: publish order is `@pixelkit/native`, then `@pixelkit/mlkit`, then `pixelkit`, because
  `pixelkit` pins the other two exactly; Dependabot groups the three for the same reason, since
  ungrouped it would open three pull requests and two could not resolve; and the template parity
  check runs against the installed package, so a hook the new SDK exports with nowhere to try it
  fails the pull request by name.
- The diagram marks the current blocking state honestly: `NPM_TOKEN` is not configured, so
  `release.yml` cannot publish, and nothing is on the registry yet.

## [1.3.2] - 2026-09-08

### Fixed
- **CI had never passed.** The "A consumer can import both entries" step failed on every run since
  it was added, reporting "main entry missing" - which was not the problem. Three faults stacked:
  `pixelkit` pins `@pixelkit/native` by exact version and that version is not on the registry until
  release, so the install had nothing to resolve; the glob `pixelkit-*.tgz` also matches
  `pixelkit-native-*.tgz`, so the wrong tarball could be picked; and the scratch project has no
  react, react-native or expo, so peer resolution could never succeed. A trailing `|| true` hid all
  three and let the step fail later with a misleading message.

  It now packs `@pixelkit/native` alongside `pixelkit` and installs both by exact filename with
  `--legacy-peer-deps --ignore-scripts`, then calls `require.resolve` on both entries rather than
  testing that files exist - resolution is what the `exports` map has to get right, and a file being
  present does not prove it. `set -euo pipefail`, and no `|| true` anywhere.

## [1.3.1] - 2026-09-07

### Fixed
- `.pixelkit-docs/`, the shallow clone `scripts/check-docs-contract.js` makes to check this source
  against the docs repo, is gitignored. It was showing as untracked after every `npm run verify` and
  was one `git add -A` away from committing a copy of another repository into this one.

## [1.3.0] - 2026-09-07

The documentation is now the contract, and the code is checked against it.

Moving `docs/` out left nothing stopping a rename from silently making a page wrong. Rather than
move the docs back, this inverts the relationship: the documentation repository holds a structured
definition per hook, and this repository proves it still tells the truth.

### Added
- **`scripts/check-docs-contract.js`**, run by `npm run verify` and by CI. It clones
  `pixelkit-docs`, reads `data/hooks/*.json`, and fails on three things:
  1. A hook exported here with no documentation entry.
  2. A documented hook this SDK no longer exports - worse than no page, because it sends a reader
     looking for something that was deleted.
  3. A documented `returns` field that does not exist on the hook's declared type, read from the
     built `.d.ts`. This is the failure nobody notices, because the docs still look complete.

  All three verified by mutation: inventing a `turboBoostGHz` field on `useCPU`, deleting
  `useTorch.json`, and adding a page for a `useQuantumRadio` that does not exist each fail the build
  naming the problem.

- The 32 hook definitions themselves, extracted from the template's in-app documentation data rather
  than rewritten - 460 documented fields, functions and parameters, already structured, already
  reviewed. They live in `pixelkit-docs/data/hooks/`.

### Notes
- Resolving inherited members took two attempts worth recording. `CapabilitiesState extends
  DeviceCapabilities` from another module, so the first version reported ten inherited fields on
  `useCapabilities` as undocumented - the check crying wolf on its first run. It now follows
  `extends` across files. The parser is line-based rather than a multiline regex, because three
  separate escaping mistakes while patching this file produced regexes that silently matched
  nothing and made the check pass for the wrong reason.

## [1.2.2] - 2026-09-07

### Added
- `.github/workflows/release.yml`: pushing a `v*` tag builds, typechecks, packs and publishes all
  three packages to npm with provenance. Two guards worth naming:
  - **The tag must match all four manifests.** A tag that disagrees ships a version nobody asked
    for, and npm does not let you take a version back.
  - **Publish order is fixed** - `@pixelkit/native` and `@pixelkit/mlkit` first, then `pixelkit`,
    which pins both by exact version and would otherwise resolve against nothing.

  Needs an `NPM_TOKEN` secret on the repository. `workflow_dispatch` runs everything except the
  publish, so the pipeline can be exercised before it is trusted.

### Notes
- This is the event the rest of the project reacts to. npm gets the version, Dependabot opens a
  grouped pull request on the template within a day, and that pull request runs the template's
  parity check against `node_modules/pixelkit` - so **a hook this SDK exports with nowhere to try
  it in the template fails that build, by name.** New capability cannot arrive undemonstrated.

## [1.2.1] - 2026-09-07

### Removed
- **`docs/` moved to [pixelkit-docs](https://github.com/PixelKit-Labs/pixelkit-docs).** This
  repository is now packages and manifests, nothing else.

  Stated plainly, because it is a real cost: documentation and the code it describes now live in
  two repositories, so a hook rename and its documentation update cannot land in one commit. Rule 2
  as previously written is no longer followable, and `CONTRIBUTING.md` says what is expected instead
  - JSDoc on the export here, and the matching page in the docs repository, with a hook whose
  documentation lands in a later pull request treated as unfinished.

### Changed
- `README.md` rewritten: **117 lines, down from 702.** The old one was a Best-README-Template
  artifact that duplicated the API reference, the device facts, the project tree, three usage
  examples and a roadmap, and pointed at fourteen files that had moved. Comparable libraries run
  17 lines (shadcn/ui) to 190 (supabase-js); this one now leads with the install, the provenance
  rule, the hook inventory grouped by area, and links out.
- `CONTRIBUTING.md`'s documentation rule and add-a-hook loop reflect the split: the parity check
  lives in the template repository and runs against the *published* package, so a hook exported here
  with nowhere to try it fails a build there rather than here.
- `RELEASING.md` points at the privacy and store-listing documents in the template, where an app
  that actually ships to a store is assembled.

## [1.2.0] - 2026-09-07

This repository is now only the SDK. The demo app, the design system and the template-specific
documentation moved to [pixelkit-template](https://github.com/PixelKit-Labs/pixelkit-template).

A minor bump rather than a patch: `pixelkit` no longer exports the UI layer, which would be a
breaking change if anything had been published. Nothing has, so this is the shape the first release
takes.

### Removed
- **The UI layer is out of the SDK.** `MetricCard`, `HapticButton`, `SensorVisualizer`,
  `ScreenScaffold` and the `Decor` primitives, plus the whole `theme/` module - `Colors`,
  `Gradients`, `Radius`, `Spacing`, `Fonts`, `Type`, `MODE`, `resolveMode`. 11 exports left the
  barrel. The hooks never imported any of it, so the cut was clean in one direction: components
  depended on hooks, never the reverse.

  The trade is real and worth naming. `MetricCard` was what rendered `source: 'unavailable'` as an
  em dash without the caller thinking about it. Consumers now render provenance themselves, and some
  of them will get it wrong. The template shows how it is meant to look.
- The demo app: `App.tsx`, `src/screens`, `src/core/surface.ts`, the assets, `app.json`, `eas.json`,
  `metro.config.js`, the HiLight daemon, and `scripts/check-parity.js` with its waivers. Parity is a
  statement about screens demonstrating hooks, and the screens live in the template now - where the
  check reads the *installed* `pixelkit`, so it verifies the published package rather than local
  source.
- `docs/getting-started/using-this-template.md`, `docs/PRIVACY.md` and `docs/store-listing.md`.
  Those describe starting a project and shipping an app, not what a hook returns.
- **101 emoji across 17 documentation files.** The 667 box-drawing characters in the architecture
  diagrams are untouched: those are content, not decoration.

### Changed
- The root manifest is a workspace root, not an Expo app. `sync-versions.js` no longer manages an
  Android `versionCode`, because there is no longer an Android app here.
- CI drops the Expo export and gains a real packaging test: it installs the packed tarball into a
  scratch project and asserts that both `pixelkit` and `pixelkit/mlkit` resolve from it. The subpath
  split is only worth anything if it survives being published, and nothing else checks that.

## [1.1.17] - 2026-09-07

### Changed
- The repository is **`PixelKit-Labs/pixelkit-sdk`**, renamed from `pixelkit` so it sits alongside
  the coming `pixelkit-template` rather than competing with it for the plain name. The npm package
  is still `pixelkit`; only the repository moved.
- 22 URLs updated across the three package manifests, `README.md`, `docs/PRIVACY.md` and the
  contributing and security files. GitHub redirects the old address, but a published `repository`
  field that resolves through a redirect is one that breaks quietly later.
- `pixelkit-docs` now clones `pixelkit-sdk` by default, and its `PIXELKIT_DOCS` example points at
  the renamed directory.

## [1.1.16] - 2026-09-07

### Changed
- **The CLI and the documentation site moved to their own repositories**, one release after landing
  here. They were built in this workspace because the toolchain already worked; that was the wrong
  home, and keeping them would have made this repository three products in a trench coat.
  - [PixelKit-Labs/pixelkit-cli](https://github.com/PixelKit-Labs/pixelkit-cli) - `@pixelkit/cli`,
    standalone, its own version line, no workspace assumptions. Builds and packs on its own.
  - [PixelKit-Labs/pixelkit-docs](https://github.com/PixelKit-Labs/pixelkit-docs) - the Astro
    Starlight site. It shallow-clones this repository for `docs/` at build time rather than keeping
    a copy, so the markdown still lives beside the code it describes and rule 2 still holds.
    `PIXELKIT_DOCS` points it at a local checkout for offline work. Its CI rebuilds daily, because
    a repository whose content lives elsewhere cannot tell from its own commits whether it still
    works.
- The root `overrides` pin on `cookie` is gone with the Astro build that needed it.
- `package-lock.json` regenerated: removing a workspace leaves entries npm then tries to fetch from
  the registry, and `@pixelkit/cli` was still listed as a root dependency, so `npm install` failed
  `E404` on a package that has never been published.

## [1.1.15] - 2026-09-07

### Added
- **`@pixelkit/cli`** (`packages/cli`) with one command, `pixelkit doctor`. It exists to answer the
  question every new user asks within a minute: "why is everything showing an em dash?" Six checks -
  adb and a single connected device, what the device actually is, whether a development build is
  installed (and that Expo Go can never work), whether `@pixelkit/native` and `@pixelkit/mlkit`
  resolve, whether AICore is present for Gemini Nano, and whether `adb reverse tcp:8081` is set.
  Each reports `pass`, `fail`, `n/a` or `UNKN`. That fourth state is the point: a check that cannot
  be run says so rather than guessing, the same discipline as a hook's `source: 'unavailable'`.
  No dependencies beyond `child_process` and `util`. Exits 1 if anything failed or was undetermined.
- **The documentation site** (`apps/docs`), Astro Starlight, 21 pages. `scripts/sync-docs.mjs` copies
  `docs/` into a gitignored mirror before every build and injects a `title` from each file's first
  heading; `docs/` stays the single source of truth, so rule 2 still holds and no prose is
  duplicated in the tree. The sidebar is derived from the directories actually present, which is why
  deleting `docs/research` removed its section with no config change.

### Fixed
- **`scripts/sync-versions.js` did not touch `peerDependencies`.** `pixelkit` pins `@pixelkit/mlkit`
  in both `dependencies` and `peerDependencies`, and only the first was being updated, so the peer
  pin sat at `1.1.11` while the workspace moved to `1.1.14`. npm then tried to fetch a version that
  was never published and a plain `npm install` failed with `E404`. Both agents hit it independently.
  The script now updates every field, and `npm install` resolves again.
- A root `overrides` entry pins `cookie` to `^2.0.1`. `@google/genai` carries a bundled MCP server
  chain that pulls `express` and `cookie@0.7.2` (CommonJS), while Astro needs the ESM `cookie@2`;
  with both in the tree Vite's prerenderer resolved the wrong copy and the docs build failed on
  `Named export 'parseCookie' not found`. Nothing in this repository imports `express`.
- `doctor`'s "could not determine" marker was `????`, which reads like a broken-encoding bug rather
  than a status. It is `UNKN`.

### Removed
- `docs/research/` and every reference to it: five README links, the `docs/README.md` list, the
  pointer in `docs/getting-started/architecture.md` and `docs/HARDWARE_API.md`, one JSDoc comment in
  `capabilities.ts`, and the line in the three agent guides naming `DEVICE_PROFILE_PIXEL_11_PRO.md`
  as the source of verified device facts. That rule survives as a statement about method - device
  facts are read from the hardware with `adb` and `dumpsys` - rather than a pointer to a file.

## [1.1.14] - 2026-09-07

### Fixed
- **Restored `docs/research/`, deleted by mistake in 1.1.3.** That commit was about the Gemini Nano
  system prompt and also removed five research documents totalling 665 lines: the device profile,
  the 2026-09-06 test report, the HiLight LED array notes, the deep dive and the hardware research.
  Nothing in the commit message mentioned it. They matter: `CLAUDE.md` names
  `DEVICE_PROFILE_PIXEL_11_PRO.md` as the source of verified device facts and the reason not to
  restate marketing claims, and `DEVICE_TEST_REPORT_2026-09-06.md` is the on-device verification
  procedure. Five README links pointed at files that were not there.

### Changed
- The README no longer tells visitors to use this repository as a template without qualification.
  A new **SDK, or starting point** section separates the two ways to use PixelKit: install
  `pixelkit` when you want the hooks in an app you are already building and do not need to own the
  code, or fork when you want to change what a hook reads. The hero link is now **Install it**
  rather than **Use this template**, and the banner alt text says what PixelKit is rather than
  calling it a template.
- The section notes that a dedicated starter repository is planned in the PixelKit-Labs
  organisation, and that forking is the way to start from PixelKit until it exists.

## [1.1.13] - 2026-09-07

Preparing the repository to be public.

### Added
- `.github/workflows/verify.yml`: CI on push and pull request running `npm run verify`, then
  `npm run build`, then `npm pack --dry-run` on all three packages, then `expo export -p android`.
  The pack step is there because a packaging mistake is invisible until somebody installs it, which
  is how `android/build` ended up in a tarball earlier today.
- `CONTRIBUTING.md`, leading with the two rules that fail a build rather than a review: nothing is
  simulated, and a function is not finished until it is documented in four places.
- `SECURITY.md`: private vulnerability reporting, and a plain statement of what PixelKit touches -
  secrets in the hardware-backed Keystore, the Gemini key going to one endpoint and nowhere else,
  permissions requested at point of use, on-device AI staying on the device, and no analytics.
- Issue templates for bugs and features. The bug template asks for the device and the `source` value
  up front, because `unavailable` on non-Pixel hardware is usually correct behaviour rather than a
  fault, and asking first saves a round trip.
- `.editorconfig`.

### Changed
- The README leads with **Use it in your own app** - the two install commands and the Expo Go
  warning - before the clone instructions, since most readers will want the package, not the repo.
- Seven repository URLs across `README.md` and `docs/PRIVACY.md` moved from `Traves-Theberge/PixelKit`
  to `PixelKit-Labs/pixelkit-sdk`, and the clone target is the renamed lowercase directory.
- The wireless adb example in the three agent files says `<device-ip>` instead of a home LAN address.

### Verified
- No credentials anywhere in the git history: scanned every commit for Google API keys, OpenAI keys,
  GitHub tokens, Slack tokens and PEM private-key headers. Nothing.
- Nothing under `android/` is tracked, and no build artifact, keystore, archive or jar is tracked.
- `.env.example` holds placeholders, and `.mcp.json` holds one public URL.
- `npm ci` resolves against the committed lockfile, so CI will not fail on its first run.

## [1.1.12] - 2026-09-07

The package split did not do the thing it was split for. This fixes that.

### Fixed
- **`pixelkit` forced `@pixelkit/mlkit` on every consumer.** It was a hard dependency, so
  `npm i pixelkit` installed it, and Expo autolinking scans `node_modules` for
  `expo-module.config.json` without caring whether any JavaScript imports the module. Merely being
  installed put 19 ML Kit artifacts in the APK, applied `-Xskip-metadata-version-check` and pinned
  every `kotlin-stdlib` in the consumer's Gradle build. Someone who wanted `useCPU()` paid all of
  it, which is exactly the cost 1.1.10 claimed to have separated.

### Changed
- **Two entry points.** `pixelkit` needs only `@pixelkit/native`. The four hooks that need ML Kit
  are exported from **`pixelkit/mlkit`**, and `@pixelkit/mlkit` is an *optional* peer dependency.
  Do not install it and you never import the subpath, Metro never resolves it, autolinking never
  sees it, and the APK never grows.

  ```ts
  import { useCPU } from 'pixelkit';               // @pixelkit/native only
  import { useGeminiNano } from 'pixelkit/mlkit';  // requires @pixelkit/mlkit
  ```

  Moved: `useGeminiNano`, `useGenAITasks`, `useVisionAI`, `useNaturalLanguageAI`, plus
  `buildNanoTurn`, `NANO_SYSTEM_INSTRUCTION` and `TaskTone`. Done before the first publish; moving
  an entry point afterwards is a breaking change.
- `packages/pixelkit/mlkit.js` and `mlkit.d.ts` at the package root resolve the subpath on bundlers
  that ignore the `exports` map, so it works on older Metro too.

### Added
- `npm run parity` gained a fifth check: **every hook file in the package is exported from one of
  the two entries.** It is the reverse of the first check - that one catches a hook with no home,
  this one catches a hook that quietly stopped being public, which splitting the barrel in two made
  easy to do by accident and which no other check would notice, since nothing downstream can see an
  unexported hook. Verified by mutation: removing `useVisionAI` from the barrel fails the build
  naming it. Waivable under `"internal"` in `scripts/parity-waivers.json`.
- The exported-hook scan now reads both entries and strips comments first. Without that, a hook
  merely *named* in a note counted as exported - which it briefly did, and which made the check
  pass for the wrong reason.

## [1.1.11] - 2026-09-07

### Fixed
- **`LICENSE` still carried Expo's copyright.** It read "Copyright (c) 2015-present 650 Industries,
  Inc. (aka Expo)", untouched since the `create-expo-app` scaffold in the first commit. Every
  manifest declares MIT, so three packages were one command away from being published attributing
  this work to Expo. Now "Copyright (c) 2026 Traves Theberge".

### Added
- `LICENSE` is copied into each package and listed in its `files`. npm only picks up a licence file
  from the package directory, so without this all three tarballs would have shipped an MIT
  declaration in `package.json` and no licence text.

## [1.1.10] - 2026-09-07

### Changed
- The two native modules are scoped and one of them is renamed: `pixel-native` is now
  **`@pixelkit/native`** and `pixel-nano` is now **`@pixelkit/mlkit`**, in `packages/native` and
  `packages/mlkit`. `pixelkit` itself stays unscoped, so the flagship install is still
  `npm i pixelkit` while the satellites are namespaced. Done before the first publish, because an
  npm name is effectively permanent once taken.
- `pixel-nano` described a quarter of what the module does. Its 19 ML Kit artifacts are three
  families: GenAI (Gemini Nano prompt, summarization, proofreading, rewriting), vision (barcode,
  face, face mesh, text, labeling, object, ink, pose, two segmenters, document scanner) and natural
  language (language id, translation, smart reply, entity extraction), backing `useGeminiNano`,
  `useGenAITasks`, `useVisionAI` and `useNaturalLanguageAI`. `@pixelkit/mlkit` says what it is.
- Each package README now states why the split exists rather than treating it as packaging trivia.
  `@pixelkit/native` has zero third-party dependencies and reads framework APIs directly.
  `@pixelkit/mlkit` compiles with `-Xskip-metadata-version-check` and pins every `kotlin-stdlib` in
  the *consuming* build, because `genai-prompt` needs Kotlin 2.3.21 where Expo 57 uses 2.1.20. Kept
  apart, someone who wants CPU clocks and battery temperature pays none of that.
- `scripts/sync-versions.js` maps npm name to directory, since a scope is not a folder.

## [1.1.9] - 2026-09-07

PixelKit becomes an npm workspace. `packages/` is what gets published; the root stays the demo app
that proves it works. The SDK and the template were always two products sharing a repo, and this is
the line between them made structural.

### Added
- **`packages/pixelkit`** (npm: `pixelkit`): 45 modules, the 32 hooks, the design system and the
  observability layer. Builds with `tsc` to `build/` with declaration files; packs to 162 kB.
  Its 23 peer dependencies are exactly what the source imports, no more: `expo-build-properties`,
  `expo-dev-client`, `expo-status-bar`, `expo-font`, `expo-asset`, `expo-clipboard`,
  `@expo/vector-icons` and `react-native-safe-area-context` are used by the demo, not the library,
  and are not imposed on consumers.
- **`packages/pixel-native`** and **`packages/pixel-nano`**: the two Kotlin Expo Modules, now
  publishable in their own right, each with `android/` untouched. Publishing them separately avoids
  merging two Gradle projects into one, which is the only way a single npm package could carry both.
- `scripts/sync-versions.js` and `npm run sync-versions`: puts every workspace manifest and the
  Android `versionCode` on the root version. `pixelkit` pins its two native modules by exact
  version, so a mismatch would publish a package that cannot resolve its own dependencies.
- `metro.config.js`: resolves the three package names to TypeScript source, so editing the library
  needs no rebuild. `tsconfig.json` `paths` does the same for the type checker. The published
  packages still point `main` at `build/`.
- README for each package, since npm renders it as the landing page. `pixelkit`'s says the four
  things a reader has to know before installing: Android only, no Expo Go, nothing is simulated,
  and most of it is Pixel-specific so on other hardware it reports `unavailable` by design.

### Changed
- Demo code imports from `pixelkit` rather than by relative path: 134 import specifiers rewritten
  across 18 files, then merged so each file has one import from the package. This surfaced that the
  barrel was incomplete — `Decor`, `ScreenScaffold`, the theme and the observability helpers were
  only ever reachable by relative path, and are now public API.
- Rule 6 in `CLAUDE.md`, `AGENTS.md` and `GEMINI.md` (kept byte-identical) now reads: a symbol the
  demo needs is a symbol the SDK exports. The Map section describes the workspace.
- `src/core/surface.ts` stays with the demo, because "one home per hook" is a discipline about
  screens and a consuming app has its own tabs. Only `SurfaceSection`, the type `ScreenScaffold`
  needs, moved into the package.
- `scripts/check-parity.js` reads the barrel and the hook directories from `packages/pixelkit`.
  All four checks still pass: 32 hooks homed, every documented action reachable.
- 151 path references across 18 markdown files updated, and doc examples now import from
  `pixelkit` instead of `./src`.

### Fixed
- The two native tarballs shipped their Gradle output: `android/build` put `pixel-native` at 1.7 MB and
  `pixel-nano` at 828 kB, almost all of it `.dex` and Kotlin class files. Excluded, they are 22.2 kB
  and 14.8 kB, carrying the Kotlin source, the manifest, the Gradle file and the compiled bridge.
- The packages build with plain `tsc` rather than `expo-module-scripts`, whose bin scripts are bash
  with a `set -eo pipefail` shebang that Windows `cmd` feeds to node, failing `npm install` with
  `SyntaxError: Unexpected identifier 'pipefail'`.

## [1.1.8] - 2026-09-07

### Fixed
- Two leftovers from removing the shields and the `<h1>` in the GitHub web editor: an orphaned
  `</div>` after the hero paragraph, which left the file with one opening tag and two closing ones,
  and ten link-reference definitions for shields nothing renders any more. The six **Built With**
  badge definitions are still in use and are untouched.

## [1.1.7] - 2026-09-07

### Added
- `PixelKit_readme.jpg` as the banner at the top of `README.md`, above the shields. It carries the
  wordmark and the one-line description, so it is the first thing a visitor sees.

## [1.1.6] - 2026-09-07

### Changed
- `README.md` contains no em dashes. Punctuation ones became colons, semicolons, parentheses or
  full stops. The three that were the literal placeholder character, in the provenance blockquote,
  the `unavailable` row of the provenance table and the `MetricCard` example comment, now say
  "renders as an em dash" in words, which stays true to what `MetricCard` actually prints without
  putting the character in the file.
- En dashes in numeric ranges (`1-21` torch levels, `1-120Hz`, ids `1-8`, Pixel `8-10 Pro`) are
  left as they are; they are a different character and read as "to".

## [1.1.5] - 2026-09-07

### Removed
- The screenshot gallery is out of `README.md` and the five PNGs are deleted from the repository,
  along with the now-empty `docs/assets/`. This was asked for once already at 1.1.1 and reintroduced
  at 1.1.3; it stays out. A template is read as source, and 1.3 MB of device captures went stale the
  moment a screen changed.
- The hero logo image and the "View Screenshots" link, which pointed at the gallery.
- The hero tagline "Nothing is simulated. A value that cannot be read is `null`, renders as '—', and
  says so." The rule itself is stated properly under **About The Project**, with the `source` union
  that enforces it; saying it twice in the first screen was decoration.

## [1.1.4] - 2026-09-07

Four capabilities the Gemini API has always offered and `useGemini` did not use: streaming,
token counting, safety thresholds and Google Search grounding.

### Added
- **Cloud replies stream.** `sendMessage` now uses `sendMessageStream`, so `partial` fills in as
  chunks arrive and the chat renders a live CLOUD STREAMING bubble beside the Nano one. `lastFirstChunkMs`
  records time to the first chunk, which is the number that actually describes how responsive the model
  feels; the round-trip total still lands on the finished message.
- **`countTokens(text)`** asks the API what a prompt costs on the selected model before it is sent, and
  writes the result to `lastPromptTokens`. The cloud parameter drawer has the control, matching the one
  Nano already had.
- **Safety thresholds.** `setSafety(threshold)` applies one `HarmBlockThreshold` across all four harm
  categories — harassment, hate speech, sexually explicit, dangerous content. `'default'` sends no
  `safetySettings` at all rather than guessing at the API defaults.
- **Google Search grounding.** `setSearchGroundingEnabled(true)` attaches the `googleSearch` tool. When a
  turn actually searches, `lastGrounding` carries the queries the model ran and the source URIs it used,
  and the chat prints both under the reply. The model decides per turn whether to search, so an empty
  `lastGrounding` means it answered from the model, not that grounding failed.

### Changed
- Every new member is documented in `docs/api/neural-ai.md`, `docs/HARDWARE_API.md` and the in-app
  `useGemini` entry, with inputs and outputs, before it shipped — `npm run parity` fails the build on an
  undocumented setter, so this is enforced rather than remembered.

## [1.1.3] - 2026-09-07

Layout polish for bottom navigation bar and README presentation following Best-README-Template with genuine on-device screenshots.

### Added
- Embedded high-resolution hardware showcase gallery in `README.md` featuring 5 genuine captures from the physical Google Pixel 11 Pro (`grizzly`) testbed running Android 17 (Silicon HUD with live battery temp 37.2°C, Sensors & Actuators with 134.4Hz resonant LRA, Radios stack, Agent Guide architecture, and interactive in-app Docs contracts).
- Project shields, logo header, and built-with badges following Best-README-Template specification.
- Screenshot artifacts preserved in `docs/assets/screenshots/`.
- The in-app documentation entry for `useGeminiNano` now lists its seven generation parameters and its setters. It had none of them, which is why nothing noticed the interface was missing two thirds of the model's controls.
- Documentation for five more setters that hooks return and no entry mentioned: `useGemini.setSelectedModel`, `setTopP`, `setThinkingBudget`, `useAudio.setSilenceThresholdDbfs` and `useCamera.setLook`.
- `npm run parity` gained a third check: **every setter a hook returns must be documented**. Verified by mutation — removing an entry fails the build naming the hook and the setter. The action-reachability check also now covers functions documented under `returns`, not only under `actions`, and matches whole words so a renamed entry cannot slip through as a substring.

### Fixed
- Bottom bar clipping: docked navigation bar in normal flex flow with `backgroundColor: Colors.dark.background` and normalized scroll container padding across screens, ensuring content is never obscured behind the tab bar.
- **Gemini Nano had no system prompt control.** The hook has always exposed `systemInstruction`, `setSystemInstruction`, `candidateCount`, `setCandidateCount`, `maxOutputTokens` and `setMaxOutputTokens`; the parameter drawer offered temperature, top-K and the thinking toggle and nothing else, so the one thing that decides how the on-device model behaves could not be set. The Nano drawer now has the system instruction field, a max-output stepper bounded by `info.tokenLimit`, and a candidate-count stepper, and it says which way the instruction is delivered — a `SystemInstruction` part where AICore accepts one, prefixed to the prompt where it does not.

## [1.1.2] - 2026-09-07

PixelKit is a template, not an app that ships to a store. This release says so everywhere it
matters, and stops the work that assumed otherwise.

### Added
- `docs/getting-started/using-this-template.md`: the ten places the PixelKit name is baked in and
  has to be renamed (app name and slug, `com.pixelkit.sdk`, both Kotlin module Gradle groups, the
  HiLight daemon Java package and the `pkill` string in `run.ps1` that must match it, the SecureStore
  key, the demo constants, the icons), what is worth keeping (`observability.ts`, the surface map and
  the parity check, `MetricCard`'s `source` discipline, `ScreenScaffold`), what to delete when a
  feature is not wanted, and the six steps to add a hook that `npm run verify` will accept.
- The repository is now a GitHub template, so it can be used with **Use this template**. Topics
  gained `template`, `gemini-nano`, `on-device-ai` and `android`.

### Changed
- The README hero says what the repo is — a template — before it lists what it can do, and links
  straight to the template guide.
- `RELEASING.md` opens by stating that PixelKit itself is released as source: a tag and a GitHub
  release, no binary. The runbook is for shipping an app built from it, and for the source releases
  here, whose gates are identical.
- `docs/PRIVACY.md` and `docs/store-listing.md` carry a notice for forks: they describe what *this*
  code does, verified against it, and every claim has to be re-checked against yours before being
  published under your name. The data-safety form in particular is a declaration you are accountable
  for.
- The v1.1.0 GitHub release is published as a source release with no attached binary, which is what
  a template release is.

## [1.1.1] - 2026-09-07

### Added
- The Claude Code Expo plugin is now a documented prerequisite, in `README.md`, `docs/getting-started/quickstart.md` and the Tooling section of the three agent guides. `.claude/settings.json` has enabled `expo@claude-plugins-official` all along, but enabling it in the repo does not install it — each workstation needs `claude plugin install expo@claude-plugins-official` once, at user scope. Without it an agent working here is missing the Expo skills and slash commands the SDK 57 workflow assumes.

## [1.1.0] - 2026-09-07

First release of the reorganised app. Everything the SDK documents can now be reached from the
interface, every documented function states its inputs and outputs, and a check in the build fails
when either of those stops being true.

### Added
- Release documentation: `RELEASING.md` (the gates, the signing story, the EAS profiles and the
  order to do them in), `docs/PRIVACY.md` (what leaves the device and what does not), and
  `docs/store-listing.md` (listing copy, the data-safety answers, and a justification for each
  permission the manifest asks for).
- `expo-asset`, a required peer dependency of `expo-audio` that was missing. `expo-doctor` warned
  that the app may crash outside Expo Go without it, which is precisely the failure a release build
  would have shipped. All 21 doctor checks pass now.

### Changed
- `eas.json` uses `appVersionSource: "local"` and no longer auto-increments the production build.
  The repo rule is that every change bumps `expo.android.versionCode` by hand, so the checked-in
  value has to be the one that ships; with `remote` the two would have drifted apart silently.

### Removed
- `android.permission.BODY_SENSORS` from the manifest. It covers body-worn sensors such as a heart
  rate monitor; nothing here reads one, and the IMU, magnetometer, barometer and light sensor need
  no permission at all. Play treats it as sensitive, so asking for it would have meant declaring a
  capability the app does not have.

## [1.0.27] - 2026-09-07

### Removed
- `scripts/hilight-daemon/hilight-daemon.jar` is no longer tracked. It is compiled output; `run.ps1` already builds it when it is missing, and `.gitignore` now covers `scripts/hilight-daemon/*.jar`.
- Aliases nothing called, which existed only to be documented: `useAudio.currentDecibels`, `useUWB.isSupportedOnDevice`, `useDisplay.setBrightness`, and `useNFC.isScanning` / `startScan` / `stopScan`. The real names are `meteringDecibels`, `isSupported`, `setScreenBrightness`, `isReading` / `startReader` / `stopReader`.
- `DeviceTelemetry.batteryLevel`, which the shared type forced to be a number and so reported `0` for an unread battery — a fabricated default of exactly the kind rule 3 forbids. `batteryPercent: number | null` is the honest field and is what the app already used.
- `GlowBackdrop` from `Decor.tsx`: defined, exported, never rendered anywhere.
- `docs/ai-guidance/agent-primer.md`, a shorter and partly stale copy of `docs/AI_PRIMER.md` — its system prompt still described `useCamera` as a zoom and a label after capture had landed. `docs/README.md` points at the one primer.

### Changed
- `src/screens/docsData.ts` was 2,221 lines. The entries now live one file per category under `src/screens/docs/` (`silicon`, `pro`, `ai`, `sensors`, `radios`, `system`) with shared types and badge colours in `shared.ts`; `docsData.ts` is a 32-line aggregator, so every import of `DOC_MODULES` is unchanged.
- `src/screens/AILabScreen.tsx` was 1,906 lines. It is now a 130-line composer over `src/screens/ailab/`: `ChatSection`, `TasksSection`, `VisionSection`, `LanguageSection`, `VoiceSection`, `AgentsSection` and the shared `styles.ts`. The hooks stay in the screen so a conversation, a transcript or a detection result survives a tab switch; sections own their own interface state.
- `scripts/check-parity.js` reads the split files: documentation entries from `src/screens/docs/*`, and each tab's controls from its screen plus its section directory. It fails loudly if the entries cannot be found, so the action check cannot silently pass again.

## [1.0.26] - 2026-09-07

### Added
- `src/core/surface.ts`: one home per hook. Every exported hook now declares the tab and section that demonstrates it, and the sub-tab rows on all four screens are generated from the same map, so the app's structure and the SDK's contents cannot drift apart.
- `src/components/ScreenScaffold.tsx` with `ScreenHeader` and `SectionTabs`. Every screen now shares one header treatment and one navigation control instead of three; a screen that owns its own scrolling (AI Lab) composes the two pieces directly.
- **Nine hooks that were documented but had no interface anywhere** are now demonstrated: `useCamera`, `useVideo` and `useMediaLibrary` in Sensors → Capture (preview, still, 15 s clip, playback with speed and poster frames, save to the gallery); `useNetwork` and `useCellular` in Silicon → Network; `useRadios` and `useLocation` in Sensors → Radios; `useSecurity` in Sensors → Security with a real write, read-back and delete; and `useSpeech` in AI Lab → Voice, which reads the last model reply aloud.
- Gemini Nano model lifecycle in AI Lab: download when the status is `downloadable`, warm-up, prompt token count against `info.tokenLimit`, and a stable/preview track switch — none of which had a control before, so a device reporting `downloadable` had no way to fetch the model from the app. The measured latency, time to first token, decode rate and output tokens are now displayed rather than only recorded.
- Silicon → Trace: slowest traced operations, per-module error counts and a diagnostics reset, from the observability readers added in 1.0.19.
- `npm run parity` (`scripts/check-parity.js`, `scripts/parity-waivers.json`) and `npm run verify`. The check fails when an exported hook has no home, when a home screen never calls its hook, when a documented function has no control anywhere without a waived reason, and when a handler that takes arguments is passed straight to `onPress`.
- Docs tab entries now show **where to try it**, e.g. "Sensors → Capture", read from the surface map.

### Changed
- Silicon is four sections (Compute · System · Network · Trace) instead of one twelve-section scroll, and it keeps the chip and the system: actuators, radios and biometrics moved to Sensors, where each now appears exactly once. Display, UWB, HiLight, the torch, the barometer and biometrics had each been rendered on two screens with different wording.
- Sensors is six sections (Motion · Capture · Audio · Actuators · Radios · Security) and gained the missing controls: stop UWB ranging, stop a BLE scan, queue an NFC text write, seek within a recording, select a microphone.
- AI Lab gained the rest of the generation parameters (`topP`, `maxOutputTokens`, `thinkingBudget`, system instruction) and a clear-chat control, and three more on-device detectors (objects, pose, subject segmentation) that the hook exposed but nothing called.
- Agent guides gained rules 12 and 13: one home per hook, and screens share their frame. `npm run verify` replaces `npm run typecheck` as the validation gate.

### Fixed
- `DashboardScreen` passed `onPress={uwb.startRanging}` directly, so React Native handed the press event in as the `sessionId` argument. The parity check now fails on that shape anywhere in the app.
- Neither screen offered a way to stop a UWB ranging session: both start buttons disabled themselves while ranging, leaving the session open until the app was killed.

## [1.0.25] - 2026-09-07

### Removed
- The `native / live` status chip in the app header (`App.tsx`). The wordmark now stands alone in the top bar; the `topBar` style drops `justifyContent: 'space-between'`. Native-module availability is still reported per hook through `source` and on the Silicon screen.

## [1.0.24] - 2026-09-06

### Added
- Real physical battery temperature and electrical telemetry engine in `PixelNative` (`PixelNativeModule.kt`) and `useDevice` (`src/hardware/useDevice.ts`):
  - `batteryTemperatureC`: Real-time temperature of the lithium battery pack from its NTC thermistor via `BatteryManager.EXTRA_TEMPERATURE` in 0.1 °C units.
  - `batteryVoltageMv`: Instantaneous cell terminal voltage from the PMIC ADC via `BatteryManager.EXTRA_VOLTAGE`.
  - `batteryCurrentMa`: Instantaneous current flow in mA via `BatteryManager.BATTERY_PROPERTY_CURRENT_NOW` (negative discharging, positive charging).
  - `batteryCurrentAvgMa`: Rolling average current draw in mA via `BatteryManager.BATTERY_PROPERTY_CURRENT_AVERAGE`.
  - `batteryPowerWatts`: Real-time power draw or fast-charging rate in Watts (derived from V × |I|).
  - `batteryHealth`: Hardware health enum (`GOOD`, `OVERHEAT`, `DEAD`, `OVER_VOLTAGE`, `COLD`, `UNKNOWN`) via `BatteryManager.EXTRA_HEALTH`.
  - `batteryCycleCount`: Lifetime charge cycle count from the battery EEPROM via `BatteryManager.EXTRA_CYCLE_COUNT` (Android 14+).
  - `batteryChargeCounterMah`: Remaining charge capacity in mAh via `BatteryManager.BATTERY_PROPERTY_CHARGE_COUNTER`.
  - `batteryEnergyCounterMwh`: Remaining stored energy in mWh via `BatteryManager.BATTERY_PROPERTY_ENERGY_COUNTER`.
  - `pluggedSource`: Charging source (`AC`, `USB`, `WIRELESS`, `DOCK`, `NONE`) via `BatteryManager.EXTRA_PLUGGED`.
  - `thermalZones`: Opportunistic probe of kernel `/sys/class/thermal/thermal_zone*` when readable.
- Silicon HUD (`DashboardScreen.tsx`) updated:
  - Hero telemetry bar now displays live `battery temp` (°C) with warning tinting when above 42°C.
  - "Thermal & ADPF headroom" section gained a dedicated "Battery temperature" card (`Fuel gauge NTC thermistor • cell temp`).
  - "Power & atmosphere" section expanded into "Power & electrical telemetry", with live cards for Battery percentage, Power draw / rate (Watts and mA), Remaining charge (mAh), and cell voltage (mV).

## [1.0.23] - 2026-09-06

### Added
- Every documented function now states its inputs and its outputs. `docs/api/*.md` gained an **Inputs** table (each argument with its type, default and units), an **Outputs** table (every returned field with what it means and what `null` means there) and a **Functions** table (per-callable: what each parameter does, what the call resolves to, and what a failure looks like) for all 32 hooks plus `geminiClient`, the observability API, and the `PixelNative` and `PixelNano` native modules with their event payloads.
- `docs/HARDWARE_API.md` rebuilt around the same three sections per hook, with the field-by-field tables linked rather than duplicated so the two cannot drift.
- Guides now carry function contracts: the tool registry, tool declarations, cloud and on-device agent loops, AppFunctions and the routing helper in `docs/guides/function-calling.md`; microphone preparation, the PCM mic and speaker, on-device recognition, ephemeral tokens, the Live agent hook and both text-to-speech paths in `docs/guides/voice.md`; the native Prompt API surface, `NanoOptions`, the hook, structured-output shapes and the hybrid router in `docs/guides/on-device-ai-gemini-nano.md`.
- In-app Docs tab renders the same contract: `DocField` gained optional `inputs` and `output`, `DocsScreen` renders them as nested **TAKES** and **GIVES BACK** blocks, and every callable in `docsData.ts` now carries them.
- Plain-language explanation of thermal headroom in `docs/api/silicon-compute.md`, linked from `docs/HARDWARE_API.md`: it is a ratio of the current thermal state to the throttling threshold, not a temperature.
- Troubleshooting entry for "a hook returns null and its source says unavailable", with the five real causes and how to check each.

### Changed
- `README.md` no longer carries images. The shield badges, the logo, the nine-screenshot gallery and the badge reference definitions are gone; **Built With** is a plain list with links, and the screenshot files have been deleted from the repository along with the gallery in `PIXELKIT.md`.
- `docs/AI_PRIMER.md` hook table rebuilt with Inputs, Key outputs and Functions columns, replacing entries that listed fields the hooks do not return.
- `docs/ai-guidance/recipes.md` rewritten: every recipe states what it takes and gives back. Fixed three broken examples — `useSensors` no longer returns `setUpdateInterval` (the interval is an argument), `thermalHeadroom` is nullable and was being multiplied, and `onPress={startRanging}` was passing the press event as a session id.
- Corrected contracts that did not match the code: `reportWorkDuration` returns a verdict and does not call `PerformanceHintManager`; `playEnvelope` and `playPrimitives` return `boolean`; `setTorch` and `toggleTorch` resolve `boolean`; `startStrobe` takes an interval; `refreshLocation` resolves `boolean`; `pickImage` takes a camera flag and resolves a URI and base64; `setRecognitionMode` takes `'on-device'`, not `'offline'`; `useSensors` defaults to 100 ms.
- Removed device claims that cannot be read from the device: the process node, peak-nits figures, and post-quantum protection, which `useSecurity` reports as `false`. `docs/getting-started/architecture.md` now separates verified readings from Google's published specification.

## [1.0.22] - 2026-09-06

### Added
- Thermal headroom architecture guide in `docs/api/silicon-compute.md` and `docs/HARDWARE_API.md` detailing `PowerManager.getThermalHeadroom` ratio mechanics (0.0 cool … 1.0 throttling point), verified 0.55 idle baseline on Tensor G6, per-status thresholds (`thermalThresholds`), and ADPF workload shedding strategies.
- In-app Docs tab (`DocsScreen.tsx`, `docsData.ts`): added nested action I/O cards displaying structured `TAKES` (argument names, types, descriptions) and `GIVES BACK` (resolved promises and error shapes) for every callable function.

## [1.0.21] - 2026-09-06

### Changed
- Comprehensive API and documentation audit across the 32-hook suite.
- Synchronized `README.md` Hook Matrix and Honesty Matrix with real native NDEF read/write capabilities in `useNFC()` and active hardware BLE peripheral discovery in `useBLE()`.
- Added complete Function Calling registry contract and tool specifications to `docs/guides/function-calling.md`.
- Expanded `useVisionAI()` and `geminiClient` references in `docs/HARDWARE_API.md` and `docs/api/neural-ai.md` with explicit parameter signatures and typed return structures.
- Verified on-device execution on Google Pixel 11 Pro (Tensor G6, Android 17 API 37) with 0 TypeScript errors and Hermes Android export verified.

## [1.0.20] - 2026-09-06

### Changed
- README header rewritten. The old subtitle read "32 typed React hooks over real Android telemetry, two local Kotlin Expo Modules, and an app that refuses to invent a number", which described the project from the inside: it counted internal modules nobody choosing a library asks about, and compressed the no-simulation rule into a riddle that only makes sense to someone who already knows it. It now walks the actual surface by domain (silicon and thermals, camera and video, microphone and speech, radios, biometrics and keystore, the camera-bar LEDs, on-device Gemini) and states the rule plainly as its own line.

## [1.0.19] - 2026-09-06

### Added
- Observability layer rebuilt in `src/core/observability.ts`. `traced` times an operation, gives it a correlation id, records the duration as a metric and logs success or failure; nested calls inherit the parent id, so a single user action can be followed end to end. `tracedSafe` does the same where a failure is survivable. `normalizeError` reduces native `CodedException`s, `Error`s and thrown strings to one shape, and `logError` records them and counts them per module. New readers: `getTraces`, `getSlowestTraces`, `getTrace(id)`, `getErrorCounts`, `getHealthSummary`, `resetObservability`. Operations slower than 1.5 s log at warn level.
- Real NFC. `PixelNativeModule` gained `startNfcReader`, `stopNfcReader`, `writeNdefText` and `isNfcReaderActive`, driving `NfcAdapter` reader mode on the foreground Activity. Tags raise `onNfcTag` carrying the identifier, supported technologies, NDEF capacity, writability and decoded records; text records have their language prefix stripped and URI records are resolved. Writing formats an unformatted tag where the tag allows it.

### Changed
- **Nothing in the SDK is simulated, and the type system now enforces it.** `TelemetrySource` is `'hardware' | 'derived' | 'unavailable'` and `HardwareAvailability` is `'hardware' | 'unavailable' | 'estimated' | 'unsupported'`. The `simulated` member is gone from both, so a fabricated reading no longer compiles.
- `useNFC` rewritten on the native reader: real tag reads and NDEF writes, tag count, pending write state and write outcome. It previously returned a hardcoded placeholder tag.
- `useHiLight` no longer mirrors its state on screen when the daemon is absent. Availability is `unavailable` and the controls refuse rather than implying a colour was shown.
- Ten hooks had no observability at all and now carry traces, surfaced errors and provenance: `useBiometrics`, `useSecurity`, `useLocation`, `useSensors`, `useNetwork` and `useNFC` among them.
- `MetricCard` dropped its SIMULATED badge. The Silicon and Sensors screens no longer label anything as simulated.

### Fixed
- `useNetwork` claimed `isConnected: true` on WIFI before any read had happened. It now starts UNKNOWN and disconnected, and requires both an attached interface and a reachable route before reporting connected.
- `useSensors` reported a standing 1013.25 hPa before the barometer produced a sample. Pressure and altitude are null until a real reading arrives, per-sensor availability is reported separately, and `isAvailable` starts false.
- Empty `catch` blocks across the hooks discarded failures silently. Errors are now logged, counted and surfaced through an `error` field.
- `useBiometrics` treated a user cancel and a genuine failure identically. It now distinguishes them and sets `error` only when the call itself failed.

### Rules
- `AGENTS.md`, `CLAUDE.md` and `GEMINI.md` (kept identical): rule 3 rewritten as **Nothing is simulated**; new rule 10 **Observability on every function**, requiring `traced`, a surfaced error and a `source` field with no empty catch; new rule 11 **Documented before it is done**, requiring JSDoc, a typed `docsData.ts` entry, the `docs/api/*` section and the README row before a function counts as finished.
- Every project document scrubbed of simulation claims.

## [1.0.18] - 2026-09-06

### Added
- Genuine physical Bluetooth Low Energy discovery in `useBLE` via Android `BluetoothLeScanner` (`PixelNative.startBleScan`, `stopBleScan`, `getDiscoveredBleDevices`). Discovers real nearby peripherals with MAC address, name, verified RSSI (dBm), and estimated distance derived from the log-distance path loss model, eliminating simulated placeholders.
- Hardware UWB ranging session management in `useUWB` via `PixelNative.startUwbRanging` and `stopUwbRanging`, querying Android 14+ `RangingManager` and `UwbManager` with honest HAL state reporting.
- Production release signing pipeline in `android/app/build.gradle` supporting `PIXELKIT_UPLOAD_STORE_FILE` gradle properties and `PIXELKIT_RELEASE_KEYSTORE_PATH` environment variables with debug fallback.
- EAS Build configuration in `eas.json` with `development`, `preview` (standalone APK), and `production` (Google Play AAB) build profiles.
- Release obfuscation and shrinkage keep rules in `android/app/proguard-rules.pro` for `expo.modules.pixelnative`, `expo.modules.pixelnano`, ML Kit, and Google Play Tasks.
- Android 17 AppFunctions execution support via `PixelNative.executeAppFunction` wired directly into `AILabScreen.tsx` for real-time actuator testing across 10 system tools (haptic envelopes, rear torch levels, radio discovery, thermal diagnostics, and ML Kit models).

### Changed
- `useBLE` and `useUWB` report genuine hardware provenance (`source: 'hardware'`) when backed by `PixelNative`.
- `SensorsLabScreen` now features real-time BLE spectrum discovery cards with signal strength badges and distance estimates, as well as live UWB session telemetry.
- Updated in-app documentation in `src/screens/docsData.ts` and reference markdown (`docs/HARDWARE_API.md`, `docs/api/radios-security.md`, `docs/api/pro-exclusives.md`, `README.md`, `PIXELKIT.md`) to reflect active BLE scanning and UWB session handling.

## [1.0.17] - 2026-09-06

### Added
- `useCamera` can now capture. It previously held interface state only and could not take a photo or record video. Adds a `CameraView` ref the hook drives, `takePicture` (resolving with a file, dimensions and optional base64 for the AI hooks), `startRecording` and `stopRecording` with duration and size limits and live elapsed time, torch, picture/video mode, available lenses and picture sizes, and preview pause and resume.
- `useVideo` (`expo-video`): playback of a local file or remote stream with position, duration, buffered position, status, seek, playback rate, loop, mute, volume, keep-screen-on and frame thumbnails. Plays back what `useCamera` records.
- `useSpeech` (`expo-speech`): text to speech, the output half of voice. Installed voices with language and quality, rate and pitch, and a `speak` that resolves when the utterance finishes so calls can be sequenced. Rejects text over the engine limit rather than truncating it.
- `useMediaLibrary` (`expo-media-library`): saves captures into the user's gallery so they survive, using the SDK 57 class API; lists recent items, creates albums, deletes. Reports Android 13+ limited access.
- `useCellular` (`expo-cellular`): radio generation from 2G to 5G, carrier name, ISO country, mobile country and network codes, VoIP support. Answers what `useNetwork` cannot, namely whether a cellular connection is actually 5G and who is serving it.
- `READ_PHONE_STATE` permission and the `expo-media-library` config plugin in `app.json`.

### Fixed
- `useCamera` zoom was wrong. `expo-camera` takes a 0..1 fraction of the lens range, but the hook defaulted to `1.0`, which is maximum zoom, and clamped input to 0.5..120 so any "5x" style value was passed straight through out of range. Zoom is now a 0..1 fraction with `setZoomStep` for discrete stops, and the documentation says so explicitly.
- Docs data carried duplicate entries for the four new hooks after two agents added them concurrently. The set that matches the shipped implementations is kept.

### Changed
- Reference documentation brought back in sync, which the previous two releases had missed: `docs/HARDWARE_API.md`, `docs/api/system-media.md`, `docs/api/neural-ai.md`, `docs/api/sensors-actuators.md` and `docs/AI_PRIMER.md` now cover capture, playback, speech, media library and cellular.
- In-app Docs gained entries for the four new hooks and a rewritten `useCamera` entry, taking the reference to 32 modules.

## [1.0.16] - 2026-09-06

### Changed
- Restructured and elevated `README.md` to follow the GitHub standard [othneildrew/Best-README-Template](https://github.com/othneildrew/Best-README-Template):
  - Top navigation anchor `<a id="readme-top"></a>` with back-to-top return links across every major section.
  - Standardized reference-style badge header covering repository stats (Contributors, Forks, Stars, Issues, License) and technology stack (Expo SDK 57, React Native 0.86, Android 17 API 37, Gemini Cloud, Gemini Nano / ML Kit, TypeScript Strict, Version).
  - Centered project logo and title hero featuring `./assets/icon.png`, concise pitch, and quick links (Explore Docs, View Gallery, Report Bug, Request Feature).
  - Collapsible interactive Table of Contents (`<details open><summary>Table of Contents</summary>...`).
  - "Built With" section featuring technology badges linking to official project documentation.
  - Complete Interface & Gallery grid with side-by-side tables showcasing all 9 verified on-device screenshots captured live over ADB from the physical Google Pixel 11 Pro testbed.
  - Preserved and expanded exhaustive technical reference: Telemetry Provenance contract, 32 typed React hooks matrix (24 Hardware + 8 AI) with additions (`useVideo`, `useMediaLibrary`, `useCellular`, `useSpeech`), verified device facts from `grizzly` hardware, HiLight UID 2000 ADB daemon protocol, and the Still Simulated honesty disclosure.
  - Modernized Getting Started guide with Android CLI (`android.exe`) integration, quickstart commands, and wireless debugging workflow.
  - Comprehensive interactive Roadmap with completed milestones (`[x]`) and upcoming releases (`[ ]`).
  - Standardized open-source Contributing guidelines, MIT License notice, Contact information, and Acknowledgments.
- Added and exported 4 new hooks across hardware and AI suites:
  - `useVideo`: Frame-accurate video player controls via `expo-video` with scrubber polling and thumbnail extraction.
  - `useMediaLibrary`: Media store persistence and album management via `expo-media-library`.
  - `useCellular`: Modem telemetry via `expo-cellular` (carrier identity, 5G/4G/3G/2G generation, MCC/MNC).
  - `useSpeech`: On-device text-to-speech engine via `expo-speech` with system voice enumeration and synthesis controls.

## [1.0.15] - 2026-09-06

### Added
- Complete On-Device Google ML Kit Intelligence Suite in `PixelNanoModule.kt` and `modules/pixel-nano`:
  - `useGenAITasks.ts`: On-device Summarization, Proofreading, Rewriting (6 styles), and Image Description via AICore/ML Kit.
  - `useNaturalLanguageAI.ts`: Offline 58-language neural translation, BCP-47 language identification, smart reply suggestion generation, and entity extraction.
  - `useVisionAI.ts`: On-device Text Recognition (OCR v2), Barcode scanning (all 1D/2D formats), Face detection, Face Mesh detection (468 3D points), Image labeling, and Object tracking.
  - `useSpeechAI.ts`: Local Android System Intelligence (ASI) offline streaming speech recognition with interim partial tokens, plus cloud Gemini STT.
  - Android 17 AppFunctions: Registered `PixelAppFunctionService` exposing PixelKit actuators (HiLight, Torch, Haptics) to OS assistants (Gemini, Ask Pixel).
- Camera Actuator Expansion in `useCamera.ts`:
  - Added real photo capture (`takePictureAsync`), video recording (`recordAsync`) with live elapsed duration, continuous torch toggle, lens & resolution enumeration, and preview controls.
- Pixel AI Studio Redesign in `AILabScreen.tsx`:
  - 6 dedicated studio workspaces: Chat, Tasks, Vision, Language, Voice, and Agents.
  - Interactive Hyperparameter Drawer for Cloud models and on-device Gemini Nano.
  - Dynamic model catalog fetched from Google Generative AI API with live model picker.
  - Bottom navigation bar clearance (`paddingBottom: 140`) across all views to eliminate bottom bar clipping.
- Real on-device screenshots captured on physical Google Pixel 11 Pro testbed embedded in `README.md` and `PIXELKIT.md`.

### Fixed
- Fixed CPU / GPU Headroom in `DashboardScreen.tsx`: Derived CPU load headroom and Choreographer frame budget headroom with strict provenance `source: 'derived'`.
- Cleaned up obsolete documentation references regarding pending module status.

## [1.0.14] - 2026-09-06

### Added
- `useAudio` gained the capability it was missing. Recording now supports pause and resume, an optional fixed duration and live elapsed time. Two capture profiles: `speech` (16 kHz mono through `voice_recognition`, the platform noise-suppressed path) and `studio` (48 kHz stereo through `unprocessed`, the raw microphone). Levels add a running peak, a 0..1 `level` for meters floored at -60 dBFS, and an `isSilent` flag against an adjustable threshold. Microphone enumeration and selection, speaker/earpiece routing, and playback with pause, stop and seek. All additive: the previous return fields are unchanged.
- Sensors tab exposes the new audio surface: level bar, pause and resume, profile switch, input list, routing, and playback of the last take.
- `src/screens/docsData.ts`: documentation content separated from presentation. Every hook now carries a plain-language explanation of what it is for, a technical account of how it works, and structured `params`, `returns` and `actions` where each field has a name, a real type and a sentence explaining it.

### Changed
- Docs tab rewritten to the app's design system. It previously used default fonts, ad-hoc pill styling and emoji, and looked unrelated to the other three screens. It now uses the shared type scale and panel material (wash, hairline, specular), `SectionHeader`, and a single cyan accent for selection instead of a different colour per category.
- Each entry opens to labelled sections: what it does, how it works, signature, inputs, returns, actions, example and agent note. Inputs and returns are rendered as reference rows rather than a flat list of strings.
- Filter chip counts and the module total derive from the data, so they can no longer drift. The previous hardcoded counts were wrong.
- Removed the remaining lightning glyphs from the Docs header, footer and the `useDevice` example.

### Fixed
- Docs search now matches return and action names, not just the summary.

## [1.0.13] - 2026-09-06

### Changed
- Full capability audit of the app against the source tree and the physical Pixel 11 Pro, and a complete rewrite of `README.md` around it.
- README now documents all **28** hooks (21 hardware + 7 AI). It previously claimed 24, listed `hardware/` as 15 hooks and `ai/` as 6, and omitted `useGenAITasks`, `useNaturalLanguageAI` and `useRadios` from the structure tree.
- Added a **telemetry provenance** section (`hardware | derived | simulated | unavailable`) and an explicit **"Still simulated"** table for `useNFC`, `useBLE`, `useUWB` and `useHiLight`, so the no-mocks rule is visible from the front page.
- Added a **verified device facts** table sourced from adb on 2026-09-06, including the two features this unit does **not** declare (`neural_processing_unit`, `hardware.ranging`), which make `hasNpuFeature` and the Ranging feature flag false.
- Documented the HiLight ADB daemon workflow (`npm run hilight:build`, `npm run hilight:daemon`, `127.0.0.1:11080`, endpoints `/ping` `/status` `/set` `/off`) and its `hardware` / `simulated` / `unsupported` availability mapping.
- Documented the on-device ML Kit surface: GenAI tasks, 58-language offline translation, language ID, smart reply, entity extraction, and the nine vision capabilities.

### Fixed
- README linked five screenshots that do not exist (`02_ailab_chat.png`, `04_ailab_vision.png`, `05_ailab_language.png`, `06_sensors_lab.png`, `07_docs_screen.png`); only the one present image is referenced now.
- Quick start told users to install **Expo Go**, which cannot load this app because it links two local Kotlin modules. It now directs to a development build and explains what Expo Go would report instead.
- Release section said **v1.0.0** with `versionCode` 1; corrected to the real version and version code.
- Removed unverifiable claims that violated the comments-state-facts rule: "TSMC 2nm", "3,600 nits", "Titan M3 PQC", "696 modules", and the cloud model badge that still read "Gemini 2.5 Flash" (the model is `gemini-3.8-flash`).
- Every relative link in the README is now verified to resolve.

## [1.0.12] - 2026-09-06

### Added
- Complete On-Device Google ML Kit Intelligence Suite in `PixelNanoModule.kt` and `modules/pixel-nano`:
  - GenAI Task Modules (`useGenAITasks.ts`): On-device Summarization, Proofreading, Rewriting (styles: Casual, Formal, Concise, Elaborate, Emoji), and Image Description running locally via AICore/ML Kit.
  - Natural Language AI (`useNaturalLanguageAI.ts`): Offline 58-language neural translation, BCP-47 language identification, smart reply suggestion generation, and entity extraction (dates, addresses, phones, emails).
  - Vision AI Suite (`useVisionAI.ts`): On-device Text Recognition (OCR v2), Barcode scanning (1D/2D all formats), Face detection, Face Mesh detection (468 3D points), Image labeling, and Object tracking.
  - Dual-Mode Speech AI (`useSpeechAI.ts`): Added local Android System Intelligence (ASI) offline streaming speech recognition with interim partial token updates, plus cloud Gemini STT.
  - Android 17 AppFunctions: Registered `PixelAppFunctionService` in `AndroidManifest.xml` and native service so system agents (Gemini, Ask Pixel) can invoke PixelKit actuators (HiLight, Torch).
- AI Studio Redesign in `AILabScreen.tsx`:
  - 6 dedicated studio workspaces: Chat, Tasks, Vision, Language, Voice, and Agents.
  - Interactive Hyperparameter Drawer for both Cloud models (temperature, topP, topK, candidateCount, presencePenalty, frequencyPenalty) and on-device Gemini Nano (maxTokens, contextBudget, samplingMode).
  - Dynamic model catalog fetched directly from Google Generative AI API with live model picker.
  - Bottom navigation bar clearance (`paddingBottom: 140`) across all studio views to eliminate content clipping.

### Fixed
- CPU / GPU Headroom in `DashboardScreen.tsx`: Fixed headroom reporting on Android 17 / Pixel 11 Pro where HAL `SystemHealthManager` returns unsupported. Accurately derived CPU headroom (`(100 - cpuLoadPercent)%`) and GPU frame budget headroom (`(targetBudgetMs - frameRenderTimeMs) / targetBudgetMs`) with clear provenance `source: 'derived'`.
- Namespace Migration: Resolved `ReactNativeApplicationEntryPoint` autolinking compilation by establishing `com.pixelkit.sdk` namespace across Gradle and adding a `com.pixelforge.sdk.BuildConfig` compatibility shim.

## [1.0.11] - 2026-09-06

### Changed
- Sensors Lab: Stacked Barometer (SPA18001) and Ambient Light (TMD3743) `MetricCard`s vertically into full-width cards, removing the last legacy 2-column grid and completing full-width card layout consistency across all four screens.

## [1.0.10] - 2026-09-06

### Changed
- AI Lab: Stacked Gemini Nano latency, decode rate, and CPU fallback matmul `MetricCard`s vertically into full-width cards instead of horizontal row layout, ensuring consistent styling, no horizontal compression, and clean typography across mobile viewports.

## [1.0.9] - 2026-09-06

### Added
- Native radio telemetry in `PixelNativeModule.kt`: implemented `getRadioInfo()` querying Android system services (`NfcAdapter`, `BluetoothManager`, `BluetoothAdapter`, `UwbManager`, `WifiRttManager`, `PackageManager`) for live hardware states without mock fallbacks.
- `useRadios` hook in `src/hardware/useRadios.ts`: comprehensive hardware radio telemetry exposing real NFC antenna state, Bluetooth controller & bonded devices, UWB chip status, and Wi-Fi RTT availability (`source: 'hardware'`).
- Bonded Bluetooth peripheral device listing in `SensorsLabScreen` with real MAC addresses and bond states.
- UWB hardware status card in `DashboardScreen` and `SensorsLabScreen` reporting real chip readiness (`default`, `READY`) with `source: 'hardware'`.

### Changed
- `useNFC`: wired to `PixelNative.getRadioInfo().nfc` to report real hardware adapter status, antenna state (`ENABLED`/`DISABLED`), and Android 15+ Observe Mode support with `source: 'hardware'`.
- `useBLE`: wired to `PixelNative.getRadioInfo().bluetooth` to report real adapter status (`ON`/`OFF`), Bluetooth 5.4 Channel Sounding hardware feature verification, and real bonded/paired devices with `source: 'hardware'`.
- `useUWB`: wired to `PixelNative.getRadioInfo().uwb` to report real chip state (`default`, `READY`) and Android 16+ RangingManager availability with `source: 'hardware'`.
- Synchronized documentation across `AGENTS.md`, `CLAUDE.md`, `GEMINI.md`, `README.md`, `PIXELKIT.md`, `docs/HARDWARE_API.md`, `docs/api/radios-security.md`, `docs/api/pro-exclusives.md`, `docs/AI_PRIMER.md`, `docs/research/DEVICE_TEST_REPORT_2026-09-06.md`, and in-app `DocsScreen.tsx`.

## [1.0.8] - 2026-09-06

### Changed
- Dashboard: Stacked all 2-column grid cards across the Silicon dashboard into full-width vertical `MetricCard`s (CPU: Cluster utilisation & This app CPU; Thermal: Thermal headroom & CPU/GPU headroom; GPU: Frame interval & Presented FPS; Power & atmosphere: Battery & Barometer) for optimal readability and breathing room.
- Styling: Fixed trailing character clipping on Android across headers, telemetry, and navigation (`Wordmark` "PIXELKIT" letter-spacing margin, `TelemetryRow` label shrink-resistance, and `Shell` navigation tab titles).

## [1.0.7] - 2026-09-06

### Added
- Native PixelKit ADB HiLight Daemon in `scripts/hilight-daemon/`: zero-dependency Java daemon that runs as UID 2000 (`com.android.shell`) via `app_process` on the device.
- Direct HTTP loopback driver on `127.0.0.1:11080` that controls all 8 physical RGB LEDs with ~3 ms latency via `android.hardware.lights.ILightsManager`.
- Built-in hardware safety controls: 60-second automatic hold clamp and stuck-LED clear mitigation sequence (alpha-black write, canonical black write, and priority -1000 cleanup passes).
- NPM scripts `"hilight:daemon"` (pushes and runs the daemon over ADB) and `"hilight:build"` (compiles daemon Java sources into DEX JAR).
- Enabled `android:usesCleartextTraffic="true"` in `AndroidManifest.xml` for local loopback IPC.

### Changed
- `useHiLight`: elevated to hybrid driver. Automatically detects the active local ADB daemon; reports `availability: 'hardware'` and `source: 'hardware'` when the daemon is running, and seamlessly falls back to on-screen simulation (`'simulated'`) when untethered.
- Dashboard: HiLight card reflects `HARDWARE` status when the ADB daemon is active.
- Docs & Guides: Updated `AGENTS.md`, `CLAUDE.md`, `GEMINI.md`, `README.md`, `docs/HARDWARE_API.md`, `docs/AI_PRIMER.md`, `docs/api/pro-exclusives.md`, and `DocsScreen.tsx` to document the native ADB hardware driver.

## [1.0.6] - 2026-09-06

### Removed
- Completely removed Shizuku privileged shell helper integration: deleted `modules/pixel-hilight` (Kotlin module + AIDL binder IPC) and `scripts/hilight-probe/`.
- Removed Shizuku connection state, helper bind/unbind logic, and connect action buttons from `useHiLight` and UI surfaces.

### Changed
- Restored `useHiLight` to a pure, honest on-screen simulation and LRA haptic actuator (`availability: 'simulated'`, `source: 'simulated'`) without privileged external dependencies.
- Updated `HardwareAvailability` union type in `src/core/capabilities.ts` to remove `'shizuku'`.
- Synchronized documentation, agent rules (`AGENTS.md`, `CLAUDE.md`, `GEMINI.md`), `README.md`, `docs/HARDWARE_API.md`, `docs/AI_PRIMER.md`, `docs/README.md`, `docs/api/pro-exclusives.md`, and in-app `DocsScreen.tsx` to reflect the pure simulation architecture for HiLight.

## [1.0.5] - 2026-09-06

### Changed
- Rebranded framework from **PixelForge** to **PixelKit** (`pixelkit`): reflects its identity as the developer SDK and starter template for the Google Pixel 11 Pro (Tensor G6, Android 17).
- Updated package and application metadata in `package.json` and `app.json` (`name: "PixelKit"`, `slug: "pixelkit"`, `package: "com.pixelkit.sdk"`).
- Renamed canonical documentation from `PIXELFORGE.md` to `PIXELKIT.md` and updated all documentation references, UI wordmarks (`PIXELKIT`), and agent guides (`AGENTS.md`, `CLAUDE.md`, `GEMINI.md`).
- Migrated logging prefix from `[PixelForge]` to `[PixelKit]` in `src/core/observability.ts` and `DashboardScreen.tsx` while preserving backward compatibility for stored Gemini API keys.
- Updated Kotlin modules group ID to `com.pixelkit`.

## [1.0.4] - 2026-09-06

### Removed
- `useTemperature`, the `TemperatureReading` type, the `hasThermometer` capability, the Silicon "IR thermometer" card, the Docs entry, and every documentation row and section for it. The Pixel 11 Pro has no thermometer (sensor list checked on device); the hook only ever targeted Pixel 8-10 Pro.

### Fixed
- README: every line had carried a stray prefix since 1.0.2 (a substitution whose escaped pipe became an empty alternation). Restored from 1.0.1 with the intended edits reapplied.
- README, PIXELFORGE, `docs/HARDWARE_API.md`, `docs/AI_PRIMER.md`, `docs/README.md` and the hardware research note: lines that the 1.0.2 and 1.0.3 doc scripts replaced with a literal `$1` are restored.

## [1.0.3] - 2026-09-06

### Added
- `docs/research/HILIGHT_LED_ARRAY.md`: HiLight research with adb-measured facts (eight `LIGHT_TYPE_APPLICATION` lights, ids 1-8, RGB + animation capabilities, 33 ms update period), the `CONTROL_DEVICE_LIGHTS` gate, HiLight Studio internals and safety limits, and the plan for a `shizuku` availability state.
- `scripts/hilight-probe/HiLightProbe.java`: shell-level helper (`app_process`, uid 2000) that enumerates the lights, drives them through `ILightsManager`, reads back and clears with the stuck-LED mitigation sequence. Verified on the Pixel 11 Pro: all eight LEDs accepted a colour in ~3 ms and read back.

### Changed
- Device profile: sensor list confirms no object-temperature sensor on the Pixel 11 Pro; the two "Temperature" sensors are IMU and barometer die temperatures.
- `useHiLight` and the Silicon card describe the real gate (privileged permission, Shizuku path) instead of only "no API".

## [1.0.2] - 2026-09-06

### Added
- `modules/pixel-nano`: local Expo Module (Kotlin) over `com.google.mlkit:genai-prompt:1.0.0-beta4` (ML Kit GenAI Prompt API on AICore). Functions: `checkStatus`, `getModelInfo` (base model name, token limit, thinking/system-prompt/structured-output/caching flags), `download` with progress events, `warmup`, `countTokens`, `generate`, `stream` (tokens and thoughts as events), `setModelConfig` (stable/preview, full/fast). Errors surface as `E_NANO_<ErrorCode>`.
- `useGeminiNano`: on-device Gemini Nano chat with streaming `partial` text, capped transcript re-sent per turn (`buildNanoTurn`), natively measured latency and time-to-first-token, output tokens from the on-device tokenizer and a derived decode rate. No cloud fallback and no simulated reply.
- AI Lab: Gemini Nano section (status, model facts, download, warm-up, latency and decode-rate cards) and a Cloud / On-device engine switch for the conversation and voice input.
- Docs: `useGeminiNano` in DocsScreen, `docs/api/neural-ai.md`, `docs/HARDWARE_API.md`, `docs/AI_PRIMER.md`, README and PIXELFORGE; the Gemini Nano guide now records where the beta4 AAR differs from its sketches.

### Changed
- Build: the module passes `-Xskip-metadata-version-check` (genai-prompt is compiled with Kotlin 2.3; Expo 57 builds with 2.1.20) and pins every `kotlin-stdlib` artifact in the build to the project Kotlin version. Kotlin ≥ 2.3 is rejected by Expo modules, so the project version cannot be raised instead.
- `useTPU` comments and the Dashboard / Docs copy point at `useGeminiNano` for inference metrics instead of "not wired yet".
- Agent guides (`AGENTS.md`, `CLAUDE.md`, `GEMINI.md`) list both local modules.

## [1.0.1] - 2026-09-06

### Changed
- Web build keeps phone proportions: a centred 520 px column on the same field.
- Dashboard "android" row shows a dash on non-Android platforms instead of browser data.
- Docs, README and comments no longer claim 120x Generative AI Zoom, Ultra Low Light Video control, centimetre UWB ranging, a quad-mic beamforming array, or Gemini 2.5 Flash. Camera Looks and low-light video are described as Pixel Camera app features held as UI state; UWB ranging is described as simulated until RangingManager; the model is `gemini-3.8-flash`.
- `geminiClient`, `useHiLight`, `useUWB`, `useCamera`, `types.ts` and `DocsScreen` headers state what each hook really reads.

## [1.0.0] - 2026-09-06

First release. Target device: Google Pixel 11 Pro (Android 17, Tensor G6). Expo SDK 57, React Native 0.86.

### Added
- `modules/pixel-native`: local Expo Module (Kotlin) exposing real Android platform state: SoC/build identity, `/proc/cpuinfo` + cpufreq CPU topology and load, ActivityManager memory, PowerManager thermal headroom/status with Android 16 SystemHealth headroom, Display modes/ARR/HDR and preferred refresh rate, EGL GPU identity with Choreographer frame stats, CameraManager torch with strength levels, Vibrator capabilities with Android 16 envelope effects and primitive compositions, PackageManager feature and package probes (with `<queries>` for AICore).
- `src/core/observability.ts`: telemetry provenance (`hardware | derived | simulated | unavailable`), event log with `[PixelForge]` console prefix, `useObservability()`.
- `src/core/capabilities.ts` + `useCapabilities`: device capability resolution from the model table, upgraded to PackageManager-verified flags and the AICore version when the native module is present.
- Design system (`src/theme/colors.ts`, `src/theme/mode.ts`, `src/components/Decor.tsx`): Delta-aligned tokens (near-black blue-cast field, cyan accent, meaning colours), Geist / Geist Mono type, panel material (wash + hairline + specular), reactor, wordmark, status chips, section labels, telemetry rows.
- Dashboard observability panel; Sensors Lab envelope haptics and display controls; AI Lab on-device stack card.
- Expo MCP server registration (`.mcp.json`) and `expo-mcp` local capabilities; `npm run start:mcp`.
- Research and guides: `docs/research/` (hardware research, deep dive, adb device profile, device test report) and `docs/guides/` (on-device AI with Gemini Nano, function calling, voice).
- Documentation suite: `docs/api/*`, `docs/HARDWARE_API.md`, `docs/AI_PRIMER.md`, in-app `DocsScreen`.

### Changed
- All silicon hooks (`useCPU`, `useGPU`, `useMemory`, `useADPF`, `useDisplay`, `useTorch`, `useHaptics`, `useTPU`) read real device state; values that cannot be read are `null` and carry `source`.
- AI hooks (`useGemini`, `useVisionAI`, `useSpeechAI`) use `gemini-3.8-flash` with real chat history, structured JSON vision output, and Gemini audio transcription. Simulated fallbacks removed; missing key produces an error message.
- `useAudio` migrated from `expo-av` to `expo-audio` (16 kHz mono, `voice_recognition` source, 100 ms dBFS metering).
- `useTemperature` reports `isHardwareSupported=false` / `availability='estimated'` on the Pixel 11 Pro family (no thermometer). `useHiLight` reports `availability` (`simulated` on Pixel 11 Pro family; no public API).
- `HapticButton`: two weights (solid accent/danger, outlined) plus ghost; 44 dp minimum hit target.
- `MetricCard`: panel material, mono labels, wrap-safe header, provenance tag.
- `SensorVisualizer`: centred bars with per-sensor ranges.
- App shell: safe-area insets, wordmark header, underline navigation.
- Build: `expo-dev-client`, `expo-build-properties` (compileSdk/targetSdk 36, minSdk 26), `react-native-safe-area-context`, `expo-linear-gradient`, `expo-font`.

### Removed
- `expo-av` dependency.
- Fabricated CPU load, GPU frame time, memory, TPU latency, and thermal numbers.
- Lightning-bolt logo.

### Known limitations
- NFC, BLE and UWB hooks are simulated and labelled `SIMULATED` until native paths land (Android 16 `RangingManager`, `react-native-nfc-manager`, a BLE library).
- Gemini Nano on-device inference is not wired yet (`pixel-nano` module planned); `useTPU` reports detection only.
- `compileSdk 37` does not build with Expo 57's AGP 8.12 (Android 17 SDK ships as `android-37.0`); Android 17 APIs are used behind runtime guards.
- SystemHealthManager CPU/GPU headroom returns null on the test device; under investigation.
