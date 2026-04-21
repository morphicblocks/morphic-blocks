import type {
  MorphicBlockDefinition,
  MorphicElementType,
  MorphicModeDefinition,
  MorphicModeName,
  MorphicResolvedView,
} from "./types";

/**
 * Resolves the workspace template for a block in a given mode.
 *
 * Resolution order:
 * 1. First element in the mode's `elements` array whose type is "code"
 * 2. First element in the block definition whose type is "code"
 * 3. Element literally named "block" (backward-compat fallback)
 * 4. First element in the block definition
 */
export function resolveBlockView(
  definition: MorphicBlockDefinition,
  mode: MorphicModeName,
  elementTypes: Record<string, MorphicElementType> = {},
  modeDefs: MorphicModeDefinition[] = [],
): MorphicResolvedView {
  const elements = definition.elements;

  // Strategy 1: first type:code element listed in this mode's elements array
  const modeDef = modeDefs.find((m) => m.name === mode);
  if (modeDef) {
    for (const name of modeDef.elements) {
      if (elementTypes[name] === "code" && elements[name] !== undefined) {
        return { mode, template: elements[name], inputSlots: definition.inputSlots };
      }
    }
  }

  // Strategy 2: first type:code element anywhere in the definition
  for (const [name, content] of Object.entries(elements)) {
    if (elementTypes[name] === "code") {
      return { mode, template: content, inputSlots: definition.inputSlots };
    }
  }

  // Strategy 3: backward-compat — element literally named "block"
  if (elements["block"] !== undefined) {
    return { mode, template: elements["block"], inputSlots: definition.inputSlots };
  }

  // Strategy 4: first element
  const first = Object.values(elements)[0];
  if (first === undefined) {
    throw new Error(`Block "${definition.identifier}" does not have any elements.`);
  }
  return { mode, template: first, inputSlots: definition.inputSlots };
}
