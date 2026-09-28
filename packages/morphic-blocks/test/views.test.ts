import { afterEach, describe, expect, test } from "vitest";
import { MorphicBlocks } from "../src";
import type { MorphicBlocksFormat } from "../src/morphic/types";

/** Views added beside the ones mount() sets up, each in its own mode. */

const format: MorphicBlocksFormat = {
  elementTypes: { title: "text", python: "code", javascript: "code" },
  modes: [
    { name: "py", elements: ["python"] },
    { name: "js", elements: ["javascript"] },
    { name: "plain", elements: ["title"] },
  ],
  blocks: [
    { identifier: "say", elements: { title: "Say", python: "print()", javascript: "console.log();" }, shape: "statement" },
  ],
};

const engines: MorphicBlocks[] = [];
const div = () => document.body.appendChild(document.createElement("div"));
const text = (container: HTMLElement) => container.querySelector(".cm-content")?.textContent;
// The views write a new block after a short debounce.
const settle = () => new Promise((resolve) => setTimeout(resolve, 300));

async function mountEngine(): Promise<MorphicBlocks> {
  const engine = new MorphicBlocks(format, { say: () => "" });
  engines.push(engine);
  await engine.mount({ workspaceContainer: div() });
  engine.getWorkspace()!.newBlock("morphic:say");
  return engine;
}

afterEach(() => {
  for (const engine of engines.splice(0)) engine.dispose();
  document.body.innerHTML = "";
});

describe("added previews", () => {
  test("each preview shows the program in its own mode", async () => {
    const engine = await mountEngine();
    const python = div();
    const javascript = div();

    await engine.addView({ kind: "preview", container: python, mode: "py" }).ready;
    await engine.addView({ kind: "preview", container: javascript, mode: "js" }).ready;

    expect(text(python)).toBe("print()");
    expect(text(javascript)).toBe("console.log();");
    expect(javascript.classList).toContain("morphic-mode-js");
  });

  test("a preview's mode can change, and it can be removed", async () => {
    const engine = await mountEngine();
    const container = div();
    const view = engine.addView({ kind: "preview", container, mode: "py" });
    await view.ready;

    view.setMode("js");
    await settle();
    expect(text(container)).toBe("console.log();");
    expect(view.getMode()).toBe("js");

    view.dispose();
    expect(container.querySelector(".cm-editor")).toBeNull();
  });

  test("a new mount removes the added views", async () => {
    const engine = await mountEngine();
    const container = div();
    await engine.addView({ kind: "preview", container, mode: "py" }).ready;

    await engine.mount({ workspaceContainer: div() });

    expect(container.querySelector(".cm-editor")).toBeNull();
  });

  test("names are unique and modes must render text", async () => {
    const engine = await mountEngine();
    engine.addView({ kind: "preview", container: div(), mode: "py", name: "right" });

    expect(() => engine.addView({ kind: "preview", container: div(), mode: "js", name: "right" })).toThrow(
      /named "right" already exists/,
    );
    expect(() => engine.addView({ kind: "preview", container: div(), mode: "nope" })).toThrow(/unknown mode "nope"/);
    expect(() => engine.addView({ kind: "preview", container: div(), mode: "plain" })).toThrow(/no code element/);
  });
});
