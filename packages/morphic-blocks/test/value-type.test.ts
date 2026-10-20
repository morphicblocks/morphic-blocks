import { afterEach, describe, expect, test, vi } from "vitest";
import type * as Blockly from "blockly";
import { MorphicBlocks } from "../src";
import type { MorphicBlocksFormat } from "../src/morphic/types";

/** `%1:type` writes the type of the value in slot 1, named per language in `code.<element>.types`. */

const format: MorphicBlocksFormat = {
  elementTypes: { java: "code" },
  modes: [{ name: "java", elements: ["java"] }],
  code: { java: { types: { Number: "int", String: "String", default: "var" } } },
  blocks: [
    {
      identifier: "declare",
      elements: { java: "%1:type %NAME = %1;" },
      fields: { NAME: { type: "text", default: "s" } },
      inputSlots: { "1": { kind: "value", name: "VALUE" } },
      shape: "statement",
    },
    {
      identifier: "count",
      elements: { java: "%1:type n = %1;" },
      inputSlots: { "1": { kind: "value", name: "VALUE", check: "Number" } },
      shape: "statement",
    },
    { identifier: "hey", elements: { java: '"hey"' }, output: "String" },
    { identifier: "five", elements: { java: "5" }, output: "Number" },
    { identifier: "item", elements: { java: "item" }, output: true },
  ],
};

const engines: MorphicBlocks[] = [];
const div = () => document.body.appendChild(document.createElement("div"));

afterEach(() => {
  for (const engine of engines.splice(0)) engine.dispose();
  document.body.innerHTML = "";
});

async function setUp(definitions: MorphicBlocksFormat = format) {
  const engine = new MorphicBlocks(definitions, {});
  engines.push(engine);
  await engine.mount({ workspaceContainer: div(), codespaceContainer: div() });
  engine.show({ views: { codespace: "java" } });
  const workspace = engine.getWorkspace()!;
  const make = (type: string) => {
    const block = workspace.newBlock(`morphic:${type}`) as Blockly.BlockSvg;
    block.initSvg();
    block.render();
    return block;
  };
  const codespace = (engine as unknown as { codespace: { getValue(): string } }).codespace;
  const textIs = (expected: string) => vi.waitFor(() => expect(codespace.getValue()).toBe(expected), { timeout: 3000 });
  const label = (block: Blockly.Block) => block.getField("MORPHIC_TYPE_1")?.getText();
  return { make, textIs, label };
}

describe("%1:type", () => {
  test("writes the name of the connected value's type", async () => {
    const { make, textIs } = await setUp();
    const declare = make("declare");
    declare.getInput("VALUE")!.connection!.connect(make("hey").outputConnection!);

    await textIs('String s = "hey";');
  });

  test("follows the value when it changes", async () => {
    const { make, textIs, label } = await setUp();
    const declare = make("declare");
    const hey = make("hey");
    declare.getInput("VALUE")!.connection!.connect(hey.outputConnection!);
    await textIs('String s = "hey";');
    expect(label(declare)).toBe("String");

    hey.dispose();
    declare.getInput("VALUE")!.connection!.connect(make("five").outputConnection!);

    await textIs("int s = 5;");
    expect(label(declare)).toBe("int");
  });

  test("uses the slot's check while the slot is empty", async () => {
    const { make, textIs, label } = await setUp();
    const count = make("count");

    await textIs("int n = [NUMBER];");
    expect(label(count)).toBe("int");
  });

  test("falls back to default for a value without a known type", async () => {
    const { make, textIs } = await setUp();
    make("declare").getInput("VALUE")!.connection!.connect(make("item").outputConnection!);

    await textIs("var s = item;");
  });

  test("writes nothing when the language names no types", async () => {
    const { code: _, ...untyped } = format;
    const { make, textIs } = await setUp(untyped);
    make("declare").getInput("VALUE")!.connection!.connect(make("five").outputConnection!);

    await textIs(" s = 5;");
  });

  test("survives switching to a mode without it and back", async () => {
    const twoModes: MorphicBlocksFormat = {
      ...format,
      elementTypes: { java: "code", js: "code" },
      modes: [
        { name: "java", elements: ["java"] },
        { name: "js", elements: ["js"] },
      ],
      blocks: format.blocks.map((block) => ({ ...block, elements: { ...block.elements, js: block.identifier === "declare" ? "let %NAME = %1;" : (block.elements.java ?? "") } })),
    };
    const engine = new MorphicBlocks(twoModes, {});
    engines.push(engine);
    await engine.mount({ workspaceContainer: div() });
    engine.show({ views: { workspace: "java" } });
    const workspace = engine.getWorkspace()!;
    const declare = workspace.newBlock("morphic:declare") as Blockly.BlockSvg;
    declare.initSvg();
    const five = workspace.newBlock("morphic:five") as Blockly.BlockSvg;
    five.initSvg();
    declare.getInput("VALUE")!.connection!.connect(five.outputConnection!);

    engine.show({ views: { workspace: "js" } });
    expect(declare.getField("MORPHIC_TYPE_1")).toBeNull();
    engine.show({ views: { workspace: "java" } });
    expect(declare.getField("MORPHIC_TYPE_1")?.getText()).toBe("int");
  });

  test("needs a value slot of the same template", () => {
    const broken: MorphicBlocksFormat = {
      ...format,
      blocks: [{ identifier: "wrong", elements: { java: "%2:type x = %1;" }, inputSlots: { "1": { kind: "value", name: "A" } } }],
    };

    expect(() => new MorphicBlocks(broken, {}).mount({ workspaceContainer: div() })).toThrow(/%2:type/);
  });
});
