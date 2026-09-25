# Delta mobile Agent surfaces

Page-level design specification for the Agent hub and every current Agent subsection. Runtime behavior remains governed by the existing stores and callbacks; proposed editors and cross-surface search are not accepted until MOM reconciles them.

## Evidence and shared rules

- **Mobile source:** `delta-mobile/src/screens/AgentScreen.tsx` defines `SubTab = identity | agents | memory | skills | wiki | tools | mcp | prompts` and the handlers/stores for each. `McpFeedsPanel.tsx` supplies the MCP subsection. `Panel`, `DataRow`, `HapticButton`, and `StatTile` are shared primitives.
- **Desktop source:** `Delta/web/src/components/panels/agent-panel.tsx` is a useful information-architecture reference: full-page Agent view, tabs, shared filter, data grids, editors/dialogs, and explicit read-only file-skill behavior. It is not evidence that mobile has those editors or APIs.
- **Persistence:** Identity uses `SettingsStore`; memories use `MemoryStore`; roster uses `RosterStore`; skills use `SkillStore`; wiki/proposals use `WikiStore`; prompts use `PromptStore`; tools use in-memory disabled state in the current mobile screen; MCP delegates to `McpFeedsPanel`. Voice tone is local component state and currently not persisted or applied to a provider.
- **Accessibility:** all tabs expose selected state; forms have labels; switches announce on/off; targets ≥48dp; long labels wrap; focus and Android Back close editors before leaving the Agent hub.
- **Capability honesty:** “on-device TPU”, provider, tool, MCP, vector, voice, or hardware claims are shown only where the current store/hook returns evidence. A switch is not proof that a tool/provider is available or enforced.

## Sitemap mockup (design inventory)

```text
A01 Agent hub (existing partial; proposed full-screen entry)
├─ A02 Identity and hardware target (existing)
│  └─ A14 Voice/persona behavior review (proposed consolidation)
├─ A03 Specialist agent roster (existing)
│  └─ A15 Agent/session routing (proposed)
├─ A04 Memory overview and budget (existing partial)
│  ├─ A05 Memory semantic search/results (existing partial)
│  └─ A06 Memory editor/detail (proposed)
├─ A07 Procedural skills catalogue (existing)
│  └─ A08 Skill editor (existing inline / proposed detail parity)
├─ A09 Wiki and skill proposals (existing)
├─ A10 MCP feeds and connections (existing; details delegated)
├─ A11 Registered tools (existing)
└─ A12 Saved prompt library (existing)
   └─ A13 Prompt editor (existing inline / proposed detail parity)
```

## A01 — Agent hub

- **Purpose / status:** Existing partial: mobile AgentScreen with horizontal eight-tab strip; proposed full-screen hub treatment removes reliance on bottom tabs and adds a page heading/summary.
- **Sources:** `AgentScreen.tsx:51-65,359-402`; `App.tsx:238-273`; desktop `agent-panel.tsx:568-743`.
- **Entry / exit / back:** Enter from proposed global menu/hub; current App Agent tab remains legacy entry. Back returns to prior surface; tab changes stay in hub; editing overlays return to the originating tab.
- **Hierarchy / controls / actions:** Agent title and one-line role; tab strip with Identity, Agents, Memory, Skills, Wiki, Tools, MCP, Prompts and counts; shared filter only where actual list supports it; no bottom-tab dependency.
- **Data / draft rules:** each tab reads its existing store; tab selection is local and may reset on unmount; editor drafts stay local until Save; do not add cross-tab mutation without an accepted store/API.
- **States:** loading—store subscription skeleton; empty—tab-specific empty; offline—local stores readable; permission—only tool-specific; error—tab-level store/MCP error with retry; unavailable—provider/source labels remain factual.
- **Accessibility / keyboard:** tablist semantics and selected state; horizontal strip keyboard-scrollable; focus restores after editor close; Back hierarchy is editor → tab hub → previous page.
- **Acceptance criteria:** all eight tabs remain reachable at narrow widths; active tab is visible; no bottom navigation is required; counts do not imply capability.
- **Validation questions:** Should Agent open on Identity or last-used tab? Is the shared filter accepted for mobile?

