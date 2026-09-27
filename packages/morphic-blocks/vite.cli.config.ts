import { defineConfig } from "vite";

// The `morphic-blocks` command, built for Node next to the library.
export default defineConfig({
  build: {
    ssr: "cli/index.ts",
    outDir: "dist",
    emptyOutDir: false,
    target: "node18",
    rollupOptions: {
      output: {
        entryFileNames: "cli.js",
        banner: "#!/usr/bin/env node",
      },
    },
  },
});
