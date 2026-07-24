import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  CaptureEmailDeliveryAdapter,
  resolveEmailDeliveryPort,
} from "./capture-email-delivery.adapter.js";
import type { MagicLinkDelivery } from "./email-delivery.port.js";
import { NullEmailDeliveryAdapter } from "./null-email-delivery.adapter.js";

const SAMPLE_DELIVERY: MagicLinkDelivery = {
  email: "buyer@example.com",
  locale: "vi",
  link: "https://app.kitvera.test/vi/auth/magic-link#token=opaque",
};

function readJsonlLines(contents: string): string[] {
  return contents.split("\n").filter((line) => line.length > 0);
}

describe("CaptureEmailDeliveryAdapter", () => {
  let directory: string;
  let captureFile: string;

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), "magic-link-capture-"));
    captureFile = join(directory, "captured-magic-links.jsonl");
  });

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  it("appends the delivery as one JSONL line and reports delivered so the issued token is not revoked", async () => {
    const adapter = new CaptureEmailDeliveryAdapter(captureFile);

    const outcome = await adapter.sendMagicLink(SAMPLE_DELIVERY);

    expect(outcome).toEqual({ status: "delivered" });
    const lines = readJsonlLines(await readFile(captureFile, "utf8"));
    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0] ?? "")).toEqual({
      email: "buyer@example.com",
      locale: "vi",
      link: "https://app.kitvera.test/vi/auth/magic-link#token=opaque",
    });
  });

  it("writes only the MagicLinkDelivery fields and nothing else", async () => {
    const adapter = new CaptureEmailDeliveryAdapter(captureFile);

    await adapter.sendMagicLink(SAMPLE_DELIVERY);

    const [line] = readJsonlLines(await readFile(captureFile, "utf8"));
    const parsed = JSON.parse(line ?? "") as Record<string, unknown>;
    expect(Object.keys(parsed).sort()).toEqual(["email", "link", "locale"]);
  });

  it("appends one newline-delimited line per delivery", async () => {
    const adapter = new CaptureEmailDeliveryAdapter(captureFile);

    await adapter.sendMagicLink({
      ...SAMPLE_DELIVERY,
      email: "first@example.com",
    });
    await adapter.sendMagicLink({
      ...SAMPLE_DELIVERY,
      email: "second@example.com",
    });

    const lines = readJsonlLines(await readFile(captureFile, "utf8"));
    expect(lines).toHaveLength(2);
    expect((JSON.parse(lines[0] ?? "") as MagicLinkDelivery).email).toBe(
      "first@example.com",
    );
    expect((JSON.parse(lines[1] ?? "") as MagicLinkDelivery).email).toBe(
      "second@example.com",
    );
  });
});

describe("resolveEmailDeliveryPort", () => {
  const captureFilePath = "/tmp/kitvera-captured-magic-links.jsonl";

  it("selects the capture adapter outside production when a capture file is configured", () => {
    expect(
      resolveEmailDeliveryPort({ nodeEnv: "test", captureFilePath }),
    ).toBeInstanceOf(CaptureEmailDeliveryAdapter);
    expect(
      resolveEmailDeliveryPort({ nodeEnv: "development", captureFilePath }),
    ).toBeInstanceOf(CaptureEmailDeliveryAdapter);
  });

  it("never selects the capture adapter in production, even with a capture file set", () => {
    expect(
      resolveEmailDeliveryPort({ nodeEnv: "production", captureFilePath }),
    ).toBeInstanceOf(NullEmailDeliveryAdapter);
  });

  it("falls back to the null adapter when no capture file is configured", () => {
    expect(
      resolveEmailDeliveryPort({ nodeEnv: "test", captureFilePath: undefined }),
    ).toBeInstanceOf(NullEmailDeliveryAdapter);
    expect(
      resolveEmailDeliveryPort({ nodeEnv: "development", captureFilePath: "" }),
    ).toBeInstanceOf(NullEmailDeliveryAdapter);
  });
});
