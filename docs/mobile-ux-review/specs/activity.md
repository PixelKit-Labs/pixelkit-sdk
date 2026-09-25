# Delta Mobile UX Specification: Activity & Telemetry Subsystem

**Document Version:** 1.1.0-REVISED
**Subsystem:** Activity, Telemetry, Performance Traces & Diagnostics
**Domain Prefix:** `T` (Telemetry / Activity)
**Parent Plan:** [Fresh Start Mobile UI Review](../../FRESH_START.md)
**Consolidated Connections Reference:** [Connections Architecture Spec](connections.md) (Owned by MOM)
**Target Repository:** `delta-mobile` (`src/screens/TelemetryScreen.tsx`, `src/components/TraceWaterfall.tsx`, `src/core/logStore.ts`)

---

## 1. Executive Summary & Design System Architecture

### 1.1 Conversational Hub Integration
Activity & Telemetry transitions from a bottom-tab screen into an on-demand **System Telemetry & Performance Inspector** accessible directly from the Conversation Hub.

```
┌─────────────────────────────────────────────────────────┐
│                      CONVERSATION HUB                   │
│  [≡ Menu]            DELTA HUD             [● State]    │
│  [Transcript / Multi-turn Dialogue Stream / Orb]        │
│                                                         │
│  [+] [Spacious Multiline Composer Bar]       [🎤 / Orb] │
└────────────────────────────┬────────────────────────────┘
                             │  Tap Header Activity Chip or Drawer
                             ▼
┌─────────────────────────────────────────────────────────┐
│              ACTIVITY & TELEMETRY HUB (T00)             │
│  [← Hub]         SYSTEM ACTIVITY & METRICS        [✕ Done]│
│  Neutral Dark Charcoal (#090A0C / #121316 / #181A1F)   │
│                                                         │
│  T01 Silicon     T02 Tools       T03 Traces   T04 Logs  │
│  T05 Errors      T06 Streams     T07 Images   T08 Audio │
└─────────────────────────────────────────────────────────┘
```

- **Entry Routes:**
  - Conversation Hub header activity chip / status indicator.
  - Conversation Hub drawer menu (`Activity & Telemetry`).
  - Contextual doclink from tool execution cards or error banners.
- **Exit & Back Navigation:**
  - Accessible top-left `← Hub` chevron (minimum 48×48dp hit target).
  - Edge swipe-to-dismiss gesture (swipe right to pop on Android/iOS).
  - Hardware Android Back button returns directly to Conversation Hub.
- **Architectural Reality (Proposed vs Existing Features):**
  - **Proposed Features:** A global telemetry pause button, 1.0Hz polling governor, exportable diagnostic bundle zip, and background continuity service are **proposed architectural additions**, NOT existing source implementations.
  - **Existing Reality:** `TelemetryScreen.tsx` reacts to store updates (`SessionStore`, `LogStore`, `ImageStore`, `UsageStore`) and mounts real-time SDK hooks without an explicit UI pause or global timer governor.
- **Zero-Simulation Doctrine & Source Fallback Reality:**
  - Every telemetry reading must reflect physical hardware state. Unconnected sensors or unreadable values evaluate strictly to `null`, render visibly as an em dash (`—`), and report status `Unavailable`.
  - **Audit of Current Code Fallbacks:** Current source code contains synthetic fallbacks:
    1. `TelemetryScreen.tsx:261`: `const headroomVal = adpf.thermalHeadroom != null ? Math.min(Math.max(adpf.thermalHeadroom, 0), 1) : 0.82;` (fabricates `0.82` when headroom is unreadable).
    2. `TelemetryScreen.tsx:352`: Fallback text `'NOMINAL'` rendered when `adpf.thermalHeadroom` is null.
    3. `TelemetryScreen.tsx:234`: `const peak = Math.round(speechAI.voiceDecibels ?? -32);` (fabricates `-32dB` acoustic baseline).
    In this specification, all fabricated values are eliminated in favor of explicit `null` / `—` / `Unavailable`.
  - **Hardware Claim Reality:** Hardware calls are classified as **call-path-exists / device-unverified** rather than active/verified hardware until verified via on-device testing.
- **Visual Surface Palette (Pearl / Pink / Magenta / Violet — Zero Blue / Cyan Controls):**
  - Background Canvas: `#090A0C` (obsidian black).
  - Panel Surfaces: `#121316` (neutral charcoal zinc).
  - Elevated Metric Cards: `#181A1F` (neutral slate tile).
  - Hairlines / Borders: `rgba(255, 255, 255, 0.08)` / `#24272E`.
  - Primary Highlight / Focus: `#F472B6` (pink) / `#E879F9` (magenta).
  - Model & AI Stream Accent: `#A855F7` (violet).
  - Base Specular Light: `#F3F4F6` (pearl).
  - Status Indicators: Success `#10B981`, Amber Warning `#F59E0B`, Danger `#EF4444`.
  - **Color Constraint:** Zero blue or cyan controls across all interactive toggles, buttons, and badges.

