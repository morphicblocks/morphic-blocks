import type {
  MorphicBlockDefinition,
  MorphicElementType,
  MorphicElementTypeConfig,
  MorphicElementTypeEntry,
  MorphicEmptyDefaultConfig,
  MorphicInputSlotDefinition,
} from "./types";

/** Get the rendering type of an entry, normalising bare strings vs config. */
export function resolveElementType(
  entry: MorphicElementTypeEntry | undefined,
): MorphicElementType | undefined {
  if (entry === undefined) return undefined;
  return typeof entry === "string" ? entry : entry.type;
}

/**
 * Resolve the empty-state default config for a value slot. Honours the
 * priority chain: per-slot `default` (highest) → elementType `empty[check]`.
 * Returns undefined when nothing is configured — callers should treat that
 * as "show the codespace marker / empty workspace socket."
 */
export function resolveDefaultConfig(
  slot: MorphicInputSlotDefinition | undefined,
  elementEntry: MorphicElementTypeEntry | undefined,
): MorphicEmptyDefaultConfig | undefined {
  if (slot?.default) return slot.default;
  if (!slot?.check) return undefined;
  if (!elementEntry || typeof elementEntry === "string") return undefined;
  const empty = (elementEntry as MorphicElementTypeConfig).empty;
  if (!empty) return undefined;
  const checkStr = Array.isArray(slot.check) ? slot.check[0] : slot.check;
  if (!checkStr) return undefined;
  return empty[checkStr];
}

/**
 * Backward-compatible string fallback used by `template-codegen` while the
 * codespace marker work (Day 4) is pending. Pulls a representative literal
 * from the configured `fieldValues` so the codespace can keep emitting the
 * old `print(0)` / `print("text")` style output during the schema
 * transition. Returns undefined when no default is configured for the slot.
 *
 * Once the codespace marker rendering lands this helper goes away — callers
 * will switch to `resolveDefaultConfig` and emit the marker themselves.
 */
export function resolveEmptyDefault(
  entry: MorphicElementTypeEntry | undefined,
  check: string | string[] | undefined,
  blockDefinition?: MorphicBlockDefinition,
  inputName?: string,
): string | undefined {
  // Block-level override first: walk inputSlots looking for a matching name.
  if (blockDefinition?.inputSlots && inputName) {
    for (const slot of Object.values(blockDefinition.inputSlots)) {
      if (slot?.name === inputName && slot.default) {
        return firstFieldValue(slot.default);
      }
    }
  }
  if (!entry || typeof entry === "string") return undefined;
  const empty = (entry as MorphicElementTypeConfig).empty;
  if (!empty) return undefined;
  const checkStr = Array.isArray(check) ? check[0] : check;
  if (!checkStr) return undefined;
  const config = empty[checkStr];
  return config ? firstFieldValue(config) : undefined;
}

function firstFieldValue(config: MorphicEmptyDefaultConfig): string | undefined {
  if (!config.fieldValues) return undefined;
  const values = Object.values(config.fieldValues);
  return values.length > 0 ? values[0] : undefined;
}
