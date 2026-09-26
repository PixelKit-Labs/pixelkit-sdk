# Mobile presentation and source boundaries

This chapter records the September 19, 2026 overhaul in progress. Its evidence is source review and the linked implementation log; it does not reconstruct the previously missing chapters or claim device acceptance.

## Responsibilities

Presentation owns navigation, layout, accessibility and interaction state. Domain models define conversations, sessions, drafts and tool-result contracts. Stores own state and persistence coordination. Services own external effects. The harness owns turn execution, capability validation, authorization and cancellation. See the detailed [engineering foundation](../mobile-ux-review/FOUNDATION.md).

The UI has one conversation hub rather than bottom tabs. Conversations remain central; Agent, Connections, Activity, Settings and Help are secondary destinations. The shell owns keyboard insets. One assistant runtime owns speech/model lifecycle; navigation must not create duplicate microphone or generation owners.

## Reference package

- [Visual gallery](../mobile-ux-review/index.html): saved PNG boards and page specifications.
- [Sitemap](../mobile-ux-review/SITEMAP.md): stable page/state IDs and explicit frame coverage.
- [Board corrections](../mobile-ux-review/REVIEW_NOTES.md): differences between generated concepts and supported behavior.
- [Implementation evidence](../mobile-ux-review/IMPLEMENTATION.md): current source paths, checks, gaps and coordination.

## Verification boundary

The USB phone `66110DLKX001YW` was attached and authorized. ARTEMIS exploration `37e6f9b1-4c75-4ed3-93cd-bdff483d6c37` could not execute the planned app interactions; provider logs reported exhausted prepayment credits (HTTP 402). The stalled task was cancelled. No keyboard, navigation, voice or persistence scenario from that run is passed, and no inference latency is an application benchmark.

The original `build-site.mjs` and historical chapter site were missing before this increment. The linked mobile review has its own executable offline gallery builder. Hardware hooks, model-provider contracts and SDK API chapters are unchanged by the design documentation; application presentation and persistence changes require their own evidence.

## Glossary

| Term | Meaning |
| --- | --- |
| Channel | User organization of sessions; not a model/provider connection |
| Session | Persisted conversation with stable identity |
| Draft | Unsent text/attachment state belonging to a session |
| Turn | One unit of conversation/execution bound to its originating session |
| Capability | Observed availability, not a claim inferred from a UI control |
| Board | Design reference image, not a device screenshot |
| Compatibility export | Old import path referring to the same implementation/singleton |

## Primary API research

