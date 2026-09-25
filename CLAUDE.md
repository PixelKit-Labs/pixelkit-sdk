# PixelKit SDK: Agent Guide

This file is the single source of truth for any coding agent (Claude, Gemini, Antigravity, Codex, Delta) working in this repository. `CLAUDE.md`, `AGENTS.md` and `GEMINI.md` are identical copies; keep all three in sync — `sha256sum AGENTS.md CLAUDE.md GEMINI.md` must print one hash.

## Project

This repository is the monorepo for the PixelKit SDK: the hardware and AI hooks, the in-app `<PixelKitDevTools />` HUD, and the two Kotlin Expo Modules (`@pixelkit-labs/native` and `@pixelkit-labs/mlkit`) targeting Google Pixel 11 Pro hardware (Tensor G6, Android 17 API 37).

The repository publishes three packages to npm:
- `@pixelkit-labs/native`: Kotlin Expo Module for low-overhead telemetry and hardware actuators (zero third-party dependencies).
- `@pixelkit-labs/mlkit`: Kotlin Expo Module for Gemini Nano on-device AI via ML Kit GenAI on AICore.
- `@pixelkit-labs/sdk`: The developer-facing SDK providing the typed hooks and DevTools HUD.

PixelKit is several repositories in the PixelKit-Labs organisation, and a change here usually has to land in more than one of them (rule 7):

| Repository | Owns |
| :--- | :--- |
| `pixelkit-sdk` (this one) | the hooks, the native modules, the DevTools HUD, unit tests, ARTEMIS recipes |
| `pixelkit-docs` | `data/hooks/*.json` — the contract this repository's CI checks — and the documentation site |
| `pixelkit-template` | the demo app, and the one screen that demonstrates each hook |
| `pixelkit-cli` | `pixelkit doctor` |
| `.github` | the organisation profile |

## Rules

1. **Changelog on every change.** Every change to the codebase bumps the patch version and adds an entry to `CHANGELOG.md` in the same commit. Always synchronize versions using:
   ```bash
   node scripts/sync-versions.js <version>
   ```
   This moves the root `package.json` and the three packages (`packages/sdk`, `packages/native`, `packages/mlkit`) together, and re-pins the packages to each other's exact version. Minor and major bumps are decided by the maintainer, not by agents. If a change shipped without an entry, record it under the next version in a `### Recorded late` table giving the commit and the release it first shipped in. Never rewrite an entry that has been published.
2. **Nothing is simulated.** Every hook exposes `source: 'hardware' | 'derived' | 'unavailable'`. There is deliberately no `simulated` member: fabricated readings are unrepresentable in the type system. Unreadable values are `null`, render as an em dash, and report `unavailable`. Never substitute plausible defaults.
3. **Observability on every function.** Wrap calls touching hardware, network, native modules, or filesystem in `traced(MODULE, 'op', fn, data)` from `packages/sdk/src/core/observability.ts`. Surface failures through an `error` field, never an empty `catch`. Use `tracedSafe` where failure is survivable. Trace correlation is only correct for sequential calls: when two traced calls overlap across an `await`, events can carry the wrong trace id. Do not rely on `getTrace(id)` for concurrent work until that is fixed.
4. **Documented before done.** Exported hooks must match documentation in `pixelkit-docs`. `npm run check-docs` verifies every exported hook has a definition and every documented return field exists on its type, that `README.md` names every exported hook, and that the agent pages in pixelkit-docs import only names this package exports, from the right entry point.
5. **No UI in SDK.** The SDK ships hooks and headless logic; the only UI component in this repo is `<PixelKitDevTools />`. All consumer screen design belongs in `pixelkit-template`.
6. **Release Order & NPM Ingestion Protocol.** Releases are triggered by pushing a version tag `v<version>`. `release.yml` publishes packages in exact dependency order (`@pixelkit-labs/native` → `@pixelkit-labs/mlkit` → `@pixelkit-labs/sdk`) with `--provenance`. Pushing a tag publishes to npm, so do it only when the maintainer asks. npm registry ingestion takes 1–3 minutes to propagate across the global CDN before downstream templates can resolve the new version.
7. **Keep every surface current.** A change is not done until everything that describes or demonstrates it agrees. Most of this is enforced by a check somewhere; where it is not, the table says so, and it is still required.

   | When you… | Also update | Enforced by |
   | :--- | :--- | :--- |
   | Add, remove or rename a hook, or change what it returns | the export in `packages/sdk/src/index.ts` or `mlkit.ts` | `check-docs` |
   | | `data/hooks/<hook>.json` in pixelkit-docs, then `npm run build:api-pages` there to write the page and indexes | `check-docs` here, `check:api` there |
   | | the hook's row in the mapping table of `docs/AI_PRIMER.md` in pixelkit-docs | `check:api` in pixelkit-docs |
   | | the Hooks section of `README.md` | `check-docs` |
   | | a home in pixelkit-template's `src/core/surface.ts` and a control on that tab, before or with the release that exports it | `parity` in pixelkit-template, on the dependency bump |
   | | an ARTEMIS recipe in `test/artemis/recipes/` and its alias in `scripts/run-artemis-e2e.js` | nothing — do it anyway |
   | | `CHANGELOG.md` | nothing automatic — rule 1 |
   | Change the number of hooks | every count stated in prose: `README.md`, `packages/*/README.md`, `RELEASING.md`, pixelkit-docs `docs/getting-started/README.md`, and the org profile in `PixelKit-Labs/.github` | nothing — prefer describing over counting, and grep all repositories for the old number |
   | Change an import path or public name used in examples | the agent pages in pixelkit-docs: `docs/AI_PRIMER.md` and `docs/ai-guidance/` | `check-docs` |
   | Change a native package name or the template's app id | pixelkit-cli's checks and default `--package`, and its pages under `docs/cli/` in pixelkit-docs | nothing |

