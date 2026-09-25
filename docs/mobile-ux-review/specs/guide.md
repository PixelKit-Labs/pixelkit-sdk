# Delta Mobile UX Specification: Operational Guide, Reference & Component Gallery Subsystem

**Document Version:** 1.1.0-REVISED
**Subsystem:** Operational Guide, System Reference, Living Component Gallery & Interface Recovery
**Domain Prefix:** `G` (Guide & Reference)
**Parent Plan:** [Fresh Start Mobile UI Review](../../FRESH_START.md)
**Consolidated Connections Reference:** [Connections Architecture Spec](connections.md) (Owned by MOM)
**Target Repository:** `delta-mobile` (`src/components/GuideModal.tsx`, `src/screens/DocsScreen.tsx`, `src/components/DesignSystemCatalog.tsx`, `src/components/HudPrimitives.tsx`, `App.tsx:39-68`)

---

## 1. Executive Summary & Design System Architecture

### 1.1 Conversational Hub Integration & Mounted Tabs Reality
In accordance with the approved direction, Delta Mobile eliminates persistent bottom tabs (`Console`, `Agent`, `Telemetry`, `Settings`) and establishes an **immersive, full-screen Conversation Hub**.

```
┌─────────────────────────────────────────────────────────┐
│                      CONVERSATION HUB                   │
│  [≡ Menu]            DELTA HUD             [● State]    │
│  [Transcript / Streamed Dialogue Turns / Generative UI] │
│                                                         │
│  [+] [Spacious Multiline Composer Bar]       [🎤 / Orb] │
└────────────────────────────┬────────────────────────────┘
                             │  Tap Drawer Menu [Guide & Reference]
                             │  or Contextual Link / Crash Boundary
                             ▼
┌─────────────────────────────────────────────────────────┐
│           OPERATIONAL GUIDE & REFERENCE HUB (G00)       │
│  [← Hub]          KNOWLEDGE & DESIGN HUB         [✕ Done]│
│  Neutral Dark Charcoal (#090A0C / #121316 / #181A1F)    │
│  [🔍 Find hook, component, primitive, or keyword...]    │
│                                                         │
│  [G01 Running]  [G02 Reference]  [G03 Components]       │
│  [G04 SDK Hooks (Proposed)] [G05 Directives] [G06 Reset]│
└─────────────────────────────────────────────────────────┘
```

- **Mounting & Reachability Audit (Source Reality):**
  - **Currently Mounted Tabs:** `delta-mobile/App.tsx:70–81` mounts exactly 4 tabs: `Console`, `Agent`, `Telemetry`, `Settings`.
  - **`Docs` is NOT a Mounted Tab:** The Docs screen is absent from `App.tsx` tab navigation.
  - **Unreachable Legacy Artifacts:** `delta-mobile/src/screens/DocsScreen.tsx` and `delta-mobile/src/components/DesignSystemCatalog.tsx` are unmounted and unreachable from primary navigation. Similarly, `delta-mobile/src/components/SettingsModal.tsx` is dead code.
  - **Proposed Reuse:** `G04` (On-Device SDK Hook Reference) and `G05` (Golden Rules & Directives) represent **proposed reuse** and migration of these rich unmounted contracts into the on-demand Knowledge Hub shell.
- **Entry & Dismissal Routes:**
  - Drawer menu item (`Operational Guide & Reference`) in Conversation Hub.
  - Contextual doclinks from tool cards and error diagnostics.
  - Accessible top-left `← Hub` chevron and top-right `✕ Done` button (minimum 48×48dp hit targets).
  - Downward sheet drag gesture or Android Back button cleanly dispatches back to Hub.

---

### 1.2 The Authentic Delta Orb vs Mobile Reactor

Delta's primary visual identity centers on the **authentic desktop Delta Orb**, ported from Desktop Delta (`Delta/web/src/components/hud/orb/siri-orb.tsx` and `Delta/web/src/index.css:598-675`).

