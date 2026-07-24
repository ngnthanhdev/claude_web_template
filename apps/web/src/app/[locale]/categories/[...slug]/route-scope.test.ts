import { describe, expect, it } from "vitest";

import { resolveCategoryScope } from "./route-scope";

describe("resolveCategoryScope", () => {
  it("resolves a valid single-segment category with no subcategory", () => {
    expect(resolveCategoryScope(["wordpress"])).toEqual({
      category: "wordpress",
      subcategory: undefined,
    });
  });

  it("resolves a valid nested category/subcategory pair", () => {
    expect(resolveCategoryScope(["wordpress", "landing-pages"])).toEqual({
      category: "wordpress",
      subcategory: "landing-pages",
    });
  });

  it("returns null for an unknown category slug", () => {
    expect(resolveCategoryScope(["not-a-real-category"])).toBeNull();
  });

  it("returns null when more than two segments are supplied", () => {
    expect(
      resolveCategoryScope(["wordpress", "landing-pages", "extra"]),
    ).toBeNull();
  });

  it("returns null for an invalid subcategory slug", () => {
    expect(resolveCategoryScope(["wordpress", "Not A Slug!"])).toBeNull();
  });

  it("returns null when no segments are supplied", () => {
    expect(resolveCategoryScope([])).toBeNull();
  });
});
