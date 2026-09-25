# Delta Mobile UX Specification: Settings Subsystem

**Document Version:** 1.1.0-REVISED
**Subsystem:** Settings, Preferences & Security Credentials
**Domain Prefix:** `S` (Settings)
**Parent Plan:** [Fresh Start Mobile UI Review](../../FRESH_START.md)
**Consolidated Connections Reference:** [Connections Architecture Spec](connections.md) (Owned by MOM)
**Target Repository:** `delta-mobile` (`src/screens/SettingsScreen.tsx`, `src/components/SettingsModal.tsx`)

---

## 1. Executive Summary & Design System Architecture

### 1.1 Architecture Shift: Full-Screen Conversation Hub
In accordance with the approved direction, Delta Mobile transitions away from the persistent 4-tab bottom navigation bar (`Console`, `Agent`, `Telemetry`, `Settings`) to an **immersive full-screen Conversation Hub**.

```
┌─────────────────────────────────────────────────────────┐
│                      CONVERSATION HUB                   │
│  [≡ Menu / Drawer]       DELTA HUD          [● State]   │
│                                                         │
│  [Transcript / Streamed Dialogue Turns / Generative UI] │
│                                                         │
│  [+] [Spacious Multiline Composer Bar]       [🎤 / Orb] │
└────────────────────────────┬────────────────────────────┘
                             │  Tap Menu / Gear or Swipe
                             ▼
┌─────────────────────────────────────────────────────────┐
│                  SETTINGS HUB (S00)                     │
│  [← Back / X]       SYSTEM SETTINGS         [🔍 Search] │
│  Neutral Dark Charcoal (#090A0C / #121316 / #181A1F)   │
│                                                         │
│  S01 Assistant  S02 Keys   S03 MCP (Alias) S04 Voice    │
│  S05 Audio      S06 Cost   S07 Safety      S08 Relay    │
│  S09 TypeSafe   S10 About  S11 Confirmation Barrier     │
└─────────────────────────────────────────────────────────┘
```

- **Entry Routes:**
  - Top-left drawer menu navigation in Conversation Hub.
  - Quick action shortcut (gear icon) in Conversation Hub header.
  - Contextual link from error or capability-warning banners.
- **Exit & Back Navigation:**
  - Accessible top-left `←` / `✕` button (minimum 48×48dp hit target).
  - Edge swipe-to-dismiss gesture (swipe right to pop on Android/iOS).
  - Hardware Android Back returns directly to Hub without losing dirty uncommitted state.
- **Visual Surface Palette (Pearl / Pink / Magenta / Violet — Zero Blue / Cyan Controls):**
  - App Canvas / Backdrop: `#090A0C` (deep neutral obsidian black).
  - Section Panels / Drawer: `#121316` (neutral charcoal zinc).
  - Elevated Cards / Inputs: `#181A1F` (neutral slate tile).
  - Borders & Hairlines: `rgba(255, 255, 255, 0.08)` / `#24272E` (neutral specular edge).
  - Focus & Primary Accent: `#F472B6` (Delta pink) / `#E879F9` (magenta).
  - AI & Model Accent: `#A855F7` (violet).
  - Base Specular Highlight: `#F3F4F6` (pearl).
  - Semantic Status Tones: Emerald Success `#10B981`, Amber Warning `#F59E0B`, Crimson Danger `#EF4444`.
  - **Color Constraint:** Zero blue or cyan controls across all interactive toggles, buttons, and badges.

---

## 2. Page Inventory: Settings Subsystem