```
          AUTHENTIC DELTA ORB (DESKTOP SPECIFICATION)
                       ┌───────────────┐
                   .-'  .  .  .  .  .  '-.
                 .'  .  :  :  :  :  :  .  '.
                /  .  :  :  :  :  :  :  .  \
               ;  .  :  :  :  :  :  :  :  .  ;
               |  .  :  [GLOSSY MESH]  :  .  |
               ;  .  :  :  :  :  :  :  :  .  ;
                \  .  :  :  :  :  :  :  .  /
                 '.  .  :  :  :  :  :  .  .'
                   '-.  .  .  .  .  .  .-'
                       └───────────────┘
          • Glossy sphere with gradient color lobes
          • Drifting specular sheen (.siri-orb-sheen)
          • Inset depth rim (.siri-orb-rim)
          • STRICTLY NO OUTER RINGS
          • REJECTS GEMINI 4-POINTED STAR (✦)
```

#### Technical Comparison: Authentic Orb vs Mobile Reactor
1. **The Authentic Desktop Orb (`siri-orb.tsx` / `index.css:598-675`):**
   - Built from seven rotating conic gradient lobes rotated by an animated `@property` angle, blurred and contrast-crushed into an iridescent mesh.
   - Finished with an inset depth rim (`box-shadow: inset 0 0 0 1px hsl(0 0% 100% / 0.16), inset 0 calc(var(--rim)*1) ...`) and a drifting specular sheen (`.siri-orb-sheen`).
   - **Crucial Distinction:** The authentic orb is a pure self-contained sphere. **It has NO outer rings.**
2. **The Mobile `Reactor` (`delta-mobile/src/components/HudPrimitives.tsx`):**
   - The mobile `Reactor` renders flat concentric circles (`OrbitRings`) with an emissive CSS pulse. **Mobile Reactor is NOT equivalent to the authentic Delta Orb.**
   - In this redesign specification, the mobile HUD transitions from the primitive `Reactor` rings to the authentic glossy Delta sphere.
3. **Mobile Color Palette Proposal (Pearl / Pink / Magenta / Violet — NO Blue or Cyan Controls):**
   - **Sphere Ambient Base:** Obsidian neutral `#090A0C` to `#181A1F`.
   - **Base Specular Highlight:** Pearl (`#F3F4F6`, adapted from `oklch(92% 0.03 300)`).
   - **Primary Rim / Lobe Accent:** Pink (`#F472B6`, adapted from `oklch(68% 0.21 350)`).
   - **Secondary Depth Lobe:** Magenta (`#E879F9`, adapted from `oklch(72% 0.19 325)`).
   - **Tertiary Core Glow:** Violet (`#A855F7`, adapted from `oklch(66% 0.2 285)`).
   - **Color Constraint:** Zero blue or cyan controls across all interactive toggles, buttons, and badges.

---

### 1.3 The Zero-Simulation Doctrine in Documentation

Every claim made in the Guide and Reference chapters must reflect verified reality:
- **Strict Provenance:** Documented hooks report `source: 'hardware' | 'derived' | 'unavailable'`. There is no simulated type.
- **Hardware Claims Reality:** Telemetry readings and hardware interfaces are described as **call-path-exists / device-unverified** until confirmed through physical on-device hardware runs.
- **Audit of Synthetic Fallbacks in Current Code:**
  - `WakeEnroll.tsx`: Uses a prototype sample-count formula (`0.82 + samples.length * 0.035`) and random numbers; has no C++ FFT engine or acoustic training.
  - `TelemetryScreen.tsx`: Hardcodes fallback `0.82` (line 261), `'NOMINAL'` (line 352), and mic `-32dB` baseline (line 234).
  - `SettingsScreen.tsx`: Hardcodes device strings in About (lines 921–926) and currency selection only triggers a toast without state update (line 823).
  - `WhatsAppPanel.tsx`: Implements mock QR generation and fake pairing timers.
  Across all guide documentation, these features are explicitly labeled as `Unavailable / Prototype Implementation`.

---

