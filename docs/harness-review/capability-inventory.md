# Delta tools, skills and Wiki: source inventory

Source checkpoint: Delta Mobile commit `83b2319` (1.0.79/code135), reviewed 2026-09-27. The app checkout has unrelated local UI edits; this is a source inventory, not a claim that any listed capability worked on the Pixel. The [mode diagrams](assistant-modes.md) show how the inventory fits into the current and target assistant.

## What the three surfaces mean

**Tools** are named executors in `src/core/tools/registry.ts`. The constructor registers 49 built-in definitions, each with a name, description, category, optional parameter metadata and an `execute` function. `ToolRegistry.execute` applies the confirmation gate, calls the executor, captures duration and error, and emits a trace. It does **not** centrally validate arguments against the parameter metadata or probe current availability before dispatch. A registered tool is therefore not proof that a device capability exists, that chat can route to it, or that its reported effect was observed.

**Skills** are Markdown procedures in `src/core/skills/skillStore.ts`, not executors. `search_skills` returns names and descriptions; `use_skill` returns full instructions. User-authored skills persist under `STORAGE_KEYS.SKILLS`. The five bundled skills live in source. Chat only calls the skill tools for specific keyword patterns, and the one-pass Nano path does not continue through a procedure's steps. `search` filters disabled skills, but `use_skill` calls `get`, which does not enforce `enabled`; a disabled skill can still be loaded by exact name. Bundled enable toggles change the in-memory object only and are not persisted.

**Wiki** is `src/core/wikiStore.ts`: three seeded pages and three seeded proposals in arrays. The Agent screen reads them, expands pages, and changes proposal status. There is no Wiki retrieval tool or chat/Laya/Live/API consumption, no page authoring/persistence method, and no link from `decideProposal` to `SkillStore`. The displayed trace/evidence counts and accepted proposal status are seeded values, not verified operational evidence. The UI's claim that Delta automatically records learnings does not match this store.

## Built-in Delta tools (49 registered definitions)

| Group | Names | Count | Chat route today |
| --- | --- | ---: | --- |
| Hardware | `set_torch`, `strobe_torch`, `set_hilight`, `set_high_brightness_mode`, `set_refresh_rate`, `set_battery_share`, `get_temperature`, `get_thermals`, `set_microphone_direction`, `get_altimeter`, `get_battery`, `haptic_pulse`, `get_wifi7_status`, `wifi_rtt_ranging`, `get_satellite_status`, `get_private_space_status`, `titan_key_agreement`, `get_charging_intelligence`, `get_uwb_status`, `get_spatial_audio_status`, `get_play_integrity_status` | 21 | Many have fixed keyword rules; registration does not mean all 21 are routed. |
| Memory | `remember`, `recall`, `forget`, `list_memories`, `clear_memory` | 5 | Remember/recall/forget/clear have keyword or confirmation paths; list is registered. |
| Diagnostics | `diagnostics_summary`, `doctor`, `search_logs` | 3 | Keyword routes; `diagnostics_summary` substitutes nominal thermal status when absent, and `doctor` calls present fields “verified active.” |
| Session | `end_conversation`, `clear_history`, `hand_off` | 3 | Keyword routes; `clear_history` requires presenter coordination to actually clear `SessionStore`. |
| Language | `translate_text`, `identify_language`, `summarize_text` | 3 | Keyword routes with text extraction. |
| Web/research | `http_request`, `research.arxiv_search` | 2 | URL/research keyword routes. |
| Clipboard | `get_clipboard`, `set_clipboard` | 2 | Keyword routes, subject to platform access. |
| System | `device_info`, `get_setting`, `set_setting`, `reset_settings` | 4 | Keyword/confirmation paths; `device_info` contains hard-coded Pixel defaults on unavailable reads. |
| Vision/imagery | `capture_and_analyze_scene`, `scan_code_or_barcode`, `generate_image` | 3 | Specific image/vision/generation branches; input and service availability vary. |
| UI/skills | `show_card`, `search_skills`, `use_skill` | 3 | Specific card or skill keywords; loading a skill is not running it. |
| **Total** | | **49** | |

The full schemas and executors are in `src/core/tools/*.ts`. The Agent → Tools UI lists registry definitions and descriptions, not a live capability test or per-tool enable state.

## Bundled Skills (5)

| Name | Intended procedure | Current gap |
| --- | --- | --- |
| `pixel-battery-health` | Battery metrics, charging tier, cycles and thermal check. | Procedure text refers to fields that must be checked against actual `get_battery` output; loading it does not run its steps. |
| `wifi7-audit` | MLO links, bands, RSSI and aggregate rate. | Calls for observations beyond the current chat's automatic route. |
| `sensor-calibration` | Altimeter reading plus external QNH/METAR calculation. | No procedure runner or guaranteed source for QNH. |
| `thermal-adpf-sweep` | Thermal headroom, CPU behavior, frame pacing and display. | No bounded sweep runner or verified tuning action. |
| `vision-scene-audit` | Scene analysis and barcode scan. | Not named in the chat's direct skill shortcuts; can be loaded through explicit `use_skill` wording, but no continuation executes the steps. |

