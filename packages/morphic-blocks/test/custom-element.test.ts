import { afterEach, describe, expect, test, vi } from "vitest";
import { MorphicBlocks } from "../src";
import type { MorphicBlocksFormat, MorphicElementRenderer } from "../src/morphic/types";

/** A custom element is drawn on toolbox tiles by the app's renderer. */

const format: MorphicBlocksFormat = {
  elementTypes: { title: "text", block: "code", info: "custom" },
  modes: [
    { name: "novice", elements: ["title", "block", "info"] },
    { name: "expert", elements: ["block"] },
  ],
  blocks: [{ identifier: "say", elements: { title: "Say", block: "say", info: "Writes a message" }, shape: "statement" }],
};

const engines: MorphicBlocks[] = [];
const div = () => document.body.appendChild(document.createElement("div"));

afterEach(() => {
  for (const engine of engines.splice(0)) engine.dispose();
  document.body.innerHTML = "";
});

const infoButton: MorphicElementRenderer = (content) => {
  const button = document.createElement("button");
  button.textContent = "i";
  button.title = content;
  return button;
};

async function toolbox(renderers?: Record<string, MorphicElementRenderer>, onWarning = vi.fn()) {
  const engine = new MorphicBlocks(format, {});
  engines.push(engine);
  const container = div();
  await engine.mount({ workspaceContainer: div(), toolboxContainer: container, toolbox: { custom: renderers }, onWarning });
  const tile = () => container.querySelector<HTMLElement>('[data-block-type="say"]')!;
  const info = () => tile().querySelector<HTMLElement>(".morphic-element-info")!;
  return { engine, tile, info, onWarning };
}

describe("a custom element", () => {
  test("is drawn by its renderer with the block's content", async () => {
    const renderer = vi.fn(infoButton);
    const { info } = await toolbox({ info: renderer });

    expect(info().querySelector("button")?.title).toBe("Writes a message");
    expect(renderer).toHaveBeenCalledWith("Writes a message", { block: "say", element: "info", mode: "novice" });
  });

  test("is drawn again when the toolbox mode switches", async () => {
    const renderer = vi.fn(infoButton);
    const { engine } = await toolbox({ info: renderer });
    renderer.mockClear();

    engine.show({ toolbox: "expert" });

    expect(renderer).toHaveBeenCalledWith("Writes a message", { block: "say", element: "info", mode: "expert" });
  });

  test("Enter on its button does not add the block", async () => {
    const { engine, info } = await toolbox({ info: infoButton });
    const button = info().querySelector("button")!;

    button.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));

    expect(engine.getWorkspace()!.getAllBlocks(false)).toHaveLength(0);
  });

  test("a press on its button does not drag the tile", async () => {
    const { tile, info } = await toolbox({ info: infoButton });
    const button = info().querySelector("button")!;
    button.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    const drag = new Event("dragstart", { bubbles: true, cancelable: true });

    tile().dispatchEvent(drag);

    expect(drag.defaultPrevented).toBe(true);
  });

  test("leaves the tile's name to its own controls", async () => {
    const { tile } = await toolbox({ info: infoButton });

    expect(tile().getAttribute("aria-label")).not.toContain("Writes a message");
  });

  test("without a renderer shows its content as text and warns", async () => {
    const { info, onWarning } = await toolbox();

    expect(info().textContent).toBe("Writes a message");
    expect(onWarning).toHaveBeenCalledWith(expect.stringContaining('"info" has no function'));
  });
});
