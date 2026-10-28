import { afterEach, describe, expect, test, vi } from "vitest";
import { MorphicBlocks } from "../src";
import type { MorphicBlocksFormat } from "../src/morphic/types";

/** A mode says how its code elements are drawn on toolbox tiles. */

const format: MorphicBlocksFormat = {
  elementTypes: { python: "code" },
  modes: [
    { name: "blocks", elements: ["python"] },
    { name: "text", elements: ["python"], render: { python: "text-based" } },
  ],
  presets: [
    { name: "blocks", toolbox: "blocks", views: { workspace: "python" } },
    { name: "text", toolbox: "text", views: { workspace: "python" } },
  ],
  blocks: [{ identifier: "say", elements: { python: "say()" }, shape: "statement" }],
};

const engines: MorphicBlocks[] = [];
const div = () => document.body.appendChild(document.createElement("div"));

afterEach(() => {
  for (const engine of engines.splice(0)) engine.dispose();
  document.body.innerHTML = "";
});

async function toolbox(definitions: MorphicBlocksFormat = format) {
  const engine = new MorphicBlocks(definitions, {});
  engines.push(engine);
  const container = div();
  await engine.mount({ workspaceContainer: div(), toolboxContainer: container });
  const tile = () => container.querySelector<HTMLElement>('[data-block-type="say"] .morphic-element-python')!;
  return { engine, tile };
}

describe("a mode's render", () => {
  test("draws code elements as blocks by default", async () => {
    const { tile } = await toolbox();

    expect(tile().querySelector("svg")).not.toBeNull();
  });

  test("draws a code element as its text when set to text-based", async () => {
    const { engine, tile } = await toolbox();

    engine.applyPreset("text");

    expect(tile().querySelector("svg")).toBeNull();
    expect(tile().textContent).toBe("say()");
  });

  test("follows the toolbox mode when it switches", async () => {
    const { engine, tile } = await toolbox();
    engine.show({ toolbox: "text" });
    expect(tile().querySelector("svg")).toBeNull();

    engine.show({ toolbox: "blocks" });
    expect(tile().querySelector("svg")).not.toBeNull();
  });
});

describe("render's check", () => {
  test("warns about a name that is no code element", () => {
    const onWarning = vi.fn();
    const typo = { ...format, modes: [{ name: "blocks", elements: ["python"], render: { pyton: "text-based" } }], presets: undefined } as MorphicBlocksFormat;

    void new MorphicBlocks(typo, {}).mount({ workspaceContainer: div(), onWarning });

    expect(onWarning).toHaveBeenCalledWith(expect.stringContaining("render.pyton names no code element"));
  });

  test("accepts a code element the mode lists only later", () => {
    const onWarning = vi.fn();
    const later = { ...format, elementTypes: { python: "code", js: "code" }, modes: [{ name: "blocks", elements: ["python"], render: { js: "text-based" } }], presets: undefined } as MorphicBlocksFormat;

    void new MorphicBlocks(later, {}).mount({ workspaceContainer: div(), onWarning });

    expect(onWarning).not.toHaveBeenCalledWith(expect.stringContaining("render.js"));
  });
});

describe("the 0.3 format", () => {
  test("a preset's toolbox object fails with where render went", () => {
    const old = {
      ...format,
      presets: [{ name: "old", toolbox: { mode: "blocks", render: { python: "text" } }, workspace: "blocks" }],
    } as unknown as MorphicBlocksFormat;

    expect(() => new MorphicBlocks(old, {}).mount({ workspaceContainer: div() })).toThrow(
      /"toolbox": "blocks", and on that mode "render": \{ "python": "text-based" \}/,
    );
  });

  test("the old render values fail with their new names", () => {
    const old = {
      ...format,
      modes: [{ name: "blocks", elements: ["python"], render: { python: "text" } }],
      presets: undefined,
    } as unknown as MorphicBlocksFormat;

    expect(() => new MorphicBlocks(old, {}).mount({ workspaceContainer: div() })).toThrow(/"text" is now "text-based"/);
  });

  test("setModes points to show()", async () => {
    const { engine } = await toolbox();

    expect(() => engine.setModes({ toolboxRender: { python: "text" } })).toThrow(/replaced by show\(\)/);
  });
});
