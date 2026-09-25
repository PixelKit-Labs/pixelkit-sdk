# Submenu review - 2026-09-19

Source increment: Delta Mobile 1.0.59 / configured Android code115. Reference boards03-10 remain design proposals; written Back-over-Close correction still applies.

## Reviewed coverage

| Area | Submenus inspected | This increment | Remaining review |
| --- | --- | --- | --- |
| Agent | Identity, specialists, Memory, Skills, Wiki, Tools, MCP, Prompts | Inline identity/memory errors and pending actions; draft-safe identity reset; actual memory result filtering; no-match states; Wiki empty state; unsupported tool switches disabled; embedded Connections owns its scroll | Dedicated item editors/details and proposal diffs still differ from boards03/04 |
| Activity | Silicon, Tools, Traces, Logs, Errors, Streams, Images, Audio | Telemetry only on Overview; missing power/thermal data remains unavailable; no fabricated boot trace; readable neutral trace controls; Streams owns its scroll; honest recording-unavailable copy | Rich error recovery, image detail, log copy affordance and narrow trace detail need another pass |
| Settings | Assistant, Keys, Connections, Voice, Audio, Cost, Safety, Relay, About | Index-only search; focused details without duplicate tabs; embedded Connections owns scroll; neutral panels; larger form/credential controls; wrapping unsaved bar; orb and readable identity labels | Separate model-choice page, provider catalog validation, full large-font review and device draft/keyboard acceptance |
| Connections | Local server, external service list/add/import, feeds, cloud assistant, relay | Persistent form labels, error announcements, transport radio semantics, larger fields, guarded single Back route, less technical index copy | Native connection flows and service detail acceptance; no network actions exercised in this visual pass |
| Help | Five topics, API reference, design specimens | Reference rows participate in search; API filters, search and copy controls meet48dp minimum; readable reference text | Long API expanded content and large-font device reading |
| Hub | Channels, session list, destination rows, search | Minimum48dp navigation/search/session actions | Native gesture reachability |

## Evidence and limits

Two internal researchers reviewed current source and actual boards03/04/05/07/08/09/10. Two existing Orca implementation workers completed scoped work; MOM reviewed their source and corrected remaining shared palette, form, header and target issues. Runtime restart did not cause duplicate dispatches; both external terminals were retained after settlement.

An isolated Edge walkthrough inspected34 ordinary submenu routes and five indexes at320x740; no document-level horizontal overflow was measured. Native switches retain platform visual size with expanded hit areas; browser bounding boxes alone do not prove their native touch area. Final return-path checks are recorded in IMPLEMENTATION.md. No new test scripts were authored.

ADB returned no attached device during this increment, so ARTEMIS phone exploration, keyboard behavior, hardware/gesture Back and timings are unverified. No application benchmark is inferred from browser automation waits.

TypeScript and Android export passed during this increment. Full verify does not pass: five existing settings/persistence-dependent tests fail, and traceBus.test.ts still expects the fabricated boot seed. That obsolete test must be updated following the project test-exploration prerequisite; no fake trace was restored to satisfy it.

Trace coverage is limited to actual instrumented operations; it does not establish Nano generation, audio or boot timings. Existing standalone sentinel trace-ID completion defects are a separate known follow-up. No provider/API/hardware contract or privacy change is claimed.

MOM final review replaced Agent/Activity selected-tab indexes with the shared SectionIndex destination rows; corrected skill hit areas, Settings heading/chevrons, Assistant orb and persistent labels, and removed the Connections Index shortcut that bypassed the draft guard.

## Follow-up: Models and Activity details (1.0.60 / code116)

Assistant and Models are separate destinations; S01.1 maps to board09 frame3. Model UI separates supported Live preference behavior from stored-only cloud/image settings and never implies catalog availability. Tool inspection no longer displays inert disabled switches. Logs start without fabricated readiness messages. Activity detail verification and remaining limits are recorded in IMPLEMENTATION.md.

New finding for subsequent work: WikiStore still seeds illustrative proposals/pages and trace counts as though recorded. Its proposal type lacks current/proposed content, so board04 proposal comparison cannot be truthfully implemented from existing data. This remains an unresolved source-truth gap, not verified agent knowledge.

1.0.60 final review corrected gallery lifecycle/error resets, neutralized legacy gallery colors, removed nested image-row buttons, and made cloud/image preferences read-only. Live catalog choices were checked against official Google documentation; saved unlisted identifiers are preserved.35 ordinary return paths, five root returns and three embedded Connections chains passed in the browser. Native acceptance remains blocked by secure keyguard. See IMPLEMENTATION.md for the seven existing test failures and final build artifact.


1.0.61: nested Voice/Audio/Connections readability pass retained while responsiveness became the priority. Phone Voice and keyboard inspection now has direct evidence. Hidden transcript view work was reduced; this does not complete every nested route. See IMPLEMENTATION.md for device identity, CPU sample method and remaining memory/ARTEMIS limits.

## Browser comparison checkpoint: 1.0.62

[Reference gallery](evidence/browser-comparison/index.html): External Services actions wrap at 320px and status no longer crushes service names. Add/Import forms open and return through Back at 320/412px. Submission and native keyboard behavior were not tested. Inline placement and repeated parent context remain follow-ups. Models and Voice captures are retained beside board09; this is not complete visual parity.

## Header and nested spacing checkpoint: 1.0.63

Agent's index header used space-between and pushed its title away from Back. Agent, Activity, Settings and Connections now share a leading header layout with a flexible title column. External Services Add/Import show one task at a time, hide the service list, and use the parent header's Back control with a form-specific destination. A draft still triggers the discard guard. Voice timing controls use two equal columns at narrow widths; Models no longer repeats its heading inside the panel. TypeScript and web export passed; new browser/native screenshots remain unverified because Orca's browser runtime closed during inspection and the phone is disconnected.
