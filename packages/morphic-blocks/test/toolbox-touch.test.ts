import { afterEach, describe, expect, test, vi } from "vitest";
import { MorphicBlocks } from "../src";
import type { MorphicBlocksFormat, MorphicToolboxConfig } from "../src/morphic/types";

/** A tile dragged with a finger or pen lands where HTML drag and drop cannot reach. */

const format: MorphicBlocksFormat = {
  elementTypes: { code: "code" },
  modes: [{ name: "python", elements: ["code"] }],
  blocks: [{ identifier: "say", elements: { code: "say()" }, shape: "statement" }],
};

const engines: MorphicBlocks[] = [];
const div = () => document.body.appendChild(document.createElement("div"));

afterEach(() => {
  for (const engine of engines.splice(0)) engine.dispose();
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

/** jsdom has no PointerEvent, so a mouse event carries the pointer fields. */
function pointer(type: string, x: number, y: number, pointerType = "touch"): Event {
  const event = new MouseEvent(type, { bubbles: true, clientX: x, clientY: y });
  Object.assign(event, { pointerId: 1, pointerType, isPrimary: true });
  return event;
}

/** Drag the tile from (0, 0) to (100, 0) with the finger over `under`. */
function drag(tile: Element, under: Element, pointerType = "touch"): void {
  document.elementFromPoint = () => under;
  tile.dispatchEvent(pointer("pointerdown", 0, 0, pointerType));
  tile.dispatchEvent(pointer("pointermove", 50, 0, pointerType));
  tile.dispatchEvent(pointer("pointerup", 100, 0, pointerType));
}

async function setUp(toolbox: MorphicToolboxConfig = {}, codespace = false) {
  const engine = new MorphicBlocks(format, {});
  engines.push(engine);
  const workspaceContainer = div();
  const toolboxContainer = div();
  const codespaceContainer = codespace ? div() : undefined;
  await engine.mount({ workspaceContainer, toolboxContainer, codespaceContainer, toolbox });
  const tile = toolboxContainer.querySelector('[data-block-type="say"]')!;
  const blocks = () => engine.getWorkspace()!.getAllBlocks(false).length;
  return { engine, tile, workspaceContainer, codespaceContainer, blocks };
}

describe("dragging tiles with touch and pen", () => {
  test("a tile dropped on the workspace adds its block", async () => {
    const { tile, workspaceContainer, blocks } = await setUp();

    drag(tile, workspaceContainer);

    expect(blocks()).toBe(1);
  });

  test("a pen drags like a finger", async () => {
    const { tile, workspaceContainer, blocks } = await setUp();

    drag(tile, workspaceContainer, "pen");

    expect(blocks()).toBe(1);
  });

  test("a tile dropped on the codespace goes to the codespace", async () => {
    const { engine, tile, codespaceContainer, blocks } = await setUp({}, true);
    const targets = (engine as unknown as { tileDropTargets: Set<{ drop: (type: string, x: number, y: number) => void }> })
      .tileDropTargets;
    const [target] = [...targets];
    const drop = vi.spyOn(target, "drop").mockImplementation(() => {});

    drag(tile, codespaceContainer!.firstElementChild ?? codespaceContainer!);

    expect(drop).toHaveBeenCalledWith("say", 100, 0);
    expect(blocks()).toBe(0);
  });

  test("the copy under the finger ignores transitions the app gives its tiles", async () => {
    const { tile, workspaceContainer } = await setUp();
    document.elementFromPoint = () => workspaceContainer;

    tile.dispatchEvent(pointer("pointerdown", 0, 0));
    tile.dispatchEvent(pointer("pointermove", 50, 0));

    const ghost = document.querySelector<HTMLElement>(".morphic-drag-ghost");
    expect(ghost?.style.transition).toBe("none");
    tile.dispatchEvent(pointer("pointerup", 50, 0));
  });

  test("a short tap adds nothing", async () => {
    const { tile, workspaceContainer, blocks } = await setUp();
    document.elementFromPoint = () => workspaceContainer;

    tile.dispatchEvent(pointer("pointerdown", 0, 0));
    tile.dispatchEvent(pointer("pointerup", 2, 0));

    expect(blocks()).toBe(0);
  });

  test("an up or down swipe leaves the toolbox to scroll", async () => {
    const { tile, workspaceContainer, blocks } = await setUp();
    document.elementFromPoint = () => workspaceContainer;

    tile.dispatchEvent(pointer("pointerdown", 0, 0));
    tile.dispatchEvent(pointer("pointermove", 10, 60));
    tile.dispatchEvent(pointer("pointerup", 10, 60));

    expect(blocks()).toBe(0);
  });

  test("the mouse keeps HTML drag and drop", async () => {
    const { tile, workspaceContainer, blocks } = await setUp();

    drag(tile, workspaceContainer, "mouse");

    expect(blocks()).toBe(0);
  });

  test("touch dragging can be turned off", async () => {
    const { tile, workspaceContainer, blocks } = await setUp({ touch: false });

    drag(tile, workspaceContainer);

    expect(blocks()).toBe(0);
  });
});
