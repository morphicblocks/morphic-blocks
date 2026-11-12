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

test("a slot written again shows the value in it, and follows it", async () => {
  const again: MorphicBlocksFormat = {
    elementTypes: { go: "code" },
    modes: [{ name: "in-go", elements: ["go"] }],
    blocks: [
      {
        identifier: "add",
        elements: { go: "%1 = append(%1, %2)" },
        inputSlots: { "1": { kind: "value", name: "LIST" }, "2": { kind: "value", name: "VALUE" } },
        shape: "statement",
      },
      { identifier: "name", elements: { go: "%NAME" }, fields: { NAME: { type: "text", default: "items" } }, output: true },
      { identifier: "pair", elements: { go: "%1 + %2" }, inputSlots: { "1": { kind: "value", name: "A" }, "2": { kind: "value", name: "B" } }, output: true },
    ],
  };
  const engine = new MorphicBlocks(again, {});
  engines.push(engine);
  await engine.mount({ workspaceContainer: div(), codespaceContainer: div(), onWarning: () => {} });
  const workspace = engine.getWorkspace()!;
  const make = (type: string) => {
    const block = workspace.newBlock(`morphic:${type}`) as Blockly.BlockSvg;
    block.initSvg();
    block.render();
    return block;
  };
  const add = make("add");
  const labels = () => add.inputList.flatMap((input) => input.fieldRow).map((field) => field.getText()).join("|");
  const name = make("name");
  add.getInput("LIST")!.connection!.connect(name.outputConnection);

  expect(add.inputList.filter((input) => input.connection)).toHaveLength(2);
  await vi.waitFor(() => expect(labels()).toBe("= append(|items|,|)"), { timeout: 3000 });
  name.setFieldValue("words", "NAME");
  await vi.waitFor(() => expect(labels()).toBe("= append(|words|,|)"), { timeout: 3000 });
  expect(engine.generateText("go")).toBe("words = append(words, [VALUE])");

  // A value built from others is too long for a label.
  name.dispose(false);
  add.getInput("LIST")!.connection!.connect(make("pair").outputConnection);
  await vi.waitFor(() => expect(labels()).toBe("= append(|…|,|)"), { timeout: 3000 });
});
