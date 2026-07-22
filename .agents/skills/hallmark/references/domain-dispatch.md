# Domain dispatch

Read [`category-taxonomy.md`](category-taxonomy.md) first. This file routes to optional specialist knowledge packs; it is not a whitelist of supported website categories.

## Load a specialist pack only when it matches

| Signals in the composed taxonomy | Specialist pack | Load |
| --- | --- | --- |
| agency, studio, creator, portfolio, multipurpose brand site | Creative and multipurpose | [`domains/creative-and-multipurpose.md`](domains/creative-and-multipurpose.md) |
| product catalogue, storefront, marketplace, subscription shop, digital goods, booking + retail | Commerce | [`domains/commerce.md`](domains/commerce.md) |
| locality, service area, dispatch, appointment, emergency, quote by postcode | Local services | [`domains/local-services.md`](domains/local-services.md) |
| expertise-led B2B, advisory, accounting, legal, consulting, specialist agency | Professional services | [`domains/professional-services.md`](domains/professional-services.md) |

A category without a specialist pack remains fully supported through the taxonomy's decision/proof profile and Hallmark's universal flow. Add a specialist pack only when the domain has recurring, non-obvious rules that cannot fit concisely in the taxonomy.

Use modifiers only when they change information or interaction. Good examples: `commerce × fit-led`, `commerce × ingredient/safety-led`, `professional-services × regulated`, `entertainment × ticketed-event`. Do not turn a product name, one demo, or one implementation platform into a domain.

## Cross-domain rules

- Preserve supplied facts. Do not invent metrics, clients, testimonials, awards, credentials, prices, stock, locations, staff, or service coverage.
- Put decision-critical information before decorative brand storytelling.
- Match CTA commitment to evidence already shown. Do not ask for a phone number before explaining why it is needed.
- Treat desktop and mobile as different decision contexts. Mobile commonly prioritises contact, search, filtering, cart, availability, or directions.
- Use one primary domain and one primary conversion mode. Visual genre and theme remain separate decisions.
- Never reproduce marketplace-demo placeholder copy, fake people, fake logos, or unsupported statistics.

## Generalisation rule

Examples and regression fixtures prove behaviour; they never become the taxonomy. `Mechanical keyboard`, `pet store`, `plumber`, and `consulting` are test inputs. The reusable rules are respectively specification/compatibility-led commerce, ingredient/safety or replenishment commerce, locality/availability services, and expertise-led services.
