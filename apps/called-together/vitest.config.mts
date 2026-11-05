import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: [
      "server/**/*.test.ts",
      "operators/**/*.test.ts",
      "domain/**/*.test.ts",
    ],
  },
});
