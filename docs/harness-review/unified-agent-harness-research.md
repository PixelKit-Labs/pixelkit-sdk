# Unified Delta agent harness: research and implementation contract

Status: proposed architecture and implementation contract, 2026-09-27. Delta Mobile 1.0.81 source implements part of migration step 0: AI Lab no longer fabricates diagnostics or media sends, hosted MCP no longer reports running without a bound listener, and conversation/draft writes expose durable failure with snapshot-at-request semantics. Stale remote-tool lifecycle was corrected separately in 1.0.80. Secure Gemini credential unification, legacy-store migration, device acceptance, and the provider-neutral coordinator remain unimplemented. Current shipped/device behavior remains pinned in [the agent harness audit](agent-harness-audit.md), [capability inventory](capability-inventory.md), and [application reliability review](application-reliability-review.md).

The interactive [unified harness diagram](diagrams/unified-delta-harness.html) is the review surface for this design. The earlier [current-state](diagrams/current-delta-chat.html) and [shared-capability target](diagrams/proposed-assistant-harness.html) diagrams remain separate so implementation intent is not confused with observed behavior.

## Decision

Build one small, typed, event-sourced runtime inside Delta Mobile. Do not embed a large orchestration framework in the Expo application. Borrow the durable execution, tool-loop, interruption, attribution, telemetry, Skills, and retrieval contracts that leading harnesses converge on, while keeping provider and transport adapters replaceable.

The runtime has one accountable **run coordinator**. Text, local voice, Gemini Live, Gemini Nano, and Gemini API are adapters around that coordinator. Models may propose text, tool calls, retrieval, skill activation, delegation, or completion. They never execute effects directly. Every effect crosses one policy and capability gateway, and every user-visible claim about an action is backed by an observed result or an explicit unavailable/failure state.

The event log is canonical. Chat messages, progress indicators, tool cards, approval prompts, group-chat attribution, and restored sessions are projections of that log. A provider transcript, React hook state, or model history is never a second source of truth.

## What leading harnesses agree on

