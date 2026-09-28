import { afterEach, describe, expect, test } from "vitest";
import type * as Blockly from "blockly";
import { MorphicBlocks } from "../src";
import type { MorphicBlocksFormat } from "../src/morphic/types";

/**
 * A drop into the codespace makes only connections the workspace would make,
 * and a refused drop changes nothing.
 */

const format: MorphicBlocksFormat = {
  elementTypes: { code: "code" },
  modes: [{ name: "only", elements: ["code"] }],
  blocks: [
    {
      identifier: "select",
      elements: { code: "SELECT" },
      previousStatement: false,
      nextStatement: "Clause",
    },
    { identifier: "where", elements: { code: "WHERE" }, previousStatement: "Clause", nextStatement: "Clause" },
    { identifier: "print", elements: { code: "print(%1)" }, inputSlots: { "1": { kind: "value", name: "VALUE", check: "Number" } }, shape: "statement" },
    { identifier: "draw", elements: { code: "draw()" }, previousStatement: "Pen", nextStatement: "Pen" },
    { identifier: "number", elements: { code: "1" }, output: "Number" },
    { identifier: "text", elements: { code: '"a"' }, output: "String" },
  ],
};

type Target =
  | { kind: "statement"; targetBlockId: string; position: "before" | "after"; topIndex?: number }
  | { kind: "value-slot"; parentBlockId: string; inputName: string };

const engines: MorphicBlocks[] = [];

async function setUp() {
  const engine = new MorphicBlocks(format, {});
  engines.push(engine);
  await engine.mount({ workspaceContainer: document.body.appendChild(document.createElement("div")) });
  const workspace = engine.getWorkspace()!;
  const create = (type: string) => workspace.newBlock(`morphic:${type}`) as Blockly.BlockSvg;
  // Private: the rule every codespace drop passes before it changes anything.
  const allowed = (block: Blockly.BlockSvg, target: Target): boolean =>
    (engine as unknown as {
      codespaceDropAllowed(ws: Blockly.WorkspaceSvg, block: Blockly.BlockSvg, target: Target): boolean;
    }).codespaceDropAllowed(workspace, block, target);
  // Private: applies a drop the way a right button drag in the codespace does.
  const move = (block: Blockly.BlockSvg, target: Target) =>
    (engine as unknown as {
      applyRightDragMove(ws: Blockly.WorkspaceSvg, block: Blockly.BlockSvg, drop: { target: Target }): void;
    }).applyRightDragMove(workspace, block, { target });
  return { create, allowed, move };
}

afterEach(() => {
  for (const engine of engines.splice(0)) engine.dispose();
  document.body.innerHTML = "";
});

describe("codespace drops follow the workspace's connection checks", () => {
  test("a statement goes only where its connections fit", async () => {
    const { create, allowed } = await setUp();
    const select = create("select");

    expect(allowed(create("where"), { kind: "statement", targetBlockId: select.id, position: "after" })).toBe(true);
    expect(allowed(create("draw"), { kind: "statement", targetBlockId: select.id, position: "after" })).toBe(false);
  });

  test("a value goes only into a slot that accepts its type", async () => {
    const { create, allowed } = await setUp();
    const print = create("print");
    const slot = { kind: "value-slot", parentBlockId: print.id, inputName: "VALUE" } as const;

    expect(allowed(create("number"), slot)).toBe(true);
    expect(allowed(create("text"), slot)).toBe(false);
  });
});

test("a refused drop leaves the chain as it was", async () => {
  const { create, move } = await setUp();
  const select = create("select");
  const where = create("where");
  select.nextConnection!.connect(where.previousConnection!);
  const draw = create("draw");

  move(draw, { kind: "statement", targetBlockId: where.id, position: "before" });

  expect(select.getNextBlock()).toBe(where);
  expect(draw.getParent()).toBeNull();
});

test("a block that fits goes into a top level chain, as in the workspace", async () => {
  const { create, move } = await setUp();
  const select = create("select");
  const where = create("where");
  select.nextConnection!.connect(where.previousConnection!);
  const print = create("print");

  move(print, { kind: "statement", targetBlockId: select.id, position: "after", topIndex: 0 });

  expect(select.getNextBlock()).toBe(print);
  expect(print.getNextBlock()).toBe(where);
});

test("a block that does not fit a top level chain lands as its own stack", async () => {
  const { create, move } = await setUp();
  const select = create("select");
  const draw = create("draw");

  move(draw, { kind: "statement", targetBlockId: select.id, position: "after", topIndex: 1 });

  expect(select.getNextBlock()).toBeNull();
  expect(draw.getParent()).toBeNull();
  expect(draw.workspace.getTopBlocks(true)).toContain(draw);
});

test("a line of a top level chain is a place to connect", async () => {
  const engine = new MorphicBlocks(format, {});
  engines.push(engine);
  const div = () => document.body.appendChild(document.createElement("div"));
  await engine.mount({ workspaceContainer: div(), codespaceContainer: div() });
  const workspace = engine.getWorkspace()!;
  const select = workspace.newBlock("morphic:select") as Blockly.BlockSvg;
  const where = workspace.newBlock("morphic:where") as Blockly.BlockSvg;
  select.nextConnection!.connect(where.previousConnection!);
  // The codespace writes the blocks after a short debounce.
  await new Promise((resolve) => setTimeout(resolve, 300));

  // jsdom lays nothing out, so the pointer is placed on line 2 (WHERE), upper half.
  const internals = engine as unknown as {
    codespace: Record<string, unknown>;
    computeCodespaceDrop(editor: unknown, x: number, y: number): { target: Target } | null;
  };
  Object.assign(internals.codespace, {
    isBelowLastLine: () => false,
    getLineAtCoords: () => 2,
    charAtCoords: () => null,
    isInLowerHalfOfLine: () => false,
  });

  expect(internals.computeCodespaceDrop(internals.codespace, 0, 0)?.target).toEqual({
    kind: "statement",
    targetBlockId: where.id,
    position: "before",
    topIndex: 0,
  });
});

