# Spatial and 3D

Use 3D only when spatial interaction communicates product form, configuration, material, fit, assembly, scale, or the core creative proposition.

## Value gate

Proceed only when at least one is true:

- The user can rotate/zoom to inspect meaningful product details.
- The user can configure colour, finish, parts, or variants and see the exact result.
- An exploded or sectional view explains construction or compatibility.
- Spatial navigation is the product experience itself.
- A real-time scene demonstrates a capability that a still cannot.

If none is true, use photography, video, SVG, CSS art, or a pre-rendered still. Decorative spheres, chrome blobs, ambient toruses, and endlessly rotating objects fail.

## Implementation ladder

Choose the lowest sufficient tier:

1. **Pre-rendered still or turntable video:** visual form without interaction.
2. **CSS/SVG pseudo-depth:** simple layered diagrams or material callouts.
3. **Model viewer:** rotate/zoom a compressed product model.
4. **Three.js/WebGL:** configuration, exploded views, custom interaction, or generative scenes.

Do not import a 3D runtime for a still composition.

## Commerce contract

- Keep product name, price, selected variant, stock, and purchase action outside the canvas in semantic HTML.
- Synchronise 3D configuration with the actual commerce variant/SKU state.
- Expose material/colour choices as accessible controls, not canvas-only hotspots.
- Provide text or image equivalents for spatial annotations.
- Never imply colour accuracy, size, or fit beyond the supplied product data.

## Performance and fallback

- Show an intentional poster immediately; lazy-load the model after critical content.
- Compress geometry and textures; prefer glTF/GLB plus Draco/Meshopt and KTX2/Basis where supported.
- Target fewer than 100 draw calls and keep total 3D JS + model + texture transfer below 2 MB unless the user accepts a documented exception.
- Pause rendering when offscreen or the tab is hidden.
- Reduce device pixel ratio and effects on constrained devices.
- Supply a non-WebGL fallback with the same product facts and purchase path.
- The 3D canvas must never become the LCP blocker for the page.

## Interaction and accessibility

- Provide visible Rotate, Zoom, Reset, and configuration controls when applicable.
- Support keyboard and pointer/touch input without trapping focus or scrolling.
- Respect `prefers-reduced-motion`; disable idle rotation and camera choreography.
- Never autoplay sound.
- Avoid scroll-jacking. If scroll controls a sequence, provide an equivalent manual path.
- Announce variant/configuration changes outside the canvas through accessible status text.

## Visual restraint

- Use lighting to reveal material and shape, not to create generic neon spectacle.
- Limit post-processing to one justified effect at restrained intensity.
- Keep the scene palette inside the locked token/product colour system.
- Do not add particles, bloom, fog, or procedural noise unless they encode product behaviour.

## Verification

Test: WebGL available/unavailable, low-power mobile, keyboard-only, reduced motion, slow network, model failure, texture failure, variant switching, add-to-cart after switching, and return navigation. Report fallback and performance evidence honestly.
