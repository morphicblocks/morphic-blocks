import type { MorphicBlockDefinition, MorphicModeName, MorphicResolvedView } from "./types";

/**
 * Resolves the workspace template for a block.
 * Always uses the "block" element (Blockly-compatible template with %1 placeholders).
 * Falls back to the first element if "block" is absent.
 * The mode is recorded for CSS class purposes only — it does not select the template.
 */
export function resolveBlockView(
  definition: MorphicBlockDefinition,
  mode: MorphicModeName,
): MorphicResolvedView {
  const template =
    definition.elements["block"] ??
    Object.values(definition.elements)[0];

  if (template === undefined) {
    throw new Error(`Block "${definition.identifier}" does not have any elements.`);
  }

  return {
    mode,
    template,
    inputSlots: definition.inputSlots,
  };
}
