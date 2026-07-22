# Data visualization — decision-first charts

Load when the requested UI contains charts, plots, maps, funnels, cohorts, distributions, telemetry, financial series, or analytical comparison.

## Start with the question

Choose the visual form from the decision, not from a gallery:

| Question | Preferred forms | Avoid |
| --- | --- | --- |
| Compare categories | sorted bar, dot plot, small table | pie/donut with many slices |
| Change over time | line, step line, small multiples | smoothed curves that imply false values |
| Distribution | histogram, box/violin with explanation, ECDF | averaged KPI alone |
| Part-to-whole | stacked bar for few stable parts | 3D pie, nested donuts |
| Relationship | scatter with trend/context | dual-axis lines implying correlation |
| Flow | restrained Sankey only when flow is the question | decorative alluvial spaghetti |
| Status/threshold | bullet chart, banded line, table with sparklines | gauges and speedometers |

If a precise lookup matters more than shape, use a table. If many series need comparison, prefer small multiples over one dense chart.

## Encoding hierarchy

Position on a shared scale is strongest. Then position on separate scales, length, angle, area, and finally color intensity. Do not encode the primary comparison only by area or hue when position is available.

- One accent highlights the decision-relevant series; context series stay neutral.
- Categorical palettes remain distinguishable in common color-vision deficiencies.
- Sequential values use a monotonic lightness scale. Diverging color requires a meaningful midpoint.
- Never use red/green alone for state; pair with text, shape, position, or pattern.
- Gridlines support reading and stay quieter than data. Remove borders and legends that do not earn their ink.

## Truth and uncertainty

- Axes name units. Truncated axes are explicit and never used to exaggerate bars.
- Time zones, aggregation window, sampling, missing data, and freshness are visible when they affect interpretation.
- Missing is not zero. Estimated, partial, stale, suppressed, and unavailable values have distinct treatments.
- Confidence intervals or error bands appear when the measure is uncertain; do not present a single precise line as certainty.
- Forecasts are visually and semantically separated from observations.
- Tooltips supplement labels; essential meaning cannot require hover.

## Interaction and accessibility

- Chart has an accessible name and a one-sentence summary of the main pattern.
- Provide an equivalent data table or structured list for detailed values.
- Keyboard users can traverse interactive marks in a meaningful order without hundreds of tab stops; aggregate or offer table mode for dense series.
- Focused marks expose series, x value, y value, unit, and status.
- Zoom/brush/filter actions have visible reset and do not trap scroll or keyboard focus.
- Motion never changes the apparent value and respects reduced motion.

## Dashboard composition

- Lead with exceptions and decisions, not a wall of equally sized KPI cards.
- A KPI includes definition, period, comparison basis, freshness, and drill-down when those are material.
- Related charts share scales and alignment. Repeated panels use small multiples with consistent domains.
- Color semantics remain stable across the dashboard: “failed” cannot be red in one chart and orange in another.
- Avoid rainbow palettes, chart shadows, 3D, excessive gradients, dense gridlines, dual axes, and auto-cycling dashboards.

## Verification

Test at realistic minimum, normal, and maximum data volumes. Include long labels, negative values, zeros, missing points, one-point series, all-equal data, outliers, localization expansion, and narrow screens. The empty-state fixture is not evidence that a data visualization works.
