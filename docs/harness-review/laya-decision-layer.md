# Laya decision layer — implementation checkpoint

Delta Mobile 1.0.72 replaces the JEV cloud intent path with a local Laya adapter. The canonical implementation chapter is [Delta Mobile's Laya integration](../../../delta-mobile/docs/laya-integration.md); it records model/runtime provenance, setup, lifecycle, privacy, and verification limits.

## Implemented source

Delta 1.0.75/code131 source restores the intent preview and retired-key cleanup in Settings → Models. Preview requires a ready local model, displays the candidate, selected probability and measured decision duration, and never runs a tool. Opening Models invokes SecureStore deletion of the old JEV key without reading it; cleanup failure is visible and retryable. This is source evidence only; device behavior remains unverified.

Verification update: the 1.0.75 arm64 debug APK built and installed on the authorized wireless Pixel. ARTEMIS saw the connected phone in another foreground app, so this increment did not navigate Delta or verify a model preview. TypeScript and Android export passed; the existing Node suite remains 155 passed / seven prior failures. The local guide site builder is still absent.

The 1.0.74/code130 source correction established real file/runtime status, storage/load errors, download/load recovery and assistance opt-in only after successful loading. Expired queued requests skip inference; work already inside native inference retains session ownership until it completes. No installed-model or ready status is inferred from unsupported storage or an exception. Device acceptance remains unverified.

The pure decision interface validates typed choice distributions and returns candidates. A separate service owns app-private checkpoint files, a serialized ONNX session, loading/unloading, errors, and bounded caller waiting. The harness still owns tool validation, capability checks, confirmation policy, and execution. The adapter has no executor reference.

Clear flashlight commands remain deterministic. An ambiguous request can use Laya after opt-in, but its candidate only shapes clarification. Settings → Models replaces the JEV settings page and key editor with model installation/loading, assistance opt-in, and an intent preview that does not execute tools. Old JEV consent does not enable Laya. The retired credential is deleted without reading it when the new settings page opens; errors remain visible with a retry action.

Installation explicitly downloads about 613 MB from a pinned Hugging Face checkpoint over HTTPS. Runtime prediction has no network path or cloud fallback. Artifact size checks detect incomplete transfers but are not cryptographic integrity checks. The Laya SDK 0.1.8 is a checked-in packed artifact because the npm registry returned 404 during integration. ONNX Runtime Android is pinned to 1.24.3 for both the RN adapter and Delta's existing wake module.

## Proposed expansion

MCP and broader tool candidate routing can reuse this decision interface. General tool selection, arguments, multi-intent planning, and automated confidence thresholds are not implemented or validated. A candidate is not permission. Model probabilities require separate task-specific evaluation before any automation policy relies on them.

## Evidence and open work

The authorized connection is wireless Pixel `adb-66110DLKX001YW-5R845E._adb-tls-connect._tcp`; USB was not connected. TypeScript checking passed. The first native build exposed two ONNX copies; the integration pins a shared runtime before rebuilding.

ARTEMIS Pro trace `397ebf0e-90fb-443c-87f5-49cf3a39cf61` stalled without a plan and was cancelled. Flash retry `a91203ce-f644-4f59-ad70-2f35716fdd09` attempted the smaller settings path. Trace inspection was denied by tool approval policy. Neither attempt establishes acceptance of the new Laya flow. The user retained ARTEMIS as the prerequisite and explicitly allowed blocked BDD tests to be deferred. Do not substitute ADB UI exploration or claim these tests pass.

Device acceptance must record native/JS identity, model revision, scenarios, repeats, successes/failures, measured inference time and artifacts. Offline inference, download recovery, persistence, clarification, shared-runtime wake regression, and executable Given/When/Then tests remain subject to that evidence. Agent processing delays are not app performance.

## Glossary and decision log

**Candidate:** proposed typed answer, not an action. **Distribution:** model probabilities over permitted labels, not measured accuracy. **Registry:** existing execution and authorization boundary. **Checkpoint:** fixed model/config/tokenizer revision. **Unavailable:** absence of a usable result, never simulated confidence.

2026-09-26: adopt a reusable decision layer while keeping initial routing limited to the former JEV flashlight scope. Replace cloud credential UI with local model state and an inspectable preview. Preserve unrelated working changes. SDK hook contracts, hardware APIs, conversation/memory and speech semantics are unchanged; provider/privacy/presentation documentation changes. Delta's wake module shares a newer native ONNX dependency and requires regression verification.

Final build checkpoint: SDK `npm run verify` passed, including the documentation contract. Delta TypeScript, Android export and arm64 debug APK build passed. The existing Delta Node suite reports 155 passed and seven failed; new BDD tests are deferred. Delta 1.0.72/code128 is installed on the authorized Pixel. Runtime diagnosis found the old APK loading pixel-verify's Metro bundle, causing a missing native ONNX install error. The matching APK and Delta-specific Metro connection are now configured; the subsequent IPv6-only listener was corrected to accept IPv4 forwarding. ARTEMIS final screen acceptance is pending because the phone locked. See the app chapter for complete retry/trace references and local verification logs.

The requested `docs/harness-review/build-site.mjs` is absent from this checkout. Running that command returned MODULE_NOT_FOUND; do not report a successful site build.

After the user unlocked the phone, ARTEMIS's live hierarchy showed the Delta conversation hub at 12:23 on September 26 (trace `ee9d22bd-5d4a-4115-9572-6e44443faeb1`). The navigation menu, on-device provider label, conversation, and message composer were present; the previous startup error was absent. Runtime logs showed normal SDK initialization. This is one observed successful startup of installed 1.0.72/code128 against Delta Metro on 8082, not acceptance of model installation, inference, or the BDD scenarios. The background runner did not report completion and was stopped after the independent ARTEMIS observation.
