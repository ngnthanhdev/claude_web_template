import { z } from "zod";

export const apiErrorSchema = z
  .object({
    error: z
      .object({
        code: z.string().min(1),
        message: z.string().min(1),
        details: z.record(z.unknown()).optional(),
      })
      .strict(),
  })
  .strict();
export type ApiError = z.infer<typeof apiErrorSchema>;

export const healthResponseSchema = z
  .object({
    status: z.literal("ok"),
  })
  .strict();
export type HealthResponse = z.infer<typeof healthResponseSchema>;

export const cursorPageMetaSchema = z
  .object({
    nextCursor: z.string().min(1).nullable(),
    hasMore: z.boolean(),
  })
  .strict();
export type CursorPageMeta = z.infer<typeof cursorPageMetaSchema>;
