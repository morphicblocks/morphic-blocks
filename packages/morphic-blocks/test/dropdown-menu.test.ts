import { afterEach, describe, expect, test } from "vitest";
import type * as Blockly from "blockly";
import { MorphicBlocks } from "../src";
import type { MorphicBlocksFormat } from "../src/morphic/types";

/** A declared dropdown's menu carries classes, so an app can style one dropdown's choices. */

const format: MorphicBlocksFormat = {
  elementTypes: { block: "code" },
  modes: [{ name: "blocks", elements: ["block"] }],
  blocks: [
    {
      identifier: "pen",
      elements: { block: "pen %COLOR" },
      fields: { COLOR: { type: "dropdown", options: [{ value: "red", label: { color: "#e53935" } }, "blue"] } },
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

describe("a dropdown's menu", () => {
  test("is classed for app CSS, by field name", async () => {
    const engine = new MorphicBlocks(format, {});
    engines.push(engine);
    await engine.mount({ workspaceContainer: div() });
    const block = engine.getWorkspace()!.newBlock("morphic:pen") as Blockly.BlockSvg;
    block.initSvg();
    block.render();
    const field = block.getField("COLOR") as unknown as { showEditor_(): void; menu_: { getElement(): HTMLElement | null } | null };

    field.showEditor_();

    expect(field.menu_?.getElement()?.classList).toContain("morphic-menu");
    expect(field.menu_?.getElement()?.classList).toContain("morphic-menu-COLOR");
  });
});
