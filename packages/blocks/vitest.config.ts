import path from "node:path";
import { defineConfig } from "vitest/config";

// The tests mount the framework from its source, in jsdom, with the same DOM
// stubs its own tests use.
export default defineConfig({
  resolve: {
    alias: { "morphic-blocks": path.resolve(__dirname, "../morphic-blocks/src/index.ts") },
  },
  test: {
    environment: "jsdom",
    include: ["test/**/*.test.ts"],
    setupFiles: ["../morphic-blocks/test/setup-dom.ts"],
  },
});