| System or specification | Practice worth adopting | Delta application decision |
| --- | --- | --- |
| [OpenAI Agents SDK runner](https://openai.github.io/openai-agents-js/guides/running-agents/) | A model/tool/result loop continues until final output, handoff, interruption, error, cancellation, or a maximum-turn boundary. Sessions and streaming are runner concerns. | One coordinator owns the loop and finite budgets. Provider adapters do not own conversation durability or tool execution. |
| [OpenAI function calling](https://developers.openai.com/api/docs/guides/function-calling) | Tool calls use strict schemas and stable call IDs; the application executes them and returns matched outputs before the model continues. | Every proposed call is parsed, validated, capability-checked, policy-checked, executed, and answered exactly once under `toolCallId`. |
| [OpenAI human-in-the-loop](https://openai.github.io/openai-agents-js/guides/human-in-the-loop/) | Approval pauses a serializable run state and resumes the original run; nested-agent approvals surface to the outer run. | Approval is an interruption, not a chat-only callback. Resume revalidates capability, arguments, policy, expiry, and call identity before any effect. |
| [Anthropic, Building Effective Agents](https://www.anthropic.com/engineering/building-effective-agents) | Prefer simple workflows; add routing, parallelism, orchestrator-workers, or evaluator loops only when evaluation justifies the complexity. | Ship the single-agent loop first. Group chat and workers are later layers on the same run contract, not prerequisites. |
| [Anthropic multi-agent research system](https://www.anthropic.com/engineering/multi-agent-research-system) | A lead agent delegates bounded, independent work to isolated workers that return compressed results and artifacts. Multi-agent execution is expensive and poor for tightly coupled work. | The coordinator remains accountable. Workers get explicit objectives, scopes, budgets, output schemas, and artifact references. Parallelize independent slices only. |
| [LangGraph persistence and interrupts](https://docs.langchain.com/oss/javascript/langgraph/interrupts) | Checkpoint exact state before interruption and resume by thread identity. Resumed nodes may restart, so side effects must be idempotent or isolated after approval. | Persist before waiting. Never put an effect before a resumable approval boundary. Use idempotency keys for retryable effects. |
| [Microsoft Agent Framework group chat](https://learn.microsoft.com/en-us/agent-framework/workflows/orchestrations/group-chat) | A central manager selects speakers and enforces termination; group chat differs from handoff and concurrent fan-out. | User-facing group rooms have one manager policy and attributed public messages. Hidden workers remain subagents, not fake chat participants. |
| [AutoGen termination conditions](https://microsoft.github.io/autogen/stable/user-guide/agentchat-user-guide/tutorial/termination.html) | Message, token, timeout, handoff, external-stop, and function-call conditions can terminate a run. | Compose hard limits with OR semantics. The Stop control propagates cancellation to model, tools, retrieval, and workers. |
| [AG-UI event model](https://docs.ag-ui.com/spec/1.0/events/index) | Runs, messages, tool calls, reasoning, state, activity, subagents, and custom data travel as typed events. | Use a provider-neutral internal event union inspired by AG-UI. Do not bind the UI to a provider-specific stream. |
| [AG-UI interrupts](https://docs.ag-ui.com/spec/1.0/basic/patterns/interrupt-resume) | Interrupted runs close with explicit interruption IDs; continuation supplies complete resume decisions. | Every outstanding interruption is answered or explicitly abandoned. Missing approval never means consent. |
| [AG-UI subagents](https://docs.ag-ui.com/spec/1.0/events/subagents) | Each invocation has an attribution ID, lifecycle, parent, and owner; parallel streams may interleave. | `subagentRunId` identifies an invocation, not a reusable persona. Open child invocations must finish, fail, cancel, or suspend before the parent run completes. |
| [Agent Skills specification](https://agentskills.io/specification) and [client guide](https://agentskills.io/client-implementation/adding-skills-support) | Discover metadata first, activate full instructions on demand, then load referenced resources as needed. Disabled or unavailable skills are hidden. | Skills are versioned, progressively disclosed procedures. They can guide the coordinator but cannot grant permissions or bypass the tool gateway. |
| [MCP tools specification](https://modelcontextprotocol.io/specification/2025-11-25/server/tools) | Remote tools are model-controlled definitions with JSON Schema; human denial must remain possible. | MCP definitions and annotations are untrusted remote metadata. Revalidate names, schemas, origin, current connection, authorization, and results locally. |
| [OpenTelemetry GenAI agent spans](https://github.com/open-telemetry/semantic-conventions-genai/blob/main/docs/gen-ai/gen-ai-agent-spans.md) | Distinguish agent, workflow, planning, model, retrieval, and tool spans; content capture is opt-in because it is sensitive. | Follow the semantic names where practical and add Delta run identifiers. Raw prompts, results, Wiki content, and credentials are excluded by default. |
| [GraphRAG dataflow](https://microsoft.github.io/graphrag/index/default_dataflow/) | Documents, chunks, claims, entities, and summaries retain links back to source units. | Wiki claims and summaries must cite immutable evidence records. A generated page is never its own evidence. |
| [Anthropic contextual retrieval](https://www.anthropic.com/engineering/contextual-retrieval) | Hybrid lexical and semantic retrieval preserves exact terms and broad meaning; reranking can improve relevance but must be evaluated. | Start with lexical search plus embeddings only when the corpus justifies them. Add reranking or graph retrieval only after Delta-specific retrieval evals. |

## Current Delta gap map

| Area | Current source-backed state | Required cutover |
| --- | --- | --- |
| Turn ownership | `DeltaAgent` runs keyword matches before Nano; Live and AI Lab cloud paths bypass it. | Every provider enters one coordinator and produces the same event contract. |
| Tool loop | Normal Nano chat is one pass; model output cannot request another validated step. | Bounded propose → validate → approve → execute → observe → continue/finish loop. |
| Catalog | Delta tools, SDK Live/cloud hardware tools, and MCP wrappers are separate inventories. | One catalog with adapter ownership, strict input/output schemas, live availability, risk/effect class, permissions, timeout, cancellation, and provenance. |
| Truthfulness | Some diagnostic/device paths substitute plausible healthy or Pixel-specific values. | Unreadable means unavailable. A successful tool result requires an observed outcome; model prose and registry membership are not evidence. |
| Persistence | Session mutations can succeed in memory after durable writes fail; Live transcript is separate. | Append events and checkpoint atomically or report persistence failure. Resume and restart reproduce the same projection without duplicate effects. |
| Approval | Confirmation is presenter-oriented and time/fingerprint based. | Approval is a persisted interruption tied to run, call, exact arguments, policy version, expiry, and user decision. |
| Chat UI | Normal and Live transcript state differ; tool cards are partial projections. | One typed event projection for text, streaming, tools, approvals, retrieval, workers, errors, cancellation, and restore. |
| Group chat | Roster labels and `hand_off` do not enforce specialist prompts or tool scopes in the harness. | A manager selects speakers under explicit termination. Public participant messages are attributed; hidden workers return structured results to the coordinator. |
| Subagents | No general worker lifecycle, budget, lineage, or result contract. | A supervisor enforces parentage, depth, concurrency, budgets, cancellation, inherited policy, and terminal closure. |
| Skills | Markdown can be returned as context, but the one-pass path does not execute the procedure; disabled exact loads can leak through. | Catalog metadata, activation event, version/digest, trusted scope, enabled filtering, resource loading, and continued execution through ordinary tools. |
| Wiki | Seeded in-memory pages and proposal counts are UI data, not cited knowledge. | Durable sources, evidence chunks, claims, revisions, retrieval citations, review status, invalidation, and proposal workflow. |
| Telemetry | Several paths trace locally, but IDs and timing boundaries are not continuous across the complete turn. | One trace lineage across UI input, context, model, retrieval, skill, policy, tool, worker, persistence, speech, and final projection. |
| Evaluation | Existing tests cover components, while provider/device behavior and performance remain incompletely verified. | Contract tests, deterministic replay, tool-policy tests, retrieval evals, scenario outcomes, and ARTEMIS device evidence with build identity and trace IDs. |

## Runtime contract

### Identities

Every event carries `threadId`, `runId`, `sequence`, and timestamp. Relevant events also carry:

- `turnId`: one user request and its final outcome.
- `stepId`: one coordinator decision/model/tool/retrieval step.
- `messageId`: one immutable user, assistant, tool, or participant message.
- `toolCallId`: one proposed tool invocation and exactly one terminal result.
- `interruptionId`: one approval, credential, choice, or external-input request.
- `subagentRunId` and optional `parentSubagentRunId`: one worker invocation and its lineage.
- `traceId` and `spanId`: telemetry correlation, not business identity.

IDs are generated by the harness. Provider IDs are stored as provenance and never replace local identities.

### Canonical run states

`queued → routing → assembling_context → generating → validating_action → awaiting_approval → executing_tool → waiting_worker → responding → completed`

Terminal alternatives: `failed`, `cancelled`. A run that requires external input closes the current execution as `interrupted` and resumes as a new execution under the same thread and saved run state. States may repeat through the bounded loop; transitions are events, not mutable UI flags.

### Minimum event families

- Run: `run.started`, `run.interrupted`, `run.completed`, `run.failed`, `run.cancelled`.
- Step: `step.started`, `step.completed`, `step.failed`.
- Messages: `message.started`, `message.delta`, `message.completed`.
- Tools: `tool.proposed`, `tool.rejected`, `tool.started`, `tool.completed`, `tool.failed`.
- Approval: `approval.requested`, `approval.resolved`, `approval.expired`.
- Knowledge: `skill.activated`, `retrieval.started`, `retrieval.completed`, `citation.attached`.
- Workers: `subagent.started`, `subagent.progressed`, `subagent.finished`, `subagent.failed`.
- Durability: `checkpoint.saved`, `persistence.failed`.

Events are append-only. Compaction may replace streaming deltas with snapshots for archival, but it must preserve IDs, ordering, terminal outcomes, provenance, approval decisions, citations, and lineage.

## Bounded tool loop

1. Append the user input before invoking a model.
2. Assemble only current, permitted capabilities, activated Skills, retrieved evidence, and bounded conversation context.
3. Ask the selected provider for one structured next action or final response.
4. If final text: apply output policy, append it, persist the terminal run event, then project it to the UI.
5. If a tool is proposed: resolve the exact catalog entry and reject unknown, disconnected, disabled, or ambiguous names.
6. Parse and validate strict arguments. Reject extra properties unless the tool explicitly supports them.
7. Probe current availability and permissions. Model-provided capability claims are ignored.
8. Evaluate risk and approval policy. Persist an interruption before waiting.
9. On resume, verify the exact call, arguments, policy version, expiry, connection, permission, and capability again.
10. Execute with deadline, cancellation, idempotency key where supported, and one owner.
11. Normalize a result as `success`, `unavailable`, `denied`, `cancelled`, `timeout`, or `error`. Include observed evidence, not a prose assertion.
12. Append the result under the same `toolCallId`, feed it back to the provider, and continue within budget.

Initial conservative budgets for evaluation—not yet accepted product defaults—are eight model turns, twelve tool calls, one worker nesting level, three concurrent workers, and a run-specific wall deadline. Network, tokens, media bytes, and per-tool retries also require explicit ceilings. Budget exhaustion is a visible terminal error, never a partial success.

Read-only independent calls may run concurrently. Effects are sequential unless the catalog explicitly declares that calls commute and the coordinator can still establish their individual outcomes. Retrying an effect requires an idempotency contract or a fresh user decision.

## Capability catalog and policy

Each capability record contains:

- stable local name, owner adapter, version, and origin;
- strict input and output schemas;
- availability probe and last observed state;
- effect class: read, reversible write, irreversible write, communication, credential, or external purchase/transfer;
- required Android permission, account scope, network state, and foreground/background constraints;
- confirmation rule and human-readable preview fields;
- deadline, cancellation support, concurrency rule, idempotency behavior, and result verifier;
- content/privacy classification and telemetry redaction rule.

Built-in, SDK, and MCP tools conform through adapters. A disconnected adapter immediately removes availability. MCP annotations are hints, never local policy. A child agent receives an allowlist intersection with its parent's permissions; it cannot broaden scope.

## Chat UI and conversation durability

`UIMessage` is a projection with ordered typed parts, not a provider message object. Parts may represent text, reasoning status without hidden chain-of-thought, tool call, approval, tool result, source, file/media, activity, error, or participant attribution. Streaming updates an open part by ID and closes it explicitly.

The UI must expose:

- current run state and provider provenance;
- Stop, which sends cancellation through every active adapter;
- tool arguments, risk/effect summary, approval/denial, and final observed result;
- retrieval sources and whether the answer relies on unverified or stale evidence;
- subagent ownership and progress without pretending internal work is a user-facing speaker;
- retry from a known checkpoint and branch from an earlier run without rewriting history;
- persistence failure as a blocking durability state, not a toast after pretending the turn saved.

On restart, the app replays the latest checkpoint plus subsequent events. A dangling tool proposal is never silently re-executed. It is restored as awaiting decision, abandoned, or failed according to persisted state.

## Group chat and subagents

These are separate product concepts.

**Group chat** is a user-visible room. Participants have identities, descriptions, provider configuration, visible messages, and enforced tool scopes. A manager policy chooses the next speaker by explicit mention, deterministic round-robin, selector decision, or concurrent gather. The room has hard termination conditions and one final coordinator summary. The default should be directed mentions plus coordinator selection; unconstrained model-to-model chatter is expensive and hard to evaluate.

**Subagents** are scoped workers inside one run. They are not automatically visible participants. The parent sends a contract containing:

- task ID, objective, expected output schema, and acceptance condition;
- bounded context bundle and artifact references;
- permitted tools, Skills, Wiki collections, provider, network access, and privacy scope;
- deadline, token/tool budgets, concurrency slot, cancellation signal, and maximum depth;
- required citations, confidence limits, unresolved questions, and result status.

Workers return structured results and artifact references. The parent validates those results and remains responsible for the user response. Handoff is distinct: it transfers foreground conversation ownership and must be visible. Worker-as-tool keeps ownership with the parent and is the safe default.

## Skills lifecycle

1. Discover built-in and user Skills into separate trust scopes.
2. Parse and validate metadata; calculate version and content digest.
3. Exclude disabled, incompatible, unavailable, or untrusted Skills from model-visible discovery.
4. Disclose only name and description in the session catalog.
5. Activate by model call or explicit user command and append `skill.activated`.
6. Load the instruction body and only referenced resources needed for the current step.
7. Treat all instructions as untrusted procedure context. System policy, user intent, capability policy, and tool schemas remain authoritative.
8. Run scripts only as catalogued tools with their own schemas, trust origin, sandbox/permission policy, deadline, and telemetry.
9. Record skill name, version, digest, activation reason, resources used, and evaluation outcome.

`alwaysOn` is reserved for a trusted, reviewed policy pack. Ordinary Skills cannot silently inject permanent instructions. Project or imported Skills require an explicit trust decision.

## Evidence Wiki

Separate four stores:

- **Conversation history**: what participants said.
- **Memory**: user preferences and personal facts with user controls.
- **Skills**: procedures for doing work.
- **Wiki**: evidence-backed knowledge about Delta, devices, systems, and observations.

The Wiki data model starts with `Source`, immutable `EvidenceChunk`, `Claim`, `Citation`, revisioned `Page`, and `Proposal`. Claims carry author, observed/effective time, confidence, verification status, and links to evidence. Page status is `draft`, `verified`, `stale`, or `disputed`. Confidence is not verification.

Device observations include device serial, app/native/JS build identity, scenario, monotonic timestamps, trace/artifact references, and observed values. Generated summaries are derived records and are invalidated when sources change. Agent-authored changes enter as proposals; they do not directly become verified facts.

For the current small corpus, use full-text/lexical retrieval with source filters and deterministic citation formatting. Add embeddings when measured corpus size and retrieval evals justify them. Hybrid lexical/vector search protects exact hardware identifiers while supporting semantic queries. Add reranking or graph-wide synthesis only after evals show a real miss rate that simpler retrieval cannot solve.

## Telemetry, privacy, and evaluation

Use nested spans for `invoke_agent`, `invoke_workflow`, `plan`, `generate_content`, `retrieval`, and `execute_tool` where those operations occur. Add low-cardinality attributes for provider, model, agent/version, finish reason, outcome, and error type. Correlate `threadId`, `runId`, `turnId`, `stepId`, `toolCallId`, and `subagentRunId` as application fields.

Measure separately:

- input accepted → route complete;
- context assembly and retrieval;
- provider request → first token/audio and completion;
- approval wait, excluding it from execution latency;
- tool start → observed effect/result;
- persistence append/checkpoint;
- STT final → submit, and response → TTS playback start/completion;
- worker queue/run duration, usage, failures, and cancellations.

Raw prompts, outputs, tool arguments/results, Wiki evidence, media, credentials, clipboard, memories, and personal data are opt-in sensitive payloads. Default telemetry stores metadata, sizes, hashes where safe, status, timings, and redacted error classes. Export requires explicit configuration.

Evaluation layers:

1. Schema and state-machine invariants.
2. Deterministic event replay and crash/resume cases.
3. Tool selection, argument, policy, denial, timeout, cancellation, and idempotency scenarios.
4. Provider adapter contract tests with recorded protocol fixtures, not fabricated successful effects.
5. Skills activation and instruction-conflict cases.
6. Wiki retrieval recall, citation correctness, stale/disputed handling, and unsupported-answer abstention.
7. Group-manager termination and worker budget/permission inheritance.
8. End-to-end ARTEMIS flows on the authorized Pixel with exact build identity, traces, repeats, failures, and timing boundaries.

Outcome evals matter more than forcing one prescribed model trajectory. Permanent tests assert user-visible behavior and invariants; they do not pin wording, copied fields, or mock echoes.

## Migration sequence and gates

### 0. Restore truth and durability

Remove fabricated healthy/device-success responses, make the Android MCP host unavailable until a listener actually binds, finish stale-wrapper lifecycle correction, unify secure Gemini credentials, and repair session/draft persistence results.

Gate: forced unavailable, disconnected, permission-denied, bind-failure, and write-failure scenarios remain visibly failed across restart. No later orchestration work may depend on a false success.

### 1. Land the runtime contract behind Nano

Add identifiers, event union, transition reducer, append/checkpoint store, provider interface, cancellation, and replayable UI projection. Adapt the existing Nano reply path without adding model-driven tools yet.

Gate: send, stream, stop, restart, edit/regenerate branch, and persistence failure preserve ordering and never duplicate a message or effect.

### 2. Add the single tool gateway

Adapt a deliberately small set: one safe device read, one confirmation-gated reversible actuator, and one memory operation. Implement strict schemas, availability, approval interruption/resume, deadlines, cancellation, and observed results.

Gate: model/tool/result continuation works; malformed, unknown, unavailable, denied, expired, cancelled, timed-out, and duplicate calls all fail closed. ARTEMIS confirms the real device effect and UI result.

### 3. Bring Live and Gemini API through the same runtime

Replace direct transcript/tool paths with provider adapters. Use one secure credential owner, supported models, explicit cloud consent, and persisted text/audio provenance. Live tool proposals enter the same gateway.

Gate: switching providers does not change approval, persistence, capability, Skills, Wiki, or success semantics. Local failure never silently escalates to cloud.

### 4. Activate Skills and Wiki

Implement progressive disclosure, trusted scopes, enabled filtering, version/digest tracking, Wiki source/claim/revision storage, citation retrieval, and proposal review.

Gate: disabled Skills are absent; Skills cannot broaden authority; every Wiki-backed answer links to evidence; stale/disputed content is visible; unsupported answers abstain.

### 5. Add workers, then optional group rooms

Implement the supervisor contract, one nesting level, finite concurrency, inherited policy, cancellation, artifact returns, and lifecycle events. Add user-facing group chat only for evaluated jobs that benefit from visible multi-perspective work.

Gate: no child outlives a terminal parent run, no child broadens permissions, parallel event attribution remains deterministic, and manager termination always fires.

### 6. Optimize only from traces and evals

Tune context, retrieval, provider selection, concurrency, Laya candidate ranking, and UI progressive disclosure from measured outcomes. Do not optimize by hiding errors, retries, approval time, or model exploration latency.

Gate: improvements beat a recorded baseline on success rate, correctness, latency distribution, resource use, and user-visible failure behavior.

## First vertical slice

The first implementation slice is intentionally narrow:

1. Define provider-neutral run/tool/event types and a pure transition reducer.
2. Add an append-only session event store with explicit durable results and replay.
3. Route the existing Nano text turn through the coordinator without changing its answer model.
4. Project existing messages and tool status from events.
5. Add Stop/cancellation and one crash/restart replay smoke path.
6. Only then connect three catalogued tools through the bounded loop.

This avoids building group chat, generalized Skills execution, vector retrieval, or recursive workers on top of the current split persistence and false-success behavior.

## Open product decisions

The architecture does not decide these without user feedback:

- whether cloud use is per-turn consent, a session policy, or always manual mode selection;
- which three real tasks define acceptance for the first tool-loop slice;
- whether group chat is a primary conversation mode or a specialized room created for selected jobs;
- which data may leave the phone and which telemetry content, if any, may be exported;
- which Wiki sources can become verified automatically versus requiring review.

## Glossary

- **Adapter**: translation between a provider/tool transport and Delta's local contract.
- **Capability catalog**: the live inventory of typed, policy-bearing operations; registration alone is not availability.
- **Checkpoint**: persisted run state sufficient to resume without replaying an effect.
- **Coordinator**: the single owner of one user run, its budgets, transitions, and final response.
- **Effect**: an operation that changes device, application, account, network, or external state.
- **Event projection**: UI or query state derived deterministically from ordered events.
- **Group chat**: user-visible multi-participant conversation under a manager policy.
- **Handoff**: visible transfer of foreground conversation ownership.
- **Interruption**: persisted request for approval, credential, choice, or other external input.
- **Observed result**: executor-produced evidence of success, unavailability, denial, cancellation, timeout, or error.
- **Skill**: versioned procedure context loaded progressively; never an authority grant.
- **Subagent**: scoped worker invocation owned by a parent run.
- **Tool gateway**: the only path from a model proposal to an executable capability.
- **Wiki evidence**: immutable source material or recorded observation supporting a claim.

## Implementation and evidence log

2026-09-27: researched the primary sources linked above and compared them with the existing Delta source audits. Chose a local typed runtime instead of adopting a heavyweight orchestration dependency. Authored the unified architecture and migration gates. The diagram passed all nine Archify showcase checks with zero warnings and visual containment in light and dark at 1440×900, 1600×1000, 1920×1080, and 2048×1320. Browser inspection confirmed the rendered title, controls, diagram, legend, and decision cards fit without scrolling at the audit viewport.

No Delta Mobile runtime, SDK hook, native module, tool behavior, provider connection, Wiki store, Skill execution, test, or device behavior changed in this research increment. No phone was exercised. The diagram and this chapter are proposed design artifacts. Existing source-audit findings, mobile verification boundaries, public SDK hook contracts, hardware chapters, and glossary entries outside this chapter remain unchanged.

2026-09-27: implemented the first truth/durability increment in Delta Mobile 1.0.81. Missing Gemini credentials now produce an unavailable diagnostic state; unconnected microphone/camera test payloads were removed; MCP host `running` requires a successful Node listener bind and React Native reports unavailable; queued workspace writes capture immutable snapshots; failed session/channel mutations roll back; drafts retain unsaved text, expose failure, coalesce pending revisions, and retry. Added injected durable-repository tests and a real occupied-port bind test. TypeScript, Android JS export and native debug build/install passed; the full suite is 161 passed with the same seven pre-existing failures. APK SHA-256 `147296DA937724503563B96282CDFA89A7084B620F64EFBC66A9DF8FBF7E3E4F` installed on wireless Pixel `10.0.0.25:37197`, where package manager reports 1.0.81/code137. Browser smoke exercised new-conversation navigation and the Local MCP unavailable surface without page errors. ARTEMIS trace `619ca5a1-32d0-46e6-8cfc-977c5391ad12` stopped before any action because secure keyguard was locked, so phone UI behavior, AI Lab and restart recovery are unverified. Migration step 0 remains open for legacy stores and one secure Gemini credential owner; step 1 has not started.
