import type { MagicLinkInitiationRequest } from "@marketplace/shared/auth";

export const EMAIL_DELIVERY_PORT = Symbol("EMAIL_DELIVERY_PORT");

export interface MagicLinkDelivery {
  readonly email: string;
  readonly locale: MagicLinkInitiationRequest["locale"];
  readonly link: string;
}

export type EmailDeliveryOutcome =
  | { readonly status: "delivered" }
  | { readonly status: "suppressed" };

export interface EmailDeliveryPort {
  sendMagicLink(delivery: MagicLinkDelivery): Promise<EmailDeliveryOutcome>;
}
