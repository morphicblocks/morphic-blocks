import { afterEach, describe, expect, test } from "vitest";
import type * as Blockly from "blockly";
import { MorphicBlocks } from "../src";
import type { MorphicBlocksFormat } from "../src/morphic/types";

/** Text views mark the lines of each group of connected blocks with classes. */

const format: MorphicBlocksFormat = {
  elementTypes: { python: "code" },
  modes: [{ name: "py", elements: ["python"] }],
  blocks: [{ identifier: "say", elements: { python: "say()" }, shape: "statement" }],
};

const engines: MorphicBlocks[] = [];
const div = () => document.body.appendChild(document.createElement("div"));
// The codespace writes its text after a short pause.
const settle = () => new Promise((resolve) => setTimeout(resolve, 300));

afterEach(() => {
  for (const engine of engines.splice(0)) engine.dispose();
  document.body.innerHTML = "";
});

async function setUp() {
  const engine = new MorphicBlocks(format, {});
  engines.push(engine);
  const codespace = div();
  await engine.mount({ workspaceContainer: div(), codespaceContainer: codespace });
  engine.setModes({ codespaceMode: "py" });
  const workspace = engine.getWorkspace()!;
  const place = (y: number) => {
    const block = workspace.newBlock("morphic:say") as Blockly.BlockSvg;
    block.moveBy(0, y);
    block.initSvg();
    block.render();
    return block;
  };
  // Two connected blocks, then a block of its own.
  const first = place(0);
  first.nextConnection!.connect(place(0).previousConnection!);
  place(500);
  await settle();
  const classesOf = (selector: string) =>
    Array.from(codespace.querySelectorAll(selector), (element) =>
      Array.from(element.classList)
        .filter((name) => name.startsWith("morphic-group"))
        .sort()
        .join(" "),
    );
  return { codespace, classesOf };
}

describe("groups of blocks in text views", () => {
  test("mark where each group starts and ends, and every other group", async () => {
    const { codespace, classesOf } = await setUp();

    expect(codespace.querySelector(".cm-content")?.textContent).toBe("say()say()say()");
    expect(classesOf(".cm-line")).toEqual([
      "morphic-group-line morphic-group-odd morphic-group-start",
      "morphic-group-end morphic-group-line morphic-group-odd",
      "morphic-group-end morphic-group-even morphic-group-start",
    ]);
  });

  test("put the same classes on the line numbers", async () => {
    const { classesOf } = await setUp();

    const numbers = classesOf(".cm-lineNumbers .cm-gutterElement").filter(Boolean);
    expect(numbers).toEqual([
      "morphic-group-line morphic-group-odd morphic-group-start",
      "morphic-group-end morphic-group-line morphic-group-odd",
      "morphic-group-end morphic-group-even morphic-group-start",
    ]);
  });
});
