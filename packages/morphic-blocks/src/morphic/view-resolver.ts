import { resolveElementType } from "./element-types";
import type {
  MorphicBlockDefinition,
  MorphicElementTypeEntry,
  MorphicModeDefinition,
  MorphicModeName,
  MorphicResolvedView,
} from "./types";

/**
 * Source element of a mode: the mode's explicit `primarySource` when set,
 * else the first element in `mode.elements` whose type is "code". This is the
 * element a codespace or preview renders when the mode is assigned to it.
 */
export function resolveModeSourceElement(
  mode: MorphicModeDefinition,
  elementTypes: Record<string, MorphicElementTypeEntry> = {},
): string | undefined {
  if (mode.primarySource) return mode.primarySource;
  for (const name of mode.elements) {
    if (resolveElementType(elementTypes[name]) === "code") return name;
  }
  return undefined;
}

/**
 * Resolves the workspace template for a block in a given mode.
 *
 * Resolution order:
 * 0. Mode's explicit `primarySource` element (when set)
 * 1. First element in the mode's `elements` array whose type is "code"
 * 2. First element in the block definition whose type is "code"
 * 3. Element literally named "block" (backward-compat fallback)
 * 4. First element in the block definition
 */
export function resolveBlockView(
  definition: MorphicBlockDefinition,
  mode: MorphicModeName,
  elementTypes: Record<string, MorphicElementTypeEntry> = {},
  modeDefs: MorphicModeDefinition[] = [],
): MorphicResolvedView {
  const elements = definition.elements;
  const modeDef = modeDefs.find((m) => m.name === mode);

  // Strategy 0: explicit primarySource declared on the mode
  if (modeDef?.primarySource) {
    const explicit = elements[modeDef.primarySource];
    if (explicit !== undefined) {
      return { mode, template: explicit, elementName: modeDef.primarySource, inputSlots: definition.inputSlots };
    }
  }

  // Strategy 1: first type:code element listed in this mode's elements array
  if (modeDef) {
    for (const name of modeDef.elements) {
      if (resolveElementType(elementTypes[name]) === "code" && elements[name] !== undefined) {
        return { mode, template: elements[name], elementName: name, inputSlots: definition.inputSlots };
      }
    }
  }

  // Strategy 2: first type:code element anywhere in the definition
  for (const [name, content] of Object.entries(elements)) {
    if (resolveElementType(elementTypes[name]) === "code") {
      return { mode, template: content, elementName: name, inputSlots: definition.inputSlots };
    }
  }

  // Strategy 3: backward-compat — element literally named "block"
  if (elements["block"] !== undefined) {
    return { mode, template: elements["block"], elementName: "block", inputSlots: definition.inputSlots };
  }

  // Strategy 4: first element
  const firstEntry = Object.entries(elements)[0];
  if (firstEntry === undefined) {
    throw new Error(`Block "${definition.identifier}" does not have any elements.`);
  }
  return { mode, template: firstEntry[1], elementName: firstEntry[0], inputSlots: definition.inputSlots };
}
