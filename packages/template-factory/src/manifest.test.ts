import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { parseTemplateManifest, templateManifestSchema } from "./manifest.js";
import {
  CONTROLLED_PIPELINE,
  createImmutablePublication,
  getNextPipelineStage,
  type CompletedPipelineGate,
} from "./pipeline.js";

const fixtureUrl = new URL(
  "../fixtures/valid/template.manifest.json",
  import.meta.url,
);

async function readValidFixture(): Promise<unknown> {
  return JSON.parse(await readFile(fileURLToPath(fixtureUrl), "utf8"));
}

const completedGates = CONTROLLED_PIPELINE.slice(0, -1).map((stage) => ({
  stageId: stage.id,
  completedAt: "2026-07-22T06:00:00.000Z",
  evidence: stage.evidence.map((kind) => ({
    kind,
    evidenceId: `evidence-${stage.id}-${kind}`,
    outcome: "passed",
  })),
})) satisfies readonly CompletedPipelineGate[];

const invalidPublicationFields = [
  ["artifactId", ""],
  ["approvedBy", "   "],
  ["approvedAt", "yesterday"],
  ["publishedAt", "tomorrow"],
  ["publishedAt", "2026-07-22T06:15:00.000Z"],
  ["version", "1.2.0-01"],
  ["sha256", "not-a-checksum"],
] satisfies ReadonlyArray<
  readonly [
    (
      | "artifactId"
      | "approvedBy"
      | "approvedAt"
      | "publishedAt"
      | "version"
      | "sha256"
    ),
    string,
  ]
>;

describe("template manifest v1", () => {
  it("validates the provider-neutral manifest fixture", async () => {
    const fixture = await readValidFixture();

    const manifest = parseTemplateManifest(fixture);

    expect(manifest.manifestVersion).toBe("1.0.0");
    expect(manifest.identity.category).toBe("HTML");
    expect(manifest.licenses.regular.identifier).toBe("Regular");
    expect(manifest.licenses.extended.identifier).toBe("Extended");
    expect(manifest.demoPages).toHaveLength(2);
    expect(manifest.buildAdapter.id).toBe("static-site");
  });

  it("rejects invalid SemVer in template and adapter versions", async () => {
    const fixture = parseTemplateManifest(await readValidFixture());
    const invalidVersions = [
      "1.0.0-01",
      "1.0.0-alpha..1",
      "1.0.0+build..x",
      "1.0.0-.",
    ];

    for (const version of invalidVersions) {
      expect(
        templateManifestSchema.safeParse({ ...fixture, version }).success,
        `template version ${version}`,
      ).toBe(false);
      expect(
        templateManifestSchema.safeParse({
          ...fixture,
          buildAdapter: { ...fixture.buildAdapter, version },
        }).success,
        `adapter version ${version}`,
      ).toBe(false);
    }

    expect(
      templateManifestSchema.safeParse({
        ...fixture,
        version: "1.0.0-alpha.1+build.01",
        buildAdapter: {
          ...fixture.buildAdapter,
          version: "2.3.4-rc.0+adapter.7",
        },
      }).success,
    ).toBe(true);
    for (const version of ["1.0.0-1alpha", "1.0.0-123-abc"]) {
      expect(
        templateManifestSchema.safeParse({ ...fixture, version }).success,
        `valid template version ${version}`,
      ).toBe(true);
      expect(
        templateManifestSchema.safeParse({
          ...fixture,
          buildAdapter: { ...fixture.buildAdapter, version },
        }).success,
        `valid adapter version ${version}`,
      ).toBe(true);
    }
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
    const publication = createImmutablePublication({
      completedGates,
      artifactId: "artifact_studio-grid_1.2.0",
      version: "1.2.0",
      sha256: "a".repeat(64),
      sbomId: "sbom_studio-grid_1.2.0",
      documentationId: "docs_studio-grid_1.2.0",
      approvedBy: "reviewer_42",
      approvedAt: "2026-07-22T06:30:00.000Z",
      publishedAt: "2026-07-22T06:45:00.000Z",
    });

    expect(publication.immutable).toBe(true);
    expect(publication.completedStages.at(-1)).toBe("immutable-publish");
    expect(publication.completedGates.map((gate) => gate.stageId)).toEqual(
      publication.completedStages,
    );
    expect(publication.completedGates.at(-1)).toEqual({
      stageId: "immutable-publish",
      completedAt: "2026-07-22T06:45:00.000Z",
      evidence: [
        {
          kind: "immutable artifact identifier",
          evidenceId: "artifact_studio-grid_1.2.0",
          outcome: "passed",
        },
        {
          kind: "published checksum",
          evidenceId: "a".repeat(64),
          outcome: "passed",
        },
      ],
    });
    expect(Object.isFrozen(publication)).toBe(true);
    expect(() =>
      createImmutablePublication({
        completedGates: completedGates.slice(0, 1),
        artifactId: "artifact_studio-grid_1.2.0",
        version: "1.2.0",
        sha256: "a".repeat(64),
        sbomId: "sbom_studio-grid_1.2.0",
        documentationId: "docs_studio-grid_1.2.0",
        approvedBy: "reviewer_42",
        approvedAt: "2026-07-22T06:30:00.000Z",
        publishedAt: "2026-07-22T06:45:00.000Z",
      }),
    ).toThrow(/expected build-install-test/i);
  });

  it("rejects missing gate evidence", () => {
    const gatesWithMissingEvidence = completedGates.map((gate) =>
      gate.stageId === "security-license-scan"
        ? { ...gate, evidence: [] }
        : gate,
    );

    expect(() =>
      createImmutablePublication({
        completedGates: gatesWithMissingEvidence,
        artifactId: "artifact_studio-grid_1.2.0",
        version: "1.2.0",
        sha256: "a".repeat(64),
        sbomId: "sbom_studio-grid_1.2.0",
        documentationId: "docs_studio-grid_1.2.0",
        approvedBy: "reviewer_42",
        approvedAt: "2026-07-22T06:30:00.000Z",
        publishedAt: "2026-07-22T06:45:00.000Z",
      }),
    ).toThrow(/evidence/i);
  });

  it.each(invalidPublicationFields)(
    "rejects invalid publication %s",
    (field, value) => {
      const validInput = {
        completedGates,
        artifactId: "artifact_studio-grid_1.2.0",
        version: "1.2.0",
        sha256: "a".repeat(64),
        sbomId: "sbom_studio-grid_1.2.0",
        documentationId: "docs_studio-grid_1.2.0",
        approvedBy: "reviewer_42",
        approvedAt: "2026-07-22T06:30:00.000Z",
        publishedAt: "2026-07-22T06:45:00.000Z",
      };

      expect(() =>
        createImmutablePublication({ ...validInput, [field]: value }),
      ).toThrow();
    },
  );
});