| ID | Page / Section Name | Source Location | Implementation Status | Primary Function |
| :--- | :--- | :--- | :--- | :--- |
| **S00** | Settings Hub Shell & Universal Search | `SettingsScreen.tsx`, `SettingsModal.tsx` | Partially Implemented (Mounted tab; search is local keyword match) | Hub navigation, search query filter, subtab routing |
| **S01** | Assistant identity | AssistantSection.tsx | Implemented, device acceptance pending | Name and instructions |
| **S01.1** | Models | ModelsSection.tsx | Preferences with runtime limitations disclosed | Voice/cloud/image preferences |
| **S02** | API Keys & Security Credentials | `KeysSection.tsx`, `JevKeyControls.tsx`, `jevService.ts` | Gemini generic-JSON legacy path; Jev credential controls in Settings; device acceptance pending | Provider credentials and explicit probes |
| **S03** | Model Context Protocol (MCP) Feeds (Alias) | `SettingsScreen.tsx:84`, `McpFeedsPanel.tsx` | Implemented (Local hosting active; external feeds defer to MOM) | Alias route linking to canonical `connections.md` |
| **S04** | Voice Activity Detection (VAD) & Wake | `SettingsScreen.tsx:85`, `WakeEnroll.tsx` | **Prototype Formula / Flawed** (Sample-count formula, random take metrics) | VAD threshold, silence timeout, wake enrollment UI |
| **S04.1**| Unavailable Wake Enrollment State | `WakeEnroll.tsx` | Proposed (Defines explicit failure/missing mic state) | Fallback UI when mic permissions or hardware missing |
| **S05** | Audio Subsystem, Earcons & 3-Mic Beam | `SettingsScreen.tsx:86`, `earcons.ts` | Partially Implemented (PCM WAV data URIs, mic beam call-path-exists) | Earcon sound toggles, volumes, mic beam steering |
| **S06** | Cost Control, Token Ledger & Currency | `SettingsScreen.tsx:87`, `usageStore.ts` | Partially Implemented (**Currency selector toast-only; USD fixed**) | Spending caps, token ledger, USD-fixed budget display |
| **S07** | Safety Gate, SSRF Shield & Gating | `SettingsScreen.tsx:88`, `confirmation.ts` | Implemented (Confirmation gate & RFC 1918 filter active) | Tool sensitivity gating, destructive tool whitelist, SSRF shield |
| **S08** | External Relay & WhatsApp Bridge | `SettingsScreen.tsx:89`, `WhatsAppPanel.tsx` | **Simulated / Fabricated** (Mock QR and mock pairing state) | External webhook relay, bridge status, pending integration |
| **S09** | TypeSafe AI / Jev Service | `JevAssistantSection.tsx`, `jevService.ts` | Runtime torch classification and Settings destination implemented; device acceptance pending | Optional intent toggle and cloud disclosure; key in S02 |
| **S10** | About, Hardware Diagnostics & Reset | `SettingsScreen.tsx:90` | Partially Implemented (**Hardcoded device strings; doctor probe**) | Static specs, developer overlay toggle, doctor self-test, reset |
| **S11** | Confirmation Barrier Dialog Overlay | `confirmation.ts`, `ConfirmBar.tsx` | Implemented (Verbal & physical press barriers) | Modal gate intercepting destructive wipes & mutations |

---

## 3. Detailed Page Specifications

### S00: Settings index and search

Implemented: one leading Back arrow, index-only search, and destination rows. Assistant and Models are separate destinations. Selecting a row opens a focused detail page without repeated search or horizontal tabs. Back returns to this index, then the recorded caller. Embedded Connections owns its own header and scroll view. Browser verification is separate from device acceptance.

### S01: Assistant identity

Board09 frame2 supplies the visual reference: Delta orb, labeled Name and Instructions fields, and explicit save/discard handling. Source: features/settings/sections/AssistantSection.tsx; SettingsScreen owns the draft and persistence result. Model choices and the inert voice-tone controls are removed from this page. Failed saves retain the draft.

### S01.1: Models

Board09 frame3 establishes a separate destination, but its proposed local/cloud execution cards are not the current runtime contract. Current UI groups voice, cloud and image preferences with explicit availability/not-applied explanations. Source: settings/models/modelCatalog.ts (data), settings/components/ModelChoiceGroup.tsx (reusable presentation), settings/sections/ModelsSection.tsx (composition).