---

## 2. Page Inventory: Activity & Telemetry Subsystem

| ID | Page / Section Name | Source Location | Implementation Status | Primary Function |
| :--- | :--- | :--- | :--- | :--- |
| **T00** | Activity & Telemetry Hub Shell | `TelemetryScreen.tsx:78–91` | Implemented (Subtab row mounted; pause is proposed) | Shell container, subtab switcher, session KPI cards |
| **T01** | Silicon Telemetry & Real-Time Hardware | `TelemetryScreen.tsx:371–420` | Partially Implemented (**Has fallback 0.82 & 'NOMINAL'**) | Silicon metrics (call-path-exists / device-unverified) |
| **T02** | Tool Execution Traffic & Analytics | `TelemetryScreen.tsx:422–490` | Implemented (In-memory execution tracker active) | Tool invocation counts, average/peak latency, failure rate |
| **T03** | Pipeline Trace Waterfall (Gantt Spans) | `TelemetryScreen.tsx:492–540`, `TraceWaterfall.tsx` | Implemented (Interactive Gantt spans & stall detection) | Multi-stage turn timing breakdown, span inspector |
| **T03.1**| Span Detail Inspector Drawer | `TraceWaterfall.tsx` | Proposed (Detailed argument & return payload viewer) | In-depth span metadata, input/output inspection |
| **T04** | Live Diagnostic Log Buffer & Stream | `TelemetryScreen.tsx:542–620`, `logStore.ts` | Partially Implemented (**200-item buffer; search is proposed**) | Ring buffer (max 200), level filter pills, copy entry |
| **T05** | System & Native Error Occurrences | `TelemetryScreen.tsx:622–680` | Implemented (Error stack capture, occurrence counts) | Crash and unhandled exception inspector |
| **T06** | Standing Event Streams & SSE Feeds (Alias) | `TelemetryScreen.tsx:682–740` | Implemented (Consolidated in `specs/connections.md`) | Alias route linking to canonical `connections.md` |
| **T07** | Generated Visual Artifacts & Archive | `TelemetryScreen.tsx:742–810`, `imageStore.ts` | Implemented (Local persistent image gallery & prompts) | Image prompt inspection, dimension tags, detail crosslink |
| **T07.1**| Image Detail & Prompt Crosslink Modal | `ImageGalleryModal.tsx` | Implemented (Full-screen preview, metadata, export) | Full-resolution inspection, generation parameters |
| **T08** | Acoustic Hardware & Harmonic Benchmark | `TelemetryScreen.tsx:812–890`, `earcons.ts` | Partially Implemented (**Mic level -32dB is mock/fallback**) | Offline pure-sine tone generator, mic directivity test |

---

## 3. Detailed Page Specifications

### T00: Activity & Telemetry Hub Shell

#### Proposed Layout Specimen (Sample)
```
┌─────────────────────────────────────────────────────────┐
│ [← Hub]              ACTIVITY & TELEMETRY         [✕ Done]│
├─────────────────────────────────────────────────────────┤
│ [Silicon] [Tools] [Traces] [Logs] [Errors] [Streams] .. │
├─────────────────────────────────────────────────────────┤
│ ┌──────────────────────┐  ┌───────────────────────────┐ │
│ │ DIALOGUE TURNS       │  │ TPU DECODE SPEED          │ │
│ │ 14 (8 user · 6 model)│  │ 28.4 tok/s (TTFT 340ms)   │ │
│ ├──────────────────────┤  ├───────────────────────────┤ │
│ │ THERMAL HEADROOM     │  │ POWER & CHARGING          │ │
│ │ 72% [████████░░░░]   │  │ 18W (PPS Fast Charging)   │ │
│ └──────────────────────┘  └───────────────────────────┘ │
├─────────────────────────────────────────────────────────┤
│ Active Subtab Content Area...                           │
└─────────────────────────────────────────────────────────┘
```

- **Purpose:** Top-level shell hosting the 4 hero KPI tiles and routing between the 8 dedicated subtabs.
- **Source Path:** `delta-mobile/src/screens/TelemetryScreen.tsx` lines 68–130.
- **Controls & Behavior:**
  - Header: Accessible `← Hub` chevron and `✕ Done` button (min 48×48dp).
  - Subtab Row: Horizontally scrollable row of pill buttons for `T01`–`T08`.
  - 4 Hero KPI Tiles: Dialogue turns, TPU decode speed, Thermal headroom meter, Power & charging tier.
