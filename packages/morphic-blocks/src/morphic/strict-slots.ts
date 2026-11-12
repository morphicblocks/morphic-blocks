import type * as Blockly from "blockly";

/**
 * Strict slots and blocks (`"strict": true`). Blockly lets a block without a
 * check into every slot, and a block with a check into every place without
 * one. A strict slot takes only blocks whose check matches its own, at the
 * slot and all the way down the stack in it; a strict block goes only where
 * the place above it has a check that matches its own.
 */

const strictSlots = new WeakSet<Blockly.Connection>();
const strictBlocks = new WeakSet<Blockly.Connection>();

/** Mark a slot's connection as strict; a rebuilt slot is marked again. */
export function markStrictSlot(connection: Blockly.Connection): void {
  strictSlots.add(connection);
}

/** Mark the connection a block hangs by (above it, or its output) as strict. */
export function markStrictBlock(block: Blockly.Block): void {
  for (const connection of [block.previousConnection, block.outputConnection]) {
    if (connection) strictBlocks.add(connection);
  }
}

/**
 * Make a workspace refuse what strict slots and blocks refuse. It adds to the checker the
 * workspace has, so a checker the app plugged in keeps deciding first.
 */
export function enforceStrictSlots(workspace: Blockly.Workspace): void {
  const checker = workspace.connectionChecker;
  const doTypeChecks = checker.doTypeChecks.bind(checker);
  checker.doTypeChecks = (a, b) => doTypeChecks(a, b) && strictSlotAllows(a, b);
}

function strictSlotAllows(a: Blockly.Connection, b: Blockly.Connection): boolean {
  const [upper, lower] = a.isSuperior() ? [a, b] : [b, a];
  // Blockly has compared the checks already; a strict block also needs one above it.
  if (strictBlocks.has(lower) && !upper.getCheck()) return false;
  const slot = slotAbove(upper);
  if (!slot || !strictSlots.has(slot)) return true;
  const allowed = slot.getCheck();
  if (!allowed) return false;
  const fits = (connection: Blockly.Connection | null): boolean => {
    const offered = connection?.getCheck();
    return !!offered && offered.some((check) => allowed.includes(check));
  };
  // A value comes alone. A statement brings the stack below it into the slot too.
  if (lower !== lower.getSourceBlock().previousConnection) return fits(lower);
  for (let block: Blockly.Block | null = lower.getSourceBlock(); block; block = block.getNextBlock()) {
    if (!fits(block.previousConnection)) return false;
  }
  return true;
}

/** The slot a connection belongs to: itself, or the one its stack hangs in. */
function slotAbove(connection: Blockly.Connection): Blockly.Connection | null {
  let current = connection;
  for (;;) {
    if (current.getParentInput()) return current;
    const above = current.getSourceBlock().previousConnection?.targetConnection;
    if (!above) return null;
    current = above;
  }
}
