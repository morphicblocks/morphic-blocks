// Value import: `Blockly.INPUT_VALUE` is needed at runtime to detect which
// inputs are value slots when deciding whether an operand needs parentheses.
import * as Blockly from "blockly";
import { Order, javascriptGenerator, type JavascriptGenerator } from "blockly/javascript";
import { getCodeBehavior } from "./behavior-runtime";
import { toBlocklyType, toCleanId } from "./block-namespace";
import { getManagedBlockMode } from "./block-view";
import type {
  MorphicBehaviorMap,
  MorphicBehaviorProxy,
  MorphicBlockDefinition,
  MorphicCodeGenerationResult,
  MorphicCodeMetadata,
  MorphicJavaScriptConfig,
  MorphicRenderContext
} from "./types";

interface MorphicGeneratorState {
  behaviors: MorphicBehaviorMap;
  definitions: ReadonlyMap<string, MorphicBlockDefinition>;
}

export function generateJavaScriptFromWorkspace(
  workspace: Blockly.WorkspaceSvg,
  definitions: ReadonlyMap<string, MorphicBlockDefinition>,
  behaviors: MorphicBehaviorMap,
  config?: MorphicJavaScriptConfig
): string {
  const state: MorphicGeneratorState = { behaviors, definitions };
  configureJavascriptGenerator(javascriptGenerator, state, config, false);
  return javascriptGenerator.workspaceToCode(workspace);
}

export function generateJavaScriptWithMetadataFromWorkspace(
  workspace: Blockly.WorkspaceSvg,
  definitions: ReadonlyMap<string, MorphicBlockDefinition>,
  behaviors: MorphicBehaviorMap,
  config?: MorphicJavaScriptConfig
): MorphicCodeGenerationResult {
  const state: MorphicGeneratorState = { behaviors, definitions };
  configureJavascriptGenerator(javascriptGenerator, state, config, true);
  const rawCode = javascriptGenerator.workspaceToCode(workspace);
  return extractMetadata(rawCode);
}

const MARKER_PREFIX = "// __MORPHIC_BLOCK_START:";
const MARKER_SUFFIX = "// __MORPHIC_BLOCK_END:";
const MARKER_DELIM = "__";

function configureJavascriptGenerator(
  generator: JavascriptGenerator,
  state: MorphicGeneratorState,
  config?: MorphicJavaScriptConfig,
  injectMarkers = false,
): void {
  generator.STATEMENT_PREFIX = config?.statementPrefix ?? null;
  generator.STATEMENT_SUFFIX = config?.statementSuffix ?? null;
  generator.INFINITE_LOOP_TRAP = config?.infiniteLoopTrap ?? null;
  if (config?.reservedWords) {
    generator.addReservedWords(config.reservedWords);
  }

  for (const [type, definition] of state.definitions) {
    const behavior = getCodeBehavior(state.behaviors[type]);

    generator.forBlock[toBlocklyType(type)] = (block, activeGenerator) => {
      const proxy = createBehaviorProxy(block, activeGenerator);
      const rawCode = behavior ? behavior(proxy) : fallbackCode(type, definition);
      if (isValueBlock(block, definition)) {
        return [normalizeValueCode(rawCode), Order.NONE];
      }
      const code = normalizeStatementCode(rawCode);
      if (injectMarkers) {
        return `${MARKER_PREFIX}${block.id}${MARKER_DELIM}\n${code}${MARKER_SUFFIX}${block.id}${MARKER_DELIM}\n`;
      }
      return code;
    };
  }
}

function createBehaviorProxy(block: Blockly.Block, generator: JavascriptGenerator): MorphicBehaviorProxy {
  const inputs: Record<string, string> = {};
  const fields: Record<string, string> = {};
  const context: MorphicRenderContext = block.workspace.isFlyout ? "toolbox" : "workspace";
  // Operands are bracketed only when this block composes several values, i.e.
  // they sit either side of an operator. A block with one value input holds a
  // whole sub-expression (`console.log(%1)`) and needs no extra brackets.
  const composesSeveralValues = countValueInputs(block) >= 2;

  for (const input of block.inputList) {
    const targetBlock = input.connection?.targetBlock();
    if (targetBlock) {
      if (targetBlock.outputConnection) {
        const code = generator.valueToCode(block, input.name, Order.NONE) || "undefined";
        inputs[input.name] =
          composesSeveralValues ? parenthesizeOperand(code, targetBlock) : code;
      } else {
        inputs[input.name] = generator.statementToCode(block, input.name).trimEnd();
      }
    }

    for (const field of input.fieldRow) {
      if (!field.name) {
        continue;
      }
      fields[field.name] = stringifyFieldValue(field.getValue());
    }
  }

  return {
    blockId: block.id,
    blockType: toCleanId(block.type),
    mode: getManagedBlockMode(block) ?? "default",
    context,
    inputs,
    fields
  };
}

