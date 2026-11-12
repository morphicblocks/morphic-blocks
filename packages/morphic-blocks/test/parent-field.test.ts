import { afterEach, expect, test, vi } from "vitest";
import type * as Blockly from "blockly";
import { MorphicBlocks } from "../src";
import { parseTemplate } from "../src/morphic/template";
import type { MorphicBlocksFormat } from "../src/morphic/types";

/**
 * `%parent.NAME` shows the `NAME` field of the nearest block around this one
 * that has it: a Go method names its struct (`func (self *Dog) bark()`).
 */

const format: MorphicBlocksFormat = {
  elementTypes: { go: "code" },
  modes: [{ name: "in-go", elements: ["go"] }],
  blocks: [
    {
      identifier: "struct",
      elements: { go: "type %NAME struct {}\n%1" },
      fields: { NAME: { type: "text", default: "Dog" } },
      inputSlots: { "1": { kind: "statement", name: "METHODS" } },
      shape: "statement",
    },
    {
      identifier: "method",
      elements: { go: "func (self *%parent.NAME) %METHOD() {}" },
      fields: { METHOD: { type: "text", default: "bark" } },
      shape: "statement",
    },
    {
      identifier: "group",
      elements: { go: "// group\n%1" },
      inputSlots: { "1": { kind: "statement", name: "BODY" } },
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
  const engine = new MorphicBlocks(format, {});
  engines.push(engine);
  await engine.mount({ workspaceContainer: div(), codespaceContainer: div() });
  const workspace = engine.getWorkspace()!;
  const make = (type: string) => {
    const block = workspace.newBlock(`morphic:${type}`) as Blockly.BlockSvg;
    block.initSvg();
    block.render();
    return block;
  };
  const codespace = (engine as unknown as { codespace: { getValue(): string } }).codespace;
  const textIs = (expected: string) => vi.waitFor(() => expect(codespace.getValue()).toBe(expected), { timeout: 3000 });
  const shown = (block: Blockly.Block) =>
    block.inputList.flatMap((input) => input.fieldRow).map((field) => field.getText()).join(" ");
  return { make, textIs, shown };
}

test("the template token is read apart from fields and text", () => {
  expect(parseTemplate("func (self *%parent.NAME) %METHOD()")).toEqual([
    { kind: "text", value: "func (self *" },
    { kind: "parentField", name: "NAME" },
    { kind: "text", value: ") " },
    { kind: "field", name: "METHOD" },
    { kind: "text", value: "()" },
  ]);
  expect(parseTemplate("%parent. and %parents")).toEqual([{ kind: "text", value: "%parent. and %parents" }]);
});

test("a block shows and writes the field of the block around it, and follows its edits", async () => {
  const { make, textIs, shown } = await setUp();
  const struct = make("struct");
  const method = make("method");
  struct.getInput("METHODS")!.connection!.connect(method.previousConnection);

  await textIs("type Dog struct {}\nfunc (self *Dog) bark() {}");
  await vi.waitFor(() => expect(shown(method)).toBe("func (self * Dog ) bark () {}"), { timeout: 3000 });

  struct.setFieldValue("Cat", "NAME");
  await textIs("type Cat struct {}\nfunc (self *Cat) bark() {}");
  await vi.waitFor(() => expect(shown(method)).toBe("func (self * Cat ) bark () {}"), { timeout: 3000 });
});

test("it reads the nearest block around it that has the field", async () => {
  const { make, textIs } = await setUp();
  const struct = make("struct");
  const group = make("group");
  const method = make("method");
  struct.getInput("METHODS")!.connection!.connect(group.previousConnection);
  group.getInput("BODY")!.connection!.connect(method.previousConnection);

  await textIs("type Dog struct {}\n// group\nfunc (self *Dog) bark() {}");
});

test("a block with nothing around it shows nothing there", async () => {
  const { make, textIs, shown } = await setUp();
  const method = make("method");

  await textIs("func (self *) bark() {}");
  expect(shown(method)).toBe("func (self *  ) bark () {}");
});
