import { afterEach, expect, test } from "vitest";
import { MorphicBlocks } from "../src";
import type { MorphicBlocksFormat } from "../src/morphic/types";

const format: MorphicBlocksFormat = {
  elementTypes: { code: "code" },
  modes: [{ name: "only", elements: ["code"] }],
  blocks: [{ identifier: "say", elements: { code: "say()" }, shape: "statement" }],
};

const engines: MorphicBlocks[] = [];

afterEach(() => {
  for (const engine of engines.splice(0)) engine.dispose();
  document.body.innerHTML = "";
});

test("a read only workspace mounts without a toolbox", async () => {
  const engine = new MorphicBlocks(format, { say: () => "say();\n" });
  engines.push(engine);
  await engine.mount({
    workspaceContainer: document.body.appendChild(document.createElement("div")),
    blockly: { readOnly: true },
  });
  expect(engine.getWorkspace()?.options.readOnly).toBe(true);
});
