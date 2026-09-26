# Delta delivery and verification workstreams

User scope recorded September 26, 2026. This is the active acceptance checklist, not a claim that the scenarios below pass. Track implementation, automated checks, and phone evidence separately.

## 1. Local Laya and the JEV replacement

Delta Mobile 1.0.75/code131 source restores the non-executing intent preview and retired-key cleanup in Settings → Models. The preview requires a ready model and shows its real candidate, selected probability, and measured decision duration. Opening Models deletes the old JEV key without reading it, with a visible retry if secure storage fails. TypeScript and Android export passed; model inference and the screen flow are not yet device-verified. The app's existing seven Node test failures remain a separate baseline issue.

Delta Mobile 1.0.76/code132 removes the unusable retired cloud benchmark. TypeScript and Android export passed; Node tests remain 155 passed and seven failed. This source version has not been installed, and no new ARTEMIS path or Laya inference is verified.

Implemented in Delta Mobile 1.0.72/code128: a reusable typed decision interface, local native adapter, model setup/preview settings, and retirement of the active JEV service and key editor. One successful app startup was observed through ARTEMIS after correcting the native/bundle mismatch. Model installation, local inference, and the new settings flow remain unverified on the phone. See [the Laya chapter](laya-decision-layer.md).

Acceptance requires verified missing-model, installation, loading, ready, error, disable and restart states; a real preview with measured inference time; no prompt upload during inference; and preserved explicit-command handling when Laya is unavailable. Check old-setting migration and retired-key cleanup. Review wording, progress, recovery and keyboard layout with the user.

The layer is intended to support future intent and MCP/tool candidate routing. The initial connected use remains flashlight clarification. Do not label general tool routing or model-proposed tool arguments as implemented. Execution stays behind the existing registry, capability checks and confirmation policy.

## 2. Fast, reliable voice: STT, TTS and Kokoro

Existing source and prior observations include Android recognition, explicit TTS engine selection, Kokoro service binding/playback callbacks, and experimental acoustic wake changes. These do not establish current end-to-end speed, correct audible voice, or useful wake accuracy. The shared ONNX runtime changed with Laya and needs wake regression verification.

Verify manual microphone input through final transcript, one submitted message and one reply. Exercise silence, stop/cancel, permission denial, interrupted recognition, repeated turns and foreground/background transitions. Distinguish STT from wake activation: a false wake or missed phrase is its own failure, not a transcription measurement.

Verify Kokoro selection and actual audible playback, request replacement/interruption, stop, replay, engine unavailable/failure and microphone handoff. Manual replay must not accidentally restart follow-up listening. Measure cold and warm runs separately before selecting optimization targets; do not silently substitute a cloud service or another voice engine.

## 3. Timing, telemetry and benchmarks

Audit event coverage and timing boundaries before making speed claims. Existing SDK trace correlation can misattribute overlapping calls; fix correlation or use explicit operation/turn identifiers before interpreting concurrent traces.

SDK 1.6.42 working-tree increment: `traced` now restores synchronous context before awaiting the operation and emits completion/failure with the operation's explicit ID. Durations use `performance.now()`; record timestamps remain wall-clock time. Inline logs retain synchronous ownership; logs after an await do not inherit an implicit ID and need request identifiers in event data for application correlation. This fixes completion-event attribution at the SDK source without claiming full async context propagation. Delta still consumes published 1.6.39, so the app has not received this correction. The app trace-bus, Laya stage timings and speech callback changes below remain outstanding. New tests and phone benchmarks remain deferred; existing checks are recorded separately.

| Stage | Required measurement boundaries |
| --- | --- |
| Input | Send/mic action to acknowledgement; mic start request to observed readiness |
| STT | First partial when available, end/stop to final transcript, final transcript to submission |
| Laya | Model load, first decision, warm decisions, queue wait and timeout |
| Routing/tools | Intent selection, validation/confirmation wait, tool start to actual completion |
| Reply | Submission to first available output and completed response; identify whether streaming exists |
| TTS | Request to playback-start signal and completion/interruption; distinguish callback timing from independently measured audible onset |
| UI/storage | Input responsiveness, message appearance/order, save completion and restore time |

