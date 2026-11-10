import { afterEach, describe, expect, test } from "vitest";
import { MorphicBlocks } from "../src";
import type { MorphicBlocksFormat } from "../src/morphic/types";

/** A preset says whether the toolbox groups its tiles under the categories. */

const format: MorphicBlocksFormat = {
  elementTypes: { code: "code" },
  modes: [{ name: "code-tiles", elements: ["code"] }],
  views: { "editor-pane": "workspace" },
  blockSets: { "level-1-blocks": ["say", "number", "loop"] },
  presets: [
    { name: "level-1-preset", toolbox: "code-tiles", blockSet: "level-1-blocks", categories: false, views: { "editor-pane": "code" } },
    { name: "all-preset", toolbox: "code-tiles", views: { "editor-pane": "code" } },
  ],
  categories: [{ name: "Output" }, { name: "Loops" }, { name: "Values" }],
  blocks: [
    { identifier: "say", elements: { code: "say()" }, shape: "statement", category: "Output" },
    { identifier: "loop", elements: { code: "loop" }, shape: "statement", category: "Loops" },
    { identifier: "number", elements: { code: "0" }, output: "Number", category: "Values" },
  ],
};

const engines: MorphicBlocks[] = [];
const div = () => document.body.appendChild(document.createElement("div"));

afterEach(() => {
  for (const engine of engines.splice(0)) engine.dispose();
  document.body.innerHTML = "";
});

async function setUp(preset?: string) {
  const engine = new MorphicBlocks(format, {});
  engines.push(engine);
  const toolbox = div();
  await engine.mount({ containers: { "editor-pane": div() }, toolboxContainer: toolbox, ...(preset ? { preset } : {}) });
  const tiles = () => Array.from(toolbox.querySelectorAll("[data-block-type]")).map((tile) => tile.getAttribute("data-block-type"));
  const categories = () => Array.from(toolbox.querySelectorAll("[data-category]")).map((group) => group.getAttribute("data-category"));
  return { engine, tiles, categories };
}

/** Labels in Blockly's own flyout toolbox, which shows the category names. */
function flyoutLabels(engine: MorphicBlocks): unknown[] {
  const tree = engine.getWorkspace()!.options.languageTree as { contents?: { kind: string; text?: string }[] } | null;
  return (tree?.contents ?? []).filter((item) => item.kind.toLowerCase() === "label").map((item) => item.text);
}

describe("categories per preset", () => {
  test("a preset with categories: false shows one list in the set's order", async () => {
    const { tiles, categories } = await setUp();

    expect(categories()).toEqual([]);
    expect(tiles()).toEqual(["say", "number", "loop"]);
  });

  test("a preset without the flag groups the tiles again", async () => {
    const { engine, tiles, categories } = await setUp();

    engine.applyPreset("all-preset");

    expect(categories()).toEqual(["Output", "Loops", "Values"]);
    expect(tiles()).toEqual(["say", "loop", "number"]);
  });

  test("show() switches the grouping and leaves the rest as it is", async () => {
    const { engine, tiles, categories } = await setUp("all-preset");

    engine.show({ categories: false });
    expect(categories()).toEqual([]);
    expect(tiles()).toEqual(["say", "loop", "number"]);

    engine.show({ categories: true });
    expect(categories()).toEqual(["Output", "Loops", "Values"]);
  });

  test("Blockly's flyout toolbox drops its category labels", async () => {
    const engine = new MorphicBlocks(format, {});
    engines.push(engine);
    await engine.mount({ containers: { "editor-pane": div() }, toolboxLayout: "flyout" });

    expect(flyoutLabels(engine)).toEqual([]);

    engine.applyPreset("all-preset");
    expect(flyoutLabels(engine)).toEqual(["Output", "Loops", "Values"]);
  });

  test("Blockly's category toolbox keeps its categories and warns", async () => {
    const warnings: string[] = [];
    const engine = new MorphicBlocks(format, {});
    engines.push(engine);
    await engine.mount({ containers: { "editor-pane": div() }, onWarning: (message) => warnings.push(message) });

    expect(warnings.some((message) => message.includes("category toolbox keeps its categories"))).toBe(true);
  });
});
