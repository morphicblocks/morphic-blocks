import type * as Blockly from "blockly";
import { toModeClassToken } from "./template";
import type {
  MorphicBlockDefinition,
  MorphicToolboxCategory,
  MorphicToolboxConfig,
} from "./types";

/**
 * Returns the ordered list of block types for a category.
 * If the category declares an explicit `blocks` array that is used directly;
 * otherwise every block definition whose `category` field matches the category
 * name (case-insensitive) is used, preserving definition order.
 */
function resolveCategoryBlocks(
  category: MorphicToolboxCategory,
  definitions: ReadonlyMap<string, MorphicBlockDefinition>,
): string[] {
  if (category.blocks && category.blocks.length > 0) {
    return category.blocks;
  }
  const result: string[] = [];
  for (const def of definitions.values()) {
    if (def.category?.toLowerCase() === category.name.toLowerCase()) {
      result.push(def.identifier);
    }
  }
  return result;
}

export function buildToolboxDefinition(
  toolbox: MorphicToolboxConfig,
  definitions: ReadonlyMap<string, MorphicBlockDefinition>,
): NonNullable<Blockly.BlocklyOptions["toolbox"]> {
  const kind =
    toolbox.kind ??
    (toolbox.categories?.length ? "categoryToolbox" : "flyoutToolbox");
  if (kind === "categoryToolbox") {
    const categories = toolbox.categories ?? [];
    return {
      kind: "categoryToolbox",
      contents: categories.map((category) => ({
        kind: "category",
        name: category.name,
        colour: category.colour,
        contents: resolveCategoryBlocks(category, definitions).map((type) => ({
          kind: "block",
          type,
        })),
      })),
    };
  }

  if (toolbox.categories?.length) {
    const categories = toolbox.categories;
    const contents: Array<Record<string, unknown>> = [];

    categories.forEach((category, index) => {
      const categoryToken = toModeClassToken(category.name);
      contents.push({
        kind: "label",
        id: `morphic-category-${categoryToken}`,
        text: category.name,
        "web-class": `morphic-flyout-category-label morphic-category-${categoryToken}`,
      });

      for (const type of dedupeBlockTypes(
        resolveCategoryBlocks(category, definitions),
      )) {
        contents.push({
          kind: "block",
          type,
        });
      }

      if (index < categories.length - 1) {
        contents.push({
          kind: "sep",
          gap: 14,
        });
      }
    });

    const flyoutToolbox = {
      kind: "flyoutToolbox",
      contents,
    };
    return flyoutToolbox as unknown as NonNullable<
      Blockly.BlocklyOptions["toolbox"]
    >;
  }

  const blockTypes =
    toolbox.blocks ??
    dedupeBlockTypes(
      toolbox.categories?.flatMap((category) =>
        resolveCategoryBlocks(category, definitions),
      ) ?? [...definitions.keys()],
    );
  return {
    kind: "flyoutToolbox",
    contents: blockTypes.map((type) => ({
      kind: "block",
      type,
    })),
  };
}

function dedupeBlockTypes(types: string[]): string[] {
  return types.filter((type, index, all) => all.indexOf(type) === index);
}
