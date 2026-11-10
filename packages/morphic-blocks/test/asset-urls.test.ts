import { afterEach, describe, expect, test } from "vitest";
import * as Blockly from "blockly";
import { MorphicBlocks } from "../src";
import type { MorphicBlocksFormat } from "../src/morphic/types";

/** `assetUrl` says where the images a definitions file names are loaded from. */

const format: MorphicBlocksFormat = {
  elementTypes: { icon: { type: "image", size: 20 }, code: "code" },
  modes: [{ name: "icon-tiles", elements: ["icon", "code"] }],
  blocks: [
    {
      identifier: "say",
      elements: { icon: "icons/say.svg", code: 'say <img src="icons/mouth.png" width="10" height="10"> %COLOR' },
      fields: { COLOR: { type: "dropdown", options: [{ value: "red", label: { src: "icons/red.svg" } }, "blue"] } },
      shape: "statement",
    },
  ],
};

const engines: MorphicBlocks[] = [];
const div = () => document.body.appendChild(document.createElement("div"));

afterEach(() => {
  for (const engine of engines.splice(0)) engine.dispose();
  document.body.innerHTML = "";
});

async function tileImages(assetUrl?: (path: string) => string | undefined) {
  const engine = new MorphicBlocks(format, {});
  engines.push(engine);
  const toolbox = div();
  await engine.mount({ containers: { workspace: div() }, toolboxContainer: toolbox, ...(assetUrl ? { assetUrl } : {}) });
  return { engine, sources: () => Array.from(toolbox.querySelectorAll(".morphic-element-icon img")).map((img) => img.getAttribute("src")) };
}

describe("assetUrl", () => {
  test("a src without quotes and an escaped path are found; the address cannot break the tag", async () => {
    const engine = new MorphicBlocks(
      {
        elementTypes: { icon: "image", code: "code" },
        modes: [{ name: "icon-tiles", elements: ["icon", "code"] }],
        blocks: [{ identifier: "hat", elements: { icon: "Tom's hat.svg", code: "hat <img src=bare.png width=8 height=8>" }, shape: "statement" }],
      },
      {},
    );
    engines.push(engine);
    const toolbox = div();
    const asked: string[] = [];
    await engine.mount({
      containers: { workspace: div() },
      toolboxContainer: toolbox,
      assetUrl: (path) => {
        asked.push(path);
        return `data:image/svg+xml,<svg id="${path}"/>`;
      },
    });

    expect(asked.sort()).toEqual(["Tom's hat.svg", "bare.png"]);
    expect(toolbox.querySelector(".morphic-element-icon img")?.getAttribute("src")).toBe("data:image/svg+xml,%3Csvg id=%22Tom%27s hat.svg%22/%3E");
  });

  test("an image element's path is loaded from the address assetUrl gives", async () => {
    const { sources } = await tileImages((path) => `blob:${path}`);

    expect(sources()).toEqual(["blob:icons/say.svg"]);
  });

  test("templates and dropdown pictures go through it too", async () => {
    const seen: string[] = [];
    await tileImages((path) => {
      seen.push(path);
      return undefined;
    });

    expect(new Set(seen)).toEqual(new Set(["icons/say.svg", "icons/mouth.png", "icons/red.svg"]));
  });

  test("undefined keeps the path, and a later mount without it starts from the paths again", async () => {
    const { engine, sources } = await tileImages(() => undefined);
    expect(sources()).toEqual(["icons/say.svg"]);

    await engine.mount({ containers: { workspace: div() }, toolboxContainer: div(), assetUrl: (path) => `blob:${path}` });
    await engine.mount({ containers: { workspace: div() }, toolboxContainer: div() });
    const block = engine.getWorkspace()!.newBlock("morphic:say");
    const images = block.inputList.flatMap((input) => input.fieldRow).filter((field) => field instanceof Blockly.FieldImage);
    expect(images.map((field) => field.getValue())).toEqual(["icons/mouth.png"]);
  });
});
