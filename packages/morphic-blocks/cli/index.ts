/**
 * The `morphic-blocks` command. `copy-media <folder>` copies Blockly's images,
 * cursors and sounds into the app, so the page loads them from its own server.
 * The framework points Blockly to `blockly-media/` next to the page by default.
 */
import { cpSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";

const USAGE = `Usage: morphic-blocks copy-media <folder>

Copies Blockly's images, cursors and sounds into <folder>, so your app serves
them itself. Morphic Blocks loads them from "blockly-media/" next to the page
unless you set blockly.media, so copy them to the folder served there:

  npx morphic-blocks copy-media public/blockly-media

Copies only when the folder is new or Blockly was updated, so it can run
before every dev or build.`;

// Written into the folder: the Blockly version the media was copied from.
const MARKER = ".blockly-version";

const [command, folder, ...rest] = process.argv.slice(2);

if (command === "--help" || command === "-h") {
  console.log(USAGE);
} else if (command !== "copy-media" || !folder || rest.length > 0) {
  console.error(USAGE);
  process.exitCode = 1;
} else {
  // Blockly is a dependency of this package, so it is found from here,
  // wherever the package manager put it.
  const require = createRequire(import.meta.url);
  const blockly = dirname(require.resolve("blockly"));
  const version = (JSON.parse(readFileSync(join(blockly, "package.json"), "utf8")) as { version: string }).version;
  const target = resolve(folder);
  const marker = join(target, MARKER);
  if (existsSync(marker) && readFileSync(marker, "utf8").trim() === version) {
    console.log(`Blockly ${version} media is already in ${folder}`);
  } else {
    cpSync(join(blockly, "media"), target, { recursive: true });
    writeFileSync(marker, `${version}\n`);
    console.log(`Copied Blockly ${version} media to ${folder}`);
  }
}