## 2. Page Inventory: Guide & Reference Subsystem

| ID | Page / Section Name | Source Location | Implementation Status | Primary Function |
| :--- | :--- | :--- | :--- | :--- |
| **G00** | Operational Guide & Knowledge Hub Shell | `GuideModal.tsx`, `DocsScreen.tsx` | Partially Implemented (Modal mounted from Settings; Docs unmounted) | Unified knowledge shell, global search, section routing |
| **G01** | Running It: Voice Operations & Edge Execution | `GuideModal.tsx:139-166` | Implemented (Voice timing & local execution doctrine) | Hands-free VAD, 1.4s silence auto-commit, continuous mode |
| **G02** | Reference: Hardware Subsystems & Security | `GuideModal.tsx:168-204` | Implemented (Actuators, Keystore, Earcon frequency map) | 16 physical actuators, Titan M2 Keystore, Earcon audio map |
| **G03** | Living Component Gallery | `GuideModal.tsx:206-281`, `DesignSystemCatalog.tsx` | Partially Implemented (**Living specimens exist; orb needs upgrade**) | Authentic Delta Orb specimen, StatTile, Generative Cards |
| **G03.1**| Gallery Component Detail & Token Drawer | `DesignSystemCatalog.tsx` | Implemented (Living contracts, inputs, outputs, capabilities) | Inspects living component contracts & token dependencies |
| **G04** | On-Device API Reference & SDK Hook Viewer | `DocsScreen.tsx`, `docsData.ts` | **Proposed Reuse** (Unmounted legacy screen to be integrated) | Real exported hooks reference, takes/gives-back, deep-links |
| **G04.1**| Hook Detail & Search Empty State | `DocsScreen.tsx` | Proposed (Detailed callable signature and zero-result fallback) | Deep-dive signature inspection, zero-match resolution |
| **G05** | Golden Rules & Architectural Directives | `DocsScreen.tsx:46-63` | **Proposed Reuse** (Unmounted legacy screen to be integrated) | 5 Golden Rules, 7-point agent system prompt directive |
| **G06** | Interface Recovery & Error Boundary Screen | `delta-mobile/App.tsx:39-68` (`DeltaErrorBoundary`) | Partially Implemented (**Covers React render/lifecycle only**) | Crash recovery UI, stack triage, soft reset, retry mount |

---

## 3. Detailed Page Specifications

### G00: Operational Guide & Knowledge Hub Shell

#### Proposed Layout Specimen (Sample)
```
┌─────────────────────────────────────────────────────────────┐
│ [← Hub]         DELTA KNOWLEDGE & SYSTEM REFERENCE   [✕ Done]│
│ Subtitle: Operational Guide · Reference · Component Gallery │
├─────────────────────────────────────────────────────────────┤
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ 🔍 FIND: [ hook, component, primitive, or keyword...  ] │ │
│ └─────────────────────────────────────────────────────────┘ │
├─────────────────────────────────────────────────────────────┤
│ [All] [Running It] [Reference] [Components] [Hooks] [Rules] │
│ ← Horizontal Category Pills (Pearl/Pink/Violet Focus) →    │
├─────────────────────────────────────────────────────────────┤
│ Active Category Content Stream...                           │
└─────────────────────────────────────────────────────────────┘
```

- **Purpose:** Primary container uniting the Operational Guide, System Reference, Living Component Contracts, and SDK Hook documentation into a cohesive, searchable on-demand surface.
- **Source Path:** `delta-mobile/src/components/GuideModal.tsx`; `delta-mobile/src/screens/DocsScreen.tsx`.
- **Implementation Reality:** In current code, `GuideModal` is invoked as a modal from `SettingsScreen.tsx:1007`, while `DocsScreen.tsx` is unmounted. Proposed design unifies them into a top-level drawer-accessible sheet.
- **Controls & Behavior:**
  - Header: Back chevron (`← Hub`, 48×48dp), Title, Close button (`✕ Done`, 48×48dp).
  - Search Input: Real-time query matching across guide sections, component names, and SDK hook contracts.
  - Subtab Chips: Horizontally scrollable pill buttons (`HapticButton` sm).

