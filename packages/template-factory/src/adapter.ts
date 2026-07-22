import type { BuildAdapterIdentity, TemplateManifest } from "./manifest.js";

export type AdapterOperation = "build" | "install-test";

export interface AdapterPlanStep {
  readonly id: string;
  readonly operation: AdapterOperation;
  readonly description: string;
  readonly expectedOutputs: readonly string[];
}

export interface TemplateBuildAdapter {
  readonly identity: BuildAdapterIdentity;
  readonly operations: readonly ["build", "install-test"];
  createPlan(manifest: TemplateManifest): readonly AdapterPlanStep[];
}

export function adapterMatchesManifest(
  adapter: TemplateBuildAdapter,
  manifest: TemplateManifest,
): boolean {
  return (
    adapter.identity.id === manifest.buildAdapter.id &&
    adapter.identity.version === manifest.buildAdapter.version
  );
}