- **Clarification on Polling & Pause:** The current app subscribes to store changes directly. Global pause/resume toggling, 1.0Hz polling governors, and export bundles are proposed future enhancements.

---

### T01: Silicon Telemetry & Real-Time Hardware Overview

#### Proposed Layout Specimen (Sample)
```
┌─────────────────────────────────────────────────────────┐
│ T01: SILICON TELEMETRY & PHYSICAL HARDWARE              │
├─────────────────────────────────────────────────────────┤
│ TOKEN CONSUMPTION & RATES                               │
│ • Local Silicon: Zero-cost on-device TPU (AICore)       │
│ • Cloud API: Google Gemini API (Priced session)         │
├─────────────────────────────────────────────────────────┤
│ HARDWARE SUBSYSTEM READINGS (CALL-PATH-EXISTS)          │
│ • ADPF THERMAL HEADROOM: 0.72 (Status: Nominal)         │
│   (Source: Hardware · Fallback 0.82 eliminated)         │
│ • FIR THERMOMETER (MLX90632):                           │
│   Surface: 24.2°C · Object: 31.8°C (Call-path-exists)   │
│ • BAROMETER & ALTIMETER:                                │
│   Pressure: 1,013.2 hPa · Vertical Velocity: 0.0 m/s    │
│ • BATTERY SHARE (REVERSE QI):                           │
│   Status: Disabled · Target: 0.0W                       │
│ • ULTRA-WIDEBAND (UWB):                                 │
│   Status: [ — ] Unavailable (Requires paired target)    │
└─────────────────────────────────────────────────────────┘
```

- **Purpose:** Display physical Google Pixel 11 Pro silicon status, thermals, battery, and environmental sensors.
- **Source Path:** `TelemetryScreen.tsx:371–420`.
- **Implementation Status:** Partially Implemented.
  - **Zero-Simulation Reality:** Replaces the existing fallback `0.82` (line 261) and `'NOMINAL'` string (line 352) with real reading or explicit `"—"` / `Unavailable`.
  - **Hardware Claim Reality:** Subsystem hooks (`useThermometer`, `useAltimeter`, `useBatteryShare`) are documented as **call-path-exists / device-unverified**.

---

### T02: Tool Execution Traffic & Latency Analytics

#### Proposed Layout Specimen (Sample)
```
┌─────────────────────────────────────────────────────────┐
│ T02: TOOL EXECUTION TRAFFIC & LATENCY                   │
├─────────────────────────────────────────────────────────┤
│ TRAFFIC SUMMARY                                         │
│ Total Calls: 84 · Success Rate: 97.6% · Failures: 02    │
│ Avg Latency: 184ms · Peak: 1,240ms                      │
├─────────────────────────────────────────────────────────┤
│ FREQUENT TOOL EXECUTIONS                                │
│ • set_torch (Physical Actuator)                         │
│   Calls: 32 · Success: 100% · Avg: 18ms · Peak: 42ms    │
│ • capture_scene (Perception / Camera)                   │
│   Calls: 18 · Success: 100% · Avg: 620ms · Peak: 940ms  │
│ • http_request (Network Outbound)                       │
│   Calls: 14 · Success: 85.7% · Avg: 410ms               │
└─────────────────────────────────────────────────────────┘
```

- **Purpose:** Audit autonomous tool calling behavior, latency bottlenecks, and error rates.
- **Source Path:** `TelemetryScreen.tsx:422–490`.
- **Implementation Status:** Implemented. Aggregates tool executions recorded in `LogStore`.

---

### T03: Pipeline Trace Waterfall (Gantt-Chart Execution Spans)

#### Proposed Layout Specimen (Sample)
```
┌─────────────────────────────────────────────────────────┐
│ T03: PIPELINE TRACE WATERFALL                           │
├─────────────────────────────────────────────────────────┤
│ ROOT TRACE: Turn #14 "Turn on torch and check battery"  │
│ Total Duration: 842ms · Spans: 5 · Status: Succeeded    │
├─────────────────────────────────────────────────────────┤
│ TIMELINE WATERFALL (GANTT CHART)                        │
│ 0ms                    400ms                   842ms    │
│ ├─ Intent Triage (TypeSafe Jev) [32ms]                  │
│ │  [■■■]                                                │
│ ├─ Model Reasoning (Gemini Flash) [610ms]               │
│ │  ░░░░[■■■■■■■■■■■■■■■■■■■■■■■■■■■■]                   │
│ ├─ Tool: set_torch (Hardware Actuator) [18ms]           │
│ │  ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░[■]                │
│ └─ Audio Synthesizer (Earcon Commit) [12ms]             │
│    ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░[■]            │
└─────────────────────────────────────────────────────────┘
```

