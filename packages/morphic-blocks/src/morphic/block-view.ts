import * as Blockly from "blockly";
import {
  CONTEXT_CLASS_PREFIX,
  MODE_CLASS_PREFIX,
  CATEGORY_CLASS_PREFIX,
  BLOCK_CLASS_PREFIX,
  ALIGN_CENTRE,
  ALIGN_LEFT,
  ALIGN_RIGHT,
} from "./constants";
import {
  normalizeTemplateText,
  parseTemplate,
  toModeClassToken,
} from "./template";
import type {
  MorphicBlockDefinition,
  MorphicConnectionSpec,
  MorphicInputSlotDefinition,
  MorphicModeName,
  MorphicRenderContext,
  MorphicResolvedView,
} from "./types";

export type MorphicManagedBlock = Blockly.BlockSvg & {
  __morphicMode?: string;
  __morphicContext?: MorphicRenderContext;
};

export interface MorphicApplyBlockViewParams {
  block: Blockly.BlockSvg;
  definition: MorphicBlockDefinition;
  view: MorphicResolvedView;
  mode: MorphicModeName;
  context: MorphicRenderContext;
}

export function applyBlockView(params: MorphicApplyBlockViewParams): void {
  const { block, definition, view, mode, context } = params;
  const connectedChildren = captureConnectedChildren(block);

  removeInputs(block);
  renderTemplate(block, definition, view);
  applyConnections(block, definition);

  if (typeof definition.inputsInline === "boolean") {
    block.setInputsInline(definition.inputsInline);
  }
  if (definition.color !== undefined) {
    block.setColour(definition.color);
  }
  if (definition.tooltip) {
    block.setTooltip(definition.tooltip);
  }
  if (definition.helpUrl) {
    block.setHelpUrl(definition.helpUrl);
  }

  restoreConnectedChildren(block, connectedChildren);
  decorateBlockRoot(block, mode, context);

  const managedBlock = block as MorphicManagedBlock;
  managedBlock.__morphicMode = mode;
  managedBlock.__morphicContext = context;

  if (block.rendered) {
    block.render();
  }
}

export function applyRootModeClasses(
  root: Element,
  mode: MorphicModeName,
  context: MorphicRenderContext,
  rootClassName: string,
): void {
  removePrefixedClasses(root.classList, MODE_CLASS_PREFIX);
  removePrefixedClasses(root.classList, CONTEXT_CLASS_PREFIX);
  root.classList.add(rootClassName);
  root.classList.add(`${MODE_CLASS_PREFIX}${toModeClassToken(mode)}`);
  root.classList.add(`${CONTEXT_CLASS_PREFIX}${context}`);
}

export function getManagedBlockMode(block: Blockly.Block): string | undefined {
  return (block as MorphicManagedBlock).__morphicMode;
}

export function applyBlockCategoryClass(
  block: Blockly.BlockSvg,
  categoryToken?: string,
): void {
  const root = block.getSvgRoot();
  if (!root) {
    return;
  }

  removePrefixedClasses(root.classList, CATEGORY_CLASS_PREFIX);
  if (categoryToken) {
    root.classList.add(`${CATEGORY_CLASS_PREFIX}${categoryToken}`);
  }
}

/**
 * Stamps a stable `morphic-block-{identifier}` class on the block SVG root.
 * This persists across mode switches and lets mode CSS files target individual
 * blocks with rules like `.morphic-block-log_message { --morphic-block-color: #f97316; }`.
 */
export function applyBlockIdentifierClass(
  block: Blockly.BlockSvg,
  identifier: string,
): void {
  const root = block.getSvgRoot();
  if (!root) {
    return;
  }
  const cls = `${BLOCK_CLASS_PREFIX}${toModeClassToken(identifier)}`;
  if (!root.classList.contains(cls)) {
    root.classList.add(cls);
  }
}

/**
 * Reads the CSS custom property `--morphic-block-color` from the block SVG root
 * (after mode and identifier classes have been applied) and calls `block.setColour()`
 * when a value is found. This lets mode CSS files drive block colours declaratively.
 */
export function applyBlockColorFromCSS(block: Blockly.BlockSvg): void {
  const root = block.getSvgRoot();
  if (!root) {
    return;
  }
  const colorValue = getComputedStyle(root)
    .getPropertyValue("--morphic-block-color")
    .trim();
  if (colorValue) {
    block.setColour(colorValue);
    // Re-render so the new colour is reflected
    if (block.rendered) {
      block.render();
    }
  }
}

function decorateBlockRoot(
  block: Blockly.BlockSvg,
  mode: MorphicModeName,
  context: MorphicRenderContext,
): void {
  const root = block.getSvgRoot();
  if (!root) {
    return;
  }

  removePrefixedClasses(root.classList, MODE_CLASS_PREFIX);
  removePrefixedClasses(root.classList, CONTEXT_CLASS_PREFIX);
  root.classList.add(`${MODE_CLASS_PREFIX}${toModeClassToken(mode)}`);
  root.classList.add(`${CONTEXT_CLASS_PREFIX}${context}`);
}

