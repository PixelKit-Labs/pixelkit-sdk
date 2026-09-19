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
