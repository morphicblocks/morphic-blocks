import { afterEach, describe, expect, test } from "vitest";
import { MorphicBlocks, checkDefinitions } from "morphic-blocks";
import { define, pick, standard, standardCategories } from "../src";
import { plain } from "./plain";
import { block, loadProgram } from "./program";

const modes = [{ name: "plain-tiles", elements: ["plain"] }];
const everything = () => define({ blocks: standard, languages: { plain } }, { modes });

const engines: MorphicBlocks[] = [];
const div = () => document.body.appendChild(document.createElement("div"));

afterEach(() => {
  for (const engine of engines.splice(0)) engine.dispose();
  document.body.innerHTML = "";
});

async function run(stack: Parameters<typeof loadProgram>[1]) {
  const { definitions, behaviors } = everything();
  const engine = new MorphicBlocks(definitions, behaviors);
  engines.push(engine);
  await engine.mount({ workspaceContainer: div(), codespaceContainer: div(), onWarning: () => {} });
  loadProgram(engine.getWorkspace()!, stack);
  const result = engine.runJavaScript();
  if (result.error) throw new Error(`${result.error.message}\n${result.code}`);
  return result.output.map((line) => line.text);
}

describe("the standard blocks", () => {
  test("each have a behavior and a category of the set", () => {
    const categories = standardCategories.map((category) => category.name);
    for (const [identifier, definition] of Object.entries(standard)) {
      expect(definition.behavior, identifier).toBeTypeOf("function");
      expect(categories, identifier).toContain(definition.category);
    }
  });

  test("pass every check of a mount, without a warning about the blocks", () => {
    const { definitions, behaviors } = everything();
    const { errors, warnings } = checkDefinitions(definitions, behaviors);

    expect(errors).toEqual([]);
    expect(warnings.filter((warning) => warning.startsWith("Block "))).toEqual([]);
  });
});

describe("programs of standard blocks run", () => {
  const number = (value: number) => block("number", { NUM: value });
  const text = (value: string) => block("text", { TEXT: value });
  const get = (name: string) => block("variable_get", { NAME: name });

  test("variables, math, a loop and a condition", async () => {
    const output = await run([
      block("variable_create", { NAME: "total" }, { VALUE: number(0) }),
      block("repeat", {}, { TIMES: number(4), BODY: block("variable_change", { NAME: "total" }, { BY: number(5) }) }),
      block("if_else", {}, {
        CONDITION: block("compare", { OP: ">" }, { A: get("total"), B: number(10) }),
        THEN: block("print", {}, { VALUE: block("text_join", {}, { PARTS_0: text("big "), PARTS_1: get("total") }) }),
        ELSE: block("print", {}, { VALUE: text("small") }),
      }),
      block("print", {}, { VALUE: block("math_remainder", {}, { A: get("total"), B: number(7) }) }),
    ]);

    expect(output).toEqual(["big 20", "6"]);
  });

  test("a function with parameters and a result", async () => {
    const output = await run([
      block("function_define", { NAME: "add" }, {
        PARAMS_0: block("parameter", { NAME: "a" }),
        PARAMS_1: block("parameter", { NAME: "b" }),
        BODY: block("return", {}, {
          VALUE: block("math_operation", { OP: "+" }, { A: block("parameter_get", { NAME: "a" }), B: block("parameter_get", { NAME: "b" }) }),
        }),
      }, { PARAMS: 2 }),
      block("print", {}, { VALUE: block("function_result", { NAME: "add" }, { ARGS_0: number(2), ARGS_1: number(3) }, { ARGS: 2 }) }),
    ]);

    expect(output).toEqual(["5"]);
  });

  test("lists and a loop over them", async () => {
    const output = await run([
      block("variable_create", { NAME: "items" }, {
        VALUE: block("list_create", {}, { ITEMS_0: number(1), ITEMS_1: number(2), ITEMS_2: number(3) }, { ITEMS: 3 }),
      }),
      block("list_add", {}, { LIST: get("items"), VALUE: number(4) }),
      block("list_set", {}, { LIST: get("items"), INDEX: number(0), VALUE: number(10) }),
      block("for_each", { NAME: "item" }, {
        LIST: get("items"),
        BODY: [
          block("if", {}, { CONDITION: block("compare", { OP: "==" }, { A: get("item"), B: number(3) }), THEN: block("continue") }),
          block("print", {}, { VALUE: get("item") }),
        ],
      }),
      block("print", {}, { VALUE: block("list_length", {}, { LIST: get("items") }) }),
    ]);

    expect(output).toEqual(["10", "2", "4", "4"]);
  });

  test("a class with a field and a method", async () => {
    const output = await run([
      block("class_define", { NAME: "Cat" }, {
        FIELDS: block("class_field", { NAME: "sound" }, { VALUE: text("meow") }),
        METHODS: block("class_method", { NAME: "speak" }, { BODY: block("print", {}, { VALUE: block("field_get", { NAME: "sound" }) }) }),
      }),
      block("object_create", { VAR: "tom", CLASS: "Cat" }),
      block("method_call", { VAR: "tom", METHOD: "speak" }),
    ]);

    expect(output).toEqual(["meow"]);
  });
});

