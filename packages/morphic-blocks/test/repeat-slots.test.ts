import { afterEach, describe, expect, test, vi } from "vitest";
import * as Blockly from "blockly";
import { MorphicBlocks } from "../src";
import { settle } from "./settle";
import { MorphicRepeatButton } from "../src/morphic/block-view";
import type { MorphicBehaviorMap, MorphicBlocksFormat } from "../src/morphic/types";

/**
 * A repeating slot (`"repeat": { "separator": ", " }`) holds any number of
 * values: the template names it once, the block has one input per entry, and
 * plus and minus buttons add and remove entries.
 */

const format: MorphicBlocksFormat = {
  elementTypes: { python: "code", concept: "code" },
  modes: [{ name: "in-python", elements: ["python"] }],
  views: { "editor-pane": "workspace", "text-pane": "codespace", "read-pane": { kind: "workspace", editable: false } },
  presets: [{ name: "start", toolbox: "in-python", views: { "editor-pane": "python", "text-pane": "python", "read-pane": "python" } }],
  blocks: [
    {
      identifier: "call",
      elements: { python: "%NAME(%1)", concept: "call %NAME with %1" },
      fields: { NAME: { type: "text", default: "greet" } },
      inputSlots: {
        "1": { kind: "value", name: "ARGS", repeat: { separator: { python: ", ", concept: " and " }, count: 2 } },
      },
      shape: "statement",
    },
    {
      identifier: "list",
      elements: { python: "[%1]", concept: "list of %1" },
      inputSlots: { "1": { kind: "value", name: "ITEMS", repeat: {} } },
      output: true,
    },
    {
      identifier: "numbers",
      elements: { default: "nums(%1) and (%2)" },
      inputSlots: {
        "1": { kind: "value", name: "A", repeat: {}, default: { placeholder: "one" } },
        "2": { kind: "value", name: "B", repeat: {}, default: { shadow: "math_number", fieldValues: { NUM: "0" } } },
      },
      shape: "statement",
    },
    {
      identifier: "sum",
      elements: { default: "%1 + %2" },
      inputSlots: { "1": { kind: "value", name: "LEFT" }, "2": { kind: "value", name: "RIGHT" } },
      output: "Number",
    },
    { identifier: "one", elements: { default: "1" }, output: "Number" },
    { identifier: "two", elements: { default: "2" }, output: "Number" },
  ],
};
const behaviors: MorphicBehaviorMap = {
  call: (proxy) => `${proxy.fields.NAME}(${proxy.inputs.ARGS}); count(${(proxy.lists.ARGS ?? []).length});\n`,
  list: (proxy) => `[${(proxy.lists.ITEMS ?? []).join(", ")}]`,
  numbers: (proxy) => `nums(${proxy.inputs.A}, ${proxy.inputs.B});\n`,
  sum: (proxy) => `${proxy.inputs.LEFT} + ${proxy.inputs.RIGHT}`,
  one: () => "1",
  two: () => "2",
};

const engines: MorphicBlocks[] = [];
const div = () => document.body.appendChild(document.createElement("div"));

afterEach(() => {
  for (const engine of engines.splice(0)) engine.dispose();
  document.body.innerHTML = "";
});

type TextViews = { resolveView(name: string): { editor?: { getValue(): string }; workspace?: Blockly.WorkspaceSvg } | undefined };

