export const PAYMENT_PORT = Symbol("PAYMENT_PORT");

export interface PaymentSettlementRequest {
  readonly paymentAttemptId: string;
}

export interface PaymentSettlementOutcome {
  readonly settledAt: Date;
}

/**
 * Abstracts the *trigger* that confirms a `PaymentAttempt` succeeded (design
 * §1/§5/§8). The sandbox adapter implements this now: it trusts an
 * authenticated, CSRF-protected, non-production-only HTTP call, mirroring the
 * capture-email adapter's `NODE_ENV !== "production"` env guard. Production
 * replaces only the trigger with a signature-verified payment webhook — the
 * fulfilment transaction that follows a confirmed settlement is reused
 * unchanged. The production trigger is a go-live blocker and is not
 * implemented by this port.
 */
export interface PaymentPort {
  readonly provider: "sandbox";

  /**
   * Throws when this trigger is not permitted in the current environment.
   * Called before any settlement side effect so a disabled trigger never
   * reaches the fulfilment transaction.
   */
  assertSettlementAllowed(): void;

  /** Confirms the settlement with the provider and reports when it occurred. */
  confirmSettlement(
    request: PaymentSettlementRequest,
  ): Promise<PaymentSettlementOutcome>;
}
