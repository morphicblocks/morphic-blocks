/**
 * Copies Blockly's images, cursors and sounds into public/blockly-media/, so
 * the app serves them itself instead of Blockly loading them from Google's
 * server. main.ts points Blockly there with `blockly.media`. Runs before
 * `dev` and `build`; the copy is not committed.
 */
import { cpSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const app = fileURLToPath(new URL("..", import.meta.url));

// Blockly is installed as a dependency of morphic-blocks, so look it up from
// there. An app installing the package from npm uses
// dirname(require.resolve("morphic-blocks")); the sandbox uses the package
// source directly, which has no build to resolve.
const morphicBlocks = join(app, "../../packages/morphic-blocks");
const blockly = dirname(require.resolve("blockly", { paths: [morphicBlocks] }));

cpSync(join(blockly, "media"), join(app, "public/blockly-media"), { recursive: true });
