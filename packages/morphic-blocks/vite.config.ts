import path from "node:path";
import { defineConfig } from "vite";

export default defineConfig({
  build: {
    lib: {
      entry: path.resolve(__dirname, "src/index.ts"),
      name: "MorphicBlocks",
      fileName: "morphic-blocks",
      formats: ["es", "umd"]
    },
    rollupOptions: {
      external: [/^blockly(\/.*)?$/],
      output: {
        globals: {
          blockly: "Blockly",
          "blockly/blocks": "Blockly",
          "blockly/javascript": "javascript"
        }
      }
    }
  }
});