- **Purpose:** Visualize multi-stage dialogue turn latency and stall bottlenecks via an interactive Gantt chart.
- **Source Path:** `TelemetryScreen.tsx:492–540`; `src/components/TraceWaterfall.tsx`.
- **Implementation Status:** Implemented. Spans derived from active turn logs.

#### T03.1: Span Detail Inspector Drawer
```
┌─────────────────────────────────────────────────────────┐
│ T03.1: SELECTED SPAN DETAILS                            │
├─────────────────────────────────────────────────────────┤
│ SPAN: tool:set_torch                                    │
│ Subsystem: HARDWARE · Latency: 18ms · Depth: 1          │
│ Start: +642ms · End: +660ms                             │
│ Inputs: { "state": "on", "intensity": 1.0 }             │
│ Output: { "success": true, "source": "hardware" }       │
│ [ CLOSE INSPECTOR ]                                     │
└─────────────────────────────────────────────────────────┘
```
- Proposed: tapping a span opens a detail drawer. Current source renders inline selected-span metadata, time, status, error and attributes. Show structured arguments/results only when actually recorded and redacted; the sample is not an existing data contract.

---

### T04: Live Diagnostic Log Buffer & Event Stream

#### Proposed Layout Specimen (Sample)
```
┌─────────────────────────────────────────────────────────┐
│ T04: DIAGNOSTIC LOG BUFFER                              │
├─────────────────────────────────────────────────────────┤
│ BUFFER CAPACITY: 200 ITEMS (RING BUFFER)                │
│ FILTER: [ ALL ] [ INFO ] [ WARN ] [ ERROR ] [ TOOL ]    │
│ [ 🔍 Search logs by message... (Proposed Feature)     ] │
├─────────────────────────────────────────────────────────┤
│ 15:20:14.120 [INFO] [AICORE] Gemini Nano runtime ready  │
│ 15:20:12.804 [TOOL] [HARDWARE] set_torch invoked (on)   │
│ 15:20:11.450 [WARN] [ADPF] Thermal headroom drop to 0.42│
│ 15:19:58.210 [INFO] [BOOT] Delta Mobile initialized     │
└─────────────────────────────────────────────────────────┘
```

- **Purpose:** Structured diagnostic logging and level filtering for real-time debugging.
- **Source Path:** `TelemetryScreen.tsx:542–620`; `src/core/logStore.ts`.
- **Implementation Status:** Partially Implemented.
  - **Buffer Truth:** `LogStore.ts:21` has `maxLogs = 200` (NOT 1000).
  - **Filter Truth:** Filter chips `all`, `info`, `warn`, `error`, `tool` are implemented. Log keyword text search is a **proposed feature**.
  - **Action:** 1-tap copy of log entry to clipboard with haptic confirmation.

---

### T05: System & Native Error Occurrences

#### Proposed Layout Specimen (Sample)
```
┌─────────────────────────────────────────────────────────┐
│ T05: SYSTEM & NATIVE ERROR OCCURRENCES                  │
├─────────────────────────────────────────────────────────┤
│ UNHANDLED EXCEPTION LOG                                 │
│ Total Intercepted: 02 · Critical: 00 · Non-Fatal: 02    │
├─────────────────────────────────────────────────────────┤
│ • TypeError: Cannot read property 'map' of undefined    │
│   Component: ConversationTurn.tsx:142                   │
│   Occurrences: 1 · Timestamp: 15:14:02                  │
│   [ VIEW STACK ]  [ COPY REPORT ]                       │
└─────────────────────────────────────────────────────────┘
```

- **Purpose:** Dedicated error occurrence inspector for uncaught React errors and bridge failures.
- **Source Path:** `TelemetryScreen.tsx:622–680`.
- **Implementation Status:** Implemented. Tracks error instances with stack traces.

---

### T06: Standing Event Streams & SSE Feeds (Alias Route)

- **Consolidated Architecture Ownership:** SSE feeds and live connection broker specs are owned by MOM in `docs/mobile-ux-review/specs/connections.md`.
- **Source Path:** `TelemetryScreen.tsx:682–740`.
- **Local Function:** Displays active stream cards with deep links to `connections.md`.

---

