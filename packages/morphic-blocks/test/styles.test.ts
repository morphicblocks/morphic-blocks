import { afterEach, describe, expect, test } from "vitest";
import { MorphicBlocks } from "../src";
import type { MorphicBlocksFormat } from "../src/morphic/types";

/**
 * Each engine injects the framework's CSS into the page. Engines are created
 * again and again (a remounted component, React's double mount in
 * development), so identical stylesheets must never be added twice.
 */

const format: MorphicBlocksFormat = {
  elementTypes: { code: "code" },
  modes: [{ name: "only", elements: ["code"] }],
  categories: [{ name: "Output", color: "#55bdcb" }],
  blocks: [{ identifier: "say", category: "Output", elements: { code: "say hi" }, shape: "statement" }],
};

const engines: MorphicBlocks[] = [];

function openEditor(): MorphicBlocks {
  const engine = new MorphicBlocks(format, {});
  engine.mount({
    workspaceContainer: document.body.appendChild(document.createElement("div")),
    modeStyles: { only: ".morphic-mode-only { color: teal; }" },
  });
  engines.push(engine);
  return engine;
}

const morphicStyleCount = () => document.head.querySelectorAll("[data-morphic-source]").length;

afterEach(() => {
  for (const engine of engines.splice(0)) engine.dispose();
  document.body.innerHTML = "";
  document.head.innerHTML = "";
});

describe("injected styles", () => {
  test("opening and closing editors repeatedly adds no copies", () => {
    openEditor().dispose();
    const afterFirst = morphicStyleCount();
    expect(afterFirst).toBeGreaterThan(0);

    for (let i = 0; i < 5; i++) openEditor().dispose();

    expect(morphicStyleCount()).toBe(afterFirst);
  });

  test("two open editors with the same definitions share one set of styles", () => {
    openEditor();
    const withOne = morphicStyleCount();
    openEditor();

    expect(morphicStyleCount()).toBe(withOne);
  });
});
