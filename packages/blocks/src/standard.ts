import type { MorphicToolboxCategory } from "morphic-blocks";
import type { StandardBlocks } from "./types.js";

/**
 * The standard blocks: common programming blocks, each with its behavior. A
 * language (`@morphicblocks/languages`, or your own) says how each is written.
 * Names are linked: a block that uses a variable, function, class, field or
 * method lists the ones the program declares, and follows a rename.
 */

const number = (value: number) => ({ shadow: "number", fieldValues: { NUM: String(value) } });
const text = (value: string) => ({ shadow: "text", fieldValues: { TEXT: value } });
const variables = ["variable_create.NAME", "for_each.NAME"];

/** The categories the standard blocks are in; an app's own entry of the same name wins. */
export const standardCategories: MorphicToolboxCategory[] = [
  { name: "Output", color: "#4a9fb5" },
  { name: "Values", color: "#c9a227" },
  { name: "Variables", color: "#d9627a" },
  { name: "Math", color: "#4f9a5c" },
  { name: "Text", color: "#3f8f8a" },
  { name: "Logic", color: "#4a80c9" },
  { name: "Control", color: "#a05fc4" },
  { name: "Functions", color: "#6f63d6" },
  { name: "Lists", color: "#c9743a" },
  { name: "Classes", color: "#b5567f" },
];

