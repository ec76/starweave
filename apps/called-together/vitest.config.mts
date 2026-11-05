import { defineConfig } from "vitest/config";

export default defineConfig({
  oxc: { jsx: { runtime: "automatic" } },
  test: {
    environment: "node",
    include: [
      "server/**/*.test.ts",
      "operators/**/*.test.ts",
      "domain/**/*.test.ts",
    ],
  },
});