Only the Live voice model preference is passed to a subsequent cloud handshake. It does not change an active session or select the on-device engine. The legacy local-tensor-nano option must not act as a cloud model selection. Unknown saved IDs remain visible; no provider availability is inferred from catalog membership. Cloud reasoning and image choices are currently stored-only preferences, not runtime model selectors. Opening the page does not send requests. Identity drafts retain their separate explicit-save behavior.

Native selection and persistence acceptance remain pending. These implementation limits supersede model capability claims in older specimens and the illustrative board.

### S02: API Keys & Security Credentials

#### Proposed Layout Specimen (Sample)
```
┌─────────────────────────────────────────────────────────┐
│ S02: API KEYS & SECURITY CREDENTIALS                    │
├─────────────────────────────────────────────────────────┤
│ GEMINI API KEY (CLOUD MODELS & LIVE WEBSOCKET)          │
│ [ •••••••••••••••••••••••••••••••••••• ] [👁]           │
│ [ PROBE / TEST KEY ]    [ SAVE KEY ]                    │
│ Status: [✓ Gemini API key authenticated successfully.]  │
├─────────────────────────────────────────────────────────┤
│ PROPOSED ADDITIONAL PROVIDERS (NOT CURRENT CONTROLS)    │
│ Tavily Search API Key: [Pending Integration / Roadmap]  │
│ Replicate Diffusion Key: [Pending Integration / Roadmap]│
└─────────────────────────────────────────────────────────┘
```

- **Purpose:** Edit and probe provider credentials. The Jev key uses the SecureStore adapter where available; the legacy Gemini key currently persists through SettingsStore generic JSON storage. Neither UI placement nor a masked field proves hardware-backed protection.
- **Source Path:** `SettingsScreen.tsx:83` (lines 521–640).
- **Implementation Status:** Partially Implemented.
  - **Live Probe Truth:** `handleProbeKey` executes a real live HTTP GET request to `https://generativelanguage.googleapis.com/v1beta/models?key=${key}`. It is an actual network check, not a mock.
  - **Provider Reality:** Gemini and the Jev key are currently edited here; Jev controls live in `JevKeyControls.tsx`. Tavily and Replicate are NOT current controls and remain proposed.
- **Probe States:**
  - *Idle:* Initial unprobed state.
  - *Probing:* Button shows `"PROBING..."` with disabled state.
  - *Valid:* Green banner `"Gemini API key authenticated successfully."`
  - *Invalid:* Red banner `"Authentication failed. Check your API key."`

---

### S03: Model Context Protocol (MCP) Feeds (Alias Route)

- **Consolidated Architecture Ownership:** This section is an alias route. Canonical MCP Host, External Servers, and SSE Feeds architecture is owned by MOM in `docs/mobile-ux-review/specs/connections.md`.
- **Source Path:** `SettingsScreen.tsx:84`; `src/components/McpFeedsPanel.tsx`.
- **Local Route Function:** Displays local port 8080 server status and tools count, with deep link to `connections.md` for server management.

---

### S04: Voice Activity Detection (VAD) & Wake Word

#### Proposed Layout Specimen (Sample)
```
┌─────────────────────────────────────────────────────────┐
│ S04: VOICE ACTIVITY DETECTION & WAKE WORD               │
├─────────────────────────────────────────────────────────┤
│ VAD SPEECH DETECTION THRESHOLD                          │
│ Sensitivity: [══════════════════●════════] -26 dB       │
├─────────────────────────────────────────────────────────┤
│ SILENCE COMMIT TIMEOUT                                  │
│ [ 800ms ]  [ 1200ms ]  [ 1400ms (Default) ]  [ 2000ms ] │
├─────────────────────────────────────────────────────────┤
│ FOLLOW-UP TIMEOUT                                       │
│ [ 5s ]  [ 8s ]  [ 12s ]  [ 20s ]                        │
├─────────────────────────────────────────────────────────┤
│ WAKE PHRASE ENROLLMENT (PROTOTYPE IMPLEMENTATION)       │
│ Status: Prototype sample formula (0.82 + N*0.035)       │
│ [ RECORD TAKE (1/3) ]                                   │
└─────────────────────────────────────────────────────────┘
```

