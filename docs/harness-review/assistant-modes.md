# Delta assistant modes and shared capabilities

Status: current source status plus a historical 1.0.79 diagram and the user-directed shared-mode target, updated 2026-09-28. The diagram remains pinned to Delta Mobile commit `83b2319`; it is retained as historical evidence and does not describe the 1.0.86 Nano coordinator.

Implementation update: Delta Mobile 1.0.86 routes Nano text turns through a durable coordinator with persisted input, bounded context, deterministic proposals, schema/capability validation, confirmation, execution checkpoints, tool results, Skills/Wiki retrieval, model continuation, and terminal projection. Laya now contributes advisory bounded tool-intent ranking and visible provenance to this Nano path. Live and Gemini API still use separate paths.

- [Historical Delta 1.0.79 chat architecture](diagrams/current-delta-chat.html) shows the former one-pass path and flashlight-only Laya branch.
- [Target shared assistant architecture](diagrams/proposed-assistant-harness.html) still applies to the remaining Live and Gemini API unification.

## One assistant contract across three modes

The user has specified three provider modes—Gemini Nano, Gemini Live and Gemini API with selectable models—and that **each should have Laya, the Tool Harness, Skills and Wiki**. Provider selection changes how the assistant reasons or communicates; it must not silently change the rules for tool execution or the meaning of a successful result.

| Capability | Current source behavior | Shared target |
| --- | --- | --- |
| Gemini Nano | Normal chat uses the durable Turn Coordinator and canonical Delta registry. Input persistence precedes effects; validated calls, results, context, response, and terminal projection share one run/turn identity. | Device-verify the implemented loop, then preserve the same contract while tuning provider behavior. |
| Gemini Live | The chat screen connects directly to the SDK Live hook and its separate hardware registry. This bypasses Delta's coordinator policy and normal session persistence. | Duplex provider connected to the same turn, tool, Skill, Wiki, confirmation and persistence contracts. Preserve audio and text event provenance. |
| Gemini API | The SDK cloud agent is mounted in AI Lab, not the ordinary conversation. It has a separate registry and loop. | Explicitly selected cloud model adapter using the same coordinator and policy. Cloud use is never an automatic response to a local provider or Laya failure. |
| Laya | Optional local ONNX inference ranks a bounded tool-intent taxonomy for Nano turns. The persisted candidate is untrusted, cannot create arguments or authorize execution, and is visible in the conversation. | Reuse the same advisory contract for Live and API only after those providers enter the coordinator; calibrate with labeled and device evidence. |
| Tool Harness | Nano uses the coordinator, strict registry contracts, runtime availability, effect policy, confirmation, deadlines, idempotency, and durable outcomes. Live/cloud remain split. | One catalog and policy gate for device, SDK and MCP adapters across every provider mode. |
| Skills | Skills are durable guidance retrieved by `use_skill`; activated instructions enter the bounded context as untrusted procedure data. | Make the same retrieval and continuation behavior available to Live and API through the coordinator. |
| Wiki | Chat retrieves typed evidence-backed Wiki context and tools preserve claim/evidence provenance. | Make the same evidence contract available to Live and API. |

The Nano coordinator persists user input, provider choice, candidate guidance, validated calls, actual outcomes, and assistant response under one run/turn identity. Tool output must report an observed effect or explicit failure; model text cannot certify a hardware action. Live audio remains Live audio; Kokoro belongs to the local speech cascade and does not implicitly replace it.

## Next implementation boundary

The remaining boundary is provider unification, not a new Nano harness. Bring Live and Gemini API through the existing coordinator only after credential, connection, streaming, cancellation, and persistence semantics are verified. Laya remains advisory; no provider may treat its probability as permission or use its failure as automatic cloud-fallback consent.

## Evidence and open questions

Source references and observed limitations are in the [agent harness audit](agent-harness-audit.md) and [application reliability review](application-reliability-review.md). The HTML diagrams include source references and implementation-status cards. The current source diagram was validated against the pinned Delta Mobile commit; both diagrams passed nine Archify showcase checks with zero warnings and visual containment at 1440×900, 1600×1000, 1920×1080 and 2048×1320. Those checks establish diagram quality, not app correctness.

The authorized Pixel ran Delta 1.0.85/code141 over USB and completed a real `get_battery` tool turn plus a 28-turn conversation without process loss; that build had Laya disabled and the model missing. Delta 1.0.86 Laya inference, download, score quality, and resource use remain unverified until the pinned model is installed and the new APK is exercised.

Design questions to resolve during implementation: how to select and switch Gemini API models; which Live tool/audio events can be mirrored into the common turn record; what evidence qualifies a Wiki page; and how the assistant should explain a local limitation before asking for cloud use. The target architecture does not presume automatic cloud fallback.

Glossary: **provider mode** is the selected Nano, Live or API reasoning/transport adapter; **candidate** is an untrusted Laya or model suggestion; **Tool Harness** is the common validation, permission, execution and observation boundary; **Skills** are procedures rather than privileged executors; **Wiki** is retrievable knowledge with source provenance; **turn record** ties input, actions, result and response to one request.

Decision log, 2026-09-28: Nano now has the shared coordinator, registry, Skills, Wiki, Memory, and advisory Laya layer. The user confirmed Laya's role is intent guidance and tool-selection confidence, not execution. Live and Gemini API convergence remains open; cloud fallback still requires explicit user policy.
