import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { parseTemplateManifest, templateManifestSchema } from "./manifest.js";
import {
  CONTROLLED_PIPELINE,
  createImmutablePublication,
  getNextPipelineStage,
} from "./pipeline.js";

const fixtureUrl = new URL(
  "../fixtures/valid/template.manifest.json",
  import.meta.url,
);

describe("template manifest v1", () => {
  it("validates the provider-neutral manifest fixture", async () => {
    const fixture: unknown = JSON.parse(
      await readFile(fileURLToPath(fixtureUrl), "utf8"),
    );

    const manifest = parseTemplateManifest(fixture);

    expect(manifest.manifestVersion).toBe("1.0.0");
    expect(manifest.identity.category).toBe("HTML");
    expect(manifest.licenses.regular.identifier).toBe("Regular");
    expect(manifest.licenses.extended.identifier).toBe("Extended");
    expect(manifest.demoPages).toHaveLength(2);
    expect(manifest.buildAdapter.id).toBe("static-site");
  });

  it("reports useful paths for malformed manifests", () => {
    const malformed = {
      manifestVersion: "2",
      identity: { id: "Not a slug", name: "", category: "Unknown" },
      version: "latest",
      compatibility: [],
      licenses: {
        regular: { identifier: "Extended", termsVersion: "", grants: [] },
      },
      demoPages: [{ id: "home", title: "Home", path: "https://vendor.test" }],
      buildAdapter: { id: "", version: "edge" },
    };

    const result = templateManifestSchema.safeParse(malformed);

    expect(result.success).toBe(false);
    if (result.success) return;

    const paths = result.error.issues.map((issue) => issue.path.join("."));
    expect(paths).toEqual(
      expect.arrayContaining([
        "manifestVersion",
        "identity.id",
        "identity.name",
        "identity.category",
        "version",
        "compatibility",
        "licenses.regular.identifier",
        "licenses.regular.termsVersion",
        "licenses.regular.grants",
        "licenses.extended",
        "demoPages.0.path",
        "buildAdapter.id",
        "buildAdapter.version",
      ]),
    );
  });
});

describe("controlled release pipeline", () => {
  it("keeps every required gate in release order", () => {
    expect(CONTROLLED_PIPELINE.map((stage) => stage.id)).toEqual([
      "validate-manifest",
      "build-install-test",
      "browser-axe-visual-qa",
      "security-license-scan",
      "package-checksum-sbom-docs",
      "install-from-zip",
      "human-approval",
      "immutable-publish",
    ]);
    expect(getNextPipelineStage([])?.id).toBe("validate-manifest");
    expect(() => getNextPipelineStage(["build-install-test"])).toThrow(
      /expected validate-manifest/i,
    );
  });

  it("creates an immutable publication only after every prior gate", () => {
    const completedStages = CONTROLLED_PIPELINE.slice(0, -1).map(
      (stage) => stage.id,
    );
    const publication = createImmutablePublication({
      completedStages,
      artifactId: "artifact_studio-grid_1.2.0",
      version: "1.2.0",
      sha256: "a".repeat(64),
      sbomId: "sbom_studio-grid_1.2.0",
      documentationId: "docs_studio-grid_1.2.0",
      approvedBy: "reviewer_42",
      approvedAt: "2026-07-22T06:30:00.000Z",
    });

    expect(publication.immutable).toBe(true);
    expect(publication.completedStages.at(-1)).toBe("immutable-publish");
    expect(Object.isFrozen(publication)).toBe(true);
    expect(() =>
      createImmutablePublication({
        completedStages: ["validate-manifest"],
        artifactId: "artifact_studio-grid_1.2.0",
        version: "1.2.0",
        sha256: "a".repeat(64),
        sbomId: "sbom_studio-grid_1.2.0",
        documentationId: "docs_studio-grid_1.2.0",
        approvedBy: "reviewer_42",
        approvedAt: "2026-07-22T06:30:00.000Z",
      }),
    ).toThrow(/expected build-install-test/i);
  });
});
