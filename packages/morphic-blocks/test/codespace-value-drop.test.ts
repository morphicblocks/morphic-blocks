import { afterEach, describe, expect, test } from "vitest";
import type * as Blockly from "blockly";
import { MorphicBlocks } from "../src";
import type { MorphicBlocksFormat } from "../src/morphic/types";

/** A value dropped onto a filled slot in the codespace keeps the old value, as the workspace does. */

const format: MorphicBlocksFormat = {
  elementTypes: { js: "code" },
  modes: [{ name: "js", elements: ["js"] }],
  blocks: [
    {
      identifier: "say",
      elements: { js: "say(%1);" },
      inputSlots: { "1": { kind: "value", name: "VALUE" } },
      shape: "statement",
    },
    {
      identifier: "not",
      elements: { js: "!%1" },
      inputSlots: { "1": { kind: "value", name: "VALUE", check: "Boolean" } },
      output: "Boolean",
    },
    {
      identifier: "plus",
      elements: { js: "%1 + %2" },
      inputSlots: {
        "1": { kind: "value", name: "A", check: "Number" },
        "2": { kind: "value", name: "B", check: "Number" },
      },
      output: "Number",
    },
    { identifier: "yes", elements: { js: "true" }, output: "Boolean" },
    { identifier: "five", elements: { js: "5" }, output: "Number" },
  ],
};

const engines: MorphicBlocks[] = [];
const div = () => document.body.appendChild(document.createElement("div"));
// The codespace writes its text after a short pause.
const settle = () => new Promise((resolve) => setTimeout(resolve, 300));

afterEach(() => {
  for (const engine of engines.splice(0)) engine.dispose();
  document.body.innerHTML = "";
});

async function setUp(value: "yes" | "five") {
  const engine = new MorphicBlocks(format, {});
  engines.push(engine);
  await engine.mount({ workspaceContainer: div(), codespaceContainer: div() });
  engine.show({ views: { codespace: "js" } });
  const workspace = engine.getWorkspace()!;
  const make = (type: string) => {
    const block = workspace.newBlock(`morphic:${type}`) as Blockly.BlockSvg;
    block.initSvg();
    block.render();
    return block;
  };
  const say = make("say");
  say.getInput("VALUE")!.connection!.connect(make(value).outputConnection!);
  await settle();
  const internals = engine as unknown as {
    codespace: { getValue(): string };
    connectIntoValueSlot(source: Blockly.BlockSvg, parent: Blockly.BlockSvg, inputName: string): boolean;
  };
  const drop = async (type: string) => {
    internals.connectIntoValueSlot(make(type), say, "VALUE");
    await settle();
  };
  return { drop, text: () => internals.codespace.getValue() };
}

describe("dropping a value onto a filled slot in the codespace", () => {
  test("puts the old value into the new block's only slot that takes it", async () => {
    const { drop, text } = await setUp("yes");

    await drop("not");

    expect(text()).toBe("say(!true);");
  });

  test("moves the old value to its own line when more than one slot takes it", async () => {
    const { drop, text } = await setUp("five");

    await drop("plus");

    expect(text().split("\n")).toEqual(["say([NUMBER] + [NUMBER]);", "5"]);
  });
});
