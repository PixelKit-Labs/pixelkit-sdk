# Mobile back navigation

This contract supersedes trailing Close/X navigation controls in earlier concept PNGs. Search-clear, remove-attachment and explicit destructive actions retain their distinct meanings.

| Surface | Back destination |
| --- | --- |
| Conversation hub | Active conversation |
| Channel settings | Hub, with keep-editing/discard choice for changed names |
| Agent section | Agent index |
| Activity section | Activity index |
| Settings section | Settings index, guarding unsaved changes |
| Connections section | Connections index |
| External service add/import | Service list first; guard edited fields |
| Feature index | Recorded caller: hub for hub entry, originating page for direct navigation |
| Help topic or reference | Help index |
| Help modal from Settings | Settings |
| Provider controls, camera, image archive | Conversation |
| Image detail | Image archive |
| Conversation root | Default Android system Back |

Use a leading 48dp arrow from `design-system/navigation/BackButton.tsx`. One `app/navigation/BackNavigation.tsx` provider owns Android events. Parent priority 0, enclosing Agent/Activity/Settings priority 5, embedded Connections priority 10. Current callbacks are held without reordering on rerender. Modal `onRequestClose` delegates directly because native modal presentation suppresses ordinary BackHandler delivery.

The two MOM researchers audited source and official navigation behavior; two existing Orca workers implemented separate feature scopes. MOM reviewed and corrected trailing arrows, nested header duplication, modal cancellation and parent routing, and owns shared controls, shell, channel/provider/media navigation.

Validation distinguishes browser flow exploration from Android behavior. No new mobile tests were authored. The known five Node SettingsStore memory-fallback failures remain unrelated unresolved suite failures. ARTEMIS autonomous execution was previously blocked by provider credits; the user is driving the USB phone. Native keyboard, gesture and hardware-back parity is not claimed from browser observations.

Primary references: [React Native BackHandler](https://reactnative.dev/docs/backhandler), [Modal onRequestClose](https://reactnative.dev/docs/modal#onrequestclose), [Android navigation principles](https://developer.android.com/guide/navigation/principles).

Browser checkpoint (2026-09-19): isolated Edge at 412 x 915 successfully opened and returned from all 34 ordinary submenu routes across Agent, Activity, Settings, Connections and Help. All five feature indexes returned to the hub. Three additional nested paths (Agent to MCP, Activity to Streams, Settings to Connections) each opened Local MCP Server, returned to Connections, returned to the originating index, then returned to the hub. These observations exercise visible arrows, not native system Back. Dirty-form decision branches still need device acceptance.
