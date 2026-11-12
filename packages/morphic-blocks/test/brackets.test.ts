import { afterEach, beforeEach, describe, expect, test } from "vitest";
import type * as Blockly from "blockly";
import { MorphicBlocks } from "../src";
import { applyBlockShapes, createDefinitionMap, expandDefaultElements } from "../src/morphic/definitions";
import { closesItself, generateTextFromWorkspace } from "../src/morphic/template-codegen";
import { parseTemplate, slotIsExposed } from "../src/morphic/template";
import type { MorphicBehaviorMap, MorphicBlocksFormat } from "../src/morphic/types";

/**
 * Operand brackets, checked on both paths that turn blocks into text: the
 * rendered text the codespace and preview show (templates), and the executable
 * JavaScript (behaviors). A composed operand is bracketed only when its parent
 * composes several values, so `%1 %OP %2` keeps its grouping while single slot
 * templates such as `print(%1)` and `if %1:` stay clean.
 */

const format: MorphicBlocksFormat = {
  elementTypes: { python: "code", javascript: "code" },
  modes: [
    { name: "py", elements: ["python"] },
    { name: "js", elements: ["javascript"] },
  ],
  blocks: [
    {
      identifier: "print",
      elements: { python: "print(%1)", javascript: "console.log(%1);" },
      inputSlots: { "1": { kind: "value", name: "VALUE" } },
      shape: "statement",
    },
    {
      identifier: "if",
      elements: { python: "if %1:\n    %2", javascript: "if (%1) {\n  %2\n}" },
      inputSlots: {
        "1": { kind: "value", name: "CONDITION" },
        "2": { kind: "statement", name: "DO" },
      },
      shape: "statement",
    },
    {
      identifier: "math",
      elements: { default: "%1 %OP %2" },
      inputSlots: { "1": { kind: "value", name: "A" }, "2": { kind: "value", name: "B" } },
      fields: { OP: { type: "dropdown", options: ["+", "-", "*", "/"] } },
      output: true,
    },
    {
      identifier: "compare",
      elements: { default: "%1 %OP %2" },
      inputSlots: { "1": { kind: "value", name: "A" }, "2": { kind: "value", name: "B" } },
      fields: { OP: { type: "dropdown", options: ["==", "!=", "<", ">"] } },
      output: "Boolean",
    },
    {
      identifier: "number",
      elements: { default: "%NUM" },
      fields: { NUM: { type: "number", default: 0 } },
      output: "Number",
    },
  ],
};

const behaviors: MorphicBehaviorMap = {
  print: (p) => `console.log(${p.inputs.VALUE ?? "undefined"});\n`,
  if: (p) => `if (${p.inputs.CONDITION ?? "false"}) {\n${p.inputs.DO ?? ""}\n}\n`,
  math: (p) => `${p.inputs.A} ${p.fields.OP} ${p.inputs.B}`,
  compare: (p) => `${p.inputs.A} ${p.fields.OP} ${p.inputs.B}`,
  number: (p) => p.fields.NUM ?? "0",
};

// The same definitions the engine builds internally, for the template path.
const definitions = createDefinitionMap(
  applyBlockShapes(expandDefaultElements(format.blocks, format.elementTypes ?? {})),
);

let engine: MorphicBlocks;
let workspace: Blockly.WorkspaceSvg;

beforeEach(() => {
  const container = document.createElement("div");
  document.body.appendChild(container);
  engine = new MorphicBlocks(format, behaviors);
  // No presets, so the first mode ("py") drives the workspace.
  engine.mount({ workspaceContainer: container });
  workspace = engine.getWorkspace()!;
});

afterEach(() => {
  engine.dispose();
  document.body.innerHTML = "";
});

// ── Building blocks ───────────────────────────────────────

function block(type: string, fields: Record<string, string | number> = {}): Blockly.Block {
  const created = workspace.newBlock(`morphic:${type}`);
  for (const [name, value] of Object.entries(fields)) created.setFieldValue(value, name);
  return created;
}

function plug(parent: Blockly.Block, input: string, child: Blockly.Block): void {
  parent.getInput(input)!.connection!.connect(child.outputConnection!);
}

const num = (value: number) => block("number", { NUM: value });

