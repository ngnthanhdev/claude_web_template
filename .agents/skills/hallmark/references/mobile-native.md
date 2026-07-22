# Mobile native — iOS, Android, React Native, and Flutter

Load this file when the target is SwiftUI/UIKit, Jetpack Compose/Android Views, React Native, Expo, or Flutter. Native scope is a separate platform route, not “web at 390 px”. Web-only rules about CSS, browser chrome, hover, nav/footer archetypes, hero folds, and HTML breakpoints do not apply.

Use current official platform guidance as the authority: [Apple HIG](https://developer.apple.com/design/human-interface-guidelines/), [Android accessibility](https://developer.android.com/guide/topics/ui/accessibility/principles), [Android adaptive apps](https://developer.android.com/develop/ui/compose/build-adaptive-apps), [React Native accessibility](https://reactnative.dev/docs/accessibility), and [Flutter adaptive/responsive design](https://docs.flutter.dev/ui/adaptive-responsive).

## Platform dispatch

Detect from project files before choosing components:

- `*.xcodeproj`, `Package.swift`, SwiftUI/UIKit imports → **iOS/iPadOS**.
- `build.gradle*`, `AndroidManifest.xml`, Compose imports → **Android**.
- `react-native` or Expo dependencies → **React Native**; still branch behavior by `Platform.OS` when platform conventions differ.
- `pubspec.yaml` with Flutter → **Flutter**; adapt components and idioms per target platform.

State the route and target form factors. If the repository supports multiple platforms, preserve shared tokens but emit platform-specific navigation, system controls, semantics, and feedback. Pixel-identical cross-platform output is not the goal.

## Shared native contract

1. Respect safe areas, system bars, keyboard/insets, display cutouts, rounded corners, and fold/hinge regions.
2. Use system navigation and controls before recreating them. Preserve back behavior, modal dismissal, tab semantics, selection, text editing, share sheets, pickers, and permission flows.
3. Touch is primary; hover is optional capability, never required. Every gesture has a discoverable control or accessibility action.
4. Typography follows user scaling. Test the largest accessibility text categories, not only the default screenshot.
5. Support screen reader labels, roles, values, states, headings, traversal order, live announcements, and custom actions where gestures would otherwise be exclusive.
6. Do not rely on color, haptic, motion, or sound alone. Haptics confirm meaningful state changes and never decorate every tap.
7. Loading, offline, reconnecting, stale, partial, permission-denied, backgrounded, interrupted, and conflict states are first-class.
8. Preserve user input through rotation, process recreation where applicable, background/foreground transitions, and navigation.
9. Request permissions in context, explain the value before the system prompt when needed, and provide a route to Settings after denial.
10. Test localization, RTL, long text, keyboard, orientation/window resize, dark mode, high contrast, reduce motion, bold text, and screen readers.

## iOS / iPadOS route

- Use SwiftUI/UIKit semantic components and system materials; do not draw fake iOS controls.
- Layout against safe areas and readable content guides. Apple explicitly treats safe areas as essential around bars, hardware cutouts, and Dynamic Island.
- Support Dynamic Type and content reflow; avoid fixed-height text containers. Test accessibility categories and both light/dark appearances.
- Preserve swipe-back/navigation conventions and provide visible alternatives for custom gestures.
- Prefer standard sheets, alerts, menus, pickers, toolbars, tab bars, and navigation stacks. Custom presentation must retain dismissal and VoiceOver behavior.
- iPad is resizable application UI, not a stretched phone. Use adaptive navigation, list-detail/inspector layouts, keyboard shortcuts, pointer states, and multiwindow-aware composition where the product calls for them.
- Respond to Reduce Motion, Reduce Transparency, Increase Contrast, Bold Text, VoiceOver, Switch Control, and Full Keyboard Access.
- Keep content behind translucent/material surfaces readable; system material is a hierarchy tool, not decoration.

## Android route

- Prefer Material/Compose components and their built-in semantics before custom drawing.
- Minimum touch target is 48×48 dp; visual affordances may be smaller only when the focusable/touch area remains at least that size and does not overlap adjacent targets.
- Use edge-to-edge layouts with correct system-bar and IME insets; never hide content beneath them.
- Handle predictive/system back and preserve navigation state. Do not replace Android back behavior with an iOS-only mental model.
- Build adaptive layouts using window size classes and canonical list-detail/supporting-pane patterns where appropriate. Foldables, desktop windowing, landscape, and split-screen are runtime states.
- Provide TalkBack semantics, unique labels, state descriptions, collection information, headings, and custom accessibility actions for swipe/drag behaviors.
- Use cues beyond color and test Accessibility Scanner, TalkBack, font scaling, display size, high contrast, and switch/keyboard access.

## React Native route

- Native semantics are explicit: use `accessible`, `accessibilityLabel`, `accessibilityRole`, `accessibilityState`, `accessibilityValue`, and platform-specific props only where required.
- Test both VoiceOver and TalkBack; their grouping and focus behavior differ. One platform passing is not evidence for the other.
- Use maintained safe-area/inset handling for the project stack; do not rely on web CSS assumptions or deprecated patterns.
- Use `KeyboardAvoidingView`/inset-aware composition intentionally and verify forms with hardware and software keyboards.
- `Pressable` states include pressed, disabled, loading, error, and success semantics. `hitSlop` cannot rescue a target clipped by its parent or overlapping siblings.
- Branch platform idioms with `Platform` only when behavior genuinely differs; keep shared domain logic and design tokens platform-neutral.
- Respond to accessibility preferences through `AccessibilityInfo`, including screen reader and reduced-motion/cross-fade signals supported by the target version.

## Flutter route

- Responsive means fitting; adaptive means remaining usable by selecting the right layout, navigation, and input model for the space.
- Use `SafeArea`, `MediaQuery`, constraints, and adaptive navigation rather than device-name checks.
- Prefer Material or Cupertino semantics for the active platform, then apply brand tokens without erasing platform behavior.
- Use `Semantics`, `MergeSemantics`, focus traversal, shortcuts/actions, and accessible custom painters.
- Test text scaling, RTL, keyboard/pointer/touch, foldables, desktop-sized windows, and platform-specific button ordering/context-menu behavior.

## Native state matrix

Every emitted screen documents and implements applicable states:

| System state | Required behavior |
| --- | --- |
| First load / refresh | preserve structure; announce progress without blocking escape/back |
| Offline / reconnecting | show what remains available, queue policy, retry, freshness |
| Background / resume | restore context; revalidate sensitive or stale data |
| Keyboard shown | focused field and primary action remain visible |
| Permission denied | explain impact and recovery route; no repeated prompt loop |
| Deep link / notification | land at valid state with back path and auth recovery |
| Large text | reflow without clipping or hiding actions |
| Rotation / resize / fold | preserve task, selection, scroll, draft, and navigation |

## Native verification contract

Do not stamp “verified” from source inspection alone. Report evidence separately:

- **Static:** native lint/analyzer, semantics declarations, token checks.
- **Simulator/emulator:** smallest/largest supported size, orientations/resizable widths, keyboard, dark mode, largest text, reduced motion.
- **Assistive tech:** VoiceOver on device for iOS; TalkBack on Android emulator/device; keyboard/switch paths where supported.
- **Interaction:** back/dismiss, interruption, offline, permission denial, deep link, state restoration.
- **Not run:** name any platform check the environment could not execute.

The native stamp is `Hallmark · scope: native · platform: <platform> · form-factors: <targets> · verification: <evidence>`. Never reuse the web marketing stamp.
