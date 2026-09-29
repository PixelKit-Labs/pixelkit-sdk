# Harness review recovery checkpoint

The previous chapter-based site and `build-site.mjs` were missing from the local
checkout on September 19, 2026. This directory preserves a destination for local
diagnostic artifacts; it is not a reconstruction of those chapters or their evidence.

Continue from [the fresh UI review plan](../FRESH_START.md). Recover the original
guide before attempting its site build. Existing `verify-usb-harness.mjs` contains
an earlier app ID and ARTEMIS trace reference; re-explore and reconcile those
assumptions with the connected build before running it. No phone was attached at
this checkpoint.

`scripts/prepare-speech-device-validation.mjs` is an explicit development override
that replaces selected files in the sibling app's installed SDK. A subsequent npm
install replaces those overrides; it is not a published dependency upgrade.

The current [mobile UI foundation chapter](mobile-ui-foundation.md) and
[visual review gallery](../mobile-ux-review/index.html) record the new overhaul.
They distinguish current implementation work from proposals and blocked phone
verification. The original chapter-site builder remains absent.

The [active workstreams and acceptance checklist](workstreams.md) tracks Laya,
voice, timing/telemetry, and chat behavior together, with separate implementation,
automated-check, and phone-verification status.

The [agent harness source audit](agent-harness-audit.md) inventories the current
tool, Nano, Laya, Kokoro, Live, cloud-agent and MCP paths, identifies unverified
or misleading behavior, and records a proposed unified agent loop for review.

The [assistant modes chapter](assistant-modes.md) links interactive diagrams of
the current chat paths and the target shared capability layer for Gemini Nano,
Gemini Live and Gemini API. It distinguishes source evidence from design intent.

The [capability inventory](capability-inventory.md) lists all registered Delta
tools, bundled Skills, evidence-backed Wiki behavior, and local MCP exports, with
their routing and verification limits.

The [application reliability review](application-reliability-review.md) tracks
source-confirmed failures in persistence, MCP lifecycle, and AI Lab result
truthfulness, with the current automated-check and ARTEMIS evidence boundary.

The [chat E2E validation chapter](chat-e2e-validation.md) defines Delta Mobile's
versioned 52-case application-chat input/output, tool, Skill, Wiki, MCP, Laya,
voice-turn privacy and response-UI contract; the generated manual; result-schema-v2
ARTEMIS evidence; and the remediation-owner loop for source corrections and reruns.

The [unified agent harness research and implementation contract](unified-agent-harness-research.md)
compares production tool loops, chat event models, group orchestration,
subagents, Skills, evidence-backed retrieval, telemetry and evaluation against
Delta's source-audited gaps. Its
[interactive architecture](diagrams/unified-delta-harness.html) remains the target rather than a device-verified flow. PixelKit SDK 1.6.56 source implements the first capability-adapter and trace-ownership foundation; Delta coordinator integration and runtime acceptance remain pending.

The [system integration audit](system-integration-audit.md) traces the current
Harness, tool loop, Skills, Wiki, Memory, roster/cloud agents, Laya,
OpenWakeWord, Kokoro, and MCP paths end to end. It separates implemented
behavior from prompt-only or unavailable surfaces and prioritizes the remaining
functional gaps.
