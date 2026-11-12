import type * as Blockly from "blockly";

/**
 * Strict slots (`"strict": true` on an input slot). Blockly lets a block
 * without a check into every slot; a strict slot takes only blocks whose
 * check matches its own, at the slot and all the way down the stack in it.
 */

const strictSlots = new WeakSet<Blockly.Connection>();

/** Mark a slot's connection as strict; a rebuilt slot is marked again. */
export function markStrictSlot(connection: Blockly.Connection): void {
  strictSlots.add(connection);
}

/**
 * Make a workspace refuse what strict slots refuse. It adds to the checker the
 * workspace has, so a checker the app plugged in keeps deciding first.
 */
export function enforceStrictSlots(workspace: Blockly.Workspace): void {
  const checker = workspace.connectionChecker;
  const doTypeChecks = checker.doTypeChecks.bind(checker);
  checker.doTypeChecks = (a, b) => doTypeChecks(a, b) && strictSlotAllows(a, b);
}

function strictSlotAllows(a: Blockly.Connection, b: Blockly.Connection): boolean {
  const [upper, lower] = a.isSuperior() ? [a, b] : [b, a];
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
