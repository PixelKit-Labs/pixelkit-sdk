# Delta mobile UI/UX review

Open [the visual review gallery](index.html), then use the [sitemap and page index](SITEMAP.md) to find each detailed specification. Ten permanent [PNG boards](boards/) cover the six main navigation areas and shared states. Images are proposals; [review corrections](REVIEW_NOTES.md) identify generated details that must not be copied into implementation.

- [Engineering foundation and migration contract](FOUNDATION.md)
- [Design tokens](design-tokens.json)
- [Conversations](specs/conversations.md), [Agent](specs/agent.md), [Connections](specs/connections.md)
- [Activity](specs/activity.md), [Settings](specs/settings.md), [Help and reference](specs/guide.md)
- [Legacy surface disposition](LEGACY.md)
- [Generation provenance](generation-manifest.json)

The full-screen hub, conversation-first direction and neutral palette reflect the user's requested direction. Individual layouts, data migrations and detailed behaviors remain for review. No runtime refactor is claimed by this design package.

Keep the sitemap, boards, specifications, tokens and implementation evidence synchronized on each increment as defined in the foundation chapter. Rebuild/validate the local gallery with `node docs/mobile-ux-review/build-review.mjs`. The generated gallery works without a server or external assets.
