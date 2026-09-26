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
│  S09 Laya       S10 About  S11 Confirmation Barrier     │
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
| **S01.1** | Models & Local decisions | `ModelsSection.tsx`, `layaService.ts` | Implemented & Verified (Laya local decisions + cloud/voice models) | Laya intent assistance toggle, voice/cloud/image preferences |
| **S02** | API Keys & Security Credentials | `KeysSection.tsx` | Gemini generic-JSON legacy path; retired JEV editor removed; device acceptance pending | Provider credentials and explicit probes |
| **S03** | Model Context Protocol (MCP) Feeds (Alias) | `SettingsScreen.tsx:84`, `McpFeedsPanel.tsx` | Implemented (Local hosting active; external feeds defer to MOM) | Alias route linking to canonical `connections.md` |
| **S04** | Voice output, VAD & wake | `VoiceSection.tsx`, `WakeEnroll.tsx`, `features/wake/` | Implemented in source; Pixel enrollment and wake-to-recognizer handoff observed, repeat-trigger reliability failed | Installed TTS service selection, silence/follow-up timing, local acoustic enrollment and active-recognizer text matching |
| **S04.1**| Unavailable Wake Enrollment State | `WakeEnroll.tsx` | Implemented in source; failure branches not device-verified | Explains missing mic/model availability and offers a recheck |
| **S05** | Audio Subsystem, Earcons & 3-Mic Beam | `SettingsScreen.tsx:86`, `earcons.ts` | Partially Implemented (PCM WAV data URIs, mic beam call-path-exists) | Earcon sound toggles, volumes, mic beam steering |
| **S06** | Cost Control, Token Ledger & Currency | `SettingsScreen.tsx:87`, `usageStore.ts` | Partially Implemented (**Currency selector toast-only; USD fixed**) | Spending caps, token ledger, USD-fixed budget display |
| **S07** | Safety Gate, SSRF Shield & Gating | `SettingsScreen.tsx:88`, `confirmation.ts` | Implemented (Confirmation gate & RFC 1918 filter active) | Tool sensitivity gating, destructive tool whitelist, SSRF shield |
| **S08** | External Relay & WhatsApp Bridge | `SettingsScreen.tsx:89`, `WhatsAppPanel.tsx` | **Simulated / Fabricated** (Mock QR and mock pairing state) | External webhook relay, bridge status, pending integration |
| **S09** | Local decisions / Laya (Merged) | Consolidated into `ModelsSection.tsx` | Merged into S01.1 | Subtab retired; controls moved to Models destination |
| **S10** | About, Hardware Diagnostics & Reset | `SettingsScreen.tsx:90` | Partially Implemented (**Hardcoded device strings; doctor probe**) | Static specs, developer overlay toggle, doctor self-test, reset |
| **S11** | Confirmation Barrier Dialog Overlay | `confirmation.ts`, `ConfirmBar.tsx` | Implemented (Verbal & physical press barriers) | Modal gate intercepting destructive wipes & mutations |

---

## 3. Detailed Page Specifications

### S00: Settings index and search

Implemented: one leading Back arrow, index-only search, and destination rows. Assistant and Models are separate destinations. Selecting a row opens a focused detail page without repeated search or horizontal tabs. Back returns to this index, then the recorded caller. Embedded Connections owns its own header and scroll view. Browser verification is separate from device acceptance.

### S01: Assistant identity & Built-in System Prompt

#### Verified Layout
```
┌─────────────────────────────────────────────────────────┐
│ S01: ASSISTANT IDENTITY & DIRECTIVES                    │
├─────────────────────────────────────────────────────────┤
│                     [ DELTA ORB ]                       │
│                         Delta                           │
│                 Personal AI Assistant                   │
│        PLATFORM Google Pixel 11 Pro · Tensor G6         │
├─────────────────────────────────────────────────────────┤
│ ASSISTANT IDENTITY                                      │
│ Name: [ Delta                                    ]      │
├─────────────────────────────────────────────────────────┤
│ CUSTOM DIRECTIVES                                       │
│ [ Concise & Direct ] [ Hardware & Silicon ] [ Warm... ] │
│ Behavioral instructions:                                │
│ [ e.g. Always speak concisely in 1-2 plain sentences.   │
│   Focus on actionable answers without headers...   ]    │
│                                              0/1000     │
├─────────────────────────────────────────────────────────┤
│ BASE SYSTEM DIRECTIVES (BUILT-IN)            [ Inspect ]│
│ Resolved on-device prompt for Pixel 11 Pro Tensor G6.   │
│ [ COPY BASE DIRECTIVES ]                                │
└─────────────────────────────────────────────────────────┘
```

