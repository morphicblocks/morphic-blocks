import type * as Blockly from "blockly";

/**
 * The field a `%parent.NAME` token shows: the field of that name on the
 * nearest block around this one that has it (the class around a method), or
 * `null` when no block around it has one.
 */
export function findParentField(block: Blockly.Block, name: string): Blockly.Field | null {
  for (let parent = block.getSurroundParent(); parent; parent = parent.getSurroundParent()) {
    const field = parent.getField(name);
    if (field) return field;
  }
  return null;
}
