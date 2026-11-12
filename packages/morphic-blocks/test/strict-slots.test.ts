import { afterEach, describe, expect, test } from "vitest";
import type * as Blockly from "blockly";
import { MorphicBlocks } from "../src";
import type { MorphicBlocksFormat } from "../src/morphic/types";

/**
 * A strict slot takes only blocks whose check matches its own. Without
 * `strict`, a block that has no check fits every slot.
 */

const format: MorphicBlocksFormat = {
  elementTypes: { code: "code" },
  modes: [{ name: "only", elements: ["code"] }],
  blocks: [
    {
      identifier: "group",
      elements: { code: "group %1 open %2 amount %3" },
      inputSlots: {
        "1": { kind: "statement", name: "PARTS", check: "Part", strict: true },
        "2": { kind: "statement", name: "OPEN", check: "Part" },
        "3": { kind: "value", name: "AMOUNT", check: "Number", strict: true },
      },
      shape: "statement",
    },
    { identifier: "part", elements: { code: "part" }, previousStatement: "Part", nextStatement: "Part" },
    { identifier: "say", elements: { code: "say" }, shape: "statement" },
    { identifier: "five", elements: { code: "5" }, output: "Number" },
    { identifier: "anything", elements: { code: "x" }, output: true },
  ],
};

const engines: MorphicBlocks[] = [];
const div = () => document.body.appendChild(document.createElement("div"));

afterEach(() => {
  for (const engine of engines.splice(0)) engine.dispose();
  document.body.innerHTML = "";
});

async function setUp() {
  const engine = new MorphicBlocks(format, {});
  engines.push(engine);
  await engine.mount({ workspaceContainer: div(), codespaceContainer: div() });
  const workspace = engine.getWorkspace()!;
  const make = (type: string) => workspace.newBlock(`morphic:${type}`) as Blockly.BlockSvg;
  const fits = (a: Blockly.Connection | null, b: Blockly.Connection | null) =>
    workspace.connectionChecker.canConnect(a, b, false);
  return { engine, make, fits };
}

describe("a strict statement slot", () => {
  test("takes a block with its check and refuses one without a check", async () => {
    const { make, fits } = await setUp();
    const slot = make("group").getInput("PARTS")!.connection;

    expect(fits(slot, make("part").previousConnection)).toBe(true);
    expect(fits(slot, make("say").previousConnection)).toBe(false);
  });

  test("refuses it below the blocks already in the slot too", async () => {
    const { make, fits } = await setUp();
    const first = make("part");
    make("group").getInput("PARTS")!.connection!.connect(first.previousConnection);

    expect(fits(first.nextConnection, make("part").previousConnection)).toBe(true);
    expect(fits(first.nextConnection, make("say").previousConnection)).toBe(false);
  });

  test("refuses a stack that has such a block further down", async () => {
    const { make, fits } = await setUp();
    const top = make("part");
    top.nextConnection!.connect(make("say").previousConnection!);
    const slot = make("group").getInput("PARTS")!.connection;

    expect(fits(slot, top.previousConnection)).toBe(false);
    top.getNextBlock()!.dispose(false);
    top.nextConnection!.connect(make("part").previousConnection!);
    expect(fits(slot, top.previousConnection)).toBe(true);
  });

  test("leaves a stack outside it as it was", async () => {
    const { make, fits } = await setUp();

    expect(fits(make("part").nextConnection, make("say").previousConnection)).toBe(true);
  });
});

test("a slot that is not strict still takes a block without a check", async () => {
  const { make, fits } = await setUp();

  expect(fits(make("group").getInput("OPEN")!.connection, make("say").previousConnection)).toBe(true);
});

test("a strict value slot refuses a value without a type", async () => {
  const { make, fits } = await setUp();
  const slot = make("group").getInput("AMOUNT")!.connection;

  expect(fits(slot, make("five").outputConnection)).toBe(true);
  expect(fits(slot, make("anything").outputConnection)).toBe(false);
});

test("a strict slot without a check stops the mount", () => {
  const broken: MorphicBlocksFormat = {
    ...format,
    blocks: [{ identifier: "group", elements: { code: "group %1" }, inputSlots: { "1": { kind: "statement", strict: true } } }],
  };
  const engine = new MorphicBlocks(broken, {});
  engines.push(engine);

  expect(() => engine.mount({ workspaceContainer: div() })).toThrow(/is strict but has no check/);
});
