# Commerce

Use for direct-to-consumer shops, technical-product catalogues, large retail catalogues, marketplaces, and vertical commerce such as pet stores. Route first by catalogue complexity and buyer decision model.

## Emit the commerce plan before design

State these decisions in one compact block:

- Commerce mode: niche DTC, technical products, large catalogue, marketplace, or vertical hybrid.
- Primary buyer decision: taste, specifications, compatibility, price, trust, availability, replenishment, or discovery.
- Primary conversion: direct commerce or discovery.
- Required proof: product facts, reviews, provenance, seller trust, policy, demonstration, or comparison.
- Art direction: one direction from [`../style-directions.md`](../style-directions.md), or the normal Hallmark genre/theme route when no expressive direction is requested.
- 3D decision: none, still/video, model viewer, or interactive configuration; load [`../spatial-3d.md`](../spatial-3d.md) for the last two.

Example: `Commerce: technical products · decision: compatibility + switch feel · conversion: direct commerce · proof: specs + comparison + real reviews · direction: technical industrial · 3D: interactive switch exploded view.`

## Select one commerce mode

### Niche direct-to-consumer

Use for a focused brand or product family. Lead with product difference, material/use evidence, variant clarity, and low-friction purchase.

Typical sequence: product proposition → featured collection → differentiators/specs → use/lifestyle proof → reviews → policies → collection CTA.

### Technical products

Use when compatibility, switches, dimensions, materials, performance, or configuration drive the decision.

- Surface critical specifications before lifestyle copy.
- Provide comparison, compatibility, availability, and variant relationships.
- Use F3 Tabular Spec Sheet for decision facts and F6 Product Card Grid for inventory.
- Preserve technical labels; do not replace precise language with marketing adjectives.

### Large catalogue / retail

Use when discovery, search, filtering, promotions, and category navigation dominate.

- Prioritise search, taxonomy, recent/featured collections, price/stock, and state persistence.
- Use N11 Mega-menu or N13 Search Pill when destination count justifies it.
- Use Catalogue or Ecosystem Index macrostructure; do not force a linear landing narrative over hundreds of products.

### Marketplace

Use when products come from multiple vendors or sellers.

- Make seller identity, rating source, fulfilment owner, return responsibility, fees, and dispute path explicit.
- Separate platform trust from seller trust.
- Add vendor and marketplace states: seller unavailable, item delisted, partial fulfilment, mixed cart, and policy conflict.
- Discovery is commonly the primary funnel; direct commerce becomes primary on product detail.

### Vertical commerce: pet care

Treat playful imagery as a category cue, not the architecture. Support pet type, life stage, breed/size where relevant, dietary/health constraints, replenishment cadence, and service booking only when the business actually provides it.

- Do not imply veterinary outcomes without evidence.
- Separate retail purchase from grooming, boarding, or appointment flows.
- Keep safety, ingredients, sizing, delivery, and returns near purchase.

## Core page contracts

### Home / campaign entry

- Give the buyer a meaningful route into inventory: category, use case, collection, compatibility, or a hero product.
- Use brand story only when it reduces product risk or increases perceived value.
- Keep campaign content distinct from persistent price, stock, policy, and navigation facts.
- Do not repeat the same product grid under multiple headings to simulate depth.

### Collection/listing

- Search or category context remains visible.
- Filters expose active count, clear-all, zero-result recovery, loading, and mobile drawer behaviour.
- Sort labels describe outcomes, not internal field names.
- Product cards show only decision-critical facts; do not turn every card into a miniature product page.

### Product detail

- Product name, price, selected variant, stock/availability, media, delivery/return facts, and purchase action remain coherent.
- Variant changes update image, price, stock, SKU, and URL/state together.
- Sticky add-to-cart may appear only after the primary purchase area leaves view and must reflect the current variant.
- Reviews identify count and source; an empty review state is not five decorative stars.

### Cart

- Support quantity, removal/undo, stock changes, shipping estimate, discounts, errors, and mixed fulfilment where applicable.
- Preserve the cart across navigation and refresh.
- Do not let newsletter capture or upsells outrank checkout.

### Checkout boundary

- Preserve item, variant, quantity, price, discount, shipping, tax, and total consistency.
- Never visually hide fees until the last step.
- Keep guest checkout available unless the business explicitly requires an account for a supplied reason.
- Provide recovery for payment failure, address validation, stock change, session expiry, and duplicate submission.

## Art-direction fit

- Niche craft/lifestyle products may use Quiet luxury, Editorial retail, Tactile organic, Vivid pop, or Maximal collage according to real brand/product signals.
- Technical products favour Technical industrial, Spatial product, or restrained Editorial retail.
- Large catalogues and marketplaces favour Dense marketplace; expressive campaign areas must not weaken search, filtering, or price comparison.
- Pet commerce may use Vivid pop or Tactile organic, but health/safety facts and service boundaries remain sober and explicit.
- Neo-brutal commerce fits confident drop/culture brands, not every discount store.

Load [`../style-directions.md`](../style-directions.md) only when an expressive/trend-led direction is requested. Run [`../default-reflex.md`](../default-reflex.md) after the choice so “trendy” does not become another default.

## 3D in commerce

Use 3D for product inspection, configuration, material/colour switching, exploded construction, fit, or spatial demonstration. Keep price, variant, stock, and purchase controls in semantic HTML and synchronise them with the model. Decorative product rotation, floating chrome blobs, or an ambient WebGL scene without buyer value are prohibited. Follow [`../spatial-3d.md`](../spatial-3d.md).

## Mobile priorities

Search, filter/sort, variant selection, price/availability, cart feedback, and checkout access outrank decorative campaign content. Use 44 px targets, keep active filters visible, and prevent sticky purchase UI from covering product policy or system messages.

## Anti-patterns

- Invented discounts, stock urgency, review counts, delivery dates, badges, or bestseller labels.
- Category menus copied from a demo even when the real inventory lacks those branches.
- Product tiles with only an image and hover-only controls.
- Sticky add-to-cart using a stale or unavailable variant.
- Marketplace cards that hide the seller or fulfilment source.
- Pet imagery used as a substitute for product taxonomy and safety information.