describe("define", () => {
  test("makes each language a code element with its settings and templates", () => {
    const { definitions } = define({ blocks: standard, languages: { plain, other: { blocks: { print: "say %1" } } } });

    expect(definitions.elementTypes).toMatchObject({ plain: "code", other: "code" });
    expect(definitions.code!.plain!.stringQuote).toBe('"');
    expect(definitions.blocks.find((entry) => entry.identifier === "print")!.elements).toEqual({ plain: "print(%1);", other: "say %1" });
  });

  test("lets the app's own settings win, one by one", () => {
    const { definitions } = define(
      { blocks: standard, languages: { plain } },
      { code: { plain: { stringQuote: "'", highlighting: { comment: "#" } } } },
    );
    const settings = definitions.code!.plain!;

    expect(settings.stringQuote).toBe("'");
    expect(settings.highlighting).toMatchObject({ comment: "#", strings: ['"'] });
    expect(settings.types).toEqual(plain.code!.types);
    expect(plain.code!.stringQuote).toBe('"');
  });

  test("lets an own block add to a standard block or change it, and adds own blocks", () => {
    const { definitions, behaviors } = define(
      { blocks: standard, languages: { plain } },
      {
        elementTypes: { title: "text" },
        blocks: [
          { identifier: "print", elements: { title: "Print", plain: "say(%1);" }, category: "Talking" },
          { identifier: "jump", elements: { plain: "jump();" }, shape: "statement" },
        ],
      },
      { jump: () => "jump();\n", print: () => "say();\n" },
    );
    const print = definitions.blocks.find((entry) => entry.identifier === "print")!;

    expect(print.elements).toEqual({ plain: "say(%1);", title: "Print" });
    expect(print.category).toBe("Talking");
    expect(print.inputSlots).toEqual(standard.print!.inputSlots);
    expect(definitions.blocks.at(-1)!.identifier).toBe("jump");
    expect(definitions.elementTypes).toEqual({ title: "text", plain: "code" });
    expect((behaviors.print as () => string)()).toBe("say();\n");
    expect(checkDefinitions({ ...definitions, modes }, behaviors).errors).toEqual([]);
  });

  test("with some of the blocks leaves out the defaults that name the others", () => {
    const { definitions, behaviors } = define({ blocks: pick(standard, ["print", "repeat"]), languages: { plain } }, { modes });

    expect(definitions.blocks.map((entry) => entry.identifier)).toEqual(["print", "repeat"]);
    expect(definitions.blocks[0]!.inputSlots!["1"]!.default).toBeUndefined();
    expect(definitions.code!.plain!.empty).toEqual({});
    expect(definitions.categories!.map((category) => category.name)).toEqual(["Output", "Control"]);
    expect(checkDefinitions(definitions, behaviors).errors).toEqual([]);
    expect(standard.print!.inputSlots!["1"]!.default).toBeDefined();
  });

  test("writes a language's own words for choices and separators", () => {
    const { definitions } = everything();
    const find = (identifier: string) => definitions.blocks.find((entry) => entry.identifier === identifier)!;

    expect(find("logic_operation").fields!.OP).toMatchObject({
      options: [{ value: "&&", display: { plain: "and" } }, { value: "||", display: { plain: "or" } }],
    });
    expect(find("text_join").inputSlots!["1"]!.repeat!.separator).toEqual({ plain: " + " });
  });

  test("leaves out a block no language writes, and keeps the app's categories first", () => {
    const { definitions, behaviors } = define(
      { blocks: standard, languages: { tiny: { blocks: { print: "print %1", number: "%NUM" } } } },
      { categories: [{ name: "Output", color: "#000000" }] },
    );

    expect(definitions.blocks.map((entry) => entry.identifier)).toEqual(["print", "number"]);
    expect(Object.keys(behaviors)).toEqual(["print", "number"]);
    expect(definitions.categories).toEqual([{ name: "Output", color: "#000000" }, standardCategories[1]]);
  });

  test("pick refuses a block the set does not have", () => {
    expect(() => pick(standard, ["print", "jump"])).toThrow(/"jump" is no block of the set/);
    expect(() => pick(standard, ["toString"])).toThrow(/"toString" is no block of the set/);
  });

  test("any part of the blocks gives definitions that mount: what names a block left out is left out", () => {
    const parts = [
      ["print", "variable_get"],
      ["print", "variable_set", "number"],
      ["for_each", "print", "variable_get"],
      ["function_call"],
      ["print", "parameter_get"],
      ["print", "field_get"],
      ["method_call"],
      ["class_define", "class_field", "field_get", "print"],
    ];
    for (const part of parts) {
      const { definitions, behaviors } = define({ blocks: pick(standard, part), languages: { plain } }, { modes });
      expect(checkDefinitions(definitions, behaviors).errors, part.join(", ")).toEqual([]);
    }
    const find = (part: string[], identifier: string) =>
      define({ blocks: pick(standard, part), languages: { plain } }).definitions.blocks.find((entry) => entry.identifier === identifier)!;

    // Nothing declares a variable: its name is a plain text. With one of the two declaring blocks, that one is listed.
    expect(find(["print", "variable_get"], "variable_get").fields!.NAME).toEqual({ type: "text", default: "x" });
    expect(find(["for_each", "variable_get"], "variable_get").fields!.NAME).toMatchObject({ type: "reference", to: "for_each.NAME" });
    expect(find(["print", "field_get", "class_field"], "field_get").fields!.NAME).toEqual({ type: "reference", to: "class_field.NAME", default: "name" });
    expect(standard.variable_get!.fields!.NAME).toMatchObject({ type: "reference", to: ["variable_create.NAME", "for_each.NAME"] });
  });

  test("leaves the app's own objects as they are", () => {
    const own = { blocks: [{ identifier: "show", elements: { plain: "show(%1)" }, inputSlots: { "1": { kind: "value" as const, name: "V", default: { shadow: "number" } } } }] };
    define({ blocks: pick(standard, ["print"]), languages: { plain } }, own);

    expect(own.blocks[0]!.inputSlots["1"]!.default).toEqual({ shadow: "number" });
  });

  test("a repeat keeps its count to itself, and a random number works its bounds out once", async () => {
    const output = await run([
      block("variable_create", { NAME: "count" }, { VALUE: block("number", { NUM: 0 }) }),
      block("variable_create", { NAME: "times" }, { VALUE: block("number", { NUM: 5 }) }),
      block("repeat", {}, {
        TIMES: block("number", { NUM: 3 }),
        BODY: block("repeat", {}, { TIMES: block("number", { NUM: 2 }), BODY: block("variable_change", { NAME: "count" }, { BY: block("number", { NUM: 1 }) }) }),
      }),
      block("print", {}, { VALUE: block("variable_get", { NAME: "count" }) }),
      block("print", {}, { VALUE: block("variable_get", { NAME: "times" }) }),
      block("print", {}, { VALUE: block("math_random", {}, { FROM: block("number", { NUM: 4 }), TO: block("number", { NUM: 4 }) }) }),
    ]);

    expect(output).toEqual(["6", "5", "4"]);
  });
});
