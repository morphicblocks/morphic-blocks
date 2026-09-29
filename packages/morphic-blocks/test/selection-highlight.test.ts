import { afterEach, expect, test } from "vitest";
import type * as Blockly from "blockly";
import { MorphicBlocks } from "../src";
import type { MorphicBlocksFormat, MorphicMountConfig } from "../src/morphic/types";

/**
 * A selected block is highlighted in the text views. Without a colour of the
 * host's own, the highlight follows each view's selection colour, so it shows
 * on light and dark backgrounds alike.
 */

const format: MorphicBlocksFormat = {
  elementTypes: { code: "code" },
  modes: [{ name: "only", elements: ["code"] }],
  blocks: [{ identifier: "say", elements: { code: "say()" }, shape: "statement" }],
};

const engines: MorphicBlocks[] = [];
const div = () => document.body.appendChild(document.createElement("div"));

afterEach(() => {
  for (const engine of engines.splice(0)) engine.dispose();
  document.body.innerHTML = "";
});

async function highlightStyle(config: Partial<MorphicMountConfig>): Promise<string | null | undefined> {
  const engine = new MorphicBlocks(format, { say: () => "say();\n" });
  engines.push(engine);
  const codespaceContainer = div();
  await engine.mount({ workspaceContainer: div(), codespaceContainer, ...config });
  const block = engine.getWorkspace()!.newBlock("morphic:say") as Blockly.BlockSvg;
  block.initSvg();
  block.render();
  // The codespace writes the new block after a short debounce.
  await new Promise((resolve) => setTimeout(resolve, 300));

  // What selecting the block does; Blockly's selection event is not what is under test.
  const codespace = (engine as unknown as { codespace: { highlightLines(span: { fromLine: number; toLine: number }): void } }).codespace;
  codespace.highlightLines({ fromLine: 1, toLine: 1 });
  return codespaceContainer.querySelector(".morphic-highlight")?.getAttribute("style");
}

test("the highlight follows the view's selection colour", async () => {
  const style = await highlightStyle({ editorTheme: { selectionBackground: "#ffcc00" } });

  // The browser writes #ffcc00 as rgb().
  expect(style).toContain("rgb(255, 204, 0)");
});

test("the host's own colour wins", async () => {
  const style = await highlightStyle({
    editorTheme: { selectionBackground: "#ffcc00" },
    selectionSync: { highlightColor: "rgb(1, 2, 3)" },
  });

  expect(style).toContain("rgb(1, 2, 3)");
});

test("an active highlight takes the new colour when the theme changes", async () => {
  const engine = new MorphicBlocks(format, { say: () => "say();\n" });
  engines.push(engine);
  const codespaceContainer = div();
  await engine.mount({ workspaceContainer: div(), codespaceContainer, editorTheme: { selectionBackground: "#ffcc00" } });
  const block = engine.getWorkspace()!.newBlock("morphic:say") as Blockly.BlockSvg;
  block.initSvg();
  block.render();
  await new Promise((resolve) => setTimeout(resolve, 300));
  const codespace = (engine as unknown as { codespace: { highlightLines(span: { fromLine: number; toLine: number }): void } }).codespace;
  codespace.highlightLines({ fromLine: 1, toLine: 1 });

  engine.setCodespaceTheme({ selectionBackground: "#00ff00" });

  // The browser writes #00ff00 as rgb().
  expect(codespaceContainer.querySelector(".morphic-highlight")?.getAttribute("style")).toContain("rgb(0, 255, 0)");
});

