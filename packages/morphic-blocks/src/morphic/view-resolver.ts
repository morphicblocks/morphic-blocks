import type { MorphicBlockDefinition, MorphicModeName, MorphicResolvedView, MorphicViewDefinition } from "./types";

export function resolveBlockView(
  definition: MorphicBlockDefinition,
  preferredMode: MorphicModeName
): MorphicResolvedView {
  const preferredView = definition.views[preferredMode];
  if (preferredView) {
    return normalizeView(preferredMode, preferredView);
  }

  const first = Object.entries(definition.views)[0];
  if (!first) {
    throw new Error(`Block "${definition.identifier}" does not have any views.`);
  }

  return normalizeView(first[0], first[1]);
}

function normalizeView(mode: MorphicModeName, view: MorphicViewDefinition): MorphicResolvedView {
  if (typeof view === "string") {
    return { mode, template: view };
  }
  return {
    mode,
    template: view.template,
    inputSlots: view.inputSlots
  };
}
