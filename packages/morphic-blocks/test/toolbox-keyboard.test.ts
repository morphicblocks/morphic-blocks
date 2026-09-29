import { afterEach, describe, expect, test } from "vitest";
import * as Blockly from "blockly";
import { MorphicBlocks } from "../src";
import type { MorphicBlocksFormat, MorphicToolboxConfig } from "../src/morphic/types";

/** Tiles work without a mouse: reached with Tab, added with Enter or Space. */

const format: MorphicBlocksFormat = {
  elementTypes: { title: "text", code: "code" },
  modes: [{ name: "python", elements: ["title", "code"] }],
  blocks: [
    { identifier: "say", elements: { title: "Say", code: "say()" }, shape: "statement" },
    { identifier: "wait", elements: { title: "Wait", code: "wait()" }, shape: "statement" },
    { identifier: "number", elements: { code: "1" }, output: "Number" },
  ],
};

const engines: MorphicBlocks[] = [];
const div = () => document.body.appendChild(document.createElement("div"));

afterEach(() => {
  for (const engine of engines.splice(0)) engine.dispose();
  document.body.innerHTML = "";
});

async function setUp(toolbox: MorphicToolboxConfig = {}) {
  const engine = new MorphicBlocks(format, {});
  engines.push(engine);
  const toolboxContainer = div();
  await engine.mount({ workspaceContainer: div(), toolboxContainer, toolbox });
  const tile = (type: string) => toolboxContainer.querySelector<HTMLElement>(`[data-block-type="${type}"]`)!;
  const press = (type: string, key = "Enter") =>
    tile(type).dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
  const workspace = engine.getWorkspace()!;
  return { engine, tile, press, workspace };
}

describe("choosing tiles with the keyboard", () => {
  test("tiles are buttons named after what they show", async () => {
    const { tile } = await setUp();

    expect(tile("say").tabIndex).toBe(0);
    expect(tile("say").getAttribute("role")).toBe("button");
    expect(tile("say").getAttribute("aria-label")).toBe("Say, say()");
    expect(tile("number").getAttribute("aria-label")).toBe("1");
  });

  test("Enter adds the block and selects it", async () => {
    const { press, workspace } = await setUp();

    press("say");

    const block = workspace.getTopBlocks(false)[0]!;
    expect(block.type).toBe("morphic:say");
    expect(Blockly.common.getSelected()).toBe(block);
  });

  test("choosing again chains the blocks after the selected one", async () => {
    const { press, workspace } = await setUp();

    press("say");
    press("wait", " ");

    const top = workspace.getTopBlocks(false)[0]!;
    expect(workspace.getTopBlocks(false)).toHaveLength(1);
    expect(top.getNextBlock()?.type).toBe("morphic:wait");
  });

  test("a block that does not fit after the selected one starts its own stack", async () => {
    const { press, workspace } = await setUp();

    press("say");
    press("number");

    expect(workspace.getTopBlocks(false)).toHaveLength(2);
  });

  test("keyboard use can be turned off", async () => {
    const { tile, press, workspace } = await setUp({ keyboard: false });

    press("say");

    expect(tile("say").hasAttribute("tabindex")).toBe(false);
    expect(tile("say").hasAttribute("role")).toBe(false);
    expect(workspace.getTopBlocks(false)).toHaveLength(0);
  });
});
