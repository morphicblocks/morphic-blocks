import { afterEach, describe, expect, test } from "vitest";
import { MorphicBlocks } from "../src";
import type { MorphicBlocksFormat, MorphicToolboxConfig } from "../src/morphic/types";

/** Categories in the HTML toolbox: headings, collapsing, tabs. */

const format: MorphicBlocksFormat = {
  elementTypes: { code: "code" },
  modes: [{ name: "python", elements: ["code"] }],
  categories: [
    { name: "Output & Text", color: "#4a90d9" },
    { name: "Loops", color: "#ee9a4d" },
  ],
  blocks: [
    { identifier: "say", category: "Output & Text", elements: { code: "say()" }, shape: "statement" },
    { identifier: "repeat", category: "Loops", elements: { code: "repeat()" }, shape: "statement" },
    { identifier: "wait", elements: { code: "wait()" }, shape: "statement" },
  ],
};

const engines: MorphicBlocks[] = [];
const div = () => document.body.appendChild(document.createElement("div"));

afterEach(() => {
  for (const engine of engines.splice(0)) engine.dispose();
  document.body.innerHTML = "";
});

async function toolboxWith(toolbox: MorphicToolboxConfig = {}, definitions: MorphicBlocksFormat = format) {
  const engine = new MorphicBlocks(definitions, {});
  engines.push(engine);
  const container = div();
  await engine.mount({ workspaceContainer: div(), toolboxContainer: container, toolbox });
  const headings = () => Array.from(container.querySelectorAll(".morphic-category-heading"), (h) => h.textContent);
  return { engine, container, headings };
}

describe("category headings", () => {
  test("head each category with its own name", async () => {
    const { headings } = await toolboxWith();

    expect(headings()).toEqual(["Output & Text", "Loops"]);
  });

  test("can be left out", async () => {
    const { headings } = await toolboxWith({ categoryHeadings: false });

    expect(headings()).toEqual([]);
  });

  test("do not appear without categories", async () => {
    const { categories: _, ...flat } = format;
    const { headings, container } = await toolboxWith({}, flat);

    expect(headings()).toEqual([]);
    expect(container.querySelectorAll("[data-block-type]")).toHaveLength(3);
  });
});

describe("collapsing categories", () => {
  const tilesOf = (container: HTMLElement, name: string) =>
    container.querySelector<HTMLElement>(`[data-category="${name}"] .morphic-category-tiles`)!;
  const headingOf = (container: HTMLElement, name: string) =>
    container.querySelector<HTMLButtonElement>(`[data-category="${name}"] .morphic-category-heading`)!;

  test("all start open, and a click on a heading collapses and expands", async () => {
    const toggles: [string, boolean][] = [];
    const { container } = await toolboxWith({ onCategoryToggle: (name, collapsed) => toggles.push([name, collapsed]) });
    const heading = headingOf(container, "loops");

    expect(tilesOf(container, "loops").hidden).toBe(false);
    expect(heading.getAttribute("aria-expanded")).toBe("true");

    heading.click();
    expect(tilesOf(container, "loops").hidden).toBe(true);
    expect(heading.getAttribute("aria-expanded")).toBe("false");

    heading.click();
    expect(tilesOf(container, "loops").hidden).toBe(false);
    expect(toggles).toEqual([
      ["Loops", true],
      ["Loops", false],
    ]);
  });

  test("start collapsed: all, or the ones named", async () => {
    const all = await toolboxWith({ collapsed: true });
    expect(tilesOf(all.container, "loops").hidden).toBe(true);
    expect(tilesOf(all.container, "output-text").hidden).toBe(true);

    const some = await toolboxWith({ collapsed: ["Loops"] });
    expect(tilesOf(some.container, "loops").hidden).toBe(true);
    expect(tilesOf(some.container, "output-text").hidden).toBe(false);
  });

  test("stay collapsed when the tiles are drawn again", async () => {
    const { engine, container } = await toolboxWith();
    headingOf(container, "loops").click();

    engine.setModes({ toolboxMode: "python" });

    expect(tilesOf(container, "loops").hidden).toBe(true);
  });

  test("can be switched off, leaving plain headings", async () => {
    const { container } = await toolboxWith({ collapsible: false, collapsed: true });

    expect(headingOf(container, "loops").tagName).toBe("DIV");
    expect(tilesOf(container, "loops").hidden).toBe(false);
  });
});
