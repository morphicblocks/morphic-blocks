import { afterEach, describe, expect, test } from "vitest";
import { MorphicBlocks } from "../src";
import type { MorphicBlocksFormat, MorphicToolboxConfig } from "../src/morphic/types";

/** The HTML toolbox takes its label and block list from mount() too. */

const format: MorphicBlocksFormat = {
  elementTypes: { code: "code" },
  modes: [{ name: "python", elements: ["code"] }],
  blocks: [
    { identifier: "say", elements: { code: "say()" }, shape: "statement" },
    { identifier: "wait", elements: { code: "wait()" }, shape: "statement" },
  ],
};

const engines: MorphicBlocks[] = [];
const div = () => document.body.appendChild(document.createElement("div"));

afterEach(() => {
  for (const engine of engines.splice(0)) engine.dispose();
  document.body.innerHTML = "";
});

async function toolboxWith(toolbox: MorphicToolboxConfig): Promise<HTMLElement> {
  const engine = new MorphicBlocks(format, {});
  engines.push(engine);
  const container = div();
  await engine.mount({ workspaceContainer: div(), toolboxContainer: container, toolbox });
  return container;
}

const label = (toolbox: HTMLElement) => toolbox.querySelector(".morphic-toolbox-header")?.textContent;

describe("toolbox options through mount", () => {
  test("the label shows the mode by default", async () => {
    expect(label(await toolboxWith({}))).toBe("Mode: python");
  });

  test("the label can be left out, set, or built from the mode", async () => {
    expect(label(await toolboxWith({ modeLabel: false }))).toBeUndefined();
    expect(label(await toolboxWith({ modeLabel: "Blocks" }))).toBe("Blocks");
    expect(label(await toolboxWith({ modeLabel: (mode) => mode.toUpperCase() }))).toBe("PYTHON");
  });

  test("only the listed blocks are shown", async () => {
    const toolbox = await toolboxWith({ blocks: ["wait"] });
    const tiles = Array.from(toolbox.querySelectorAll("[data-block-type]")).map((tile) => tile.getAttribute("data-block-type"));

    expect(tiles).toEqual(["wait"]);
  });
});
