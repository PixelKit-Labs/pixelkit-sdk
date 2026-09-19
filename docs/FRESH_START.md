# Fresh start: Delta mobile UI review

This plan follows the September 19, 2026 integration of accumulated work across
PixelKit-Labs. Repository synchronization is separate from product verification.
No Android device was attached during the source review; no mobile layout,
hardware behavior, or performance claim below is device-verified.

## Objective and ownership

Review every reachable mobile page and shared component for Android usability,
preserving Delta's current visual language until a different direction is agreed.
MOM coordinates integration, shared release metadata, and exclusive device use.
Assign disjoint file scopes to implementation workers; review their incremental
diffs and evidence before integration. Internal researchers remain read-only.

## Page inventory

| Main page | Sections and overlays |
| --- | --- |
| Console | Transcript, streaming, composer, confirmation, attachment preview, session drawer, image archive/detail, camera |
| Agent | Identity, Agents, Memory, Skills, Wiki, Tools, MCP, Prompts |
| Telemetry | Overview, Tools, Traces, Logs, Errors, Streams, Images, Audio Test |
| Settings | Assistant, Keys, MCP, Voice, Audio, Cost, Safety, Relay, About |
| Guide | Running It, Reference, Components |

Also inventory shared primitives, MCP feeds, optional JEV settings, wake enrollment,
WhatsApp relay, generative cards, and the trace waterfall. Legacy Dashboard,
AI Lab, Sensors, Docs, SettingsModal and the design-system catalog are not mounted
by the current shell. Preserve them until their intended disposition is decided.

## Work sequence

1. Establish the exact app/native/JavaScript build and authorized USB serial.
   Explore every page with ARTEMIS before writing mobile tests. Record screenshots,
   labels, transitions, keyboard/back behavior and unavailable states.
2. Correct misleading functionality first. Source review found fabricated wake
   samples/agreement/playback and WhatsApp pairing; local-only tool-enable and
   voice-tone controls; toast-only webhook/currency saves; invented telemetry
   fallbacks. Trace each control to execution. Implement a real path or display
   unavailable; never invent readings or success.
3. Verify the integrated shared-control and overlay changes. Check Android 48dp
   targets, nonoverlapping bounds, safe areas, text scaling, narrow layouts,
   accessible names/states, keyboard reachability, and modal dismissal.
4. Review navigation/draft preservation, confirmation ownership, and transcript
   scroll behavior. Do not keep hardware-owning screens mounted merely to retain
   drafts. Check reset confirmation from Settings and tool confirmation from Console.
5. Unify repeated section navigation and update the component catalog only after
   agreeing its role. Check all listed pages, empty/loading/error/disabled states,
   long content, primary-action hierarchy and meaningful feedback.
6. Run type checks, unit tests and Android export, then real-device scenarios.
   Record repeats, failures, application timing (excluding agent latency), trace
   references, and limitations. Get user feedback at a representative page before
   propagating a visual redesign.

## Evidence and open questions

- Source inspected: sibling `delta-mobile/App.tsx`, `src/screens/`, `src/components/`,
  `src/design-system/`, and `src/theme/`. Findings are source observations, not
  measured visual defects. Unit tests do not prove hardware or mobile UX.
- `docs/harness-review/` and its site builder were absent at this checkpoint,
  despite earlier changelog references. Recover or locate the original guide before
  treating its prior chapters, diagrams or workbench as currently available.
  This plan does not recreate or claim recovery of that missing work.
- Preserve prior release history. New evidence must be added as a new entry.
- Unchanged subsystems in this UI increment: model routing, tool authorization,
  provider contracts and native hardware semantics. Their existing limitations
  remain; this cleanup is not evidence that they work end to end.
- Clarify whether the dark HUD style stays, whether legacy pages remain, and how
  unsaved drafts should behave across tabs. Unanswered proposals are not accepted.

## References and glossary

- [Android accessibility and touch targets](https://developer.android.com/guide/topics/ui/accessibility/views/apps-views)
- [React Native ScrollView behavior](https://reactnative.dev/docs/scrollview)
- Local agent rules: `AGENTS.md`; mobile rules: `../delta-mobile/AGENTS.md`.
- **ARTEMIS:** device exploration and verification framework.
- **Unavailable:** no verified capability or reading; show no invented value.
- **Checkpoint:** committed integration state, not a release or device certification.

## Decision log

- 2026-09-19: user requested a fresh slate across all six PixelKit-Labs repositories
  before continuing the page-by-page cleanup. Finish existing bounded edits;
  reconcile commits, branches and PRs; carry unresolved findings into this plan.
- Publishing an npm release remains a separate action; no version tag is part of
  repository housekeeping.
