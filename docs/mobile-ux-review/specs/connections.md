# Connections — canonical page specifications

Design proposal, not a claim of deployed functionality. Boards 05–06 illustrate these pages; the board 06 Jev frame is superseded by the Settings route in S09. Existing source entry points Agent/MCP, Settings/MCP and Telemetry/Streams all embed `delta-mobile/src/components/McpFeedsPanel.tsx`; consolidate them into one destination and keep contextual Back routes. `WhatsAppPanel.tsx` is an additional reference. Read the shared contract in `../README.md` before implementation.

## N01 — Connections home
- **Purpose/status:** proposed single index for existing scattered connection panels. Source has separate Host/External/Feeds sections; this information architecture is new.
- **Entry/exit:** full-screen hub → Connections; contextual links from Agent, Activity or Settings preserve their origin. Back returns to that origin, then the conversation hub; it never disconnects a service.
- **Hierarchy/actions:** title; Local server, External services, Event feeds and Relay rows with actual state and last check time. Optional cloud assistant is a Settings preference (S09), not a Connections destination. One Add service action routes N06. Details open only on deliberate tap.
- **State/data:** counts derive from configured records, not sample data. Loading skeleton; empty setup guidance; stale state explicitly dated. Local server and external provider status are independent. Failure to fetch status does not imply disconnected or healthy.
- **Acceptance:** every alias reaches the same configured records; Back preserves draft and active session. Screen-reader row combines name, status and action; status cannot rely on colour.

## N02 — Local server configuration
- **Purpose/status:** existing UI/native call path, unverified on-device; redesigned form is proposed. Do not infer enforcement from displayed configuration. Source: McpFeedsPanel Host section and its server hook.
- **Entry/exit:** N01 → Local server; Back returns N01 with unsaved-change choices. Starting/stopping is separate from saving configuration.
- **Hierarchy/actions:** measured server state first, host binding, port, authentication state, hosted tools link N13, Start/Stop. Explain network exposure before changing from loopback to a wider interface. Never silently start on mount.
- **State/data:** validate port and binding; starting/stopping busy state prevents duplicate request. Permission denial/native module missing are explicit unavailable states. Failure keeps last known configuration and offers retry. Mask tokens and exclude them from ordinary copy/export.
- **Acceptance:** running badge follows actual server response; rejected configuration cannot show Saved. Large-text fields wrap and scroll above keyboard; focused error is announced. Authentication choices must be limited to capabilities actually implemented.

## N03 — Client setup instructions
- **Purpose/status:** existing setup snippets, redesigned readable steps. Source: Host client-setup controls in McpFeedsPanel.
- **Entry/exit:** N02 → Connect a client; Back N02. Client selector changes only the displayed recipe.
- **Hierarchy/actions:** platform/transport selection, prerequisites, actual endpoint, Copy setup, connection-test instructions. Use `adb forward tcp:8080 tcp:8080` for a desktop client reaching a server on the phone; `adb reverse tcp:8081 tcp:8081` is the separate phone-to-PC Metro path. Show the direction in plain language.
- **State/data:** snippets use current binding/port and never reveal credentials by default. Stopped server displays Start server link; no attached USB device produces guidance, not a successful connection badge.
- **Acceptance:** copied text matches configured endpoint; clipboard failure is visible. Code can scroll horizontally independently; font scaling never hides the Copy control. No test network traffic without an explicit action.

## N04 — Request inspector
- **Purpose/status:** existing host request information; filtering/detail navigation proposed as required by actual event schema.
- **Entry/exit:** N02 → Requests; select request → detail in place; Back first closes detail.
- **Hierarchy/actions:** status/method filters, timestamped request rows, selected method/result/error, redacted arguments. Copy redacted details and explicit Clear local display.
- **State/data:** empty means no recorded requests, not no server activity ever. Expose buffer limits and dropped records where known. Stopped/unavailable server preserves inspectable past records with stale label. Refresh cannot fabricate rows.
- **Acceptance:** secrets and personal request content are not copied accidentally; failures retain context; refresh and clear have accessible names. No tool execution from this read-only inspector.