async function setUp(panes = ["editor-pane", "text-pane"]) {
  const engine = new MorphicBlocks(format, behaviors);
  engines.push(engine);
  const containers = Object.fromEntries(panes.map((name) => [name, div()]));
  await engine.mount({ containers });
  const workspace = engine.getWorkspace()!;
  const make = (type: string) => {
    const block = workspace.newBlock(`morphic:${type}`) as Blockly.BlockSvg;
    block.initSvg();
    block.render();
    return block;
  };
  const put = (parent: Blockly.Block, input: string, type: string) => {
    const child = make(type);
    parent.getInput(input)!.connection!.connect(child.outputConnection);
    return child;
  };
  const inputs = (block: Blockly.Block) => block.inputList.map((input) => input.name).filter((name) => /^(ARGS|ITEMS|A|B)_\d+$/.test(name));
  const buttons = (block: Blockly.Block) =>
    block.inputList.flatMap((input) => input.fieldRow).filter((field) => field instanceof MorphicRepeatButton);
  const press = (block: Blockly.Block, action: "add" | "remove") =>
    (buttons(block).find((button) => button.action === action) as unknown as { showEditor_(): void }).showEditor_();
  const view = (name: string) => (engine as unknown as TextViews).resolveView(name)!;
  const textIs = (expected: string) => vi.waitFor(() => expect(view("text-pane").editor!.getValue()).toBe(expected), { timeout: 3000 });
  return { engine, workspace, containers, make, put, inputs, buttons, press, view, textIs };
}

describe("a repeating slot", () => {
  test("starts with its count of entries, one input each", async () => {
    const { make, inputs } = await setUp();

    expect(inputs(make("call"))).toEqual(["ARGS_0", "ARGS_1"]);
    expect(inputs(make("list"))).toEqual(["ITEMS_0"]);
  });

  test("writes its entries with the separator of the element shown", async () => {
    const { engine, make, put, textIs } = await setUp();
    const call = make("call");
    put(call, "ARGS_0", "one");
    put(call, "ARGS_1", "two");

    await textIs("greet(1, 2)");
    engine.show({ views: { "text-pane": "concept" } });
    await textIs("call greet with 1 and 2");
  });

  test("gets an entry with plus and loses the last with minus", async () => {
    const { make, put, inputs, press, textIs } = await setUp();
    const call = make("call");
    put(call, "ARGS_0", "one");
    put(call, "ARGS_1", "two");

    press(call, "add");
    expect(inputs(call)).toEqual(["ARGS_0", "ARGS_1", "ARGS_2"]);
    put(call, "ARGS_2", "one");
    await textIs("greet(1, 2, 1)");

    press(call, "remove");
    press(call, "remove");
    expect(inputs(call)).toEqual(["ARGS_0"]);
    expect(call.getInputTargetBlock("ARGS_0")?.type).toBe("morphic:one");
  });

  test("sets a block free that sat in a removed entry, and one undo brings both back", async () => {
    const { workspace, make, put, inputs, press } = await setUp();
    const call = make("call");
    const held = put(call, "ARGS_1", "two");
    await settle();

    press(call, "remove");
    expect(held.isDisposed()).toBe(false);
    expect(held.getParent()).toBeNull();
    await settle();

    workspace.undo(false);
    await settle();
    expect(inputs(call)).toEqual(["ARGS_0", "ARGS_1"]);
    expect(call.getInputTargetBlock("ARGS_1")?.type).toBe("morphic:two");
  });

  test("has no minus without entries, and writes nothing for them", async () => {
    const { make, buttons, press, textIs } = await setUp();
    const call = make("call");
    press(call, "remove");
    press(call, "remove");

    expect(buttons(call).map((button) => button.action)).toEqual(["add"]);
    await textIs("greet()");
  });

  test("hands behaviors its filled entries as a list and joined", async () => {
    const { engine, make, put, press } = await setUp();
    const call = make("call");
    put(call, "ARGS_0", "one");
    press(call, "add");
    const list = put(call, "ARGS_2", "list");
    put(list, "ITEMS_0", "two");

    expect(engine.generateJavaScript()).toContain("greet(1, [2]); count(2);");
  });

  test("is saved with the program and loaded with its entries", async () => {
    const { workspace, make, put, press, inputs, textIs } = await setUp();
    const call = make("call");
    press(call, "add");
    put(call, "ARGS_2", "two");
    const saved = Blockly.serialization.workspaces.save(workspace);
    expect(saved.blocks.blocks[0].extraState).toEqual({ repeat: { ARGS: 3 } });

    workspace.clear();
    Blockly.serialization.workspaces.load(saved, workspace);
    const loaded = workspace.getTopBlocks(false)[0]!;
    expect(inputs(loaded)).toEqual(["ARGS_0", "ARGS_1", "ARGS_2"]);
    expect(loaded.getInputTargetBlock("ARGS_2")?.type).toBe("morphic:two");
    await textIs("greet([VALUE], [VALUE], 2)");
  });

  test("shows in a read only view with the same entries and no buttons", async () => {
    const { make, press, inputs, buttons, view } = await setUp(["editor-pane", "text-pane", "read-pane"]);
    const call = make("call");
    press(call, "add");

    await vi.waitFor(() => expect(inputs(view("read-pane").workspace!.getTopBlocks(false)[0]!)).toHaveLength(3), { timeout: 3000 });
    expect(buttons(view("read-pane").workspace!.getTopBlocks(false)[0]!)).toHaveLength(0);
    expect(buttons(call).map((button) => button.action)).toEqual(["remove", "add"]);
  });
});

