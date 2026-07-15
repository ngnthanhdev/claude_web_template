---
name: web-animations
description: Use when implementing an animation in apps/web that motion-design-principles has already decided is worth adding — page/route transitions, scroll-driven effects, gesture interactions (drag/hover/tap), layout animations, stagger, and enter/exit with AnimatePresence, all with a prefers-reduced-motion fallback. This is the Framer Motion recipe library (the HOW); motion-design-principles is the WHETHER/how-much (the taste layer).
---

# web-animations

The recipe library for motion in `apps/web`, built on **Framer Motion** (now
published as the `motion` package, imported from `motion/react`). This skill
hands you correct, current snippets — it does **not** decide whether an
animation belongs. That call is `motion-design-principles`' job: run its
decision checklist first, every time, including for "just a small one." Once
the answer is a real "yes," come here for the implementation.

## Goal

Animations that are cheap, interruptible, and accessible: transform/opacity
only (never width/height/top/left), 150–350ms or a spring, and a
`useReducedMotion()` fallback on every one. The taste constraints
(`motion-design-principles`) and the recipes (here) together keep motion
meaningful rather than decorative.

## Setup

```bash
pnpm --filter @app/web add motion
```

`motion` components are the primitive: `motion.div`, `motion.button`, etc.
accept `initial` / `animate` / `exit` / `transition` / gesture props. This is
the same library formerly named `framer-motion`; `motion/react` is the current
import path.

## Reduced motion — wire this first

Never ship an animation without its reduced-motion branch. The fallback is an
instant state change or a short (~100ms) fade, not "the same animation but
shorter."

```tsx
"use client";
import { motion, useReducedMotion } from "motion/react";

export function FadeIn({ children }: { children: React.ReactNode }) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: "easeOut" }}
    >
      {children}
    </motion.div>
  );
}
```

`initial={false}` skips the entry animation entirely when reduced motion is
requested. Reach for it in every recipe below.

## Enter/exit with `AnimatePresence`

`AnimatePresence` animates elements as they leave the tree — modals, toasts,
list removals. The child needs a stable `key`:

```tsx
import { AnimatePresence, motion } from "motion/react";

<AnimatePresence>
  {open && (
    <motion.div
      key="dialog"
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.96 }}
      transition={{ duration: 0.2 }}
    />
  )}
</AnimatePresence>;
```

## Page / route transitions

Fork by the framework `web-app-foundation` scaffolded.

**Next.js App Router** — a `template.tsx` re-mounts on every navigation
(unlike `layout.tsx`, which persists), so it's the natural place for an
enter transition:

```tsx
// app/template.tsx
"use client";
import { motion, useReducedMotion } from "motion/react";

export default function Template({ children }: { children: React.ReactNode }) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: "easeOut" }}
    >
      {children}
    </motion.div>
  );
}
```

**Vite (SPA router)** — wrap the routed outlet in `AnimatePresence` keyed by
the current path so the old route exits as the new one enters:

```tsx
import { AnimatePresence, motion } from "motion/react";
import { useLocation, useOutlet } from "react-router"; // or TanStack Router equivalent

function AnimatedOutlet() {
  const outlet = useOutlet();
  const { pathname } = useLocation();
  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={pathname}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
      >
        {outlet}
      </motion.div>
    </AnimatePresence>
  );
}
```

`mode="wait"` lets the exit finish before the enter starts — keep these short
(≤250ms) so navigation never feels gated on the animation.

## Scroll-driven animation

`useScroll` gives a motion value tracking scroll progress; `useTransform` maps
it to a style. Prefer the browser's compositor — animate transform/opacity, not
layout.

```tsx
import { motion, useScroll, useTransform } from "motion/react";

function ParallaxHeader() {
  const { scrollY } = useScroll();
  const y = useTransform(scrollY, [0, 300], [0, -60]);
  const opacity = useTransform(scrollY, [0, 300], [1, 0]);
  return <motion.header style={{ y, opacity }} />;
}

// reveal on entering the viewport (once)
<motion.div
  initial={{ opacity: 0, y: 24 }}
  whileInView={{ opacity: 1, y: 0 }}
  viewport={{ once: true, margin: "-10% 0px" }}
  transition={{ duration: 0.3 }}
/>;
```

## Gestures — drag, hover, tap

Gesture responses read best as **springs**, since a spring matches the
physical intuition the gesture sets up.

```tsx
<motion.button
  whileHover={{ scale: 1.03 }}
  whileTap={{ scale: 0.97 }}
  transition={{ type: "spring", stiffness: 400, damping: 25 }}
/>

<motion.div
  drag="x"
  dragConstraints={{ left: -100, right: 100 }}
  dragElastic={0.2}
  onDragEnd={(_, info) => info.offset.x < -80 && onDismiss()}
/>;
```

Keep hover-triggered affordances non-essential — touch devices have no hover
(see `web-responsive`). `whileTap`/`whileFocus` cover the touch and keyboard
paths.

## Layout animations

The `layout` prop animates an element between layout states (reorder, expand,
resize) automatically — Motion measures before/after and tweens the
difference, so you never animate `width`/`height` directly. Share a `layoutId`
to morph one element into another across components (e.g. a thumbnail into a
detail hero):

```tsx
<motion.li layout transition={{ type: "spring", stiffness: 500, damping: 40 }} />

{/* shared element: same layoutId in list and detail */}
<motion.img layoutId={`cover-${id}`} src={src} />
```

## Stagger

Orchestrate children through a parent variant with
`staggerChildren` — one source of timing, not a manual delay per child:

```tsx
const list = { show: { transition: { staggerChildren: 0.06 } } };
const item = { hidden: { opacity: 0, y: 8 }, show: { opacity: 1, y: 0 } };

<motion.ul variants={list} initial="hidden" animate="show">
  {rows.map((r) => (
    <motion.li key={r.id} variants={item} transition={{ duration: 0.2 }} />
  ))}
</motion.ul>;
```

Keep per-child stagger small (~40–80ms) and don't stagger long scrolling
feeds — `motion-design-principles` flags dense-scroll entrances as a restraint
case.

## Timing defaults

- **Duration 150–350ms** for standard UI transitions. Shorter reads as a
  glitch; longer reads as sluggish.
- **Springs** for anything gesture-driven or gesture-adjacent (`type:
  "spring"`); `ease: "easeOut"` timing is fine for simple non-gesture fades.
- **Transform + opacity only.** Animating `width`/`height`/`top`/`left`
  triggers layout on every frame — use `scale`, `x`/`y`, and the `layout` prop
  instead.

## Do

- Run the `motion-design-principles` checklist and get a real "yes" before
  writing any animation here.
- Add a `useReducedMotion()` branch to every animation — instant or ~100ms
  fade when reduced motion is on.
- Animate transform and opacity; use the `layout` prop instead of animating
  box dimensions.
- Use springs for gestures and `AnimatePresence` for exit animations with a
  stable `key`.
- Keep route transitions short (≤250ms) so navigation never waits on motion.

## Don't

- Don't animate `width`/`height`/`top`/`left` — that thrashes layout each
  frame.
- Don't ship an animation without its reduced-motion fallback.
- Don't gate an interaction behind hover alone; pair it with tap/focus.
- Don't give every row in a long feed its own entrance animation.
- Don't re-derive whether to animate here — that decision is
  `motion-design-principles`', and this skill starts only after it says yes.
