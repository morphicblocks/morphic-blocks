import { isRepeating, repeatSeparator } from "./repeat-slots";
import { slotSides, type MorphicTemplateToken } from "./template";
import type { MorphicBlockDefinition, MorphicCodeElementConfig, MorphicOperatorOrder } from "./types";

/**
 * The order of operators in text. Blocks need none: a block in a slot is one
 * value. Text does: `2 + 3 * 4` says which part belongs together only through
 * the order of `+` and `*`. The writer (template-codegen.ts) and the reader
 * (text-to-blocks.ts) ask the same questions here, so what one writes without
 * brackets the other reads as the same blocks.
 *
 * An operator is known by its template: two values with a sign between them
 * (`%1 + %2`, `%1 %OP %2`), a sign in front of one value (`not %1`, `-%1`), or
 * a list of values with the sign as separator. The sign, as the language
 * writes it, has a rank; a sign without one keeps the rule there was before
 * ranks: brackets around every value built from others.
 */

type OperatorSettings = MorphicCodeElementConfig["operators"];
type Direction = "left" | "right" | "none" | "any";

/** No sign chains comparisons the same way in every language, so they take brackets. */
const COMPARISON: MorphicOperatorOrder = { rank: 40, direction: "none" };

/** What most languages share. The numbers leave room for a language's own signs. */
const DEFAULT_ORDER: Record<string, MorphicOperatorOrder> = {
  "||": 10,
  or: 10,
  "&&": 20,
  and: 20,
  not: { prefix: 30 },
  "==": COMPARISON,
  "!=": COMPARISON,
  "===": COMPARISON,
  "!==": COMPARISON,
  "<": COMPARISON,
  "<=": COMPARISON,
  ">": COMPARISON,
  ">=": COMPARISON,
  "+": { rank: 50, prefix: 70 },
  "-": { rank: 50, prefix: 70 },
  "*": 60,
  "/": 60,
  "%": 60,
  "//": 60,
  "!": { prefix: 70 },
  "**": { rank: 80, direction: "right" },
};

/** What a sign's entry says, the language's own on top of the shared one. */
function orderOf(sign: string, settings: OperatorSettings): Exclude<MorphicOperatorOrder, number> | null {
  if (settings === false) return null;
  const own = settings?.[sign];
  if (own === null) return null;
  const shared = Object.hasOwn(DEFAULT_ORDER, sign) ? DEFAULT_ORDER[sign] : undefined;
  if (own === undefined && shared === undefined) return null;
  const spread = (order: MorphicOperatorOrder | undefined) => (typeof order === "number" ? { rank: order } : (order ?? {}));
  return { ...spread(shared), ...spread(own) };
}

/**
 * What may stand in a slot without brackets: a value of this rank, or
 * (`above`) only a higher one. `sign` names an operator that stands free
 * there all the same: one whose grouping does not matter, beside itself.
 */
export interface OperandBound {
  rank: number;
  above: boolean;
  sign?: string;
}

/** A slot that takes any value as it is: nothing around it binds. */
export const WHOLE: OperandBound = { rank: -Infinity, above: false };
/** A slot that takes only a value that is one piece: a name, a number, a call. */
export const ATOM: OperandBound = { rank: Infinity, above: false };

export function allows(bound: OperandBound, rank: number, sign?: string): boolean {
  if (sign !== undefined && sign === bound.sign) return true;
  return bound.above ? rank > bound.rank : rank >= bound.rank;
}

/** What both bounds allow: a slot with an operator on each side. */
function stricter(a: OperandBound, b: OperandBound): OperandBound {
  if (a.rank !== b.rank) return a.rank > b.rank ? a : b;
  if (a.above !== b.above) return a.above ? a : b;
  return a.sign === b.sign ? a : { rank: a.rank, above: a.above };
}

type SignPart = { text: string } | { field: string };

/** A template that is an operator, with the slot numbers of its values. */
export type OperatorForm =
  | { kind: "infix"; left: number; right: number; sign: SignPart[] }
  | { kind: "prefix"; slot: number; sign: SignPart[] }
  | { kind: "chain"; slot: number; sign: string };

/** Whether a value block's template is an operator, and of which shape. */
export function operatorForm(
  tokens: MorphicTemplateToken[],
  definition: MorphicBlockDefinition,
  element: string | undefined,
): OperatorForm | null {
  if (definition.output === undefined || definition.output === false) return null;
  const written = tokens.filter((token) => token.kind !== "image");
  const slotOf = (token: MorphicTemplateToken | undefined) =>
    token?.kind === "placeholder" ? (definition.inputSlots?.[String(token.index)] ?? {}) : undefined;
  const valueSlot = (token: MorphicTemplateToken | undefined): number | null => {
    const slot = slotOf(token);
    return token?.kind === "placeholder" && slot && (slot.kind ?? "value") === "value" && !isRepeating(slot) ? token.index : null;
  };

  const first = written[0];
  const last = written.at(-1);
  if (written.length === 1) {
    const slot = slotOf(first);
    if (first?.kind !== "placeholder" || !slot || !isRepeating(slot)) return null;
    const sign = repeatSeparator(slot, element).trim();
    return sign ? { kind: "chain", slot: first.index, sign } : null;
  }

  const right = valueSlot(last);
  if (right === null) return null;
  const left = valueSlot(first);
  const between = written.slice(left === null ? 0 : 1, -1);
  if (between.length === 0) return null;
  const sign: SignPart[] = [];
  for (const token of between) {
    if (token.kind === "text") sign.push({ text: token.value });
    else if (token.kind === "field") sign.push({ field: token.name });
    else return null;
  }
  if (left === null) return { kind: "prefix", slot: right, sign };
  return left === right ? null : { kind: "infix", left, right, sign };
}

