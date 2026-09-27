# Delta tools, Skills, and Wiki: capability truth inventory

Current source checkpoint: Delta Mobile 1.0.82/code138, reviewed 2026-09-27. This chapter records source and automated evidence. It does not claim phone execution where the device flow was blocked.

## Contract

**Tools** are executors registered by `src/core/tools/registry.ts`. Registration means only that a schema and executor exist. A successful result now requires the runtime provider, validated arguments, completed operation, and—where the provider exposes it—observed or acknowledged state. Missing providers, rejected mutations, non-durable writes, and unavailable readings return an explicit error instead of a plausible default.

**Skills** are versioned procedural guidance, not executable workflows. `search_skills` discovers enabled guidance. `use_skill` injects the selected instructions into the final model prompt with `executionMode: "guidance"` and `stepsExecuted: 0`; it does not claim that any hardware step ran. Authored Skills and bundled enable overrides must persist durably before the UI reports success.

**Wiki** is an initially empty, durable, evidence-backed local knowledge store. A page requires a title, body, and evidence reference (`tool_result`, `device_observation`, `user_note`, or `url`). Search and read are available to Nano keyword routing and the tool registry. Writes use the confirmation-gated `record_wiki_observation` tool. Accepting a Skill proposal records that decision only; it does not install or run a Skill.

## Registered capability inventory

The registry contains 52 definitions:

| Category | Count | Names |
| --- | ---: | --- |
| Hardware | 21 | `set_torch`, `strobe_torch`, `set_hilight`, `set_high_brightness_mode`, `set_refresh_rate`, `set_battery_share`, `get_temperature`, `get_thermals`, `set_microphone_direction`, `get_altimeter`, `get_battery`, `haptic_pulse`, `get_wifi7_status`, `wifi_rtt_ranging`, `get_satellite_status`, `get_private_space_status`, `titan_key_agreement`, `get_charging_intelligence`, `get_uwb_status`, `get_spatial_audio_status`, `get_play_integrity_status` |
| Memory | 5 | `remember`, `recall`, `forget`, `list_memories`, `clear_memory` |
| Diagnostics | 3 | `diagnostics_summary`, `doctor`, `search_logs` |
| Session | 3 | `end_conversation`, `clear_history`, `hand_off` |
| Language | 3 | `translate_text`, `identify_language`, `summarize_text` |
| System | 7 | `device_info`, settings get/set/reset, clipboard get/set, and `show_card` |
| Web/research | 2 | `http_request`, `research.arxiv_search` |
| Vision/imagery | 3 | `analyze_image`, `scan_code_or_barcode`, `generate_image` |
| Skills | 2 | `search_skills`, `use_skill` |
| Wiki | 3 | `search_wiki`, `read_wiki_page`, `record_wiki_observation` |

The Agent → Tools surface is registry and schema inspection. It no longer maintains a disconnected “disabled” map or presents informational specialist tool scopes as permissions.

## Corrected false-success paths

- Clipboard, haptics, settings, session lifecycle, image storage, memory, Skills, and Wiki mutations fail when their provider or durable storage is unavailable.
- Torch, HBM, refresh-rate, microphone-direction, and Battery Share mutations check the provider response. Strobe and HiLight requests remain explicitly `verified: false` because no independent state observation exists.
- `device_info`, diagnostics, battery, thermal, altimeter, UWB, Wi-Fi, charging, language confidence, and Play Integrity no longer synthesize device identity, healthy status, readings, confidence, or server verdicts.
- `analyze_image` requires an existing image URI and a real analysis provider. `scan_code_or_barcode` calls the barcode provider rather than treating OCR text as a barcode.
- `generate_image` requires an image-capable provider and a durable archive write. `show_card` returns `renderRequested`, not a claim that UI was displayed.
- `hand_off` changes the active specialist and injects its prompt modifier. The roster's tool scope remains informational until a shared policy gateway enforces it.

## Bundled Skills

The five bundled procedures are `pixel-battery-health`, `wifi7-audit`, `sensor-calibration`, `thermal-adpf-sweep`, and `vision-scene-audit`. Their text names real registered tools and instructs the model to preserve unavailable values. Loading one produces guidance context only. The current Nano path remains one-pass; there is no general procedure runner or claim that a multi-step SOP completed.

## Evidence-backed Wiki lifecycle

The store starts with zero pages and zero proposals. `upsertPage` writes the page and evidence reference before publishing it to subscribers; failed storage leaves prior state intact. Revisions increment on a successful update. Proposal decisions use the same checked persistence path. Search results expose actual revision and evidence counts, not seeded numbers.

Open limitation: no autonomous learning loop authors Wiki pages. A caller must supply explicit evidence and pass confirmation. This is deliberate; model prose is not evidence.

## MCP boundary

The local MCP host declares 21 exports: the prior hardware, clipboard, memory, and log aliases plus `pixel_search_skills`, `pixel_use_skill`, `pixel_search_wiki`, `pixel_read_wiki_page`, and `pixel_record_wiki_observation`. Every call delegates to the Delta registry. The live telemetry resource returns null fields with `source: "unavailable"` when no runtime context exists. The device resource delegates to `device_info`; it no longer emits a hard-coded Pixel model, SoC, security chip, OS, or capability list.

The hosted Wiki writer remains confirmation-gated. A host request without an app confirmation provider fails explicitly. Remote MCP servers remain optional and are not evidence that a remote tool is connected.

## Request flow and remaining architecture gap

Nano text uses deterministic routing, executes matched registry actions, and passes results plus loaded Skill guidance to the model. Wiki search/read now participate in that route. Gemini Live and Gemini API still use separate SDK execution paths; the proposed shared coordinator, enforced specialist scope, bounded multi-step loop, and cross-mode policy gateway are not implemented by this increment.

## Evidence and verification boundary

Source references: Delta `src/core/tools/`, `src/core/{deltaAgent,wikiStore,imageStore,memoryStore}.ts`, `src/core/skills/skillStore.ts`, `src/core/mcp/{pixelHardwareMcpServer,mcpHostService,mcpClient}.ts`, `src/screens/ConsoleScreen.tsx`, and `src/features/agent/`.

Automated checks cover provider absence, rejected mutations, durable-store failure, Skill guidance injection, Wiki persistence/search/read, MCP resource truthfulness, and natural-language routes. Phone UI, physical actuator state, and sensor values require a new unlocked-device ARTEMIS run. The last authorized device attempt remained blocked by secure keyguard, so those paths are unverified rather than passed.

## Glossary

- **Available:** a required runtime provider exists for the current call.
- **Executed:** the provider returned without an execution error.
- **Verified:** an effect was independently observed or the provider returned an explicit verified acknowledgment.
- **Durable:** storage confirmed a persistent write; in-memory state alone does not qualify.
- **Guidance:** instructions placed in model context; zero procedure steps are implied.
- **Evidence reference:** a trace ID, artifact path, user-note ID, tool result ID, or URL attached to a Wiki observation.

## Decision log

- 2026-09-27: remove fabricated defaults, seeded Wiki claims, fake in-memory fallbacks, and silent mutation success.
- 2026-09-27: keep Skills as truthful guidance until a bounded executor exists.
- 2026-09-27: require explicit evidence and confirmation for Wiki writes.
- 2026-09-27: keep Live/API unification, specialist enforcement, and autonomous Wiki authoring open; no unanswered proposal is treated as accepted.