### T07: Generated Visual Artifacts & Archive

#### Proposed Layout Specimen (Sample)
```
┌─────────────────────────────────────────────────────────┐
│ T07: GENERATED VISUAL ARTIFACTS ARCHIVE                 │
├─────────────────────────────────────────────────────────┤
│ SAVED ARTIFACTS: 04 IMAGES                              │
│ ┌───────────────┐  ┌───────────────┐                    │
│ │ [Image Thumb] │  │ [Image Thumb] │                    │
│ │ "Pixel 11 Pro"│  │ "Thermal Flow"│                    │
│ │ 1024x1024 PNG │  │ 1024x1024 PNG │                    │
│ └───────────────┘  └───────────────┘                    │
└─────────────────────────────────────────────────────────┘
```

- **Purpose:** Local persistent gallery of AI-generated images with prompts and model provenance.
- **Source Path:** `TelemetryScreen.tsx:742–810`; `src/core/imageStore.ts`.
- **Implementation Status:** Implemented. Subscribes to `ImageStore`.

#### T07.1: Image Detail & Prompt Crosslink Modal
```
┌─────────────────────────────────────────────────────────┐
│ T07.1: ARTIFACT DETAIL                                  │
├─────────────────────────────────────────────────────────┤
│ [ FULL RESOLUTION IMAGE PREVIEW ]                       │
│ PROMPT: "Macro circuit trace of Google Tensor G6 TPU"   │
│ MODEL: Imagen 3.0 Fast · DIMENSIONS: 1024x1024          │
│ CREATED: 2026-09-19T14:48:22Z                           │
│ [ SAVE TO GALLERY ]  [ SHARE ]  [ CLOSE ]               │
└─────────────────────────────────────────────────────────┘
```
- Proposed full-screen inspection modal. Current telemetry renders images inline with deletion; save/share and prompt crosslinks require implementation and permission handling.

---

### T08: Acoustic Hardware & Harmonic Benchmark

#### Proposed Layout Specimen (Sample)
```
┌─────────────────────────────────────────────────────────┐
│ T08: ACOUSTIC HARDWARE & HARMONIC BENCHMARK             │
├─────────────────────────────────────────────────────────┤
│ PURE-SINE HARMONIC TONE TEST                            │
│ Plays 440Hz (A4) → 880Hz (A5) → 1760Hz (A6) at 44.1kHz  │
│ [ RUN OUTPUT TONE TEST ]                                │
├─────────────────────────────────────────────────────────┤
│ MICROPHONE ACOUSTIC DIRECTIVITY TEST                    │
│ Listens for test phrase; verifies beamforming array     │
│ [ RECORD ACOUSTIC TEST (3.0s) ]                         │
│ Peak Level: [—] dBFS (Source: SpeechAI / No -32dB mock) │
│ Heard Text: "Delta acoustic test nominal"               │
└─────────────────────────────────────────────────────────┘
```

- **Purpose:** Offline audio self-test verifying DAC harmonic output and microphone array input.
- **Source Path:** `TelemetryScreen.tsx:812–890`.
- **Implementation Status:** Partially Implemented.
  - **Zero-Simulation Truth:** Replaces the mock fallback `speechAI.voiceDecibels ?? -32` with real dBFS metering or `"—"`.
  - **Tone Output:** `Earcons.playThreeRisingTones()` synthesizes PCM WAV audio.


## Navigation consistency update ? 2026-09-19

The user now prefers a leading mobile Back arrow throughout the flow. [The current navigation contract](../NAVIGATION.md) supersedes Close/X page exits and earlier back-to-Console shortcuts in this proposal. Details return to their feature index; roots return to the recorded caller. Other visual/layout proposals are not marked complete by this navigation increment.


### Submenu implementation checkpoint - 2026-09-19

See [the submenu review](../SUBMENU-REVIEW.md) for implemented corrections, actual browser coverage and remaining PNG differences. Source1.0.59/code115; proposal-only pages are not implicitly implemented by this checkpoint.

### Logs, Errors and Images source checkpoint ? 1.0.60

Logs display actual records only, with timestamp/severity/subsystem and an explicit Copy action; failures are announced without changing the source text. Errors has no typed recovery contract, so it must not infer permission failures or offer guessed retry actions. Images opens ImageGalleryModal outside the Activity scroll view. Its inspector returns to archive, then the caller-labelled Back returns to Activity; invalid image URIs keep metadata readable. Native share and populated/failing image flows remain unverified. The archive uses neutral theme tokens and48dp actions. See IMPLEMENTATION.md for build, browser captures and the locked-phone ARTEMIS attempt.
