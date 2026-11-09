import { afterEach, describe, expect, test, vi } from "vitest";
import { MorphicBlocks } from "../src";
import type { MorphicBehaviorMap, MorphicBlocksFormat } from "../src/morphic/types";

/**
 * A template decides what a block shows, its `fields` what it has. A field the
 * shown template leaves out stays on the block, undrawn, so no view, generated
 * code or saved program loses it, with or without a visible workspace.
 */

const format: MorphicBlocksFormat = {
  elementTypes: { outline: "code", python: "code", go: "code" },
  modes: [
    { name: "in-python", elements: ["python"] },
    { name: "in-go", elements: ["go"] },
  ],
  views: { "editor-pane": "workspace", "text-pane": "codespace", "read-pane": { kind: "codespace", editable: false } },
  presets: [
    { name: "outline-preset", toolbox: "in-python", views: { "editor-pane": "outline", "text-pane": "python" } },
    { name: "python-preset", toolbox: "in-python", views: { "editor-pane": "python", "text-pane": "python" } },
    { name: "go-preset", toolbox: "in-go", views: { "text-pane": "go", "read-pane": "python" } },
  ],
  blocks: [
    {
      identifier: "wait",
      elements: { outline: "wait", python: 'wait("%UNIT")', go: 'Wait("%UNIT")' },
      fields: { UNIT: { type: "dropdown", options: [{ value: "seconds" }, { value: "minutes" }], default: "seconds" } },
      shape: "statement",
    },
  ],
};
const behaviors: MorphicBehaviorMap = { wait: (proxy) => `run(${JSON.stringify(proxy.fields.UNIT)});\n` };

const engines: MorphicBlocks[] = [];
const div = () => document.body.appendChild(document.createElement("div"));

afterEach(() => {
  for (const engine of engines.splice(0)) engine.dispose();
  document.body.innerHTML = "";
});

type TextViews = { resolveView(name: string): { editor?: { getValue(): string } } | undefined };

async function setUp(panes: string[], engineBehaviors: MorphicBehaviorMap = behaviors) {
  const engine = new MorphicBlocks(format, engineBehaviors);
  engines.push(engine);
  const containers = Object.fromEntries(panes.map((name) => [name, div()]));
  await engine.mount({ containers });
  const wait = engine.getWorkspace()!.newBlock("morphic:wait");
  const text = () => (engine as unknown as TextViews).resolveView("text-pane")!.editor!.getValue();
  const settle = () => new Promise((resolve) => setTimeout(resolve, 100));
  return { engine, wait, text, settle };
}

describe.each([
  ["a visible workspace showing an element without the field", ["editor-pane", "text-pane"]],
  ["a hidden program", ["text-pane"]],
])("with %s", (_, panes) => {
  test("the text views write the field and generated code gets it", async () => {
    const { engine, wait, text } = await setUp(panes);

    expect(wait.getFieldValue("UNIT")).toBe("seconds");
    await vi.waitFor(() => expect(text()).toContain('wait("seconds")'), { timeout: 3000 });
    expect(engine.generateJavaScript()).toContain('run("seconds")');
  });

  test("a value survives switching what the views show", async () => {
    const { engine, wait, text, settle } = await setUp(panes);
    wait.setFieldValue("minutes", "UNIT");

    engine.applyPreset("go-preset");
    engine.applyPreset("outline-preset");
    engine.applyPreset("go-preset");
    await settle();

    expect(text()).toContain('Wait("minutes")');
    expect(engine.generateJavaScript()).toContain('run("minutes")');
  });

  test("a saved program keeps the value", async () => {
    const { engine, wait } = await setUp(panes);
    wait.setFieldValue("minutes", "UNIT");

    engine.loadWorkspace(engine.serializeWorkspace());

    expect(engine.getWorkspace()!.getAllBlocks(false)[0]!.getFieldValue("UNIT")).toBe("minutes");
  });
});

describe("a field the template leaves out", () => {
  test("is not drawn", async () => {
    const { wait } = await setUp(["editor-pane", "text-pane"]);

    const row = wait.inputList.find((input) => input.fieldRow.some((field) => field.name === "UNIT"))!;
    expect(row.isVisible()).toBe(false);
    expect(wait.getField("UNIT")!.isVisible()).toBe(false);
  });

  test("is drawn again when the template writes it, with one field only", async () => {
    const { engine, wait } = await setUp(["editor-pane", "text-pane"]);

    engine.applyPreset("python-preset");

    const rows = wait.inputList.filter((input) => input.fieldRow.some((field) => field.name === "UNIT"));
    expect(rows).toHaveLength(1);
    expect(rows[0]!.isVisible()).toBe(true);
  });

  test("is left alone when a behavior attaches a field of that name", async () => {
    const { wait } = await setUp(["editor-pane", "text-pane"], {
      wait: {
        generate: () => "",
        onViewApplied: (block: import("blockly").BlockSvg) => {
          block.appendDummyInput("OWN").appendField("own", "UNIT");
        },
      },
    });

    const fields = wait.inputList.flatMap((input) => input.fieldRow).filter((field) => field.name === "UNIT");
    expect(fields).toHaveLength(1);
  });
});

describe("a hidden program", () => {
  test("leaves the text views free to switch", async () => {
    const { engine } = await setUp(["text-pane", "read-pane"]);

    engine.show({ toolbox: "in-go", views: { "text-pane": "go", "read-pane": "python" } });

    expect(engine.getViewElement("text-pane")).toBe("go");
    expect(engine.getViewElement("read-pane")).toBe("python");
  });
});
