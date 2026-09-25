# Implementation evidence and decisions

Status: active overhaul, not ready for final acceptance. Baseline mobile `4d986be` (1.0.53). Source changes are uncommitted while workers and MOM integrate them. See the [foundation](FOUNDATION.md) for dependency and naming contracts.

| Area | Source increment | Evidence / next gate |
| --- | --- | --- |
| Design system | `src/theme/design-tokens.json`, `src/design-system/`, legacy theme/button adapters | Typecheck and existing tests reported passing; independent review required motion, font, input, API-compatibility repairs; first repairs inspected. Native material unverified. |
| Conversations | App shell, session store/domain, drawer, composer and message rows | In progress. Review found draft hydration/flush, async affinity and migration hazards; owner must repair before acceptance. |
| Agent / Activity | Feature decomposition assigned | In progress; a failed initial worker launch was released, a later unstarted task was fenced and re-dispatched to its ready terminal. No completion claimed. |
| Settings / Connections | Feature screens and compatibility components assigned | In progress. Unsupported wake enrollment/pairing/webhook/currency controls must remain unavailable. |
| Help | `features/help/models/helpTopics.ts`, `features/help/screens/HelpScreen.tsx`, `components/GuideModal.tsx` | Implemented locally; typecheck passed after initial extraction. Android modal back handling corrected from official API contract. No device acceptance. |

## Decisions

- The existing framework has no router dependency. Do not add a navigation framework merely to replace tabs.
- The Expo new-project structure skill is a starting template, not the reason for this migration. The user explicitly requested restructuring; responsibilities and verified call sites determine moves.
- The existing theme is migrated into one canonical source with compatible import paths. Reference token JSON in this review is a design artifact, not a second runtime palette.
- Core React Native controls remain compatible with the installed development binary. Introducing `@expo/ui` is not necessary for this increment; changing native dependencies would require a separate build/verification boundary.
- Dedicated frames and shared visual patterns are distinguished in the sitemap. No claim that all 80 states have individual high-fidelity PNGs.
- Boards 03 and 10 revision 2 correct the blue toggle, identity guidance, settings reset scope and diagnostic readiness; revision 1 remains in `boards/history/`.

## Verification limits

ARTEMIS task `37e6f9b1-4c75-4ed3-93cd-bdff483d6c37` was cancelled after provider inference stalled with HTTP 402 exhausted credits. Phone `66110DLKX001YW` is authorized; screenshot/hierarchy observation works, but the planned interaction sequence did not execute. Do not author mobile tests from guessed paths or count existing Node tests as phone evidence. No new tests have been authored during this blocked exploration.

Remaining device acceptance: keyboard clearance, 320px/large-text layouts, gesture/back behavior, session/draft preservation and migration across restart, generation/cancellation/switching, reduced motion, voice lifecycle and optional-provider isolation. Record native and JS build identities before running these checks.

SDK hook contracts and hardware implementation are unchanged by the reference package. The system-guide impact is recorded in [the new chapter](../harness-review/mobile-ui-foundation.md); old missing guide chapters are not represented as current evidence.

## Browser recovery checkpoint ? 2026-09-19

The localhost:8081 development app was explored in an isolated Edge browser at 412 ? 915 via CDP. The conversation screen mounted and the navigation menu opened the full-screen conversation hub. The initial development bundle took 28.65 seconds to load; the initial document remained white before JavaScript mounted. This is a development resource timing, not a device performance benchmark.

Saved observations: [conversation](evidence/2026-09-19-web-conversation-412.png), [hub](evidence/2026-09-19-web-hub-412.png). These are implementation screenshots, not approved mockups. They expose remaining visual defects: crowded Nano/Live/Wake/Mute header, a stretched channel tile, old monospace labels, excessive card borders and a composer attachment icon that differs from the plus-menu reference. Visual parity is not passed.

The Antigravity repair dispatch reported individual provider quota exhaustion (approximately 73 hours to reset). Its task was fenced while retaining the existing terminal and changes; the available OpenCode worker owns the remaining Settings/Connections repair. No Gemini model identity is verified by that CLI receipt. Agent/Activity features are extracted into nested feature folders, but their navigator styling still needs a reference pass.

