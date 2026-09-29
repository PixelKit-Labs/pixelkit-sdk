# Delta chat E2E validation and improvement loop

## Implemented contract

Delta Mobile 1.0.88 includes `test/chat-e2e/suite.json`, a versioned 52-case acceptance contract across application-chat input/output, tools, Skills, Wiki, MCP setup, MCP use, Laya routing, voice-turn privacy, and response UI. `scripts/run-chat-e2e.mjs` validates coverage, lists cases, renders the checked-in manual and ARTEMIS recipes, creates result-schema-v2 evidence ledgers, runs one serial-scoped device target, preserves raw agent output, and generates owner-directed remediation reports. `docs/manual-chat-test-cases.md` is the comprehensive operator document generated from that same contract.

An ARTEMIS process exit code is not acceptance. Passed and failed assertions require evidence references. Blocked fixtures, credentials, permissions, or provider states remain blocked. A full suite is incomplete while any case remains blocked or untested.

## Evidence model

Every run records run/source identity and timestamps; device serial/model/OS/transport; app version/code; native and JS identities; Nano, Laya, wake, Skill, Wiki, and MCP fixture revisions; network/permissions; case attempt and linked rerun; each step's input/status/actual/time/evidence; deterministic routing; Laya observation and influence; redacted tool inputs/outputs/errors/duration; exact assistant/UI/state/physical output; assertion actual/evidence; cleanup; and follow-up owner/action/status. Physical effects require physical observation. Tool completion requires the persisted execution result. Assistant prose is not evidence that a call ran.

The result report maps each failed assertion to its owning correction surface:

- system/custom instructions and response grounding;
- a named built-in tool or policy gate;
- a named Skill or SkillStore;
- Wiki storage/retrieval and evidence boundaries;
- MCP setup, client, host, security, or routing;
- Laya corpus/evaluation/service;
- Turn Coordinator, session persistence, provider runtime, or conversation UI.

This mapping is the retroactive improvement queue. Fix the owner at source, add a deterministic regression when possible, rerun the failed case and area, then rerun the full suite without deleting prior evidence.

## Laya causal proof

A confidence score alone cannot prove Laya guided selection. Delta persists `routingDecision.influence`, `routingDecision.finalTools`, and a human-readable reason after deterministic routing.

`none` is the only implemented influence: Laya was observed but did not cause the selected tool or alter a no-tool provider turn. `corroborated` records agreement, not causation. No score can create arguments, execute a tool, request a tool action, or interrupt ordinary chat.

The controlled `laya-advisory-false-positive` case compares the same prompt and injected model output with Laya disabled and enabled. The disabled baseline must not call the advisor. The enabled result must record the suggestion and `influence: none` while preserving the same provider path. This regression covers the USB Pixel observation where “Tell a short joke” produced an 86% uncalibrated `use_skill` false positive.

Laya quality is independent from the case's safety verdict. The result ledger records expected and actual labels, uncalibrated score, runner-up/margin, disposition, influence, model/corpus revisions, latency, evidence, and a correctness assessment. `tool-intent-v10` keeps the strongest measured 32-label classifier and conditionally runs a two-option named-Skill verifier only after a primary `use_skill` result. On the pinned Pixel CPU checkpoint, 26/26 cases completed at 76.9% accuracy; exact greeting and joke cases selected no-tool, and flashlight selected `set_torch`. Remaining misses and calibration metrics are in the Laya chapter.

## Tool-flow presentation

For assistant turns with Laya provenance or executions, a compact **Flow** trigger shares the Delta/timestamp metadata line. Its collapsed text reports only no-tool, tool count, failure, or offline status. Expansion discloses complete Laya selection, score, margin, disposition, latency, model, proposed/final tools, influence, routing reason, IDs, errors, local/non-authority constraints, and every separate execution. Tool input/output disclosure remains nested, independently collapsible, copyable, and contract-redacted.

## Voice-turn privacy boundary

TTS playback does not itself authorize microphone capture. A typed chat turn or confirmation may be auto-spoken, but completion leaves speech recognition idle. Only a speech-origin turn can opt in to one continuous follow-up, and the existing timeout bounds that window. The pure `voiceTurnPolicy` regression plus `chat-typed-tts-no-mic` and `chat-voice-continuous-follow-up` device cases preserve both sides of this boundary.

## Verification boundary

Delta `npm run verify` passed TypeScript, 278/278 tests across 65 suites, and the 52-case/eight-area contract validator. On wireless Pixel 11 Pro `adb-66110DLKX001YW-5R845E._adb-tls-connect._tcp`, current 1.0.88 JavaScript rendered the inline collapsed Flow trigger and complete expanded provenance. One full `tool-intent-v10` CPU run completed 26/26 cases at 76.9% accuracy and 489.15 ms mean latency; exact greeting and joke inputs selected no-tool, while flashlight selected `set_torch`. The final arm64 APK built, installed, reported 1.0.88/code144, retained the verified v10 artifact, and loaded the checkpoint to READY. The complete 52-case phone matrix, MCP, and Wiki fixture runs remain separate acceptance boundaries.

## Glossary and decision log

- **Observed only**: advisory was recorded but did not change final tool selection.
- **Non-causal advisory**: every Laya result is recorded evidence only; it cannot alter routing or provider chat.
- **Remediation owner**: source surface responsible for a failed assertion.
- **Controlled fixture**: deterministic test dependency whose identity and behavior are recorded.
- **2026-09-28**: make input modality, not TTS completion, the authority for continuous microphone follow-up; preserve explicit speech-origin follow-up while typed and confirmation turns return to idle recognition.
- **2026-09-28**: chose evidence-required structured results over treating agent exit status as success; chose bounded causal disclosure over allowing an uncalibrated 75%-accuracy classifier to authorize tools.
