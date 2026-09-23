import { resolveElementType } from "./element-types";
import type { MorphicBlockDefinition, MorphicElementTypeEntry } from "./types";

/**
 * Reserved element key: a block's fallback template, used for every `code`
 * element the block does not list itself. A listed element always wins.
 */
export const DEFAULT_ELEMENT = "default";

/**
 * Resolve each block's optional `default` element once, at load time: it is
 * copied into every `code` element (declared in `elementTypes`) that the block
 * does not list, then removed. Every later consumer (workspace, codespace,
 * preview, toolbox, codegen, validation) therefore sees complete blocks and
 * needs no knowledge of `default`.
 *
 * Returns new block objects; the caller's definitions are not mutated. A
 * `default` that fills nothing (no `code` elements are declared) is kept, so
 * validation reports it as an undeclared element instead of it vanishing.
 */
export function expandDefaultElements(
  blocks: MorphicBlockDefinition[],
  elementTypes: Record<string, MorphicElementTypeEntry>,
): MorphicBlockDefinition[] {
  const codeElements = Object.keys(elementTypes).filter(
    (name) => resolveElementType(elementTypes[name]) === "code",
  );
  return blocks.map((block) => {
    const fallback = block.elements?.[DEFAULT_ELEMENT];
    if (fallback === undefined || codeElements.length === 0) return block;
    const { [DEFAULT_ELEMENT]: _default, ...listed } = block.elements;
    const elements = { ...listed };
    for (const name of codeElements) {
      if (elements[name] === undefined) elements[name] = fallback;
    }
    return { ...block, elements };
  });
}

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