## USB reconnection and server binding � 2026-09-19

Pixel `66110DLKX001YW` reconnected in authorized `device` state. The development client initially reported an unexpected end of HTTP stream. Host investigation established that `expo start --localhost` was listening only on `::1`: IPv6 `/status` returned 200 while IPv4 `127.0.0.1` failed. The USB reverse tunnel needs a reachable IPv4 listener.

Restarted Metro with `REACT_NATIVE_PACKAGER_HOSTNAME=127.0.0.1` and `expo start --dev-client --host lan --port 8081`; IPv4 `/status` returned 200. Restored `adb -s 66110DLKX001YW reverse tcp:8081 tcp:8081` and opened the installed `com.pixelkit.sdk` development client. ARTEMIS hierarchy then observed the running conversation hub and existing sessions. This verifies reconnection and app loading only. The user is now driving the phone; automated interaction acceptance remains unverified.

The current browser conversation screen also mounted with the compact provider header and no runtime exceptions captured during that navigation. The dark HTML loading placeholder replaces the white pre-bundle document. The app source is version 1.0.54 / configured Android code 110; the installed development binary is still the older `com.pixelkit.sdk` build, not a newly installed binary. Do not conflate its identity with current app.json.

## Top safe-area correction � 2026-09-19

User feedback: content must clear the camera cutout and battery/status bar. ARTEMIS screenshot of the Agent screen on Pixel 66110DLKX001YW confirmed its title overlapped system status icons. AppShell now owns top inset + 8dp for every primary screen; ConversationHeader no longer applies the inset twice. ConversationHub uses its own modal inset + 8dp with explicit status-bar translucency. GuideModal already owns an inset and is unchanged. Source version 1.0.55 / configured Android code111. TypeScript passed. This spacing change implements the existing board intent; page IDs, sitemap hierarchy, PNG concepts, provider/hardware contracts, privacy and store-listing claims are unchanged.

## Composer clearance correction � 2026-09-19

User requested lifting the input after the top safe-area adjustment. ComposerBar now reserves the bottom device inset plus the small spacing token, raising the pill above the gesture area while preserving transparent surrounding chrome and shell-owned keyboard avoidance. Source 1.0.56 / configured Android code112. TypeScript passes. The phone was on the hub during read-only observation, so this increment does not claim a completed keyboard interaction check. The existing conversation PNG layout intent and sitemap hierarchy are unchanged; no provider, privacy or hardware contract changes.


### Implemented channel naming increment ? 2026-09-19

C01/C13 ? Create channel ? C15 name form ? Create channel. Existing custom channel row ? settings icon ? C15 Channel settings ? Save name. The field requires 1?80 characters after trimming. Back cancels the editor; save failures retain the name and show an error. All conversations is a fixed aggregate filter, not a user-renamable channel. Source: features/conversations/components/ChannelSettings.tsx and ConversationHub.tsx; state/conversations/sessionStore.ts returns the durable rename result. This supersedes earlier proposed-only descriptions specifically for channel naming; remaining management features are not implicitly implemented. Existing PNG boards remain visual references; this form is an implementation addition, not a newly approved PNG.

Source version1.0.57 / configured Android code113. TypeScript and four existing session-store tests pass; those tests use memory fallback and do not prove device durability. User retains phone control; native name-entry/keyboard acceptance is pending.

## Navigation consistency ? 2026-09-19

See [NAVIGATION.md](NAVIGATION.md) for parent map, shared controls, ownership and limits. Mobile1.0.58/configured code114. Both research agents completed read-only audits; both implementation workers completed their corrections and their existing terminals were retained. TypeScript passes. Five existing storage-dependent Node tests remain failing; no full-suite pass is claimed. SDK hook contracts, hardware behavior, privacy and provider routing are unchanged. Earlier boards are retained with the explicit Back-over-Close correction.

Final browser walkthrough passed 34 ordinary submenu return paths, five feature-to-hub returns, and three embedded Connections parent chains. Final integration corrected the Connections root label and Settings save/discard destination, preventing an unintended jump past its index. TypeScript passed after those corrections. Android hardware/gesture Back and edited-form acceptance remain unverified; the user retained control of the connected phone.

