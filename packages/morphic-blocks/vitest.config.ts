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
      // Type tests (*.test-d.ts) are checked by the TypeScript compiler, and a
      // type error anywhere in the project fails the run.
      typecheck: { enabled: true, include: ["test/**/*.test-d.ts"] },
    },
  }),
);
