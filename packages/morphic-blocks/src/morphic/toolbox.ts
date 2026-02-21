import type * as Blockly from "blockly";
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
