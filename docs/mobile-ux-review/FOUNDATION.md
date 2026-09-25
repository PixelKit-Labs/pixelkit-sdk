# Engineering foundation

Status: implementation contract for review, not a claim that the mobile source has already been reorganized. Baseline: delta-mobile `4d986be`, SDK `aa669ff`. Consumer UI belongs in delta-mobile, not the SDK packages. The approved direction is conversation channels, Discord-like sessions/messages, a full-screen hub, and a keyboard-safe composer. Detailed schemas and individual boards remain proposals for validation.

## Source ownership and dependency direction

Create directories when moving real responsibilities, not as empty scaffolding.

```text
src/
  app/                    composition, providers, navigation, runtime lifetime
    navigation/           typed route registry and NavigationShell
    runtime/              AssistantRuntimeProvider
  domain/                 conversation, assistant, tools, preferences, capabilities
  harness/
    engine/               turn coordination, cancellation, execution state
    intent/               intent interpretation
    context/              persona, memory and context assembly
    tools/                descriptors, registry, invocations and results
    policy/               validation, capability checks and confirmation
    voice/                voice session coordination
  services/
    storage/              persistence adapters and migrations
    providers/            optional model/provider adapters
    device/               native/hardware adapters
    mcp/                  server/client transports
    events/               event feeds
    diagnostics/          observable diagnostic operations
  state/                  existing stores and subscriptions, split by domain
  features/
    conversations/        screens, components, hooks
    agent/                screens, components, hooks
    connections/          screens, components, hooks
    activity/             screens, components, hooks
    settings/             screens, components, hooks
    help/                 screens, components, hooks
  design-system/
    tokens/               semantic tokens and platform adapters
    primitives/           Text, IconButton, Surface, Input
    patterns/             PageHeader, ListRow, EmptyState, StatusMessage
    orb/                  Delta orb and state presentation
    catalog/              actual component examples
  generated/              generated documentation/contracts
  legacy/                 explicitly retained, unmounted surfaces
```

`domain` has no React, Expo, storage or network imports. Services perform effects and return typed results; they do not render views. Harness code consumes domain contracts and explicit service dependencies. State owns application state and persistence coordination; it must not become a second tool executor. Features consume selectors and commands; one feature must not import another feature's screen. Design primitives do not import stores, tools, credentials or provider SDKs. `app` owns composition and lifecycle.

Retain current store subscriptions initially. Compatibility exports must reference the same singleton. Do not introduce a state framework, repository interface or service class merely to rename a file. Extract abstractions where a real boundary or second consumer requires them.

## Naming and contracts

Use PascalCase for components and domain types, camelCase for functions and values, `useX` only for React hooks, `XScreen` for route-level components, and descriptive filenames matching their main export. Use `Adapter` for a boundary and `Service` only for a real effectful service. Avoid generic `Manager`, `Utils`, `Data`, and numbered replacement files.

Keep `channelId`, `sessionId`, `turnId`, `toolCallId` and `traceId` distinct. Use discriminated runtime states rather than unrelated booleans. Tool contracts distinguish `ToolDescriptor`, `ToolInvocation` and `ToolResult`; a proposed action is never a successful result. Public contracts document units, nullability, provenance, failures and cancellation.

Generation is keyed to session and turn. Switching screens must not duplicate generation or attach a late result to a different conversation. Cancellation has an explicit terminal state. There is one owner of microphone/VAD/native subscriptions and one owner of keyboard/safe-area layout. Navigation unmounts must not silently terminate an active turn.

## Current responsibilities to decompose

| Existing responsibility | Destination and constraint |
| --- | --- |
| App shell and keyboard avoidance | `app/navigation`; preserve the current single keyboard owner |
| ConsoleScreen rendering and orchestration | Extract presentation first; then move runtime ownership to `app/runtime` and harness |
| AgentScreen sections | Agent feature screens using existing memory, roster, skill and prompt stores |
| MCPPanel transports and UI | `services/mcp` plus connections feature; preserve request/error semantics |
| SettingsScreen sections | Settings feature screens; preserve storage keys and unsaved-edit behavior |
| TelemetryScreen collectors and views | Diagnostics services/selectors plus activity views; no fabricated fallbacks |
| deltaAgent / deltaNanoAgent / TypeSafe orchestration | Trace live callers before consolidation; one policy path, optional provider adapters |
| torchIntent / persona / confirmation | Harness intent / context / policy, with one confirmation gate |
| verifiedTorch and native effects | Device adapter with observable operation and typed result |
| HudPrimitives | Separate reusable primitives, orb material, and domain-specific renderers |
| Legacy screens and generated docs | Retain until references and migration decisions are checked; move generator and imports together |