## A02 — Identity and hardware target

- **Purpose / status:** Existing. Shows name/platform/engine rows, voice tone choices, and custom directives save/reset.
- **Sources:** `AgentScreen.tsx:404-489`; `SettingsStore`; `DEFAULT_PERSONA_CONFIG`; desktop identity tab `agent-panel.tsx:743-788`.
- **Entry / exit / back:** A01 Identity tab; no nested route currently. Save/reset remain in place; Back leaves only after unsaved directive policy is resolved.
- **Hierarchy / controls / actions:** status/identity rows; tone choices (concise/analytical/expansive); multiline directives; Save Directives and Reset Defaults.
- **Data / draft rules:** directives read/write `SettingsStore.customInstructions`; tone currently local-only and must be labelled preview/local until persistence and application are implemented; hardware rows are informational.
- **States:** loading—settings read; empty—default directives; offline—local settings editable; permission—not applicable; error—save failure retains draft; unavailable—hardware facts render unavailable, never guessed.
- **Accessibility / keyboard:** labelled multiline field, character/validation guidance, tone group selected state, Save disabled/feedback, Reset confirmation if destructive; targets ≥48dp.
- **Acceptance criteria:** user can distinguish editable persona from read-only hardware facts; saved status is announced; tone does not claim to alter speech until wired.
- **Validation questions:** Should voice tone move to Settings or remain persona identity? What exact setting controls its persistence?

## A03 — Specialist agent roster

- **Purpose / status:** Existing. Lists specialists, role/description/tool scope, active state, and switch action.
- **Sources:** `AgentScreen.tsx:492-561`; `RosterStore`; desktop `agent-panel.tsx:801-819` and agent editor.
- **Entry / exit / back:** A01 Agents; selecting inactive specialist calls `RosterStore.setActiveAgent`; Back returns A01 without losing selection.
- **Hierarchy / controls / actions:** active specialist header, explanatory copy, cards with name/role/description/scopes, Current Assistant or Switch button.
- **Data / draft rules:** roster and active ID come from `RosterStore`; current callback changes active roster, but no per-agent conversation/session model is shown in mobile. Do not imply routing isolation beyond actual implementation.
- **States:** loading—roster subscription; empty—Delta/default front door only; offline—local roster; permission—not applicable; error—store failure; unavailable—scope displayed as configured, not verified execution.
- **Accessibility / keyboard:** card heading/order, active state, switch button disabled/labelled; long scope chips wrap; focus remains on selected card.
- **Acceptance criteria:** active agent is singular and obvious; switching never claims a tool ran; cards fit narrow screens.
- **Validation questions:** Are specialist conversations separate sessions or one active conversation? Should roster editing be mobile-proposed only?

## A04 — Memory overview and budget

- **Purpose / status:** Existing partial: stat tiles, vector availability, and curated memory list.
- **Sources:** `AgentScreen.tsx:564-582,620-654`; `MemoryStore`; `useEmbeddings`; `StatTile/Meter`.
- **Entry / exit / back:** A01 Memory; search/add/detail actions stay in tab; Back returns A01.
- **Hierarchy / controls / actions:** stored memories count/budget meter; vector space status; Semantic Search (A05); Remember Durable Fact; Curated Memory Bank rows and Forget.
- **Data / draft rules:** memory text/vector/timestamp from `MemoryStore`; embedding is optional and may be unavailable; remember clears input before async embed currently, so proposed UX must confirm pending/failure behavior before changing runtime.
- **States:** loading—memory/embedding read; empty—no vector memories; offline—text memory may remain local; permission—not applicable; error—embed/store failure with truthful result; unavailable—TEXT/embedding offline as actual hook says.
- **Accessibility / keyboard:** meter announces min/max/current; memory row text wraps; Forget is destructive and named; search and remember fields labelled; no score color-only.
- **Acceptance criteria:** no claim that all memories are vectors; budget is readable; empty state offers Remember; deleting cannot be accidental.
- **Validation questions:** Should memory search fallback to literal text be shown as a different mode? Is pinning approved on mobile?

