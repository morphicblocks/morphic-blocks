import { defineConfig } from "vite";

// Node code built next to the library: the `morphic-blocks` command and the
// bundler plugin, one entry per bundler (morphic-blocks/vite, /webpack, …).
const bundlers = ["vite", "webpack", "rspack", "rollup", "esbuild"];

export default defineConfig({
  build: {
    ssr: true,
    outDir: "dist",
    emptyOutDir: false,
    target: "node18",
    rollupOptions: {
      input: {
        cli: "cli/index.ts",
        ...Object.fromEntries(bundlers.map((name) => [name, `cli/${name}.ts`])),
      },
      output: {
        entryFileNames: "[name].js",
        chunkFileNames: "[name]-[hash].js",
        banner: (chunk) => (chunk.name === "cli" ? "#!/usr/bin/env node" : ""),
      },
    },
  },
});