---

### G01: Running It: Voice Operations & Edge Execution

#### Proposed Layout Specimen (Sample)
```
┌─────────────────────────────────────────────────────────────┐
│ G01: RUNNING IT                                             │
├─────────────────────────────────────────────────────────────┤
│ ┌─ HANDS-FREE DIALOGUE & VAD ─────────────────────────────┐ │
│ │ Delta operates completely hands-free using on-device    │ │
│ │ Voice Activity Detection (VAD). When you speak, audio   │ │
│ │ streams into the buffer and auto-commits after 1.4s of  │ │
│ │ continuous silence.                                     │ │
│ │                                                         │ │
│ │ ┌─ CONTINUOUS MODE (6.0s PRIME WINDOW) ───────────────┐ │ │
│ │ │ 3-microphone beamforming array stays primed for 6s  │ │ │
│ │ │ after response for natural conversational turns.    │ │ │
│ │ └─────────────────────────────────────────────────────┘ │ │
│ └─────────────────────────────────────────────────────────┘ │
│ ┌─ ZERO-SIMULATION PRINCIPLE ─────────────────────────────┐ │
│ │ Every telemetry reading reflects physical hardware.     │ │
│ │ Unconnected sensors evaluate to null and render as "—". │ │
│ │ Fabricated or plausible defaults are unrepresentable.   │ │
│ └─────────────────────────────────────────────────────────┘ │
│ ┌─ TENSOR G6 EDGE AI ACCELERATION ────────────────────────┐ │
│ │ Executes on Google Pixel 11 Pro TPU via Android AICore  │ │
│ │ and Gemini Nano. Offline mode ensures 100% data privacy.│ │
│ └─────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

- **Purpose:** Document operational thresholds for hands-free VAD and explain local Tensor G6 edge inference.
- **Source Path:** `GuideModal.tsx:139–166`.
- **Timing Thresholds:**
  - Speech onset: 200ms above acoustic floor.
  - Silence auto-commit: 1,400ms (1.4s).
  - Continuous conversation listening window: 6,000ms (6.0s).
- **Zero-Simulation Statement:** Emphasizes that unreadable values render as an em dash (`—`) and report `Unavailable`.

---

### G02: Reference: Hardware Subsystems & Security

#### Proposed Layout Specimen (Sample)
```
┌─────────────────────────────────────────────────────────────┐
│ G02: REFERENCE                                              │
├─────────────────────────────────────────────────────────────┤
│ ┌─ PHYSICAL HARDWARE SUBSYSTEMS (CALL-PATH-EXISTS) ───────┐ │
│ │ • SILICON CORES: 1x X925 + 3x A725 + 4x A520            │ │
│ │ • THERMAL HEADROOM: ADPF Thermal HAL (0.0..1.0)         │ │
│ │ • BAROMETER: ICAO Pressure & Velocity (m/s)             │ │
│ │ • FIR THERMOMETER: MLX90632 Object & Surface            │ │
│ │ • BATTERY SHARE: Reverse Wireless Qi (W)                │ │
│ │ • 3-MIC ARRAY: Steerable Beam (User / Away / Omni)      │ │
│ └─────────────────────────────────────────────────────────┘ │
│ ┌─ CONFIRMATION BARRIER & SSRF SHIELD ────────────────────┐ │
│ │ Destructive operations require explicit user confirmation│ │
│ │ or physical button hold. HTTP tools screen outbound targets│ │
│ │ against RFC 1918 subnets and cloud metadata (169.254...).│ │
│ └─────────────────────────────────────────────────────────┘ │
│ ┌─ AUDITORY EARCONS HARMONIC MATRIX ──────────────────────┐ │
│ │ • wake: C5 → A5 chirp (523Hz → 880Hz) · Light LRA       │ │
│ │ • ready: C6 ping (1046Hz)             · Tick LRA        │ │
│ │ • commit: A5 → E5 descending drop     · Medium LRA      │ │
│ │ • complete: C5-E5-G5-C6 major chord   · Success LRA     │ │
│ │ • error: Dissonant low alert          · Heavy Buzz      │ │
│ └─────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

