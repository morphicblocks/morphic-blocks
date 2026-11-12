import { afterEach, expect, test } from "vitest";
import { MorphicBlocks } from "../src";
import type { MorphicBlocksFormat } from "../src/morphic/types";

/** `generateText(element)` returns the program as a code element writes it, with or without a view of it. */

const format: MorphicBlocksFormat = {
  elementTypes: { python: "code", go: "code", title: "text" },
  modes: [{ name: "in-python", elements: ["python"] }],
  blocks: [{ identifier: "say", elements: { python: "print(%WORD)", go: "fmt.Println(%WORD)", title: "Say" }, fields: { WORD: { type: "text", default: "hi" } }, shape: "statement" }],
};

const engines: MorphicBlocks[] = [];
afterEach(() => {
  for (const engine of engines.splice(0)) engine.dispose();
  document.body.innerHTML = "";
});

test("writes the program in any code element", async () => {
  const engine = new MorphicBlocks(format, {});
  engines.push(engine);
  await engine.mount({ workspaceContainer: document.body.appendChild(document.createElement("div")) });
  const workspace = engine.getWorkspace()!;
  workspace.newBlock("morphic:say").nextConnection!.connect(workspace.newBlock("morphic:say").previousConnection!);

  expect(engine.generateText("python")).toBe("print(hi)\nprint(hi)");
  expect(engine.generateText("go")).toBe("fmt.Println(hi)\nfmt.Println(hi)");
  expect(() => engine.generateText("title")).toThrow(/title/);
});