## N05 — External service list
- **Purpose/status:** existing external MCP management; compact row design proposed.
- **Entry/exit:** N01 → External services; add/edit N06, import N07, detail N08; Back N01.
- **Hierarchy/actions:** name, endpoint host, tested status/time, enable state if enforced; Add, Import, row actions. Save and Test remain separate.
- **State/data:** disconnected, disabled, not tested, testing, failed, authenticated must be distinct. Empty list invites explicit configuration. Offline local editing remains possible; save failure preserves the draft and does not claim persisted success.
- **Acceptance:** service identity stable across edits; deleting asks scope and does not remove local conversations. Switches must affect actual routing before they are exposed as functional. No fictitious provider integrations seeded into production.

## N06 — External service editor
- **Purpose/status:** existing name/URL/configuration controls; redesigned full-screen editor.
- **Entry/exit:** N05 Add/Edit. Save returns to N05 only on persistence success. Back with changes offers Keep editing / Discard / Save; never discards on swipe alone.
- **Hierarchy/actions:** name, supported transport, endpoint, masked credential, validation summary; Save and Test connection. Test requires explicit consent to contact the supplied endpoint.
- **State/data:** validate required values locally; keep transport/security restrictions aligned with backend. Test timeout, invalid credential, denied endpoint and malformed response get specific actionable messages. Never echo tokens or automatically downgrade transport.
- **Acceptance:** keyboard leaves current field and Save reachable, autofill does not expose secrets, reveal is deliberate and resets on exit. Failed test must not delete a valid saved configuration.

## N07 — Configuration import
- **Purpose/status:** existing JSON import path; preview-before-commit workflow proposed.
- **Entry/exit:** N05 Import → multiline draft → Validate → review → Import. Back from preview returns to draft; Cancel preserves existing services.
- **Hierarchy/actions:** format guidance, paste/edit field, Validate, named service preview with duplicates/conflicts, explicit Import. Validation does not contact endpoints or activate providers.
- **State/data:** syntax errors locate the problem; invalid fields list service name; secret values remain redacted in preview. Duplicate IDs require replace/skip decision. Failed persistence retains draft and reports partial results if atomic save is unavailable.
- **Acceptance:** no automatic overwrite/enable, no networking before deliberate testing. Screen-reader review includes each proposed change. Large JSON remains scrollable above keyboard.

## N08 — External service detail
- **Purpose/status:** existing selected service and discovered tool information; mobile detail route proposed.
- **Entry/exit:** N05 row → detail; Back N05. Edit N06, Remove confirmation, Test as explicit request.
- **Hierarchy/actions:** service identity, endpoint, status/time, discovered tools with descriptions/schema, last redacted error. Separate configuration from last successful test.
- **State/data:** empty tool list distinguishes never tested from successful empty response. Lost network marks stale discovered data. Failed authentication never shows connected merely because saved key exists.
- **Acceptance:** read-only schemas do not execute tools. Remove states downstream consequences; operation failures stay visible and retry does not run privileged tools.

## N09 — Event feeds
- **Purpose/status:** existing feed configuration and event display source path; connection reliability is unverified.
- **Entry/exit:** N01 → Event feeds; Back preserves draft/configuration, connection teardown follows explicit documented lifecycle.
- **Hierarchy/actions:** endpoint, masked auth if supported, Connect/Disconnect, connection state, timestamped redacted events, local Clear. No fake events while disconnected.
- **State/data:** idle/connecting/connected/reconnecting/failed are tied to actual transport events. Empty and disconnected are separate. Display bounded retention, pause-display only if implemented, and indicate stale events rather than erasing them.
- **Acceptance:** repeated Connect cannot create duplicate streams; background/foreground transition policy is tested before promising persistence. Screen readers announce state changes without reading every event unsolicited.

## N10 — Superseded Connections cloud concept
- **Purpose/status:** historical board 06 frame 4. It shows the optional TypeSafe/Jev control in Connections; the user's revised navigation places the functional destination at Settings S09 and the credential at Settings S02. Preserve this frame for provenance, not as an implementation route.
- **Entry/exit:** N01 has no cloud decision-provider row. Settings → Models is the current local Laya destination; Keys retains only active credentials.
- **Runtime boundary:** local Laya assists only ambiguous flashlight clarification when enabled. It does not classify every chat or execute tools. Missing models, timeout and inference errors preserve local clarification. See [S09](settings.md) and the mobile `docs/laya-integration.md` for the active source path.
- **Acceptance:** board 06 frame 4 remains historical art. Android navigation, model inference and provider behavior remain pending ARTEMIS verification.

