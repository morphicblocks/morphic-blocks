import { block, type ProgramBlock } from "../../blocks/test/program";

/**
 * Programs that together use every standard block. Each language's test
 * holds the text it writes for them; `runs.test.ts` holds what they print.
 */

const number = (value: number) => block("number", { NUM: value });
const text = (value: string) => block("text", { TEXT: value });
const get = (name: string) => block("variable_get", { NAME: name });
const print = (value: ProgramBlock) => block("print", {}, { VALUE: value });

export const programs: Record<string, ProgramBlock[]> = {
  basics: [
    block("comment", { TEXT: "the basics" }),
    block("variable_create", { NAME: "total" }, { VALUE: number(2) }),
    block("variable_set", { NAME: "total" }, { VALUE: block("math_operation", { OP: "*" }, { A: get("total"), B: number(10) }) }),
    block("variable_change", { NAME: "total" }, { BY: number(1) }),
    print(get("total")),
    print(block("math_remainder", {}, { A: get("total"), B: number(4) })),
    print(block("text_join", {}, { PARTS_0: text("total: "), PARTS_1: get("total") })),
    print(block("text_length", {}, { TEXT: text("hello") })),
    print(block("boolean", { BOOL: "true" })),
  ],

  control: [
    block("variable_create", { NAME: "count" }, { VALUE: number(0) }),
    block("repeat", {}, { TIMES: number(3), BODY: block("variable_change", { NAME: "count" }, { BY: number(2) }) }),
    block("while", {}, {
      CONDITION: block("compare", { OP: "<" }, { A: get("count"), B: number(9) }),
      BODY: block("variable_change", { NAME: "count" }, { BY: number(1) }),
    }),
    block("if", {}, {
      CONDITION: block("logic_operation", { OP: "&&" }, {
        A: block("compare", { OP: "==" }, { A: get("count"), B: number(9) }),
        B: block("logic_not", {}, { VALUE: block("boolean", { BOOL: "false" }) }),
      }),
      THEN: print(text("nine")),
    }),
    block("if_else", {}, {
      CONDITION: block("compare", { OP: ">=" }, { A: get("count"), B: number(10) }),
      THEN: print(text("big")),
      ELSE: print(text("small")),
    }),
  ],

  functions: [
    block("function_define", { NAME: "add" }, {
      PARAMS_0: block("parameter", { NAME: "a" }),
      PARAMS_1: block("parameter", { NAME: "b" }),
      BODY: block("return", {}, {
        VALUE: block("math_operation", { OP: "+" }, { A: block("parameter_get", { NAME: "a" }), B: block("parameter_get", { NAME: "b" }) }),
      }),
    }, { PARAMS: 2 }),
    block("function_define", { NAME: "greet" }, {
      PARAMS_0: block("parameter", { NAME: "name" }),
      BODY: print(block("text_join", {}, { PARTS_0: text("Hello, "), PARTS_1: block("parameter_get", { NAME: "name" }) })),
    }, { PARAMS: 1 }),
    block("function_call", { NAME: "greet" }, { ARGS_0: text("Ada") }, { ARGS: 1 }),
    print(block("function_result", { NAME: "add" }, { ARGS_0: number(2), ARGS_1: number(3) }, { ARGS: 2 })),
  ],

  lists: [
    block("variable_create", { NAME: "items" }, {
      VALUE: block("list_create", {}, { ITEMS_0: number(1), ITEMS_1: number(2), ITEMS_2: number(3) }, { ITEMS: 3 }),
    }),
    block("list_add", {}, { LIST: get("items"), VALUE: number(4) }),
    block("list_set", {}, { LIST: get("items"), INDEX: number(0), VALUE: number(10) }),
    print(block("list_get", {}, { LIST: get("items"), INDEX: number(1) })),
    block("for_each", { NAME: "item" }, {
      LIST: get("items"),
      BODY: [
        block("if", {}, { CONDITION: block("compare", { OP: "==" }, { A: get("item"), B: number(3) }), THEN: block("continue") }),
        block("if", {}, { CONDITION: block("compare", { OP: ">" }, { A: get("item"), B: number(20) }), THEN: block("break") }),
        print(get("item")),
      ],
    }),
    print(block("list_length", {}, { LIST: get("items") })),
  ],

  classes: [
    block("class_define", { NAME: "Cat" }, {
      FIELDS: [
        block("class_field", { NAME: "sound" }, { VALUE: text("meow") }),
        block("class_field", { NAME: "lives" }, { VALUE: number(9) }),
      ],
      METHODS: block("class_method", { NAME: "speak" }, { BODY: print(block("field_get", { NAME: "sound" })) }),
    }),
    block("object_create", { VAR: "tom", CLASS: "Cat" }),
    block("method_call", { VAR: "tom", METHOD: "speak" }),
  ],

  random: [print(block("compare", { OP: "<=" }, { A: block("math_random", {}, { FROM: number(1), TO: number(6) }), B: number(6) }))],
};

/** What each program prints when it runs (programs run as JavaScript, whatever language shows them). */
export const prints: Record<string, string[]> = {
  basics: ["21", "1", "total: 21", "5", "true"],
  control: ["nine", "small"],
  functions: ["Hello, Ada", "5"],
  lists: ["2", "10", "2", "4", "4"],
  classes: ["meow"],
  random: ["true"],
};
