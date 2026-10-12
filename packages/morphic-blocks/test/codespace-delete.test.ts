import { afterEach, describe, expect, test } from "vitest";
import type * as Blockly from "blockly";
import { MorphicBlocks } from "../src";
import type { MorphicBlocksFormat } from "../src/morphic/types";

/** Deleting a line in the codespace removes the block the line belongs to, as the workspace would. */

const format: MorphicBlocksFormat = {
  elementTypes: { js: "code" },
  modes: [{ name: "js", elements: ["js"] }],
  blocks: [
    {
      identifier: "when",
      elements: { js: "if (%1) {\n  %2\n}" },
      inputSlots: { "1": { kind: "value", name: "IF" }, "2": { kind: "statement", name: "DO" } },
      shape: "statement",
    },
    {
      identifier: "say",
      elements: { js: "say(%1);" },
      inputSlots: { "1": { kind: "value", name: "VALUE", default: { shadow: "num", fieldValues: { N: "1" } } } },
      shape: "statement",
    },
    {
      identifier: "plus",
      elements: { js: "%1 + %2" },
      inputSlots: {
        "1": { kind: "value", name: "A", default: { shadow: "num", fieldValues: { N: "3" } } },
        "2": { kind: "value", name: "B", default: { shadow: "num", fieldValues: { N: "5" } } },
      },
      output: true,
    },
    { identifier: "num", elements: { js: "%N" }, fields: { N: { type: "number", default: 0 } }, output: true },
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

async function setUp() {
  const engine = new MorphicBlocks(format, {});
  engines.push(engine);
  await engine.mount({ workspaceContainer: div(), codespaceContainer: div() });
  engine.setModes({ codespaceMode: "js" });
  const workspace = engine.getWorkspace()!;
  const make = (type: string) => {
    const block = workspace.newBlock(`morphic:${type}`) as Blockly.BlockSvg;
    block.initSvg();
    block.render();
    return block;
  };
  // if (3 + 5) { say(3 + 5); }  and, as its own group, 3 + 5
  const when = make("when");
  when.getInput("IF")!.connection!.connect(make("plus").outputConnection!);
  const say = make("say");
  when.getInput("DO")!.connection!.connect(say.previousConnection!);
  say.getInput("VALUE")!.connection!.connect(make("plus").outputConnection!);
  const loose = make("plus");
  loose.moveBy(0, 500);
  await settle();
  const internals = engine as unknown as {
    codespace: { getValue(): string };
    deleteBlockAtCodespaceLine(editor: unknown, line: number): void;
  };
  const deleteLine = async (line: number) => {
    internals.deleteBlockAtCodespaceLine(internals.codespace, line);
    await settle();
  };
  return { workspace, when, say, loose, deleteLine, text: () => internals.codespace.getValue() };
}

describe("deleting a line in the codespace", () => {
  test("removes the statement starting on it, with what it holds", async () => {
    const { workspace, when, deleteLine } = await setUp();
    expect(workspace.getBlockById(when.id)).not.toBeNull();

    await deleteLine(1);

    expect(workspace.getBlockById(when.id)).toBeNull();
  });

  test("removes a statement whose value has defaults, not the defaults", async () => {
    const { workspace, when, say, deleteLine } = await setUp();

    await deleteLine(2);

    expect(workspace.getBlockById(say.id)).toBeNull();
    expect(workspace.getBlockById(when.id)).not.toBeNull();
  });

  test("on a closing line removes the block it closes", async () => {
    const { workspace, when, deleteLine } = await setUp();

    await deleteLine(3);

    expect(workspace.getBlockById(when.id)).toBeNull();
  });

  test("removes a value standing as its own group", async () => {
    const { workspace, loose, text, deleteLine } = await setUp();
    const line = text().split("\n").indexOf("3 + 5") + 1;

    await deleteLine(line);

    expect(workspace.getBlockById(loose.id)).toBeNull();
  });
});