/**
 * Parenthesise a value operand when the block that produced it composes other
 * values of its own.
 *
 * Morphic blocks report `Order.NONE` and request their operands at
 * `Order.NONE`, so Blockly's own precedence handling never wraps anything —
 * a `%1 %OP %2` block nested inside another emits `2 * 3 + 4` for a workspace
 * that reads `2 * (3 + 4)`. Rather than requiring every block to declare a
 * precedence (which a block with an operator *dropdown* cannot express as a
 * single value, since `+` and `*` differ), any operand that is itself
 * composed gets wrapped. Over-parenthesising is never incorrect, and the
 * brackets mirror the block structure: what sits inside one pair of
 * parentheses is exactly what sits inside one block.
 *
 * Blocks with no value inputs — numbers, strings, booleans, variable getters,
 * and Blockly's stock literal blocks — are atomic and pass through untouched.
 */
function parenthesizeOperand(code: string, target: Blockly.Block): string {
  if (!composesValues(target) || isAlreadyWrapped(code)) {
    return code;
  }
  return `(${code})`;
}

function composesValues(block: Blockly.Block): boolean {
  return countValueInputs(block) > 0;
}

function countValueInputs(block: Blockly.Block): number {
  return block.inputList.filter(
    (input) => input.connection?.type === Blockly.INPUT_VALUE,
  ).length;
}

/**
 * True when the whole string is already enclosed in one matched pair of
 * parentheses, so `(a + b)` is not re-wrapped while `(a) + (b)` still is.
 */
function isAlreadyWrapped(code: string): boolean {
  if (!code.startsWith("(") || !code.endsWith(")")) {
    return false;
  }
  let depth = 0;
  for (let index = 0; index < code.length; index++) {
    const char = code[index];
    if (char === "(") {
      depth++;
    } else if (char === ")") {
      depth--;
      if (depth === 0) {
        return index === code.length - 1;
      }
    }
  }
  return false;
}

function isValueBlock(block: Blockly.Block, definition: MorphicBlockDefinition): boolean {
  if (block.outputConnection) {
    return true;
  }
  if (definition.output === false) {
    return false;
  }
  return definition.output !== undefined;
}

function normalizeStatementCode(code: string): string {
  const trimmed = code.trim();
  if (!trimmed) {
    return "";
  }
  if (trimmed.endsWith(";") || trimmed.endsWith("}") || trimmed.endsWith("\n")) {
    return `${trimmed}\n`;
  }
  return `${trimmed};\n`;
}

function normalizeValueCode(code: string): string {
  const trimmed = code.trim();
  if (!trimmed) {
    return "undefined";
  }
  return trimmed.endsWith(";") ? trimmed.slice(0, -1) : trimmed;
}

function fallbackCode(type: string, definition: MorphicBlockDefinition): string {
  if (definition.output !== undefined && definition.output !== false) {
    return "undefined";
  }
  return `// No generator behavior defined for "${type}"`;
}

function stringifyFieldValue(value: unknown): string {
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (typeof value === "string") {
    if (/^-?\d+(\.\d+)?$/.test(value)) {
      return value;
    }
    if (value === "TRUE") {
      return "true";
    }
    if (value === "FALSE") {
      return "false";
    }
    return JSON.stringify(value);
  }
  return JSON.stringify(String(value ?? ""));
}

const MARKER_START_RE = /^\s*\/\/ __MORPHIC_BLOCK_START:(.+)__$/;
const MARKER_END_RE = /^\s*\/\/ __MORPHIC_BLOCK_END:(.+)__$/;

function extractMetadata(rawCode: string): MorphicCodeGenerationResult {
  const lines = rawCode.split("\n");
  const cleanLines: string[] = [];
  const metadata: MorphicCodeMetadata = new Map();
  const openBlocks = new Map<string, number>();

  let cleanLineNum = 0;

  for (const line of lines) {
    const startMatch = line.match(MARKER_START_RE);
    if (startMatch) {
      openBlocks.set(startMatch[1]!, cleanLineNum + 1);
      continue;
    }

    const endMatch = line.match(MARKER_END_RE);
    if (endMatch) {
      const blockId = endMatch[1]!;
      const startLine = openBlocks.get(blockId);
      if (startLine !== undefined) {
        metadata.set(blockId, { startLine, endLine: cleanLineNum });
        openBlocks.delete(blockId);
      }
      continue;
    }

    cleanLines.push(line);
    cleanLineNum++;
  }

  return { code: cleanLines.join("\n"), metadata, placeholders: [] };
}