export const standard: StandardBlocks = {
  // ── Output ──────────────────────────────────────────────
  print: {
    category: "Output",
    inputSlots: { "1": { kind: "value", name: "VALUE", default: text("Hello") } },
    shape: "statement",
    inputsInline: true,
    behavior: (proxy) => `console.log(${proxy.inputs.VALUE || '""'});\n`,
  },
  comment: {
    category: "Output",
    fields: { TEXT: { type: "text", default: "a note" } },
    shape: "statement",
    behavior: (proxy) => `// ${String(proxy.fields.TEXT ?? "").replace(/[\r\n]+/g, " ")}\n`,
  },

  // ── Values ──────────────────────────────────────────────
  number: {
    category: "Values",
    fields: { NUM: { type: "number", default: 0 } },
    output: "Number",
    behavior: (proxy) => proxy.fields.NUM || "0",
  },
  text: {
    category: "Values",
    fields: { TEXT: { type: "text", default: "text" } },
    output: "String",
    behavior: (proxy) => proxy.quoted.TEXT ?? '""',
  },
  boolean: {
    category: "Values",
    fields: { BOOL: { type: "dropdown", options: ["true", "false"], default: "true" } },
    output: "Boolean",
    behavior: (proxy) => (proxy.fields.BOOL === "false" ? "false" : "true"),
  },

  // ── Variables ───────────────────────────────────────────
  variable_create: {
    category: "Variables",
    fields: { NAME: { type: "text", default: "x" } },
    inputSlots: { "1": { kind: "value", name: "VALUE", default: number(0) } },
    shape: "statement",
    inputsInline: true,
    behavior: (proxy) => `let ${proxy.fields.NAME || "x"} = ${proxy.inputs.VALUE || "undefined"};\n`,
  },
  variable_set: {
    category: "Variables",
    fields: { NAME: { type: "reference", to: variables, default: "x" } },
    inputSlots: { "1": { kind: "value", name: "VALUE", default: number(0) } },
    shape: "statement",
    inputsInline: true,
    behavior: (proxy) => `${proxy.fields.NAME || "x"} = ${proxy.inputs.VALUE || "undefined"};\n`,
  },
  variable_change: {
    category: "Variables",
    fields: { NAME: { type: "reference", to: variables, default: "x" } },
    inputSlots: { "1": { kind: "value", name: "BY", check: "Number", default: number(1) } },
    shape: "statement",
    inputsInline: true,
    behavior: (proxy) => `${proxy.fields.NAME || "x"} += ${proxy.inputs.BY || "1"};\n`,
  },
  variable_get: {
    category: "Variables",
    fields: { NAME: { type: "reference", to: variables, default: "x" } },
    output: true,
    behavior: (proxy) => proxy.fields.NAME || "x",
  },

  // ── Math ────────────────────────────────────────────────
  math_operation: {
    category: "Math",
    fields: { OP: { type: "dropdown", options: ["+", "-", "*", "/"], default: "+" } },
    inputSlots: {
      "1": { kind: "value", name: "A", check: "Number", default: number(1) },
      "2": { kind: "value", name: "B", check: "Number", default: number(1) },
    },
    output: "Number",
    inputsInline: true,
    behavior: (proxy) => `${proxy.inputs.A || "0"} ${proxy.fields.OP || "+"} ${proxy.inputs.B || "0"}`,
  },
  math_remainder: {
    category: "Math",
    inputSlots: {
      "1": { kind: "value", name: "A", check: "Number", default: number(7) },
      "2": { kind: "value", name: "B", check: "Number", default: number(2) },
    },
    output: "Number",
    inputsInline: true,
    behavior: (proxy) => `${proxy.inputs.A || "0"} % ${proxy.inputs.B || "1"}`,
  },
  math_random: {
    category: "Math",
    inputSlots: {
      "1": { kind: "value", name: "FROM", check: "Number", default: number(1) },
      "2": { kind: "value", name: "TO", check: "Number", default: number(10) },
    },
    output: "Number",
    inputsInline: true,
    // In a function of its own, so each bound is worked out once.
    behavior: (proxy) =>
      `((from, to) => Math.floor(Math.random() * (to - from + 1)) + from)(${proxy.inputs.FROM || "1"}, ${proxy.inputs.TO || "10"})`,
  },

  // ── Text ────────────────────────────────────────────────
  text_join: {
    category: "Text",
    inputSlots: { "1": { kind: "value", name: "PARTS", repeat: { count: 2 }, default: text("a") } },
    output: "String",
    inputsInline: true,
    behavior: (proxy) => (proxy.lists.PARTS ?? []).map((part) => `String(${part})`).join(" + ") || '""',
  },
  text_length: {
    category: "Text",
    inputSlots: { "1": { kind: "value", name: "TEXT", check: "String", default: text("Hello") } },
    output: "Number",
    inputsInline: true,
    // As the languages write it (`len(x)`, `x.length`): the length of a text, and of a list too.
    behavior: (proxy) => `(${proxy.inputs.TEXT || '""'}).length`,
  },

  // ── Logic ───────────────────────────────────────────────
  compare: {
    category: "Logic",
    fields: { OP: { type: "dropdown", options: ["==", "!=", "<", "<=", ">", ">="], default: "==" } },
    inputSlots: {
      "1": { kind: "value", name: "A", default: number(1) },
      "2": { kind: "value", name: "B", default: number(1) },
    },
    output: "Boolean",
    inputsInline: true,
    behavior: (proxy) => {
      const op = proxy.fields.OP === "==" ? "===" : proxy.fields.OP === "!=" ? "!==" : proxy.fields.OP || "===";
      return `${proxy.inputs.A || "0"} ${op} ${proxy.inputs.B || "0"}`;
    },
  },
  logic_operation: {
    category: "Logic",
    fields: { OP: { type: "dropdown", options: ["&&", "||"], default: "&&" } },
    inputSlots: {
      "1": { kind: "value", name: "A", check: "Boolean" },
      "2": { kind: "value", name: "B", check: "Boolean" },
    },
    output: "Boolean",
    inputsInline: true,
    behavior: (proxy) => `${proxy.inputs.A || "false"} ${proxy.fields.OP || "&&"} ${proxy.inputs.B || "false"}`,
  },
  logic_not: {
    category: "Logic",
    inputSlots: { "1": { kind: "value", name: "VALUE", check: "Boolean" } },
    output: "Boolean",
    inputsInline: true,
    behavior: (proxy) => `!(${proxy.inputs.VALUE || "false"})`,
  },

  // ── Control ─────────────────────────────────────────────
  if: {
    category: "Control",
    inputSlots: {
      "1": { kind: "value", name: "CONDITION", check: "Boolean" },
      "2": { kind: "statement", name: "THEN" },
    },
    shape: "statement",
    inputsInline: true,
    behavior: (proxy) => `if (${proxy.inputs.CONDITION || "false"}) {\n${proxy.inputs.THEN || ""}\n}\n`,
  },
  if_else: {
    category: "Control",
    inputSlots: {
      "1": { kind: "value", name: "CONDITION", check: "Boolean" },
      "2": { kind: "statement", name: "THEN" },
      "3": { kind: "statement", name: "ELSE" },
    },
    shape: "statement",
    inputsInline: true,
    behavior: (proxy) =>
      `if (${proxy.inputs.CONDITION || "false"}) {\n${proxy.inputs.THEN || ""}\n} else {\n${proxy.inputs.ELSE || ""}\n}\n`,
  },
  repeat: {
    category: "Control",
    inputSlots: {
      "1": { kind: "value", name: "TIMES", check: "Number", default: number(3) },
      "2": { kind: "statement", name: "BODY" },
    },
    shape: "statement",
    inputsInline: true,
    // The counter has a name no block gives a variable, so a program's own `count` or `i` is left alone.
    behavior: (proxy) =>
      `for (let $repeat = 0, $times = ${proxy.inputs.TIMES || "0"}; $repeat < $times; $repeat++) {\n${proxy.inputs.BODY || ""}\n}\n`,
  },
  while: {
    category: "Control",
    inputSlots: {
      "1": { kind: "value", name: "CONDITION", check: "Boolean" },
      "2": { kind: "statement", name: "BODY" },
    },
    shape: "statement",
    inputsInline: true,
    behavior: (proxy) => `while (${proxy.inputs.CONDITION || "false"}) {\n${proxy.inputs.BODY || ""}\n}\n`,
  },
  for_each: {
    category: "Control",
    fields: { NAME: { type: "text", default: "item" } },
    inputSlots: {
      "1": { kind: "value", name: "LIST", check: "List" },
      "2": { kind: "statement", name: "BODY" },
    },
    shape: "statement",
    inputsInline: true,
    behavior: (proxy) =>
      `for (const ${proxy.fields.NAME || "item"} of ${proxy.inputs.LIST || "[]"}) {\n${proxy.inputs.BODY || ""}\n}\n`,
  },
  break: {
    category: "Control",
    shape: "end",
    behavior: () => "break;\n",
  },
  continue: {
    category: "Control",
    shape: "end",
    behavior: () => "continue;\n",
  },

  // ── Functions ───────────────────────────────────────────
  function_define: {
    category: "Functions",
    fields: { NAME: { type: "text", default: "greet" } },
    inputSlots: {
      "1": { kind: "value", name: "PARAMS", check: "Parameter", strict: true, repeat: { count: 0 } },
      "2": { kind: "statement", name: "BODY" },
    },
    shape: "statement",
    inputsInline: true,
    behavior: (proxy) =>
      `function ${proxy.fields.NAME || "f"}(${proxy.inputs.PARAMS || ""}) {\n${proxy.inputs.BODY || ""}\n}\n`,
  },
  parameter: {
    category: "Functions",
    fields: { NAME: { type: "text", default: "name" } },
    output: "Parameter",
    strict: true,
    behavior: (proxy) => proxy.fields.NAME || "value",
  },
  parameter_get: {
    category: "Functions",
    fields: { NAME: { type: "reference", to: "parameter.NAME", scope: "function_define", default: "name" } },
    output: true,
    behavior: (proxy) => proxy.fields.NAME || "value",
  },
  return: {
    category: "Functions",
    inputSlots: { "1": { kind: "value", name: "VALUE" } },
    shape: "end",
    inputsInline: true,
    behavior: (proxy) => `return ${proxy.inputs.VALUE || ""};\n`.replace("return ;", "return;"),
  },
  function_call: {
    category: "Functions",
    fields: { NAME: { type: "reference", to: "function_define.NAME", default: "greet" } },
    inputSlots: { "1": { kind: "value", name: "ARGS", repeat: { count: 0 } } },
    shape: "statement",
    inputsInline: true,
    behavior: (proxy) => `${proxy.fields.NAME || "f"}(${proxy.inputs.ARGS || ""});\n`,
  },
  function_result: {
    category: "Functions",
    fields: { NAME: { type: "reference", to: "function_define.NAME", default: "greet" } },
    inputSlots: { "1": { kind: "value", name: "ARGS", repeat: { count: 0 } } },
    output: true,
    inputsInline: true,
    behavior: (proxy) => `${proxy.fields.NAME || "f"}(${proxy.inputs.ARGS || ""})`,
  },

  // ── Lists ───────────────────────────────────────────────
  list_create: {
    category: "Lists",
    inputSlots: { "1": { kind: "value", name: "ITEMS", repeat: { count: 2 }, default: number(1) } },
    output: "List",
    inputsInline: true,
    behavior: (proxy) => `[${proxy.inputs.ITEMS || ""}]`,
  },
  list_get: {
    category: "Lists",
    inputSlots: {
      "1": { kind: "value", name: "LIST", check: "List" },
      "2": { kind: "value", name: "INDEX", check: "Number", default: number(0) },
    },
    output: true,
    inputsInline: true,
    behavior: (proxy) => `${proxy.inputs.LIST || "[]"}[${proxy.inputs.INDEX || "0"}]`,
  },
  list_set: {
    category: "Lists",
    inputSlots: {
      "1": { kind: "value", name: "LIST", check: "List" },
      "2": { kind: "value", name: "INDEX", check: "Number", default: number(0) },
      "3": { kind: "value", name: "VALUE", default: number(1) },
    },
    shape: "statement",
    inputsInline: true,
    behavior: (proxy) =>
      `${proxy.inputs.LIST || "[]"}[${proxy.inputs.INDEX || "0"}] = ${proxy.inputs.VALUE || "undefined"};\n`,
  },
  list_add: {
    category: "Lists",
    inputSlots: {
      "1": { kind: "value", name: "LIST", check: "List" },
      "2": { kind: "value", name: "VALUE", default: number(1) },
    },
    shape: "statement",
    inputsInline: true,
    behavior: (proxy) => `${proxy.inputs.LIST || "[]"}.push(${proxy.inputs.VALUE || "undefined"});\n`,
  },
  list_length: {
    category: "Lists",
    inputSlots: { "1": { kind: "value", name: "LIST", check: "List" } },
    output: "Number",
    inputsInline: true,
    behavior: (proxy) => `(${proxy.inputs.LIST || "[]"}).length`,
  },

  // ── Classes ─────────────────────────────────────────────
  class_define: {
    category: "Classes",
    fields: { NAME: { type: "text", default: "Dog" } },
    inputSlots: {
      "1": { kind: "statement", name: "FIELDS", check: "ClassField", strict: true },
      "2": { kind: "statement", name: "METHODS", check: "ClassMethod", strict: true },
    },
    shape: "statement",
    behavior: (proxy) =>
      `class ${proxy.fields.NAME || "Thing"} {\n${proxy.inputs.FIELDS || ""}\n${proxy.inputs.METHODS || ""}\n}\n`,
  },
  class_field: {
    category: "Classes",
    fields: { NAME: { type: "text", default: "name" } },
    inputSlots: { "1": { kind: "value", name: "VALUE", default: text("Rex") } },
    previousStatement: "ClassField",
    nextStatement: "ClassField",
    strict: true,
    inputsInline: true,
    behavior: (proxy) => `${proxy.fields.NAME || "field"} = ${proxy.inputs.VALUE || "undefined"};\n`,
  },
  class_method: {
    category: "Classes",
    fields: { NAME: { type: "text", default: "bark" } },
    inputSlots: { "1": { kind: "statement", name: "BODY" } },
    previousStatement: "ClassMethod",
    nextStatement: "ClassMethod",
    strict: true,
    behavior: (proxy) => `${proxy.fields.NAME || "method"}() {\n${proxy.inputs.BODY || ""}\n}\n`,
  },
  field_get: {
    category: "Classes",
    fields: { NAME: { type: "reference", to: "class_field.NAME", scope: "class_define", default: "name" } },
    output: true,
    behavior: (proxy) => `this.${proxy.fields.NAME || "field"}`,
  },
  object_create: {
    category: "Classes",
    fields: {
      VAR: { type: "text", default: "rex" },
      CLASS: { type: "reference", to: "class_define.NAME", default: "Dog" },
    },
    shape: "statement",
    behavior: (proxy) => `let ${proxy.fields.VAR || "object"} = new ${proxy.fields.CLASS || "Thing"}();\n`,
  },
  method_call: {
    category: "Classes",
    fields: {
      VAR: { type: "reference", to: "object_create.VAR", default: "rex" },
      METHOD: { type: "reference", to: "class_method.NAME", default: "bark" },
    },
    shape: "statement",
    behavior: (proxy) => `${proxy.fields.VAR || "object"}.${proxy.fields.METHOD || "method"}();\n`,
  },
};
