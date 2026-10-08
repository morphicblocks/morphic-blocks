import path from "node:path";
import blocklyMedia from "morphic-blocks/vite";
import { defineConfig } from "vite";

export default defineConfig({
  // Copies Blockly's media to public/blockly-media when dev or build starts.
  plugins: [blocklyMedia()],
  resolve: {
    alias: {
      "morphic-blocks": path.resolve(
        __dirname,
        "../../packages/morphic-blocks/src/index.ts",
      ),
    },
  },
});
