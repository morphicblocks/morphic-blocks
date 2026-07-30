import type { MorphicBehaviorMap } from "morphic-blocks";

/**
 * Unwrap a JSON-stringified field value back to its raw string.
 * The codegen proxy runs `JSON.stringify()` on string field values,
 * so `"hello"` becomes `'"hello"'`. This helper reverses that.
 */
function raw(value: string | undefined, fallback: string): string {
  if (!value) return fallback;
  if (value.startsWith('"') && value.endsWith('"')) {
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  }
  return value;
}

export const behaviors: MorphicBehaviorMap = {
  // ── Output ──────────────────────────────────────────────

  text_print(proxy) {
    return `console.log(${proxy.inputs.TEXT || "undefined"});\n`;
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
  // value is the operator itself, so codegen just unwraps it. `raw()` strips
  // the JSON quotes the codegen proxy adds to string field values.
  math_arithmetic(proxy) {
    const op = raw(proxy.fields.OP, "+");
    return `${proxy.inputs.A || "0"} ${op} ${proxy.inputs.B || "0"}`;
  },

  logic_compare(proxy) {
    const op = raw(proxy.fields.OP, "==");
    return `${proxy.inputs.A || "0"} ${op} ${proxy.inputs.B || "0"}`;
  },

  // OP value is the JS operator (&&/||); the Python/concept display (and/or)
  // never reaches codegen — execution always uses the value.
  logic_operation(proxy) {
    const op = raw(proxy.fields.OP, "&&");
    return `${proxy.inputs.A || "false"} ${op} ${proxy.inputs.B || "false"}`;
  },

  // ── Values ──────────────────────────────────────────────

  m_math_number(proxy) {
    // FieldNumber values are numeric — the codegen proxy emits them unquoted.
    return proxy.fields.NUM || "0";
  },

  text_value(proxy) {
    // proxy.fields.TEXT is already JSON-quoted by the codegen proxy
    return proxy.fields.TEXT || '""';
  },

  m_logic_boolean(proxy) {
    // The dropdown option value is already "true" / "false".
    return raw(proxy.fields.BOOL, "false");
  },

  // ── Variables ───────────────────────────────────────────

  var_declare(proxy) {
    const varName = raw(proxy.fields.VAR, "x");
    return `let ${varName} = ${proxy.inputs.VAL || "undefined"};\n`;
  },

  var_get(proxy) {
    return raw(proxy.fields.VAR, "x");
  },
};
