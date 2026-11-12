import { describe, expect, test } from "vitest";
import { standard } from "@morphicblocks/blocks";
import { parseTemplate } from "../../morphic-blocks/src/morphic/template";
import { languages } from "../src";
import { check, roundTrip, run } from "./helpers";
import { prints, programs } from "./programs";

/** Rules every language keeps, whatever it looks like. */

test("the sample programs use every standard block", () => {
  const used = new Set<string>();
  const visit = (entry: unknown): void => {
    if (Array.isArray(entry)) return entry.forEach(visit);
    const block = entry as { type: string; inputs?: Record<string, unknown> };
    used.add(block.type);
    Object.values(block.inputs ?? {}).forEach(visit);
  };
  Object.values(programs).forEach(visit);

  expect(Object.keys(standard).filter((identifier) => !used.has(identifier))).toEqual([]);
});

/**
 * Programs whose text in a language leaves a value out, so reading the text
 * back gives the same text but not the same values: a Go struct field has a
 * type and no start value (`sound string`).
 */
const notInText: Record<string, string[]> = { go: ["classes"] };

describe.each(Object.entries(languages))("%s", (name, language) => {
  test("writes every standard block, and no other", () => {
    expect(Object.keys(language.blocks).sort()).toEqual(Object.keys(standard).sort());
  });

  test("names every slot and field of a block in its template, and nothing else", () => {
    for (const [identifier, definition] of Object.entries(standard)) {
      const tokens = parseTemplate(language.blocks[identifier] ?? "");
      const slots = new Set(tokens.flatMap((token) => (token.kind === "placeholder" ? [String(token.index)] : [])));
      const fields = new Set(tokens.flatMap((token) => (token.kind === "field" ? [token.name] : [])));
      // A slot may be left out on purpose (it stays on the block); one that is not declared is a mistake.
      for (const slot of slots) expect(Object.keys(definition.inputSlots ?? {}), `${identifier} %${slot}`).toContain(slot);
      for (const field of fields) expect(Object.keys(definition.fields ?? {}), `${identifier} %${field}`).toContain(field);
    }
  });

  test("passes every check of a mount, without a warning about the blocks", () => {
    const { errors, warnings } = check(language);

    expect(errors).toEqual([]);
    expect(warnings.filter((warning) => warning.startsWith("Block "))).toEqual([]);
  });

  test("sets the basics of its code element", () => {
    expect(language.code?.stringQuote).toBeTypeOf("string");
    expect(language.code?.highlighting?.keywords?.length).toBeGreaterThan(5);
    expect(Object.keys(language.code?.empty ?? {})).toEqual(expect.arrayContaining(["Number", "String", "Boolean"]));
  });

  // A language may print values in its own spelling (`True`).
  const spelled = (line: string) => (line === "true" || line === "false" ? (language.code?.values?.[line] ?? line) : line);

  test.each(Object.keys(programs))("runs the program %s", async (program) => {
    expect(await run(language, program)).toEqual(prints[program]!.map(spelled));
  });

  test.each(Object.keys(programs))("reads its own text of the program %s back into the same program", async (program) => {
    const read = await roundTrip(language, program);

    expect(read.result).toMatchObject({ ok: true });
    expect(read.after).toBe(read.before);
    // What a language's text does not say cannot come back from it.
    if (!notInText[name]?.includes(program)) expect(read.prints).toEqual(prints[program]!.map(spelled));
  });
});
