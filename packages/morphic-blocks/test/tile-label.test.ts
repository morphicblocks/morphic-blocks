import { afterEach, describe, expect, test } from "vitest";
import { MorphicBlocks } from "../src";
import type { MorphicBlocksFormat, MorphicToolboxConfig } from "../src/morphic/types";

/** `toolbox.label` names the tiles for screen readers after an element, often one no mode shows. */

const format: MorphicBlocksFormat = {
  elementTypes: { title: "text", block: "code", "spoken-en": "text", "spoken-de": "text" },
  modes: [{ name: "kids", elements: ["title", "block"] }],
  blocks: [
    {
      identifier: "say",
      elements: { title: "Say", block: "say", "spoken-en": "Say block: writes a message", "spoken-de": "Sag-Block: schreibt eine Nachricht" },
      shape: "statement",
    },
    { identifier: "stop", elements: { title: "Stop", block: "stop" }, shape: "statement" },
  ],
};

const engines: MorphicBlocks[] = [];
const div = () => document.body.appendChild(document.createElement("div"));

afterEach(() => {
  for (const engine of engines.splice(0)) engine.dispose();
  document.body.innerHTML = "";
});

async function toolbox(toolbox: MorphicToolboxConfig) {
  const engine = new MorphicBlocks(format, {});
  engines.push(engine);
  const container = div();
  await engine.mount({ workspaceContainer: div(), toolboxContainer: container, toolbox });
  const name = (block: string) => container.querySelector(`[data-block-type="${block}"]`)?.getAttribute("aria-label");
  return { engine, name };
}

describe("a tile's label", () => {
  test("comes from the chosen element", async () => {
    const { name } = await toolbox({ label: "spoken-en" });

    expect(name("say")).toBe("Say block: writes a message");
  });

  test("falls back to what the tile shows", async () => {
    const { name } = await toolbox({ label: "spoken-en" });

    expect(name("stop")).toBe("Stop, stop");
  });

  test("follows a function, asked again on every redraw", async () => {
    let language = "en";
    const { engine, name } = await toolbox({ label: () => `spoken-${language}` });
    expect(name("say")).toBe("Say block: writes a message");

    language = "de";
    engine.show({ toolbox: "kids" });

    expect(name("say")).toBe("Sag-Block: schreibt eine Nachricht");
  });
});