## A05 — Memory semantic search/results

- **Purpose / status:** Existing partial. Search calculates cosine scores with text fallback when embeddings unavailable; results currently mark rows.
- **Sources:** `AgentScreen.tsx:201-239,584-601,627-650`; `useEmbeddings`; `MemoryStore.updateMemoryVector`.
- **Entry / exit / back:** Enter A04 Search; submit/button runs; clear query returns full list; Back leaves tab.
- **Hierarchy / controls / actions:** query, Search/busy state, result match score alongside memory, no result detail route currently.
- **Data / draft rules:** query local; embeddings may update stored missing vectors; fallback score is a heuristic text match and must be labelled literal fallback, not semantic confidence.
- **States:** loading—searching; empty—blank query vs no matches; offline—literal fallback only if code says so; permission—not applicable; error—embedding failure per item with result provenance; unavailable—embedding engine offline.
- **Accessibility / keyboard:** Search is submit action, busy announced, score has text label, result order stable, clear available; no spinner-only state.
- **Acceptance criteria:** users know whether search is semantic or literal; a failed embedding does not erase memories; score is not presented as model confidence.
- **Validation questions:** Do we want a dedicated result page or is inline highlighting sufficient?

## A06 — Memory editor/detail

- **Purpose / status:** Proposed. Desktop has `MemoryEditor`; mobile currently only Remember and Forget.
- **Sources:** absence in `AgentScreen.tsx`; desktop `agent-panel.tsx:172-183,885-892`; current `MemoryStore` APIs.
- **Entry / exit / back:** A04 New/row opens proposed editor; Save/Forget returns list; Back dismisses with dirty confirmation.
- **Hierarchy / controls / actions:** key/text/source/tags/timestamp/vector provenance; Save, Cancel, Forget; pin if accepted.
- **Data / draft rules:** map to existing add/remove/update capabilities only after API review; unsaved fields local; vector regeneration must disclose actual availability and not fabricate.
- **States:** loading—load/save; empty—new memory form; offline—local store only; permission—not applicable; error—retain draft; unavailable—vector controls disabled with reason.
- **Accessibility / keyboard:** explicit labels, validation, destructive focus order, modal semantics, Back/Escape.
- **Acceptance criteria:** editor never implies desktop-only fields exist on mobile; source/provenance remains visible; no silent overwrite.
- **Validation questions:** Are key/tags part of the mobile data contract or desktop-only?

## A07 — Procedural skills catalogue

- **Purpose / status:** Existing. Search/filter, enabled switches, origin/category, expandable SOP, and custom skill creation/deletion.
- **Sources:** `AgentScreen.tsx:783-923`; `SkillStore`; desktop skill table/editor `agent-panel.tsx:353-449,821-830`.
- **Entry / exit / back:** A01 Skills; New Skill expands form; Save/Cancel returns list; row expands SOP; Back closes create/expanded state first.
- **Hierarchy / controls / actions:** count active/total; New Skill; intro; search; skill rows with origin/category/status; enable; expand SOP; delete authored skill.
- **Data / draft rules:** `SkillStore` persists enabled/upsert/delete; bundled skills are read-only conceptually; custom fields are local until Save. Instructions are procedural text, not proof of execution.
- **States:** loading—store read; empty—no skills vs no filter matches; offline—local skills; permission—not applicable; error—save/delete/toggle failure; unavailable—bundled/on-demand origin shown as configured.
- **Accessibility / keyboard:** switch labels include skill; expand controls expose expanded state; SOP content scrolls; Delete confirmation; form multiline fields labelled.
- **Acceptance criteria:** bundled skills cannot be deleted accidentally; long SOP wraps; disabled means not offered only where actual store semantics support it.
- **Validation questions:** Is “enabled” enforced at prompt construction on mobile? Should skill edits be dialogs like desktop?

## A08 — Skill editor