describe("an entry's default", () => {
  test("goes with its entry on minus, and a new entry gets a new one", async () => {
    const { workspace, make, press } = await setUp();
    const numbers = make("numbers");
    expect(numbers.getInputTargetBlock("A_0")?.type).toBe("morphic:one");

    press(numbers, "remove");
    expect(workspace.getTopBlocks(false)).toEqual([numbers]);
    press(numbers, "add");
    expect(numbers.getInputTargetBlock("A_0")?.type).toBe("morphic:one");
  });

  test("leaves no loose block when a plus is undone", async () => {
    const { workspace, make, press, inputs } = await setUp();
    const numbers = make("numbers");
    await settle();
    workspace.clearUndo();

    press(numbers, "add");
    expect(numbers.getInputTargetBlock("A_1")?.type).toBe("morphic:one");
    await settle();
    workspace.undo(false);
    expect(inputs(numbers)).toEqual(["A_0", "B_0"]);
    expect(workspace.getTopBlocks(false)).toEqual([numbers]);
  });

  test("keeps a value typed into it when its entry is removed and an undo brings it back", async () => {
    const { workspace, make, press, buttons } = await setUp();
    const numbers = make("numbers");
    numbers.getInputTargetBlock("B_0")!.setFieldValue("7", "NUM");
    await settle();
    workspace.clearUndo();

    (buttons(numbers).filter((button) => button.action === "remove")[1] as unknown as { showEditor_(): void }).showEditor_();
    expect(numbers.getInput("B_0")).toBeNull();
    await settle();
    workspace.undo(false);
    expect(numbers.getInputTargetBlock("B_0")?.getFieldValue("NUM")).toBe(7);

    // A plus is no undo: its entry starts with the default.
    (buttons(numbers).filter((button) => button.action === "add")[1] as unknown as { showEditor_(): void }).showEditor_();
    expect(numbers.getInputTargetBlock("B_1")?.getFieldValue("NUM")).toBe(0);
  });
});

test("two repeating slots on one row keep their own buttons", async () => {
  const { make, press } = await setUp();
  const numbers = make("numbers");
  press(numbers, "remove");
  const row = numbers.inputList.flatMap((input) => input.fieldRow).map((field) => field.getText());

  // The first list is empty and has a plus only; the second keeps its pair.
  expect(row.join(" ")).toBe("nums( + ) and ( − + )");
});

test("listed entries get no brackets in text, as in generated code", async () => {
  const { engine, make, put, textIs } = await setUp();
  const call = make("call");
  const sum = put(call, "ARGS_0", "sum");
  put(sum, "LEFT", "one");
  put(sum, "RIGHT", "two");
  put(call, "ARGS_1", "two");

  await textIs("greet(1 + 2, 2)");
  expect(engine.generateJavaScript()).toContain("greet(1 + 2, 2);");
  // Joined with a word, the entries are operands and keep their grouping.
  engine.show({ views: { "text-pane": "concept" } });
  await textIs("call greet with (1 + 2) and 2");
});

