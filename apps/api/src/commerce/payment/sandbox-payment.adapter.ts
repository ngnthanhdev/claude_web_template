import { ForbiddenException, Inject, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import type { Env } from "../../config/env.js";
import type {
  PaymentPort,
  PaymentSettlementOutcome,
  PaymentSettlementRequest,
} from "./payment.port.js";

/**
 * Wave-1 sandbox trigger: a mock two-step "pending → confirm" flow with no
 * real money movement (design §1). It is only ever allowed outside
 * production — {@link SandboxPaymentAdapter.assertSettlementAllowed} enforces
 * that gate the same way {@link resolveEmailDeliveryPort} keeps the
 * capture-email seam out of production.
 */
@Injectable()
export class SandboxPaymentAdapter implements PaymentPort {
  readonly provider = "sandbox" as const;

  constructor(
    @Inject(ConfigService) private readonly config: ConfigService<Env, true>,
  ) {}

  assertSettlementAllowed(): void {
    if (this.config.get("NODE_ENV") === "production") {
      throw new ForbiddenException(
        "Sandbox settlement is disabled outside non-production environments",
      );
    }
  }

  async confirmSettlement(
    request: PaymentSettlementRequest,
  ): Promise<PaymentSettlementOutcome> {
    void request;
    return { settledAt: new Date() };
  }
}