Use monotonic durations within a process. Keep native, JavaScript, transport and user-wait intervals distinguishable; do not subtract unrelated clocks. Include cold/warm status, engine/provider, model revision, app/native/JS build identity, device/connection, repeat count, successes, failures, timeouts and raw evidence. Report median/p95 only with the sample count and method; include failures in reliability totals and do not hide retries. Agent exploration latency is not application latency. Unmeasured values remain unavailable.

Numeric performance targets are not yet agreed. Establish a baseline, identify the slow stages, then propose measurable targets for user review.

### Source audit, September 26

Follow-up implementation: Delta 1.0.73/code129 source now keeps active traces in a map, preserves externally supplied IDs, measures local durations monotonically, removes the 1 ms floor and makes completion idempotent. The compatibility current view is the most recently started active trace, not inferred async context. Call-site ownership and the other stage measurements remain outstanding. TypeScript passed; existing app tests remain 155 passed / seven failed with the same failure cases (`delta-mobile/.expo/telemetry-1.0.73-verify.log`). SDK 1.6.42 type/build/OpenAPI checks, 80 existing tests, local docs contract and packaging dry run passed; the sibling docs site built successfully. New concurrency tests remain deferred and neither increment has device acceptance. No release/tag was made. The canonical guide builder is still missing; hardware/voice/model/chat design sections otherwise remain unchanged by these telemetry fixes.

These are code observations, not device benchmarks. Resolve them before using the existing totals to compare Laya, Nano or Kokoro performance.

| Finding and source | Required correction / verification |
| --- | --- |
| Delta `src/core/observability/traceBus.ts` stores only one active trace. Starting another replaces that reference before the first is archived; an unknown trace ID creates a different ID. Durations use wall time and spans clamp to at least 1 ms. | Retain active traces by ID, preserve explicit ownership, and use monotonic elapsed time without inventing a minimum duration. Verify overlapping, missing-ID and repeated-completion behavior. |
| SDK `packages/sdk/src/core/observability.ts` holds a global active trace ID across `await` and times calls using `Date.now()`. | Correct SDK correlation at its source before downstream reliance; preserve the published contract and verify concurrent completion order. |
| Delta `src/core/layaService.ts` starts candidate timing after queue entry, combines lazy load with prediction, and can return a caller timeout while native work continues. | Record queue, load, prediction and caller outcome separately with one request ID; distinguish eventual native completion from a successful caller result. |
| Delta `src/screens/ConsoleScreen.tsx` subtracts summed tool durations from agent elapsed time and records `modelMs: 0` before response generation. Laya can already have run during agent routing. | Distinguish decision-model time from response generation; report summed tool work separately from elapsed time when work overlaps. Do not call the pre-response total end-to-end latency. |
| SDK `packages/sdk/src/ai/useSpeechAI.ts` measures on-device `latencyMs` from recognition start until final result. | Retain session duration but add stop/end-of-speech to final-result timing. Listening time is not transcription processing latency. |
| Native `ExplicitSpeechEngine.kt` ignores `onStart`; `useSpeech.ts` traces the explicit engine promise through completion. | Expose and correlate playback-start evidence before measuring Kokoro startup. Playback callbacks still do not establish independently measured audible onset. |

Existing test investigation: `persistence.test.ts` and settings-tool tests expect successful updates against Node memory storage, while `saveJsonResult` explicitly reports `durable: false` and SettingsStore rejects non-durable saves. `telemetry.test.ts` and `traceBus.test.ts` expect seeded boot records, while both stores initialize empty. Fix the fixtures/contracts after required ARTEMIS exploration; do not restore fabricated production telemetry or describe memory as durable to satisfy these assertions. Other failures remain under investigation.

## 4. Chat behavior and UI/UX

Explore each scenario through ARTEMIS, then author executable BDD coverage using the existing framework where suitable. Choose a UI runner only after assessing its locator/wait capabilities. Prefer observed accessible labels or IDs; coordinates require verified fallback positions. Scenario descriptions here are not test code.

