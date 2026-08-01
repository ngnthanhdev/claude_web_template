import {
  Controller,
  Get,
  Inject,
  NotFoundException,
  Param,
  Res,
} from "@nestjs/common";
import type { FastifyReply } from "fastify";

import { LocalStorageAdapter } from "./local-storage.adapter.js";

/**
 * Dev/CI-only adapter route (design §9 "Signed download URL / Info
 * disclosure"). Verifies HMAC signature, TTL, and single-use, then streams
 * the local private artifact. A production deployment never issues a URL
 * pointing at this route — {@link resolveStoragePort} in
 * `local-storage.adapter.ts` fails closed instead of reusing this adapter in
 * production, so the real presigned-object-store URL bypasses this route
 * entirely once a production `StoragePort` is wired.
 */
@Controller("downloads/token")
export class DownloadTokenController {
  constructor(
    @Inject(LocalStorageAdapter)
    private readonly storage: LocalStorageAdapter,
  ) {}

  @Get(":token")
  async download(
    @Param("token") token: string,
    @Res({ passthrough: false }) reply: FastifyReply,
  ): Promise<void> {
    const verified = await this.storage.consume(token);
    if (verified === null) {
      throw new NotFoundException("Download link is invalid or expired");
    }

    const stream = this.storage.fileStream(verified.objectKey);
    await reply
      .header("content-type", "application/octet-stream")
      .header("content-disposition", "attachment")
      .send(stream);
  }
}
