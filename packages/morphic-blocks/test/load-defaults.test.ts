import { afterEach, expect, test } from "vitest";
import * as Blockly from "blockly";
import { MorphicBlocks } from "../src";
import type { MorphicBlocksFormat } from "../src/morphic/types";

/**
 * A placeholder default is a real block a new block starts with. A block made
 * from a saved one (a loaded program, a paste, an undo) gets none again: the
 * saved block had kept, replaced or deleted it.
 */

const format: MorphicBlocksFormat = {
  elementTypes: { code: "code" },
  modes: [{ name: "only", elements: ["code"] }],
  blocks: [
    {
      identifier: "show",
      elements: { code: "show %1" },
      inputSlots: { "1": { kind: "value", name: "VALUE", default: { placeholder: "one" } } },
      shape: "statement",
    },
    {
      identifier: "all",
      elements: { code: "all(%1)" },
      inputSlots: { "1": { kind: "value", name: "ITEMS", repeat: { count: 3 }, default: { placeholder: "one" } } },
      shape: "statement",
    },
    { identifier: "one", elements: { code: "1" }, output: "Number" },
    { identifier: "two", elements: { code: "2" }, output: "Number" },
  ],
};

const engines: MorphicBlocks[] = [];
afterEach(() => {
  for (const engine of engines.splice(0)) engine.dispose();
  document.body.innerHTML = "";
});

async function setUp() {
  const engine = new MorphicBlocks(format, {});
  engines.push(engine);
  await engine.mount({ workspaceContainer: document.body.appendChild(document.createElement("div")), onWarning: () => {} });
  const workspace = engine.getWorkspace()!;
  const make = (type: string) => workspace.newBlock(`morphic:${type}`) as Blockly.BlockSvg;
  const replace = (block: Blockly.Block, input: string) => {
    block.getInputTargetBlock(input)!.dispose(false);
    block.getInput(input)!.connection!.connect(make("two").outputConnection);
  };
  const reload = () => {
    const saved = Blockly.serialization.workspaces.save(workspace);
    workspace.clear();
    Blockly.serialization.workspaces.load(saved, workspace);
    return workspace.getTopBlocks(false);
  };
  const held = (block: Blockly.Block, input: string) => block.getInputTargetBlock(input)?.type.replace("morphic:", "") ?? null;
  return { engine, workspace, make, replace, reload, held };
}

test("a new block starts with its placeholder", async () => {
  const { make, held } = await setUp();

  expect(held(make("show"), "VALUE")).toBe("one");
});

test("a loaded block holds what it was saved with, and nothing lies loose", async () => {
  const { make, replace, reload, held } = await setUp();
  replace(make("show"), "VALUE");

  const top = reload();
  expect(top).toHaveLength(1);
  expect(held(top[0]!, "VALUE")).toBe("two");
});

test("a deleted placeholder stays deleted after loading", async () => {
  const { make, reload, held } = await setUp();
  make("show").getInputTargetBlock("VALUE")!.dispose(false);

  const top = reload();
  expect(top).toHaveLength(1);
  expect(held(top[0]!, "VALUE")).toBeNull();
});

test("the entries of a repeating slot load as they were saved", async () => {
  const { make, replace, reload, held } = await setUp();
  const all = make("all");
  replace(all, "ITEMS_0");
  all.getInputTargetBlock("ITEMS_1")!.dispose(false);

  const top = reload();
  expect(top).toHaveLength(1);
  expect(["ITEMS_0", "ITEMS_1", "ITEMS_2"].map((input) => held(top[0]!, input))).toEqual(["two", null, "one"]);
});

test("a pasted copy holds what the copied block held", async () => {
  const { workspace, make, replace, held } = await setUp();
  const show = make("show");
  replace(show, "VALUE");
  const copy = Blockly.serialization.blocks.append(Blockly.serialization.blocks.save(show)!, workspace);

  expect(workspace.getTopBlocks(false)).toHaveLength(2);
  expect(held(copy, "VALUE")).toBe("two");
});
