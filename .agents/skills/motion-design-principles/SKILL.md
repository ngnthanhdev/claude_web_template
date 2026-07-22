---
name: motion-design-principles
description: Use when deciding whether, and how much, to animate a screen or interaction in apps/web — run this before adding any transition, gesture-driven effect, entrance/exit animation, or micro-interaction, and before reaching for the web-animations recipe library. This is the WHEN/WHY (taste) layer, not the HOW (implementation) layer.
---

# motion-design-principles

The taste layer for motion in `apps/web`. `web-animations` is a recipe
library — it will happily hand you a correct Framer Motion snippet for
whatever you ask for, but it never asks *whether you should*. That judgment
call is this skill's job. Run it first, every time, before adding an
animation — including "just a small one."

## When to animate

Animate when motion **communicates meaning** the user would otherwise have
to infer from a static change. Four legitimate reasons:

- **State change** — something became selected, completed, errored, or
  loading, and a transition makes the before/after relationship legible
  (a checkbox filling in, a card flipping to its "done" state).
- **Continuity** — an element's spatial identity persists across a layout
  change, and showing *where it went* is more informative than a cut (a
  list row collapsing into a summary, a thumbnail expanding into a detail
  view).
- **Gesture feedback** — the user is actively dragging, pinching, or
  flinging something; the UI must track their finger in real time or the
  interaction feels broken, not merely undecorated.
- **Purposeful delight** — a rare, high-value moment (onboarding complete,
  a purchase confirmed, an achievement unlocked) where a moment of
  polish is the point. This is the *only* category where "it just feels
  nice" is itself the justification — and it earns that only because it's
  rare.

If a proposed animation doesn't map to one of these four, it's decoration,
not communication — restrain it.

## When to restrain

Default to **no animation, or the smallest one that still works** in these
situations, even if a fancier version is technically easy to build:

- **High-frequency actions** — anything a user does dozens of times per
  session (tapping a like button, opening a list row) accrues the cost of
  its animation every single time; a 300ms flourish on action #40 reads as
  friction, not delight.
- **Dense scrolling** — don't give every row in a long feed its own
  entrance animation; at scroll speed they either blur together
  unnoticed or actively fight the user's scroll momentum.
- **Input-blocking moments** — never let an animation delay the user's
  *next* input (a submit button that plays a 500ms flourish before
  navigating away is 500ms of the user's time spent waiting on decoration).
- **Low-end devices / low battery** — heavy effects (multiple simultaneous
  canvas/WebGL layers, blurs, physics) that are fine on a high-end desktop
  can drop frames or drain battery noticeably on the low-end hardware (older
  laptops, budget phones on mobile browsers) a real user base includes;
  prefer a cheaper fallback over a uniformly "premium" effect everywhere.
- **Reduce Motion is on** — this is the user explicitly telling the OS
  (and every app on it) to minimize motion, usually for vestibular or
  attentional reasons. Treat it as a hard constraint, not a style
  preference to override.

## Hard rules

These apply to every animation that survives the checklist below, no
exceptions:

1. **`useReducedMotion()` fallback is mandatory.** Every animation branches
   on it; the fallback is an instant state change or a short (~100ms) fade,
   never "the same animation but a bit shorter."
2. **Durations: 200–350ms** for standard UI transitions. Shorter reads as
   a glitch; longer reads as sluggish. Purposeful-delight moments (rare, by
   definition) are the only place to deliberately exceed this range.
3. **Springs for anything driven by or responding to a gesture** (drags,
   hover, pointer-follow) — a spring transition (`transition: { type:
   "spring" }`), not a tween, because a spring's motion matches the physical
   intuition a gesture sets up. A tween transition (`type: "tween"` + an
   easing curve) is fine for simple, non-gesture UI feedback (a fade, a
   color change).
4. **Cap concurrent heavy effects.** No more than one or two GPU-heavy
   effects (canvas/WebGL layers, blurs, particle bursts) active on screen at
   once. Stacking them because each one individually seemed cheap is how a
   screen ends up janky.
5. **Keep the work off React's render cycle.** Anything tracking a gesture
   or running every frame belongs in a motion value (`useMotionValue`,
   `useTransform`, imperative `animate()` calls) — never mirrored into React
   state via `setState` on every frame.

## Decision checklist

Run this, in order, before adding any animation. Stop at the first "no" —
that's your answer.

1. **Does it communicate one of the four legitimate reasons** (state
   change, continuity, gesture feedback, purposeful delight)? If it's
   "because it would look cool," that's not yet a reason — go back and ask
   what it's communicating, or drop it.
2. **Is this a high-frequency surface** (a row in a long list, a
   frequently-tapped control)? If yes, either drop the animation or make it
   materially cheaper/shorter than you'd default to.
3. **Does it block the user's next input?** If the animation sits between
   the user and what they want to do next, cut its duration to the
   minimum or run it concurrently with the transition rather than before
   it.
4. **Have you accounted for `useReducedMotion()`?** If not, that's a
   blocking gap, not a follow-up task — add the fallback branch now.
5. **Does it fit the 200–350ms window** (or is it one of the rare
   purposeful-delight exceptions, and is it actually rare)?
6. **Is a spring the right driver** (gesture-adjacent) or is `withTiming`
   simpler and sufficient (non-gesture UI feedback)?
7. **How many other heavy effects are already active on this screen?** If
   adding this one would exceed one-or-two concurrent heavy effects, cut
   an existing one or simplify this one first.
8. **Will the driving computation live in a motion value**
   (`useMotionValue`/`useTransform`), with no per-frame `setState` call? If
   the plan involves mirroring a shared value into React state every frame,
   redesign it before writing code.

Only once every question above has a satisfying answer does the decision
become "yes, animate it" — and at that point, this skill's job is done.

## Handoff

Once the answer is yes: stop reasoning about *whether*, and go implement
*how* using `web-animations` — it has the setup steps (Framer Motion
install), the `useReducedMotion()` snippet, and canonical recipes
(scroll-driven parallax cards, layout-morph transitions, gesture
interactions, carousels, canvas effects) ready to adapt. Don't re-derive
Framer Motion API details here; this skill's scope ends at the decision.

## Do

- Ask "what does this communicate?" before "how do I build this?"
- Default to restraint on high-frequency, dense-scroll, and
  input-blocking surfaces.
- Treat Reduce Motion and low-end-device constraints as hard limits, not
  style choices.
- Run the full decision checklist even for a "small" animation — small
  animations are exactly the ones that get added without review and pile
  up into a janky screen.

## Don't

- Don't animate because a component happens to support `initial`/`animate`/
  `exit` props — availability isn't justification.
- Don't give every list row its own entrance animation in a scrollable
  feed.
- Don't ship an animation without its `useReducedMotion()` fallback branch.
- Don't stack several purposeful-delight effects on the same screen —
  their value comes from rarity.
- Don't proceed to `web-animations` before this checklist has an
  actual "yes" — "the user asked for animations" is not the same as
  "this specific effect passed the checklist."
