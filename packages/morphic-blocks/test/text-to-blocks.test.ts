import { afterEach, describe, expect, test } from "vitest";
import { MorphicBlocks } from "../src";
import { settle } from "./settle";
import type { MorphicBehaviorMap, MorphicBlocksFormat } from "../src/morphic/types";

/**
 * `loadText()` reads the text of a code element back into blocks. Each
 * block's template is its pattern; there is no parser per language. The same
 * blocks are read from a language with brackets and from one with indentation.
 */

const format: MorphicBlocksFormat = {
  elementTypes: { script: "code", python: "code" },
  modes: [{ name: "tiles", elements: ["script"] }],
  code: {
    script: { highlighting: { keywords: ["let", "if", "else", "while", "function", "return", "class", "new"], comment: "//" } },
    python: { emptyStatement: "pass", highlighting: { keywords: ["if", "else", "while", "def", "return", "class", "not"], comment: "#" } },
  },
  blocks: [
    { identifier: "print", elements: { script: "print(%1);", python: "print(%1)" }, inputSlots: { "1": { kind: "value", name: "VALUE" } }, shape: "statement" },
    { identifier: "note", elements: { script: "// %TEXT", python: "# %TEXT" }, fields: { TEXT: { type: "text", default: "" } }, shape: "statement" },
    { identifier: "number", elements: { default: "%NUM" }, fields: { NUM: { type: "number", default: 0 } }, output: "Number" },
    { identifier: "text", elements: { default: '"%TEXT"' }, fields: { TEXT: { type: "text", default: "" } }, output: "String" },
    {
      identifier: "truth",
      elements: { default: "%BOOL" },
      fields: { BOOL: { type: "dropdown", options: [{ value: "true", display: { python: "True" } }, { value: "false", display: { python: "False" } }] } },
      output: "Boolean",
    },
    {
      identifier: "create",
      elements: { script: "let %NAME = %1;", python: "%NAME = %1" },
      fields: { NAME: { type: "text", default: "x" } },
      inputSlots: { "1": { kind: "value", name: "VALUE" } },
      shape: "statement",
    },
    {
      identifier: "set",
      elements: { script: "%NAME = %1;", python: "%NAME = %1" },
      fields: { NAME: { type: "reference", to: "create.NAME", default: "x" } },
      inputSlots: { "1": { kind: "value", name: "VALUE" } },
      shape: "statement",
    },
    { identifier: "get", elements: { default: "%NAME" }, fields: { NAME: { type: "reference", to: "create.NAME", default: "x" } }, output: true },
    {
      identifier: "math",
      elements: { default: "%1 %OP %2" },
      fields: { OP: { type: "dropdown", options: ["+", "-", "*", "/"] } },
      inputSlots: { "1": { kind: "value", name: "A", check: "Number" }, "2": { kind: "value", name: "B", check: "Number" } },
      output: "Number",
    },
    {
      identifier: "compare",
      elements: { default: "%1 %OP %2" },
      fields: { OP: { type: "dropdown", options: ["==", "<", "<=", ">"] } },
      inputSlots: { "1": { kind: "value", name: "A" }, "2": { kind: "value", name: "B" } },
      output: "Boolean",
    },
    { identifier: "not", elements: { script: "!(%1)", python: "not %1" }, inputSlots: { "1": { kind: "value", name: "VALUE", check: "Boolean" } }, output: "Boolean" },
    {
      identifier: "join",
      elements: { default: "%1" },
      inputSlots: { "1": { kind: "value", name: "PARTS", repeat: { separator: " + ", count: 2 } } },
      output: "String",
    },
    { identifier: "list", elements: { default: "[%1]" }, inputSlots: { "1": { kind: "value", name: "ITEMS", repeat: {} } }, output: "List" },
    {
      identifier: "item",
      elements: { default: "%1[%2]" },
      inputSlots: { "1": { kind: "value", name: "LIST" }, "2": { kind: "value", name: "INDEX", check: "Number" } },
      output: true,
    },
    {
      identifier: "if",
      elements: { script: "if (%1) {\n  %2\n}", python: "if %1:\n    %2" },
      inputSlots: { "1": { kind: "value", name: "CONDITION", check: "Boolean" }, "2": { kind: "statement", name: "THEN" } },
      shape: "statement",
    },
    {
      identifier: "if_else",
      elements: { script: "if (%1) {\n  %2\n} else {\n  %3\n}", python: "if %1:\n    %2\nelse:\n    %3" },
      inputSlots: {
        "1": { kind: "value", name: "CONDITION", check: "Boolean" },
        "2": { kind: "statement", name: "THEN" },
        "3": { kind: "statement", name: "ELSE" },
      },
      shape: "statement",
    },
    {
      identifier: "function",
      elements: { script: "function %NAME(%1) {\n  %2\n}", python: "def %NAME(%1):\n    %2" },
      fields: { NAME: { type: "text", default: "f" } },
      inputSlots: {
        "1": { kind: "value", name: "PARAMS", check: "Parameter", strict: true, repeat: { count: 0 } },
        "2": { kind: "statement", name: "BODY" },
      },
      shape: "statement",
    },
    { identifier: "parameter", elements: { default: "%NAME" }, fields: { NAME: { type: "text", default: "p" } }, output: "Parameter", strict: true },
    {
      identifier: "parameter_get",
      elements: { default: "%NAME" },
      fields: { NAME: { type: "reference", to: "parameter.NAME", scope: "function", default: "p" } },
      output: true,
    },
    { identifier: "return", elements: { script: "return %1;", python: "return %1" }, inputSlots: { "1": { kind: "value", name: "VALUE" } }, shape: "end" },
    {
      identifier: "call",
      elements: { script: "%NAME(%1);", python: "%NAME(%1)" },
      fields: { NAME: { type: "reference", to: "function.NAME", default: "f" } },
      inputSlots: { "1": { kind: "value", name: "ARGS", repeat: { count: 0 } } },
      shape: "statement",
    },
    {
      identifier: "result",
      elements: { default: "%NAME(%1)" },
      fields: { NAME: { type: "reference", to: "function.NAME", default: "f" } },
      inputSlots: { "1": { kind: "value", name: "ARGS", repeat: { count: 0 } } },
      output: true,
    },
    {
      identifier: "class",
      elements: { script: "class %NAME {\n  %1\n  %2\n}", python: "class %NAME:\n    def __init__(self):\n        %1\n    %2" },
      fields: { NAME: { type: "text", default: "Dog" } },
      inputSlots: {
        "1": { kind: "statement", name: "FIELDS", check: "Field", strict: true },
        "2": { kind: "statement", name: "METHODS", check: "Method", strict: true },
      },
      shape: "statement",
    },
    {
      identifier: "field",
      elements: { script: "%NAME = %1;", python: "self.%NAME = %1" },
      fields: { NAME: { type: "text", default: "name" } },
      inputSlots: { "1": { kind: "value", name: "VALUE" } },
      previousStatement: "Field",
      nextStatement: "Field",
      strict: true,
    },
    {
      identifier: "method",
      elements: { script: "%NAME() {\n  %1\n}", python: "def %NAME(self):\n    %1" },
      fields: { NAME: { type: "text", default: "run" } },
      inputSlots: { "1": { kind: "statement", name: "BODY" } },
      previousStatement: "Method",
      nextStatement: "Method",
      strict: true,
    },
  ],
};