- **Purpose:** Configure hands-free silence commit timeouts and follow-up listening windows.
- **Source Path:** `SettingsScreen.tsx:85`; `src/components/WakeEnroll.tsx`.
- **Implementation Status:** **Prototype Formula / Flawed**.
  - **WakeEnroll Audit:** In `WakeEnroll.tsx:51`, acoustic cross-sample agreement is calculated via a simple formula `samples.length >= 2 ? Math.min(0.96, 0.82 + samples.length * 0.035) : 0` over random numbers for duration (`1.1 + Math.random() * 0.4`), peak (`-14 - Math.random() * 8`), and random envelope bars. There is NO C++ FFT engine and NO acoustic modeling.
  - **Redesign Requirement:** Explicitly disclaim that custom wake phrase training requires native audio DSP integration.

#### S04.1: Unavailable Wake Enrollment State
```
┌─────────────────────────────────────────────────────────┐
│ S04.1: ENROLLMENT UNAVAILABLE                           │
├─────────────────────────────────────────────────────────┤
│ ⚠️ AUDIO SUBSYSTEM UNAVAILABLE                          │
│ Microphone permission not granted or native audio engine │
│ is uninitialized. Custom wake enrollment is disabled.   │
│ [ GRANT PERMISSION ]      [ DISMISS ]                   │
└─────────────────────────────────────────────────────────┘
```
- Rendered when `useMicrophoneArray` reports `source: 'unavailable'` or record permissions are rejected.

---

### S05: Audio Subsystem, Earcons & 3-Mic Beam

#### Proposed Layout Specimen (Sample)
```
┌─────────────────────────────────────────────────────────┐
│ S05: AUDIO SUBSYSTEM & ACOUSTIC HARDWARE                │
├─────────────────────────────────────────────────────────┤
│ AUDITORY EARCONS & CHIMES                      [ ON  ]  │
│ Low-latency harmonic earcons for wake, commit, errors   │
├─────────────────────────────────────────────────────────┤
│ 3-MIC BEAMFORMING DIRECTION                             │
│ (•) USER (Front beam, active noise suppression)         │
│ ( ) AWAY (Rear beam, room acoustic capture)             │
│ ( ) OMNI (360-degree ambient pickup)                    │
│ Status: Call-path-exists / device-unverified            │
├─────────────────────────────────────────────────────────┤
│ AUDIO BENCHMARK & HARMONIC TONE TEST                    │
│ [ RUN PURE-SINE TEST (440Hz → 880Hz → 1760Hz) ]         │
└─────────────────────────────────────────────────────────┘
```

- **Purpose:** Manage auditory feedback chimes and steerable beamforming microphone array.
- **Source Path:** `SettingsScreen.tsx:86`; `src/core/earcons.ts`.
- **Implementation Status:** Partially Implemented. Earcons synthesize PCM WAV Data URIs. Steerable beamforming call-path exists in `@pixelkit-labs/sdk` (`useMicrophoneArray`), but hardware verification on Pixel 11 Pro is unverified in this session.

---

### S06: Cost Control, Token Ledger & Currency

#### Proposed Layout Specimen (Sample)
```
┌─────────────────────────────────────────────────────────┐
│ S06: USAGE LEDGER & PRICING CEILINGS                    │
├─────────────────────────────────────────────────────────┤
│ DAILY SPENDING CEILING                                  │
│ [ $1.00 ]  [ $2.00 ]  [ $5.00 (Default) ]  [ $10.00 ]   │
├─────────────────────────────────────────────────────────┤
│ TOKEN BUDGET CEILING                                    │
│ [ 100k ]  [ 250k ]  [ 500k ]  [ 1M ]                    │
├─────────────────────────────────────────────────────────┤
│ DISPLAY CURRENCY (SOURCE REALITY: TOAST-ONLY / USD FIXED)│
│ [ USD (Active) ]  [ CAD ]  [ EUR ]  [ GBP ]  [ AUD ]    │
│ ⚠️ Note: Currency switcher triggers toast notification  │
│ only. All ledger accounting is fixed in USD.            │
└─────────────────────────────────────────────────────────┘
```

