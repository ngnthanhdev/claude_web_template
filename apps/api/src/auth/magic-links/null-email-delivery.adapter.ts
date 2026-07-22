import { Injectable } from "@nestjs/common";

import type {
  EmailDeliveryOutcome,
  EmailDeliveryPort,
  MagicLinkDelivery,
} from "./email-delivery.port.js";

@Injectable()
export class NullEmailDeliveryAdapter implements EmailDeliveryPort {
  async sendMagicLink(
    delivery: MagicLinkDelivery,
  ): Promise<EmailDeliveryOutcome> {
    void delivery;
    return { status: "suppressed" };
  }
}
