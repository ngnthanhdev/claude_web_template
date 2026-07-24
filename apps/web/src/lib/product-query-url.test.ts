import { describe, expect, it } from "vitest";

import {
  DEFAULT_PRODUCT_LICENCE,
  decodeProductCollectionUrlState,
  encodeProductCollectionUrlState,
  toggleFacetValue,
  type ProductCollectionUrlState,
} from "./product-query-url";

const enUsd = { locale: "en", currency: "USD" } as const;
const viVnd = { locale: "vi", currency: "VND" } as const;

describe("encodeProductCollectionUrlState", () => {
  it("writes OR-within repeated entries for one facet and AND-across entries for distinct facets", () => {
    const params = encodeProductCollectionUrlState({
      category: ["wordpress"],
      technology: ["react", "vue"],
      licence: "Regular",
    });

    expect(params.getAll("technology")).toEqual(["react", "vue"]);
    expect(params.getAll("category")).toEqual(["wordpress"]);
    expect(params.get("licence")).toBe("Regular");
  });

  it("omits undefined fields and never writes an empty array", () => {
    const params = encodeProductCollectionUrlState({ licence: "Regular" });
    expect(params.toString()).toBe("licence=Regular");
  });

  it("serializes the opaque cursor alongside the rest of the resolved state", () => {
    const params = encodeProductCollectionUrlState({
      licence: "Extended",
      sort: "price-asc",
      cursor: "v1.opaque.signature",
    });

    expect(params.get("cursor")).toBe("v1.opaque.signature");
    expect(params.get("sort")).toBe("price-asc");
  });

  it("percent-encodes a compound compatibility band value", () => {
    const params = encodeProductCollectionUrlState({
      compatibility: ["wordpress@6.x"],
    });

    expect(params.toString()).toContain("compatibility=wordpress%406.x");
  });
});

describe("decodeProductCollectionUrlState", () => {
  it("round-trips a rich collection state through encode -> decode", () => {
    const state: ProductCollectionUrlState = {
      q: "landing page",
      category: ["wordpress", "elementor"],
      technology: ["react"],
      compatibility: ["wordpress@6.x"],
      updatedWithin: "30d",
      minPrice: 100_000,
      maxPrice: 900_000,
      sort: "relevance",
      licence: "Extended",
      limit: 12,
      cursor: "v1.opaque.signature",
    };

    const decoded = decodeProductCollectionUrlState(
      encodeProductCollectionUrlState(state),
      enUsd,
    );

    expect(decoded).toEqual(state);
  });

  it("resolves a fresh (empty) collection view to the fully-defaulted minimal state", () => {
    expect(decodeProductCollectionUrlState("", enUsd)).toEqual({
      licence: DEFAULT_PRODUCT_LICENCE,
      sort: "newest",
      limit: 24,
    });
  });

  it("drops unknown query parameters without disturbing valid state", () => {
    const decoded = decodeProductCollectionUrlState(
      "foo=bar&category=wordpress&unrelated=1",
      enUsd,
    );

    expect(decoded.category).toEqual(["wordpress"]);
    expect(decoded).not.toHaveProperty("foo");
    expect(decoded).not.toHaveProperty("unrelated");
  });

  it("drops an unapproved sort key but keeps the rest of the state", () => {
    const decoded = decodeProductCollectionUrlState(
      "sort=bestseller&category=wordpress",
      enUsd,
    );

    expect(decoded.sort).toBe("newest");
    expect(decoded.category).toEqual(["wordpress"]);
  });

  it("drops a malformed compatibility band while keeping the rest of the state", () => {
    const decoded = decodeProductCollectionUrlState(
      "compatibility=WordPress%406.x&category=wordpress",
      enUsd,
    );

    expect(decoded).not.toHaveProperty("compatibility");
    expect(decoded.category).toEqual(["wordpress"]);
  });

  it("drops only maxPrice when minPrice exceeds it, keeping minPrice", () => {
    const decoded = decodeProductCollectionUrlState(
      "minPrice=500&maxPrice=100",
      enUsd,
    );

    expect(decoded.minPrice).toBe(500);
    expect(decoded).not.toHaveProperty("maxPrice");
  });

  it("drops a too-short search term but keeps the rest of the state", () => {
    const decoded = decodeProductCollectionUrlState(
      "q=x&sort=title-asc",
      enUsd,
    );

    expect(decoded).not.toHaveProperty("q");
    expect(decoded.sort).toBe("title-asc");
  });

  it("treats an empty cursor as absent rather than a continuation token", () => {
    expect(
      decodeProductCollectionUrlState("cursor=", enUsd),
    ).not.toHaveProperty("cursor");
  });

  it("preserves a valid opaque cursor untouched", () => {
    const decoded = decodeProductCollectionUrlState(
      "cursor=v1.opaque.signature",
      enUsd,
    );

    expect(decoded.cursor).toBe("v1.opaque.signature");
  });

  it("defaults an absent licence and preserves an explicit non-default licence", () => {
    expect(decodeProductCollectionUrlState("", enUsd).licence).toBe("Regular");
    expect(
      decodeProductCollectionUrlState("licence=Extended", enUsd).licence,
    ).toBe("Extended");
  });

  it("replaces an invalid licence with the default instead of failing the whole query", () => {
    const decoded = decodeProductCollectionUrlState(
      "licence=Deluxe&category=wordpress",
      enUsd,
    );

    expect(decoded.licence).toBe(DEFAULT_PRODUCT_LICENCE);
    expect(decoded.category).toEqual(["wordpress"]);
  });

  it("never leaks the locale/currency context into the returned state", () => {
    const decoded = decodeProductCollectionUrlState("", enUsd);

    expect(decoded).not.toHaveProperty("locale");
    expect(decoded).not.toHaveProperty("currency");
  });

  it("accepts a URLSearchParams instance directly, not just a string", () => {
    const params = new URLSearchParams("category=html");

    expect(decodeProductCollectionUrlState(params, enUsd).category).toEqual([
      "html",
    ]);
  });

  it("resolves the same non-price state regardless of the locale/currency context", () => {
    const query = "category=shopify&minPrice=100000";

    const en = decodeProductCollectionUrlState(query, enUsd);
    const vi = decodeProductCollectionUrlState(query, viVnd);

    expect(en.category).toEqual(vi.category);
    expect(en.minPrice).toBe(vi.minPrice);
    expect(en.licence).toBe(vi.licence);
  });
});

describe("toggleFacetValue", () => {
  it("adds a value to an empty/undefined facet", () => {
    expect(toggleFacetValue(undefined, "react")).toEqual(["react"]);
  });

  it("appends a second value with OR-within semantics", () => {
    expect(toggleFacetValue(["react"], "vue")).toEqual(["react", "vue"]);
  });

  it("removes an existing value", () => {
    expect(toggleFacetValue(["react", "vue"], "react")).toEqual(["vue"]);
  });

  it("returns undefined, not an empty array, once the last value is removed", () => {
    expect(toggleFacetValue(["react"], "react")).toBeUndefined();
  });
});
