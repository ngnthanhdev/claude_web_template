import fs from "node:fs";
import path from "node:path";

import { hasLocale } from "next-intl";
import { getRequestConfig } from "next-intl/server";

import { routing } from "./routing";

export type MessageNode = string | { [key: string]: MessageNode };
export type MessageTree = { [key: string]: MessageNode };

function isMessageTree(value: MessageNode | undefined): value is MessageTree {
  return typeof value === "object" && value !== null;
}

/**
 * Deep-merges two message trees, combining nested namespace objects instead
 * of letting a later file silently overwrite an earlier one's siblings.
 */
export function mergeMessageTrees(
  target: MessageTree,
  source: MessageTree,
): MessageTree {
  const merged: MessageTree = { ...target };

  for (const [key, sourceValue] of Object.entries(source)) {
    const targetValue = merged[key];
    merged[key] =
      isMessageTree(targetValue) && isMessageTree(sourceValue)
        ? mergeMessageTrees(targetValue, sourceValue)
        : sourceValue;
  }

  return merged;
}

async function loadNamespaceMessages(
  locale: string,
  namespace: string,
): Promise<MessageTree> {
  // The ".json" suffix must stay static in the template literal (rather than
  // folded into `namespace`) so bundler dynamic-import analysis (Vite's
  // `dynamic-import-vars`, webpack/Turbopack's context modules) can resolve
  // this as a glob instead of an unanalyzable fully-dynamic specifier.
  const namespaceModule = (await import(
    `../../messages/${locale}/${namespace}.json`
  )) as { default: MessageTree };
  return namespaceModule.default;
}

/**
 * Loads and deep-merges every JSON file under `messages/<locale>/` into a
 * single message catalogue. Dropping in a new namespace file (e.g.
 * `catalogue.json`) needs no change here — it is discovered automatically.
 *
 * The namespace list comes from a live `fs.readdirSync`, so the raw
 * `messages/` directory must physically exist relative to `process.cwd()`
 * in every environment this runs in — `next dev`/`vitest` (cwd is
 * `apps/web/`) and the `output: "standalone"` production image alike
 * (Next's generated `server.js` `chdir()`s into its own directory, which
 * for this monorepo's standalone output is also `apps/web/`). See
 * `apps/web/Dockerfile` and `outputFileTracingIncludes` in
 * `apps/web/next.config.ts`, which both exist to keep that directory
 * present in the standalone image.
 */
export async function loadLocaleMessages(locale: string): Promise<MessageTree> {
  const messagesDirectory = path.join(process.cwd(), "messages", locale);
  const namespaces = fs
    .readdirSync(messagesDirectory)
    .filter((fileName) => fileName.endsWith(".json"))
    .map((fileName) => fileName.slice(0, -".json".length))
    .sort();

  let messages: MessageTree = {};
  for (const namespace of namespaces) {
    const namespaceMessages = await loadNamespaceMessages(locale, namespace);
    messages = mergeMessageTrees(messages, namespaceMessages);
  }

  return messages;
}

export default getRequestConfig(async ({ requestLocale }) => {
  const requestedLocale = await requestLocale;
  const locale = hasLocale(routing.locales, requestedLocale)
    ? requestedLocale
    : routing.defaultLocale;

  return {
    locale,
    messages: await loadLocaleMessages(locale),
  };
});
