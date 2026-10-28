import { afterEach, describe, expect, test } from "vitest";
import type * as Blockly from "blockly";
import { MorphicBlocks } from "../src";
import type { MorphicBlocksFormat } from "../src/morphic/types";

/** Views carry combinable classes for app CSS: their name, the element they show, the preset. */

const format: MorphicBlocksFormat = {
  elementTypes: { concept: "code", python: "code" },
  modes: [{ name: "tiles", elements: ["concept"] }],
  views: {
    blocks: "workspace",
    code: "codespace",
    read: { kind: "codespace", editable: false },
  },
  presets: [
    { name: "start", toolbox: "tiles", views: { blocks: "concept", code: "python", read: "concept" } },
    { name: "next", toolbox: "tiles", views: { blocks: "python" } },
  ],
  blocks: [{ identifier: "say", elements: { concept: "say", python: "print()" }, shape: "statement" }],
};

const engines: MorphicBlocks[] = [];
const div = () => document.body.appendChild(document.createElement("div"));

afterEach(() => {
  for (const engine of engines.splice(0)) engine.dispose();
  document.body.innerHTML = "";
});

async function setUp() {
  const engine = new MorphicBlocks(format, {});
  engines.push(engine);
  const containers = { blocks: div(), code: div(), read: div() };
  const toolbox = div();
  await engine.mount({ containers, toolboxContainer: toolbox });
  return { engine, containers, toolbox };
}

const classes = (element: Element, prefix: string) =>
  Array.from(element.classList).filter((name) => name.startsWith(prefix));

describe("view classes", () => {
  test("name the view, the element it shows and the preset", async () => {
    const { containers } = await setUp();

    expect(containers.blocks.classList).toContain("morphic-view");
    expect(containers.blocks.classList).toContain("morphic-view-blocks");
    expect(containers.blocks.classList).toContain("morphic-shows-concept");
    expect(containers.code.classList).toContain("morphic-shows-python");
    expect(containers.read.classList).toContain("morphic-read-only");
    for (const container of Object.values(containers)) {
      expect(classes(container, "morphic-preset-")).toEqual(["morphic-preset-start"]);
      expect(classes(container, "morphic-mode-")).toEqual([]);
    }
  });

  test("follow a preset switch", async () => {
    const { engine, containers } = await setUp();

    engine.applyPreset("next");

    expect(classes(containers.blocks, "morphic-shows-")).toEqual(["morphic-shows-python"]);
    expect(classes(containers.code, "morphic-preset-")).toEqual(["morphic-preset-next"]);
  });

  test("keep a name as written", async () => {
    const engine = new MorphicBlocks(
      {
        ...format,
        modes: [{ name: "iconTiles", elements: ["concept"] }],
        views: { "editor-pane": "workspace", read_pane: { kind: "codespace", editable: false } },
        presets: [{ name: "Start Preset", toolbox: "iconTiles", views: { "editor-pane": "concept", read_pane: "python" } }],
      },
      {},
    );
    engines.push(engine);
    const containers = { "editor-pane": div(), read_pane: div() };
    const toolbox = div();
    await engine.mount({ containers, toolboxContainer: toolbox });

    expect(containers["editor-pane"].classList).toContain("morphic-view-editor-pane");
    expect(containers.read_pane.classList).toContain("morphic-view-read_pane");
    expect(containers.read_pane.classList).toContain("morphic-preset-Start-Preset");
    expect(toolbox.querySelector(".morphic-block")?.classList).toContain("morphic-mode-iconTiles");
  });

  test("mark workspace blocks with the element, tiles keep their mode", async () => {
    const { engine, toolbox } = await setUp();
    const block = engine.getWorkspace()!.newBlock("morphic:say") as Blockly.BlockSvg;
    block.initSvg();
    block.render();

    expect(classes(block.getSvgRoot(), "morphic-shows-")).toEqual(["morphic-shows-concept"]);
    expect(toolbox.querySelector(".morphic-block")?.classList).toContain("morphic-mode-tiles");
  });
});
