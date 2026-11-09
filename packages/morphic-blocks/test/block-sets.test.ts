import { afterEach, describe, expect, test } from "vitest";
import * as Blockly from "blockly";
import { MorphicBlocks } from "../src";
import type { MorphicBlocksFormat, MorphicBlockSet } from "../src/morphic/types";

/** Block sets name the blocks a toolbox shows; presets and show() switch them. */

const blockSets: Record<string, MorphicBlockSet> = {
  "level-1-blocks": ["say", "number"],
  "level-2-blocks": { extends: "level-1-blocks", add: ["loop", "compare"] },
  "level-3-blocks": { extends: "level-2-blocks", add: ["while"], remove: ["loop"] },
};

const format: MorphicBlocksFormat = {
  elementTypes: { code: "code" },
  modes: [{ name: "code-tiles", elements: ["code"] }],
  views: { "editor-pane": "workspace" },
  blockSets,
  presets: [
    { name: "level-1-preset", toolbox: "code-tiles", blockSet: "level-1-blocks", views: { "editor-pane": "code" } },
    { name: "level-3-preset", toolbox: "code-tiles", blockSet: "level-3-blocks", views: { "editor-pane": "code" } },
    { name: "plain-preset", toolbox: "code-tiles", views: { "editor-pane": "code" } },
  ],
  categories: [{ name: "Output" }, { name: "Loops" }, { name: "Values" }],
  blocks: [
    { identifier: "say", elements: { code: "say()" }, shape: "statement", category: "Output" },
    { identifier: "loop", elements: { code: "loop" }, shape: "statement", category: "Loops" },
    { identifier: "while", elements: { code: "while" }, shape: "statement", category: "Loops" },
    { identifier: "number", elements: { code: "0" }, output: "Number", category: "Values" },
    { identifier: "compare", elements: { code: "a < b" }, output: "Boolean", category: "Values" },
  ],
};

const engines: MorphicBlocks[] = [];
const div = () => document.body.appendChild(document.createElement("div"));

afterEach(() => {
  for (const engine of engines.splice(0)) engine.dispose();
  document.body.innerHTML = "";
});

async function setUp(definitions: MorphicBlocksFormat = format, preset?: string) {
  const engine = new MorphicBlocks(definitions, {});
  engines.push(engine);
  const toolbox = div();
  await engine.mount({ containers: { "editor-pane": div() }, toolboxContainer: toolbox, ...(preset ? { preset } : {}) });
  const tiles = () => Array.from(toolbox.querySelectorAll("[data-block-type]")).map((tile) => tile.getAttribute("data-block-type"));
  const categories = () => Array.from(toolbox.querySelectorAll("[data-category]")).map((group) => group.getAttribute("data-category"));
  return { engine, tiles, categories };
}

function mountErrors(definitions: MorphicBlocksFormat): string {
  const engine = new MorphicBlocks(definitions, {});
  engines.push(engine);
  try {
    void engine.mount({ containers: { "editor-pane": div() } });
  } catch (error) {
    return (error as Error).message;
  }
  return "";
}