- **Purpose:** Display token consumption counters and enforce client-side spending limits.
- **Source Path:** `SettingsScreen.tsx:87` (lines 808–860); `src/core/usageStore.ts`.
- **Implementation Status:** Partially Implemented.
  - **Source Reality Audit:** `SettingsScreen.tsx:822-828` literally does:
    `onPress={() => { notifySave('Currency set to ' + cur); }}`
    and hardcodes `cur === 'USD'` as the active style. There is NO currency state persistence, NO exchange rate calculation, and NO currency symbol switching. All token calculations in `usageStore.ts` are strictly in USD.
  - **Redesign Mandate:** Clearly present USD as the sole active accounting currency, marking non-USD selections as pending FX integration.

---

### S07: Safety Gate, SSRF Shield & Gating

#### Proposed Layout Specimen (Sample)
```
┌─────────────────────────────────────────────────────────┐
│ S07: SAFETY GATE & SSRF SHIELD                          │
├─────────────────────────────────────────────────────────┤
│ CONFIRMATION GATE LEVEL                                 │
│ ( ) LOW: Warn on irreversible actions only              │
│ (•) MEDIUM: Confirm external mutations & destructive    │
│ ( ) HIGH: Confirm every external tool call              │
├─────────────────────────────────────────────────────────┤
│ SSRF LINK-LOCAL & PRIVATE IP SHIELD            [ ON  ]  │
│ Blocks 127.0.0.1, 169.254.169.254, RFC 1918 subnets     │
├─────────────────────────────────────────────────────────┤
│ DESTRUCTIVE TOOL WHITELIST                              │
│ Require physical confirm button for:                    │
│ [✓] clearSessionHistory    [✓] purgeLogBuffer           │
│ [✓] deleteApiKey           [✓] factoryResetSettings     │
└─────────────────────────────────────────────────────────┘
```

- **Purpose:** Safeguard against prompt injection, unconfirmed destructive actions, and SSRF attacks.
- **Source Path:** `SettingsScreen.tsx:88`; `src/core/confirmation.ts`.
- **Implementation Status:** Implemented. Safety barrier correctly intercepts tool calls.

---

### S08: External Relay & WhatsApp Bridge

- **Consolidated Architecture Ownership:** External WhatsApp relay, QR pairing lifecycle, and webhook configuration are owned by MOM in `docs/mobile-ux-review/specs/connections.md`.
- **Source Path:** `SettingsScreen.tsx:89`; `src/components/WhatsAppPanel.tsx`.
- **Implementation Reality:** WhatsApp QR generation and pairing in `WhatsAppPanel.tsx` is completely simulated/mocked with timer loops. Marked as `Unavailable / Simulated in Source`.

---

### S09: TypeSafe AI / Jev Service

- **Purpose:** Optional cloud assistance for ambiguous flashlight intent, not a general chat or tool provider.
- **Canonical route:** Settings S00 → S09. This page owns the opt-in switch and a plain disclosure that the ambiguous request text is sent to TypeSafe AI when enabled. Settings S02 owns the masked Jev credential editor and explicit Save/Test/Remove actions. Connections N10 is a superseded board concept, not a second live route.
- **Source status:** The runtime path exists in `src/core/deltaAgent.ts`, `src/core/torchIntent.ts` and `src/core/jevService.ts`; `jevIntentEnabled` is off by default in `src/core/settingsStore.ts`. SettingsScreen now mounts `JevAssistantSection.tsx` as S09, and KeysSection mounts `JevKeyControls.tsx` as S02. ConnectionsHome no longer offers a Jev row. This source integration is not device verified.
- **State and privacy:** Clear flashlight commands stay local. Only ambiguous requests are eligible for the Jev call after opt-in; service failure returns local clarification. Jev does not execute the chosen tool. The credential remains in the SecureStore adapter when available and must not enter SettingsStore JSON. Gemini's key still uses generic JSON storage. A key probe is an explicit network action and sends no conversation content.
- **Acceptance:** Save, toggle, probe and removal must report actual persistence/network outcomes. Unsupported secure storage, offline and provider errors must not claim success. Android Back and keyboard must work on both Settings destinations; real provider/device checks remain pending.

