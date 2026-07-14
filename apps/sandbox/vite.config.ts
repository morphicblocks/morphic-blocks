import path from "node:path";
import { defineConfig } from "vite";

export default defineConfig({
  resolve: {
    alias: {
      "morphic-blocks": path.resolve(
        __dirname,
        "../../packages/morphic-blocks/src/index.ts",
      ),
    },
  },
});
