# Review boundaries and board corrections

All ten PNGs are saved concept art containing illustrative content. They are not application screenshots or evidence of execution. Specs and these corrections govern implementation when generated imagery differs. Frame labels in the images are local to each board, not stable sitemap IDs.

| Board | Required interpretation / correction before implementation |
| --- | --- |
| 01 | Full-screen hub means no visible underlying conversation strip. Session selection opens the conversation; overflow opens management. Channel schema/pinning remain proposed. |
| 02 | Image-chat unavailable must disable sending that attachment while preserving the draft and offering removal. Do not reproduce assistant copy inviting unsupported photo analysis. |
| 03 | Revision 2 corrects the blue switch to pearl. Role examples and voice-tone controls do not prove functioning specialist routing or persistent voice settings. |
| 04 | Tool toggles cannot imply enforcement until runtime policy consumes them. Documentation must use actual exported hook contracts. |
| 05 | Authentication labels are proposed UI, not evidence that transport authentication is enforced. |
| 06 | Frame 4 places Optional Cloud Assistant in Connections; that placement is superseded. Settings S09 owns the opt-in and disclosure, while Settings S02 owns the Jev key. Preserve the PNG as historical provenance. Remove promised release timelines. Cloud consent describes the ambiguous flashlight utterance leaving the device when enabled; secure storage guarantees must match the platform adapter. WhatsApp remains unavailable until genuine pairing exists. |
| 07 | Readings, traces and timings require actual provenance. Missing values are an em dash; sample values are never seeded into production. |
| 08 | Cloud processing does not imply cross-device chat sync. Replace that reference copy. Approval orb is amber. Help/component routes are proposed reuse where currently unmounted. |
| 09 | Remove unmeasured “faster responses” claims. Model readiness and voice availability come from runtime capabilities. |
| 10 | “Factory reset / erase all app data” is incorrect. Use **Reset Delta settings**, scoped to `SettingsStore.reset()`. It does not wipe the phone or all application data. Diagnostic results begin “Not run yet.” |

These issues are explicit validation items; the current PNGs must not be treated as copy-exact approved production designs. Regenerate affected boards after visual feedback, retain prior revisions, and update `generation-manifest.json` and page coverage together.

## Evidence and decisions

- Approved conceptual direction: full-screen hub with visible open/close controls, channels and Discord-like sessions/messages, spacious keyboard-safe composer, neutral application palette, Delta orb identity.
- Proposed for validation: exact page grouping, individual board layouts, channel persistence/search/pinning semantics, and the mobile orb material adaptation.
- Implemented baseline: the current mobile source still has Console/Agent/Telemetry/Settings tabs. The implementation overhaul is now active; see IMPLEMENTATION.md for source status.
- Last keyboard investigation on device `66110DLKX001YW`: ARTEMIS task `6443ea27-32f4-40c3-8ef7-0475c34dd49f` failed in the runner. Keyboard typing remains unverified. Native build and current JS identities differ; reconcile before further acceptance testing.
- MOM integrated external OpenCode conversation/agent specifications and Antigravity settings/activity/guide specifications, with internal source/orb reviewers. Design-spec assignments settled; new runtime implementation assignments are active. MOM owns final integration and corrections.
- No SDK hook or hardware contract is changed by this reference package; mobile runtime changes are tracked separately in IMPLEMENTATION.md. Existing guide chapters cannot be rebuilt because `docs/harness-review/build-site.mjs` is missing.
