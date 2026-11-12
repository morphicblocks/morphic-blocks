import { afterEach, describe, expect, test, vi } from "vitest";
import * as Blockly from "blockly";
import { MorphicBlocks } from "../src";
import type { MorphicBlocksFormat } from "../src/morphic/types";

/**
 * A reference field lists the names the program declares (what a field of
 * other blocks holds), and follows a declaration that is renamed. Its value
 * is the name, so text, generated code and saved programs read it as it is.
 */

const format: MorphicBlocksFormat = {
  elementTypes: { python: "code" },
  modes: [{ name: "in-python", elements: ["python"] }],
  blocks: [
    {
      identifier: "class_define",
      elements: { python: "class %NAME: pass" },
      fields: { NAME: { type: "text", default: "Dog" } },
      shape: "statement",
    },
    {
      identifier: "struct_define",
      elements: { python: "# struct %NAME" },
      fields: { NAME: { type: "text", default: "Point" } },
      shape: "statement",
    },
    {
      identifier: "class_new",
      elements: { python: "rex = %CLASS()" },
      fields: { CLASS: { type: "reference", to: "class_define.NAME", default: "Dog" } },
      shape: "statement",
    },
    {
      identifier: "type_new",
      elements: { python: "thing = %TYPE()" },
      fields: { TYPE: { type: "reference", to: ["class_define.NAME", "struct_define.NAME"] } },
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

async function setUp() {
  const engine = new MorphicBlocks(format, { class_new: (proxy) => `new ${proxy.fields.CLASS}();\n` });
  engines.push(engine);
  await engine.mount({ workspaceContainer: div(), codespaceContainer: div() });
  const workspace = engine.getWorkspace()!;
  const make = (type: string, fields: Record<string, string> = {}) => {
    const block = workspace.newBlock(`morphic:${type}`) as Blockly.BlockSvg;
    block.initSvg();
    block.render();
    for (const [name, value] of Object.entries(fields)) block.setFieldValue(value, name);
    return block;
  };
  const names = (block: Blockly.Block, field: string) =>
    (block.getField(field) as Blockly.FieldDropdown).getOptions().map(([, value]) => value);
  const codespace = (engine as unknown as { codespace: { getValue(): string } }).codespace;
  const textHas = (expected: string) => vi.waitFor(() => expect(codespace.getValue()).toContain(expected), { timeout: 3000 });
  const valueIs = (block: Blockly.Block, field: string, expected: string) =>
    vi.waitFor(() => expect(block.getFieldValue(field)).toBe(expected), { timeout: 3000 });
  return { engine, workspace, make, names, textHas, valueIs };
}

describe("a reference field", () => {
  test("lists the names the program declares, each once, in alphabetical order", async () => {
    const { make, names } = await setUp();
    make("class_define");
    make("class_define", { NAME: "Cat" });
    make("class_define", { NAME: "Cat" });
    make("struct_define");

    expect(names(make("class_new"), "CLASS")).toEqual(["Cat", "Dog"]);
    expect(names(make("type_new", { TYPE: "Dog" }), "TYPE")).toEqual(["Cat", "Dog", "Point"]);
  });

  test("a new one takes a declared name when its own names nothing", async () => {
    const { make, valueIs } = await setUp();
    make("class_define", { NAME: "Cat" });
    const withDefault = make("class_new");
    const withoutDefault = make("type_new");

    expect(withDefault.getFieldValue("CLASS")).toBe("Dog");
    await valueIs(withDefault, "CLASS", "Cat");
    await valueIs(withoutDefault, "TYPE", "Cat");
  });

  test("follows a declaration that is renamed, in text and generated code too", async () => {
    const { engine, make, valueIs, textHas } = await setUp();
    const declaration = make("class_define");
    const reference = make("class_new");
    await textHas("rex = Dog()");

    declaration.setFieldValue("Cat", "NAME");
    await valueIs(reference, "CLASS", "Cat");
    await textHas("rex = Cat()");
    expect(reference.getField("CLASS")!.getText()).toBe("Cat");
    expect(engine.generateJavaScript()).toContain("new Cat();");
  });

  test("stays when another declaration still has the old name", async () => {
    const { make, names } = await setUp();
    const first = make("class_define");
    make("class_define");
    const reference = make("class_new");

    first.setFieldValue("Cat", "NAME");
    await vi.waitFor(() => expect(names(reference, "CLASS")).toEqual(["Cat", "Dog"]), { timeout: 3000 });
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(reference.getFieldValue("CLASS")).toBe("Dog");
  });

  test("keeps a name whose declaration is gone, and still lists it", async () => {
    const { make, names, textHas } = await setUp();
    const declaration = make("class_define");
    const reference = make("class_new");
    declaration.dispose(false);

    expect(reference.getFieldValue("CLASS")).toBe("Dog");
    expect(names(reference, "CLASS")).toEqual(["Dog"]);
    await textHas("rex = Dog()");
  });

  test("a saved program loads with its names, whatever the order of its blocks", async () => {
    const { workspace, make } = await setUp();
    make("class_new").setFieldValue("Cat", "CLASS");
    make("class_define", { NAME: "Bird" });
    make("class_define", { NAME: "Cat" });
    const saved = Blockly.serialization.workspaces.save(workspace);
    expect(saved.blocks.blocks[0].fields).toEqual({ CLASS: "Cat" });

    workspace.clear();
    Blockly.serialization.workspaces.load(saved, workspace);
    const reference = workspace.getBlocksByType("morphic:class_new", false)[0]!;
    expect(reference.getFieldValue("CLASS")).toBe("Cat");
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(reference.getFieldValue("CLASS")).toBe("Cat");
  });
});

describe("a reference with a scope", () => {
  const scoped: MorphicBlocksFormat = {
    elementTypes: { python: "code" },
    modes: [{ name: "in-python", elements: ["python"] }],
    blocks: [
      {
        identifier: "class_define",
        elements: { python: "class %NAME:\n    %1" },
        fields: { NAME: { type: "text", default: "Dog" } },
        inputSlots: { "1": { kind: "statement", name: "BODY" } },
        shape: "statement",
      },
      {
        identifier: "class_field",
        elements: { python: "%NAME = 0" },
        fields: { NAME: { type: "text", default: "name" } },
        shape: "statement",
      },
      {
        identifier: "my_field",
        elements: { python: "print(self.%NAME)" },
        fields: { NAME: { type: "reference", to: "class_field.NAME", scope: "class_define", default: "name" } },
        shape: "statement",
      },
    ],
  };

  async function setUpScoped() {
    const engine = new MorphicBlocks(scoped, {});
    engines.push(engine);
    await engine.mount({ workspaceContainer: div(), codespaceContainer: div() });
    const workspace = engine.getWorkspace()!;
    const make = (type: string, name?: string) => {
      const block = workspace.newBlock(`morphic:${type}`) as Blockly.BlockSvg;
      block.initSvg();
      block.render();
      if (name) block.setFieldValue(name, "NAME");
      return block;
    };
    const classWith = (name: string, ...fields: string[]) => {
      const cls = make("class_define", name);
      let below = cls.getInput("BODY")!.connection!;
      for (const field of fields) {
        const block = make("class_field", field);
        below.connect(block.previousConnection);
        below = block.nextConnection;
      }
      return cls;
    };
    const last = (block: Blockly.Block) => {
      let tail = block.getInputTargetBlock("BODY")!;
      while (tail.getNextBlock()) tail = tail.getNextBlock()!;
      return tail;
    };
    const names = (block: Blockly.Block) => (block.getField("NAME") as Blockly.FieldDropdown).getOptions().map(([, value]) => value);
    return { make, classWith, last, names };
  }

  test("lists only what is declared in the block around it", async () => {
    const { make, classWith, last, names } = await setUpScoped();
    const dog = classWith("Dog", "age", "owner");
    classWith("Car", "wheels");
    const reference = make("my_field");

    // On its own it sees no class, and keeps its name.
    expect(names(reference)).toEqual(["name"]);
    last(dog).nextConnection!.connect(reference.previousConnection);
    // Its own name, which the class does not declare, comes last.
    expect(names(reference)).toEqual(["age", "owner", "name"]);
    await vi.waitFor(() => expect(reference.getFieldValue("NAME")).toBe("age"), { timeout: 3000 });
    expect(names(reference)).toEqual(["age", "owner"]);
  });

  test("follows a rename in its own class only", async () => {
    const { make, classWith, last } = await setUpScoped();
    const dog = classWith("Dog", "size");
    const car = classWith("Car", "size");
    const inDog = make("my_field");
    const inCar = make("my_field");
    last(dog).nextConnection!.connect(inDog.previousConnection);
    last(car).nextConnection!.connect(inCar.previousConnection);
    await vi.waitFor(() => expect([inDog.getFieldValue("NAME"), inCar.getFieldValue("NAME")]).toEqual(["size", "size"]), { timeout: 3000 });

    dog.getInputTargetBlock("BODY")!.setFieldValue("height", "NAME");
    await vi.waitFor(() => expect(inDog.getFieldValue("NAME")).toBe("height"), { timeout: 3000 });
    expect(inCar.getFieldValue("NAME")).toBe("size");
  });
});

describe("a name nothing declares", () => {
  const marked = (block: Blockly.Block) =>
    (block.getField("CLASS") as unknown as { fieldGroup_: SVGGElement }).fieldGroup_.classList.contains("morphic-reference-missing");

  test("is marked on the block and in the text, until it is declared again", async () => {
    const { make } = await setUp();
    const declaration = make("class_define");
    const reference = make("class_new");
    await vi.waitFor(() => expect(marked(reference)).toBe(false), { timeout: 3000 });

    declaration.dispose(false);
    await vi.waitFor(() => expect(marked(reference)).toBe(true), { timeout: 3000 });
    await vi.waitFor(() => expect(document.querySelector(".cm-content .morphic-reference-missing")?.textContent).toBe("Dog"), { timeout: 3000 });

    make("class_define");
    await vi.waitFor(() => expect(marked(reference)).toBe(false), { timeout: 3000 });
    await vi.waitFor(() => expect(document.querySelector(".cm-content .morphic-reference-missing")).toBeNull(), { timeout: 3000 });
  });

  test("a loaded program keeps it as it was saved", async () => {
    const { workspace, make } = await setUp();
    make("class_new");
    make("class_define", { NAME: "Cat" });
    await new Promise((resolve) => setTimeout(resolve, 50));
    const saved = Blockly.serialization.workspaces.save(workspace);
    (saved.blocks.blocks[0].fields as Record<string, string>).CLASS = "Dog";

    workspace.clear();
    Blockly.serialization.workspaces.load(saved, workspace);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(workspace.getBlocksByType("morphic:class_new", false)[0]!.getFieldValue("CLASS")).toBe("Dog");
  });
});

describe("a reference to something that does not exist stops the mount", () => {
  const withTarget = (to: string): MorphicBlocksFormat => ({
    ...format,
    blocks: [
      ...format.blocks.slice(0, 2),
      { identifier: "class_new", elements: { python: "%CLASS()" }, fields: { CLASS: { type: "reference", to } }, shape: "statement" },
    ],
  });
  const mount = (definitions: MorphicBlocksFormat) => {
    const engine = new MorphicBlocks(definitions, {});
    engines.push(engine);
    return () => engine.mount({ workspaceContainer: div() });
  };

  test("an unknown block", () => {
    expect(mount(withTarget("klass.NAME"))).toThrow(/refers to "klass.NAME", but there is no block "klass"/);
  });

  test("a field the block does not have", () => {
    expect(mount(withTarget("class_define.TITLE"))).toThrow(/block "class_define" has no field "TITLE"/);
  });

  test("an unknown scope", () => {
    const definitions = withTarget("class_define.NAME");
    (definitions.blocks[2]!.fields!.CLASS as { scope?: string }).scope = "klass";
    expect(mount(definitions)).toThrow(/has the scope "klass", but there is no block "klass"/);
  });

  test("a target that is not a block and a field", () => {
    expect(mount(withTarget("class_define"))).toThrow(/Write it as "block.FIELD"/);
  });
});
