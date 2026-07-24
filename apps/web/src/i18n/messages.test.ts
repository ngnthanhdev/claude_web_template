import { describe, expect, it } from "vitest";

import { loadLocaleMessages, mergeMessageTrees } from "./request";

function collectKeys(value: unknown, prefix = ""): string[] {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return [prefix];
  }

  return Object.entries(value).flatMap(([key, nested]) =>
    collectKeys(nested, prefix ? `${prefix}.${key}` : key),
  );
}

describe("locale message directories", () => {
  it("merges every namespace file under messages/<locale>/ into one catalogue", async () => {
    const viMessages = await loadLocaleMessages("vi");
    const enMessages = await loadLocaleMessages("en");

    expect(Object.keys(viMessages)).toContain("Shell");
    expect(Object.keys(enMessages)).toContain("Shell");
  });

  it("keeps the vi and en message catalogues on exactly the same key set", async () => {
    const viMessages = await loadLocaleMessages("vi");
    const enMessages = await loadLocaleMessages("en");

    expect(collectKeys(viMessages).sort()).toEqual(
      collectKeys(enMessages).sort(),
    );
  });

  it("deep-merges nested namespace objects instead of overwriting siblings", () => {
    const merged = mergeMessageTrees(
      { Shell: { skipToContent: "Skip", nested: { a: "1" } } },
      { Shell: { homeLabel: "Home", nested: { b: "2" } }, Extra: { x: "3" } },
    );

    expect(merged).toEqual({
      Shell: {
        skipToContent: "Skip",
        homeLabel: "Home",
        nested: { a: "1", b: "2" },
      },
      Extra: { x: "3" },
    });
  });
});