/** An operator whose sign has a rank: the sign, its rank, and what each of its slots takes. */
export interface RankedOperator {
  sign: string;
  rank: number;
  bound(slot: number): OperandBound;
}

/**
 * The rank of an operator as it is written right now. `shown` gives the text
 * a field shows (`%OP` as `and`); `null` when the sign has no rank.
 */
export function rankOperator(
  form: OperatorForm,
  shown: (field: string) => string | undefined,
  settings: OperatorSettings,
): RankedOperator | null {
  let sign: string;
  if (form.kind === "chain") sign = form.sign;
  else {
    const parts = form.sign.map((part) => ("text" in part ? part.text : shown(part.field)));
    if (parts.some((part) => part === undefined)) return null;
    sign = parts.join("").trim().replace(/\s+/g, " ");
  }
  const order = orderOf(sign, settings);
  if (!order) return null;

  if (form.kind === "prefix") {
    const rank = order.prefix;
    if (typeof rank !== "number") return null;
    // `not not x`, `not a == b`: whatever binds at least as tightly stands free behind it.
    return { sign, rank, bound: () => ({ rank, above: false }) };
  }
  const rank = order.rank;
  if (typeof rank !== "number") return null;
  const direction: Direction = order.direction ?? "left";
  // Where the grouping does not matter, the sign stands free beside itself: `a << (b << c)` is `a << b << c`.
  const free = direction === "any" ? { sign } : {};
  if (form.kind === "chain") {
    // Each entry is its own value; one of the same rank would read as two entries.
    return { sign, rank, bound: () => ({ rank, above: true, ...free }) };
  }
  // The side the operator reads from takes the same rank again: `(a - b) - c` is `a - b - c`.
  return {
    sign,
    rank,
    bound: (slot) =>
      slot === form.left
        ? { rank, above: direction === "right" || direction === "none" }
        : { rank, above: direction !== "right", ...free },
  };
}

const WORD_END = /[\p{L}\p{N}_$]$/u;
/** A sign at the end or the start of a text: a word, or a run of characters that are no brackets, commas or quotes. */
const SIGN_END = /(?:[\p{L}\p{N}_$]+|[^\s\p{L}\p{N}_$()[\]{},;"'`]+)$/u;
const SIGN_START = /^(?:[\p{L}\p{N}_$]+|[^\s\p{L}\p{N}_$()[\]{},;"'`]+)/u;

/**
 * What a slot takes without brackets in a template that is no operator
 * itself, from the text right around it. A sign with a rank there makes the
 * slot its operand (`std::cout << %1 << std::endl;`, `i < %1;`, `if not %1:`);
 * without one, the slot takes any value where it stands free (`max(%1, %2)`,
 * `return %1`) and one piece only where the text binds to it (`%1.length`).
 */
export function slotBound(
  tokens: MorphicTemplateToken[],
  index: number,
  statement: boolean,
  settings: OperatorSettings,
): OperandBound {
  const written: MorphicTemplateToken[] = tokens.filter((token) => token.kind !== "image");
  const at = written.indexOf(tokens[index]!);
  const free = slotSides(tokens, index, statement);
  const before = signBefore(written, at, settings) ?? (free.before ? WHOLE : ATOM);
  const after = signAfter(written, at, settings) ?? (free.after ? WHOLE : ATOM);
  return stricter(before, after);
}

/** The slot as the value behind a sign: `x + %1`, `-%1`. */
function signBefore(written: MorphicTemplateToken[], at: number, settings: OperatorSettings): OperandBound | null {
  const token = written[at - 1];
  if (token?.kind !== "text") return null;
  const text = token.value.replace(/[ \t]+$/, "");
  const sign = SIGN_END.exec(text)?.[0];
  const order = sign ? orderOf(sign, settings) : null;
  if (!sign || !order) return null;

  const rest = text.slice(0, text.length - sign.length).trimEnd();
  // Between two values the sign stands when a value ends in front of it: a slot, a field, a bracket, a quote.
  const value = rest === "" ? at >= 2 : /[)\]}"'`]$/.test(rest);
  // After a word nothing says which: `x - %1`, `return -%1`. The slot takes what both allow.
  const unsure = WORD_END.test(rest);
  const direction: Direction = order.direction ?? "left";
  const between: OperandBound | null =
    typeof order.rank === "number" && (value || unsure)
      ? { rank: order.rank, above: direction !== "right", ...(direction === "any" ? { sign } : {}) }
      : null;
  const front: OperandBound | null =
    typeof order.prefix === "number" && (!value || unsure) ? { rank: order.prefix, above: false } : null;
  return between && front ? stricter(between, front) : (between ?? front);
}

/** The slot as the value in front of a sign: `%1 + x`. */
function signAfter(written: MorphicTemplateToken[], at: number, settings: OperatorSettings): OperandBound | null {
  const token = written[at + 1];
  if (token?.kind !== "text") return null;
  const sign = SIGN_START.exec(token.value.replace(/^[ \t]+/, ""))?.[0];
  const order = sign ? orderOf(sign, settings) : null;
  if (typeof order?.rank !== "number") return null;
  return { rank: order.rank, above: order.direction === "right" || order.direction === "none" };
}