## N11 — Relay configuration
- **Purpose/status:** existing UI includes a toast-only save path. Functional persistence/delivery is unavailable; new working integration is a future proposal.
- **Entry/exit:** N01 or Settings Relay alias; Back returns origin.
- **Hierarchy/actions:** unavailable explanation first; show future endpoint fields only as disabled reference, not as a working save form. Link Help; do not offer Send test until real authenticated delivery exists.
- **State/data:** no Saved/Connected/Delivered states inferred from a timer or toast. Future contract must define retries, deduplication, payload privacy, consent, redaction and persisted configuration.
- **Acceptance:** production user cannot mistake placeholder controls for working delivery. No promised release date. Status is accessible text, not grey styling alone.

## N12 — WhatsApp integration
- **Purpose/status:** current decorative QR, fake fallback number and delayed pairing success are unsupported. Proposed screen explicitly says pairing unavailable.
- **Entry/exit:** N11 or Connections → WhatsApp; Back returns origin without pairing side effects.
- **Hierarchy/actions:** 'Not connected'; 'Pairing is not available yet'; link explanation/Back. No QR, phone number, Pair button or paired badge without real service-backed state.
- **State/data:** future implementation requires genuine challenge expiry/revocation, clear account identity, message-data disclosure, explicit consent and disconnect. None is implied by this mockup.
- **Acceptance:** no simulated pairing, no future-release promise, local conversation remains usable. Screen-reader text explains why the action is unavailable.

## N13 — Hosted tool catalogue
- **Purpose/status:** existing Host list of exposed tools; consolidated detail page is proposed.
- **Entry/exit:** N02 → Hosted tools → schema detail; Back closes schema then returns server config.
- **Hierarchy/actions:** source and description per tool, actual capability/authorization state, parameters and output schema. No toggles until policy enforcement exists; no execution from a schema screen.
- **State/data:** unavailable native tools remain visible with reason, not enabled placeholders. Stale catalogue is marked. An empty capability response is not proof of no supported tools.
- **Acceptance:** service exposure and local tool authorization agree; schema text is selectable but excludes secrets. All backend errors are surfaced.

## Shared state and implementation gates
Every page requires loading, empty, invalid input, permission denied, native unavailable, offline, timeout, persistence failure and cancellation variants where applicable. Keep navigation usable if a provider fails. Native Android Back first closes keyboard, then nested sheet/detail, then parent destination; hub dismisses left, not a platform edge-back imitation. Test text scaling, focus restoration and 48dp controls. Do not author mobile automation from these mockup coordinates; explore the implemented path with ARTEMIS first.


## Navigation consistency update ? 2026-09-19

The user now prefers a leading mobile Back arrow throughout the flow. [The current navigation contract](../NAVIGATION.md) supersedes Close/X page exits and earlier back-to-Console shortcuts in this proposal. Details return to their feature index; roots return to the recorded caller. Other visual/layout proposals are not marked complete by this navigation increment.


### Submenu implementation checkpoint - 2026-09-19

See [the submenu review](../SUBMENU-REVIEW.md) for implemented corrections, actual browser coverage and remaining PNG differences. Source1.0.59/code115; proposal-only pages are not implicitly implemented by this checkpoint.

## Narrow-width checkpoint: 1.0.62

External Services actions wrap at 320px. Name and chevron share the first row; endpoint and status follow below. Add service and Import config use sentence case. Both forms were captured at 320/412px without submission. Inline forms need further focused-page review; not every N05?N08 state is complete.

## Focused Add/Import forms - 1.0.63

N06/N07 now use the same leading page header as other features. The header title names the form and its Back control returns to N05; the existing unsaved-draft confirmation still applies. The configured-service list and other action are hidden during form entry. This supersedes the inline-form layout noted in 1.0.62 evidence. Submission and native keyboard behavior remain unverified.
