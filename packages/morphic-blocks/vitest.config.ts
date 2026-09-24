import { defineConfig, mergeConfig } from "vitest/config";
import viteConfig from "./vite.config";

// Tests resolve imports exactly like the library build, and run in jsdom,
// a browser stand-in, because Blockly and the engine need a DOM.
export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      environment: "jsdom",
      include: ["test/**/*.test.ts"],
      setupFiles: ["./test/setup-dom.ts"],
      // Type tests (*.test-d.ts) are checked by the TypeScript compiler. Only
      // errors in test files count: the library source is already type checked
      // by the build, and vite.config.ts lacks Node's type definitions.
      typecheck: { enabled: true, include: ["test/**/*.test-d.ts"], ignoreSourceErrors: true },
    },
  }),
);
