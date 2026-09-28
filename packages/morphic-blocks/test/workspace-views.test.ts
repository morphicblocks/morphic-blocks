import { afterEach, describe, expect, test } from "vitest";
import * as Blockly from "blockly";
import { MorphicBlocks } from "../src";
import type { MorphicBlocksFormat } from "../src/morphic/types";

/** Added workspaces show the program in their own mode and follow every change. */

const format: MorphicBlocksFormat = {
  elementTypes: { python: "code", javascript: "code" },
  modes: [
    { name: "py", elements: ["python"] },
    { name: "js", elements: ["javascript"] },
  ],
  blocks: [
    {
      identifier: "say",
      elements: { python: "print %WORD", javascript: "log %WORD" },
      fields: { WORD: { type: "text", default: "hi" } },
      shape: "statement",
    },
  ],
};

const engines: MorphicBlocks[] = [];
const div = () => document.body.appendChild(document.createElement("div"));
// Blockly fires change events after a tick, and the mirror copies one tick later.
const tick = () => new Promise((resolve) => setTimeout(resolve, 50));
const labels = (block: Blockly.Block | null) =>
  block?.inputList.flatMap((input) => input.fieldRow.map((field) => field.getText())).join(" ");

async function setUp() {
  const engine = new MorphicBlocks(format, { say: () => "" });
  engines.push(engine);
  await engine.mount({ workspaceContainer: div() });
  const main = engine.getWorkspace()!;
  const first = main.newBlock("morphic:say") as Blockly.BlockSvg;
  first.initSvg();
  first.render();
  const view = engine.addView({ kind: "workspace", container: div(), mode: "js", name: "mirror" });
  // Private: the mirror's own Blockly workspace.
  const mirror = (engine as unknown as { views: Set<{ workspace?: Blockly.WorkspaceSvg }> }).views
    .values()
    .next().value!.workspace!;
  return { engine, main, first, view, mirror };
}

afterEach(() => {
  for (const engine of engines.splice(0)) engine.dispose();
  document.body.innerHTML = "";
});

describe("added workspaces", () => {
  test("start with the program, drawn in their own mode", async () => {
    const { first, mirror } = await setUp();

    expect(labels(mirror.getBlockById(first.id))).toBe("log hi");
    expect(mirror.options.readOnly).toBe(true);
    // The block's create event arrives after the copy; it must not add it twice.
    await tick();
    expect(mirror.getAllBlocks(false)).toHaveLength(1);
  });

  test("follow new blocks, connections and field changes", async () => {
    const { main, first, mirror } = await setUp();
    const second = main.newBlock("morphic:say") as Blockly.BlockSvg;
    second.initSvg();
    second.render();
    first.nextConnection!.connect(second.previousConnection!);
    second.setFieldValue("there", "WORD");
    await tick();

    expect(mirror.getBlockById(first.id)?.getNextBlock()?.id).toBe(second.id);
    expect(labels(mirror.getBlockById(second.id))).toBe("log there");
  });

  test("follow deleted blocks", async () => {
    const { first, mirror } = await setUp();

    first.dispose(false);
    await tick();

    expect(mirror.getAllBlocks(false)).toHaveLength(0);
  });

  test("switch mode on their own and mirror the selection", async () => {
    const { first, view, mirror } = await setUp();

    view.setMode("py");
    expect(labels(mirror.getBlockById(first.id))).toBe("print hi");

    Blockly.common.setSelected(first);
    await tick();
    expect(mirror.getBlockById(first.id)?.getSvgRoot().classList).toContain("blocklySelected");
  });

  test("cannot be made editable yet, and leave nothing behind", async () => {
    const { engine, main, view } = await setUp();

    expect(() => engine.addView({ kind: "workspace", container: div(), mode: "py", editable: true as never })).toThrow(
      /read only for now/,
    );
    view.dispose();
    main.newBlock("morphic:say");
    await tick();
    expect(engine.getViewMode("mirror")).toBeUndefined();
  });

});
