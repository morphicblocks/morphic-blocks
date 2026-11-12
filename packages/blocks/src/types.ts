import type {
  MorphicBehaviorDefinition,
  MorphicBlockDefinition,
  MorphicCodeElementConfig,
} from "morphic-blocks";

/**
 * A standard block: what it is (slots, fields, connections) and what it does
 * (`behavior`, the JavaScript it runs as). How it is written is not here: each
 * language adds its own template.
 */
export type StandardBlock = Omit<MorphicBlockDefinition, "identifier" | "elements"> & {
  behavior: MorphicBehaviorDefinition;
};

/** A set of standard blocks, by identifier. */
export type StandardBlocks = Record<string, StandardBlock>;

/**
 * A language: the settings of its code element and how it writes each
 * standard block. An own language has the same shape.
 */
export interface Language {
  /** Quotes, type names, empty slot defaults, highlighting (the `code.<element>` settings). */
  code?: MorphicCodeElementConfig;
  /** The template of each standard block, by identifier: `{ "print": "print(%1)" }`. */
  blocks: Record<string, string>;
  /**
   * How dropdown choices read in this language, by `"block.FIELD"` and value:
   * `{ "boolean.BOOL": { "true": "True", "false": "False" } }`.
   */
  display?: Record<string, Record<string, string>>;
  /**
   * What stands between the entries of a repeating slot, by `"block.SLOT"`,
   * where it is not `, `: `{ "text_join.PARTS": " + " }`.
   */
  separators?: Record<string, string>;
}