8. **Coordinate with other agents.** Run `git status` and `git log --oneline -5` before editing and `git pull --rebase` before pushing; another agent may have committed. Prefer targeted edits over whole-file rewrites on files touched recently by others.
9. **Fix SDK issues at their source before downstream workarounds.** When Delta reveals a PixelKit SDK or native-module defect, correct it here, add the appropriate changelog/version and verification, and publish the synchronized SDK/native/ML Kit release when the maintainer has requested the downstream upgrade. Then update Delta to that registry-resolvable release and verify the consuming build and device flow. A temporary local patch may unblock diagnosis, but it is never the delivered fix.

## Living Delta system guide and implementation evidence

Delta is the user's personal assistant (she). Treat the agent harness, tools, memory, voice, perception, integrations and presentation as explicit subsystem responsibilities.

- On every change, check whether the local system guide's chapters, diagrams, references, glossary, feature status or design decisions need to be added, updated, corrected, moved or deleted. Do not leave obsolete claims or disconnected functionality presented as working. The canonical guide is pixelkit-sdk/docs/harness-review/ (the SDK checkout may be named Pixel delta); Delta Mobile uses the sibling guide. Keep its local site current by running node docs/harness-review/build-site.mjs from the SDK repository. Record unchanged guide sections explicitly in the change's verification notes when no update is needed.
- Document work in chapters, with source/build references, a glossary, observed evidence, open questions and an implementation/decision log. Distinguish proposed architecture from implemented and device-verified flows. Elicit user feedback on form and function at meaningful design checkpoints; never treat an unanswered proposal as accepted.
- Clear, reversible user requests execute immediately through the normal tool boundary, followed by brief verified confirmation. Model prose cannot authorize hardware actions. Explain Nano limitations and ask before cloud fallback; optional JEV integration must disclose its cloud data use and remain independent of the core harness.
- After each implementation increment, run appropriate checks plus real end-to-end exploration/verification and benchmarks on the authorized USB phone. Use the Android USB ADB skill and ARTEMIS; establish exact UI paths before authoring mobile tests. Record device serial, app/native/JS build identity, scenario, repeats, successes/failures, measured timing and trace/artifact references. Never count agent/model exploration latency as application performance or hide flakes with unreported retries. Unavailable infrastructure or credentials means the affected check is unverified, not passed.
- Keep optional providers optional: disabling JEV, missing credentials, timeouts or provider errors must preserve the local harness, tool validation, capability checks and confirmation policy. Do not replace provider failures with fabricated model confidence or tool success.

## Validation

- `npm run verify`: runs `typecheck`, `test`, `build`, and `check-docs`. `check-docs` clones pixelkit-docs, so it checks against what is pushed there, not a local copy — pass a path to `node scripts/check-docs-contract.js <data/hooks>` to check unpushed changes.
- `npm pack --dry-run -w @pixelkit-labs/sdk -w @pixelkit-labs/native -w @pixelkit-labs/mlkit`: verifies packaging manifests.
- `npm run test:e2e`: runs automated end-to-end hardware verification via ARTEMIS against the connected Pixel 11 Pro. Gate it with `npx @pixelkit-labs/cli doctor && npm run test:e2e` — the runner's own device check accepts a phone listed as `unauthorized` or `offline`.

## Map

```
packages/
  sdk/                    the hooks, <PixelKitDevTools />, types, index.ts and mlkit.ts
  native/                 Kotlin Expo Module: telemetry, actuators, battery, display, Perfetto
  mlkit/                  Kotlin Expo Module: Gemini Nano, ML Kit text/image/OCR, embeddings
scripts/
  sync-versions.js        synchronizes versions across all manifests
  check-docs-contract.js  verifies docs parity against pixelkit-docs
  run-artemis-e2e.js      executes ARTEMIS automated on-device test recipes
test/
  *.test.ts               unit tests, run by `npm test` with Node's own test runner
  artemis/                ARTEMIS test recipes (01-silicon-telemetry through 08-cloud-agents-and-adk)
```
