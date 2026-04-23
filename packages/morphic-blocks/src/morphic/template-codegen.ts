import type * as Blockly from "blockly";
import { parseTemplate } from "./template";
import { resolveBlockView } from "./view-resolver";
import type {
  MorphicBlockDefinition,
  MorphicCodeBlockPosition,
  MorphicCodeGenerationResult,
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

interface RenderState {
  output: string;
  metadata: Map<string, MorphicCodeBlockPosition>;
}

/**
 * Generates plain text for a workspace using the template that the active
 * mode resolves to for each block, plus a block-id → line-range map.
 *
 * Authors control whitespace and indentation through the element content itself.
 * Example:
 *   "if ( %1 ) { %2 }"        → single-line output
 *   "if ( %1 ) {\n  %2\n}"    → multi-line, author adds newlines and indent
 *
 * Line numbers in the metadata are 1-based and inclusive. A block's range
 * covers the first-line-emitted-from-its-template through the last; a block
 * whose template wraps children (e.g. `if`) covers its children's lines too.
 */
export function generateTextFromWorkspace(
  workspace: Blockly.Workspace,
  mode: MorphicModeName,
  definitions: ReadonlyMap<string, MorphicBlockDefinition>,
  elementTypes: Record<string, MorphicElementType>,
  modeDefs: MorphicModeDefinition[],
): MorphicCodeGenerationResult {
  const state: RenderState = { output: "", metadata: new Map() };
  const ctx: RenderContext = { mode, definitions, elementTypes, modeDefs };

  let first = true;
  for (const block of workspace.getTopBlocks(true)) {
    const before = state.output.length;
    if (!first) state.output += "\n";
    renderStatementChain(block, ctx, state);
    if (state.output.length === before + (first ? 0 : 1)) {
      // Nothing was emitted for this top-level block — revert the separator.
      state.output = state.output.slice(0, before);
    } else {
      first = false;
    }
  }

  return { code: state.output, metadata: state.metadata };
}

function renderStatementChain(
  startBlock: Blockly.Block,
  ctx: RenderContext,
  state: RenderState,
): void {
  let current: Blockly.Block | null = startBlock;
  let first = true;
  while (current) {
    const before = state.output.length;
    if (!first) state.output += "\n";
    renderBlock(current, ctx, state);
    if (state.output.length === before + (first ? 0 : 1)) {
      state.output = state.output.slice(0, before);
    } else {
      first = false;
    }
    current = current.getNextBlock();
  }
}

function renderBlock(
  block: Blockly.Block,
  ctx: RenderContext,
  state: RenderState,
): void {
  const definition = ctx.definitions.get(block.type);
  if (!definition) return;

  let template: string;
  try {
    template = resolveBlockView(definition, ctx.mode, ctx.elementTypes, ctx.modeDefs).template;
  } catch {
    return;
  }

  const before = state.output.length;
  const startLine = currentLine(state.output);

  const tokens = parseTemplate(template);
  for (const token of tokens) {
    if (token.kind === "text") {
      state.output += token.value;
      continue;
    }
    if (token.kind === "field") {
      state.output += readFieldText(block.getField(token.name));
      continue;
    }
    if (token.kind === "image") {
      continue;
    }

    const slot = definition.inputSlots?.[String(token.index)];
    const inputName = slot?.name;
    if (!inputName) continue;
    const input = block.getInput(inputName);
    const target = input?.connection?.targetBlock() ?? null;
    if (!target) {
      if (input) {
        for (const field of input.fieldRow) {
          if (!field.name) continue;
          state.output += readFieldText(field);
        }
      }
      continue;
    }

    if (slot?.kind === "statement") {
      renderStatementChain(target, ctx, state);
    } else {
      renderBlock(target, ctx, state);
    }
  }

  if (state.output.length === before) {
    // Block emitted nothing — don't record a zero-width range.
    return;
  }

  // If the last emitted character is a newline, the block's content ends on
  // the previous line; clamp so the range doesn't claim a blank line.
  const rawEndLine = currentLine(state.output);
  const endLine = state.output.endsWith("\n")
    ? Math.max(startLine, rawEndLine - 1)
    : rawEndLine;

  state.metadata.set(block.id, { startLine, endLine });
}

function readFieldText(field: Blockly.Field | null | undefined): string {
  if (!field) return "";
  const getText = (field as { getText?: () => string }).getText;
  return typeof getText === "function" ? getText.call(field) : String(field.getValue());
}

/**
 * Returns the 1-based line number that the next appended character would land on.
 * Empty output → line 1. Output ending with "\n" → line after that newline.
 */
function currentLine(output: string): number {
  let count = 1;
  for (let i = 0; i < output.length; i++) {
    if (output[i] === "\n") count++;
  }
  return count;
}