test("a program kept as XML keeps its entries", async () => {
  const { workspace, make, put, press, inputs } = await setUp();
  const call = make("call");
  press(call, "add");
  put(call, "ARGS_2", "two");
  const xml = Blockly.Xml.workspaceToDom(workspace);

  workspace.clear();
  Blockly.Xml.domToWorkspace(xml, workspace);
  const loaded = workspace.getTopBlocks(false)[0]!;
  expect(inputs(loaded)).toEqual(["ARGS_0", "ARGS_1", "ARGS_2"]);
  expect(loaded.getInputTargetBlock("ARGS_2")?.type).toBe("morphic:two");
});

describe("in a codespace", () => {
  const buttonsIn = (pane: Element) => Array.from(pane.querySelectorAll<HTMLButtonElement>(".morphic-repeat-button"));

  test("the buttons sit after the last entry and change the block", async () => {
    const { containers, make, put, inputs, textIs } = await setUp();
    const call = make("call");
    put(call, "ARGS_0", "one");
    await textIs("greet(1, [VALUE])");
    const pane = containers["text-pane"]!;

    await vi.waitFor(() => expect(buttonsIn(pane).map((button) => button.textContent)).toEqual(["−", "+"]), { timeout: 3000 });
    // After the entries, before the bracket that closes the list.
    expect(pane.querySelector(".cm-line")!.textContent).toBe("greet(1, [VALUE]−+)");

    buttonsIn(pane)[1]!.click();
    expect(inputs(call)).toEqual(["ARGS_0", "ARGS_1", "ARGS_2"]);
    await textIs("greet(1, [VALUE], [VALUE])");

    buttonsIn(pane)[0]!.click();
    await textIs("greet(1, [VALUE])");
  });

  test("a view that cannot be edited has none", async () => {
    const engine = new MorphicBlocks(
      { ...format, views: { "editor-pane": "workspace", "text-pane": { kind: "codespace", editable: false } } },
      behaviors,
    );
    engines.push(engine);
    const pane = div();
    await engine.mount({ containers: { "editor-pane": div(), "text-pane": pane } });
    engine.getWorkspace()!.newBlock("morphic:call");

    await vi.waitFor(() => expect(pane.querySelector(".cm-line")?.textContent).toContain("greet("), { timeout: 3000 });
    expect(buttonsIn(pane)).toHaveLength(0);
  });
});

test("a slot named like an entry of a repeating slot stops the mount", () => {
  const broken: MorphicBlocksFormat = {
    ...format,
    blocks: [
      {
        identifier: "call",
        elements: { python: "f(%1) %2" },
        inputSlots: { "1": { kind: "value", name: "ARGS", repeat: {} }, "2": { kind: "value", name: "ARGS_0" } },
      },
    ],
  };
  const engine = new MorphicBlocks(broken, {});
  engines.push(engine);

  expect(() => engine.mount({ containers: { "editor-pane": div() } })).toThrow(/the name of an entry of the repeating slot "ARGS"/);
});

test("%1:type on a repeating slot stops the mount", () => {
  const broken: MorphicBlocksFormat = {
    ...format,
    blocks: [{ identifier: "call", elements: { python: "%1:type f(%1)" }, inputSlots: { "1": { kind: "value", name: "ARGS", repeat: {} } } }],
  };
  const engine = new MorphicBlocks(broken, {});
  engines.push(engine);

  expect(() => engine.mount({ containers: { "editor-pane": div() } })).toThrow(/%1 repeats/);
});

test("a statement slot that repeats stops the mount", () => {
  const broken: MorphicBlocksFormat = {
    ...format,
    blocks: [{ identifier: "loop", elements: { python: "loop:\n    %1" }, inputSlots: { "1": { kind: "statement", name: "BODY", repeat: {} } } }],
  };
  const engine = new MorphicBlocks(broken, {});
  engines.push(engine);

  expect(() => engine.mount({ containers: { "editor-pane": div() } })).toThrow(/repeats, but it is a statement slot/);
});
