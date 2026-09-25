# Legacy surface disposition

These source surfaces are not all reachable in the current four-tab application. Inventory is not a request to restore every old tab or delete its source. Reconcile live imports, hardware ownership and replacement behavior before migration.

| IDs | Existing surface | Proposed home / disposition |
| --- | --- | --- |
| L01–L04 | Silicon: compute, system, network, trace | Activity telemetry/traces and reference links; retain source pending parity |
| L05–L10 | AI: chat, tasks, vision, language, voice, agents | Conversations and Agent; expose capability states honestly |
| L11–L16 | Sensors: motion, capture, audio, actuators, radios, security | Activity diagnostics and Tools; no extra consumer bottom tabs |
| L17–L20 | Docs: index, primer, hook detail, catalog | Help/reference; update generated documentation pipeline with imports |
| L21 | SettingsModal | Consolidate with Settings routes after caller audit |
| L22 | ControlsPanel | Decompose into supported controls in feature screens |

The current `src/core/surface.ts` legacy navigation map is not authoritative evidence of reachable App routes. Keep transitional C10 SessionDrawer until the full-screen replacement preserves session selection, drafts and back behavior. Each retirement needs a source-reference check and verified replacement, not just a matching mockup.