---

### S10: About, Hardware Diagnostics & Reset

#### Proposed Layout Specimen (Sample)
```
┌─────────────────────────────────────────────────────────┐
│ S10: ABOUT DELTA MOBILE & HARDWARE DIAGNOSTICS          │
├─────────────────────────────────────────────────────────┤
│ HARDWARE TARGET & BUILD SPECIFICATIONS                  │
│ Delta Mobile: v1.0.30 (Build 86)  [Hardcoded String]    │
│ Hardware Target: Google Pixel 11 Pro [Hardcoded String] │
│ Silicon: Google Tensor G6 (1+3+4 Cores) [Hardcoded]     │
│ On-Device TPU: AICore Gemini Nano [Hardcoded String]    │
│ OS Version: Android 17 (API 37) [Hardcoded String]      │
│ PixelKit SDK: v1.6.17 [Hardcoded String]                │
├─────────────────────────────────────────────────────────┤
│ AUTONOMOUS HARDWARE DOCTOR                              │
│ [ RUN HARDWARE DOCTOR ]                                 │
│ Doctor Result: [Not run yet / Unknown]                  │
├─────────────────────────────────────────────────────────┤
│ PIXELKIT DEVELOPER OVERLAY                              │
│ Floating DevTools HUD                         [ ON  ]   │
│ Overlays real-time FPS, CPU, ADPF thermal, memory       │
├─────────────────────────────────────────────────────────┤
│ RESET DELTA SETTINGS                                         │
│ Restores instructions, voice, preferences to defaults.  │
│ [ RESET SETTINGS TO FACTORY DEFAULTS (DANGER) ]         │
└─────────────────────────────────────────────────────────┘
```

- **Purpose:** Inspect device specifications, run doctor self-test diagnostics, toggle developer HUD, and perform settings resets.
- **Source Path:** `SettingsScreen.tsx:90` (lines 910–990).
- **Implementation Status:** Partially Implemented.
  - **Hardcoded Reality:** Specifications rows are static strings in `SettingsScreen.tsx:921-926`. They are NOT dynamically queried hardware facts.
  - **No Fact-Based / 14-of-14 Claims:** Doctor result starts as `null` (`Not run yet`). Claims of "14 of 14 nominal" are prohibited until the test actually runs.
- **Controls & Sections:**
  1. Specifications: Static readout rows.
  2. Doctor Self-Test: `handleRunDoctor` calls `defaultToolRegistry.execute('doctor', {}, {})`; a dedicated inline failure box is proposed.
  3. Developer Overlay Toggle: `devToolsEnabled` switch toggles floating HUD.
  4. Settings Reset: Triggers `handleResetSettings` and `SettingsStore.reset()` with explicit confirmation. Scope is settings only, not all app data or a phone wipe.

#### S10.1: Doctor Failure & Settings Reset Failure States
- **Doctor Failure State:**
  ```
  ┌─ DOCTOR SELF-TEST FAILED ───────────────────────────────┐
  │ ❌ DIAGNOSTIC TIMEOUT: AICore daemon failed to report   │
  │ status within 5000ms. [ RETRY DOCTOR ]                  │
  └─────────────────────────────────────────────────────────┘
  ```
- **Settings Reset Failure State:**
  ```
  ┌─ RESET FAILED ──────────────────────────────────────────┐
  │ ❌ Storage error while resetting AsyncStorage keys.     │
  │ SecureStore keys preserved. [ RETRY ]                   │
  └─────────────────────────────────────────────────────────┘
  ```

---

### S10.2: Floating Unsaved Configuration Bar

