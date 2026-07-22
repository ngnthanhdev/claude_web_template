import { z } from "zod";

import { semanticVersionSchema } from "./manifest.js";

const isoDatetimeSchema = z.string().datetime({ offset: true });

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

function validateCompletedGate(
  gate: CompletedPipelineGate,
  stage: PipelineStage,
): void {
  if (gate.stageId !== stage.id) {
    throw new Error(
      `Cannot publish: expected ${stage.id}, received ${gate.stageId}`,
    );
  }
  if (!isoDatetimeSchema.safeParse(gate.completedAt).success) {
    throw new Error(
      `Cannot publish: ${gate.stageId} completedAt must be an ISO datetime`,
    );
  }
  for (const evidenceKind of stage.evidence) {
    const evidence = gate.evidence.find((entry) => entry.kind === evidenceKind);
    if (
      !evidence ||
      evidence.outcome !== "passed" ||
      !evidence.evidenceId.trim()
    ) {
      throw new Error(
        `Cannot publish: ${gate.stageId} requires passed evidence for ${evidenceKind}`,
      );
    }
  }
}

export interface ImmutablePublicationInput {
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

export interface ImmutablePublication {
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

export function createImmutablePublication(
  input: ImmutablePublicationInput,
): ImmutablePublication {
  const completedStages = input.completedGates.map((gate) => gate.stageId);
  const nextStage = getNextPipelineStage(completedStages);
  if (nextStage?.id !== "immutable-publish") {
    const expected = nextStage?.id ?? "no additional stage";
    throw new Error(`Cannot publish: expected ${expected}`);
  }
  for (const [index, gate] of input.completedGates.entries()) {
    const stage = CONTROLLED_PIPELINE[index];
    if (!stage) {
      throw new Error("Cannot publish: unexpected completed gate");
    }
    validateCompletedGate(gate, stage);
  }

  if (!input.artifactId.trim()) {
    throw new Error("Cannot publish: artifactId must not be empty");
  }
  if (!input.approvedBy.trim()) {
    throw new Error("Cannot publish: approvedBy must not be empty");
  }
  if (!isoDatetimeSchema.safeParse(input.approvedAt).success) {
    throw new Error("Cannot publish: approvedAt must be an ISO datetime");
  }
  if (!isoDatetimeSchema.safeParse(input.publishedAt).success) {
    throw new Error("Cannot publish: publishedAt must be an ISO datetime");
  }
  if (Date.parse(input.publishedAt) < Date.parse(input.approvedAt)) {
    throw new Error("Cannot publish: publishedAt must not precede approvedAt");
  }
  if (!semanticVersionSchema.safeParse(input.version).success) {
    throw new Error("Cannot publish: version must be valid SemVer");
  }
  if (!/^[a-f0-9]{64}$/.test(input.sha256)) {
    throw new Error(
      "Cannot publish: sha256 must be 64 lowercase hexadecimal characters",
    );
  }
  if (!input.sbomId.trim() || !input.documentationId.trim()) {
    throw new Error(
      "Cannot publish: SBOM and documentation identifiers are required",
    );
  }

  const prerequisiteGates = Object.freeze(
    input.completedGates.map((gate) =>
      Object.freeze({
        ...gate,
        evidence: Object.freeze(
          gate.evidence.map((evidence) => Object.freeze({ ...evidence })),
        ),
      }),
    ),
  );
  const publicationGate: CompletedPipelineGate = Object.freeze({
    stageId: "immutable-publish",
    completedAt: input.publishedAt,
    evidence: Object.freeze([
      Object.freeze({
        kind: "immutable artifact identifier",
        evidenceId: input.artifactId,
        outcome: "passed",
      }),
      Object.freeze({
        kind: "published checksum",
        evidenceId: input.sha256,
        outcome: "passed",
      }),
    ]),
  });
  const immutablePublishStage = CONTROLLED_PIPELINE.at(-1);
  if (
    !immutablePublishStage ||
    immutablePublishStage.id !== "immutable-publish"
  ) {
    throw new Error(
      "Cannot publish: immutable publication gate is not configured",
    );
  }
  validateCompletedGate(publicationGate, immutablePublishStage);
  const completedGates = Object.freeze([...prerequisiteGates, publicationGate]);
  const publicationStages = Object.freeze(
    completedGates.map((gate) => gate.stageId),
  );
  return Object.freeze({
    immutable: true,
    completedStages: publicationStages,
    completedGates,
    artifactId: input.artifactId,
    version: input.version,
    sha256: input.sha256,
    sbomId: input.sbomId,
    documentationId: input.documentationId,
    approvedBy: input.approvedBy,
    approvedAt: input.approvedAt,
    publishedAt: input.publishedAt,
  });
}
