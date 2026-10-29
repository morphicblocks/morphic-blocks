import { afterEach, expect, test } from "vitest";
import { MorphicBlocks } from "../src";
import type { MorphicBlocksFormat } from "../src/morphic/types";

/** A host hands the program its own functions by name with `runJavaScript({ globals })`. */

const format: MorphicBlocksFormat = {
  elementTypes: { javascript: "code" },
  modes: [{ name: "js", elements: ["javascript"] }],
  blocks: [{ identifier: "forward", elements: { javascript: "forward()" }, shape: "statement" }],
};

const engines: MorphicBlocks[] = [];

afterEach(() => {
  for (const engine of engines.splice(0)) engine.dispose();
  document.body.innerHTML = "";
});

async function programWithForward(): Promise<MorphicBlocks> {
  const engine = new MorphicBlocks(format, { forward: () => "turtle.forward(10);\n" });
  engines.push(engine);
  await engine.mount({ workspaceContainer: document.body.appendChild(document.createElement("div")) });
  engine.getWorkspace()!.newBlock("morphic:forward");
  return engine;
}

test("the program calls a function the host passes in", async () => {
  const engine = await programWithForward();
  const steps: number[] = [];

  const { error } = engine.runJavaScript({ globals: { turtle: { forward: (n: number) => steps.push(n) } } });

  expect(error).toBeNull();
  expect(steps).toEqual([10]);
});

test("without the global the program fails with an error", async () => {
  const engine = await programWithForward();

  expect(engine.runJavaScript().error).toBeInstanceOf(ReferenceError);
});

test("a name that is not a JavaScript name is an error", async () => {
  const engine = await programWithForward();

  expect(engine.runJavaScript({ globals: { "my-turtle": {} } }).error?.message).toBe(
    'globals: "my-turtle" is not a JavaScript name',
  );
});

test("console is left to the console option", async () => {
  const engine = await programWithForward();

  expect(engine.runJavaScript({ globals: { console: {} } }).error?.message).toContain("console option");
});
