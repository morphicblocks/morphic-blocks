/**
 * Wait until Blockly has handed out the events of the last change, and the
 * ones their listeners caused, so a test's next step (an undo) finds the
 * workspace as a person would after a moment. Blockly fires events a frame
 * and a tick after the change; a shorter wait is not enough on a busy machine.
 */
export async function settle(): Promise<void> {
  for (let round = 0; round < 3; round++) await new Promise((resolve) => setTimeout(resolve, 30));
}
