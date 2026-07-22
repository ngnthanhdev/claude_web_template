import {
  createHash,
  createHmac,
  timingSafeEqual,
} from "node:crypto";

import { Inject, Injectable } from "@nestjs/common";
import type { ProductCollectionQuery } from "@marketplace/shared/catalogue";
import { z } from "zod";

export const CATALOGUE_CURSOR_SIGNING_SECRET = Symbol(
  "CATALOGUE_CURSOR_SIGNING_SECRET",
);

const cursorIdSchema = z.string().uuid();
const cursorInstantSchema = z.string().datetime({ offset: true });
const cursorRankSchema = z.string().regex(/^-?(?:0|[1-9]\d*)(?:\.\d+)?$/);

const catalogueCursorTupleSchema = z.discriminatedUnion("sort", [
  z
    .object({
      sort: z.literal("relevance"),
      rank: cursorRankSchema,
      publishedAt: cursorInstantSchema,
      id: cursorIdSchema,
    })
    .strict(),
  z
    .object({
      sort: z.literal("newest"),
      publishedAt: cursorInstantSchema,
      id: cursorIdSchema,
    })
    .strict(),
  z
    .object({
      sort: z.literal("recently-updated"),
      updatedAt: cursorInstantSchema,
      id: cursorIdSchema,
    })
    .strict(),
  z
    .object({
      sort: z.literal("price-asc"),
      amount: z.number().int().nonnegative().safe(),
      id: cursorIdSchema,
    })
    .strict(),
  z
    .object({
      sort: z.literal("price-desc"),
      amount: z.number().int().nonnegative().safe(),
      id: cursorIdSchema,
    })
    .strict(),
  z
    .object({
      sort: z.literal("title-asc"),
      title: z.string().min(1).max(240),
      id: cursorIdSchema,
    })
    .strict(),
]);

export type CatalogueCursorTuple = z.infer<typeof catalogueCursorTupleSchema>;

const signedCursorPayloadSchema = z
  .object({
    version: z.literal(1),
    fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
    tuple: catalogueCursorTupleSchema,
  })
  .strict();

type RepeatableQueryKey =
  | "category"
  | "subcategory"
  | "technology"
  | "templateType"
  | "pageType"
  | "industry"
  | "feature"
  | "compatibility";

const repeatableQueryKeys = [
  "category",
  "subcategory",
  "technology",
  "templateType",
  "pageType",
  "industry",
  "feature",
  "compatibility",
] satisfies readonly RepeatableQueryKey[];

function normalizedFingerprintInput(query: ProductCollectionQuery) {
  const repeatable = Object.fromEntries(
    repeatableQueryKeys.map((key) => [
      key,
      query[key] === undefined
        ? undefined
        : [...new Set(query[key])].sort(),
    ]),
  );

  return {
    locale: query.locale,
    currency: query.currency,
    licence: query.licence,
    q: query.q,
    ...repeatable,
    updatedWithin: query.updatedWithin,
    minPrice: query.minPrice,
    maxPrice: query.maxPrice,
    sort: query.sort,
    limit: query.limit,
  };
}

function fingerprint(query: ProductCollectionQuery): string {
  return createHash("sha256")
    .update(JSON.stringify(normalizedFingerprintInput(query)))
    .digest("hex");
}

export class CatalogueCursorValidationError extends Error {
  constructor() {
    super("Invalid catalogue cursor");
    this.name = "CatalogueCursorValidationError";
  }
}

@Injectable()
export class CatalogueCursor {
  private readonly secret: Buffer;

  constructor(@Inject(CATALOGUE_CURSOR_SIGNING_SECRET) secret: string) {
    const decoded = Buffer.from(secret, "base64url");
    if (
      !/^[A-Za-z0-9_-]{43}$/.test(secret) ||
      decoded.length !== 32 ||
      decoded.toString("base64url") !== secret
    ) {
      throw new Error(
        "Catalogue cursor signing secret must be canonical base64url for 32 bytes",
      );
    }
    this.secret = decoded;
  }

  encode(
    query: ProductCollectionQuery,
    tuple: CatalogueCursorTuple,
  ): string {
    if (tuple.sort !== query.sort) {
      throw new Error("Cursor ordering tuple does not match the query sort");
    }

    const body = Buffer.from(
      JSON.stringify({
        version: 1,
        fingerprint: fingerprint(query),
        tuple,
      }),
      "utf8",
    ).toString("base64url");
    const signature = this.sign(body);
    return `v1.${body}.${signature}`;
  }

  decode(
    token: string,
    query: ProductCollectionQuery,
  ): CatalogueCursorTuple {
    if (token.length > 4096) throw new CatalogueCursorValidationError();

    const [prefix, body, signature, extra] = token.split(".");
    if (
      prefix !== "v1" ||
      body === undefined ||
      signature === undefined ||
      extra !== undefined ||
      !/^[A-Za-z0-9_-]+$/.test(body) ||
      !/^[A-Za-z0-9_-]+$/.test(signature)
    ) {
      throw new CatalogueCursorValidationError();
    }

    const expected = Buffer.from(this.sign(body), "utf8");
    const received = Buffer.from(signature, "utf8");
    if (
      expected.length !== received.length ||
      !timingSafeEqual(expected, received)
    ) {
      throw new CatalogueCursorValidationError();
    }

    try {
      const json: unknown = JSON.parse(
        Buffer.from(body, "base64url").toString("utf8"),
      );
      const payload = signedCursorPayloadSchema.parse(json);
      if (
        payload.fingerprint !== fingerprint(query) ||
        payload.tuple.sort !== query.sort
      ) {
        throw new CatalogueCursorValidationError();
      }
      return payload.tuple;
    } catch (error: unknown) {
      if (error instanceof CatalogueCursorValidationError) throw error;
      throw new CatalogueCursorValidationError();
    }
  }

  private sign(body: string): string {
    return createHmac("sha256", this.secret).update(body).digest("base64url");
  }
}
