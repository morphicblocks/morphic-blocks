import { afterEach, describe, expect, test } from "vitest";
import { MorphicBlocks } from "../src";
import type { MorphicBehaviorMap, MorphicBlocksFormat } from "../src/morphic/types";

/**
 * Text has an order of operators, blocks have none. A text view writes
 * brackets only where the order of the language's signs needs them, and
 * `loadText()` reads text by the same order, so both directions agree.
 *
 * `script` and `python` use the order every common sign has; `plain` turns
 * it off and brackets every value built from others, which shows here what
 * belongs together in the blocks.
 */

const format: MorphicBlocksFormat = {
  elementTypes: { script: "code", python: "code", plain: "code" },
  modes: [{ name: "tiles", elements: ["script"] }],
  code: {
    script: { operators: { "|>": 5, "++": 50, "<<": { rank: 45, direction: "any" } } },
    python: { operators: { "**": null }, highlighting: { keywords: ["not", "and", "or"] } },
    plain: { operators: false },
  },
  blocks: [
    { identifier: "print", elements: { default: "print(%1)" }, inputSlots: { "1": { kind: "value", name: "VALUE" } }, shape: "statement" },
    { identifier: "number", elements: { default: "%NUM" }, fields: { NUM: { type: "number", default: 0 } }, output: "Number" },
    { identifier: "name", elements: { default: "%NAME" }, fields: { NAME: { type: "text", default: "x" } }, output: true },
    {
      identifier: "math",
      elements: { default: "%1 %OP %2" },
      fields: { OP: { type: "dropdown", options: ["+", "-", "*", "/", "**"] } },
      inputSlots: { "1": { kind: "value", name: "A" }, "2": { kind: "value", name: "B" } },
      output: "Number",
    },
    {
      identifier: "compare",
      elements: { default: "%1 %OP %2" },
      fields: { OP: { type: "dropdown", options: ["==", "<", ">"] } },
      inputSlots: { "1": { kind: "value", name: "A" }, "2": { kind: "value", name: "B" } },
      output: "Boolean",
    },
    {
      identifier: "logic",
      elements: { default: "%1 %OP %2" },
      fields: {
        OP: {
          type: "dropdown",
          options: [
            { value: "&&", display: { python: "and" } },
            { value: "||", display: { python: "or" } },
          ],
        },
      },
      inputSlots: { "1": { kind: "value", name: "A" }, "2": { kind: "value", name: "B" } },
      output: "Boolean",
    },
    { identifier: "not", elements: { default: "!%1", python: "not %1" }, inputSlots: { "1": { kind: "value", name: "VALUE" } }, output: "Boolean" },
    { identifier: "negate", elements: { default: "-%1" }, inputSlots: { "1": { kind: "value", name: "VALUE" } }, output: "Number" },
    { identifier: "pipe", elements: { default: "%1 |> %2" }, inputSlots: { "1": { kind: "value", name: "A" }, "2": { kind: "value", name: "B" } }, output: true },
    {
      identifier: "join",
      elements: { default: "%1" },
      inputSlots: { "1": { kind: "value", name: "PARTS", repeat: { separator: " ++ ", count: 2 } } },
      output: "String",
    },
    {
      identifier: "largest",
      elements: { default: "max(%1, %2)" },
      inputSlots: { "1": { kind: "value", name: "A" }, "2": { kind: "value", name: "B" } },
      output: "Number",
    },
    {
      identifier: "entry",
      elements: { default: "%1[%2]" },
      inputSlots: { "1": { kind: "value", name: "LIST" }, "2": { kind: "value", name: "AT" } },
      output: true,
    },
    {
      identifier: "stream",
      elements: { default: "%1" },
      inputSlots: { "1": { kind: "value", name: "PARTS", repeat: { separator: " << ", count: 2 } } },
      output: "String",
    },
    // Statements with a sign beside their slot.
    { identifier: "show", elements: { default: "out << %1 << end;" }, inputSlots: { "1": { kind: "value", name: "VALUE" } }, shape: "statement" },
    { identifier: "until", elements: { default: "until n < %1;" }, inputSlots: { "1": { kind: "value", name: "VALUE" } }, shape: "statement" },
    {
      identifier: "unless",
      elements: { default: "unless !%1;", python: "unless not %1" },
      inputSlots: { "1": { kind: "value", name: "VALUE" } },
      shape: "statement",
    },
  ],
};

