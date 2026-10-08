/**
 * Copies Blockly's images, cursors and sounds into the app, so the page loads
 * them from its own server. Used by the `morphic-blocks copy-media` command
 * and the bundler plugin.
 */
import { cpSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";

// Written into the folder: the Blockly version the media was copied from.
const MARKER = ".blockly-version";

/**
 * Copy Blockly's media into `folder`, unless it holds this Blockly version's
 * media already, so it can run before every dev or build.
 */
export function copyBlocklyMedia(folder: string): { version: string; copied: boolean } {
  // Blockly is a dependency of this package, so it is found from here,
  // wherever the package manager put it.
  const require = createRequire(import.meta.url);
  const blockly = dirname(require.resolve("blockly"));
  const version = (JSON.parse(readFileSync(join(blockly, "package.json"), "utf8")) as { version: string }).version;
  const target = resolve(folder);
  const marker = join(target, MARKER);
  if (existsSync(marker) && readFileSync(marker, "utf8").trim() === version) {
    return { version, copied: false };
  }
  cpSync(join(blockly, "media"), target, { recursive: true });
  writeFileSync(marker, `${version}\n`);
  return { version, copied: true };
}
