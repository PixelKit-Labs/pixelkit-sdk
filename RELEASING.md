# Releasing the PixelKit SDK

This repository publishes three npm packages. It contains no app, so there is no build, no
keystore and no store listing here — that runbook lives in
[pixelkit-template](https://github.com/PixelKit-Labs/pixelkit-template), which is the repo that
actually ships an app.

The whole release is one push of one tag. Everything below either happens automatically or explains
why a step exists, so that a failure is diagnosable rather than mysterious.

See [`docs/release-pipeline.html`](docs/release-pipeline.html) for the same flow as a diagram.

---

## What gets published

| Package | Contents | Why it is separate |
| :--- | :--- | :--- |
| `@pixelkit-labs/native` | Kotlin Expo Module: telemetry, actuators | Zero third-party dependencies |
| `@pixelkit-labs/mlkit` | Kotlin Expo Module: Gemini Nano, vision, natural language | 19 ML Kit artifacts, and it rewrites the consumer's Gradle build |
| `@pixelkit-labs/sdk` | The 53 hooks, the DevTools HUD, observability | The package people install |

`pixelkit` depends on `@pixelkit-labs/native` only. `@pixelkit-labs/mlkit` is an **optional peer
dependency**, reached through the `@pixelkit-labs/sdk/mlkit` subpath, so a project that only wants telemetry
never installs it and never pays for it in APK size or Gradle configuration.

## 1. Set the version

```bash
node scripts/sync-versions.js <version>
```

This is not optional and it is not the same as editing `package.json`. Four manifests move
together, because `pixelkit` pins its two native modules by **exact** version — a mismatch would
publish a package that cannot resolve its own dependencies. The release workflow refuses a tag that
disagrees with any of them.

Every change bumps the patch version and adds a `CHANGELOG.md` entry in the same commit. Whether a
release becomes a minor or a major is the maintainer's call, not an agent's.

## 2. Gates

```bash
npm run verify     # typecheck, build all three packages, then the documentation contract
```

`check-docs` clones `pixelkit-docs` and fails when an exported hook has no page, when a documented
hook no longer exists, or when a documented return field is not on the declared type. The
documentation is the contract, so a rename that makes a page wrong stops the release here.

CI runs the same gates plus two more on every push:

- `npm pack --dry-run` on all three, because a packaging mistake is invisible until someone
  installs it.
- A **consumer install**: both tarballs into a scratch project, then `require.resolve` on
  `pixelkit` and `@pixelkit-labs/sdk/mlkit`. Resolution is what the `exports` map has to get right, and a
  file being present in the tarball does not prove it resolves.

## 3. Tag

```bash
git tag -a v<version> -m "PixelKit v<version>"
git push origin v<version>
```

`release.yml` takes over: it re-runs the gates, verifies the tag matches all four manifests, then
publishes **in dependency order** — `@pixelkit-labs/native`, then `@pixelkit-labs/mlkit`, then `pixelkit` —
each with `--provenance --access public`. The order is not stylistic. `pixelkit` pins the other two
exactly, so publishing it first would put a package on the registry that cannot install.

To rehearse without publishing, run the workflow manually with `dry_run: true`. Note that this
skips both the publish step and the tag-match check, since the latter only runs on a tag push.

## 4. What happens next, without you

`pixelkit-template` depends on all three. Dependabot checks daily and opens **one** pull request
with the three grouped together — grouped because they move in lockstep, and ungrouped it would
open three pull requests of which two could not resolve.

That pull request's CI is the real gate. The template's parity check runs against
`node_modules/@pixelkit-labs/sdk`, so a hook the new SDK exports with nowhere to try it in the app **fails the
pull request and names the hook**. A new capability cannot land undemonstrated.

## Prerequisites

One-time setup, without which `release.yml` cannot publish:

- An npm organisation named `pixelkit-labs`, which owns the `@pixelkit-labs` scope.
- An npm **granular access token** with read and write on the `@pixelkit-labs` scope and on the
  unscoped `pixelkit` package, stored as the repository secret `PIXELKIT` on
  `PixelKit-Labs/pixelkit-sdk`. npm is restricting classic tokens that bypass 2FA, so a granular
  token is the durable choice. On a first publish the unscoped package does not exist yet and
  cannot be selected by name, so the token has to cover all packages until it does.

Provenance requires `id-token: write`, which the workflow already declares.

## If a release goes wrong

npm unpublish is restricted after 72 hours and a version number can never be reused. The recovery
is always forward: fix, `node scripts/sync-versions.js <next>`, tag again. Do not attempt to
republish a version.

If a publish half-succeeds — say `@pixelkit-labs/native` lands and `pixelkit` fails — the registry is
consistent but incomplete. Fix the cause, bump, and tag again; the already-published version is
harmless because nothing references it yet.