const behaviors: MorphicBehaviorMap = {
  print: (proxy) => `console.log(${proxy.inputs.VALUE});\n`,
  number: (proxy) => proxy.fields.NUM ?? "0",
  name: (proxy) => proxy.fields.NAME ?? "x",
  math: (proxy) => `(${proxy.inputs.A} ${proxy.fields.OP} ${proxy.inputs.B})`,
  compare: (proxy) => `(${proxy.inputs.A} ${proxy.fields.OP === "==" ? "===" : proxy.fields.OP} ${proxy.inputs.B})`,
  logic: (proxy) => `(${proxy.inputs.A} ${proxy.fields.OP} ${proxy.inputs.B})`,
  not: (proxy) => `!(${proxy.inputs.VALUE})`,
  negate: (proxy) => `(-(${proxy.inputs.VALUE}))`,
  pipe: (proxy) => `${proxy.inputs.B}`,
  join: (proxy) => `(${(proxy.lists.PARTS ?? []).map((part) => `String(${part})`).join(" + ")})`,
  largest: (proxy) => `Math.max(${proxy.inputs.A}, ${proxy.inputs.B})`,
  entry: (proxy) => `${proxy.inputs.LIST}[${proxy.inputs.AT}]`,
  stream: (proxy) => `(${(proxy.lists.PARTS ?? []).map((part) => `String(${part})`).join(" + ")})`,
  show: (proxy) => `console.log(${proxy.inputs.VALUE});\n`,
  until: () => "",
  unless: () => "",
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
  const print = (value: string) => `print(${value})`;
  /** The blocks of a value given with every bracket, as an element writes them. */
  const write = (element: string, bracketed: string): string => {
    expect(engine.loadText(print(bracketed), { element: "plain" })).toMatchObject({ ok: true });
    return engine.generateText(element).slice("print(".length, -1);
  };
  /** A value read in an element, as the blocks it became: with every bracket. */
  const read = (element: string, value: string): string => {
    expect(engine.loadText(print(value), { element })).toMatchObject({ ok: true });
    // What was read is written again as it was.
    expect(engine.generateText(element)).toBe(print(value));
    return engine.generateText("plain").slice("print(".length, -1);
  };
  const refused = (element: string, value: string) => engine.loadText(print(value), { element });
  const run = () => engine.runJavaScript().output.map((line) => line.text);
  /** A whole line given with every bracket, as an element writes it; that text reads back as the same line. */
  const line = (element: string, bracketed: string): string => {
    expect(engine.loadText(bracketed, { element: "plain" })).toMatchObject({ ok: true });
    const written = engine.generateText(element);
    expect(engine.loadText(written, { element })).toMatchObject({ ok: true });
    expect(engine.generateText(element)).toBe(written);
    return written;
  };
  return { engine, write, read, refused, run, line };
}

const NO_ORDER = { ok: false, line: 1, message: "Put brackets around the parts of this line: these operators have no order." };