const behaviors: MorphicBehaviorMap = {
  print: (proxy) => `console.log(${proxy.inputs.VALUE});\n`,
  note: () => "",
  number: (proxy) => proxy.fields.NUM ?? "0",
  text: (proxy) => proxy.quoted.TEXT ?? '""',
  truth: (proxy) => proxy.fields.BOOL ?? "true",
  create: (proxy) => `let ${proxy.fields.NAME} = ${proxy.inputs.VALUE};\n`,
  set: (proxy) => `${proxy.fields.NAME} = ${proxy.inputs.VALUE};\n`,
  get: (proxy) => proxy.fields.NAME ?? "x",
  math: (proxy) => `${proxy.inputs.A} ${proxy.fields.OP} ${proxy.inputs.B}`,
  compare: (proxy) => `${proxy.inputs.A} ${proxy.fields.OP === "==" ? "===" : proxy.fields.OP} ${proxy.inputs.B}`,
  not: (proxy) => `!(${proxy.inputs.VALUE})`,
  join: (proxy) => (proxy.lists.PARTS ?? []).map((part) => `String(${part})`).join(" + "),
  list: (proxy) => `[${proxy.inputs.ITEMS}]`,
  item: (proxy) => `${proxy.inputs.LIST}[${proxy.inputs.INDEX}]`,
  if: (proxy) => `if (${proxy.inputs.CONDITION}) {\n${proxy.inputs.THEN ?? ""}\n}\n`,
  if_else: (proxy) => `if (${proxy.inputs.CONDITION}) {\n${proxy.inputs.THEN ?? ""}\n} else {\n${proxy.inputs.ELSE ?? ""}\n}\n`,
  function: (proxy) => `function ${proxy.fields.NAME}(${proxy.inputs.PARAMS}) {\n${proxy.inputs.BODY ?? ""}\n}\n`,
  parameter: (proxy) => proxy.fields.NAME ?? "p",
  parameter_get: (proxy) => proxy.fields.NAME ?? "p",
  return: (proxy) => `return ${proxy.inputs.VALUE};\n`,
  call: (proxy) => `${proxy.fields.NAME}(${proxy.inputs.ARGS});\n`,
  result: (proxy) => `${proxy.fields.NAME}(${proxy.inputs.ARGS})`,
  class: (proxy) => `class ${proxy.fields.NAME} {\n${proxy.inputs.FIELDS ?? ""}\n${proxy.inputs.METHODS ?? ""}\n}\n`,
  field: (proxy) => `${proxy.fields.NAME} = ${proxy.inputs.VALUE};\n`,
  method: (proxy) => `${proxy.fields.NAME}() {\n${proxy.inputs.BODY ?? ""}\n}\n`,
};