React Native 0.86 modal back navigation must use `onRequestClose` because an open modal suppresses ordinary BackHandler events. [BackHandler documentation](https://reactnative.dev/docs/0.86/backhandler).

Keyboard avoidance can adjust layout height, position or padding and differs by platform; source configuration alone does not prove correct device clearance. [KeyboardAvoidingView documentation](https://reactnative.dev/docs/0.86/keyboardavoidingview).

Reduced-motion preference is queried and observed through AccessibilityInfo; presentation respects OS preference and stops animation while unresolved or reduced. [AccessibilityInfo documentation](https://reactnative.dev/docs/0.86/accessibilityinfo).

## Browser recovery checkpoint

The conversation screen and full-screen hub rendered in an isolated 412 ? 915 Edge browser. See the [saved implementation observations](../mobile-ux-review/IMPLEMENTATION.md#browser-recovery-checkpoint--2026-09-19) for remaining visual mismatches and the initial slow development bundle. This does not verify Android keyboard, voice or persistence behavior. SDK API and hardware chapters remain unchanged by this presentation increment.

## Navigation consistency checkpoint

The navigation increment uses one shared leading Back arrow and a prioritized Android Back dispatcher, with modal-owned callbacks and recorded parent destinations. See the [navigation contract and browser verification](../mobile-ux-review/NAVIGATION.md). Browser exploration verified 34 submenu routes and three embedded Connections parent chains; native Back parity remains unverified. Hardware/API chapters are unchanged.

## Submenu presentation increment

See [submenu review](../mobile-ux-review/SUBMENU-REVIEW.md) for source1.0.59/code115 coverage. Activity no longer inserts telemetry above unrelated details, Settings details omit repeated navigation, and trace initialization contains no fabricated measurements. API/hardware/provider chapters remain unchanged; native verification is pending because ADB lists no device.

## Models and Activity detail checkpoint

Source1.0.60/code116 separates Settings model preferences from identity, removes unsupported tool toggles and fabricated boot logs, and improves Activity log/image detail affordances. See [implementation evidence](../mobile-ux-review/IMPLEMENTATION.md) and [Settings source contract](../mobile-ux-review/specs/settings.md). Existing suite167/174 passes;7 failures are recorded, so verification is incomplete. The connected phone's secure keyguard blocked ARTEMIS before app interaction; browser evidence is not native acceptance. Hardware/API/provider protocol chapters, privacy and store-listing contracts are unchanged. Stable3.8 Live migration, Wiki source truth and device acceptance remain open.

## Phone response-work checkpoint
Source1.0.61/code117 separates retained runtime ownership from hidden transcript presentation, stops historical avatar animation and caches unchanged message content. Short phone CPU/view-count observations improved; resident memory remains unresolved. Native Voice navigation and composer clearance were directly inspected using ADB after ARTEMIS provider credits blocked its task. See the linked mobile implementation log for samples and artifacts. Hardware, SDK API and provider protocol chapters are unchanged.

## Repeatable browser reference review

Source1.0.62/code118 adds CDP capture and a [comparison gallery](../mobile-ux-review/evidence/browser-comparison/index.html). Hub hierarchy and narrow External Services layout were corrected using saved PNGs. Browser navigation/capture is verified at320/412px; native acceptance awaits the phone. Hardware, SDK API, provider protocol, privacy and store-listing chapters are unchanged. Implementation evidence records build identity and remaining suite failures.

## Consistent feature headers and focused forms

Source1.0.63/code119 uses one FeatureHeader for Agent, Activity, Settings and Connections. External Services Add/Import form state updates the header and routes Back through the existing unsaved-draft guard. Voice options use a two-column narrow layout. The hub now opens a Channels index and channel-chat detail; direct chats keep their persisted channel ID. Group chats and per-chat agent routing remain proposed because the session contract has no participants and the execution path emits one unscoped response. The conversation header is opaque, and the empty conversation keeps only the orb and main heading. The [rendered hub and roster captures](../mobile-ux-review/IMPLEMENTATION.md#nested-page-header-and-spacing-correction---2026-09-25) are browser observations; native acceptance is outstanding. TypeScript and web bundle checks passed; the seven existing Node failures remain. SDK API, hardware, provider, privacy, and store-listing chapters are unchanged.

Source1.0.64/code120 adds optional persisted chat kind and agent IDs but does not yet turn roster entries into independent responders. Thread presentation now follows the [message spec](../mobile-ux-review/specs/conversations.md#message-thread-refinement--source-1064). Editing is an inline, model-only replacement of a plain-text thread suffix, guarded by session/tail identity; regeneration saves selectable alternatives to the final plain response. Neither path replays hardware actions. Browser evidence covers the user bubble, inline edit, error preservation and header; native Nano success remains unverified. The SDK hook contract, hardware, provider, privacy and store-listing chapters remain unchanged.

## Local Laya presentation boundary

Delta Mobile 1.0.72 replaces JEV with local Laya in Settings → Models. Model setup, opt-in assistance, and a non-executing intent preview replace the cloud setting and key editor. The current adapter only shapes ambiguous flashlight clarification; the registry still owns execution. Broader MCP/tool routing is proposed. Current settings schema filtering prevents old opt-in from enabling Laya. The retired credential cleanup code is removed; old app data may retain its unused key until cleared. Gemini's generic JSON credential storage is unchanged. See the [decision-layer chapter](laya-decision-layer.md) for source boundaries, model provenance, ARTEMIS blockers and pending BDD acceptance. SDK hooks and hardware contracts are unaffected.

## Speech final-result handoff — 2026-09-25

On Delta 1.0.64/code120, the authorized Pixel 11 Pro (`adb-66110DLKX001YW-5R845E._adb-tls-connect._tcp`) emitted an SDK `onDeviceResult` after recognition began. Source inspection showed that `stopListeningAndTranscribe` returned the previous `lastTranscript` immediately, before that event could arrive. PixelKit SDK 1.6.36 changes `packages/sdk/src/ai/useSpeechAI.ts` to await the matching Android final-result event, or return `null` on error, cancellation or a 15-second timeout. The SDK typecheck and 80 existing unit tests pass; native voice submission with the updated SDK has not yet been verified. The 1.0.64/code120 app screenshot and Android log timestamps are the observed evidence; they are not proof of a successful voice turn. No hardware API or cloud provider behavior changed.

In this chapter, *final result* means the recognizer's `onSpeechResult` event, and *submission* means handing that transcript to Delta's conversation path. Next check: install the registry release in Delta, rebuild, and confirm one spoken prompt appears once with a generated reply on the same device. The missing `build-site.mjs` remains an open documentation infrastructure issue; the local mobile review gallery is built separately.

### On-device recognition startup — 2026-09-25

At approximately 16:24:33–16:24:43 on the authorized Pixel 11 Pro, Delta reported a `useSpeechAI` start-recording error while Android's SODA service initialized and pushed audio. PixelKit's native `startSpeechRecognition` waited only for `onReadyForSpeech` and rejected the request after 10 seconds. The SODA log shows service work, but does not establish that a callback reached this app. PixelKit 1.6.40 now also accepts `onBeginningOfSpeech` or a nonempty `onPartialResults` as proof that the current recognizer session started. The first of those callbacks or `onReadyForSpeech` resolves the startup promise once; RMS changes and final results do not mark startup ready. A session with no qualifying callback still times out and destroys its recognizer. The native log records which callback resolved startup, or that it timed out, with the request ID for correlation.

This is an implemented SDK change, not yet a device-verified fix for Delta's failing utterance. Rebuild Delta against the published SDK when available, capture native callback logs and the `useSpeechAI` result on the same request ID, then repeat spoken start, silence, cancellation, and immediate retry on the authorized phone. The SDK's public hook shape, cloud transcription route, hardware telemetry, provider policy, and privacy chapters are unchanged; only the Android on-device startup state machine and its diagnostic log changed.

## Local speech-engine selection — 2026-09-25

PixelKit 1.6.37 adds an explicit Android TTS-service route to the headless `useSpeech` hook. The installed-service list comes from Android package visibility; `speak(text, { enginePackage })` requests one service. PixelKit 1.6.38 corrects a check that had compared the request against Android's system default instead of the active instance. The bridge now rejects a missing service and rejects a detected engine mismatch. Android's public TTS API does not reveal the active instance's engine on every device, so silent fallback after a binding failure remains possible and exact engine identity needs device verification. The system Expo Speech path remains the default. `packages/native/android/src/main/java/expo/modules/pixelnative/ExplicitSpeechEngine.kt` owns the native lifecycle; `packages/sdk/src/ai/useSpeech.ts` owns the traced public operation and per-hook state. This is a platform speech-engine bridge, not bundled Kokoro inference.

The upstream Sherpa-ONNX Kokoro English 1.13.8 APK is signed by k2-fsa, contains `model.onnx`, `voices.bin`, tokens and eSpeak data, and its ZIP and ELF libraries passed 16 KB alignment checks. Its SHA-256 is `F8B39CE323351E184FBB794E92BAA311DBB3496B741F565C428DEEA01A0DC79F`. It was installed on the authorized Pixel; audible Kokoro playback through the new bridge remains unverified. Model packaging and speaker choice belong to that separate Android engine; its English v0.19 package lacks desktop Delta's `af_heart` speaker. SDK API and speech-engine documentation changed; other hardware, privacy and provider chapters are unchanged.

Delta Mobile 1.0.67/code123 includes a separate `delta-openwakeword` Expo module for 16 kHz PCM capture and OpenWakeWord ONNX feature extraction. Its Voice page captures a quiet-room sample and three phrase takes, saves only a calibrated embedding template in private app storage, and monitors while Delta is foregrounded and idle. `openWakeWord.ts` serializes microphone operations; Console releases AudioRecord before handing off to SDK speech recognition. The installed Pixel reported the sideloaded local feature models ready, completed one room take and three phrase takes, and displayed a calibrated enrollment. Its recorded scores were background 0.027418, match 0.117039 and threshold 0.090153; these are enrollment values, not performance measures. Saying “Hey Delta” then stopped monitoring and started Android speech recognition, but monitoring rearmed and retriggered repeatedly around 10 seconds later. **Live wake reliability failed acceptance**; stable one-shot turn completion, false-trigger rate and power cost remain unverified. The models are not included in the repository. The older `wakeWordEngine.ts` text match still only runs after recognition starts; it does not supply idle acoustic detection. Background wake is unavailable.

On the same Pixel (`adb-66110DLKX001YW-5R845E._adb-tls-connect._tcp`), Delta 1.0.67/code123 with published PixelKit 1.6.38 showed Kokoro selected, completed the Settings Voice test with `Playback finished`, and bound the Sherpa-ONNX TTS service. The user has not yet confirmed the audible voice identity, and Android's unobservable fallback remains a limit. ARTEMIS could not complete a UI run because its provider quota/rate limit was exhausted; this checkpoint used direct ADB UI and process inspection. No agent latency was counted as application timing. SDK API, hardware telemetry, cloud provider and privacy chapter contracts remain unchanged by this mobile implementation checkpoint; the speech-engine caveat above remains in force.
