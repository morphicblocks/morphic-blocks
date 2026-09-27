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

describe("setModeElements", () => {
  const tileFormat: MorphicBlocksFormat = {
    elementTypes: { title: "text", code: "code", python: "code" },
    modes: [
      { name: "one", elements: ["title", "code"] },
      { name: "two", elements: ["python"] },
    ],
    blocks: [
      { identifier: "say", elements: { title: "Say", code: "say()", python: "print()" }, shape: "statement" },
    ],
  };

  async function mountTiles(extra: { codespaceContainer?: HTMLElement } = {}) {
    const engine = new MorphicBlocks(tileFormat, { say: () => "say();\n" });
    engines.push(engine);
    await engine.mount({ workspaceContainer: div(), toolboxContainer: div(), ...extra });
    return engine;
  }

  const visibilityCss = () =>
    Array.from(document.head.querySelectorAll<HTMLStyleElement>("style[data-morphic-source='mode-visibility']"))
      .map((style) => style.textContent)
      .join("\n");

  test("a mode shows the new elements and stops showing the old ones", async () => {
    const engine = await mountTiles();

    engine.setModeElements("one", ["code"]);

    expect(visibilityCss()).toContain(".morphic-mode-one > .morphic-element-code");
    expect(visibilityCss()).not.toContain(".morphic-mode-one > .morphic-element-title");
  });

  test("workspace blocks switch to the mode's new code element", async () => {
    const engine = await mountTiles();
    const block = engine.getWorkspace()!.newBlock("morphic:say");
    block.initSvg();
    block.render();
    const text = () => block.inputList.flatMap((input) => input.fieldRow.map((field) => field.getText())).join("");

    engine.setModeElements("one", ["python"]);

    expect(text()).toBe("print()");
  });

  test("the host's mode list is left alone", async () => {
    const engine = await mountTiles();

    engine.setModeElements("one", ["code"]);

    expect(tileFormat.modes![0]!.elements).toEqual(["title", "code"]);
  });

  test("unknown elements and a codespace mode without code are refused", async () => {
    const engine = await mountTiles({ codespaceContainer: div() });

    expect(() => engine.setModeElements("one", ["nope"])).toThrow(/unknown elements "nope"/);
    expect(() => engine.setModeElements("one", ["title"])).toThrow(/needs a code element/);
  });
});

describe("text view mode classes", () => {
  test("codespace and preview are marked with the mode they show", async () => {
    const engine = new MorphicBlocks(format, { say: () => "say();\n" });
    engines.push(engine);
    const codespaceContainer = div();
    const previewContainer = div();
    await engine.mount({ workspaceContainer: div(), codespaceContainer, previewContainer });

    engine.setModes({ codespaceMode: "one", previewMode: "two" });
    expect(codespaceContainer.classList).toContain("morphic-mode-one");
    expect(previewContainer.classList).toContain("morphic-mode-two");

    engine.setModes({ codespaceMode: "two" });
    expect(codespaceContainer.classList).toContain("morphic-mode-two");
    expect(codespaceContainer.classList).not.toContain("morphic-mode-one");
  });
});
