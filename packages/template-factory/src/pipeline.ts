export const CONTROLLED_PIPELINE = [
  {
    id: "validate-manifest",
    evidence: ["validated manifest"],
    approval: "automated",
  },
  {
    id: "build-install-test",
    evidence: ["adapter build result", "adapter install-test result"],
    approval: "automated",
  },
  {
    id: "browser-axe-visual-qa",
    evidence: [
      "cross-viewport browser result",
      "axe result",
      "visual snapshots",
      "Hallmark fingerprint review",
      "content honesty review",
    ],
    approval: "automated-and-review",
  },
  {
    id: "security-license-scan",
    evidence: [
      "secret scan",
      "dependency scan",
      "malware scan",
      "license scan",
    ],
    approval: "automated",
  },
  {
    id: "package-checksum-sbom-docs",
    evidence: [
      "clean ZIP",
      "SHA-256 checksum",
      "SBOM",
      "changelog",
      "documentation",
    ],
    approval: "automated",
  },
  {
    id: "install-from-zip",
    evidence: ["final ZIP install result", "final ZIP test result"],
    approval: "automated",
  },
  {
    id: "human-approval",
    evidence: ["named visual approver", "approval timestamp"],
    approval: "human",
  },
  {
    id: "immutable-publish",
    evidence: ["immutable artifact identifier", "published checksum"],
    approval: "controlled",
  },
] as const;

export type PipelineStage = (typeof CONTROLLED_PIPELINE)[number];
export type PipelineStageId = PipelineStage["id"];

export interface PipelineGateEvidence {
  readonly kind: string;
  readonly evidenceId: string;
  readonly outcome: "passed";
}

export interface CompletedPipelineGate {
  readonly stageId: PipelineStageId;
  readonly completedAt: string;
  readonly evidence: readonly PipelineGateEvidence[];
}

export function getNextPipelineStage(
  completedStages: readonly PipelineStageId[],
): PipelineStage | null {
  for (const [index, completedStage] of completedStages.entries()) {
    const expectedStage = CONTROLLED_PIPELINE[index];
    if (!expectedStage) {
      throw new Error(
        "Pipeline contains more completed stages than defined gates",
      );
    }
    if (completedStage !== expectedStage.id) {
      throw new Error(
        `Invalid pipeline order: expected ${expectedStage.id}, received ${completedStage}`,
      );
    }
  }

  return CONTROLLED_PIPELINE[completedStages.length] ?? null;
}

declare const immutablePublicationBrand: unique symbol;

export interface ImmutablePublication {
  readonly [immutablePublicationBrand]: "ImmutablePublication";
  readonly immutable: true;
  readonly completedStages: readonly PipelineStageId[];
  readonly completedGates: readonly CompletedPipelineGate[];
  readonly artifactId: string;
  readonly version: string;
  readonly sha256: string;
  readonly sbomId: string;
  readonly documentationId: string;
  readonly approvedBy: string;
  readonly approvedAt: string;
  readonly publishedAt: string;
}
