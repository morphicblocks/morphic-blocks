import type { MorphicBlockDefinition, MorphicModeName } from "./types";

export function createDefinitionMap(
  definitions: MorphicBlockDefinition[] | MorphicBlockDefinition
): Map<string, MorphicBlockDefinition> {
  const map = new Map<string, MorphicBlockDefinition>();
  const normalized = Array.isArray(definitions) ? definitions : [definitions];

  for (const definition of normalized) {
    assertDefinition(definition, map);
    map.set(definition.identifier, definition);
  }

  return map;
}

export function collectAvailableModes(definitions: Iterable<MorphicBlockDefinition>): MorphicModeName[] {
  const modes = new Set<string>();
  for (const definition of definitions) {
    for (const modeName of Object.keys(definition.views)) {
      modes.add(modeName);
    }
  }
  return [...modes];
}

function assertDefinition(
  definition: MorphicBlockDefinition,
  currentMap: Map<string, MorphicBlockDefinition>
): void {
  if (!definition.identifier.trim()) {
    throw new Error("Each block definition must include a non-empty identifier.");
  }
  if (Object.keys(definition.views).length === 0) {
    throw new Error(`Block "${definition.identifier}" must define at least one view.`);
  }
  if (currentMap.has(definition.identifier)) {
    throw new Error(`Duplicate block identifier "${definition.identifier}".`);
  }
}

