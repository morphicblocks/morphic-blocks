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
    const condition = proxy.inputs.CONDITION || "true";
    const body = proxy.inputs.DO || "";
    return `if (${condition}) {\n${body}\n}\n`;
  },

  loop_for(proxy) {
    const times = proxy.inputs.TIMES || "10";
    const body = proxy.inputs.DO || "";
    return `for (let i = 0; i < ${times}; i++) {\n${body}\n}\n`;
  },

  // ── Operations ──────────────────────────────────────────

  math_arithmetic: {
    onViewApplied(block, { Blockly }) {
      const input = block.getInput("OPERATOR");
      if (input) {
        input.appendField(
          new Blockly.FieldDropdown([
            ["+", "ADD"],
            ["\u2212", "MINUS"],
            ["\u00D7", "MULTIPLY"],
            ["\u00F7", "DIVIDE"],
          ]),
          "OP",
        );
      }
    },
    generate(proxy) {
      const ops: Record<string, string> = {
        ADD: "+",
        MINUS: "-",
        MULTIPLY: "*",
        DIVIDE: "/",
      };
      const opKey = raw(proxy.fields.OP, "ADD");
      const op = ops[opKey] || "+";
      return `${proxy.inputs.A || "0"} ${op} ${proxy.inputs.B || "0"}`;
    },
  },

  logic_compare: {
    onViewApplied(block, { Blockly }) {
      const input = block.getInput("COMPARATOR");
      if (input) {
        input.appendField(
          new Blockly.FieldDropdown([
            ["==", "EQ"],
            ["!=", "NEQ"],
            ["<", "LT"],
            [">", "GT"],
          ]),
          "OP",
        );
      }
    },
    generate(proxy) {
      const ops: Record<string, string> = {
        EQ: "==",
        NEQ: "!=",
        LT: "<",
        GT: ">",
      };
      const opKey = raw(proxy.fields.OP, "EQ");
      const op = ops[opKey] || "==";
      return `${proxy.inputs.A || "0"} ${op} ${proxy.inputs.B || "0"}`;
    },
  },

  // ── Values ──────────────────────────────────────────────

  m_math_number: {
    onViewApplied(block, { Blockly }) {
      const input = block.getInput("CONTENT");
      if (input) {
        input.appendField(new Blockly.FieldNumber(0), "NUM");
      }
    },
    generate(proxy) {
      return proxy.fields.NUM || "0";
    },
  },

  text_value: {
    onViewApplied(block, { Blockly }) {
      const input = block.getInput("CONTENT");
      if (input) {
        input.appendField(new Blockly.FieldTextInput("hello"), "TEXT");
      }
    },
    generate(proxy) {
      // proxy.fields.TEXT is already JSON-quoted by the codegen proxy
      return proxy.fields.TEXT || '""';
    },
  },

  m_logic_boolean: {
    onViewApplied(block, { Blockly }) {
      const input = block.getInput("CONTENT");
      if (input) {
        input.appendField(
          new Blockly.FieldDropdown([
            ["true", "TRUE"],
            ["false", "FALSE"],
          ]),
          "BOOL",
        );
      }
    },
    generate(proxy) {
      return proxy.fields.BOOL === "true" ? "true" : "false";
    },
  },

  // ── Variables ───────────────────────────────────────────

  var_declare: {
    onViewApplied(block, { Blockly }) {
      const input = block.getInput("NAME");
      if (input) {
        input.appendField(new Blockly.FieldTextInput("x"), "VAR");
      }
    },
    generate(proxy) {
      const varName = raw(proxy.fields.VAR, "x");
      return `let ${varName} = ${proxy.inputs.VAL || "undefined"};\n`;
    },
  },

  var_get: {
    onViewApplied(block, { Blockly }) {
      const input = block.getInput("CONTENT");
      if (input) {
        input.appendField(new Blockly.FieldTextInput("x"), "VAR");
      }
    },
    generate(proxy) {
      return raw(proxy.fields.VAR, "x");
    },
  },
};
