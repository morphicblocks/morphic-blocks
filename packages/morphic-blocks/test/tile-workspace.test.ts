import { afterEach, describe, expect, test } from "vitest";
import * as Blockly from "blockly";
import { MorphicBlocks } from "../src";
import type { MorphicBlocksFormat, MorphicMountConfig } from "../src/morphic/types";

/**
 * Toolbox tiles are drawn in a hidden Blockly workspace. It must follow the
 * host's Blockly settings, so it never loads files from a server the host
 * did not choose.
 */

const format: MorphicBlocksFormat = {
  elementTypes: { code: "code" },
  modes: [{ name: "only", elements: ["code"] }],
  blocks: [{ identifier: "say", elements: { code: "say()" }, shape: "statement" }],
};

const engines: MorphicBlocks[] = [];
const div = () => document.body.appendChild(document.createElement("div"));

function mountWith(blockly: MorphicMountConfig["blockly"]): { main: Blockly.WorkspaceSvg; tiles: Blockly.WorkspaceSvg } {
  const engine = new MorphicBlocks(format, {});
  engines.push(engine);
  void engine.mount({ workspaceContainer: div(), toolboxContainer: div(), blockly });
  // Private state, read only because the tile workspace has no public getter.
  const tiles = (engine as unknown as { toolboxCanvas: { previewWorkspace: Blockly.WorkspaceSvg } }).toolboxCanvas.previewWorkspace;
  return { main: engine.getWorkspace()!, tiles };
}

afterEach(() => {
  for (const engine of engines.splice(0)) engine.dispose();
  document.body.innerHTML = "";
});

describe("tile workspace", () => {
  test("loads media from where the host's workspace does", () => {
    const { tiles } = mountWith({ media: "/blockly-media/" });

    expect(tiles.options.pathToMedia).toBe("/blockly-media/");
  });

  test("never loads sounds, since it only draws tiles", () => {
    const { main, tiles } = mountWith({});

    expect(main.options.hasSounds).toBe(true);
    expect(tiles.options.hasSounds).toBe(false);
  });

  test("draws tiles with the host's renderer, theme and direction", () => {
    const theme = Blockly.Theme.defineTheme("host-theme", { name: "host-theme", base: Blockly.Themes.Classic });
    const { tiles } = mountWith({ renderer: "zelos", theme, rtl: true });

    expect(tiles.getRenderer().getClassName()).toBe("zelos-renderer");
    expect(tiles.options.theme).toBe(theme);
    expect(tiles.RTL).toBe(true);
  });
});

describe("tile block styles", () => {
  test("tile blocks carry the classes Blockly scopes its block CSS to", () => {
    const { tiles } = mountWith({});
    const svg = document.querySelector(".morphic-element-code svg")!;

    expect(svg.classList).toContain(tiles.getRenderer().getClassName());
    expect(svg.classList).toContain(tiles.getTheme().getClassName());
  });
});

describe("tile slot defaults", () => {
  test("a tile shows a slot's default value", async () => {
    const engine = new MorphicBlocks(
      {
        elementTypes: { code: "code" },
        modes: [{ name: "only", elements: ["code"] }],
        blocks: [
          {
            identifier: "repeat",
            elements: { code: "repeat %1 times" },
            inputSlots: { "1": { kind: "value", name: "TIMES", default: { shadow: "number", fieldValues: { NUM: "3" } } } },
            shape: "statement",
          },
          {
            identifier: "number",
            elements: { code: "%NUM" },
            fields: { NUM: { type: "number", default: 0 } },
            output: "Number",
          },
        ],
      },
      {},
    );
    engines.push(engine);
    const toolbox = div();
    await engine.mount({ workspaceContainer: div(), toolboxContainer: toolbox });

    const tile = toolbox.querySelector("[data-block-type='repeat'] .morphic-element-code svg");
    // The default's SVG comes before its parent's text in the document.
    expect(tile?.textContent?.replace(/\s/g, "")).toBe("3repeattimes");
  });
});

describe("text rendered tiles", () => {
  test("a code element shown as text reads like the codespace writes it", async () => {
    const engine = new MorphicBlocks(
      {
        elementTypes: { python: "code" },
        modes: [{ name: "py", elements: ["python"] }],
        presets: [{ name: "text", toolbox: { mode: "py", render: { python: "text" } }, workspace: "py" }],
        blocks: [
          {
            identifier: "loop",
            elements: { python: "for i in range(%1):" },
            inputSlots: { "1": { kind: "value", name: "TIMES", default: { shadow: "number", fieldValues: { NUM: "3" } } } },
            shape: "statement",
          },
          {
            identifier: "flag",
            elements: { python: "%BOOL" },
            fields: {
              BOOL: { type: "dropdown", options: [{ value: "true", display: { python: "True" } }, "false"], default: "true" },
            },
            output: "Boolean",
          },
          {
            identifier: "number",
            elements: { python: "%NUM" },
            fields: { NUM: { type: "number", default: 0 } },
            output: "Number",
          },
        ],
      },
      {},
    );
    engines.push(engine);
    const toolbox = div();
    await engine.mount({ workspaceContainer: div(), toolboxContainer: toolbox });

    const text = (type: string) => toolbox.querySelector(`[data-block-type='${type}'] .morphic-element-python`)?.textContent;
    expect(text("loop")).toBe("for i in range(3):");
    expect(text("flag")).toBe("True");
    expect(text("number")).toBe("0");
  });
});

describe("tile code elements", () => {
  test("each code element is drawn from its own template", async () => {
    const engine = new MorphicBlocks(
      {
        elementTypes: { concept: "code", python: "code" },
        modes: [{ name: "both", elements: ["concept", "python"] }],
        blocks: [{ identifier: "say", elements: { concept: "say it", python: "print()" }, shape: "statement" }],
      },
      {},
    );
    engines.push(engine);
    const toolbox = div();
    await engine.mount({ workspaceContainer: div(), toolboxContainer: toolbox });

    const text = (element: string) =>
      toolbox.querySelector(`.morphic-element-${element} svg`)?.textContent?.replace(/\s/g, "");

    expect(text("concept")).toBe("sayit");
    expect(text("python")).toBe("print()");
  });
});