describe("a text view writes brackets only where the order of the operators needs them", () => {
  test("the tighter operator inside the looser one stands free", async () => {
    const { write } = await setUp();

    expect(write("script", "(2 * 3) + 4")).toBe("2 * 3 + 4");
    expect(write("script", "2 + (3 * 4)")).toBe("2 + 3 * 4");
    expect(write("script", "2 * (3 + 4)")).toBe("2 * (3 + 4)");
    expect(write("script", "(a < b) && (c == d)")).toBe("a < b && c == d");
    expect(write("script", "a || (b && c)")).toBe("a || b && c");
    expect(write("script", "(a || b) && c")).toBe("(a || b) && c");
  });

  test("the same rank again stands free on the side the operator reads from", async () => {
    const { write } = await setUp();

    expect(write("script", "(10 - 3) - 2")).toBe("10 - 3 - 2");
    expect(write("script", "10 - (3 - 2)")).toBe("10 - (3 - 2)");
    expect(write("script", "(10 - 3) + 2")).toBe("10 - 3 + 2");
    // `**` reads from the right.
    expect(write("script", "2 ** (3 ** 2)")).toBe("2 ** 3 ** 2");
    expect(write("script", "(2 ** 3) ** 2")).toBe("(2 ** 3) ** 2");
    // Comparisons chain differently in every language, so they keep their brackets.
    expect(write("script", "(a < b) == c")).toBe("(a < b) == c");
    expect(write("script", "a == (b < c)")).toBe("a == (b < c)");
  });

  test("a sign in front of a value has a rank of its own", async () => {
    const { write } = await setUp();

    expect(write("script", "(-a) * b")).toBe("-a * b");
    expect(write("script", "-(a * b)")).toBe("-(a * b)");
    expect(write("script", "-(a ** b)")).toBe("-a ** b");
    expect(write("script", "(!a) == b")).toBe("!a == b");
    expect(write("script", "!(a == b)")).toBe("!(a == b)");
    // The word `not` binds less than a comparison, the sign `!` more.
    expect(write("python", "!(a == b)")).toBe("not a == b");
    expect(write("python", "(!a) == b")).toBe("(not a) == b");
    expect(write("python", "a && (!b)")).toBe("a and not b");
  });

  test("a field's sign is ranked as the language shows it", async () => {
    const { write } = await setUp();

    expect(write("python", "(a < b) && ((c || d) && e)")).toBe("a < b and ((c or d) and e)");
    expect(write("python", "(a && b) || c")).toBe("a and b or c");
  });

  test("a list joined by a sign is an operator of that sign", async () => {
    const { write } = await setUp();

    expect(write("script", "(a * 2) ++ b")).toBe("a * 2 ++ b");
    expect(write("script", "(a ++ b) * 2")).toBe("(a ++ b) * 2");
    // An entry of the same rank would read as two entries.
    expect(write("script", "a ++ (b + c)")).toBe("a ++ (b + c)");
  });

  test("a value that closes itself needs none, a sign without a rank needs them all", async () => {
    const { write } = await setUp();

    expect(write("script", "max(a, b) * 2")).toBe("max(a, b) * 2");
    // `|>` has a rank in `script` only; `**` has none in `python`.
    expect(write("script", "a |> (b + 1)")).toBe("a |> b + 1");
    expect(write("python", "a |> (b + 1)")).toBe("a |> (b + 1)");
    expect(write("python", "(2 * 3) ** 4")).toBe("(2 * 3) ** 4");
    expect(write("python", "(2 ** 3) * 4")).toBe("(2 ** 3) * 4");
  });

  test("a slot that stands free takes any value, in a template with several slots too", async () => {
    const { write, read } = await setUp();

    expect(write("script", "max(a + 1, b * 2)")).toBe("max(a + 1, b * 2)");
    expect(write("plain", "max(a + 1, b) * 2")).toBe("max(a + 1, b) * 2");
    expect(read("script", "max(a + 1, b) * 2")).toBe("max(a + 1, b) * 2");
  });

  test("a value that only goes on from the one in front is one piece", async () => {
    const { write, read } = await setUp();

    expect(write("script", "a[1] + 1")).toBe("a[1] + 1");
    expect(write("script", "-a[1]")).toBe("-a[1]");
    expect(write("script", "a[i + 1][0]")).toBe("a[i + 1][0]");
    // What it goes on from is one piece too, or in brackets.
    expect(write("script", "(a + b)[1]")).toBe("(a + b)[1]");
    expect(read("script", "a[1] * (b[2] + 1)")).toBe("a[1] * (b[2] + 1)");
  });

  test("a sign beside the slot of a statement makes the slot its operand", async () => {
    const { line } = await setUp();

    expect(line("script", "until n < (a + 1);")).toBe("until n < a + 1;");
    expect(line("script", "until n < (a == b);")).toBe("until n < (a == b);");
    expect(line("script", "out << (a + 1) << end;")).toBe("out << a + 1 << end;");
    expect(line("script", "out << (a < b) << end;")).toBe("out << (a < b) << end;");
    // In front of the slot, the sign has the rank it has in front of a value.
    expect(line("script", "unless !(a == b);")).toBe("unless !(a == b);");
    expect(line("python", "unless !(a == b);")).toBe("unless not a == b");
    expect(line("python", "unless !(a || b);")).toBe("unless not (a or b)");
    // Without the order, the text beside the slot only says that it binds.
    expect(line("plain", "out << (a + 1) << end;")).toBe("out << (a + 1) << end;");
  });

  test("a sign whose grouping does not matter stands free beside itself", async () => {
    const { engine, line } = await setUp();

    // A list joined by the sign that stands around the slot only makes the line longer.
    expect(line("script", "out << (a << b) << end;")).toBe("out << a << b << end;");
    expect(line("script", "out << ((a * 2) << b) << end;")).toBe("out << a * 2 << b << end;");
    // A list in a list reads as one list afterwards.
    expect(line("script", "out << ((a << b) << c) << end;")).toBe("out << a << b << c << end;");
    expect(engine.generateText("plain")).toBe("out << (a << b << c) << end;");
    // Another sign of the same kind keeps the brackets: `++` has no such direction.
    expect(line("script", "print(a ++ (b ++ c))")).toBe("print(a ++ (b ++ c))");
  });

  test("without the order, every value built from others is in brackets", async () => {
    const { write } = await setUp();

    expect(write("plain", "(2 * 3) + 4")).toBe("(2 * 3) + 4");
    expect(write("plain", "(!a) == b")).toBe("(!a) == b");
  });
});