## Submenu review increment - 2026-09-19

Mobile1.0.59/configured Android code115. See [SUBMENU-REVIEW.md](SUBMENU-REVIEW.md) for all inspected submenus, ownership, corrections and remaining differences. Browser return walkthrough:34 ordinary details and all five feature roots passed; all three embedded Connections parent chains passed. A320px-wide layout scan found no document-level horizontal overflow. TypeScript passed. Android export passed before final integration; final export result is recorded below. Full verify has six failures:five known storage-dependent expectations plus obsolete boot-seed expectation. No test code was authored without ARTEMIS. ADB listed no attached devices, so native checks and benchmarks remain unverified.

Final integration checks: TypeScript and git diff --check passed. Android export completed (3017 modules; index-74a649752beab730fd05655023ecc8a7.hbc). External workers settled; no reclaimable workers remained. Final screenshot capture is checked separately and is not evidence until visually inspected.

Visually inspected final browser captures: [Assistant settings](evidence/2026-09-19-settings-assistant-412.png) and [Traces empty state](evidence/2026-09-19-activity-traces-412.png), both412x915. Assistant now uses the Delta orb and neutral readable form surface; model choices still share its page and need the separately planned model screen. Traces correctly shows no recorded events. These are implementation observations, not newly approved design PNGs.

## Models and Activity detail increment ? 2026-09-19

Mobile source 1.0.60 / configured Android code116. Assistant and Models are separate Settings destinations; model UI lives in sections/ModelsSection.tsx, the reusable radio group in components/ModelChoiceGroup.tsx, and the reviewed identifier data in models/modelCatalog.ts. Cloud reasoning and image preferences are read-only because their values are not consumed by the runtime. Unlisted saved voice IDs remain visible and unchanged. This does not implement board09's proposed local/cloud engine selector; that remains in conversation controls.

Official Google model/deprecation documentation removed the unsubstantiated gemini-3.8-flash-live-preview identifier and retired gemini-2.0-flash-live-001 from selectable choices. Existing saved values and defaults are not silently migrated. The stable gemini-3.8-live client migration is a separate protocol task, not verified by this presentation change. Sources and limits are recorded in the Settings spec.

Activity Logs has explicit copy buttons, time/severity/subsystem metadata, selectable messages and announced clipboard failures. LogStore no longer fabricates readiness events on construction. Errors shows recorded context with no invented retry/permission recovery. Images opens the shared archive inspector; preview failures preserve metadata, failure keys follow image URIs, opening resets old selection, and Back returns through archive to Activity. Gallery surfaces now use neutral theme tokens and actions meet48dp minimum. Tools shows inspectable schema controls rather than unsupported enable switches.

Verification: typecheck passed; Android export passed (3020 modules; index-e7e806f113928f1ecb15d2961b06aba8.hbc). Existing Node suite:174 tests,167 passed,7 failed. Five failures concern settings/persistence expectations; two still expect the removed fabricated log/trace boot seeds. No test-suite code was authored without ARTEMIS exploration. Full verify is not passed.

Browser exploration passed35 ordinary detail-to-index returns and five root-to-hub returns. Expanded set_torch schema rendered and collapsed without document overflow; this inspected its definition and did not execute hardware. Final implementation captures: [Models](evidence/2026-09-19-settings-models-412.png), [Logs](evidence/2026-09-19-activity-logs-412.png), [Tools](evidence/2026-09-19-agent-tools-412.png). These are412x915 browser observations, not approved replacement design boards or device acceptance.

Device66110DLKX001YW was authorized; installed com.pixelkit.sdk native1.3.0/code47 differs from configured source1.0.60/code116. ARTEMIS Pro trace46daf877-8bcd-4bec-af16-0ab51a45813b attempted a navigation-only scenario once, stopped at secure keyguard before app interaction, and failed after11.7s. That is automation elapsed time, not app performance. Native navigation, keyboard, image sharing and failure paths remain unverified. No phone data was changed. Trace artifacts remain under the sibling artemis/traces directory; personal lock-screen content is not copied into this guide.