#### Proposed Layout Specimen (Sample)
```
┌─────────────────────────────────────────────────────────┐
│ ⚠️ UNSAVED CONFIGURATION                                 │
│ [ DISCARD ]                    [ SAVE CHANGES ]         │
└─────────────────────────────────────────────────────────┘
```
- **Source Path:** `SettingsScreen.tsx:991-1004`.
- **Behavior:** Renders at bottom of screen whenever `isDirty` is true (e.g. `nameInput` or `instructionsInput` modified).
- **Actions:**
  - `DISCARD`: Reverts local input states to store values, resets `isDirty` to false, triggers `haptics.light()`.
  - `SAVE CHANGES`: Commits inputs to `SettingsStore.update()`, notifies user, triggers `haptics.success()`.

---

### S11: Confirmation Barrier Dialog Overlay

#### Proposed Layout Specimen (Sample)
```
┌─────────────────────────────────────────────────────────┐
│ S11: CONFIRMATION BARRIER OVERLAY                       │
├─────────────────────────────────────────────────────────┤
│ ⚠️ CONFIRM DESTRUCTIVE OPERATION                        │
│ Operation: Settings Reset Settings                       │
│ Impact: Wipes all custom instructions and preferences   │
│                                                         │
│ Verbal Agreement: Say "I agree to reset"                │
│ Physical Button: Hold button for 2 seconds              │
│                                                         │
│ [ CANCEL ]              [ HOLD TO CONFIRM (2.0s) ]      │
└─────────────────────────────────────────────────────────┘
```

- **Purpose:** Final safety gate protecting users from unintended destructive mutations.
- **Source Path:** `src/core/confirmation.ts`; `src/components/ConfirmBar.tsx`.
- **Implementation Status:** Implemented. Modal barrier intercepts destructive actions with explicit spoken consent or an explicit UI confirmation.

### S10.3: Developer overlay

Existing `devToolsEnabled` controls the developer HUD. The new route presentation is proposed. Keep diagnostics optional, preserve the active conversation, provide an accessible close control, and never expose credentials in copied logs.


## Navigation consistency update ? 2026-09-19

The user now prefers a leading mobile Back arrow throughout the flow. [The current navigation contract](../NAVIGATION.md) supersedes Close/X page exits and earlier back-to-Console shortcuts in this proposal. Details return to their feature index; roots return to the recorded caller. Other visual/layout proposals are not marked complete by this navigation increment.


### Submenu implementation checkpoint - 2026-09-19

See [the submenu review](../SUBMENU-REVIEW.md) for implemented corrections, actual browser coverage and remaining PNG differences. Source1.0.59/code115; proposal-only pages are not implicitly implemented by this checkpoint.

### S01.1 implementation evidence and catalog boundaries ? 1.0.60

Cloud/image groups show saved values only; they are not active model selectors. Voice options are limited to reviewed documented identifiers; existing unlisted saved identifiers are preserved with an explicit warning. Opening Models makes no provider request. Persisting a preference does not prove credential access or availability.

The [Google3.1 Live model page](https://ai.google.dev/gemini-api/docs/models/gemini-3.1-flash-live-preview) documents that preview identifier. The [deprecation table](https://ai.google.dev/gemini-api/docs/deprecations) documents the2.5 native-audio identifier and the retired2.0 Live model. [Google3.8 Live](https://ai.google.dev/gemini-api/docs/models/gemini-3.8-live) documents a different stable ID from the old bundled3.8 preview string. Protocol migration and defaults are deliberately separate from this UI increment. Board09 frame3 remains a proposed engine-selection flow; current implementation limitations are explicit.

### Nested controls checkpoint - 1.0.61
Voice, Audio and Connections details use readable14px minimum descriptions in the touched sections. Voice selectors provide48dp targets and selected radio semantics. Wake phrase configuration reports failed persistence and keeps the entered value, with no pre-save success cue. Enrollment remains an embedded section; route decomposition and dirty-back protection remain open. See the phone Voice capture and verification limits in IMPLEMENTATION.md.

### Narrow-width spacing checkpoint - 1.0.63

Settings detail headers use the shared leading-title layout; the Guide control stays on the trailing edge. Voice timeout choices form two columns with 48dp minimum targets at narrow widths. Models uses a single page title above its option groups. No model/provider preference semantics changed.
