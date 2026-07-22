import { fileURLToPath, URL } from "node:url";

import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@marketplace/shared/api": fileURLToPath(
        new URL("../../packages/shared/src/api.ts", import.meta.url),
      ),
    },
  },
  test: {
    env: {
      CORS_ORIGIN: "http://localhost:3001",
      DATABASE_URL: "postgresql://database.invalid/marketplace_test",
      NODE_ENV: "test",
    },
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
