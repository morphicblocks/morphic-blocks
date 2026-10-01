import { afterEach, describe, expect, test, vi } from "vitest";
import * as Blockly from "blockly";
import { MorphicBlocks } from "../src";
import type { MorphicBlocksFormat } from "../src/morphic/types";

/** Copy puts only the selected block's text on the system clipboard. */

const format: MorphicBlocksFormat = {
  elementTypes: { python: "code", words: "code" },
  modes: [
    { name: "py", elements: ["python"] },
    { name: "plain", elements: ["words"] },
  ],
  blocks: [
    {
      identifier: "repeat",
      elements: { python: "for i in range(3):\n    %1", words: "repeat 3 times\n  %1" },
      inputSlots: { "1": { kind: "statement", name: "DO" } },
      shape: "statement",
    },
    {
      identifier: "if",
      elements: { python: "if x:\n    %1", words: "if x then\n  %1" },
      inputSlots: { "1": { kind: "statement", name: "THEN" } },
      shape: "statement",
    },
    { identifier: "say", elements: { python: "print(1)", words: "say 1" }, shape: "statement" },
  ],
};

const engines: MorphicBlocks[] = [];
const div = () => document.body.appendChild(document.createElement("div"));

afterEach(() => {
  for (const engine of engines.splice(0)) engine.dispose();
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

async function setUp() {
  const engine = new MorphicBlocks(format, {});
  engines.push(engine);
  await engine.mount({ workspaceContainer: div(), codespaceContainer: div() });
  engine.setModes({ workspaceMode: "plain", codespaceMode: "py" });
  const workspace = engine.getWorkspace()!;
  const make = (type: string) => {
    const block = workspace.newBlock(`morphic:${type}`) as Blockly.BlockSvg;
    block.initSvg();
    block.render();
    return block;
  };
  // repeat { if { say } }
  const repeat = make("repeat");
  const branch = make("if");
  const say = make("say");
  repeat.getInput("DO")!.connection!.connect(branch.previousConnection!);
  branch.getInput("THEN")!.connection!.connect(say.previousConnection!);
  const written: string[] = [];
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText: async (text: string) => void written.push(text) },
  });
  // The codespace writes its text after a short pause.
  await new Promise((resolve) => setTimeout(resolve, 300));
  return { engine, branch, written };
}

describe("copying a block", () => {
  test("from the codespace takes only that block, without its indent", async () => {
    const { engine, branch, written } = await setUp();
    Blockly.common.setSelected(branch);

    engine.copyActiveBlock("codespace");

    expect(written).toEqual(["if x:\n    print(1)"]);
  });

  test("from the workspace takes the block as the workspace's mode writes it", async () => {
    const { engine, branch, written } = await setUp();
    Blockly.common.setSelected(branch);

    engine.copyActiveBlock("workspace");

    expect(written).toEqual(["if x then\n  say 1"]);
  });
});