const engines: MorphicBlocks[] = [];
afterEach(() => {
  for (const engine of engines.splice(0)) engine.dispose();
  document.body.innerHTML = "";
});

async function setUp() {
  const engine = new MorphicBlocks(format, behaviors);
  engines.push(engine);
  await engine.mount({ workspaceContainer: document.body.appendChild(document.createElement("div")), onWarning: () => {} });
  const types = () =>
    engine
      .getWorkspace()!
      .getAllBlocks(true)
      .map((block) => block.type.replace("morphic:", ""));
  /** Load a text, and check it is written again exactly as it was read. */
  const read = (element: string, lines: string[]) => {
    const result = engine.loadText(lines.join("\n"), { element });
    expect(result).toMatchObject({ ok: true });
    expect(engine.generateText(element).split("\n")).toEqual(lines);
    return result;
  };
  const run = () => {
    const result = engine.runJavaScript();
    expect(result.error).toBeNull();
    return result.output.map((line) => line.text);
  };
  return { engine, types, read, run };
}

describe("a text is read into the blocks that write it", () => {
  test("statements, values and fields", async () => {
    const { read, types, run } = await setUp();

    expect(read("script", ["// a note with words", "let total = 2;", 'print("total: " + total);', "print(true);"])).toEqual({ ok: true, blocks: 9 });
    expect(types()).toEqual(["note", "create", "number", "print", "join", "text", "get", "print", "truth"]);
    expect(run()).toEqual(["total: 2", "true"]);
  });

  test("bodies by their brackets", async () => {
    const { read, run } = await setUp();
    read("script", ["let n = 3;", "if (n > 2) {", "  print(1);", "  if (n > 5) {", "    print(2);", "  } else {", "    print(3);", "  }", "}", "print(4);"]);

    expect(run()).toEqual(["1", "3", "4"]);
  });

  test("bodies by their indentation, and what a language spells its own way", async () => {
    const { engine, read, run } = await setUp();
    read("python", ["n = 3", "if n > 2:", "    print(1)", "    if not True:", "        print(2)", "    else:", "        print(3)", "print(4)"]);

    expect(run()).toEqual(["1", "3", "4"]);
    // The same blocks, in the other language.
    expect(engine.generateText("script").split("\n")).toEqual([
      "let n = 3;", "if (n > 2) {", "  print(1);", "  if (!(true)) {", "    print(2);", "  } else {", "    print(3);", "  }", "}", "print(4);",
    ]);
  });

  test("an empty body, written as the language writes it", async () => {
    const { read, types } = await setUp();
    read("python", ["if True:", "    pass", "print(1)"]);

    expect(types()).toEqual(["if", "truth", "print", "number"]);
  });

  test("the entries of a repeating slot, none or many", async () => {
    const { read, run } = await setUp();
    read("script", ["function add(a, b) {", "  return a + b;", "}", "function hello() {", '  print("hi");', "}", "hello();", "print(add(2, [3, 4][1]) + 1);"]);

    expect(run()).toEqual(["hi", "7"]);
  });

  test("a class: its slots take only their own kind of block", async () => {
    const { read, types, run } = await setUp();
    read("script", ["class Cat {", "  lives = 9;", "  speak() {", '    print("meow");', "  }", "}", "let lives = 1;", "lives = 2;", "print(lives);"]);

    // `lives = 9;` in the class is a field, `lives = 2;` below it sets the variable.
    expect(types()).toEqual(["class", "field", "number", "method", "print", "text", "create", "number", "set", "number", "print", "get"]);
    expect(run()).toEqual(["2"]);
  });

  test("a class in a language that nests by indentation", async () => {
    const { read, types } = await setUp();
    read("python", ["class Cat:", "    def __init__(self):", "        self.lives = 9", "    def speak(self):", '        print("meow")', "print(1)"]);

    expect(types()).toEqual(["class", "field", "number", "method", "print", "text", "print", "number"]);
  });
});

