import * as Blockly from "blockly";

/**
 * A block of a test program, written short: its fields, the blocks in its
 * slots (one block, or a stack for a statement slot), and how many entries
 * its repeating slots have.
 */
export interface ProgramBlock {
  type: string;
  fields?: Record<string, string | number>;
  inputs?: Record<string, ProgramBlock | ProgramBlock[]>;
  repeat?: Record<string, number>;
}

export const block = (
  type: string,
  fields: ProgramBlock["fields"] = {},
  inputs: ProgramBlock["inputs"] = {},
  repeat?: ProgramBlock["repeat"],
): ProgramBlock => ({ type, fields, inputs, repeat });

type State = Blockly.serialization.blocks.State;

function toState(program: ProgramBlock | ProgramBlock[]): State {
  const [first, ...rest] = Array.isArray(program) ? program : [program];
  const state: State = { type: `morphic:${first!.type}`, fields: first!.fields ?? {} };
  if (first!.repeat) state.extraState = { repeat: first!.repeat };
  const inputs = Object.entries(first!.inputs ?? {});
  if (inputs.length > 0) state.inputs = Object.fromEntries(inputs.map(([name, held]) => [name, { block: toState(held) }]));
  if (rest.length > 0) state.next = { block: toState(rest) };
  return state;
}

/** Load a stack of blocks as the whole program of a workspace. */
export function loadProgram(workspace: Blockly.Workspace, stack: ProgramBlock[]): void {
  Blockly.serialization.workspaces.load({ blocks: { languageVersion: 0, blocks: [{ ...toState(stack), x: 0, y: 0 }] } }, workspace);
}
