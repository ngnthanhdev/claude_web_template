import { z } from "zod";

import { currencySchema } from "./localization.js";

export const moneySchema = z
  .object({
    amount: z.number().int().nonnegative().safe(),
    currency: currencySchema,
  })
  .strict();
export type Money = z.infer<typeof moneySchema>;