## Design system contract

[design-tokens.json](design-tokens.json) is the proposed portable token source. During implementation, generate typed React Native and web adapters from it; do not maintain separate copied palettes. Screen code consumes semantic tokens rather than raw colors, spacing or radii. Geometry constants can remain local when they describe a specific visualization.

App backgrounds, surfaces, selection and controls are neutral charcoal/pearl. Blue is not an application accent. The orb uses the desktop sphere's layered material, highlight and bloom, with a proposed pearl/pink/magenta/violet mobile adaptation. Desktop reference: `Delta/web/src/components/hud/orb/siri-orb.tsx`, `orb.tsx`, and `Delta/web/src/index.css`. The desktop default includes cyan; the proposed mobile palette deliberately changes that material to respect the user's no-blue direction. A star, triangular logo or concentric reactor rings are not substitutes.

Orb states: idle subdued; listening responds only to measured input; thinking/speaking indicate actual runtime state; approval amber; unavailable grayscale with text. Reduced motion stops rotation, amplitude animation and moving highlights. Never infer successful hardware execution from an animation.

Primitives have accessibility labels, disabled/loading/focus states and at least 48 logical-pixel interactive targets. Inputs remain legible at enlarged text sizes. Lists and messages reflow without truncating essential actions. A glass surface requires a readable opaque fallback; decorative transparency must not reduce text contrast. Normal text must meet 4.5:1 and large text/UI boundaries 3:1 where applicable, verified on actual rendered combinations.

The composer floats without enclosing top/bottom rules. Its scroll container, safe-area padding and keyboard inset are coordinated by the shell. Validate portrait, landscape, large text, multiline input, keyboard show/hide, voice transitions and session switching on the phone. Edge gestures supplement visible menu/close buttons and Android Back; they are not the only controls.

## Migration increments and acceptance

1. Establish typed routes and the page catalog. Keep existing routes functional while extracting shell presentation.
2. Introduce token adapters and reusable primitives; compare each migrated screen with its board and spec.
3. Extract conversation hub, session rows, grouped messages and composer. Add channel persistence only with an explicit versioned migration; preserve existing flat sessions under a default grouping and keep their IDs and drafts.
4. Split Agent, Connections, Activity, Settings and Help into route screens with focused components and hooks.
5. Isolate runtime and service boundaries with unchanged behavior, observable errors, one subscription owner and one policy gate.
6. Reconcile legacy routes, generated documentation and obsolete imports. Delete only after references and replacement behavior are verified.

Each increment needs typecheck, relevant existing tests/build checks, source dependency review, and ARTEMIS exploration on the authorized USB phone for affected mobile behavior. Explore before authoring mobile tests. Record serial, native/JS identities, exact scenario, repetitions, failures, timing and artifacts. A source refactor, browser screenshot or passing unit test is not phone evidence.

## Documentation and harness maintenance

The [sitemap](SITEMAP.md) links each stable page ID to a spec and board family. The production typed route registry will own actual routable paths; this design catalog also includes states, sheets and aliases and must not be blindly converted into routes. Every page spec owns entry/back behavior, data ownership, unavailable/error/empty states, accessibility and acceptance.

For every implementation increment: update affected spec sections and implementation status; update sitemap entries for added/removed/renamed destinations; regenerate any visually changed board (preserve provenance and old revision), or explicitly record why its appearance is unchanged; update tokens/component examples; record checks and guide impact; update changelog/version under repository rules. Run `node docs/mobile-ux-review/build-review.mjs` to rebuild and validate this review package. Do not label a page implemented or device-verified without corresponding evidence.

The original chapter-based harness guide builder is absent from this checkout. This foundation chapter and the linked review package preserve the current decisions; they do not reconstruct missing historical evidence. SDK hook contracts and hardware behavior are unchanged by this design-only package.
