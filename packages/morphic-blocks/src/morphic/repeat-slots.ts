import type * as Blockly from "blockly";
import type { MorphicBlockDefinition, MorphicInputSlotDefinition } from "./types";

/**
 * Repeating slots (`"repeat": { "separator": ", " }` on a value slot): one
 * `%1` that holds any number of values, e.g. the parameters of a function or
 * the items of a list. A block has one Blockly input per entry, named after
 * the slot (`PARAMS_0`, `PARAMS_1`); how many it has is kept on the block and
 * saved with the program.
 */

type RepeatingBlock = Blockly.Block & { __morphicRepeat?: Map<string, number> };

/** What a saved block holds about its repeating slots: entries per slot name. */
export interface MorphicRepeatState {
  repeat: Record<string, number>;
}

export function isRepeating(slot: MorphicInputSlotDefinition | undefined): boolean {
  return !!slot?.repeat && (slot.kind ?? "value") === "value";
}

/** The Blockly input name of a slot: its `name`, or `ARG<n>` after its placeholder. */
export function slotInputName(slot: MorphicInputSlotDefinition | undefined, placeholderIndex: number | string): string {
  return slot?.name ?? `ARG${placeholderIndex}`;
}

/** The Blockly input name of one entry of a repeating slot. */
export function repeatInputName(slotName: string, index: number): string {
  return `${slotName}_${index}`;
}

/** A block's repeating slots, by input name. */
export function repeatingSlots(definition: MorphicBlockDefinition): Map<string, MorphicInputSlotDefinition> {
  const slots = new Map<string, MorphicInputSlotDefinition>();
  for (const [index, slot] of Object.entries(definition.inputSlots ?? {})) {
    if (slot && isRepeating(slot)) slots.set(slotInputName(slot, index), slot);
  }
  return slots;
}

/** How many entries a repeating slot has on a block; a new block starts with `repeat.count` (1). */
export function repeatCount(block: Blockly.Block, slotName: string, slot: MorphicInputSlotDefinition): number {
  return (block as RepeatingBlock).__morphicRepeat?.get(slotName) ?? Math.max(0, Math.floor(slot.repeat?.count ?? 1));
}

export function setRepeatCount(block: Blockly.Block, slotName: string, count: number): void {
  ((block as RepeatingBlock).__morphicRepeat ??= new Map()).set(slotName, Math.max(0, Math.floor(count)));
}

/** The input names of a repeating slot's entries on a block, in order. */
export function repeatEntries(block: Blockly.Block, slotName: string, slot: MorphicInputSlotDefinition): string[] {
  return Array.from({ length: repeatCount(block, slotName, slot) }, (_, index) => repeatInputName(slotName, index));
}

/** What is written between two entries in an element: `repeat.separator` (a text, or one per element), `, ` by default. */
export function repeatSeparator(slot: MorphicInputSlotDefinition, elementName: string | undefined): string {
  const separator = slot.repeat?.separator;
  if (typeof separator === "string") return separator;
  return (elementName !== undefined ? separator?.[elementName] : undefined) ?? ", ";
}

/**
 * Whether the entries are operands of an operator (`" + "`), so a composed
 * entry needs brackets, or simply listed (`, `), where it does not.
 */
export function separatorComposes(separator: string): boolean {
  return /[^\s,;]/.test(separator);
}

/** The slot an input belongs to: the input of a plain slot, or an entry of a repeating one. */
export function slotOfInput(
  definition: MorphicBlockDefinition,
  inputName: string,
): MorphicInputSlotDefinition | undefined {
  for (const [index, slot] of Object.entries(definition.inputSlots ?? {})) {
    const name = slotInputName(slot, index);
    if (name === inputName) return slot;
    if (slot && isRepeating(slot) && inputName.startsWith(`${name}_`) && /^\d+$/.test(inputName.slice(name.length + 1))) return slot;
  }
  return undefined;
}

/** The state Blockly saves with a block that has repeating slots, `null` for one without. */
export function saveRepeatState(block: Blockly.Block, definition: MorphicBlockDefinition): MorphicRepeatState | null {
  const slots = repeatingSlots(definition);
  if (slots.size === 0) return null;
  const repeat: Record<string, number> = {};
  for (const [name, slot] of slots) repeat[name] = repeatCount(block, name, slot);
  return { repeat };
}

/** Take the counts of a saved state; returns whether any count changed. */
export function loadRepeatState(block: Blockly.Block, definition: MorphicBlockDefinition, state: unknown): boolean {
  const saved = (state as Partial<MorphicRepeatState> | null)?.repeat;
  if (!saved || typeof saved !== "object") return false;
  let changed = false;
  for (const [name, slot] of repeatingSlots(definition)) {
    const count = saved[name];
    if (typeof count !== "number" || count === repeatCount(block, name, slot)) continue;
    setRepeatCount(block, name, count);
    changed = true;
  }
  return changed;
}
