import type * as Blockly from "blockly";
import { toBlocklyType } from "./block-namespace";
import { ATOM, WHOLE, allows, operatorForm, rankOperator, slotBound, type OperandBound, type OperatorForm, type RankedOperator } from "./operators";
import { isRepeating, repeatInputName, repeatSeparator, separatorComposes, slotInputName } from "./repeat-slots";
import { parseTemplate, quoteAround, readQuoted } from "./template";
import type {
  MorphicBlockDefinition,
  MorphicCodeElementConfig,
  MorphicConnectionSpec,
  MorphicDropdownOption,
  MorphicFieldDefinition,
  MorphicInputSlotDefinition,
} from "./types";

/**
 * Text to blocks: read the text of a code element back into the blocks that
 * write it. There is no parser per language. Each block's template is its
 * pattern, read the way it is written: `print(%1)` is the text `print(`, a
 * value, and `)`. Statements are read line by line, a body by its
 * indentation, a value down to the blocks without slots.
 *
 * This first version reads valid text only. Where two blocks write the same
 * text (`x = 1` creates a variable or sets one), the names declared so far
 * decide: a reference prefers a name that exists, a declaration one that does
 * not. Operators are read in the order the language gives their signs (see
 * operators.ts), and brackets group whatever is in them; a sign without a
 * rank needs brackets around its parts.
 */

type BlockState = Blockly.serialization.blocks.State;

/** What reading a text gives: the program's stacks, or the line that fits no block. */
export type MorphicTextParseResult =
  | { ok: true; stacks: BlockState[]; blocks: number }
  | { ok: false; line: number; message: string };

type Token =
  | { kind: "text"; value: string }
  | { kind: "field"; name: string; field: MorphicFieldDefinition | undefined }
  | { kind: "skip"; types: boolean; slotName?: string; field?: string }
  | { kind: "value"; name: string; number: number; slot: MorphicInputSlotDefinition; bound: OperandBound }
  | { kind: "repeat"; name: string; number: number; slot: MorphicInputSlotDefinition; separator: string; bound: OperandBound }
  | { kind: "body"; name: string; slot: MorphicInputSlotDefinition; indent: string };

interface Template {
  def: MorphicBlockDefinition;
  tokens: Token[];
  isValue: boolean;
  /** A value template that begins with a value: it continues a value already read (`%1 + %2`, `%1[%2]`). */
  continues: boolean;
  /** Such a template that binds tightly (`%1[%2]`, `%1.length`), not through an operator. */
  tight: boolean;
  /** The template as an operator (`%1 + %2`, `not %1`), when it has the shape of one. */
  form: OperatorForm | null;
  /** How much fixed text it has; the more, the more specific. */
  weight: number;
}

/** A block read from text, with how well its names fit and the names it declares. */
interface Read {
  state: BlockState;
  def: MorphicBlockDefinition;
  penalty: number;
  declares: string[];
  count: number;
}

interface Candidate extends Read {
  end: number;
  /**
   * How tightly the value holds together without brackets around it: the
   * rank of its operator (`a + b`), `Infinity` for one piece (a name, a
   * call, anything in brackets), `-Infinity` for an operator without a rank.
   */
  rank: number;
  /**
   * Set on a value of an operator without a rank: the operator, as template
   * and fields. Nothing but the same operator again may go on from it.
   */
  open?: string;
}

/** What a template has taken in so far. */
interface Partial {
  fields: Record<string, string>;
  shown: Record<string, string>;
  inputs: Record<string, Read>;
  repeat: Record<string, number>;
  /** The type names read for slots (`%1:type`), by slot name. */
  types: Record<string, string>;
  /** The text each value slot was read from, by slot name. */
  written: Record<string, string>;
}

interface Env {
  has(key: string): boolean;
  /** Names the same set of names; what was read with one set can be used again with it. */
  key: string;
}

/** Told about a line whose operators do not say what belongs together. */
const NO_ORDER = "Put brackets around the parts of this line: these operators have no order.";
const WORD = /[\p{L}\p{M}\p{N}_$]/u;
const IDENTIFIER = /[\p{L}_$][\p{L}\p{M}\p{N}_$]*/uy;
// A dot belongs to the number only with a digit after it: `1..=6` is `1`, then a range sign.
const NUMBER = /-?(?:\d+(?:\.\d+)?|\.\d+)(?:[eE][-+]?\d+)?/y;

/**
 * Read `source`, written in the code element `element`, into blocks.
 * `settings` are the element's `code` settings: its keywords are no names,
 * its comment sign and empty statement are read as it writes them.
 */
