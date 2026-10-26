import { afterEach, describe, expect, test, vi } from "vitest";
import type * as Blockly from "blockly";
import { MorphicBlocks } from "../src";
import type { MorphicBlocksFormat } from "../src/morphic/types";

/** A dropdown choice can show a picture on the block; text views still write its value. */

const format: MorphicBlocksFormat = {
  elementTypes: { block: "code" },
  modes: [{ name: "blocks", elements: ["block"] }],
  blocks: [
    {
      identifier: "go",
      elements: { block: "go %WAY" },
      fields: {
        WAY: {
          type: "dropdown",
          options: [
            { value: "left", label: { src: "icons/left.svg" } },
            { value: "right", label: { src: "icons/right.svg", alt: "to the right", width: 24, height: 20 } },
          ],
        },
      },
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

async function setUp(definitions: MorphicBlocksFormat = format) {
  const engine = new MorphicBlocks(definitions, {});
  engines.push(engine);
  await engine.mount({ workspaceContainer: div(), codespaceContainer: div() });
  const block = engine.getWorkspace()!.newBlock("morphic:go") as Blockly.BlockSvg;
  block.initSvg();
  block.render();
  const codespace = (engine as unknown as { codespace: { getValue(): string } }).codespace;
  return { block, codespace };
}

describe("an image dropdown choice", () => {
  test("shows the picture on the block", async () => {
    const { block } = await setUp();
    const options = (block.getField("WAY") as Blockly.FieldDropdown).getOptions();

    expect(options[0]).toEqual([{ src: "icons/left.svg", alt: "left", width: 16, height: 16 }, "left"]);
    expect(options[1]).toEqual([{ src: "icons/right.svg", alt: "to the right", width: 24, height: 20 }, "right"]);
  });

  test("writes its value in text views", async () => {
    const { block, codespace } = await setUp();
    block.setFieldValue("right", "WAY");

    await vi.waitFor(() => expect(codespace.getValue()).toBe("go right"), { timeout: 3000 });
  });

  test("needs a src", () => {
    const broken = structuredClone(format);
    (broken.blocks[0]!.fields!.WAY as { options: unknown[] }).options = [{ value: "up", label: { alt: "up" } }];

    expect(() => new MorphicBlocks(broken, {}).mount({ workspaceContainer: div() })).toThrow(/image label without "src"/);
  });
});
