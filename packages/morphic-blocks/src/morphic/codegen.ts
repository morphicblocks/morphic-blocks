import type * as Blockly from "blockly";
import { Order, javascriptGenerator, type JavascriptGenerator } from "blockly/javascript";
import { getCodeBehavior } from "./behavior-runtime";
import { getManagedBlockMode } from "./block-view";
import type {
  MorphicBehaviorMap,
  MorphicBehaviorProxy,
  MorphicBlockDefinition,
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
  configureJavascriptGenerator(javascriptGenerator, state, config);
  return javascriptGenerator.workspaceToCode(workspace);
}

function configureJavascriptGenerator(
  generator: JavascriptGenerator,
  state: MorphicGeneratorState,
  config?: MorphicJavaScriptConfig
): void {
  generator.STATEMENT_PREFIX = config?.statementPrefix ?? null;
  generator.STATEMENT_SUFFIX = config?.statementSuffix ?? null;
  generator.INFINITE_LOOP_TRAP = config?.infiniteLoopTrap ?? null;
  if (config?.reservedWords) {
    generator.addReservedWords(config.reservedWords);
  }

  for (const [type, definition] of state.definitions) {
    const behavior = getCodeBehavior(state.behaviors[type]);

    generator.forBlock[type] = (block, activeGenerator) => {
      const proxy = createBehaviorProxy(block, activeGenerator);
      const rawCode = behavior ? behavior(proxy) : fallbackCode(type, definition);
      if (isValueBlock(block, definition)) {
        return [normalizeValueCode(rawCode), Order.NONE];
      }
      return normalizeStatementCode(rawCode);
    };
  }
}

function createBehaviorProxy(block: Blockly.Block, generator: JavascriptGenerator): MorphicBehaviorProxy {
  const inputs: Record<string, string> = {};
  const fields: Record<string, string> = {};
  const context: MorphicRenderContext = block.workspace.isFlyout ? "toolbox" : "workspace";

  for (const input of block.inputList) {
    const targetBlock = input.connection?.targetBlock();
    if (targetBlock) {
      if (targetBlock.outputConnection) {
        inputs[input.name] = generator.valueToCode(block, input.name, Order.NONE) || "undefined";
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
    blockType: block.type,
    mode: getManagedBlockMode(block) ?? "default",
    context,
    inputs,
    fields
  };
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