function math(a: Blockly.Block, op: string, b: Blockly.Block): Blockly.Block {
  const created = block("math", { OP: op });
  plug(created, "A", a);
  plug(created, "B", b);
  return created;
}

function compare(a: Blockly.Block, op: string, b: Blockly.Block): Blockly.Block {
  const created = block("compare", { OP: op });
  plug(created, "A", a);
  plug(created, "B", b);
  return created;
}

function print(value: Blockly.Block): Blockly.Block {
  const created = block("print");
  plug(created, "VALUE", value);
  return created;
}

/** Rendered text for a mode, as the codespace and preview show it. */
function text(mode: "py" | "js"): string {
  return generateTextFromWorkspace(workspace, mode, definitions, format.elementTypes ?? {}, format.modes ?? []).code;
}

// ── Tests ────────────────────────────────────────────────

describe("operand brackets", () => {
  test("a composed operand of an operator is bracketed", () => {
    math(math(num(3), "+", num(4)), "*", num(2));

    expect(text("py")).toBe("(3 + 4) * 2");
    expect(text("js")).toBe("(3 + 4) * 2");
    expect(engine.generateJavaScript()).toContain("(3 + 4) * 2");
  });

  test("simple operands stay bare", () => {
    math(num(3), "+", num(4));

    expect(text("py")).toBe("3 + 4");
    expect(engine.generateJavaScript()).toContain("3 + 4");
    expect(engine.generateJavaScript()).not.toContain("(");
  });

  test("a single slot such as print adds no extra brackets", () => {
    print(math(num(2), "*", num(3)));

    expect(text("py")).toBe("print(2 * 3)");
    expect(text("js")).toBe("console.log(2 * 3);");
    expect(engine.generateJavaScript()).toContain("console.log(2 * 3);");
  });

  test("an if condition stays clean in every language", () => {
    const ifBlock = block("if");
    plug(ifBlock, "CONDITION", compare(num(10), "==", num(20)));

    expect(text("py").startsWith("if 10 == 20:")).toBe(true);
    expect(text("js").startsWith("if (10 == 20) {")).toBe(true);
    expect(engine.generateJavaScript()).toContain("if (10 == 20) {");
  });

  test("running nested arithmetic follows the grouping the blocks show", () => {
    print(math(math(num(3), "+", num(4)), "*", num(2)));

    const { output, error } = engine.runJavaScript();

    expect(error).toBeNull();
    expect(output).toEqual([{ level: "log", text: "14" }]);
  });
});

describe("a value that closes itself gets no brackets", () => {
  test("a call or a list holds its values between its own brackets", () => {
    for (const template of ["max(%1, %2)", "%NAME(%1)", "new Random().nextInt(%1, %2 + 1)", "rand::thread_rng().gen_range(%1..=%2)", "!(%1)", "[%1]", "[]any{%1}", '"".join(map(str, [%1]))']) {
      expect(closesItself(template), template).toBe(true);
    }
  });

  test("a slot, a field or an operator outside the brackets makes it an operand", () => {
    for (const template of ["%1 %OP %2", "%1[%2]", "%1.get(%2)", "-(%1)", "f(%1) + g(%2)", "not %1", "%NAME", "(%1"]) {
      expect(closesItself(template), template).toBe(false);
    }
  });
});

describe("a lone slot the template binds to", () => {
  const exposed = (template: string, statement = false) => {
    const tokens = parseTemplate(template);
    return slotIsExposed(tokens, tokens.findIndex((token) => token.kind === "placeholder"), statement);
  };

  test("needs brackets for a composed value: an operator or word in front, or something that goes on from it", () => {
    for (const template of ["not %1", "!%1", "-%1", "%1.length", "%1.length()", "%1!", "%OP%1", "await %1"]) {
      expect(exposed(template), template).toBe(true);
    }
    expect(exposed("%1.sort();", true)).toBe(true);
  });

  test("stands free between brackets or commas, and after the keyword or sign of a statement", () => {
    for (const template of ["len(%1)", "[%1]", "!(%1)", "f(%NAME, %1)", "%1"]) {
      expect(exposed(template), template).toBe(false);
    }
    for (const template of ["return %1;", "if %1:\n    %2", "while (%1) {\n  %2\n}", "%NAME = %1", "print %1", "for %NAME in %1:\n    %2"]) {
      expect(exposed(template, true), template).toBe(false);
    }
  });
});
