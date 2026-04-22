import type * as Blockly from "blockly";
import { parseTemplate } from "./template";
import { resolveBlockView } from "./view-resolver";
import type {
  MorphicBlockDefinition,
  MorphicCodeGenerationResult,
  MorphicCodeMetadata,
  MorphicElementType,
  MorphicModeDefinition,
  MorphicModeName,
} from "./types";

interface RenderContext {
  mode: MorphicModeName;
  definitions: ReadonlyMap<string, MorphicBlockDefinition>;
  elementTypes: Record<string, MorphicElementType>;
  modeDefs: MorphicModeDefinition[];
}

/**
 * Generates plain text for a workspace using the template that the active
 * mode resolves to for each block. Mirrors the workspace's block rendering:
 * whatever element the workspace shows for a block in mode `M`, that same
 * template is rendered here as text.
 *
 * Authors control whitespace and indentation through the element content itself.
 * Example:
 *   "if ( %1 ) { %2 }"        → single-line output
 *   "if ( %1 ) {\n  %2\n}"    → multi-line, author adds newlines and indent
 *
 * Metadata is returned empty for now — block-to-line ranges are wired in a
 * later task when selection sync is added.
 */
export function generateTextFromWorkspace(
  workspace: Blockly.Workspace,
  mode: MorphicModeName,
  definitions: ReadonlyMap<string, MorphicBlockDefinition>,
  elementTypes: Record<string, MorphicElementType>,
  modeDefs: MorphicModeDefinition[],
): MorphicCodeGenerationResult {
  const metadata: MorphicCodeMetadata = new Map();
  const context: RenderContext = { mode, definitions, elementTypes, modeDefs };
  const parts = workspace
    .getTopBlocks(true)
    .map((block) => renderStatementChain(block, context))
    .filter((text) => text !== "");

  return { code: parts.join("\n"), metadata };
}

function renderStatementChain(startBlock: Blockly.Block, ctx: RenderContext): string {
  const lines: string[] = [];
  let current: Blockly.Block | null = startBlock;
  while (current) {
    const text = renderBlock(current, ctx);
    if (text !== "") {
      lines.push(text);
    }
    current = current.getNextBlock();
  }
  return lines.join("\n");
}

function renderBlock(block: Blockly.Block, ctx: RenderContext): string {
  const definition = ctx.definitions.get(block.type);
  if (!definition) return "";

  let template: string;
  try {
    template = resolveBlockView(definition, ctx.mode, ctx.elementTypes, ctx.modeDefs).template;
  } catch {
    return "";
  }

  const tokens = parseTemplate(template);
  let out = "";

  for (const token of tokens) {
    if (token.kind === "text") {
      out += token.value;
      continue;
    }
    if (token.kind === "field") {
      const field = block.getField(token.name);
      out += field ? String(field.getValue()) : "";
      continue;
    }
    if (token.kind === "image") {
      continue;
    }

    const slot = definition.inputSlots?.[String(token.index)];
    const inputName = slot?.name;
    if (!inputName) {
      continue;
    }
    const input = block.getInput(inputName);
    const target = input?.connection?.targetBlock() ?? null;
    if (!target) {
      continue;
    }

    if (slot?.kind === "statement") {
      out += renderStatementChain(target, ctx);
    } else {
      out += renderBlock(target, ctx);
    }
  }

  return out;
}
