import { z } from "zod";

export const localeSchema = z.enum(["vi", "en"]);
export type Locale = z.infer<typeof localeSchema>;

export const currencySchema = z.enum(["VND", "USD"]);
export type Currency = z.infer<typeof currencySchema>;
