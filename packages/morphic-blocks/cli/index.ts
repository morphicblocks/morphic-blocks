/**
 * The `morphic-blocks` command. `copy-media <folder>` copies Blockly's images,
 * cursors and sounds into the app, so the page loads them from its own server.
 * The framework points Blockly to `blockly-media/` next to the page by default.
 */
import { copyBlocklyMedia } from "./copy-media";

const USAGE = `Usage: morphic-blocks copy-media <folder>

Copies Blockly's images, cursors and sounds into <folder>, so your app serves
them itself. Morphic Blocks loads them from "blockly-media/" next to the page
unless you set blockly.media, so copy them to the folder served there:

  npx morphic-blocks copy-media public/blockly-media

Copies only when the folder is new or Blockly was updated, so it can run
before every dev or build.`;

const [command, folder, ...rest] = process.argv.slice(2);

if (command === "--help" || command === "-h") {
  console.log(USAGE);
} else if (command !== "copy-media" || !folder || rest.length > 0) {
  console.error(USAGE);
  process.exitCode = 1;
} else {
  const { version, copied } = copyBlocklyMedia(folder);
  console.log(copied ? `Copied Blockly ${version} media to ${folder}` : `Blockly ${version} media is already in ${folder}`);
}