export function parseTextToBlocks(
  source: string,
  element: string,
  definitions: ReadonlyMap<string, MorphicBlockDefinition>,
  settings: MorphicCodeElementConfig = {},
): MorphicTextParseResult {
  const text = source.replace(/\r\n?/g, "\n");
  const keywords = new Set(settings.highlighting?.keywords ?? []);
  const comment = settings.highlighting?.comment;
  const typeNames = Object.values(settings.types ?? {}).sort((a, b) => b.length - a.length);

  // The fields that declare a name: the ones a reference field points to.
  const declaring = new Set<string>();
  for (const def of definitions.values()) {
    for (const field of Object.values(def.fields ?? {})) {
      if (field.type === "reference") for (const target of [field.to].flat()) declaring.add(target);
    }
  }

  const templates: Template[] = [];
  for (const def of definitions.values()) {
    const template = buildTemplate(def, element);
    if (template) templates.push(template);
  }
  // The more specific template first; among equals, the order of the definitions.
  templates.sort((a, b) => b.weight - a.weight);
  const statements = templates.filter((template) => !template.isValue);
  const primaries = templates.filter((template) => template.isValue && !template.continues);
  const continuations = templates.filter((template) => template.isValue && template.continues);

  /** Every name the text declares, and (in the second reading) the ones known from the first. */
  const declared = new Set<string>();
  let later = new Set<string>();
  /** The blocks around the body that is being read, as the fields they show. */
  const parents: Record<string, string>[] = [];
  /** What was read at a place already, for the next template that asks there. */
  const values = new Map<string, Candidate[]>();
  const bodies = new Map<string, { stacks: Read[]; pos: number }>();

  // How far the reading got, and the last thing worth telling about the line it stopped on.
  let farthest = { pos: -1, message: "" };
  let hint = { pos: -1, message: "" };
  const fail = (pos: number, message: string): void => {
    if (pos > farthest.pos) farthest = { pos, message };
    if (message && pos >= hint.pos) hint = { pos, message };
  };
  const lineOf = (pos: number): number => text.slice(0, Math.max(0, pos)).split("\n").length;

  // ── Text ────────────────────────────────────────────────

  const skipSpaces = (pos: number): number => {
    while (text[pos] === " " || text[pos] === "\t") pos++;
    return pos;
  };
  const lineEnd = (pos: number): number => {
    const end = text.indexOf("\n", pos);
    return end === -1 ? text.length : end;
  };
  /** The start of the next line that has something on it. */
  const skipBlankLines = (pos: number): number => {
    for (;;) {
      const end = lineEnd(pos);
      if (end >= text.length || text.slice(pos, end).trim() !== "") return text.slice(pos, end).trim() === "" ? text.length : pos;
      pos = end + 1;
    }
  };
  /** At the end of a line: nothing follows but spaces, or a comment. */
  const atLineEnd = (pos: number): boolean => {
    const end = skipSpaces(pos);
    return end >= text.length || text[end] === "\n" || (!!comment && end > pos && text.startsWith(comment, end));
  };

  const wordy = (token: Token | undefined, edge: "start" | "end"): boolean => {
    if (!token || token.kind === "text" || token.kind === "body") return false;
    if (token.kind !== "field" || token.field?.type !== "dropdown") return true;
    return optionTexts(token.field.options, element).some(({ shown }) => WORD.test(edge === "start" ? shown[0] ?? "" : shown.at(-1) ?? ""));
  };

  /**
   * Match the fixed text of a template. Spaces are free where they separate
   * nothing (`a+b` for `a + b`), and needed between two words. A line break
   * in the template is a line break in the text, the next line indented as
   * the block is. Returns where the text goes on, or `null`.
   */
  function matchLiteral(
    literal: string,
    pos: number,
    lineStart: boolean,
    indent: string,
    before: Token | undefined,
    after: Token | undefined,
  ): { pos: number; lineStart: boolean } | null {
    const lines = literal.split("\n");
    for (let index = 0; index < lines.length; index++) {
      const line = lines[index]!;
      if (index > 0) {
        if (!lineStart) {
          pos = skipSpaces(pos);
          if (pos < text.length && text[pos] !== "\n") return null;
          pos = skipBlankLines(Math.min(pos + 1, text.length));
          lineStart = true;
        }
        if (line.trim() === "") continue;
        const lead = /^[ \t]*/.exec(line)![0];
        if (!text.startsWith(indent + lead, pos)) return null;
        pos += indent.length + lead.length;
        lineStart = false;
        const rest = matchInline(line.slice(lead.length), pos, undefined, index === lines.length - 1 ? after : undefined);
        if (rest === null) return null;
        pos = rest;
        continue;
      }
      if (line === "") continue;
      if (lineStart) return null;
      const rest = matchInline(line, pos, before, lines.length === 1 ? after : undefined);
      if (rest === null) return null;
      pos = rest;
    }
    return { pos, lineStart };
  }

  function matchInline(chunk: string, pos: number, before: Token | undefined, after: Token | undefined): number | null {
    // A sign that closes a value may stand off from it: `print( x )`.
    if ((before?.kind === "value" || before?.kind === "repeat") && /^[^\s\p{L}\p{N}_$]/u.test(chunk)) pos = skipSpaces(pos);
    for (let index = 0; index < chunk.length; ) {
      if (chunk[index] === " " || chunk[index] === "\t") {
        let end = index;
        while (chunk[end] === " " || chunk[end] === "\t") end++;
        const left = index === 0 ? wordy(before, "end") : WORD.test(chunk[index - 1]!);
        const right = end === chunk.length ? wordy(after, "start") : WORD.test(chunk[end]!);
        const from = pos;
        pos = skipSpaces(pos);
        if (left && right && pos === from) return null;
        index = end;
        continue;
      }
      if (text[pos] !== chunk[index]) return null;
      pos++;
      index++;
    }
    return pos;
  }

  // ── Fields ──────────────────────────────────────────────

  /** The ways a field can be read at a position: its value, the text it shows, and where it ends. */
  function fieldAt(template: Template, index: number, pos: number): { value: string; shown: string; end: number }[] {
    const token = template.tokens[index] as Extract<Token, { kind: "field" }>;
    const field = token.field;
    if (field?.type === "dropdown") {
      return optionTexts(field.options, element)
        .filter(({ shown }) => text.startsWith(shown, pos) && !(WORD.test(shown.at(-1) ?? "") && WORD.test(text[pos + shown.length] ?? "")))
        .map(({ value, shown }) => ({ value, shown, end: pos + shown.length }));
    }
    if (field?.type === "number") {
      NUMBER.lastIndex = pos;
      const match = NUMBER.exec(text);
      return match ? [{ value: match[0], shown: match[0], end: pos + match[0].length }] : [];
    }
    if (field?.type === "text") {
      const next = template.tokens[index + 1];
      const previous = template.tokens[index - 1];
      // A text between quotes (or other marks) runs to the mark that closes it.
      const closing = next?.kind === "text" ? next.value[0] : undefined;
      const opened = previous?.kind === "text" ? previous.value.at(-1) : undefined;
      // Between quote marks, a mark with a backslash in front belongs to the text.
      const quote = quoteAround(previous?.kind === "text" ? previous.value : undefined, next?.kind === "text" ? next.value : undefined);
      if (quote) {
        const read = readQuoted(text, pos, quote);
        return read ? [{ value: read.value, shown: text.slice(pos, read.end), end: read.end }] : [];
      }
      if (closing && !WORD.test(closing) && closing !== " " && closing !== "\n" && opened && !WORD.test(opened) && opened !== " " && closing !== "(") {
        const end = text.indexOf(closing, pos);
        if (end === -1 || end > lineEnd(pos)) return [];
        return [{ value: text.slice(pos, end), shown: text.slice(pos, end), end }];
      }
      // A comment runs to the end of its line.
      const first = template.tokens[0];
      if (!next && !template.isValue && comment && first?.kind === "text" && first.value.trim() === comment) {
        const value = text.slice(pos, lineEnd(pos)).trimEnd();
        return [{ value, shown: value, end: pos + value.length }];
      }
    }
    IDENTIFIER.lastIndex = pos;
    const name = IDENTIFIER.exec(text)?.[0];
    return name && !keywords.has(name) ? [{ value: name, shown: name, end: pos + name.length }] : [];
  }

  // ── Operators ───────────────────────────────────────────

  /** The template as an operator with a rank, with the sign its fields show so far. */
  const operatorIn = (template: Template, taken: Partial): RankedOperator | null =>
    template.form ? rankOperator(template.form, (name) => taken.shown[name], settings.operators) : null;
  /**
   * What a slot takes without brackets: what its operator says, else what the
   * text around it does. Text without brackets reads from the left, so an
   * operator takes no value of its own sign where the writer leaves the
   * brackets out because the grouping does not matter.
   */
  const boundOf = (template: Template, token: Extract<Token, { kind: "value" | "repeat" }>, taken: Partial): OperandBound => {
    const own = operatorIn(template, taken)?.bound(token.number);
    return own ? { rank: own.rank, above: own.above } : token.bound;
  };

  // ── Templates ───────────────────────────────────────────

  /** Every way a template fits the text from a position, from its token `from` on. */
  function* matchTemplate(
    template: Template,
    from: number,
    pos: number,
    lineStart: boolean,
    indent: string,
    env: Env,
    taken: Partial,
  ): Generator<{ pos: number; lineStart: boolean; taken: Partial }> {
    const { tokens, def } = template;
    if (from === tokens.length) {
      yield { pos, lineStart, taken };
      return;
    }
    const token = tokens[from]!;
    // The names this block and the blocks in it declare are known to what follows.
    const inner = (): Env => extend(env, [...Object.values(taken.inputs).flatMap((read) => read.declares), ...declaresOf(def, taken.fields)]);

    if (token.kind === "text") {
      const next = matchLiteral(token.value, pos, lineStart, indent, tokens[from - 1], tokens[from + 1]);
      if (next) yield* matchTemplate(template, from + 1, next.pos, next.lineStart, indent, env, taken);
      else fail(pos, "");
      return;
    }
    if (lineStart) return;

    if (token.kind === "skip" && !token.types) {
      // A field of the block around this one: the text must name what that
      // block holds, and nothing where no block around it has the field.
      const held = [...parents].reverse().find((fields) => token.field! in fields)?.[token.field!] ?? "";
      if (text.startsWith(held, pos) && !(held && WORD.test(text[pos + held.length] ?? ""))) {
        yield* matchTemplate(template, from + 1, pos + held.length, false, indent, env, taken);
      }
      return;
    }
    if (token.kind === "skip") {
      // A type name: written by the block from the value in its slot, not held by it.
      const name = typeNames.find((type) => text.startsWith(type, pos));
      IDENTIFIER.lastIndex = pos;
      const end = name ? pos + name.length : pos + (IDENTIFIER.exec(text)?.[0].length ?? 0);
      const next = name && token.slotName ? { ...taken, types: { ...taken.types, [token.slotName]: name } } : taken;
      if (end > pos) yield* matchTemplate(template, from + 1, end, false, indent, env, next);
      return;
    }

    if (token.kind === "field") {
      for (const read of fieldAt(template, from, pos)) {
        // A field named twice shows the same text in both places.
        if (token.name in taken.fields && taken.shown[token.name] !== read.shown) continue;
        const next: Partial = {
          ...taken,
          fields: { ...taken.fields, [token.name]: read.value },
          shown: { ...taken.shown, [token.name]: read.shown },
        };
        yield* matchTemplate(template, from + 1, read.end, false, indent, env, next);
      }
      return;
    }

    if (token.kind === "value") {
      const start = skipSpaces(pos);
      // A slot written again (`%1 = append(%1, %2)`) reads the same text again.
      const again = taken.written[token.name];
      if (again !== undefined) {
        if (text.startsWith(again, start)) yield* matchTemplate(template, from + 1, start + again.length, false, indent, env, taken);
        return;
      }
      const marker = emptyMarker(token.slot.check);
      if (text.startsWith(marker, start)) {
        const next: Partial = { ...taken, written: { ...taken.written, [token.name]: marker } };
        yield* matchTemplate(template, from + 1, start + marker.length, false, indent, env, next);
      }
      for (const candidate of valuesAt(start, boundOf(template, token, taken), inner(), token.slot)) {
        const next: Partial = {
          ...taken,
          inputs: { ...taken.inputs, [token.name]: candidate },
          written: { ...taken.written, [token.name]: text.slice(start, candidate.end) },
        };
        yield* matchTemplate(template, from + 1, candidate.end, false, indent, env, next);
      }
      return;
    }

    if (token.kind === "repeat") {
      yield* matchEntries(template, from, token, pos, 0, indent, env, taken);
      return;
    }

    // A body: the statements on the lines below, indented as the template says.
    return;
  }

  /** The entries of a repeating slot: as many as the text has, the longest reading first. */
  function* matchEntries(
    template: Template,
    from: number,
    token: Extract<Token, { kind: "repeat" }>,
    pos: number,
    count: number,
    indent: string,
    env: Env,
    taken: Partial,
  ): Generator<{ pos: number; lineStart: boolean; taken: Partial }> {
    let start: number | null = pos;
    if (count > 0) start = matchInline(token.separator, pos, undefined, undefined);
    if (start !== null) {
      start = skipSpaces(start);
      const name = repeatInputName(token.name, count);
      const marker = emptyMarker(token.slot.check);
      const withEntry = (read: Read | undefined): Partial => ({
        ...taken,
        inputs: read ? { ...taken.inputs, [name]: read } : taken.inputs,
        repeat: { ...taken.repeat, [token.name]: count + 1 },
      });
      const known = extend(env, [...Object.values(taken.inputs).flatMap((read) => read.declares), ...declaresOf(template.def, taken.fields)]);
      for (const candidate of valuesAt(start, boundOf(template, token, taken), known, token.slot)) {
        yield* matchEntries(template, from, token, candidate.end, count + 1, indent, env, withEntry(candidate));
      }
      if (text.startsWith(marker, start)) {
        yield* matchEntries(template, from, token, start + marker.length, count + 1, indent, env, withEntry(undefined));
      }
    }
    const done: Partial = { ...taken, repeat: { ...taken.repeat, [token.name]: count } };
    yield* matchTemplate(template, from + 1, pos, false, indent, env, done);
  }

  /**
   * Every way a template fits, bodies included. A body is read once per way,
   * so it is taken apart from the generator above: the tokens up to a body
   * are matched, the body is read, and the rest goes on from there.
   */
  function* matchWithBodies(
    template: Template,
    from: number,
    pos: number,
    lineStart: boolean,
    indent: string,
    env: Env,
    taken: Partial,
  ): Generator<{ pos: number; lineStart: boolean; taken: Partial }> {
    const body = template.tokens.findIndex((token, index) => index >= from && token.kind === "body");
    if (body === -1) {
      yield* matchTemplate(template, from, pos, lineStart, indent, env, taken);
      return;
    }
    const head: Template = { ...template, tokens: template.tokens.slice(0, body) };
    const token = template.tokens[body] as Extract<Token, { kind: "body" }>;
    for (const before of matchTemplate(head, from, pos, lineStart, indent, env, taken)) {
      if (!before.lineStart) continue;
      const known = extend(env, [
        ...Object.values(before.taken.inputs).flatMap((read) => read.declares),
        ...declaresOf(template.def, before.taken.fields),
      ]);
      // The block's fields, as written, are what `%parent.NAME` in its body names.
      parents.push(before.taken.shown);
      const list = readStatements(before.pos, indent + token.indent, token.slot, known);
      parents.pop();
      const inputs = list.stacks[0] ? { ...before.taken.inputs, [token.name]: list.stacks[0] } : before.taken.inputs;
      yield* matchWithBodies(template, body + 1, list.pos, true, indent, env, { ...before.taken, inputs });
    }
  }

  /** The block a finished template gives. */
  function finish(template: Template, taken: Partial, env: Env): Read {
    const { def } = template;
    const children = Object.values(taken.inputs);
    let penalty = children.reduce((sum, read) => sum + read.penalty, 0);
    const fields: Record<string, unknown> = {};
    for (const [name, value] of Object.entries(taken.fields)) {
      const field = def.fields?.[name];
      fields[name] = field?.type === "number" ? Number(value) : value;
      // A reference reads best as a name declared above it, then as one
      // declared further down (a function called before it is written); a
      // declaration as a name that is new. Of two that fit, the nearer one
      // wins: the parameter of this function over a variable of that name.
      if (field?.type === "reference") {
        const targets = [field.to].flat().map((target) => `${target}=${value}`);
        if (targets.some((key) => env.has(key))) penalty -= field.scope ? 0.1 : 0;
        else penalty += targets.some((key) => later.has(key)) ? 0.5 : 1;
      }
      const own = `${def.identifier}.${name}=${value}`;
      if (declaring.has(`${def.identifier}.${name}`)) {
        if (env.has(own)) penalty++;
        declared.add(own);
      }
    }
    const handled: string[] = [];
    for (const [index, slot] of Object.entries(def.inputSlots ?? {})) {
      if ((slot.kind ?? "value") !== "value") continue;
      const name = slotInputName(slot, index);
      if (!isRepeating(slot)) handled.push(name);
      else for (let entry = 0; entry < (taken.repeat[name] ?? 0); entry++) handled.push(repeatInputName(name, entry));
    }
    const state: BlockState = { type: toBlocklyType(def.identifier) };
    if (Object.keys(fields).length > 0) state.fields = fields;
    const inputs = Object.entries(taken.inputs).map(([name, read]) => [name, { block: read.state }] as const);
    // A slot the text gives only the type of (`lives int`) gets that type's default value.
    for (const [slotName, typeName] of Object.entries(taken.types)) {
      const kind = Object.entries(settings.types ?? {}).find(([key, written]) => written === typeName && key !== "default")?.[0];
      const config = kind ? settings.empty?.[kind] : undefined;
      const ref = config?.shadow ?? config?.placeholder;
      if (ref && definitions.has(ref) && !(slotName in taken.inputs)) {
        inputs.push([slotName, { block: { type: toBlocklyType(ref), fields: config!.fieldValues ?? {} } }]);
      }
    }
    if (inputs.length > 0) state.inputs = Object.fromEntries(inputs);
    // The block holds what the text says: its slots get no placeholder default on top.
    state.extraState = {
      ...(Object.keys(taken.repeat).length > 0 ? { repeat: taken.repeat } : {}),
      defaults: handled,
    };
    return {
      state,
      def,
      penalty,
      // Only its own names go on: what is declared inside it (parameters, the
      // variables of its body) is known there and not below it.
      declares: declaresOf(def, taken.fields),
      count: 1 + children.reduce((sum, read) => sum + read.count, 0),
    };
  }

  function declaresOf(def: MorphicBlockDefinition, fields: Record<string, string>): string[] {
    return Object.entries(fields)
      .filter(([name]) => declaring.has(`${def.identifier}.${name}`))
      .map(([name, value]) => `${def.identifier}.${name}=${value}`);
  }

  // ── Values ──────────────────────────────────────────────

  const empty: Partial = { fields: {}, shown: {}, inputs: {}, repeat: {}, types: {}, written: {} };

  /**
   * The values that can be read at a position and fit `slot` (any, without
   * one): one per place they end at, the longest first.
   */
  function valuesAt(pos: number, bound: OperandBound, env: Env, slot?: MorphicInputSlotDefinition): Candidate[] {
    const start = skipSpaces(pos);
    const memo = `${start}|${bound.rank}${bound.above ? ">" : ""}${bound.sign ?? ""}|${slotKey(slot)}|${parents.length}:${JSON.stringify(parents.at(-1) ?? {})}|${env.key}`;
    const known = values.get(memo);
    if (known) return known;

    const found: Candidate[] = [];
    // Brackets group a value; they are no block.
    if (text[start] === "(") {
      for (const inside of valuesAt(start + 1, WHOLE, env)) {
        const close = skipSpaces(inside.end);
        if (text[close] === ")") found.push({ ...inside, end: close + 1, rank: Infinity, open: undefined });
      }
    }
    for (const template of primaries) {
      for (const match of matchTemplate(template, 0, start, false, "", env, empty)) {
        if (match.lineStart) continue;
        // A sign in front of a value (`not a`) holds as tightly as its rank says; anything else is one piece.
        const rank = operatorIn(template, match.taken)?.rank ?? Infinity;
        if (allows(bound, rank)) found.push({ ...finish(template, match.taken, env), end: match.pos, rank });
      }
    }
    // What a value goes on as: `a` as `a + b`, `items` as `items[0]`.
    for (let index = 0; index < found.length; index++) {
      const left = found[index]!;
      for (const template of continuations) {
        // Only one piece goes on tightly (`items[0]`), and a slot for one piece takes no operator.
        if (template.tight ? left.rank !== Infinity : bound.rank === Infinity) continue;
        const first = template.tokens[0] as Extract<Token, { kind: "value" | "repeat" }>;
        if (!fitsValue(first.slot, left.def)) continue;
        const taken: Partial =
          first.kind === "repeat"
            ? { ...empty, inputs: { [repeatInputName(first.name, 0)]: left }, repeat: { [first.name]: 1 } }
            : { ...empty, inputs: { [first.name]: left } };
        const rest =
          first.kind === "repeat"
            ? matchEntries(template, 0, first, left.end, 1, "", env, taken)
            : matchTemplate(template, 1, left.end, false, "", env, taken);
        for (const match of rest) {
          // A list of one entry is the entry itself; it must take in more text to be a new value.
          if (match.lineStart || match.pos === left.end) continue;
          let next: Candidate;
          const operator = template.tight ? null : operatorIn(template, match.taken);
          if (template.tight) {
            next = { ...finish(template, match.taken, env), end: match.pos, rank: Infinity };
          } else if (operator) {
            // Too weak for this place: it is read where the value around it goes on (`a * b` + c).
            if (!allows(bound, operator.rank, operator.sign)) continue;
            if (!allows(operator.bound(first.number), left.rank)) {
              // `1 < x < 5`, or a sign without a rank beside one with a rank: nothing says what belongs together.
              if (left.rank === operator.rank || left.rank === -Infinity) fail(left.end, NO_ORDER);
              continue;
            }
            next = { ...finish(template, match.taken, env), end: match.pos, rank: operator.rank };
          } else {
            // A sign without a rank: only where any value fits, and after `a + b` only `+` again reads on.
            if (!allows(bound, -Infinity)) continue;
            const sign = `${template.def.identifier}|${JSON.stringify(match.taken.fields)}`;
            if (left.rank !== Infinity && left.open !== sign) {
              fail(left.end, NO_ORDER);
              continue;
            }
            next = { ...finish(template, match.taken, env), end: match.pos, rank: -Infinity, open: sign };
          }
          const same = found.some((other) => other.end === next.end && other.def === next.def && other.penalty <= next.penalty);
          if (!same) found.push(next);
        }
      }
    }
    // One reading per end, of those that fit the slot: the one whose names fit best, else the first found.
    const best = new Map<number, Candidate>();
    for (const candidate of found) {
      if (slot && !fitsValue(slot, candidate.def)) continue;
      const other = best.get(candidate.end);
      if (!other || candidate.penalty < other.penalty) best.set(candidate.end, candidate);
    }
    const result = [...best.values()].sort((a, b) => b.end - a.end);
    values.set(memo, result);
    return result;
  }

  // ── Statements ──────────────────────────────────────────

  /**
   * The statements on the lines from a position on that are indented by
   * `indent`, as stacks of blocks: one stack in a slot, and at the top level
   * a new stack wherever a block cannot hang below the one before it.
   */
  function readStatements(
    pos: number,
    indent: string,
    slot: MorphicInputSlotDefinition | null,
    env: Env,
  ): { stacks: Read[]; pos: number } {
    const memo = `${pos}|${indent}|${slotKey(slot)}|${parents.length}:${JSON.stringify(parents.at(-1) ?? {})}|${env.key}`;
    const read = bodies.get(memo);
    if (read) return read;
    const stacks: Read[] = [];
    let last: { read: Read; state: BlockState } | undefined;
    const names: string[] = [];
    for (;;) {
      pos = skipBlankLines(pos);
      if (pos >= text.length) break;
      const lead = /^[ \t]*/.exec(text.slice(pos, lineEnd(pos)))![0];
      if (lead !== indent) {
        if (lead.length > indent.length || !indent.startsWith(lead)) fail(pos, "The line is indented differently from the lines around it.");
        break;
      }
      const start = pos + indent.length;
      // What a language writes into a body that is empty (`pass`): the only line of the body.
      if (slot && stacks.length === 0 && settings.emptyStatement && text.slice(start, lineEnd(start)).trim() === settings.emptyStatement) {
        const after = skipBlankLines(Math.min(lineEnd(start) + 1, text.length));
        if (after >= text.length || /^[ \t]*/.exec(text.slice(after, lineEnd(after)))![0] !== indent) {
          pos = after;
          break;
        }
      }
      const known = extend(env, names);
      const above = last?.read.def;
      let best: { read: Read; pos: number; joins: boolean; score: number } | undefined;
      const offer = (read: Read, end: number, lineStart: boolean): void => {
        if (!lineStart && !atLineEnd(end)) return;
        const joins = above ? fitsBelow(above, read.def, slot) : slot ? fitsStatement(slot, read.def) : false;
        // In a slot every block hangs in the stack; at the top level one that does not starts a new stack.
        if (slot && !joins) return;
        // A block that belongs into its own kind of slot (a class field) is the last choice outside one.
        const score = read.penalty + (!slot && read.def.strict ? 100 : 0);
        if (!best || score < best.score) best = { read, pos: lineStart ? end : Math.min(lineEnd(end) + 1, text.length), joins, score };
      };
      for (const template of statements) {
        for (const match of matchWithBodies(template, 0, start, false, indent, known, empty)) {
          offer(finish(template, match.taken, known), match.pos, match.lineStart);
        }
      }
      // A value on a line of its own, at the top level only.
      if (!best && !slot) for (const value of valuesAt(start, WHOLE, known)) offer(value, value.end, false);
      if (!best) {
        fail(start, `No block writes "${text.slice(start, lineEnd(start)).trim()}".`);
        break;
      }
      const chosen: { read: Read; pos: number; joins: boolean; score: number } = best;
      if (chosen.joins && last) {
        last.state.next = { block: chosen.read.state };
        const top = stacks[stacks.length - 1]!;
        top.penalty += chosen.read.penalty;
        top.count += chosen.read.count;
        top.declares.push(...chosen.read.declares);
      } else {
        stacks.push({ ...chosen.read, declares: [...chosen.read.declares] });
      }
      last = { read: chosen.read, state: chosen.read.state };
      names.push(...chosen.read.declares);
      pos = chosen.pos;
    }
    const result = { stacks, pos };
    bodies.set(memo, result);
    return result;
  }

  // Read twice: the first time finds the names the text declares anywhere,
  // so the second can tell a call of a function written further down from a
  // name nothing declares.
  const top: Env = { has: () => false, key: "" };
  readStatements(0, "", null, top);
  later = new Set(declared);
  values.clear();
  bodies.clear();
  farthest = { pos: -1, message: "" };
  hint = { pos: -1, message: "" };
  const result = readStatements(0, "", null, top);
  if (skipBlankLines(result.pos) < text.length) {
    const line = lineOf(Math.max(farthest.pos, result.pos));
    const written = text.split("\n")[line - 1]?.trim() ?? "";
    return { ok: false, line, message: lineOf(hint.pos) === line ? hint.message : `No block writes "${written}".` };
  }
  return { ok: true, stacks: result.stacks.map((read) => read.state), blocks: result.stacks.reduce((sum, read) => sum + read.count, 0) };

  // ── Building the templates ──────────────────────────────

  function buildTemplate(def: MorphicBlockDefinition, name: string): Template | null {
    const written = def.elements[name];
    if (written === undefined) return null;
    const parsed = parseTemplate(written).filter((token) => token.kind !== "image");
    const isValue = def.output !== undefined && def.output !== false;
    const tokens: Token[] = [];
    for (let index = 0; index < parsed.length; index++) {
      const token = parsed[index]!;
      if (token.kind === "text") tokens.push({ kind: "text", value: token.value });
      else if (token.kind === "field") tokens.push({ kind: "field", name: token.name, field: def.fields?.[token.name] });
      else if (token.kind === "valueType") {
        tokens.push({ kind: "skip", types: true, slotName: slotInputName(def.inputSlots?.[String(token.index)], token.index) });
      }
      else if (token.kind === "parentField") tokens.push({ kind: "skip", types: false, field: token.name });
      else if (token.kind === "placeholder") {
        const slot = def.inputSlots?.[String(token.index)] ?? {};
        const slotName = slotInputName(slot, token.index);
        if (slot.kind === "statement") {
          // The body starts on a line of its own; the spaces in front of `%N` are its indentation.
          const before = tokens[tokens.length - 1];
          const lead = before?.kind === "text" ? /\n([ \t]*)$/.exec(before.value) : null;
          if (!lead || before?.kind !== "text") return null;
          before.value = before.value.slice(0, before.value.length - lead[1]!.length);
          tokens.push({ kind: "body", name: slotName, slot, indent: lead[1]! });
          continue;
        }
        // As the writer brackets: the text around a slot says what it takes.
        if (isRepeating(slot)) {
          const separator = repeatSeparator(slot, name);
          tokens.push({ kind: "repeat", name: slotName, number: token.index, slot, separator, bound: separatorComposes(separator) ? ATOM : WHOLE });
        } else {
          tokens.push({ kind: "value", name: slotName, number: token.index, slot, bound: slotBound(parsed, index, !isValue, settings.operators) });
        }
      }
    }
    if (tokens.length === 0) return null;
    const first = tokens[0]!;
    const second = tokens[1];
    const continues = isValue && (first.kind === "value" || first.kind === "repeat");
    const form = operatorForm(parsed, def, name);
    // `%1+%2` is an operator all the same, where its sign has a rank.
    const ranked = form?.kind === "infix" && form.sign.every((part) => "text" in part) && rankOperator(form, () => undefined, settings.operators);
    return {
      def,
      tokens,
      isValue,
      continues,
      form,
      tight: continues && !ranked && second?.kind === "text" && second.value[0] !== " " && second.value[0] !== "\t",
      weight: tokens.reduce((sum, token) => sum + (token.kind === "text" ? token.value.replace(/\s/g, "").length : 0), 0),
    };
  }
}

