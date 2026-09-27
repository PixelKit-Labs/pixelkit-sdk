# Delta assistant modes and shared capabilities

Status: source-audited current state and user-directed target, 2026-09-27. The diagrams are explorable HTML with light/dark views. The current diagram is pinned to Delta Mobile commit `83b2319` (1.0.79/code135); local app edits and phone behavior are not claimed as verified by these diagrams.

- [Current Delta chat architecture](diagrams/current-delta-chat.html) shows the ordinary Nano text path, narrow Laya flashlight branch, Delta tool registry and separate Live path.
- [Target shared assistant architecture](diagrams/proposed-assistant-harness.html) shows the requested common capability layer. It is a design, not an implemented flow.

## One assistant contract across three modes

The user has specified three provider modes—Gemini Nano, Gemini Live and Gemini API with selectable models—and that **each should have Laya, the Tool Harness, Skills and Wiki**. Provider selection changes how the assistant reasons or communicates; it must not silently change the rules for tool execution or the meaning of a successful result.

| Capability | Current source behavior | Shared target |
| --- | --- | --- |
| Gemini Nano | Normal chat calls `DeltaAgent` first, which runs keyword-matched tools, then gives the results to Nano as text. Nano has no structured model/tool/result loop here. | Local text provider inside a bounded turn loop. It can answer or propose a next step, but the harness owns validated tool execution and observations. |
| Gemini Live | The chat screen connects directly to the SDK Live hook and its separate hardware registry. This bypasses Delta's tool policy and normal session persistence. | Duplex provider connected to the same turn, tool, skill, Wiki, confirmation and persistence contracts. Preserve audio and text event provenance. |
| Gemini API | The SDK cloud agent is mounted in AI Lab, not the ordinary conversation. It has a separate registry and loop. | Explicitly selected cloud model adapter using the same coordinator and policy. Cloud use is never an automatic response to a local provider or Laya failure. |
| Laya | Optional local ONNX inference only helps clarify an ambiguous flashlight request. Its candidate does not actuate a tool. | Optional local intent and tool-candidate scorer available to all modes. A candidate remains untrusted; unavailable models and timeouts leave the core harness usable. |
| Tool Harness | Delta, SDK Live/cloud and remote MCP have split registries. Delta's route is one-pass and lacks central runtime argument validation; stale remote entries can remain callable after disconnect. | One catalog and policy gate for device, SDK and MCP adapters: schema, current availability, effect class, permissions, confirmation, deadline, cancellation and observed result. Recheck at execution time. |
| Skills | `search_skills` and `use_skill` are registered, but keyword routing has no continuation loop to carry out a procedure. | Retrieve scoped procedures as guidance for the coordinator; every action still passes the same tool gate. |
| Wiki | The `WikiStore` is an in-memory, seeded UI surface and is not read by chat. | Evidence-backed retrieval accessible from each mode, with provenance, update and failure states. Do not present seeded text as verified device knowledge. |

The coordinator should persist user input, provider choice, candidate proposals, validated calls, actual outcomes and assistant response under one turn ID. Tool output must report an observed effect or explicit failure; model text cannot certify a hardware action. Live audio remains Live audio; Kokoro belongs to the local speech cascade and does not implicitly replace it.

## Next implementation boundary

Start with a common tool contract and provider-independent turn record, then route the existing Nano path through it. Correct stale MCP unregistration and false healthy/device-success results before expanding what the assistant can call. Bring Live and Gemini API through the same policy gate only after their credential, connection and persistence paths are verified. General Laya ranking, Skills continuation and Wiki retrieval can then build on that contract. This sequence is a proposal for implementation order; the shared-capability requirement above is the user's stated direction.

## Evidence and open questions

Source references and observed limitations are in the [agent harness audit](agent-harness-audit.md) and [application reliability review](application-reliability-review.md). The HTML diagrams include source references and implementation-status cards. The current source diagram was validated against the pinned Delta Mobile commit; both diagrams passed nine Archify showcase checks with zero warnings and visual containment at 1440×900, 1600×1000, 1920×1080 and 2048×1320. Those checks establish diagram quality, not app correctness.

The authorized wireless Pixel previously rendered Delta, but ARTEMIS stalled before the target UI steps because of provider/runtime failures. No new on-device turn, tool call, Live connection, Laya inference, Wiki retrieval, BDD test or speed measurement is asserted here. Mobile test code remains deferred until ARTEMIS establishes its actual UI path.

Design questions to resolve during implementation: how to select and switch Gemini API models; which Live tool/audio events can be mirrored into the common turn record; what evidence qualifies a Wiki page; and how the assistant should explain a local limitation before asking for cloud use. The target architecture does not presume automatic cloud fallback.

Glossary: **provider mode** is the selected Nano, Live or API reasoning/transport adapter; **candidate** is an untrusted Laya or model suggestion; **Tool Harness** is the common validation, permission, execution and observation boundary; **Skills** are procedures rather than privileged executors; **Wiki** is retrievable knowledge with source provenance; **turn record** ties input, actions, result and response to one request.

Decision log, 2026-09-27: the user directed that Nano, Live and Gemini API all share Laya, Tool Harness, Skills and Wiki. This chapter and its diagrams record the target while preserving the source-confirmed current state. No SDK hook, native module, Delta runtime or device behavior changes in this increment. Other guide chapters, feature status and hardware glossary remain unchanged.
