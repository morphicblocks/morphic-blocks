import "blockly/blocks";
import * as Blockly from "blockly";
import { afterEach, describe, expect, test } from "vitest";
import { MorphicBlocks } from "../src";
import type { MorphicBlocksFormat } from "../src/morphic/types";

/**
 * Blockly's insertion markers, copies drawn while dragging, must get no
 * default slot values.
 */

const format: MorphicBlocksFormat = {
  elementTypes: {
    code: { type: "code", empty: { Number: { shadow: "math_number", fieldValues: { NUM: "1" } } } },
  },
  modes: [
    { name: "one", elements: ["code"] },
    { name: "two", elements: ["code"] },
  ],
  blocks: [
    {
      identifier: "print",
      elements: { code: "print(%1)" },
      shape: "statement",
      inputSlots: { "1": { kind: "value", name: "VALUE", check: "Number" } },
    },
    {
      identifier: "not",
      elements: { code: "not %1" },
      output: "Number",
      inputSlots: { "1": { kind: "value", name: "VALUE", check: "Number" } },
    },
  ],
};

const engines: MorphicBlocks[] = [];

async function mount() {
  const engine = new MorphicBlocks(format, { print: () => "", not: () => "" });
  engines.push(engine);
  await engine.mount({ workspaceContainer: document.body.appendChild(document.createElement("div")) });
  return { workspace: engine.getWorkspace()! };
}

function create(workspace: Blockly.WorkspaceSvg, type: string): Blockly.BlockSvg {
  const block = workspace.newBlock(`morphic:${type}`);
  block.initSvg();
  block.render();
  return block;
}

afterEach(() => {
  for (const engine of engines.splice(0)) engine.dispose();
  document.body.innerHTML = "";
});

describe("default slot values", () => {
  test("dropping a block onto an occupied slot previews without an error", async () => {
    const { workspace } = await mount();
    const print = create(workspace, "print");
    const inner = create(workspace, "not");
    print.getInput("VALUE")!.connection!.connect(inner.outputConnection!);
    const dragged = create(workspace, "not");

    const previewer = new Blockly.InsertionMarkerPreviewer(dragged);
    expect(() => {
      previewer.previewConnection(dragged.outputConnection!, print.getInput("VALUE")!.connection as Blockly.RenderedConnection);
      previewer.hidePreview();
    }).not.toThrow();
    previewer.dispose();
  });
});
