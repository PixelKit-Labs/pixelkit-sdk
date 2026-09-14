# PixelKit SDK: Agent Guide

This file is the single source of truth for any coding agent (Claude, Gemini, Antigravity, Codex, Delta) working in this repository. `CLAUDE.md`, `AGENTS.md` and `GEMINI.md` are identical copies; keep all three in sync.

## Project

This repository is the monorepo for the PixelKit SDK: the 51 hardware and AI hooks, the in-app `<PixelKitDevTools />` HUD, and the two Kotlin Expo Modules (`@pixelkit-labs/native` and `@pixelkit-labs/mlkit`) targeting Google Pixel 11 Pro hardware (Tensor G6, Android 17 API 37).

The repository publishes three packages to npm:
- `@pixelkit-labs/native`: Kotlin Expo Module for low-overhead telemetry and hardware actuators (zero third-party dependencies).
- `@pixelkit-labs/mlkit`: Kotlin Expo Module for Gemini Nano on-device AI via ML Kit GenAI on AICore.
- `@pixelkit-labs/sdk`: The developer-facing SDK providing the 51 typed hooks and DevTools HUD.

The consumer template and demo application lives at https://github.com/PixelKit-Labs/pixelkit-template.

## Rules

1. **Changelog on every change.** Every change to the codebase bumps the patch version and adds an entry to `CHANGELOG.md` in the same commit. Always synchronize versions using:
   ```bash
   node scripts/sync-versions.js <version>
   ```
   This moves the root `package.json` and the three packages (`packages/sdk`, `packages/native`, `packages/mlkit`) together, and re-pins the packages to each other's exact version. Minor and major bumps are decided by the maintainer, not by agents.
2. **Nothing is simulated.** Every hook exposes `source: 'hardware' | 'derived' | 'unavailable'`. There is deliberately no `simulated` member: fabricated readings are unrepresentable in the type system. Unreadable values are `null`, render as an em dash, and report `unavailable`. Never substitute plausible defaults.
3. **Observability on every function.** Wrap calls touching hardware, network, native modules, or filesystem in `traced(MODULE, 'op', fn, data)` from `packages/sdk/src/core/observability.ts`. Surface failures through an `error` field, never an empty `catch`. Use `tracedSafe` where failure is survivable.
4. **Documented before done.** Exported hooks must match documentation in `pixelkit-docs`. `npm run check-docs` verifies every exported hook has a page and every documented return field matches TypeScript types.
5. **No UI in SDK.** The SDK ships hooks and headless logic; the only UI component in this repo is `<PixelKitDevTools />`. All consumer screen design belongs in `pixelkit-template`.
6. **Release Order & NPM Ingestion Protocol.** Releases are triggered by pushing a version tag `v<version>`. `release.yml` publishes packages in exact dependency order (`@pixelkit-labs/native` → `@pixelkit-labs/mlkit` → `@pixelkit-labs/sdk`) with `--provenance`. Remember that npm registry ingestion takes 1–3 minutes to propagate across the global CDN before downstream templates can resolve the new version.

## Validation

- `npm run verify`: runs `typecheck`, `test`, `build`, and `check-docs`.
- `npm pack --dry-run -w @pixelkit-labs/sdk -w @pixelkit-labs/native -w @pixelkit-labs/mlkit`: verifies packaging manifests.
- `npm run test:e2e`: runs automated end-to-end hardware verification via ARTEMIS against the connected Pixel 11 Pro.

## Map

```
packages/
  sdk/                    the 51 hooks, <PixelKitDevTools />, types, index.ts and mlkit.ts
  native/                 Kotlin Expo Module: telemetry, actuators, battery, display, Perfetto
  mlkit/                  Kotlin Expo Module: Gemini Nano, ML Kit text/image/OCR
scripts/
  sync-versions.js        synchronizes versions across all manifests
  check-docs-contract.js  verifies docs parity against pixelkit-docs
  run-artemis-e2e.js      executes ARTEMIS automated on-device test recipes
test/
  artemis/                ARTEMIS test recipes (01-smoke through 06-pixel-11-pro-hardware)
```
