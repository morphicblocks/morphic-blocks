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
    },
  }),
);