/** The names known at a point of the text, with more of them added. */
function extend(env: Env, more: string[]): Env {
  if (more.length === 0) return env;
  const added = new Set(more);
  return { has: (key) => added.has(key) || env.has(key), key: `${env.key}|${[...added].sort().join(",")}` };
}

/** What decides whether a value or statement fits a slot, as a key. */
function slotKey(slot: MorphicInputSlotDefinition | null | undefined): string {
  return slot ? `${JSON.stringify(slot.check ?? null)}${slot.strict ? "!" : ""}` : "-";
}

/** What each choice of a dropdown reads as in an element, the longest text first. */
function optionTexts(options: MorphicDropdownOption[], element: string): { value: string; shown: string }[] {
  return options
    .map((option) => {
      if (typeof option === "string") return { value: option, shown: option };
      if (Array.isArray(option)) return { value: option[0], shown: option[0] };
      return { value: option.value, shown: option.display?.[element] ?? option.value };
    })
    .sort((a, b) => b.shown.length - a.shown.length);
}

/** The text an empty value slot is written as (see `emptySlotMarker` in template-codegen.ts). */
function emptyMarker(check: string | string[] | undefined): string {
  const first = Array.isArray(check) ? check[0] : check;
  if (!first) return "[VALUE]";
  const label: Record<string, string> = { Number: "NUMBER", String: "TEXT", Boolean: "BOOL" };
  return `[${label[first] ?? first.toUpperCase()}]`;
}

