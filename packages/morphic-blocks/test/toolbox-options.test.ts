import { afterEach, describe, expect, test } from "vitest";
import { MorphicBlocks } from "../src";
import type { MorphicBlocksFormat, MorphicToolboxConfig } from "../src/morphic/types";

/** The HTML toolbox takes its label and block list from mount() too. */

const format: MorphicBlocksFormat = {
  elementTypes: { code: "code" },
  modes: [{ name: "python", elements: ["code"] }],
  blocks: [
    { identifier: "say", elements: { code: "say()" }, shape: "statement" },
    { identifier: "wait", elements: { code: "wait()" }, shape: "statement" },
  ],
};

const engines: MorphicBlocks[] = [];
const div = () => document.body.appendChild(document.createElement("div"));

afterEach(() => {
  for (const engine of engines.splice(0)) engine.dispose();
  document.body.innerHTML = "";
});

async function toolboxWith(toolbox: MorphicToolboxConfig): Promise<HTMLElement> {
  const engine = new MorphicBlocks(format, {});
  engines.push(engine);
  const container = div();
  await engine.mount({ workspaceContainer: div(), toolboxContainer: container, toolbox });
  return container;
}

const label = (toolbox: HTMLElement) => toolbox.querySelector(".morphic-toolbox-header")?.textContent;

describe("toolbox options through mount", () => {
  test("the label shows the mode by default", async () => {
    expect(label(await toolboxWith({}))).toBe("Mode: python");
  });

  test("the label can be left out, set, or built from the mode", async () => {
    expect(label(await toolboxWith({ modeLabel: false }))).toBeUndefined();
    expect(label(await toolboxWith({ modeLabel: "Blocks" }))).toBe("Blocks");
    expect(label(await toolboxWith({ modeLabel: (mode) => mode.toUpperCase() }))).toBe("PYTHON");
  });

  test("only the listed blocks are shown", async () => {
    const toolbox = await toolboxWith({ blocks: ["wait"] });
    const tiles = Array.from(toolbox.querySelectorAll("[data-block-type]")).map((tile) => tile.getAttribute("data-block-type"));

    expect(tiles).toEqual(["wait"]);
  });
});

describe("toolbox width", () => {
  test("the widest block's width is published for the app's layout", async () => {
    const toolbox = await toolboxWith({});
    const widths = Array.from(toolbox.querySelectorAll("svg")).map((svg) => Number(svg.getAttribute("width")));

    expect(toolbox.style.getPropertyValue("--morphic-toolbox-block-width")).toBe(`${Math.max(...widths)}px`);
  });
});

describe("keyword colors on text tiles", () => {
  const textFormat: MorphicBlocksFormat = {
    elementTypes: { python: "code" },
    code: { python: { highlighting: { keywords: ["print"], colors: { keyword: "#123456" } } } },
    modes: [{ name: "py", elements: ["python"] }],
    presets: [{ name: "text", toolbox: { mode: "py", render: { python: "text" } }, workspace: "py" }],
    blocks: [{ identifier: "say", elements: { python: "print(1)" }, shape: "statement" }],
  };

  async function textToolbox(toolbox: MorphicToolboxConfig): Promise<HTMLElement> {
    const engine = new MorphicBlocks(textFormat, {});
    engines.push(engine);
    const container = div();
    await engine.mount({ workspaceContainer: div(), toolboxContainer: container, toolbox });
    return container;
  }

  test("code shown as text on a tile is colored like the codespace colors it", async () => {
    const toolbox = await textToolbox({});
    const tokens = Array.from(toolbox.querySelectorAll(".morphic-element-python [class^='morphic-tok-']"));

    expect(tokens.map((t) => `${t.className}:${t.textContent}`)).toEqual(["morphic-tok-keyword:print", "morphic-tok-number:1"]);
    expect(document.querySelector('style[data-morphic-source="tile-highlight:python"]')?.textContent).toContain("#123456");
  });

  test("the colors can be switched off", async () => {
    const toolbox = await textToolbox({ highlight: false });

    expect(toolbox.querySelector(".morphic-element-python")?.textContent).toBe("print(1)");
    expect(toolbox.querySelector("[class^='morphic-tok-']")).toBeNull();
  });
});
