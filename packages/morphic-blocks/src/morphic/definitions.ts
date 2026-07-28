import type { MorphicBlockDefinition } from "./types";

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


function assertDefinition(
  definition: MorphicBlockDefinition,
  currentMap: Map<string, MorphicBlockDefinition>
): void {
  if (!definition.identifier.trim()) {
    throw new Error("Each block definition must include a non-empty identifier.");
  }
  if (Object.keys(definition.elements).length === 0) {
    throw new Error(`Block "${definition.identifier}" must define at least one element.`);
  }
  if (currentMap.has(definition.identifier)) {
    throw new Error(`Duplicate block identifier "${definition.identifier}".`);
  }
}
