/**
 * Morphic blocks are registered with Blockly under a namespaced type
 * (`morphic:<identifier>`) so a developer's identifier can never collide with
 * a Blockly built-in (e.g. naming a block `logic_boolean` would otherwise
 * clobber Blockly's stock block and break shadows / connection checks).
 *
 * The namespace is an internal Blockly-type detail: `definitions.json` and
 * `behaviors.ts` are written with clean identifiers, and the framework
 * translates at the boundaries (registration, `newBlock`, toolbox, drag
 * payloads, codegen, shadow/placeholder resolution).
 */
export const MORPHIC_TYPE_PREFIX = "morphic:";

/** Clean identifier → namespaced Blockly type (`text_print` → `morphic:text_print`). */
export function toBlocklyType(identifier: string): string {
  return MORPHIC_TYPE_PREFIX + identifier;
}

/**
 * Namespaced Blockly type → clean identifier (`morphic:text_print` →
 * `text_print`). Returns the input unchanged when it isn't namespaced (e.g. a
 * Blockly stock type such as `math_number`), so it is safe to call on any
 * `block.type`.
 */
export function toCleanId(blocklyType: string): string {
  return blocklyType.startsWith(MORPHIC_TYPE_PREFIX)
    ? blocklyType.slice(MORPHIC_TYPE_PREFIX.length)
    : blocklyType;
}

/** Whether a Blockly type is a namespaced morphic type. */
export function isMorphicType(blocklyType: string): boolean {
  return blocklyType.startsWith(MORPHIC_TYPE_PREFIX);
}

/**
 * Resolve a developer-facing block reference — from a toolbox entry, a
 * `shadow`/`placeholder` default, or a drag payload — to its registered Blockly
 * type. A reference is morphic *if and only if* its clean id is in the
 * definitions map: in that case it is namespaced (`text_print` →
 * `morphic:text_print`); otherwise it is treated as a Blockly stock type and
 * passes through unchanged (`math_number` stays `math_number`).
 */
export function resolveBlocklyType(
  ref: string,
  definitions: { has(key: string): boolean },
): string {
  return definitions.has(ref) ? toBlocklyType(ref) : ref;
}