describe("block sets", () => {
  test("the first preset's set fills the toolbox at mount", async () => {
    const { tiles } = await setUp();

    expect(tiles()).toEqual(["say", "number"]);
  });

  test("a set extends another: added blocks come last, removed ones go", async () => {
    const { tiles } = await setUp(format, "level-3-preset");

    expect(tiles()).toEqual(["say", "while", "number", "compare"]);
  });

  test("applyPreset and show() switch the set; blocks in the program stay", async () => {
    const { engine, tiles } = await setUp();
    engine.getWorkspace()!.newBlock("morphic:say");

    engine.applyPreset("level-3-preset");
    expect(tiles()).toEqual(["say", "while", "number", "compare"]);

    engine.show({ blockSet: "level-2-blocks" });
    expect(tiles()).toEqual(["say", "loop", "number", "compare"]);
    expect(engine.getWorkspace()!.getAllBlocks(false)).toHaveLength(1);
  });

  test("a preset without a set shows all blocks again, as does show() with null", async () => {
    const { engine, tiles } = await setUp();
    const all = ["say", "loop", "while", "number", "compare"];

    engine.applyPreset("plain-preset");
    expect(tiles()).toEqual(all);

    engine.show({ blockSet: "level-1-blocks" });
    engine.show({ views: { "editor-pane": "code" } });
    expect(tiles()).toEqual(["say", "number"]);

    engine.show({ blockSet: null });
    expect(tiles()).toEqual(all);
  });

  test("without block sets the toolbox shows every block", async () => {
    const { blockSets: _, presets: __, ...plain } = format;
    const { tiles } = await setUp(plain);

    expect(tiles()).toEqual(["say", "loop", "while", "number", "compare"]);
  });

  test("a category left without blocks is not shown", async () => {
    const { categories } = await setUp();

    expect(categories()).toEqual(["Output", "Values"]);
  });

  test("Blockly's own toolbox shows the set too", async () => {
    const engine = new MorphicBlocks(format, {});
    engines.push(engine);
    await engine.mount({ containers: { "editor-pane": div() } });
    const shown = () =>
      (engine.getWorkspace()!.getToolbox() as Blockly.Toolbox)
        .getToolboxItems()
        .map((item) => (item as Blockly.ToolboxCategory).getName());

    expect(shown()).toEqual(["Output", "Values"]);
    engine.show({ blockSet: "level-2-blocks" });
    expect(shown()).toEqual(["Output", "Loops", "Values"]);
  });

  test("an unknown set in show() is refused", async () => {
    const { engine } = await setUp();

    expect(() => engine.show({ blockSet: "level-9-blocks" })).toThrow('show: unknown block set "level-9-blocks".');
  });

  test("unknown blocks, sets and loops stop the mount", () => {
    const message = mountErrors({
      ...format,
      blockSets: {
        "a-blocks": { extends: "b-blocks" },
        "b-blocks": { extends: "a-blocks", add: ["jump"] },
        "c-blocks": { extends: "missing-blocks" },
      },
      presets: [{ name: "start-preset", toolbox: "code-tiles", blockSet: "d-blocks", views: { "editor-pane": "code" } }],
    });

    expect(message).toContain('Block set "b-blocks": extends "a-blocks", which extends it again (a-blocks → b-blocks → a-blocks).');
    expect(message).toContain('Block set "b-blocks": "jump" is no block in the definitions.');
    expect(message).toContain('Block set "c-blocks": extends "missing-blocks", which is no block set.');
    expect(message).toContain('Preset "start-preset": blockSet "d-blocks" is no block set.');
  });

  test("removing a block the set does not have warns", async () => {
    const warnings: string[] = [];
    const engine = new MorphicBlocks({ ...format, blockSets: { ...blockSets, "level-4-blocks": { extends: "level-1-blocks", remove: ["loop"] } } }, {});
    engines.push(engine);
    await engine.mount({ containers: { "editor-pane": div() }, onWarning: (message) => warnings.push(message) });

    expect(warnings.join("\n")).toContain('Block set "level-4-blocks": removes "loop", which "level-1-blocks" does not have.');
  });

  test("a block set name is a kind of name: a framework word or a name used twice warns", async () => {
    const warnings: string[] = [];
    const engine = new MorphicBlocks({ ...format, blockSets: { ...blockSets, blockset: ["say"], "code-tiles": ["say"] } }, {});
    engines.push(engine);
    await engine.mount({ containers: { "editor-pane": div() }, onWarning: (message) => warnings.push(message) });

    expect(warnings.join("\n")).toContain('Name "blockset" (block set) is a Morphic Blocks word');
    expect(warnings.join("\n")).toContain('Name "code-tiles" is used as block set and mode');
  });
});
