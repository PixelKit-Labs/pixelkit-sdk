# Delta mobile conversation surfaces

Design review specification for the mobile conversation shell. This is a design document, not an implementation plan that authorizes runtime edits.

## Implementation checkpoint — 2026-09-25

Delta Mobile 1.0.63 now renders a single-line Channels destination in Conversations. It opens a dedicated Channels index with a leading Back button, a channel count and Create channel actions. Selecting a channel opens its Chats detail; New chat persists the selected channel ID, and channel settings opens a separate name editor. Back returns detail → index → Conversations → active chat. The conversation header has an opaque background. The empty console retains the Delta orb and primary welcome heading, without the former suggestion buttons or secondary line.

Group chats and agent membership are still a **proposed runtime feature**, even though the channel detail reserves a Group chats section. Sessions have one channel ID but no participant IDs or chat kind; model turns have no agent attribution. The current submission path emits one response and does not use the selected roster entry for routing. The UI explicitly states that multi-agent replies are unavailable. Implementing group chats requires a persisted per-chat participant contract, turn attribution, a response policy and verified agent-specific execution. A label or multiple avatars alone must not imply collaboration.

[Rendered hub evidence](../evidence/2026-09-25/conversations-hub.png) is a 693×1001 browser capture; board 01 remains the design reference rather than a current-state screenshot. Native phone acceptance remains unverified. The original page-family specifications below retain proposed states and historical source references; this checkpoint is authoritative for current implementation status.

### Message-thread refinement — source 1.0.64

User messages render as compact, right-aligned neutral bubbles with icon-only Copy and Edit actions beneath them. Assistant replies remain open on the page, led by the Delta orb and speaker, with Regenerate, Copy and optional Speak actions beneath the text. There are no thumbs-up/down controls. All icon targets are 48dp. The [thread](../evidence/2026-09-25/thread-user.png) and [inline editor](../evidence/2026-09-25/thread-edit.png) browser captures show the user row and opaque header; web cannot load PixelNano, so they do not show a generated assistant reply.

Edit opens an inline editor. Update generates a new model-only response from the transcript prefix; only after that response succeeds does the store atomically replace the edited user turn and all later plain-text turns with the edited turn and new reply. A generation or persistence failure retains the original thread and editor text. Editing is unavailable when the affected suffix contains tool/media/card turns, a submission is busy, or Live owns the transcript. Regenerate appears only for the final plain Nano model reply after a plain user turn. It calls the model directly with transcript context excluding the old answer, never re-enters DeltaAgent or repeats tools, and stores alternative response versions with previous/next controls. Native Nano success and model quality are unverified.

