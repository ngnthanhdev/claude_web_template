import { z } from "zod";

import { cursorPageMetaSchema } from "./api.js";
import { licenceIdentifierSchema, semanticVersionSchema } from "./catalogue.js";
import { moneySchema } from "./money.js";

const nonEmptyTextSchema = z.string().trim().min(1);

const MAX_CHECKOUT_ITEMS = 20;

export const orderStatusSchema = z.enum(["pending", "settled", "cancelled"]);
export type OrderStatus = z.infer<typeof orderStatusSchema>;

export const paymentAttemptStatusSchema = z.enum([
  "pending",
  "settled",
  "failed",
]);
export type PaymentAttemptStatus = z.infer<typeof paymentAttemptStatusSchema>;

/**
 * Wave-1 seam only: validated as a shape, carries no redemption behavior
 * until the Wave-2 discount/coupon system lands.
 */
export const discountCodeSchema = z
  .string()
  .trim()
  .min(3)
  .max(40)
  .regex(/^[A-Za-z0-9_-]+$/, "must be alphanumeric with - or _");
export type DiscountCode = z.infer<typeof discountCodeSchema>;

export const checkoutItemSchema = z
  .object({
    productId: z.string().uuid(),
    licence: licenceIdentifierSchema,
  })
  .strict();
export type CheckoutItem = z.infer<typeof checkoutItemSchema>;

export const checkoutRequestSchema = z
  .object({
    items: z.array(checkoutItemSchema).min(1).max(MAX_CHECKOUT_ITEMS),
    idempotencyKey: z.string().uuid(),
    discountCode: discountCodeSchema.optional(),
  })
  .strict();
export type CheckoutRequest = z.infer<typeof checkoutRequestSchema>;

export const checkoutResponseSchema = z
  .object({
    orderId: z.string().uuid(),
    status: orderStatusSchema,
    paymentAttemptId: z.string().uuid(),
  })
  .strict();
export type CheckoutResponse = z.infer<typeof checkoutResponseSchema>;

export const orderItemSnapshotSchema = z
  .object({
    productId: z.string().uuid(),
    version: semanticVersionSchema,
    licenceIdentifier: licenceIdentifierSchema,
    titleSnapshot: nonEmptyTextSchema,
    unitPrice: moneySchema,
  })
  .strict();
export type OrderItemSnapshot = z.infer<typeof orderItemSnapshotSchema>;

/**
 * Shared allowlist for both the order summary (list) and order-detail
 * responses (design §9 "Order detail / Information disclosure"): item
 * snapshots plus status only — no payment reference, provider field,
 * idempotency key, owner id, or any other persistence-only field.
 */
export const orderSchema = z
  .object({
    id: z.string().uuid(),
    status: orderStatusSchema,
    items: z.array(orderItemSnapshotSchema).min(1),
  })
  .strict();
export type Order = z.infer<typeof orderSchema>;

export const orderSummarySchema = orderSchema;
export type OrderSummary = Order;

export const orderDetailResponseSchema = orderSchema;
export type OrderDetailResponse = Order;

export const orderCollectionResponseSchema = z
  .object({
    data: z.array(orderSummarySchema),
    meta: cursorPageMetaSchema,
  })
  .strict();
export type OrderCollectionResponse = z.infer<
  typeof orderCollectionResponseSchema
>;

export const entitlementSchema = z
  .object({
    id: z.string().uuid(),
    productId: z.string().uuid(),
    version: semanticVersionSchema,
    createdAt: z.string().datetime({ offset: true }),
  })
  .strict();
export type Entitlement = z.infer<typeof entitlementSchema>;

export const libraryResponseSchema = z
  .object({
    data: z.array(entitlementSchema),
    meta: cursorPageMetaSchema,
  })
  .strict();
export type LibraryResponse = z.infer<typeof libraryResponseSchema>;

export const downloadIssueResponseSchema = z
  .object({
    url: z.string().min(1).max(2_048),
    expiresAt: z.string().datetime({ offset: true }),
  })
  .strict();
export type DownloadIssueResponse = z.infer<typeof downloadIssueResponseSchema>;
