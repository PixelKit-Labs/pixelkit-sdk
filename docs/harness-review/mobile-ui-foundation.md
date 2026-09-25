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

## Optional TypeSafe/Jev presentation boundary

The optional cloud intent setting lives in Settings S09; its credential lives in Settings S02 Keys. Connections N10 and board 06 frame 4 are superseded presentation references. The active source currently invokes Jev only for ambiguous flashlight intent after opt-in, sends that utterance off-device, and falls back to a local clarification on failure. It does not run general chat triage or authorize tools. The UI relocation is implemented in source but remains unverified on Android. The Jev credential remains in its SecureStore adapter; the legacy Gemini credential remains in generic SettingsStore JSON. See the [Settings spec](../mobile-ux-review/specs/settings.md#s09-typesafe-ai--jev-service), [board correction](../mobile-ux-review/REVIEW_NOTES.md), and [implementation evidence](../mobile-ux-review/IMPLEMENTATION.md#optional-jev-settings-ownership--2026-09-25). SDK hooks and hardware contracts are unaffected; the privacy chapter changes because it now distinguishes these actual storage paths.
