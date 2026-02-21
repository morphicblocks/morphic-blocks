import type * as Blockly from "blockly";
import { toModeClassToken } from "./template";
import type { MorphicBlockDefinition, MorphicToolboxConfig } from "./types";

export function buildToolboxDefinition(
  toolbox: MorphicToolboxConfig,
  definitions: ReadonlyMap<string, MorphicBlockDefinition>
): NonNullable<Blockly.BlocklyOptions["toolbox"]> {
  const kind = toolbox.kind ?? (toolbox.categories?.length ? "categoryToolbox" : "flyoutToolbox");
  if (kind === "categoryToolbox") {
    const categories = toolbox.categories ?? [];
    return {
      kind: "categoryToolbox",
      contents: categories.map((category) => ({
        kind: "category",
        name: category.name,
        colour: category.colour,
        contents: category.blocks.map((type) => ({
          kind: "block",
          type
        }))
      }))
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
        "web-class": `morphic-flyout-category-label morphic-category-${categoryToken}`
      });

      for (const type of dedupeBlockTypes(category.blocks)) {
        contents.push({
          kind: "block",
          type
        });
      }

      if (index < categories.length - 1) {
        contents.push({
          kind: "sep",
          gap: 14
        });
      }
    });

    const flyoutToolbox = {
      kind: "flyoutToolbox",
      contents
    };
    return flyoutToolbox as unknown as NonNullable<Blockly.BlocklyOptions["toolbox"]>;
  }

  const blockTypes =
    toolbox.blocks ??
    dedupeBlockTypes(
      toolbox.categories?.flatMap((category) => category.blocks) ?? [...definitions.keys()]
    );
  return {
    kind: "flyoutToolbox",
    contents: blockTypes.map((type) => ({
      kind: "block",
      type
    }))
  };
}

function dedupeBlockTypes(types: string[]): string[] {
  return types.filter((type, index, all) => all.indexOf(type) === index);
}