- **Purpose:** Reference guide for physical hardware actuators, SSRF barrier, and PCM earcon audio frequencies.
- **Source Path:** `GuideModal.tsx:168–204`.
- **Status Clarification:** Hardware actuators are documented as **call-path-exists / device-unverified**.

---

### G03: Living Component Gallery

#### Proposed Layout Specimen (Sample)
```
┌─────────────────────────────────────────────────────────────┐
│ G03: LIVING COMPONENT GALLERY                               │
├─────────────────────────────────────────────────────────────┤
│ ┌─ SPECIMEN 1: AUTHENTIC DELTA ORB (UPGRADED SPECIFICATION)┐│
│ │                   .-'""'-.                              │ │
│ │                 .'  CORE  '.   (Pearl / Pink / Violet   │ │
│ │                /  [GLOSS]   \   Specular Highlights)    │ │
│ │                ;   SPHERE   ;                           │ │
│ │                 '.  MESH  .'   NO OUTER RINGS           │ │
│ │                   '-....-'                              │ │
│ │  State: [ Idle ]  [ Listening ]  [ Thinking ]  [ Speak ]│ │
│ │  Code: <SiriOrb size="192px" state="listening" />       │ │
│ └─────────────────────────────────────────────────────────┘ │
│ ┌─ SPECIMEN 2: STAT TILE & DUAL METERS ───────────────────┐ │
│ │  ┌──────────────────────┐  ┌──────────────────────────┐ │ │
│ │  │ BATTERY LEVEL    88% │  │ THERMAL HEADROOM    0.42 │ │ │
│ │  │ [████████████░░░░░░] │  │ [██████░░░░░░░░░░░░░░░░] │ │ │
│ │  │ Discharging · 3.84V  │  │ Status: Nominal · ADPF OK│ │ │
│ │  └──────────────────────┘  └──────────────────────────┘ │ │
│ └─────────────────────────────────────────────────────────┘ │
│ ┌─ SPECIMEN 3: GENERATIVE UI CARDS ───────────────────────┐ │
│ │  ┌─ MISSION TIMER ────────────────────────────────────┐ │ │
│ │  │  02:59   [ ⏸ PAUSE ]  [ ↺ RESET ]                  │ │ │
│ │  └────────────────────────────────────────────────────┘ │ │
│ └─────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

- **Purpose:** Interactive sandbox rendering live design system components with 1-tap copyable JSX code snippets.
- **Source Path:** `GuideModal.tsx:206–281`; `delta-mobile/src/design-system/catalog.tsx`.
- **Orb Reality:** Explicitly demonstrates the authentic glossy sphere without outer rings, replacing the legacy `Reactor` rings specimen.

#### G03.1: Gallery Component Detail & Token Drawer
```
┌─────────────────────────────────────────────────────────┐
│ G03.1: COMPONENT CONTRACT INSPECTOR                     │
├─────────────────────────────────────────────────────────┤
│ COMPONENT: StatTile · LAYER: primitive                  │
│ SUMMARY: High-density metric container with meter slot. │
│ INPUTS: label (string), value (string), tone (ok|warn)  │
│ OUTPUTS: layout (ReactNode)                             │
│ CAPABILITIES: hero tile, meter bar, status footnote     │
│ TOKENS: Colors.card, Colors.primary, Radius.md          │
│ [ CLOSE CONTRACT ]                                      │
└─────────────────────────────────────────────────────────┘
```
- Derived from `DesignSystemCatalog.tsx:29–32`, inspecting inputs, outputs, capabilities, and token bindings.

---

### G04: On-Device API Reference & SDK Hook Viewer (Proposed Reuse)

#### Proposed Layout Specimen (Sample)
```
┌─────────────────────────────────────────────────────────────┐
│ G04: SDK HOOKS REFERENCE (REAL EXPORTED HOOKS CONTRACT)     │
├─────────────────────────────────────────────────────────────┤
│ Filter Chips: [ All ] [ Silicon ] [ Sensors ] [ Radios ]    │
│               [ Pro Exclusives ] [ AI & Neural ]            │
├─────────────────────────────────────────────────────────────┤
│ ┌─ MODULE: useADPF ─────────────────────────────── [− HIDE]─┐ │
│ │ CATEGORY: SILICON · ACCENT: #E879F9 (MAGENTA)             │
│ │ "Android Dynamic Performance Framework thermal & power"   │
│ │ WHERE TO TRY IT: Silicon > Compute > Thermal Headroom     │
│ │ [↗ Jump to Screen: T01]                                   │
│ │                                                           │
│ │ SIGNATURE: useADPF() (inferred return type)                           │
│ │ RETURNS:                                                  │
│ │ • thermalHeadroom: number | null (0.0..1.0)               │
│ │ • thermalStatus: nominal/light/moderate/severe/critical │
│ │ • currentFps, targetFps: number | null                                   │
│ │ • source: 'hardware' | 'derived' | 'unavailable'          │
│ │                                                           │
│ │ ACTIONS:                                                  │
│ │ • reportWorkDuration(actualMs, targetMs?): budget result          │
│ │ • error: string | null; helper does not change FPS                   │
│ │ [📋 COPY USAGE EXAMPLE]                                   │
│ └─────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

