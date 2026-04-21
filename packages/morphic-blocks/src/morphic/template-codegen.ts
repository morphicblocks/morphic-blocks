import type * as Blockly from "blockly";
import { parseTemplate } from "./template";
import type {
  MorphicBlockDefinition,
  MorphicCodeGenerationResult,
  MorphicCodeMetadata,
} from "./types";

/**
 * Generates plain text for a workspace using a named element as template.
 *
 * Authors control whitespace and indentation through the element content itself.
 * Example:
 *   "if ( %1 ) { %2 }"        → single-line output
 *   "if ( %1 ) {\n  %2\n}"    → multi-line, author adds newlines and indent
 * A block whose element is missing is silently skipped.
 *
 * Metadata is returned empty for now — block-to-line ranges are wired in a
 * later task when selection sync is added.
 */
export function generateTextFromWorkspace(
  workspace: Blockly.Workspace,
  elementName: string,
  definitions: ReadonlyMap<string, MorphicBlockDefinition>,
): MorphicCodeGenerationResult {
  const metadata: MorphicCodeMetadata = new Map();
  const parts = workspace
    .getTopBlocks(true)
    .map((block) => renderStatementChain(block, elementName, definitions))
    .filter((text) => text !== "");

  return { code: parts.join("\n"), metadata };
}

function renderStatementChain(
  startBlock: Blockly.Block,
  elementName: string,
  definitions: ReadonlyMap<string, MorphicBlockDefinition>,
): string {
  const lines: string[] = [];
  let current: Blockly.Block | null = startBlock;
  while (current) {
    const text = renderBlock(current, elementName, definitions);
    if (text !== "") {
      lines.push(text);
    }
    current = current.getNextBlock();
  }
  return lines.join("\n");
}

function renderBlock(
  block: Blockly.Block,
  elementName: string,
  definitions: ReadonlyMap<string, MorphicBlockDefinition>,
): string {
  const definition = definitions.get(block.type);
  const template = definition?.elements[elementName];
  if (template === undefined || definition === undefined) {
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
      out += renderStatementChain(target, elementName, definitions);
    } else {
      out += renderBlock(target, elementName, definitions);
    }
  }

  return out;
}