- **Purpose / status:** Existing inline create form, proposed richer edit detail for authored skills.
- **Sources:** `AgentScreen.tsx:804-845`; desktop `SkillEditor` wiring `agent-panel.tsx:904-911`; `SkillStore`.
- **Entry / exit / back:** New Skill opens inline; Save creates; Cancel closes; proposed edit opens from authored row; Back prompts on dirty draft.
- **Hierarchy / controls / actions:** name, description, instructions, category/origin summary; Save/Cancel/Delete authored; no edit for bundled read-only skills.
- **Data / draft rules:** existing `SkillStore.upsert` fields are authoritative; do not add arbitrary permissions without API. Draft local, trim on save as current handler.
- **States:** loading—save/delete; empty—required fields; offline—local persistence; permission—not applicable; error—retain draft; unavailable—read-only bundled state.
- **Accessibility / keyboard:** labels, required/error messages, multiline instructions, focus first invalid field, modal/back handling.
- **Acceptance criteria:** Save disabled or explains missing name/instructions; origin distinction is explicit; no implied model/provider success.
- **Validation questions:** Which skill fields must be searchable? Is category a fixed enum or user-defined?

## A09 — Wiki and skill proposals

- **Purpose / status:** Existing. Operational wiki pages and human-in-the-loop skill proposals.
- **Sources:** `AgentScreen.tsx:658-780`; `WikiStore`; desktop `WikiPanel` wiring `agent-panel.tsx:832-843`.
- **Entry / exit / back:** A01 Wiki; proposal Accept/Reject/Rollback; wiki row expands; Back collapses/returns hub.
- **Hierarchy / controls / actions:** intro clarifies wiki kept out of prompt; pending count; proposal title/rationale/evidence/date/status/actions; consolidated pages with revision/evidence/body expand.
- **Data / draft rules:** `WikiStore` owns pages/proposals; decisions are persisted by store; status is proposal lifecycle, not evidence that a skill is active until acceptance path says so.
- **States:** loading—store read; empty—no proposals/pages; offline—cached local wiki; permission—decision is human action, no device permission; error—store decision/read failure; unavailable—wiki disabled/source unavailable.
- **Accessibility / keyboard:** proposal status and evidence read; accept/reject buttons named; expanded page state; destructive/reversible rollback confirmation.
- **Acceptance criteria:** pending proposal is never auto-accepted; evidence count is not quality confidence; page body can be read without truncation trap.
- **Validation questions:** Should proposals be channel/session-scoped? Who may accept them in multi-user futures?

## A10 — MCP feeds and connections

- **Purpose / status:** Existing `McpFeedsPanel` embedded in mobile; connection details are delegated to coordinator spec.
- **Sources:** `AgentScreen.tsx:925-930`; `src/components/McpFeedsPanel.tsx`; desktop `agent-panel.tsx:856-864`; sibling `../specs/connections.md` (MOM-owned, authoritative for aliases).
- **Entry / exit / back:** A01 MCP; feeds/panels navigate internally as component supports; Back closes nested editor before leaving.
- **Hierarchy / controls / actions:** show configured feeds, connection status, events, errors, and actual controls exposed by `McpFeedsPanel`; do not invent aliases or provider success.
- **Data / draft rules:** use MCP stores/config exposed by component; secrets remain secure; connection drafts persist only through actual save path; link aliases to `../specs/connections.md`.
- **States:** loading—connection/feed fetch; empty—no feeds; offline—local configuration/status; permission—credential/network; error—per-provider failure with local Agent intact; unavailable—disabled provider does not break tools.
- **Accessibility / keyboard:** status labels include connected/disconnected/unavailable, actions named, event feed readable, focus in nested forms.
- **Acceptance criteria:** optional MCP failure preserves local harness/tool validation; no feed is called healthy without observed evidence; no secrets in UI copy.
- **Validation questions:** Which MCP controls are mobile-ready versus desktop-only? Confirm alias/source mapping in `connections.md`.

## A11 — Registered tools