Both scoped Orca workers settled and external terminals were retained. Root reviewed and corrected their remaining palette, gallery lifecycle, model contract and error-message issues. Internal research verified model IDs using official documentation. Wiki's illustrative seed data remains a known source-truth gap; cloud access and device/provider availability were not tested. Hardware/API, privacy and store-listing contracts are unchanged by this increment.

Final browser follow-up: all three embedded Connections return chains passed. The existing 320px scan covered34 ordinary details and five indexes with no document-level horizontal overflow; it does not include the new Models page. Switch visual bounds remain40x20 in the browser, so native expanded hit areas are not inferred from that scan. Models, Logs and Tools screenshots were visually inspected.

## Phone responsiveness and nested controls - 2026-09-20

Source1.0.61/code117, existing native com.pixelkit.sdk1.3.0/code47, Pixel66110DLKX001YW. User reported slow response while reviewing nested Settings. Before the performance change, one adb top thread sample showed mqt_v_js93.7%, RenderThread46.8%, process resident memory1.5GB; gfxinfo showed1851 attached views. These are short diagnostic samples, not calibrated tap latency measurements. The cumulative gfxinfo history and Choreographer messages from unrelated processes are not performance evidence for this increment.

Source review found historical assistant avatars each ran perpetual animation loops, Console rebuilt the entire transcript on unrelated hardware-hook updates, and its hidden transcript remained mounted behind the hub/settings. Historical avatars are now decorative/static; transcript data and rendered nodes are memoized; hidden presentation detaches while the existing voice/generation runtime remains mounted. Scroll offset/follow-latest state is retained for return to chat. No model routing or execution permission change.

After hot refresh in the same open hub, three thread samples returned JS0%,2.5%,3.5% and RenderThread0%; attached views184. With the conversation visible, samples were JS0%,6%,4.5%, RenderThread0%. First samples are instantaneous top output; following samples use2-second intervals. Resident memory remained high at1.9GB in the long-running development process: no memory improvement or leak fix is claimed. Cold-build and long-session profiling remain follow-ups.

Phone exploration: one successful hub -> Settings -> Voice path after the correction, Android Back returned Voice to Settings index (UIAutomator verified), then returned to hub and used its visible Back arrow to restore conversation. Focused the empty composer, typed Keyboard check without sending, verified text and send control above the keyboard, deleted exactly that inserted text and dismissed the keyboard. [Voice evidence](evidence/2026-09-20-phone-voice.png), [keyboard evidence](evidence/2026-09-20-phone-keyboard.png). No generation, microphone, provider or actuator action was tested.

ARTEMIS Pro trace d78f2c50-5e07-4c9a-83ea-9ed349e11149 could not plan: provider returned402 depleted credits and retries/fallback were cancelled. Its notes/checkpoints are not passing evidence. ARTEMIS live observations were supplemented with direct ADB screenshots/UIAutomator because the helper screenshot/hierarchy was observed lagging the actual UI. Direct device navigation was grounded in inspected screenshots; early navigation attempts before the correction were inconsistent and are not counted as successful repetitions. No test-suite code was authored from guessed interactions.

Nested UI work retained: Voice/Audio and Local/External Services/Feeds detail typography is enlarged; Voice selection chips meet48dp and expose radio semantics. Wake phrase copy is user-facing and its save now checks the persistence result, preserves failures and only reports success after a durable result. Wake settings stay embedded in Voice; dedicated enrollment route and unsaved-draft back guard remain open. Deeper Connections paths and wake save failure injection have not been device-verified. Existing board09 intent is retained; no new approval is inferred.

Hardware/API/provider contracts, privacy and store listing are unchanged. This checkpoint supersedes the previously blocked phone-only status for the specific observed navigation and keyboard scenarios above, not all device acceptance.

Final checks for1.0.61: TypeScript passed; Android export passed with3020 modules and index-63fba1c67e55b0b0b52b47f136f62b63.hbc. Existing suite174 tests:167 passed,7 failed in the same settings/persistence and fabricated-boot expectations recorded for1.0.60. Full verify remains failing. No code commits, pushes or release tags were made.

## Browser reference comparison ? 2026-09-20