- **Purpose:** On-device documentation viewer for verified PixelKit SDK hooks, migrated from unmounted `DocsScreen.tsx`.
- **Classification:** **Proposed Reuse** (unmounted legacy file brought into Knowledge Hub).
- **Strict Prohibition of Invented Hook Names:**
  - Previous draft contained non-existent names (`useWiFi6E`, `useCellular5G`, `useUWBTracker`, `useSubcarrierStatus`). These have been completely purged.
  - **Actual Exported SDK Hooks:**
    - Silicon: `useCPU`, `useGPU`, `useMemory`, `useADPF`, `usePerfetto`, `useDevice`, `useDisplay`, `useSecurity`, `usePlayIntegrity`, `useBatteryShare`, `useChargingIntelligence`, `useADPFHintSession`, `usePrivateSpace`, `useKeyAgreement`.
    - Sensors & Radios: `useSensors`, `useAltimeter`, `useMicrophoneArray`, `useThermometer`, `useHealthConnect`, `useHaptics`, `useCamera`, `useCameraExtensions`, `useBiometrics`, `useLocation`, `useNetwork`, `useAudio`, `useSpatialAudio`, `useVideo`, `useMediaLibrary`, `useCellular`, `useTorch`, `useBLE`, `useChannelSounding`, `useNFC`, `useRadios`, `useWifi7MLO`, `useWifiRTT`, `useSatelliteNTN`.
    - Pro Exclusives: `useHiLight`, `useUWB`.
    - Neural & AI: `useTPU`, `useGemini`, `useGeminiLive`, `useSpeechAI`, `useSpeech`, `useGeminiNano`, `useGenAITasks`, `useVisionAI`, `useNaturalLanguageAI`.

#### G04.1: Search Empty State & Deep-Link Error
```
┌─────────────────────────────────────────────────────────┐
│ G04.1: NO HOOKS MATCH SEARCH                            │
├─────────────────────────────────────────────────────────┤
│ 🔍 No exported SDK hooks match "{query}".               │
│ Suggestions: Check spelling or browse category chips.   │
│ [ CLEAR SEARCH QUERY ]                                  │
└─────────────────────────────────────────────────────────┘
```
- Rendered when user filter yields zero matching hook contracts.

---

### G05: Golden Rules & Architectural Directives (Proposed Reuse)

