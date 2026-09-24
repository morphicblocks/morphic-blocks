import { afterEach, describe, expect, test } from "vitest";
import type * as Blockly from "blockly";
import { MorphicBlocks } from "../src";
import type { MorphicBlocksFormat } from "../src/morphic/types";

/**
 * Blockly keeps one global table of block types, so two engines defining the
 * same block used to overwrite each other: a block created in one editor was
 * built from the other editor's definition. Each editor must keep its own.
 */

function format(label: string): MorphicBlocksFormat {
  return {
    elementTypes: { code: "code" },
    modes: [{ name: "only", elements: ["code"] }],
    blocks: [{ identifier: "say", elements: { code: label }, shape: "statement" }],
  };
}

const engines: MorphicBlocks[] = [];

function editor(label: string, js: string): MorphicBlocks {
  const engine = new MorphicBlocks(format(label), { say: () => `${js}\n` });
  engine.mount({ workspaceContainer: document.body.appendChild(document.createElement("div")) });
  engines.push(engine);
  return engine;
}

/** The text a freshly created `say` block shows in the given editor. */
function newBlockLabel(engine: MorphicBlocks): string {
  const block = engine.getWorkspace()!.newBlock("morphic:say") as Blockly.Block;
  return block.inputList.flatMap((input) => input.fieldRow).map((field) => field.getText()).join(" ");
}

afterEach(() => {
  for (const engine of engines.splice(0)) engine.dispose();
  document.body.innerHTML = "";
});

describe("several editors on one page", () => {
  test("each editor builds new blocks from its own definition", () => {
    const a = editor("A says hi", "a();");
    const b = editor("B says hi", "b();");

    expect(newBlockLabel(a)).toBe("A says hi");
    expect(newBlockLabel(b)).toBe("B says hi");
  });

  test("each editor generates code with its own behaviors", () => {
    const a = editor("A says hi", "a();");
    const b = editor("B says hi", "b();");
    newBlockLabel(a);
    newBlockLabel(b);

    expect(a.generateJavaScript()).toBe("a();\n");
    expect(b.generateJavaScript()).toBe("b();\n");
  });

  test("an editor keeps working after another one is closed", () => {
    const a = editor("A says hi", "a();");
    const b = editor("B says hi", "b();");
    b.dispose();

    expect(newBlockLabel(a)).toBe("A says hi");
  });
});