Users may create additional skills in Agent → Skills; their number and contents depend on local storage and cannot be inferred from source. `alwaysOn` exists in the type/search result but no prompt-injection path for it was found.

## Wiki seed content (3 pages, 3 proposals)

| Kind | Source title | State in source |
| --- | --- | --- |
| Page | Tensor G6 Thermal Headroom Profiles | Seeded body, revision 3, `evidence: 14`; no trace linkage. |
| Page | Barometric Altimeter Dynamics & ICAO Drift | Seeded body, revision 2, `evidence: 9`; no trace linkage. |
| Page | Battery Share (Reverse Wireless) Operating Limits | Seeded body, revision 4, `evidence: 11`; no trace linkage. |
| Proposal | Automated Battery Thermal Guard | Seeded pending, `evidenceCount: 8`. |
| Proposal | Automatic Barometric Sea-Level QNH Calibration | Seeded pending, `evidenceCount: 5`. |
| Proposal | Acoustic Beam Steering Camera Sync | Seeded accepted, `evidenceCount: 12`; no skill is installed by this status. |

These entries should be treated as illustrative content. Their hardware claims and evidence counts are not a knowledge base until backed by source/trace records and reviewed authoring.

## MCP is a separate inventory

The app's local MCP host declares 16 exports: `pixel_torch`, `pixel_thermometer`, `pixel_altimeter`, `pixel_battery`, `pixel_battery_share`, `pixel_wifi7`, `pixel_satellite`, `pixel_uwb`, `pixel_titan`, `pixel_haptic_pulse`, `pixel_device_info`, `pixel_search_logs`, `pixel_read_clipboard`, `pixel_set_clipboard`, `pixel_memory_recall`, `pixel_memory_store`. They are server exports, not 16 more Delta registry entries. The host's listener/bind state is not established by this declaration.

`McpStore` also contains two **disabled** example remote servers (GitHub and Home Assistant). Discovered remote definitions would be wrapped into Delta's registry with `mcp_` names, but the current keyword router passes `{}` as arguments. Disabling/removing a server only deletes the bookkeeping set: `unregisterServerTools` never removes those wrappers from `ToolRegistry`, so stale entries may remain callable. Neither a connected remote server nor a successful remote tool call is established here.

## How a request currently moves

1. Normal text chat calls `DeltaAgent.processUserTurn`. Keyword checks queue zero or more Delta registry actions, which execute sequentially before Nano receives an enriched text prompt. Laya participates only in an opted-in ambiguous flashlight branch. Model output cannot request a second tool step in this path.
2. `search_skills` or `use_skill` may be queued by exact keyword patterns. The returned procedure is prompt context, not an executed workflow. Wiki is absent from this path.
3. Gemini Live connects through the SDK hook and its separate hardware registry; Gemini API cloud-agent behavior is exposed in AI Lab through another SDK path. Neither shares Delta's registry, Skills or Wiki. The UI status of any of these paths is not a device-level success claim.

For the requested shared design, each mode should ask the same coordinator for tools, skills and Wiki; Laya may suggest a candidate; then one policy gate validates arguments and capability, asks for confirmation where required, executes, records observed outcomes and decides whether another step is needed. The [target diagram](diagrams/proposed-assistant-harness.html) shows that boundary. First implementation checks should distinguish listed, available, routable, permitted, executed and verified states per tool.

Source references: Delta `src/core/tools/{registry,types,skillTools,diagnosticsTools,systemTools}.ts`, `src/core/skills/skillStore.ts`, `src/core/wikiStore.ts`, `src/core/deltaAgent.ts`, `src/core/mcp/{mcpStore,pixelHardwareMcpServer}.ts`, `src/screens/ConsoleScreen.tsx`, `src/features/agent/{screens/AgentScreen,sections/KnowledgeSection,sections/SkillsSection}.tsx`; SDK `packages/sdk/src/ai/{useGeminiLive,useCloudHardwareAgent}.ts` and `packages/sdk/src/ai/tools/registry.ts`.

Evidence boundary: source review only. ARTEMIS failed before the first relevant UI step in the previous phone attempt; no new BDD, device execution or performance measurement was made for this chapter. Decision log, 2026-09-27: preserve the 49/5/3 inventory and clearly mark seeded Wiki data as illustrative before deciding which capabilities to keep, repair or expose through the shared harness. Other guide diagrams, feature status, hardware glossary and public hook contract are unchanged.