describe("loadText reads operators in their order", () => {
  test("the tighter operator takes its values first", async () => {
    const { read, run } = await setUp();

    expect(read("script", "2 + 3 * 4")).toBe("2 + (3 * 4)");
    expect(run()).toEqual(["14"]);
    expect(read("script", "2 * 3 + 4")).toBe("(2 * 3) + 4");
    expect(read("script", "a < b && c == d || e")).toBe("((a < b) && (c == d)) || e");
    expect(read("script", "1 + 2 * 3 - 4 / 2")).toBe("(1 + (2 * 3)) - (4 / 2)");
    expect(run()).toEqual(["5"]);
  });

  test("the same rank reads from the operator's side", async () => {
    const { read, run } = await setUp();

    expect(read("script", "10 - 3 - 2")).toBe("(10 - 3) - 2");
    expect(run()).toEqual(["5"]);
    expect(read("script", "2 ** 3 ** 2")).toBe("2 ** (3 ** 2)");
    expect(run()).toEqual(["512"]);
  });

  test("brackets a writer types always win, and are not kept where the order says the same", async () => {
    const { engine, read } = await setUp();

    expect(read("script", "(2 + 3) * 4")).toBe("(2 + 3) * 4");
    expect(read("script", "10 - (3 - 2)")).toBe("10 - (3 - 2)");
    expect(engine.loadText("print((2 * 3) + (4))", { element: "script" })).toMatchObject({ ok: true });
    expect(engine.generateText("script")).toBe("print(2 * 3 + 4)");
  });

  test("signs in front of a value", async () => {
    const { read } = await setUp();

    expect(read("script", "-a * b")).toBe("(-a) * b");
    expect(read("script", "!a == b")).toBe("(!a) == b");
    expect(read("python", "not a == b and c")).toBe("(!(a == b)) && c");
    expect(read("python", "a or not b and c")).toBe("a || ((!b) && c)");
  });

  test("what the order does not settle is not guessed at", async () => {
    const { refused } = await setUp();

    // A comparison of a comparison: every language means something else by it.
    expect(refused("script", "1 < x < 5")).toEqual(NO_ORDER);
    expect(refused("script", "a < b == c")).toEqual(NO_ORDER);
    // A sign without a rank beside one with a rank, and with the order turned off.
    expect(refused("python", "2 ** 3 * 4")).toEqual(NO_ORDER);
    expect(refused("python", "a |> b + 1")).toMatchObject({ ok: false });
    expect(refused("plain", "2 + 3 * 4")).toEqual(NO_ORDER);
    // A weaker sign in front of a value needs brackets behind a tighter operator.
    expect(refused("python", "a == not b")).toMatchObject({ ok: false });
  });

  test("a rank a language gives its own sign", async () => {
    const { read } = await setUp();

    expect(read("script", "a |> b + 1")).toBe("a |> (b + 1)");
    expect(read("script", "a * 2 ++ b ++ c")).toBe("(a * 2) ++ b ++ c");
  });
});