#### Proposed Layout Specimen (Sample)
```
┌─────────────────────────────────────────────────────────────┐
│ G05: GOLDEN RULES & AGENT DIRECTIVES                        │
├─────────────────────────────────────────────────────────────┤
│ ┌─ 5 GOLDEN ARCHITECTURAL RULES ──────────────────────────┐ │
│ │ 01 IMPORTS: Use documented root or sdk/mlkit entry point.│ │
│ │ 02 PROVENANCE, NOT GUESSES: Read source; null is "—".   │ │
│ │ 03 TACTILE FEEDBACK: Attach useHaptics to touchables.   │ │
│ │ 04 THERMAL BUDGET: Check useADPF(); 8.33ms at 120Hz.    │ │
│ │ 05 SECURE STORAGE: Use the verified platform adapter.      │ │
│ └─────────────────────────────────────────────────────────┘ │
│ ┌─ 7-POINT SYSTEM PROMPT DIRECTIVE ───────────────────────┐ │
│ │ You are building an application with PixelKit SDK...    │ │
│ │ [📋 COPY SYSTEM PROMPT TO CLIPBOARD]                    │ │
│ └─────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

- **Purpose:** Developer governance rules and copyable prompt directives for agentic code pair programming, migrated from `DocsScreen.tsx:46–63`.
- **Classification:** **Proposed Reuse** from unmounted source.

---

### G06: Interface Recovery & Error Boundary Screen

#### Proposed Layout Specimen (Sample)
```
┌─────────────────────────────────────────────────────────────┐
│ G06: DELTA INTERFACE RECOVERY                               │
├─────────────────────────────────────────────────────────────┤
│ ⚠️ DELTA INTERFACE RECOVERY                                 │
│ A React component render or lifecycle exception was         │
│ intercepted by DeltaErrorBoundary.                          │
├─────────────────────────────────────────────────────────────┤
│ ERROR MESSAGE:                                              │
│ TypeError: Cannot read property 'map' of undefined          │
│ Location: ConversationTurn.tsx:142                          │
├─────────────────────────────────────────────────────────────┤
│ STACK TRACE:                                                │
│   at ConversationTurn (src/components/ConversationTurn)     │
│   at renderWithHooks (react-dom.development.js:14985)       │
├─────────────────────────────────────────────────────────────┤
│ [ ↺ RETRY MOUNT ]          [ 📋 COPY ERROR REPORT ]         │
└─────────────────────────────────────────────────────────────┘
```

- **Purpose:** Full-screen crash recovery boundary for unhandled React render exceptions.
- **Source Path:** `delta-mobile/App.tsx:39–68` (`DeltaErrorBoundary`).
- **Implementation Scope & Architectural Limitations:**
  - **Covers React Render/Lifecycle ONLY:** `DeltaErrorBoundary` is a standard React component error boundary using `componentDidCatch` and `getDerivedStateFromError`.
  - **Does NOT Intercept:** Unhandled Promise rejections, asynchronous timer callbacks, native C++/Kotlin crashes in Expo modules, or bridge fatal errors.
  - **No Guaranteed Persistence:** It provides volatile state reset (`setState({ hasError: false, error: null })`). It does NOT guarantee automatic persistence or checkpoint restoration of active multi-turn transcripts across fatal crashes.
- **Actions:**
  - `RETRY MOUNT`: Clears error state and attempts re-rendering children.
  - `COPY ERROR REPORT`: Proposed addition; current boundary exposes Retry Mount. Redact secrets before copying errors.


## Navigation consistency update ? 2026-09-19

The user now prefers a leading mobile Back arrow throughout the flow. [The current navigation contract](../NAVIGATION.md) supersedes Close/X page exits and earlier back-to-Console shortcuts in this proposal. Details return to their feature index; roots return to the recorded caller. Other visual/layout proposals are not marked complete by this navigation increment.


### Submenu implementation checkpoint - 2026-09-19

See [the submenu review](../SUBMENU-REVIEW.md) for implemented corrections, actual browser coverage and remaining PNG differences. Source1.0.59/code115; proposal-only pages are not implicitly implemented by this checkpoint.