| Area | Acceptance scenarios |
| --- | --- |
| Input/output | Typed and spoken submission, empty/long/multiline input, duplicate taps, cancellation, provider errors, response/replay controls |
| Editing | Edit/cancel/save, correct affected conversation suffix, failed replacement recovery, session switch during an edit; no unintended hardware replay |
| Regeneration | Correct target, alternatives, cancellation/failure, stale results after navigation, no duplicate or reordered messages |
| Ordering | Stable message identity, user/reply adjacency, overlapping callbacks, late results and conversation switching |
| Persistence | Restart/reopen, selected conversation/channel, messages and edited/regenerated content, drafts where supported, interrupted writes and recovery |
| Presentation | Keyboard clearance, focus, scroll position and newest-message visibility, back navigation, readable state/error text, accessible labels and touch targets |

Resolve the seven currently failing existing tests by investigating their contracts and fixtures; do not merely update expected values to make them green. Their last recorded run had 155 passes and seven failures, including persistence, legacy seeded diagnostic expectations and WhatsApp behavior. This is not a clean regression baseline.

## Execution order and completion gate

September 26 follow-up: reconnected the authorized wireless Pixel through its advertised endpoint `10.0.0.25:40959` and restored device 8081/8082 forwarding to Delta Metro 8082. ARTEMIS observed Delta's chat screen with Edit message, Regenerate response and Speak response controls; this establishes visibility, not their behavior. Pro attempt `b3e721d4-ca27-4b01-a046-a982ef4f3e69` and Flash navigation attempt `34500bbb-e1e9-44da-9ffa-78dfe7147f39` both encountered inference-provider rate-limit retries before a verified Settings navigation. Both were stopped. Credential verification passed, while the MCP/runner interpreter mismatch remains a diagnostic warning. Local model setup, new BDD and benchmarks remain unverified; no new test code was authored. Source-audit documentation passed `git diff --check`; the guide site builder is still absent. No application code changed in this follow-up audit.

1. Establish consistent build/Metro identity and audit timing coverage; retain a reproducible baseline.
2. Complete Laya model/UI verification and fix any defects at their owning source.
3. Verify and optimize the complete speech path using the same telemetry, including shared-runtime regressions.
4. Exercise the chat matrix and add BDD tests incrementally after each observed flow; apply UI touch-ups with user review.
5. Run the combined regression and benchmark set after integration.

Telemetry work spans every stream, rather than waiting until the end. A completed increment includes its patch version/changelog, source and guide updates, appropriate automated checks, and an honest device evidence record. An unavailable ARTEMIS run is blocked/unverified, not passed; the user has explicitly permitted deferring affected tests while ARTEMIS is blocked. Wireless Pixel serial adb-66110DLKX001YW-5R845E._adb-tls-connect._tcp is authorized in this session. Coordinate phone use before an uninterrupted test run.

## References, glossary and decisions

At 12:54, a fresh ARTEMIS screenshot confirmed Delta's Conversations drawer was open; the first hierarchy response contained unrelated app elements, while a subsequent hierarchy matched Delta. Treat the mismatch as potentially stale observation, not proof the user left Delta. Flash retry `a9131905-53ce-4ce7-b3b0-9f2b252b1383` again logged provider rate-limit retries before verified navigation and was cancelled. Phone availability is confirmed; automation-provider availability remains the blocker. No new BDD or performance pass is claimed.

- [Mobile foundation and implementation history](mobile-ui-foundation.md)
- [Delta Laya implementation](../../../delta-mobile/docs/laya-integration.md)
- [Delta architecture and voice evidence](../../../delta-mobile/docs/architecture.md)
- [Chat specifications](../mobile-ux-review/specs/conversations.md)

**Cold run:** required runtime/model resources are not already loaded. **Warm run:** the identified resources remain loaded. **BDD:** executable behavior scenarios with explicit preconditions, actions and observed outcomes. **Verified:** supported by recorded evidence for the named build and scenario; not inferred from compilation.

Decision: these four workstreams are the current scope; broader Laya routing stays a separate expansion until the replacement is verified. Hardware APIs, memory architecture and provider contracts are not changed by this planning document. The local guide site builder remains missing, so this Markdown checklist does not imply a rebuilt guide site.
