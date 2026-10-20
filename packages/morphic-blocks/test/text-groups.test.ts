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
  engine.show({ views: { codespace: "py" } });
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

describe("line numbers after outside CSS", () => {
  test("are measured again when a line changes size", async () => {
    // jsdom has no ResizeObserver: record what is watched, and resize by hand.
    const observers: { callback: () => void; boxes: string[] }[] = [];
    const original = globalThis.ResizeObserver;
    globalThis.ResizeObserver = class {
      private readonly record: { callback: () => void; boxes: string[] };
      constructor(callback: () => void) {
        this.record = { callback, boxes: [] };
        observers.push(this.record);
      }
      observe(_target: Element, options?: { box?: string }) {
        this.record.boxes.push(options?.box ?? "content-box");
      }
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver;
    try {
      const engine = new MorphicBlocks(format, {});
      engines.push(engine);
      await engine.mount({ workspaceContainer: div(), codespaceContainer: div() });
      await settle();
      const view = (engine as unknown as { codespace: { editorView: { requestMeasure(): void } } }).codespace.editorView;
      let measured = 0;
      const requestMeasure = view.requestMeasure.bind(view);
      view.requestMeasure = (...args: unknown[]) => {
        if (args.length === 0) measured++;
        return requestMeasure(...(args as []));
      };
      const lines = observers.find((observer) => observer.boxes.includes("border-box"));

      expect(lines).toBeDefined();
      lines!.callback();
      expect(measured).toBe(1);
    } finally {
      globalThis.ResizeObserver = original;
    }
  });
});
