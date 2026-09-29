# Laya decision layer — implementation checkpoint

Delta Mobile 1.0.87 retains local Laya inference as advisory intent and bounded tool-selection guidance inside the durable Turn Coordinator. The canonical implementation chapter is [Delta Mobile's Laya integration](../../../delta-mobile/docs/laya-integration.md); it records model/runtime provenance, setup, lifecycle, privacy, thresholds, and verification limits.

## Implemented source

Delta 1.0.87/code143 source defines the production taxonomy and labeled corpus in `src/core/toolIntentGuidance.ts`. Deterministic routing still creates every executable call and argument. Enabled Laya ranks the bounded labels and records its selected label, uncalibrated probability, runner-up margin, model, duration, and disposition. A matching label corroborates the deterministic proposal; disagreement or an unmatched suggestion is visible but cannot replace it or interrupt ordinary provider chat.

The terminal outcome and conversation projection retain this provenance. One collapsed **TOOL FLOW** overview appears before assistant prose; expansion shows the ordered Laya advisory and actual execution steps. The router adds `routingDecision.influence`, final tools, and a reason after deterministic selection. `none` is the only implemented influence: the score is observed but does not cause routing. Nano sees the advisory only inside an untrusted context block. Registry schema validation, capability checks, effect policy, and confirmation remain authoritative.

The 1.0.74/code130 source correction established real file/runtime status, storage/load errors, download/load recovery and assistance opt-in only after successful loading. Expired queued requests skip inference; work already inside native inference retains session ownership until it completes. No installed-model or ready status is inferred from unsupported storage or an exception.

The pure decision interface validates typed choice distributions and returns candidates. A separate service owns app-private checkpoint files, a serialized ONNX session, loading/unloading, errors, and bounded caller waiting. The harness still owns tool validation, capability checks, confirmation policy, and execution. The adapter has no executor reference.

Settings → Models reports real model state, exact 613,050,729-byte download size, CPU provider, assistance state, and labeled intent evaluation. It no longer describes Laya as a flashlight helper. Laya is off by default; enabling requires a successfully loaded local model.

Installation explicitly downloads the pinned Hugging Face checkpoint over HTTPS, verifies exact sizes and SHA-256 digests, and atomically publishes the staged artifacts. Runtime prediction has no network path or cloud fallback. The Laya SDK 0.1.8 remains a checked-in packed artifact because the npm registry returned 404 during integration. ONNX Runtime Android remains pinned to 1.24.3 for the RN adapter and wake module.

## Implemented boundary

The dedicated Laya flashlight classifier and corpus are removed. Flashlight state arguments remain deterministic like other executable arguments. Laya has no executor, argument generator, capability authority, permission grant, confirmation bypass, or right to interrupt provider chat. Probabilities remain uncalibrated. A controlled enabled/disabled case proves this non-causal boundary instead of treating score/tool correlation as selection evidence.

## Evidence and open work

The authorized USB Pixel 11 Pro serial `66110DLKX001YW` ran installed Delta 1.0.86/code142 with the current Metro JS bundle on reversed port 8081. Settings installed, SHA-256-verified, loaded, and enabled model revision `24e078dd26307a67ab2d6aaf79210f014c8ff46d`; the prior `clarification-only` manifest was correctly rejected as corrupt after the role cutover.

One deterministic battery request executed `get_battery` once in 12 ms, returned 80% charging, and rendered Laya `get_battery` at 100% uncalibrated score with `corroborated`; its prediction log reported 525 ms. One “How much juice is left” request produced Laya `no tool` at 100% and no execution card. Nano answered from hardware context, but this remains a classifier miss rather than a tool-selection success. An incidental “Play a song” recognition also remained no-tool with an 83% score.

One 24-case `tool-intent-v1` CPU evaluation completed without inference failure: 75.0% accuracy, Brier score 0.40992652, ECE 0.1846625, and 444/479.75/484/502/512 ms minimum/mean/p50/p95/maximum latency. Failures were remember→barcode, recall→barcode, thermals→device info, web→logs, timer→no-tool, and settings→skill. The app-private artifact is `files/laya/evaluations/24e078dd26307a67ab2d6aaf79210f014c8ff46d/tool-intent-v1.json`. Memory, thermal, and power remain unmeasured; each scenario and evaluation ran once.

Delta 1.0.87/code143 then ran on the same authorized phone. A battery turn executed `get_battery` once in 11 ms, returned 96% charging, and displayed the 100% uncalibrated Laya agreement as **observed only**. “Tell a short joke” exposed an 86% uncalibrated `use_skill` false positive that incorrectly requested a tool action before correction. After a clean Metro rebuild, a fresh identical prompt displayed the same false positive as **observed only**, executed no tool, and returned a Nano joke. This is direct evidence that the corrected score no longer controls routing; it is not evidence that the classifier is accurate or calibrated.

## Glossary and decision log

**Candidate:** proposed bounded tool label, not an action. **Confidence:** selected class probability; uncalibrated until evaluation proves otherwise. **Margin:** selected probability minus runner-up. **Disposition:** corroborated, conflict, clarification, no-tool, or unavailable. **Registry:** execution and authorization boundary. **Unavailable:** absence of a usable result, never simulated confidence.

2026-09-26: adopt a reusable decision layer while keeping initial routing limited to the former JEV flashlight scope. Replace cloud credential UI with local model state and an inspectable preview. Preserve unrelated working changes. SDK hook contracts, hardware APIs, conversation/memory and speech semantics are unchanged; provider/privacy/presentation documentation changes. Delta's wake module shares a newer native ONNX dependency and requires regression verification.

Final build checkpoint: SDK `npm run verify` passed, including the documentation contract. Delta TypeScript, Android export and arm64 debug APK build passed. The existing Delta Node suite reports 155 passed and seven failed; new BDD tests are deferred. Delta 1.0.72/code128 is installed on the authorized Pixel. Runtime diagnosis found the old APK loading pixel-verify's Metro bundle, causing a missing native ONNX install error. The matching APK and Delta-specific Metro connection are now configured; the subsequent IPv6-only listener was corrected to accept IPv4 forwarding. ARTEMIS final screen acceptance is pending because the phone locked. See the app chapter for complete retry/trace references and local verification logs.

2026-09-28: broaden Laya from the former flashlight-only clarification branch to advisory tool-intent ranking inside the implemented Turn Coordinator. Keep deterministic argument construction and all policy authority outside the model. Persist and display provenance. Remove the dedicated torch classifier rather than carrying two Laya routing conventions.

2026-09-28: add explicit post-routing influence evidence and a controlled disabled/enabled causal comparison. Every score is labeled **observed only**. A USB Pixel smoke exposed an 86% `use_skill` false positive for “Tell a short joke,” so unmatched guidance cannot request an action or interrupt ordinary chat. Add the 52-case result-schema-v2 application-chat suite, generated manual, and remediation-owner report/rerun loop.

2026-09-28: separate safe application behavior from classifier quality in result schema v2. Every assessed turn records expected/actual labels, model/corpus identity, score/margin, latency, evidence and remediation. Add greeting/joke negatives and explicit `none` criteria in `tool-intent-v2`. The exact greeting rerun still returned `use_skill` at 100% uncalibrated in 3,230 ms, so prompt-only correction is insufficient; assign the open miss to `laya-model-training` and leave the full 26-case v2 evaluation unverified.

After the user unlocked the phone, ARTEMIS's live hierarchy showed the Delta conversation hub at 12:23 on September 26 (trace `ee9d22bd-5d4a-4115-9572-6e44443faeb1`). The navigation menu, on-device provider label, conversation, and message composer were present; the previous startup error was absent. Runtime logs showed normal SDK initialization. This is one observed successful startup of installed 1.0.72/code128 against Delta Metro on 8082, not acceptance of model installation, inference, or the BDD scenarios. The background runner did not report completion and was stopped after the independent ARTEMIS observation.
