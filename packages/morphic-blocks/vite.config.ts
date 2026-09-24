import { defineConfig } from "vite";

export default defineConfig({
  build: {
    lib: {
      entry: "src/index.ts",
      name: "MorphicBlocks",
      fileName: "morphic-blocks",
      formats: ["es", "umd"]
    },
    rollupOptions: {
      external: [/^blockly(\/.*)?$/, /^@codemirror\//],
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
