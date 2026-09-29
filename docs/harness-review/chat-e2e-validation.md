# Delta chat E2E validation and improvement loop

## Implemented contract

Delta Mobile 1.0.87 adds `test/chat-e2e/suite.json`, a versioned 52-case acceptance contract across application-chat input/output, tools, Skills, Wiki, MCP setup, MCP use, Laya routing, voice-turn privacy, and response UI. `scripts/run-chat-e2e.mjs` validates coverage, lists cases, renders the checked-in manual and ARTEMIS recipes, creates result-schema-v2 evidence ledgers, runs one serial-scoped device target, preserves raw agent output, and generates owner-directed remediation reports. `docs/manual-chat-test-cases.md` is the comprehensive operator document generated from that same contract.

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

Laya quality is independent from the case's safety verdict. The v2 result ledger records expected and actual labels, uncalibrated score, runner-up/margin, disposition, influence, model/corpus revisions, latency, evidence, and a correctness assessment. A safe no-tool chat can pass while an incorrect advisory enters the remediation queue with an owner and action. `tool-intent-v2` expands `none` to explicit greetings, social replies, and jokes and adds the two observed false-positive prompts. The exact greeting rerun still returned `use_skill` at 100% uncalibrated in 3,230 ms, so prompt criteria alone are not a fix; `laya-model-training` remains open and the full 26-case v2 evaluation is unexecuted.

## Tool-flow presentation

For assistant turns with Laya provenance or executions, one collapsed **TOOL FLOW** overview appears before response prose. Its summary wraps to two lines when needed and states the Laya suggestion and uncalibrated score, **observed only**, actual tool count/latency, and terminal status. Expansion shows ordered Laya and execution steps. Tool input/output disclosure remains nested, independently collapsible, copyable, and contract-redacted.

## Voice-turn privacy boundary

TTS playback does not itself authorize microphone capture. A typed chat turn or confirmation may be auto-spoken, but completion leaves speech recognition idle. Only a speech-origin turn can opt in to one continuous follow-up, and the existing timeout bounds that window. The pure `voiceTurnPolicy` regression plus `chat-typed-tts-no-mic` and `chat-voice-continuous-follow-up` device cases preserve both sides of this boundary.

## Verification boundary

Delta `npm run verify` passed TypeScript, 275/275 tests across 65 suites, and the 52-case/eight-area contract validator. Expo web and Android exports bundled 3,087 and 3,446 modules. The arm64 APK built, installed on Pixel 11 Pro `66110DLKX001YW`, and reported 1.0.87/code143. Serial-scoped ADB plus ARTEMIS hierarchy checkpoints verified collapsed/expanded Tool Flow, nested and copied `get_battery` I/O, a real 96%-charging result in 11 ms, and a fresh joke turn that retained an 86% `use_skill` false positive as **observed only** while Nano returned a joke. Result-schema-v2 wireless-ADB attempt 1 submitted exact typed input “Say hello in one short sentence.” Nano returned and spoke “Hello there.” once; final UI remained **Start voice input**, and isolated logs contained TTS completion but no speech-recognition start, VAD timer, transcript, or follow-up submission. Acoustic wake monitoring was already active and resumed separately. Linked attempt 2 used `tool-intent-v2` and preserved the microphone/chat pass, but Laya still returned `use_skill` at 100% uncalibrated in 3,230 ms; model training remains open. Controlled MCP/Wiki fixtures, voice-origin follow-up, the full 26-case Laya v2 evaluation, and the remaining device cases were not executed, so the 52-case suite is not claimed as phone-passed. Canonical source was updated, but its site builder is absent (`MODULE_NOT_FOUND`).

## Glossary and decision log

- **Observed only**: advisory was recorded but did not change final tool selection.
- **Non-causal advisory**: every Laya result is recorded evidence only; it cannot alter routing or provider chat.
- **Remediation owner**: source surface responsible for a failed assertion.
- **Controlled fixture**: deterministic test dependency whose identity and behavior are recorded.
- **2026-09-28**: make input modality, not TTS completion, the authority for continuous microphone follow-up; preserve explicit speech-origin follow-up while typed and confirmation turns return to idle recognition.
- **2026-09-28**: chose evidence-required structured results over treating agent exit status as success; chose bounded causal disclosure over allowing an uncalibrated 75%-accuracy classifier to authorize tools.
