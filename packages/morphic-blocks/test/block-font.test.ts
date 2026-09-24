import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import * as Blockly from "blockly";
import { MorphicBlocks } from "../src";
import { remeasureBlocks } from "../src/morphic/block-font";
import type { MorphicBlocksFormat } from "../src/morphic/types";

/**
 * Blockly sizes blocks with the font it measures with, not the font the page
 * draws. When a mode's CSS sets its own font for block text, the framework
 * hands that font to Blockly, so blocks are sized for the text they show.
 */

const format: MorphicBlocksFormat = {
  elementTypes: { code: "code", python: "code" },
  modes: [
    { name: "py", elements: ["python"] },
    { name: "plain", elements: ["code"] },
  ],
  blocks: [
    { identifier: "say", elements: { code: "say()", python: "say()" }, shape: "statement" },
    {
      identifier: "print",
      // Different templates per mode, so a switch rebuilds the block.
      elements: { code: "Output %1", python: "print(%1)" },
      inputSlots: { "1": { kind: "value", name: "TEXT", default: { shadow: "text", fieldValues: { TEXT: "Hello" } } } },
      shape: "statement",
    },
  ],
};

const modeStyles = {
  py: ".morphic-workspace-root.morphic-mode-py .blocklyText { font: 700 16px monospace; }",
  plain: ".morphic-mode-plain { color: teal; }",
};

// jsdom does not rank competing CSS rules like a browser (the first matching
// rule wins, whatever its order or specificity), so Blockly's own font rule
// would always beat the mode's. Answer what a browser computes instead: block
// text inside a py workspace, or inside a py tile's code element, is drawn in
// the py font.
const pyText = ".morphic-workspace-root.morphic-mode-py .blocklyText, .morphic-mode-py > .morphic-element-code .blocklyText";
const pyFont: Record<string, string> = { fontFamily: "monospace", fontSize: "16px", fontWeight: "700" };

beforeEach(() => {
  const computed = window.getComputedStyle.bind(window);
  vi.spyOn(window, "getComputedStyle").mockImplementation((element, pseudo) => {
    const style = computed(element, pseudo);
    if (!element.matches(pyText)) return style;
    return new Proxy(style, {
      get: (target, prop) => (typeof prop === "string" && prop in pyFont ? pyFont[prop] : Reflect.get(target, prop)),
    });
  });
});

const engines: MorphicBlocks[] = [];
const div = () => document.body.appendChild(document.createElement("div"));

function mount(toolboxContainer?: HTMLElement): MorphicBlocks {
  const engine = new MorphicBlocks(format, {});
  engines.push(engine);
  void engine.mount({ workspaceContainer: div(), toolboxContainer, modeStyles });
  return engine;
}

const constantsOf = (engine: MorphicBlocks) => engine.getWorkspace()!.getRenderer().getConstants();

afterEach(() => {
  vi.restoreAllMocks();
  for (const engine of engines.splice(0)) engine.dispose();
  document.body.innerHTML = "";
  document.head.innerHTML = "";
});

describe("block text font", () => {
  test("blocks are measured with the font the mode's CSS sets", () => {
    const constants = constantsOf(mount());

    expect(constants.FIELD_TEXT_FONTFAMILY).toBe("monospace");
    expect(constants.FIELD_TEXT_FONTSIZE).toBe(12);
    expect(constants.FIELD_TEXT_FONTWEIGHT).toBe("700");
  });

  test("a mode without its own font goes back to Blockly's font", () => {
    const engine = mount();

    engine.setModes({ workspaceMode: "plain" });

    expect(engine.getWorkspace()!.getTheme().name).toBe("classic");
    expect(constantsOf(engine).FIELD_TEXT_FONTFAMILY).toBe("sans-serif");
  });

  test("switching back reuses the same theme", () => {
    const engine = mount();
    const first = engine.getWorkspace()!.getTheme();

    engine.setModes({ workspaceMode: "plain" });
    engine.setModes({ workspaceMode: "py" });

    expect(engine.getWorkspace()!.getTheme()).toBe(first);
  });

  test("toolbox tiles are measured with the font their tile's CSS sets", () => {
    const engine = mount(div());
    // Private state, read only because the tile workspace has no public getter.
    const tiles = (engine as unknown as { toolboxCanvas: { previewWorkspace: Blockly.WorkspaceSvg } }).toolboxCanvas;

    expect(tiles.previewWorkspace.getRenderer().getConstants().FIELD_TEXT_FONTFAMILY).toBe("monospace");
  });

  test("a block can be removed right after its text was remeasured", () => {
    const engine = mount();
    const workspace = engine.getWorkspace()!;
    const print = workspace.newBlock("morphic:print");
    print.initSvg();
    print.render();

    // A mode switch remeasures every block, then rebuilds each one, which
    // removes its slots and the text shadows in them.
    remeasureBlocks(workspace);
    expect(() => print.removeInput("TEXT")).not.toThrow();
  });
});
