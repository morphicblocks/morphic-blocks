/**
 * A bundler plugin that copies Blockly's media when dev or build starts, so no
 * script line is needed. One plugin for Vite, webpack, Rspack, Rollup and
 * esbuild (unplugin); the files next to this one hand it out per bundler.
 */
import { createUnplugin } from "unplugin";
import { copyBlocklyMedia } from "./copy-media";

export interface BlocklyMediaOptions {
  /**
   * Folder the page serves `blockly-media/` from, relative to where the
   * bundler runs. Default `public/blockly-media`, Vite's folder for static
   * files.
   */
  folder?: string;
}

// `| undefined` lets the plugin be called without options: `blocklyMedia()`.
export const blocklyMedia = createUnplugin((options: BlocklyMediaOptions | undefined = {}) => ({
  name: "morphic-blocks-media",
  buildStart() {
    copyBlocklyMedia(options?.folder ?? "public/blockly-media");
  },
}));
