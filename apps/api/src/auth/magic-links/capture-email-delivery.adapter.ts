import { appendFile } from "node:fs/promises";

import type { Env } from "../../config/env.js";
import type {
  EmailDeliveryOutcome,
  EmailDeliveryPort,
  MagicLinkDelivery,
} from "./email-delivery.port.js";
import { NullEmailDeliveryAdapter } from "./null-email-delivery.adapter.js";

/**
 * Test-only delivery seam. Instead of handing the magic link to a real vendor,
 * it appends each delivery as one JSON line (JSONL) to a file that an
 * out-of-process end-to-end runner can tail. It reports `delivered` so the
 * initiation flow keeps the issued token valid, letting the e2e suite redeem a
 * genuine magic link. It never contacts a real vendor and must only be wired
 * outside production — see {@link resolveEmailDeliveryPort}.
 */
export class CaptureEmailDeliveryAdapter implements EmailDeliveryPort {
  constructor(private readonly captureFilePath: string) {}

  async sendMagicLink(
    delivery: MagicLinkDelivery,
  ): Promise<EmailDeliveryOutcome> {
    const line = JSON.stringify({
      email: delivery.email,
      locale: delivery.locale,
      link: delivery.link,
    });
    await appendFile(this.captureFilePath, `${line}\n`, "utf8");
    return { status: "delivered" };
  }
}

export interface EmailDeliveryResolution {
  readonly nodeEnv: Env["NODE_ENV"];
  readonly captureFilePath: string | undefined;
}

/**
 * Chooses the magic-link email delivery adapter. The capture seam is returned
 * only outside production and only when an explicit capture-file path is set;
 * every other case — including production with the variable somehow present —
 * falls back to the suppress-everything null adapter, so the capture file can
 * never be produced in a production environment.
 */
export function resolveEmailDeliveryPort(
  resolution: EmailDeliveryResolution,
): EmailDeliveryPort {
  const { nodeEnv, captureFilePath } = resolution;
  if (nodeEnv !== "production" && captureFilePath) {
    return new CaptureEmailDeliveryAdapter(captureFilePath);
  }
  return new NullEmailDeliveryAdapter();
}
