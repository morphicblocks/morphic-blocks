import { afterEach, describe, expect, test } from "vitest";
import type * as Blockly from "blockly";
import { MorphicBlocks } from "../src";
import type { MorphicBlocksFormat } from "../src/morphic/types";

/** A view can run right to left or left to right on its own; left out, it follows the page. */

const format: MorphicBlocksFormat = {
  elementTypes: { arabic: "code", python: "code" },
  modes: [{ name: "tiles", elements: ["arabic"] }],
  views: {
    blocks: { kind: "workspace", rtl: true },
    mirror: { kind: "workspace", rtl: false },
    code: { kind: "codespace", rtl: false },
    plain: "codespace",
  },
  blocks: [{ identifier: "say", elements: { arabic: "قل", python: "print()" }, shape: "statement" }],
};

const engines: MorphicBlocks[] = [];
const div = () => document.body.appendChild(document.createElement("div"));

afterEach(() => {
  for (const engine of engines.splice(0)) engine.dispose();
  document.body.innerHTML = "";
});

describe("a view's direction", () => {
  test("is set per view, and left out follows the page", async () => {
    const engine = new MorphicBlocks(format, {});
    engines.push(engine);
    const containers = { blocks: div(), mirror: div(), code: div(), plain: div() };
    await engine.mount({ containers });
    const mirror = [...(engine as unknown as { views: Set<{ name: string; workspace?: Blockly.WorkspaceSvg }> }).views]
      .find((view) => view.name === "mirror")!.workspace!;

    expect(engine.getWorkspace()!.RTL).toBe(true);
    expect(mirror.RTL).toBe(false);
    expect(containers.code.dir).toBe("ltr");
    expect(containers.plain.dir).toBe("");
  });
});