function renderTemplate(
  block: Blockly.BlockSvg,
  definition: MorphicBlockDefinition,
  view: MorphicResolvedView,
): void {
  const tokens = parseTemplate(view.template);
  const pendingFields: Array<string | Blockly.FieldImage> = [];
  const createdPlaceholders = new Set<number>();

  for (const token of tokens) {
    if (token.kind === "text") {
      const text = normalizeTemplateText(token.value);
      if (text) {
        pendingFields.push(text);
      }
      continue;
    }

    if (token.kind === "image") {
      pendingFields.push(
        new Blockly.FieldImage(token.src, token.width, token.height, token.alt),
      );
      continue;
    }

    if (createdPlaceholders.has(token.index)) {
      const duplicatePlaceholder = block.appendDummyInput(
        `DUPLICATE_${token.index}_${block.inputList.length}`,
      );
      flushPendingFields(duplicatePlaceholder, pendingFields);
      duplicatePlaceholder.appendField(`%${token.index}`);
      continue;
    }

    createdPlaceholders.add(token.index);
    const slot = resolveSlotDefinition(definition, view, token.index);
    const input = createInputFromSlot(block, slot, token.index);
    flushPendingFields(input, pendingFields);

    if (slot?.label) {
      input.appendField(slot.label);
    }
  }

  if (pendingFields.length > 0) {
    const trailingInput = block.appendDummyInput(
      `TRAILING_${block.inputList.length}`,
    );
    flushPendingFields(trailingInput, pendingFields);
  }

  if (block.inputList.length === 0) {
    block.appendDummyInput("LABEL").appendField(definition.identifier);
  }
}

function resolveSlotDefinition(
  definition: MorphicBlockDefinition,
  view: MorphicResolvedView,
  placeholderIndex: number,
): MorphicInputSlotDefinition | undefined {
  const key = `${placeholderIndex}`;
  return view.inputSlots?.[key] ?? definition.inputSlots?.[key];
}

function createInputFromSlot(
  block: Blockly.BlockSvg,
  slot: MorphicInputSlotDefinition | undefined,
  placeholderIndex: number,
): Blockly.Input {
  const inputName = slot?.name ?? `ARG${placeholderIndex}`;
  const kind = slot?.kind ?? "value";
  let input: Blockly.Input;

  if (kind === "dummy") {
    input = block.appendDummyInput(inputName);
  } else if (kind === "statement") {
    input = block.appendStatementInput(inputName);
    if (slot?.check) {
      input.setCheck(slot.check);
    }
  } else {
    input = block.appendValueInput(inputName);
    if (slot?.check) {
      input.setCheck(slot.check);
    }
  }

  if (slot?.align) {
    input.setAlign(resolveAlign(slot.align));
  }

  return input;
}

function resolveAlign(align: MorphicInputSlotDefinition["align"]): number {
  if (align === "right") {
    return ALIGN_RIGHT;
  }
  if (align === "centre") {
    return ALIGN_CENTRE;
  }
  return ALIGN_LEFT;
}

function flushPendingFields(
  input: Blockly.Input,
  fields: Array<string | Blockly.FieldImage>,
): void {
  for (const field of fields) {
    input.appendField(field);
  }
  fields.length = 0;
}

function captureConnectedChildren(
  block: Blockly.BlockSvg,
): Map<string, Blockly.Block> {
  const connectedChildren = new Map<string, Blockly.Block>();
  for (const input of block.inputList) {
    const target = input.connection?.targetBlock();
    if (target) {
      connectedChildren.set(input.name, target);
    }
  }
  return connectedChildren;
}

function restoreConnectedChildren(
  block: Blockly.BlockSvg,
  previousChildren: Map<string, Blockly.Block>,
): void {
  for (const [inputName, childBlock] of previousChildren) {
    const input = block.getInput(inputName);
    if (!input?.connection || input.connection.isConnected()) {
      continue;
    }

    const candidateConnections = [
      childBlock.outputConnection,
      childBlock.previousConnection,
    ];
    for (const connection of candidateConnections) {
      if (!connection) {
        continue;
      }
      try {
        input.connection.connect(connection);
        break;
      } catch {
        continue;
      }
    }
  }
}

function removeInputs(block: Blockly.BlockSvg): void {
  while (block.inputList.length > 0) {
    const firstInput = block.inputList[0];
    if (!firstInput) {
      break;
    }
    block.removeInput(firstInput.name, true);
  }
}

function applyConnections(
  block: Blockly.BlockSvg,
  definition: MorphicBlockDefinition,
): void {
  if (definition.output !== undefined) {
    applyOutputConnection(block, definition.output);
  }
  if (definition.previousStatement !== undefined) {
    applyPreviousConnection(block, definition.previousStatement);
  }
  if (definition.nextStatement !== undefined) {
    applyNextConnection(block, definition.nextStatement);
  }
}

function applyOutputConnection(
  block: Blockly.BlockSvg,
  spec: MorphicConnectionSpec,
): void {
  if (spec === false) {
    block.setOutput(false);
    return;
  }
  if (spec === true) {
    block.setOutput(true);
    return;
  }
  block.setOutput(true, spec);
}

function applyPreviousConnection(
  block: Blockly.BlockSvg,
  spec: MorphicConnectionSpec,
): void {
  if (spec === false) {
    block.setPreviousStatement(false);
    return;
  }
  if (spec === true) {
    block.setPreviousStatement(true);
    return;
  }
  block.setPreviousStatement(true, spec);
}

function applyNextConnection(
  block: Blockly.BlockSvg,
  spec: MorphicConnectionSpec,
): void {
  if (spec === false) {
    block.setNextStatement(false);
    return;
  }
  if (spec === true) {
    block.setNextStatement(true);
    return;
  }
  block.setNextStatement(true, spec);
}

function removePrefixedClasses(classList: DOMTokenList, prefix: string): void {
  const matches = Array.from(classList).filter((name) =>
    name.startsWith(prefix),
  );
  for (const match of matches) {
    classList.remove(match);
  }
}
