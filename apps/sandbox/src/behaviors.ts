import type { MorphicBehaviorMap } from "morphic-blocks";

export const behaviors: MorphicBehaviorMap = {
  // ── Output ──────────────────────────────────────────────

  text_print(proxy) {
    return `console.log(${proxy.inputs.TEXT || "undefined"});\n`;
  },

  // Query clauses only chain with each other (connection checks), to try
  // statement drops in the codespace. They generate comments, so Run ignores them.
  query_select() {
    return "// SELECT * FROM items\n";
  },
  query_where(proxy) {
    return `// WHERE price > ${proxy.inputs.PRICE || "0"}\n`;
  },
  query_limit(proxy) {
    return `// LIMIT ${proxy.inputs.COUNT || "0"}\n`;
  },

  // Arabic labels, to try right to left (open the sandbox with ?rtl).
  rtl_test(proxy) {
    return `console.log(String(${proxy.inputs.TEXT || '""'}).repeat(${proxy.inputs.TIMES || "1"}));\n`;
  },

  // ── Control ─────────────────────────────────────────────

  logic_if(proxy) {
    const condition = proxy.inputs.CONDITION || "false";
    const body = proxy.inputs.DO || "";
    return `if (${condition}) {\n${body}\n}\n`;
  },

  loop_for(proxy) {
    const times = proxy.inputs.TIMES || "10";
    const body = proxy.inputs.DO || "";
    return `for (let i = 0; i < ${times}; i++) {\n${body}\n}\n`;
  },

  // ── Operations ──────────────────────────────────────────

  // Fields (the OP dropdown) are declared in definitions.json; each option's
  // value is the operator itself, so codegen emits it as is.
  math_arithmetic(proxy) {
    const op = proxy.fields.OP || "+";
    return `${proxy.inputs.A || "0"} ${op} ${proxy.inputs.B || "0"}`;
  },

  logic_compare(proxy) {
    const op = proxy.fields.OP || "==";
    return `${proxy.inputs.A || "0"} ${op} ${proxy.inputs.B || "0"}`;
  },

  // OP value is the JS operator (&&/||); the Python/concept display (and/or)
  // never reaches codegen — execution always uses the value.
  logic_operation(proxy) {
    const op = proxy.fields.OP || "&&";
    return `${proxy.inputs.A || "false"} ${op} ${proxy.inputs.B || "false"}`;
  },

  logic_negate(proxy) {
    return `!(${proxy.inputs.VALUE || "false"})`;
  },

  // ── Values ──────────────────────────────────────────────

  m_math_number(proxy) {
    // A number field's plain value is already a valid number literal.
    return proxy.fields.NUM || "0";
  },

  text_value(proxy) {
    // Emitted as a string, so use the quoted form (also escapes inner quotes).
    return proxy.quoted.TEXT ?? '""';
  },

  m_logic_boolean(proxy) {
    // The dropdown option value is already "true" / "false".
    return proxy.fields.BOOL || "false";
  },

  // ── Variables ───────────────────────────────────────────

  var_declare(proxy) {
    const varName = proxy.fields.VAR || "x";
    return `let ${varName} = ${proxy.inputs.VAL || "undefined"};\n`;
  },

  var_get(proxy) {
    return proxy.fields.VAR || "x";
  },
};