// ── Connections, as Blockly and the strict rules decide them ──

const checksOf = (spec: MorphicConnectionSpec | string | string[] | undefined): string[] | null =>
  typeof spec === "string" ? [spec] : Array.isArray(spec) ? spec : null;
const overlap = (a: string[] | null, b: string[] | null): boolean => !a || !b || a.some((check) => b.includes(check));
const matches = (a: string[] | null, b: string[] | null): boolean => !!a && !!b && a.some((check) => b.includes(check));

function fitsValue(slot: MorphicInputSlotDefinition, value: MorphicBlockDefinition): boolean {
  if (value.output === undefined || value.output === false) return false;
  const wanted = checksOf(slot.check);
  const offered = checksOf(value.output);
  return slot.strict || value.strict ? matches(wanted, offered) : overlap(wanted, offered);
}

function fitsStatement(slot: MorphicInputSlotDefinition, block: MorphicBlockDefinition): boolean {
  if (!block.previousStatement) return false;
  const wanted = checksOf(slot.check);
  const offered = checksOf(block.previousStatement);
  return slot.strict || block.strict ? matches(wanted, offered) : overlap(wanted, offered);
}

function fitsBelow(above: MorphicBlockDefinition, block: MorphicBlockDefinition, slot: MorphicInputSlotDefinition | null): boolean {
  if (!above.nextStatement || !block.previousStatement) return false;
  if (slot?.strict && !matches(checksOf(slot.check), checksOf(block.previousStatement))) return false;
  const upper = checksOf(above.nextStatement);
  const lower = checksOf(block.previousStatement);
  return block.strict ? matches(upper, lower) : overlap(upper, lower);
}