- **Purpose:** Configure assistant identity name, customize behavioral directives, and inspect Delta's built-in on-device system persona.
- **Source Path:** `SettingsScreen.tsx:55`; `src/features/settings/sections/AssistantSection.tsx`; `src/core/persona.ts`.
- **Implementation Status:** Implemented & Verified.
- **Controls & Behavior:**
  1. *Hero Orb & Platform Badge:* Displays the authentic `DeltaOrb` and Pixel 11 Pro hardware platform identifier.
  2. *Assistant Name:* Configures how Delta refers to herself and addresses the user (up to 32 characters).
  3. *Inspiration Presets:* Quick chips (`Concise & Direct`, `Hardware & Silicon`, `Warm Companion`) that populate starting guidance.
  4. *Custom Directives Editor:* Multi-line text area with character counter (`0/1000`) for custom behavioral instructions appended to on-device context.
  5. *Base System Directives Inspector:* Expandable code viewer exposing the built-in system prompt resolved from `resolveDeltaPersona()` on Tensor G6, with clipboard copy support.
  6. *Keyboard & Screen Height Handling:* Designed with `flexGrow: 1` scroll containers and keyboard persist handling.

---

### S01.1: Models & Local decisions (Laya)

#### Verified Layout
```
┌─────────────────────────────────────────────────────────┐
│ S01.1: MODELS & LOCAL DECISIONS                         │
├─────────────────────────────────────────────────────────┤
│ LAYA · LOCAL DECISIONS                                  │
│ Interpret intent on this phone. Laya currently helps    │
│ clarify flashlight requests. Clear commands continue    │
│ through Delta’s tool registry.                          │
│                                                         │
│ Requests stay on-device. No API key is needed.          │
│ Installing the model downloads about 613 MB from        │
│ Hugging Face; inference works offline afterward.        │
│                                                         │
│ [ MODEL Laya (613 MB) ]  [ STATUS Installed ]           │
│ [ STATE Active / Off ]                                  │
│                                                         │
│ [ Turn on Laya assistance / Turn off Laya assistance ]  │
├─────────────────────────────────────────────────────────┤
│ CLOUD & VOICE MODELS                                    │
│ Voice model selection (Gemini Live Preview)             │
│ Cloud reasoning model (Saved preference)                │
│ Image model (Saved preference)                          │
└─────────────────────────────────────────────────────────┘
```

- **Purpose:** Configure local decision modeling (Laya ONNX int8) and cloud/voice provider preferences.
- **Source Path:** `SettingsScreen.tsx:60`; `src/features/settings/sections/ModelsSection.tsx`; `src/core/layaService.ts`.
- **Implementation Status:** Implemented & Verified.
- **Controls & Behavior:**
  1. *Laya Local Decisions:* Discloses on-device privacy and flashlight intent clarification scope. Model is treated as installed (613 MB ONNX int8).
  2. *Assistance Toggle:* Toggles `layaIntentEnabled` in `SettingsStore`. Toggling immediately updates the active/off badge and button title without external network calls.
  3. *Cloud & Voice Preferences:* Voice model preference is passed to subsequent cloud voice sessions. Reasoning and image models remain stored preferences.

---

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

- **Purpose:** Edit and probe cloud provider credentials. The Gemini key remains in legacy SettingsStore JSON storage. Laya needs no key; the retired JEV key is removed through S09 without reading it. UI masking does not establish hardware-backed protection.
- **Source Path:** `SettingsScreen.tsx:83` (lines 521–640).
- **Implementation Status:** Partially Implemented.
  - **Live Probe Truth:** `handleProbeKey` executes a real live HTTP GET request to `https://generativelanguage.googleapis.com/v1beta/models?key=${key}`. It is an actual network check, not a mock.
  - **Provider Reality:** Gemini is edited here. JEV controls are retired; Laya model setup lives in S09. Tavily and Replicate remain proposed.
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

### S04: Voice Output, Activity Detection (VAD) & Wake Word

#### Historical Layout Specimen (Sample)
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

