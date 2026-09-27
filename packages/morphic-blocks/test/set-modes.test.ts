import { afterEach, describe, expect, test } from "vitest";
import { MorphicBlocks } from "../src";
import type { MorphicBlocksFormat } from "../src/morphic/types";

/** Each view follows only its own mode. */

const format: MorphicBlocksFormat = {
  elementTypes: { code: "code" },
  modes: [
    { name: "one", elements: ["code"] },
    { name: "two", elements: ["code"] },
  ],
  blocks: [{ identifier: "say", elements: { code: "say()" }, shape: "statement" }],
};

const engines: MorphicBlocks[] = [];
const div = () => document.body.appendChild(document.createElement("div"));

afterEach(() => {
  for (const engine of engines.splice(0)) engine.dispose();
  document.body.innerHTML = "";
});

describe("setModes", () => {
  test("a toolbox mode change leaves workspace blocks alone", async () => {
    const engine = new MorphicBlocks(format, { say: () => "say();\n" });
    engines.push(engine);
    await engine.mount({ workspaceContainer: div(), toolboxContainer: div() });
    const block = engine.getWorkspace()!.newBlock("morphic:say");
    block.initSvg();
    block.render();
    let redraws = 0;
    const render = block.render.bind(block);
    block.render = () => {
      redraws++;
      render();
    };

    engine.setModes({ toolboxMode: "two" });
    expect(redraws).toBe(0);

    engine.setModes({ workspaceMode: "two" });
    expect(redraws).toBe(1);
  });
});
