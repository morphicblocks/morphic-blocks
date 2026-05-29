import * as Blockly from "blockly";
import { toCleanId } from "./block-namespace";
import { resolveEmptyDefault } from "./element-types";
import { parseTemplate } from "./template";
import { resolveBlockView } from "./view-resolver";
import type {
  MorphicBlockDefinition,
  MorphicCodeBlockPosition,
  MorphicCodeGenerationResult,
  MorphicElementTypeConfig,
  MorphicElementTypeEntry,
  MorphicInputSlotDefinition,
  MorphicModeDefinition,
  MorphicModeName,
  MorphicPlaceholderEditTarget,
  MorphicPlaceholderRange,
} from "./types";

interface RenderContext {
  mode: MorphicModeName;
  definitions: ReadonlyMap<string, MorphicBlockDefinition>;
  elementTypes: Record<string, MorphicElementTypeEntry>;
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
  placeholders: MorphicPlaceholderRange[];
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
  elementTypes: Record<string, MorphicElementTypeEntry>,
  modeDefs: MorphicModeDefinition[],
  elementOverride?: string,
): MorphicCodeGenerationResult {
  const state: RenderState = { output: "", metadata: new Map(), placeholders: [], indent: "" };
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

  return { code: state.output, metadata: state.metadata, placeholders: state.placeholders };
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
  const definition = ctx.definitions.get(toCleanId(block.type));
  if (!definition) {
    // Non-morphic block (Blockly stock — typically a placeholder block
    // like `math_number`, `text`, or `logic_boolean` attached via the
    // empty-default config). It has no morphic template, so emit its
    // current field values directly. This is a best-effort one-presentation
    // rendering: placeholders show their typed value but have no per-mode
    // template (e.g. no automatic string quoting).
    emitNonMorphicBlockText(block, state);
    return;
  }

  let template: string;
  let elementName: string | undefined;
  if (ctx.elementOverride) {
    const explicit = definition.elements[ctx.elementOverride];
    if (explicit === undefined) return;
    template = explicit;
    elementName = ctx.elementOverride;
  } else {
    try {
      const view = resolveBlockView(definition, ctx.mode, ctx.elementTypes, ctx.modeDefs);
      template = view.template;
      elementName = view.elementName;
    } catch {
      return;
    }
  }
  const elementEntry = elementName ? ctx.elementTypes[elementName] : undefined;

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
      const field = block.getField(token.name);
      if (!field) continue;
      const fieldStart = state.output.length;
      appendText(state, readFieldText(field));
      const editTarget = fieldEditTarget(block, field, token.name);
      if (editTarget) {
        recordPlaceholder(state, fieldStart, "set", editTarget);
      }
      continue;
    }
    if (token.kind === "image") {
      continue;
    }

    const slot = definition.inputSlots?.[String(token.index)];
    const inputName = slot?.name;
    if (!inputName) continue;
    const input = block.getInput(inputName);
    const rawTarget = input?.connection?.targetBlock() ?? null;
    // Shadow blocks (empty-slot placeholders attached by block-view) are
    // re-emitted as text via the empty-default fallback, not recursed into,
    // so the codespace stays consistent with the workspace view.
    const target = rawTarget?.isShadow() ? null : rawTarget;

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

    // Per-field markers recorded inside the slot's emission (e.g. var_declare's
    // VAR text field on the dummy NAME slot, math_arithmetic's OP dropdown on
    // the dummy OPERATOR slot). When recorded, the outer slot-level marker is
    // skipped so the `default` italic-dim style doesn't stack on the `set`
    // style of the inner field marker.
    let perFieldRecorded = false;
    if (!target) {
      // Quote framework-supplied literals (shadow/fallback) in String slots.
      // Quotes sit outside the marker so editing targets only the inner value.
      const stringQuote = resolveStringQuote(slot, elementEntry);
      if (stringQuote) appendText(state, stringQuote);
      const slotOffsetStart = state.output.length;
      let fieldEmitted = false;
      // Shadows: read the shadow's own fields so codespace text matches the
      // shadow's current values (and supports inline editing of the shadow).
      if (rawTarget?.isShadow()) {
        for (const shadowInput of rawTarget.inputList) {
          for (const field of shadowInput.fieldRow) {
            if (!field.name) continue;
            appendText(state, readFieldText(field));
            fieldEmitted = true;
          }
        }
      } else if (input) {
        // Fields directly on the parent's input (e.g. VAR on var_declare's
        // NAME, OP on math_arithmetic's OPERATOR). Emit each field as its
        // own placeholder range so it's individually inline-editable.
        for (const field of input.fieldRow) {
          if (!field.name) continue;
          const fieldStart = state.output.length;
          appendText(state, readFieldText(field));
          fieldEmitted = true;
          const fieldEdit = fieldEditTarget(block, field, field.name);
          if (fieldEdit) {
            recordPlaceholder(state, fieldStart, "set", fieldEdit);
            perFieldRecorded = true;
          }
        }
      }
      if (!fieldEmitted) {
        const fallback = resolveEmptyDefault(
          elementEntry,
          slot?.check,
          definition,
          inputName,
        );
        if (fallback !== undefined) {
          appendText(state, fallback);
        }
      }
      if (!perFieldRecorded) {
        const editTarget = rawTarget?.isShadow() ? detectAtomicEdit(rawTarget) ?? undefined : undefined;
        recordPlaceholder(state, slotOffsetStart, "default", editTarget);
      }
      if (stringQuote) appendText(state, stringQuote);
      continue;
    }

    // Real attached block: render via its own template (it self-quotes if it's
    // a string literal block; a variable/expression stays bare). No framework
    // quoting here.
    const slotOffsetStart = state.output.length;
    renderBlock(target, ctx, state);
    recordPlaceholder(state, slotOffsetStart, "set", detectAtomicEdit(target) ?? undefined);
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

