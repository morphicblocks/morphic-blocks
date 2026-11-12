import { afterEach, expect, test, vi } from "vitest";
import * as Blockly from "blockly";
import { MorphicBlocks } from "../src";
import { settle } from "./settle";
import type { MorphicBlocksFormat } from "../src/morphic/types";

/**
 * A template may name a field several times (`type %NAME struct … func New%NAME()`).
 * The block has the field once; the other places repeat what it shows, so an
 * edit reaches every place and the saved program holds one value.
 */

const format: MorphicBlocksFormat = {
  elementTypes: { go: "code", python: "code" },
  modes: [{ name: "in-go", elements: ["go"] }],
  blocks: [
    {
      identifier: "thing",
      elements: { go: "type %NAME struct {}\nfunc New%NAME() *%NAME", python: "class %NAME: pass" },
      fields: { NAME: { type: "text", default: "Dog" } },
      shape: "statement",
    },
  ],
};

const engines: MorphicBlocks[] = [];
const div = () => document.body.appendChild(document.createElement("div"));

afterEach(() => {
  for (const engine of engines.splice(0)) engine.dispose();
  document.body.innerHTML = "";
});

async function setUp() {
  const engine = new MorphicBlocks(format, { thing: () => "" });
  engines.push(engine);
  await engine.mount({ workspaceContainer: div(), codespaceContainer: div() });
  const workspace = engine.getWorkspace()!;
  const block = workspace.newBlock("morphic:thing") as Blockly.BlockSvg;
  block.initSvg();
  block.render();
  const shown = () => block.inputList.flatMap((input) => input.fieldRow).map((field) => field.getText());
  const named = () => block.inputList.flatMap((input) => input.fieldRow).filter((field) => field.name === "NAME");
  return { engine, workspace, block, shown, named };
}

test("the block has the field once and every place shows its value", async () => {
  const { block, shown, named } = await setUp();

  expect(named()).toHaveLength(1);
  expect(shown().filter((text) => text === "Dog")).toHaveLength(3);

  block.setFieldValue("Cat", "NAME");
  await vi.waitFor(() => expect(shown().filter((text) => text === "Cat")).toHaveLength(3), { timeout: 3000 });
  expect(shown()).not.toContain("Dog");
});

test("an edit is one step to undo", async () => {
  const { workspace, block, shown } = await setUp();
  await settle();
  workspace.clearUndo();
  block.setFieldValue("Cat", "NAME");
  await vi.waitFor(() => expect(shown().filter((text) => text === "Cat")).toHaveLength(3), { timeout: 3000 });

  workspace.undo(false);
  expect(block.getFieldValue("NAME")).toBe("Dog");
  await vi.waitFor(() => expect(shown().filter((text) => text === "Dog")).toHaveLength(3), { timeout: 3000 });
  workspace.undo(false);
  expect(block.isDisposed()).toBe(false);
});

test("an edit is what the program saves and what the text shows", async () => {
  const { engine, workspace, block } = await setUp();
  block.setFieldValue("Cat", "NAME");

  const saved = Blockly.serialization.workspaces.save(workspace);
  expect(saved.blocks.blocks[0].fields).toEqual({ NAME: "Cat" });

  const codespace = (engine as unknown as { codespace: { getValue(): string } }).codespace;
  await vi.waitFor(
    () => expect(codespace.getValue()).toBe("type Cat struct {}\nfunc NewCat() *Cat"),
    { timeout: 3000 },
  );
});

test("an edit survives a change of what the workspace shows", async () => {
  const { engine, block, shown } = await setUp();
  block.setFieldValue("Cat", "NAME");

  engine.show({ views: { workspace: "python" } });
  expect(block.getFieldValue("NAME")).toBe("Cat");
  engine.show({ views: { workspace: "go" } });
  expect(block.getFieldValue("NAME")).toBe("Cat");
  expect(shown().filter((text) => text === "Cat")).toHaveLength(3);
});
