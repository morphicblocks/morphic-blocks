import { afterEach, describe, expect, test } from "vitest";
import * as Blockly from "blockly";
import { MorphicBlocks } from "../src";
import type { MorphicBlocksFormat, MorphicMountConfig } from "../src/morphic/types";

/**
 * Toolbox tiles are drawn in a hidden Blockly workspace. It must follow the
 * host's Blockly settings, so it never loads files from a server the host
 * did not choose.
 */

const format: MorphicBlocksFormat = {
  elementTypes: { code: "code" },
  modes: [{ name: "only", elements: ["code"] }],
  blocks: [{ identifier: "say", elements: { code: "say()" }, shape: "statement" }],
};

const engines: MorphicBlocks[] = [];
const div = () => document.body.appendChild(document.createElement("div"));

function mountWith(blockly: MorphicMountConfig["blockly"]): { main: Blockly.WorkspaceSvg; tiles: Blockly.WorkspaceSvg } {
  const engine = new MorphicBlocks(format, {});
  engines.push(engine);
  void engine.mount({ workspaceContainer: div(), toolboxContainer: div(), blockly });
  // Private state, read only because the tile workspace has no public getter.
  const tiles = (engine as unknown as { toolboxCanvas: { previewWorkspace: Blockly.WorkspaceSvg } }).toolboxCanvas.previewWorkspace;
  return { main: engine.getWorkspace()!, tiles };
}

afterEach(() => {
  for (const engine of engines.splice(0)) engine.dispose();
  document.body.innerHTML = "";
});

describe("tile workspace", () => {
  test("loads media from where the host's workspace does", () => {
    const { tiles } = mountWith({ media: "/blockly-media/" });

    expect(tiles.options.pathToMedia).toBe("/blockly-media/");
  });

  test("never loads sounds, since it only draws tiles", () => {
    const { main, tiles } = mountWith({});

    expect(main.options.hasSounds).toBe(true);
    expect(tiles.options.hasSounds).toBe(false);
  });

  test("draws tiles with the host's renderer, theme and direction", () => {
    const theme = Blockly.Theme.defineTheme("host-theme", { name: "host-theme", base: Blockly.Themes.Classic });
    const { tiles } = mountWith({ renderer: "zelos", theme, rtl: true });

    expect(tiles.getRenderer().getClassName()).toBe("zelos-renderer");
    expect(tiles.options.theme).toBe(theme);
    expect(tiles.RTL).toBe(true);
  });
});