Source 1.0.62 / Android code 118. User authorized browser work while the phone is unplugged. [Reference/before/after gallery](evidence/browser-comparison/index.html) preserves eight baseline and twelve final screenshots at 320 and 412 CSS pixels: hub, Models, Voice, External Services, plus final Add service and Import config forms. Boards 01, 05 and 09 remain the references; no new design approval is inferred.

Hub now places search and New conversation before channels/recent sessions, with destination navigation below. Near-black surfaces, static Delta orb and leading Back follow the reference hierarchy. External Services actions wrap; status sits below the name. Visual inspection caught a clipped baseline Import action despite no document overflow, so overflow metrics alone are insufficient.

Browser automation lives in delta-mobile/scripts/ui/capture-reference-review.cjs. Launching new Chrome was blocked by execution policy; the existing Chromium CDP session was used instead, without bypassing the launch restriction. An initial capture hit a navigation readiness race; the script was corrected and complete captures rerun. Final twelve screen/width pairs completed with no document overflow. Forms were opened, not submitted; network/persistence acceptance is not claimed.

TypeScript and whitespace checks passed. Android export passed: 3020 modules, index-afcbef71b93747a0ae0ab133f0482a62.hbc. Seven previously recorded unit failures remain unresolved; full verification is not green. Native keyboard, cold-build performance and new presentation changes remain unverified while unplugged. Add/Import forms still share their parent page; focused-page decomposition remains open. Sitemap destinations, hardware/API/provider protocols, privacy and store-listing contracts are unchanged.

## Nested page header and spacing correction - 2026-09-25

Delta Mobile source1.0.63/code119. Shared FeatureHeader now owns the title/Back alignment in Agent, Activity, Settings and Connections. External Services form state drives the Connections header and Back label, retaining the existing draft guard. Add/Import hide unrelated list content; Voice timing chips use a two-column layout and Models no longer repeats the page title. Board05/09 and the saved 1.0.62 browser captures remain comparison references, not current-state screenshots. Sitemap destinations and page IDs are unchanged.

TypeScript passed. Web export passed with 2,688 modules and index-07eafcc6baa2a9e9b13f2bab5057b557.js. The local dev server returned HTTP200. Orca's embedded browser tab was created but snapshot failed with runtime_unavailable, so rendered placement was not visually accepted in this increment. Phone is not connected; native safe-area, keyboard and touch acceptance remain pending. The existing suite ran 174 tests: 167 passed, 7 failed in the same settings/persistence, fabricated boot-log/trace and WhatsApp expectations recorded earlier. Hardware/API/provider/privacy contracts are unchanged.

Follow-up browser inspection recovered the embedded tab. The [roster capture](evidence/2026-09-25/agent-roster.png) confirms separated specialist cards, a readable introduction and no redundant disabled action on the active assistant. The [hub capture](evidence/2026-09-25/conversations-hub.png) confirms one inline Channels destination above recent conversations. Browser snapshots verified the empty console has only the Delta orb and main heading, and verified the Back path into Channels index and channel chat detail. A temporary Metro transform error occurred during the multi-edit HMR window; reload after the completed source change cleared it. These browser observations do not verify 320dp, native keyboard, or on-device touch behavior.

Channel detail lists its existing direct chats and can create a new chat scoped to that channel. Group chats are visibly marked as unavailable because the current session and turn contracts have no participants/agent attribution and the Console runtime produces one unscoped model response. The requested multi-agent group flow remains open work; source and sitemap distinguish its proposal from implemented chat navigation. Channel-specific name editing retains its save/discard guard. ConversationHeader now paints a solid background over the transcript. The SDK contract, hardware/API behavior, provider routing and privacy statements are unchanged.

Final static checks for this increment: mobile TypeScript and web export passed (2,688 modules; index-9ade878268315f6c8a78ae11fc73301c.js). The existing Node suite still fails seven checks in the previously recorded settings/persistence, synthetic boot-state and WhatsApp expectations; a full test pass is not claimed. The offline board gallery rebuilt and validated 81 page/state IDs, 10 original PNG boards and 60 frame mappings. No mobile test code was added because an ARTEMIS device exploration was unavailable.
