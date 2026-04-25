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
  /**
   * When set, every block uses `def.elements[elementOverride]` directly
   * (skipping mode-based resolution). Used by the preview editor to render
   * a specific element regardless of the active mode's primary source.
   */
  elementOverride?: string;
}

interface RenderState {
  output: string;
  metadata: Map<string, MorphicCodeBlockPosition>;
  /**
   * Whitespace prefixed to every newline emitted while rendering. Updated when
   * descending into a statement input so nested templates' own indents stack
   * on top of the outer body's indent.
   */
  indent: string;
}

/** Append text to the output, prefixing every newline with the current indent. */
function appendText(state: RenderState, text: string): void {
  if (text.length === 0) return;
  if (state.indent === "" || !text.includes("\n")) {
    state.output += text;
    return;
  }
  const parts = text.split("\n");
  state.output += parts[0];
  for (let i = 1; i < parts.length; i++) {
    state.output += "\n" + state.indent + parts[i];
  }
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
  elementOverride?: string,
): MorphicCodeGenerationResult {
  const state: RenderState = { output: "", metadata: new Map(), indent: "" };
  const ctx: RenderContext = { mode, definitions, elementTypes, modeDefs, elementOverride };

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
  const separatorLen = 1 + state.indent.length;
  let current: Blockly.Block | null = startBlock;
  let first = true;
  while (current) {
    const before = state.output.length;
    if (!first) appendText(state, "\n");
    renderBlock(current, ctx, state);
    if (state.output.length === before + (first ? 0 : separatorLen)) {
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
  if (ctx.elementOverride) {
    const explicit = definition.elements[ctx.elementOverride];
    if (explicit === undefined) return;
    template = explicit;
  } else {
    try {
      template = resolveBlockView(definition, ctx.mode, ctx.elementTypes, ctx.modeDefs).template;
    } catch {
      return;
    }
  }

  const before = state.output.length;
  const startLine = currentLine(state.output);
  const statementSlots: Record<string, { startLine: number; endLine: number }> = {};

  const tokens = parseTemplate(template);
  for (const token of tokens) {
    if (token.kind === "text") {
      appendText(state, token.value);
      continue;
    }
    if (token.kind === "field") {
      appendText(state, readFieldText(block.getField(token.name)));
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

    if (slot?.kind === "statement") {
      const slotStart = currentLine(state.output);
      const prevIndent = state.indent;
      const lineStart = state.output.lastIndexOf("\n") + 1;
      state.indent = /^[ \t]*/.exec(state.output.slice(lineStart))?.[0] ?? "";
      if (target) {
        renderStatementChain(target, ctx, state);
      }
      state.indent = prevIndent;
      const rawSlotEnd = currentLine(state.output);
      const slotEnd = state.output.endsWith("\n")
        ? Math.max(slotStart, rawSlotEnd - 1)
        : rawSlotEnd;
      statementSlots[inputName] = { startLine: slotStart, endLine: slotEnd };
      continue;
    }

    if (!target) {
      if (input) {
        for (const field of input.fieldRow) {
          if (!field.name) continue;
          appendText(state, readFieldText(field));
        }
      }
      continue;
    }

    renderBlock(target, ctx, state);
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

  const position: MorphicCodeBlockPosition = { startLine, endLine };
  if (Object.keys(statementSlots).length > 0) {
    position.statementSlots = statementSlots;
  }
  state.metadata.set(block.id, position);
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