This interaction follows the documented Gemini behavior: [editing a prompt regenerates its response](https://support.google.com/gemini/answer/13275745), and [Regenerate applies to the latest response with version navigation](https://support.google.com/gemini/answer/14262426). Delta narrows availability further when replaying a tool or media outcome would misrepresent what actually happened.

## Direction and evidence

- **Approved visual direction:** a spacious Gemini-like composer; grouped, unboxed Discord-like messages with avatar/sender/time; compact session previews; no bottom tabs; no blue backgrounds; retain Delta's glossy orb/reactor rather than a Gemini star. The mobile adaptation may use pearl/pink/violet highlights on the authentic spherical orb; this does not assert a provider or hardware capability.
- **Accepted direction, not implemented:** topic channels and full-screen hub navigation. Channel membership, sorting, pinning, search and persistence details remain proposed for validation.
- **Current mobile evidence:** `delta-mobile/App.tsx` mounts Console, Agent, Telemetry, and Settings behind a bottom tab bar; `src/screens/ConsoleScreen.tsx` owns the transcript, composer, gallery/camera modals, confirmation bar, and session drawer; `src/components/SessionDrawer.tsx` is a bottom sheet with search, create, select, export, and delete; `src/core/sessionStore.ts` persists sessions and turns only; `src/core/deltaState.ts` carries engine, listening, confirmation-adjacent and drawer state.
- **Desktop reference:** `Delta/web/src/App.tsx`, `web/src/components/panels/command-bar.tsx`, and transcript/status/control panels establish the full-height shell, authentic reactor, and page-level navigation. `Delta/web/DESIGN.md` is evidence for material/type/layout principles, not proof that mobile already implements them.

## Sitemap mockup (design inventory)

```text
C01 Conversation hub (proposed full-screen)
├─ C13 Topic channel hub (proposed)
│  └─ C14 Channel detail / sessions (proposed)
├─ C12 Conversation search (current title+turn filter; proposed full-screen)
├─ C10 Session hub sheet (existing transitional surface)
│  ├─ C11 Session detail / management (proposed)
│  └─ C15 Session/channel management (proposed)
└─ C02 Active conversation (existing partial)
   ├─ C03 Composer and draft (existing partial)
   │  ├─ C07 Media attachment unavailable (existing partial)
   │  └─ C09 Camera capture (existing)
   ├─ C04 Voice listening / speech partial (existing partial)
   ├─ C05 Generating / thinking / speaking (existing partial)
   ├─ C06 Confirmation barrier (existing)
   ├─ C08 Image gallery (existing)
   └─ C16 Recovery / unavailable conversation (proposed state family)
```

## Shared contract for every surface

- **Persistence:** conversation truth is currently `SessionStore` (`SessionRecord`, `DialogueTurn`, active session, turns, timestamps); attachments are URI/base64 fields on turns; drafts are local component state and are not currently persisted. Proposed channel/session metadata must not be presented as implemented.
- **Unavailable means unavailable:** Nano, Live, speech, image analysis, camera, MCP, network, and hardware states must render their actual unavailable/error state. Never turn a missing provider, permission, device, or credential into a success state.
- **Back behavior:** a modal/sheet closes before its parent; a full-screen hub uses X, swipe-left, Android Back, and menu/edge-swipe re-entry. Selecting a session closes the hub and returns to that session; unsent drafts remain only if the eventual persistence policy is accepted.
- **Accessibility baseline:** every action has a name and role; selected/disabled/busy states are exposed; message groups have a readable order (avatar, sender, time, content, actions); touch targets are at least 48dp; keyboard focus follows the same order and Escape/Back closes transient surfaces.

## C01 — Conversation hub

- **Purpose / status:** Proposed full-screen entry hub replacing the current bottom-tab-first shell. It gives the user a calm start point for channels, compact recent-session previews, search, and New conversation.
- **Sources:** `delta-mobile/App.tsx:70-273`; `ConsoleScreen.tsx:978-1026`; `SessionDrawer.tsx:131-305`; `sessionStore.ts:31-40,151-177`; desktop `App.tsx:87-186`.
- **Entry / exit / back:** Enter from the Delta wordmark/menu or an edge swipe from the conversation; X, Android Back, or swipe-left returns to the active conversation. Selecting a preview opens C02 and closes the hub; its overflow opens C11 management. A channel row opens C13.
- **Hierarchy / controls / actions:** top bar with Delta wordmark, title “Conversations”, search, and New; optional channel list above compact session previews; each preview shows title, last sender/time, unread or active state, and one overflow menu. No bottom tabs.
- **Data / draft rules:** read `SessionStore.getSessions()` and active ID; current sessions are flat and must be grouped under a proposed default channel only in presentation. Do not claim channel persistence. New creates the existing blank session; hub search is proposed global search.
- **States:** loading—skeleton rows while storage loads; empty—“Start a conversation” with New; offline—local sessions remain readable and provider badge says unavailable; permission—only relevant when starting voice/media; error—storage read failure with retry and no fabricated sessions.
- **Accessibility / keyboard:** heading level/name; search labelled; list semantics with selected active session; menu buttons announce session title and action; focus returns to the opener; Back/Escape closes.
- **Acceptance criteria:** no bottom navigation; full-screen surface fits narrow portrait; active session is obvious without blue fill; selecting a session deterministically returns to C02; no channel claims appear as persisted facts.
- **Validation questions:** Is the default “All conversations” channel accepted? Should hub search include message text or titles only? Is edge-swipe reserved for this hub on every screen?

## C02 — Active conversation

- **Purpose / status:** Existing, partial redesign target. The current `ConsoleScreen` renders a scrollable transcript plus subheader and `ComposerBar`; this spec changes presentation, not routing/business logic.
- **Sources:** `ConsoleScreen.tsx:978-1222`; `ConversationTurn.tsx`; `ComposerBar.tsx`; `SessionStore.addTurn`; desktop `TranscriptPanel` usage in `Delta/web/src/App.tsx:161-183`.
- **Entry / exit / back:** Enter from C01 selection, New, notification/deep link, or the existing Console route. Menu opens C01; Android Back first dismisses keyboard/transient UI, then C01 only when the conversation was entered from the hub.
- **Hierarchy / controls / actions:** compact header with channel/session title and menu; grouped unboxed turns; avatar/sender/time line; content and optional card/media; copy/speak actions secondary; composer fixed at bottom with generous breathing room. The glossy orb is the sole hero state readout, not a star.
- **Data / draft rules:** render active `SessionStore` turns; user/model roles remain factual; generated cards, tool results, thoughts, timing, and media remain attached to their turn. Existing text draft is local; attachment is local until a successful send, and current code explicitly rejects image chat with an unavailable alert.
- **States:** loading—conversation skeleton; empty—welcome plus example prompts that do not imply execution; offline—show local transcript and disable provider send with truthful reason; permission—voice/media request only on explicit action; error—inline turn/action error with retry where supported; generating/listening—live partials remain distinct from committed turns.
- **Accessibility / keyboard:** transcript is a labelled reading region; each group has sender/time; jump-to-latest is a named button; composer input has send/voice labels; keyboard submit sends only when content exists; focus remains in composer while suggestions are open.
- **Acceptance criteria:** grouped messages have no card chrome; sender/time/avatar are visible; long content wraps; composer never obscures the last turn; no blue background; unavailable image chat is not presented as sent.
- **Validation questions:** Should the orb be always visible in the conversation header or collapse while scrolling? What is the exact visual avatar for Delta versus the user?

## C03 — Composer and draft

- **Purpose / status:** Existing `ComposerBar`, with proposed spacious layout and draft affordances.
- **Sources:** `ComposerBar.tsx:11-75`; `ConsoleScreen.tsx:907-937,1179-1222`; current attachment handling at `1180-1207`.
- **Entry / exit / back:** Always present in C02; keyboard opens on focus; slash suggestions open from `/`; keyboard Back dismisses keyboard/suggestions before leaving. Attachment preview dismisses via remove.
- **Hierarchy / controls / actions:** multiline text field first; send as the affirmative action; voice, attach, camera, and remove are named icon controls; slash suggestions are a horizontally scrollable secondary list; no decorative blue fill.
- **Data / draft rules:** current `textInput` and `attachedImage` are in-memory. Preserve draft on transient hub open/close only if accepted; never silently persist sensitive attachment bytes. Send clears the draft only after the existing send path accepts it; rejected image chat keeps draft/attachment and explains unavailability.
- **States:** loading—normal; empty—placeholder with assistant name; offline—send disabled or queues only if a queue policy is accepted; permission—camera/mic permission prompt after explicit action; error—retain text and attachment with retry/removal; busy—disable send while Nano generates but keep readable draft.
- **Accessibility / keyboard:** input role/text label; IME action is Send; voice announces “Start voice input” versus “Stop listening”; attach/camera/remove labels include target; suggestions are selectable list items; target bounds ≥48dp.
- **Acceptance criteria:** field grows without covering controls; controls do not overlap at narrow width; voice label reflects listening; draft is not lost on an unavailable image attempt; keyboard navigation reaches send then media controls predictably.
- **Validation questions:** Is draft persistence across process death required? Are image bytes allowed to remain in memory after a failed send?

## C04 — Voice listening / speech partial

- **Purpose / status:** Existing partial state in `ConsoleScreen` (`speechAI.isListening`, `streamingPartial`, VAD); needs a dedicated readable state treatment.
- **Sources:** `ConsoleScreen.tsx:699-754,756-830,1058-1071`; `App.tsx:184-233`; `deltaState.ts:25-29`.
- **Entry / exit / back:** Start from composer voice or header Wake; stop/commit from same control, interruption, silence VAD, or Back. Back must stop only if policy explicitly treats it as cancel; otherwise first confirm the unsent transcript behavior.
- **Hierarchy / controls / actions:** prominent listening status and truthful mic availability; live partial transcript; stop/commit; mute state; optional orb reactor animation. Do not imply speech recognition success before a transcript exists.
- **Data / draft rules:** partial speech is ephemeral (`DeltaState.speechPartial`/hook state); commit creates a user turn through existing processing; canceled partial is not persisted unless accepted as a draft.
- **States:** loading—requesting recognizer; empty—“Listening…” with no transcript; offline/unavailable—source unavailable and text composer remains; permission—system mic request with retry; error—recognizer error and preserved typed draft; busy—VAD countdown if real, not invented.
- **Accessibility / keyboard:** announce state changes politely; stop button has explicit label; mute is a separate toggle; no color-only listening indication; hardware Back follows the documented cancel/commit rule.
- **Acceptance criteria:** user can always tell listening, partial, committed, unavailable, and muted apart; no provider success is fabricated; stop target remains reachable above keyboard.
- **Validation questions:** Does Android Back cancel listening or commit the partial? Should VAD countdown be visible or auditory only?

## C05 — Generating / thinking / speaking

- **Purpose / status:** Existing partial streaming and thought cards; spec separates ephemeral generation from committed transcript.
- **Sources:** `ConsoleScreen.tsx:386-411,430-435,477-510,1073-1091`; `ConversationTurn.tsx`; desktop mode/reactor comments in `Delta/web/DESIGN.md`.
- **Entry / exit / back:** Enter after a real send; exit on model commit, direct response, error, interrupt, or provider disconnect. Back may stop/interrupt only where the engine exposes a real operation.
- **Hierarchy / controls / actions:** orb/reactor state first; streaming text second; optional “thoughts” disclosure third; stop/interrupt and scroll-to-latest controls. Tool results remain separate and carry verified/error fields.
- **Data / draft rules:** partial is not persisted as a committed turn; final model turn is persisted with timing/cards/thoughts as currently done; interrupted output must be marked incomplete or discarded by existing engine semantics.
- **States:** loading—initial model/provider setup; empty—not applicable; offline—stop and explain provider unavailable; permission—none unless a paired voice action is invoked; error—inline provider error with retry that does not duplicate a turn; busy—disable duplicate send.
- **Accessibility / keyboard:** live region for status, not every token; expandable thoughts has state; interrupt button named; focus does not jump while streaming; latest button is reachable.
- **Acceptance criteria:** no generated text is mistaken for final text; thinking is optional and dismissible; errors are visible in the conversation; no fabricated latency/tokens/provider confidence.
- **Validation questions:** Is thought disclosure enabled by default on mobile? What is the supported interrupt behavior for Nano versus Live?

## C06 — Confirmation barrier

- **Purpose / status:** Existing `ConfirmBar` and `confirmationGate`; design must make human authorization unmistakable.
- **Sources:** `ConsoleScreen.tsx:512-571,629-637,1139-1144`; `src/components/ConfirmBar.tsx`; `src/core/confirmation.ts`; desktop `awaitingConfirmation` wiring in `Delta/web/src/App.tsx:173-183`.
- **Entry / exit / back:** Opens when a real gated action is pending; Confirm executes the fingerprinted action; Cancel clears it; Back must leave the barrier visible or explicitly cancel with a second step—never execute.
- **Hierarchy / controls / actions:** amber human-action banner, exact action summary, confirm, cancel, and optional spoken phrase guidance. Do not use amber for generic warnings in this surface.
- **Data / draft rules:** pending action lives in confirmation gate, not the transcript; confirmation uses the fingerprint; result is recorded only after successful execution; cancellation logs cancellation without claiming execution.
- **States:** loading—confirm action in progress; empty—surface absent; offline—cannot execute and keeps pending/error truthful; permission—tool-specific; error—failed confirmation/action with retry/cancel; busy—buttons disabled with progress.
- **Accessibility / keyboard:** modal/dialog semantics where blocking; focus enters summary then Cancel/Confirm with Cancel first; announce destructive scope and no implicit default; Back/Escape cancels only if policy accepts it.
- **Acceptance criteria:** no gated action runs from navigation, voice ambiguity, or accidental tap; result/error is visible; confirmation phrase and UI action agree.
- **Validation questions:** Is Back a cancel shortcut? Which actions require a second confirmation after a long delay?

## C07 — Media attachment unavailable state

- **Purpose / status:** Existing partial attachment preview; current code intentionally refuses image chat in `handleSendPrompt`.
- **Sources:** `ConsoleScreen.tsx:858-905,911-917,1179-1207`; `ComposerBar.tsx`; `CameraViewfinderModal.tsx`.
- **Entry / exit / back:** Attach opens picker; camera opens C09; remove returns to C03; send with attachment opens truthful unavailable alert and preserves the draft.
- **Hierarchy / controls / actions:** thumbnail, filename, remove; clear notice that attachment can be selected but this build cannot send images in chat. Never label local preview as model vision success.
- **Data / draft rules:** attachment URI/base64 stays local transient state; only a successful supported send may write image fields to a turn. Remove releases it; failed send keeps it until user removes it.
- **States:** loading—picker/camera pending; empty—no attachment; offline—preview remains but send unavailable; permission—camera/photo permission; error—picker failure with retry; busy—disable conflicting actions during capture.
- **Accessibility / keyboard:** image has meaningful label only if filename/known context; remove announces attachment name; unavailable alert is read; target ≥48dp.
- **Acceptance criteria:** user cannot mistake preview for uploaded/sent media; no bytes disappear unexpectedly; camera/picker failures are recoverable.
- **Validation questions:** Should unsupported attachments be blocked at selection or retained for a future-capable provider?

## C08 — Image gallery

- **Purpose / status:** Existing modal route from the Console “IMAGES” action; exact archive capabilities require source review before expanding.
- **Sources:** `ConsoleScreen.tsx:1002-1014,1239-1243`; `src/components/ImageGalleryModal.tsx`; `src/core` image stores found by that component.
- **Entry / exit / back:** Open from C02 subheader; close X, backdrop, Android Back, or swipe down. Selecting an image must not imply it can be sent if C07 says otherwise.
- **Hierarchy / controls / actions:** title, filter/search if supported by actual store, image grid/list, detail preview, close; destructive/delete only if backed by a real action.
- **Data / draft rules:** read the existing gallery store; no new persistence contract in this spec. Selection is local until an accepted attachment/send workflow exists.
- **States:** loading—archive read; empty—no generated/captured images; offline—local archive readable; permission—media-library only when actual action needs it; error—read/delete error with retry.
- **Accessibility / keyboard:** modal label, grid item labels, selected state, zoom/close labels, focus trap and return focus; Back closes detail before modal.
- **Acceptance criteria:** archive distinguishes captured/generated/unavailable metadata; no nonexistent image generation or vision result is shown.
- **Validation questions:** Is gallery part of conversations, a global library, or both? Which images are safe to retain?

## C09 — Camera capture

- **Purpose / status:** Existing `CameraViewfinderModal`; capture is a real device/permission flow, not a guaranteed provider path.
- **Sources:** `ConsoleScreen.tsx:887-900,1245-1250`; `CameraViewfinderModal.tsx`; `src/core` camera usage.
- **Entry / exit / back:** C03 camera opens; X/Back cancels; capture returns an attachment to C07/C03; permission denial remains in modal with retry.
- **Hierarchy / controls / actions:** permission/status, viewfinder, capture, flip, torch if actual hook available, close. No blue camera background treatment.
- **Data / draft rules:** captured URI/name/base64 is transient until supported send; preserve on return; do not claim OCR/vision unless a real module returns a result.
- **States:** loading—camera startup; empty—viewfinder unavailable; offline—capture may still be local if permission/device works; permission—request/denied; error—camera failure; busy—capture processing.
- **Accessibility / keyboard:** labelled controls, camera preview description, focus order, Back cancellation, no hidden permission loop.
- **Acceptance criteria:** capture result is visible in composer; denial has a clear route back; no device success is inferred in a simulator/offline review.
- **Validation questions:** Is flip/torch required for first mobile release or deferred?

## C10 — Session hub sheet (legacy)

- **Purpose / status:** Existing `SessionDrawer` bottom sheet, catalogued as transitional legacy while C01 becomes the full-screen hub.
- **Sources:** `SessionDrawer.tsx:131-305,312-512`; `ConsoleScreen.tsx:1224-1237`; `sessionStore.ts:151-220`.
- **Entry / exit / back:** Open Sessions button/central drawer state; backdrop, X, swipe down, Android Back close; select calls `switchSession`, callback, close.
- **Hierarchy / controls / actions:** handle, SESSIONS/count, close, New Conversation, search, list previews, export/share, delete. Current previews show title, turn count, relative date, ACTIVE pill.
- **Data / draft rules:** search currently matches title and turn content in memory; delete always leaves one empty session; export uses Markdown; no channel grouping/pinning exists.
- **States:** loading—currently subscription starts immediately but no explicit skeleton; empty—“No recorded sessions yet”; offline—local list works; permission—share/media as needed; error—export fallback clipboard, delete/switch errors need visible treatment.
- **Accessibility / keyboard:** modal onRequestClose; named close/backdrop/session/action controls; search label; nested export/delete controls must not accidentally select; current icon targets are below the 48dp target and need design correction.
- **Acceptance criteria:** preserve current data semantics while migrating; distinguish row select from row actions; legacy sheet is not the final hub.
- **Validation questions:** Does C10 remain as a compact quick switcher after C01 ships, or is it retired?

## C11 — Session detail

- **Purpose / status:** Proposed detail view for one session, useful for title, channel membership, metadata, export, and management without cluttering C02.
- **Sources:** Proposed from `SessionRecord` fields in `sessionStore.ts:31-37`; current export/delete in `SessionDrawer.tsx:86-114,270-299`.
- **Entry / exit / back:** Open from a session overflow or long-press; Back/X returns to C01 or C02 origin; “Open conversation” returns to C02 and selects the ID.
- **Hierarchy / controls / actions:** title/date/turn count; channel label; recent turn preview; Open, Rename, Move channel (proposed), Export, Delete with confirmation. Actions must not imply channel support until accepted.
- **Data / draft rules:** rename can map to existing `renameSession`; channel membership is proposed; export reads current turns; delete follows current “keep one session” rule.
- **States:** loading—session lookup; empty—session exists with zero turns; offline—local detail available; permission—share only when export; error—missing/deleted session returns to hub with explanation.
- **Accessibility / keyboard:** labelled heading, menu actions, destructive confirmation, focus return, editable title validation.
- **Acceptance criteria:** no hidden destructive action; opening a session has one predictable route; proposed channel fields are visibly labelled as not yet accepted in product review.
- **Validation questions:** Is detail a page, sheet, or context menu? Is rename mobile-owned or shared with desktop?

## C12 — Conversation search

- **Purpose / status:** Existing title/content filter in C10; proposed full-screen cross-channel search result page.
- **Sources:** `SessionDrawer.tsx:61-68,188-211`; `SessionRecord.turns`; proposed channels.
- **Entry / exit / back:** Open from C01 search; query updates results; select result opens C02 at session (and proposed turn anchor); Back/X returns hub; clear keeps page.
- **Hierarchy / controls / actions:** search field, scope/filter chips (All, channel, date, sender), result groups by session/channel, matched snippet, timestamp, clear.
- **Data / draft rules:** current search is local and case-insensitive over title/content; cross-channel and indexing are proposed; no cloud search or provider implication.
- **States:** loading—indexing only if an actual index is built; empty—no query vs no matches differ; offline—local search works; permission—not applicable; error—index/storage read error with retry.
- **Accessibility / keyboard:** search autofocus, result list semantics, match context read in order, clear named, Escape returns hub.
- **Acceptance criteria:** results identify exact session and timestamp; no fabricated relevance score; search works with zero channels under current flat store.
- **Validation questions:** Is search restricted to local persisted text? Should attachments/tool results be searchable?

## C13 — Topic channel hub

- **Purpose / status:** Proposed topic-channel container for sessions; accepted as a design direction; schema details remain proposed and are not implemented.
- **Sources:** No current channel type in `sessionStore.ts`; current flat list in `SessionDrawer.tsx`; desktop agent/tool separation is conceptual evidence only.
- **Entry / exit / back:** C01 channel section opens; channel select opens C14; Back returns C01; create/edit channel opens C15.
- **Hierarchy / controls / actions:** channel name, icon/color token (not blue background), session count, last activity, unread/active marker; New channel and overflow management are proposed.
- **Data / draft rules:** requires accepted schema (`ChannelRecord`, membership, ordering, archive/pin); until then render only an “All conversations” virtual grouping in design mocks, not persisted behavior.
- **States:** loading—channel migration; empty—no channels with explanation; offline—cached local channels only; permission—not applicable; error—migration/read error with rollback-safe retry.
- **Accessibility / keyboard:** list/grid labels include channel and count; selected state; create form validation; keyboard reorder only if accepted.
- **Acceptance criteria:** channel does not imply provider routing; every session remains reachable; migration cannot delete flat sessions.
- **Validation questions:** Are channels personal-only, shared, or provider-backed? Is a session allowed in more than one channel?

## C14 — Channel detail with sessions

- **Purpose / status:** Proposed channel-scoped session list and launch surface.
- **Sources:** Proposed over `SessionRecord`; current compact previews from `SessionDrawer.tsx:236-303`.
- **Entry / exit / back:** C13 select; Back returns C13; select session opens C02; overflow opens C11/C15.
- **Hierarchy / controls / actions:** channel header/description, New conversation in channel, search within channel, compact previews, sort/filter, channel menu.
- **Data / draft rules:** membership and channel title are proposed; creating a session may assign channel only after schema acceptance; active session remains global in current store.
- **States:** loading—membership read; empty—new-session CTA; offline—cached sessions; permission—not applicable; error—channel missing/read failure with hub fallback.
- **Accessibility / keyboard:** heading, breadcrumbs/back, list item labels, menu focus and target size.
- **Acceptance criteria:** session selection preserves channel context; no accidental movement/delete from row tap; channel empty state is actionable.
- **Validation questions:** Should channel detail show unread counts, last sender, or only last activity?

## C15 — Session/channel management

- **Purpose / status:** Proposed management flows for rename, archive/delete, move, pin, and channel create/edit.
- **Sources:** Existing rename/delete API (`sessionStore.ts:181-220`), export (`245-283`), current delete controls (`SessionDrawer.tsx:270-299`); pin/move/archive are not present.
- **Entry / exit / back:** Open from overflow; nested confirmation returns to management; save returns prior page; Back cancels unsaved form without destructive action.
- **Hierarchy / controls / actions:** title editor; channel picker; proposed pin/archive; export; delete confirmation naming exact session/channel and consequence.
- **Data / draft rules:** current rename/delete/export can be wired; proposed operations require schema and migration; unsaved names are local until Save; drafts never overwrite turns.
- **States:** loading—save/delete; empty—no destination channels; offline—local mutations may work only with actual storage; permission—share; error—retain form and report operation failure.
- **Accessibility / keyboard:** form labels, validation, destructive dialog focus on Cancel, no gesture-only delete, announce success/failure.
- **Acceptance criteria:** destructive actions require explicit confirmation; current “always keep one session” rule remains visible; proposed actions cannot be mistaken for current capability.
- **Validation questions:** Archive semantics and retention? Is pin per channel or global?

## C16 — Recovery / unavailable conversation

- **Purpose / status:** Proposed unified state for local storage failure, provider unavailable, permission denial, and partial send.
- **Sources:** `App.tsx:34-68` error boundary; `ConsoleScreen.tsx:911-917,930-935`; `SessionStore.load`; existing hook source/error contracts.
- **Entry / exit / back:** Appears inline or as blocking recovery only for actual failure; Retry repeats a safe read/action; Back returns to local hub without discarding data.
- **Hierarchy / controls / actions:** what failed, what remains available locally, Retry, Save/copy draft if supported, Settings/permission route where real.
- **Data / draft rules:** preserve local sessions and draft; never fabricate a sent turn; mark an attempted operation failed with error if persisted by existing contract.
- **States:** loading, empty, offline, permission denied, provider unavailable, storage error are separate labels, not one generic “offline”.
- **Accessibility / keyboard:** `role=alert` only for urgent failures; actionable retry; focus moves once and returns; errors readable without color.
- **Acceptance criteria:** every failure tells the user whether transcript, draft, provider, or permission is affected; no silent loss or false success.
- **Validation questions:** Which recovery actions are safe to persist across restarts? Should a failed send be retryable from the turn itself?

## Legacy / inaccessible catalogue

- **Bottom-tab shell:** `App.tsx:249-273` exposes Console/Agent/Telemetry/Settings as bottom tabs. It conflicts with the approved no-bottom-tabs direction; retain only as a migration/reference state.
- **Bottom-sheet-only sessions:** `SessionDrawer.tsx:131-328` is compact and useful but cannot express full hub/channel/detail requirements; its below-48dp icon targets and nested row controls need replacement.
- **Boxed conversation bubbles:** `ConversationTurn.tsx:49-60` uses role-specific bordered bubbles and max widths; catalogue as legacy visual treatment, not the approved grouped unboxed message design.
- **Blue/cyan surface assumptions:** existing primary/container tokens are implementation evidence, not permission for blue backgrounds; approved mocks must use the dark field and pearl/pink/violet orb adaptation.
- **Unlabelled or underspecified legacy controls:** several Agent/Console `Pressable` and `Switch` controls lack complete role/label/state exposure; this review records the gap but does not edit runtime code.


### Implemented channel naming increment ? 2026-09-19

C01/C13 ? Create channel ? C15 name form ? Create channel. Existing custom channel row ? settings icon ? C15 Channel settings ? Save name. The field requires 1?80 characters after trimming. Back cancels the editor; save failures retain the name and show an error. All conversations is a fixed aggregate filter, not a user-renamable channel. Source: features/conversations/components/ChannelSettings.tsx and ConversationHub.tsx; state/conversations/sessionStore.ts returns the durable rename result. This supersedes earlier proposed-only descriptions specifically for channel naming; remaining management features are not implicitly implemented. Existing PNG boards remain visual references; this form is an implementation addition, not a newly approved PNG.


## Navigation consistency update ? 2026-09-19

The user now prefers a leading mobile Back arrow throughout the flow. [The current navigation contract](../NAVIGATION.md) supersedes Close/X page exits and earlier back-to-Console shortcuts in this proposal. Details return to their feature index; roots return to the recorded caller. Other visual/layout proposals are not marked complete by this navigation increment.


### Submenu implementation checkpoint - 2026-09-19

See [the submenu review](../SUBMENU-REVIEW.md) for implemented corrections, actual browser coverage and remaining PNG differences. Source1.0.59/code115; proposal-only pages are not implicitly implemented by this checkpoint.

### Presentation work budget - 1.0.61
Historical message avatars are static decorative orbs. Telemetry updates must not reconstruct unchanged transcript content. Hidden transcript views detach while the existing voice/generation controller remains mounted. Return preserves scroll offset/follow-latest behavior. Virtualization of long histories and coalescing draft persistence are further work; neither is claimed implemented.

## Browser checkpoint: 1.0.62

Hub order: leading Back/Delta orb/title, search, New conversation, channels, recent conversations, secondary destinations. Near-black background and restrained session surfaces follow board01. Preserve real empty states instead of inserting mock content. Evidence: ../evidence/browser-comparison/index.html. Native acceptance is separate.
