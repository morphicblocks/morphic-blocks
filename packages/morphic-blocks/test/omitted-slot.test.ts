import { afterEach, expect, test, vi } from "vitest";
import type * as Blockly from "blockly";
import { MorphicBlocks } from "../src";
import type { MorphicBlocksFormat } from "../src/morphic/types";

/**
 * A template may leave a declared slot out. The block keeps the slot, undrawn,
 * with the value in it: a class field has a start value in Python, and only a
 * type in Go (`name string`).
 */

const format: MorphicBlocksFormat = {
  elementTypes: { python: "code", go: "code" },
  modes: [{ name: "in-python", elements: ["python"] }],
  code: { go: { types: { String: "string", default: "any" } } },
  views: { "editor-pane": "workspace", "python-pane": "codespace", "go-pane": "codespace" },
  presets: [{ name: "start", toolbox: "in-python", views: { "editor-pane": "go", "python-pane": "python", "go-pane": "go" } }],
  blocks: [
    {
      identifier: "field",
      elements: { python: "self.%NAME = %1", go: "%NAME %1:type" },
      fields: { NAME: { type: "text", default: "name" } },
      inputSlots: { "1": { kind: "value", name: "VALUE" } },
      shape: "statement",
    },
    { identifier: "rex", elements: { default: '"Rex"' }, output: "String" },
  ],
};

const engines: MorphicBlocks[] = [];
const div = () => document.body.appendChild(document.createElement("div"));

afterEach(() => {
  for (const engine of engines.splice(0)) engine.dispose();
  document.body.innerHTML = "";
});

type TextViews = { resolveView(name: string): { editor?: { getValue(): string } } | undefined };

async function setUp() {
  const engine = new MorphicBlocks(format, { field: (proxy) => `this.${proxy.fields.NAME} = ${proxy.inputs.VALUE};\n`, rex: () => '"Rex"' });
  engines.push(engine);
  await engine.mount({ containers: { "editor-pane": div(), "python-pane": div(), "go-pane": div() } });
  const workspace = engine.getWorkspace()!;
  const make = (type: string) => {
    const block = workspace.newBlock(`morphic:${type}`) as Blockly.BlockSvg;
    block.initSvg();
    block.render();
    return block;
  };
  const text = (pane: string) => (engine as unknown as TextViews).resolveView(pane)!.editor!.getValue();
  const textIs = (pane: string, expected: string) => vi.waitFor(() => expect(text(pane)).toBe(expected), { timeout: 3000 });
  return { engine, make, textIs };
}

test("a block keeps the slot its template leaves out, hidden, with the value in it", async () => {
  const { engine, make, textIs } = await setUp();
  engine.show({ views: { "editor-pane": "python" } });
  const field = make("field");
  const value = make("rex");
  field.getInput("VALUE")!.connection!.connect(value.outputConnection);
  await textIs("python-pane", 'self.name = "Rex"');

  // Go has no place for the start value: the workspace hides it, the program keeps it.
  engine.show({ views: { "editor-pane": "go" } });
  expect(field.getInput("VALUE")!.isVisible()).toBe(false);
  expect(field.getInputTargetBlock("VALUE")).toBe(value);
  expect(value.getSvgRoot().style.display).toBe("none");
  await textIs("go-pane", "name string");
  await textIs("python-pane", 'self.name = "Rex"');
  expect(engine.generateJavaScript()).toContain('this.name = "Rex";');

  engine.show({ views: { "editor-pane": "python" } });
  expect(field.getInput("VALUE")!.isVisible()).toBe(true);
  expect(field.getInputTargetBlock("VALUE")).toBe(value);
  expect(value.getSvgRoot().style.display).not.toBe("none");
});

test("a block made while the slot is hidden has it too", async () => {
  const { make, textIs } = await setUp();
  const field = make("field");

  expect(field.getInput("VALUE")).not.toBeNull();
  expect(field.getInput("VALUE")!.isVisible()).toBe(false);
  await textIs("go-pane", "name any");
});

test("a slot written only as its type is in use, without a warning", () => {
  const onlyGo: MorphicBlocksFormat = {
    ...format,
    elementTypes: { go: "code" },
    modes: [{ name: "in-go", elements: ["go"] }],
    views: undefined,
    presets: undefined,
    blocks: [{ ...format.blocks[0]!, elements: { go: "%NAME %1:type" } }, format.blocks[1]!],
  };
  const warnings: string[] = [];
  const engine = new MorphicBlocks(onlyGo, {});
  engines.push(engine);
  void engine.mount({ workspaceContainer: div(), onWarning: (message) => warnings.push(message) });

  expect(warnings.join("\n")).not.toContain("inputSlots");
});

test("a slot that is not declared must be in every code element", () => {
  const broken: MorphicBlocksFormat = {
    ...format,
    blocks: [{ identifier: "field", elements: { python: "self.x = %1", go: "x" }, shape: "statement" }],
  };
  const engine = new MorphicBlocks(broken, {});
  engines.push(engine);

  expect(() => engine.mount({ containers: { "editor-pane": div() } })).toThrow(/Declare inputSlots\["1"\]/);
});