- **Purpose / status:** Existing. Category filter, registered tool rows, schema expansion, enable switches.
- **Sources:** `AgentScreen.tsx:932-1010`; `defaultToolRegistry`; `DeltaTool` types; desktop tool grid `agent-panel.tsx:451-521,845-854`.
- **Entry / exit / back:** A01 Tools; category chip filters; Schema expands; switch toggles local disabled map; Back collapses schema/filter focus.
- **Hierarchy / controls / actions:** horizontal category filter, count, tool name/description/category, schema, enable/disable. Dangerous/gated state should be explicit if type provides it.
- **Data / draft rules:** registry is current source; `disabledTools` is local screen state and does not prove durable enforcement; schema is read-only JSON; actual tool confirmation remains C06.
- **States:** loading—registry; empty—no tools/no category match; offline—registry may still read; permission—tool-specific at execution; error—registry/schema parse; unavailable—capability/source label.
- **Accessibility / keyboard:** filter chips selected state; schema expansion state; switch label/name; JSON scroll/read; no tool run from inspection surface.
- **Acceptance criteria:** enabling/disabling semantics are truthful; schema never claims execution; dangerous action points to confirmation policy, not an implied bypass.
- **Validation questions:** Should tool toggles persist in SettingsStore? Is category “all” the default on each mount?

## A12 — Saved prompt library

- **Purpose / status:** Existing. Search, category, create form, delete, Run in Console.
- **Sources:** `AgentScreen.tsx:1012-1138`; `PromptStore`; desktop prompt table/editor `agent-panel.tsx:523-563,866-879`.
- **Entry / exit / back:** A01 Prompts; New expands form; Save/Cancel; Run arms prompt and requests Console (`298-303`); Back returns A01/clears only transient form per dirty policy.
- **Hierarchy / controls / actions:** intro; New Prompt; label/text/category; search; prompt cards; Delete; Run in Console.
- **Data / draft rules:** `PromptStore` owns saved prompts; draft fields local; Run passes text through `DeltaState.armedPrompt` and requested tab, not direct execution; provider/hardware outcome remains C02/C05.
- **States:** loading—store; empty—no prompts/no matches; offline—saved local prompts usable to arm text but execution may be unavailable; permission—not applicable until execution; error—save/delete failure retains draft; unavailable—destination Console/provider explains.
- **Accessibility / keyboard:** form labels/category selected, Delete confirmation, Run announces destination, search clear, focus transfer to composer on Console if supported.
- **Acceptance criteria:** Run never claims prompt executed; saved text is visible before action; long prompt wraps and does not truncate.
- **Validation questions:** Should prompts be channel/session scoped? Is category taxonomy final?

## A13 — Prompt editor

- **Purpose / status:** Existing inline create form; proposed edit/detail parity with desktop.
- **Sources:** `AgentScreen.tsx:1034-1084`; desktop `PromptEditor` wiring `agent-panel.tsx:912-918`; `PromptStore`.
- **Entry / exit / back:** New opens inline; Save/Cancel; proposed edit from prompt row; Back dirty guard.
- **Hierarchy / controls / actions:** label, prompt text, category, Save, Cancel, Delete for existing; preview of what will be armed, not executed.
- **Data / draft rules:** map only to `PromptStore.upsert/delete`; no provider execution during preview; trim/required fields mirror current handler.
- **States:** loading—save/delete; empty—required fields; offline—local store; permission—not applicable; error—retain draft; unavailable—destination capability shown only after run.
- **Accessibility / keyboard:** required labels, multiline text, validation, modal/inline focus order, destructive confirmation.
- **Acceptance criteria:** editor distinguishes “saved” from “run”; no secret/provider fields; Back cannot discard silently.
- **Validation questions:** Is edit required for first release or is delete/recreate sufficient?

## A14 — Voice/persona behavior review