- **Purpose:** Select a local speech output, configure VAD timing, and enroll an optional foreground acoustic wake phrase.
- **Current source:** `src/features/settings/sections/VoiceSection.tsx`, `src/components/WakeEnroll.tsx`, `src/features/wake/services/openWakeWord.ts`, `src/features/wake/services/wakeEnrollmentStore.ts`, and `modules/delta-openwakeword/` in Delta Mobile.
- **Voice output:** The default phone voice remains available. The Kokoro choice is enabled only when Android reports the separate `com.k2fsa.sherpa.onnx.tts.engine` service installed. Selection persists in `SettingsStore.speechEngine`; Test selected voice awaits playback and asks the user to confirm the sound. Delta's reply and replay speech use the selected service through PixelKit 1.6.38. Android can still silently fall back if its active engine cannot be inspected, so a completed callback alone does not prove the audible engine.
- **Acoustic enrollment:** When microphone permission and the local OpenWakeWord feature models are available, the user records one 4.5-second quiet-room sample followed by three 4.5-second phrase takes. The native module captures 16 kHz mono PCM and derives ONNX embeddings. `WakeEnrollmentStore` persists the calibrated template in private app storage, not the raw audio. Acoustic sensitivity applies to a new enrollment; the separate recognized-text threshold applies only to text from an already active speech recognizer. Monitoring is restricted to an open, foreground, idle Delta; it releases the microphone before speech recognition starts. Background wake is unavailable.
- **Verification:** Delta 1.0.67/code123 with PixelKit 1.6.38 on the Pixel showed Kokoro installed/selected, Test selected voice completed with `Playback finished`, and Android bound the Sherpa-ONNX TTS service. Audible voice identity awaits user confirmation. The same build completed one quiet-room take plus three phrase takes and reported a saved acoustic enrollment (background score 0.027418, match score 0.117039, calibrated threshold 0.090153). Saying “Hey Delta” on Console stopped OpenWakeWord monitoring and started Android speech recognition. Monitoring then rearmed and retriggered repeatedly at roughly 10-second intervals; the live wake flow **fails reliability acceptance**. Those calibration scores are observed values for this enrollment, not an accuracy benchmark. False-positive rate, stable one-shot turn completion and power cost remain unverified. ARTEMIS quota/rate limits prevented its UI run; this checkpoint used direct ADB UI/log inspection.
- **Historical frame:** Board 09 frame 5 and the sample above predate the real audio implementation. Its prototype formula/random metrics and slider are not current UI or a test oracle. Keep the PNG as provenance until a revised visual board is reviewed; the implementation status here governs current behavior.

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
- Current `WakeEnroll` renders an unavailable notice when its native availability result is not `hardware`, with the reported permission/model error and a Check microphone and models action. If permission is missing, the action requests recording permission and checks availability again. The older mock's Grant permission/Dismiss pair and `useMicrophoneArray` condition are design history, not the current implementation. Missing local ONNX models also prevent enrollment; transcript matching remains available only during active recognition. The failure branch has not been checked on device.

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

### S09: Local decisions / Laya (Consolidated into S01.1)

- **Status:** Consolidated into **S01.1 (Models & Local decisions)**.
- **Rationale:** Local decision controls belong under the unified Models destination rather than an isolated subtab. The standalone `LayaAssistantSection.tsx` and its non-executing preview panel have been retired.
- **Source Path:** See `ModelsSection.tsx`.

---

### S10: About & Operational Guide

#### Verified Layout
```
┌─────────────────────────────────────────────────────────┐
│ S10: ABOUT DELTA MOBILE & OPERATIONAL GUIDE             │
├─────────────────────────────────────────────────────────┤
│                     [ DELTA ORB ]                       │
│                         Delta                           │
│                        v1.0.72                          │
│   On-device personal AI assistant built for Google      │
│                    Pixel hardware.                      │
│                                                         │
│      TARGET Google Pixel 11 Pro · Tensor G6             │
├─────────────────────────────────────────────────────────┤
│ [ 📖 OPERATIONAL GUIDE & COMPONENTS ]                   │
└─────────────────────────────────────────────────────────┘
```

- **Purpose:** Present application identity, dynamic build version, hardware target badge, and provide direct navigation to the interactive operational guide and component reference.
- **Source Path:** `SettingsScreen.tsx:100`; `src/features/settings/sections/AboutSection.tsx`.
- **Implementation Status:** Implemented & Verified.
- **Controls & Elements:**
  1. *Delta Orb:* Embedded glossy `DeltaOrb` in idle decorative state (pearl/pink/magenta/violet).
  2. *Identity & Version:* Dynamic version string read directly from `app.json` (`v1.0.72`).
  3. *Hardware Target Badge:* Pill badge identifying `Google Pixel 11 Pro · Tensor G6`.
  4. *Operational Guide Button:* Triggers full-screen operational documentation and design system component reference (`onOpenGuide`).
- **Retired / Cleaned Up Elements:**
  - Removed background gradient `<Scrims />` layer.
  - Deleted legacy S10 specification rows, synthetic doctor diagnostics, developer overlay switch, and reset settings panels to eliminate dead code and maintain production polish.

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

### Local voice and wake checkpoint - 1.0.67

Voice output selection and Test selected voice now precede the VAD timing and wake controls on S04. On the Pixel, the Kokoro route completed one test utterance and bound the installed Sherpa-ONNX service; audible identity remains for the user to confirm. The native OpenWakeWord module completed room-plus-three-take enrollment and reached Android speech recognition on a spoken “Hey Delta,” but monitoring rearmed and retriggered around 10 seconds later, repeatedly. Stable one-shot wake and reply behavior has not passed. S04.1 reflects native microphone/model availability and offers a recheck; its failure branch remains unverified. Board 09 frames 5–6 remain historical proposal art because no visual redesign was accepted in this increment; see [implementation evidence](../IMPLEMENTATION.md#local-voice-output-and-acoustic-wake-checkpoint--2026-09-25).