test("a field of the block around it is read as written, and nothing where there is no such block", async () => {
  const engine = new MorphicBlocks(
    {
      elementTypes: { go: "code" },
      modes: [{ name: "tiles", elements: ["go"] }],
      blocks: [
        {
          identifier: "struct",
          elements: { go: "type %NAME struct {}\n%1" },
          fields: { NAME: { type: "text", default: "Dog" } },
          inputSlots: { "1": { kind: "statement", name: "METHODS" } },
          shape: "statement",
        },
        { identifier: "method", elements: { go: "func (self *%parent.NAME) %METHOD() {}" }, fields: { METHOD: { type: "text", default: "bark" } }, shape: "statement" },
      ],
    },
    {},
  );
  engines.push(engine);
  await engine.mount({ workspaceContainer: document.body.appendChild(document.createElement("div")), onWarning: () => {} });

  for (const written of ["type Cat struct {}\nfunc (self *Cat) meow() {}", "func (self *) bark() {}"]) {
    expect(engine.loadText(written, { element: "go" })).toMatchObject({ ok: true });
    expect(engine.generateText("go")).toBe(written);
  }
  // A method that names another struct than the one it stands in is not this struct's.
  expect(engine.loadText("type Cat struct {}\nfunc (self *Dog) meow() {}", { element: "go" })).toMatchObject({ ok: false, line: 2 });
});

describe("where two blocks write the same text, the names decide", () => {
  test("the first `x = 1` creates the variable, the next ones set it", async () => {
    const { read, types, run } = await setUp();
    read("python", ["x = 1", "x = x + 1", "print(x)"]);

    expect(types()).toEqual(["create", "number", "set", "math", "get", "number", "print", "get"]);
    expect(run()).toEqual(["2"]);
  });

  test("a name in a function is its parameter when it has one of that name", async () => {
    const { read, types } = await setUp();
    read("python", ["n = 1", "def show(a):", "    print(a)", "    print(n)"]);

    expect(types()).toEqual(["create", "number", "function", "parameter", "print", "parameter_get", "print", "get"]);
  });
});

describe("what a person types differently", () => {
  test("spaces around signs are free, between words they are needed", async () => {
    const { engine, types } = await setUp();

    expect(engine.loadText("let  x=1+2;\nprint( x );", { element: "script" })).toMatchObject({ ok: true });
    expect(engine.generateText("script")).toBe("let x = 1 + 2;\nprint(x);");
    // Without the space, `letx` is one word: a variable that is set, not `x` created.
    engine.loadText("letx = 1;", { element: "script" });
    expect(types()).toEqual(["set", "number"]);
  });

  test("brackets group, and operators read in their order", async () => {
    const { engine, run } = await setUp();
    engine.loadText("print(2 * (3 + 4));\nprint((10 - 3) - 2);\nprint(2 + 3 * 4);", { element: "script" });

    expect(engine.generateText("script")).toBe("print(2 * (3 + 4));\nprint(10 - 3 - 2);\nprint(2 + 3 * 4);");
    expect(run()).toEqual(["14", "5", "14"]);
    // A comparison of a comparison means something else in every language, so it is not guessed at.
    expect(engine.loadText("print(n > 1 == true);", { element: "script" })).toEqual({
      ok: false,
      line: 1,
      message: "Put brackets around the parts of this line: these operators have no order.",
    });
  });

  test("a comment after a statement, and numbers as people write them", async () => {
    const { engine } = await setUp();

    expect(engine.loadText("let x = 1e3; // a thousand\nprint(.5);\nprint(-2.5);", { element: "script" })).toMatchObject({ ok: true });
    expect(engine.generateText("script")).toBe("let x = 1000;\nprint(0.5);\nprint(-2.5);");
    // A dot with no digit after it is not the number's: here it starts the next sign.
    expect(engine.loadText("print([1, 2][1.]);", { element: "script" })).toMatchObject({ ok: false });
  });

  test("blank lines are skipped", async () => {
    const { engine } = await setUp();
    engine.loadText("\nprint(1);\n\n\nprint(2);\n", { element: "script" });

    expect(engine.generateText("script")).toBe("print(1);\nprint(2);");
  });
});

