import type * as Blockly from "blockly";
import type { MorphicElementTypeWithCode } from "./element-types";
import type { MorphicElementTypeEntry, MorphicInputSlotDefinition } from "./types";

/** Name prefix of the label a `%1:type` token becomes, followed by the slot number. */
export const VALUE_TYPE_FIELD = "MORPHIC_TYPE_";

/** Whether a field is the label of a `%1:type` token, not one of the block's own fields. */
export const isValueTypeLabel = (field: Blockly.Field): boolean => !!field.name?.startsWith(VALUE_TYPE_FIELD);

/**
 * The name `%1:type` writes for the value in `slot`: the element's
 * `code.types` entry for the value's type (its block's output check, or the
 * slot's own check while the slot is empty and accepts one type), else
 * `default`, else nothing.
 */
export function valueTypeName(
  block: Blockly.Block,
  slot: MorphicInputSlotDefinition | undefined,
  elementEntry: MorphicElementTypeEntry | undefined,
): string {
  const types = typeof elementEntry === "object" ? (elementEntry as MorphicElementTypeWithCode).types : undefined;
  if (!types) return "";
  const target = slot?.name ? block.getInput(slot.name)?.connection?.targetBlock() : null;
  const slotChecks = typeof slot?.check === "string" ? [slot.check] : (slot?.check ?? []);
  const checks = target ? (target.outputConnection?.getCheck() ?? []) : slotChecks.length === 1 ? slotChecks : [];
  for (const check of checks) {
    const name = types[check];
    if (name !== undefined) return name;
  }
  return types.default ?? "";
}