- **Purpose / status:** Partial existing behavior split between A02 voice tone UI, SettingsStore persona directives, Console speech settings, and global voice controls; this page is a proposed consolidated review, not a new runtime page.
- **Sources:** `AgentScreen.tsx:434-460`; `App.tsx:184-233`; `ConsoleScreen.tsx:437-475,756-830`; `SettingsScreen.tsx` voice/VAD sections.
- **Entry / exit / back:** Access from A02 “Voice” detail or Settings; Back returns origin; active speaking/listening remains C04/C05.
- **Hierarchy / controls / actions:** identity voice tone, auto-speak, wake/VAD/continuous settings, current availability, test voice only where actual handler exists.
- **Data / draft rules:** distinguish local tone state from persisted SettingsStore values; no claim that tone currently changes TTS until wired; provider voice failures remain visible.
- **States:** loading—settings; empty—defaults; offline—local settings; permission—mic/speech; error—TTS/speech error; unavailable—provider/voice unavailable.
- **Accessibility / keyboard:** switch labels/state; test action not automatic; spoken confirmation optional and never sole channel.
- **Acceptance criteria:** voice controls have one source of truth and do not duplicate contradictory states; C04 remains authoritative for live listening.
- **Validation questions:** Which voice settings belong in Agent identity versus Settings?

## A15 — Agent/session routing

- **Purpose / status:** Proposed bridge between specialist agents, channels, and conversations; not currently implemented.
- **Sources:** `AgentScreen.tsx:140-145,298-303`; `deltaState.ts:23-24`; `SessionStore` flat active session; desktop AgentPanel description of per-agent conversation is reference prose, not mobile evidence.
- **Entry / exit / back:** A03 specialist selection or C11 session detail may open routing explanation; Back returns origin; selecting a specialist changes only what current runtime actually changes.
- **Hierarchy / controls / actions:** active agent, destination session/channel (proposed), tool/skill scope summary, explicit “switch” versus “start new agent session”.
- **Data / draft rules:** requires accepted mapping between `activeAgentId`, SessionRecord, and proposed ChannelRecord; until then never persist inferred ownership or claim isolation.
- **States:** loading—roster/session read; empty—default Delta; offline—local selection; permission—not applicable; error—routing conflict; unavailable—show current single-session limitation.
- **Accessibility / keyboard:** clear scope summary, selected state, confirmation before changing context if it could discard draft.
- **Acceptance criteria:** agent selection and session selection cannot silently switch unrelated context; current limitations are explicit.
- **Validation questions:** Is one session owned by one agent, multiple agents, or a channel? Is handoff an auditable turn?

## Catalogue of inaccessible legacy Agent behavior

- Eight horizontal tabs can overflow and several controls in `AgentScreen.tsx` lack complete role/label/selected state; preserve as audit evidence, not target.
- Mobile memory/tools/skill rows include nested `Pressable`/`Switch` controls with inconsistent target sizes and no universal destructive confirmation.
- `voiceTone` is local-only despite appearing like a persisted setting; do not document it as effective until wired.
- Tools’ `disabledTools` is screen-local; do not describe it as durable enforcement.
- Mobile lacks desktop’s shared filter, data grids, dedicated editors, agent editor, and read-only file-skill dialog; these are proposed parity ideas, not current mobile capabilities.
- MCP aliases/connections are intentionally delegated to `../specs/connections.md`; do not duplicate or invent them here.


## Navigation consistency update ? 2026-09-19

The user now prefers a leading mobile Back arrow throughout the flow. [The current navigation contract](../NAVIGATION.md) supersedes Close/X page exits and earlier back-to-Console shortcuts in this proposal. Details return to their feature index; roots return to the recorded caller. Other visual/layout proposals are not marked complete by this navigation increment.


### Submenu implementation checkpoint - 2026-09-19

See [the submenu review](../SUBMENU-REVIEW.md) for implemented corrections, actual browser coverage and remaining PNG differences. Source1.0.59/code115; proposal-only pages are not implicitly implemented by this checkpoint.

### Tool inspection checkpoint ? 1.0.60

Tools is an inspection surface, not a permission editor. Unsupported enable switches are removed. Each schema toggle has a unique accessible name; expanded JSON scrolls horizontally inside the detail rather than widening the screen. Browser exploration opened and collapsed set_torch without executing it. Wiki proposal comparison still requires real current/proposed content; seeded illustrative Wiki records remain an unresolved data gap.

### Header placement checkpoint - 1.0.63

Index and detail titles align immediately after the shared 48dp Back affordance, with a flexible text column. The index subtitle stays with its title; long titles wrap to two lines. This replaces the earlier far-right index title placement. Section content and store behavior are unchanged.