describe("names are known where they are declared", () => {
  test("two functions may name their parameters alike, and a parameter may be named like a variable", async () => {
    const { read, types } = await setUp();
    read("python", ["x = 1", "def add(a, b):", "    return a + b", "def sub(a, x):", "    return a - x"]);

    expect(types().filter((type) => type.startsWith("parameter"))).toEqual([
      "parameter", "parameter", "parameter_get", "parameter_get", "parameter", "parameter", "parameter_get", "parameter_get",
    ]);
  });

  test("a variable made in one function is not the one made in another", async () => {
    const { read, types } = await setUp();
    read("python", ["def one():", "    x = 1", "def two():", "    x = 2", "x = 3"]);

    expect(types().filter((type) => type === "create" || type === "set")).toEqual(["create", "create", "create"]);
  });

  test("a name used before the line that declares it is still read as that name", async () => {
    const { read, types, run } = await setUp();
    read("python", ["def show():", "    print(total)", "total = 5", "show()", "r = later()", "def later():", "    return 1", "print(r)"]);

    expect(types()).toEqual([
      "function", "print", "get", "create", "number", "call", "create", "result", "function", "return", "number", "print", "get",
    ]);
    expect(run()).toEqual(["5", "1"]);
  });
});

test("a comment that reads like the mark of an empty body stays a comment", async () => {
  const { engine, types } = await setUp();
  const format = engine as unknown as { mountConfig: { code: Record<string, { emptyStatement?: string }> } };
  format.mountConfig.code.script!.emptyStatement = "// ...";

  expect(engine.loadText("// ...\nif (true) {\n  // ...\n}\nif (true) {\n  // ...\n  print(1);\n}", { element: "script" })).toMatchObject({ ok: true });
  expect(types()).toEqual(["note", "if", "truth", "if", "truth", "note", "print", "number"]);
});

test("deeply nested text is read in good time", async () => {
  const { engine } = await setUp();
  const nested = (depth: number): string => (depth === 0 ? "n" : `(n + ${nested(depth - 1)})`);
  const bodies = (depth: number, indent = ""): string =>
    depth === 0 ? `${indent}print(1);` : `${indent}if (true) {\n${bodies(depth - 1, indent + "  ")}\n${indent}}`;
  const calls = `print(${"f(".repeat(14)}1${")".repeat(14)});`;
  const started = Date.now();

  expect(engine.loadText(`let n = 1;\nprint(${nested(14)});\n${bodies(14)}\n${calls}`, { element: "script" })).toMatchObject({ ok: true });
  // A bracket that is missing at the end must not take long to find either.
  expect(engine.loadText(`print(${"f(".repeat(14)}1${")".repeat(13)});`, { element: "script" })).toMatchObject({ ok: false, line: 1 });
  expect(Date.now() - started).toBeLessThan(2000);
});

describe("a text that fits no block", () => {
  test("changes nothing and names the line", async () => {
    const { engine } = await setUp();
    engine.loadText("print(1);", { element: "script" });

    expect(engine.loadText("print(2);\nif (true) {\n  jump now;\n}", { element: "script" })).toEqual({
      ok: false,
      line: 3,
      message: 'No block writes "jump now;".',
    });
    expect(engine.generateText("script")).toBe("print(1);");
  });

  test("names a line that is indented wrongly", async () => {
    const { engine } = await setUp();

    expect(engine.loadText("print(1)\n    print(2)", { element: "python" })).toMatchObject({ ok: false, line: 2 });
  });

  test("an element that is no code element is refused", async () => {
    const { engine } = await setUp();

    expect(() => engine.loadText("x", { element: "tiles" })).toThrow(/tiles/);
  });
});

test("one undo brings the old program back", async () => {
  const { engine } = await setUp();
  engine.loadText("print(1);", { element: "script" });
  await settle();
  engine.getWorkspace()!.clearUndo();

  engine.loadText("print(2);\nprint(3);", { element: "script" });
  await settle();
  engine.getWorkspace()!.undo(false);
  expect(engine.generateText("script")).toBe("print(1);");
});
