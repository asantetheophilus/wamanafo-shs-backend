import { defineConfig } from "vitest/config";
import { resolve } from "path";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
  },
  resolve: {
    alias: {
      // Map @/ to src/ for test files that still use @/ notation
      "@": resolve(__dirname, "src"),
    },
  },
});
