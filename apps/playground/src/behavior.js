/** @type {import("morphic-blocks").MorphicBehaviorMap} */
const behaviors = {
  /**
   * Log Message - console.log with a local timestamp.
   */
  log_message(proxy) {
    const msg = proxy.inputs["MESSAGE"] || "'hello from morphic'";
    return `console.log('[' + new Date().toLocaleTimeString() + '] ' + ${msg});\n`;
  },

  /**
   * Random Color - inline hex color expression.
   */
  // eslint-disable-next-line no-unused-vars
  random_color(_proxy) {
    return `('#' + Math.floor(Math.random() * 0xFFFFFF).toString(16).padStart(6, '0'))`;
  },

  /**
   * Create Range - returns an array from START to END using STEP.
   */
  create_range(proxy) {
    const start = proxy.inputs["START"] || "1";
    const end = proxy.inputs["END"] || "5";
    const step = proxy.inputs["STEP"] || "1";

    return `(() => {
  const __start = Number(${start});
  const __end = Number(${end});
  const __rawStep = Number(${step});
  const __step = __rawStep === 0 ? 1 : __rawStep;
  const __values = [];
  for (let __i = __start; __step > 0 ? __i <= __end : __i >= __end; __i += __step) {
    __values.push(__i);
  }
  return __values;
})()`;
  },

  /**
   * For Each Range - loops through RANGE and runs nested statements.
   */
  for_each_range(proxy) {
    const rangeExpression = proxy.inputs["RANGE"] || "[]";
    const body = normalizeStatementBody(proxy.inputs["DO"]) || "console.log(item);";

    return `for (const item of ${rangeExpression}) {\n${indentCode(body, 2)}\n}\n`;
  },

  /**
   * Current Item - current loop variable.
   */
  // eslint-disable-next-line no-unused-vars
  current_item(_proxy) {
    return "item";
  },

  /**
   * Sum Range - sums all values from RANGE.
   */
  sum_range(proxy) {
    const rangeExpression = proxy.inputs["RANGE"] || "[]";
    return `((${rangeExpression}).reduce((total, value) => total + Number(value), 0))`;
  },

  /**
   * Join two values as text.
   */
  concat_text(proxy) {
    const left = proxy.inputs["A"] || "''";
    const right = proxy.inputs["B"] || "''";
    return `(String(${left}) + String(${right}))`;
  },

  // eslint-disable-next-line no-unused-vars
  text_sum_prefix(_proxy) {
    return "'sum is: '";
  },

  // eslint-disable-next-line no-unused-vars
  num_1(_proxy) {
    return "1";
  },

  // eslint-disable-next-line no-unused-vars
  num_5(_proxy) {
    return "5";
  },

  // eslint-disable-next-line no-unused-vars
  num_10(_proxy) {
    return "10";
  },
};

function normalizeStatementBody(raw) {
  if (!raw) {
    return "";
  }
  return raw
    .split("\n")
    .map((line) => line.trimEnd())
    .join("\n")
    .trim();
}

function indentCode(code, spaces) {
  const padding = " ".repeat(spaces);
  return code
    .split("\n")
    .map((line) => (line.length > 0 ? `${padding}${line}` : line))
    .join("\n");
}

export { behaviors };