/**
 * Emit the named field values of a non-morphic Blockly block (e.g. a stock
 * `math_number`, `text`, or `logic_boolean` used as a placeholder). Walks
 * every input's fieldRow and appends each named field's display text. Image
 * fields and labels (no `name`) are skipped.
 */
function emitNonMorphicBlockText(
  block: Blockly.Block,
  state: RenderState,
): void {
  for (const input of block.inputList) {
    for (const field of input.fieldRow) {
      if (!field.name) continue;
      appendText(state, readFieldText(field));
    }
  }
}

/**
 * Record a value-slot range covering everything emitted between `start` and the
 * current output position. Skipped when nothing was emitted (zero-width range).
 */
function recordPlaceholder(
  state: RenderState,
  start: number,
  kind: "default" | "set",
  edit?: MorphicPlaceholderEditTarget,
): void {
  const end = state.output.length;
  if (end > start) {
    const range: MorphicPlaceholderRange = { start, end, kind };
    if (edit) range.edit = edit;
    state.placeholders.push(range);
  }
}

/**
 * Inspect a Blockly block to determine whether it's an "atomic single-field"
 * block — exactly one named field, no value-input children. Such blocks are
 * the only ones currently inline-editable in the codespace (math_number,
 * text, logic_boolean, and morphic blocks with the same shape).
 */
/**
 * Build an inline-edit target for a single named field on a morphic block —
 * the `%FIELDNAME` token case. Returns `null` for non-editable field types
 * (FieldLabel, FieldImage) so they render plain text without a marker.
 */
/**
 * Resolve the string-quote delimiter for a value slot: returns the active
 * element's `stringQuote` when the slot's check is `String`, else undefined.
 * Used to wrap framework-supplied literals (shadow values, empty fallbacks)
 * so the codespace renders `print("hello")` rather than `print(hello)`.
 */
function resolveStringQuote(
  slot: MorphicInputSlotDefinition | undefined,
  elementEntry: MorphicElementTypeEntry | undefined,
): string | undefined {
  if (!slot?.check) return undefined;
  const checkStr = Array.isArray(slot.check) ? slot.check[0] : slot.check;
  if (checkStr !== "String") return undefined;
  if (!elementEntry || typeof elementEntry === "string") return undefined;
  return (elementEntry as MorphicElementTypeConfig).stringQuote;
}

function fieldEditTarget(
  block: Blockly.Block,
  field: Blockly.Field,
  fieldName: string,
): MorphicPlaceholderEditTarget | null {
  // `instanceof` not `constructor.name`: minified Blockly bundles rename
  // classes, so a name-substring check can misclassify (e.g. FieldTextInput
  // accidentally matching "Number" or the inverse). FieldNumber extends
  // FieldTextInput, so the Number check must come first.
  let fieldType: MorphicPlaceholderEditTarget["fieldType"];
  let options: [string, string][] | undefined;
  if (field instanceof Blockly.FieldNumber) {
    fieldType = "number";
  } else if (field instanceof Blockly.FieldDropdown) {
    fieldType = "dropdown";
    const raw: unknown = field.getOptions();
    if (Array.isArray(raw)) {
      options = (raw as unknown[])
        .filter((entry): entry is [unknown, unknown] => Array.isArray(entry) && entry.length >= 2)
        .map(([label, value]) => [String(label), String(value)] as [string, string]);
    }
  } else if (field instanceof Blockly.FieldTextInput) {
    fieldType = "text";
  } else {
    return null;
  }
  return { blockId: block.id, fieldName, fieldType, options };
}

function detectAtomicEdit(block: Blockly.Block): MorphicPlaceholderEditTarget | null {
  let fieldName: string | null = null;
  let fieldRef: Blockly.Field | null = null;
  let fieldCount = 0;
  for (const input of block.inputList) {
    if (input.connection && input.connection.type === Blockly.INPUT_VALUE) return null;
    for (const field of input.fieldRow) {
      if (!field.name) continue;
      fieldCount++;
      fieldName = field.name;
      fieldRef = field;
    }
  }
  if (fieldCount !== 1 || !fieldName || !fieldRef) return null;
  const ctorName = fieldRef.constructor.name;
  let fieldType: MorphicPlaceholderEditTarget["fieldType"] = "text";
  let options: [string, string][] | undefined;
  if (ctorName.includes("Number")) {
    fieldType = "number";
  } else if (ctorName.includes("Dropdown")) {
    fieldType = "dropdown";
    const getOptions = (fieldRef as { getOptions?: () => unknown }).getOptions;
    if (typeof getOptions === "function") {
      const raw = getOptions.call(fieldRef);
      if (Array.isArray(raw)) {
        options = raw
          .filter((entry): entry is [unknown, unknown] => Array.isArray(entry) && entry.length >= 2)
          .map(([label, value]) => [String(label), String(value)] as [string, string]);
      }
    }
  }
  return { blockId: block.id, fieldName, fieldType, options };
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
