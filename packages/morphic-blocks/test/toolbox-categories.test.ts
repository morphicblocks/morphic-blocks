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

describe("categories as tabs", () => {
  const shown = (container: HTMLElement) =>
    Array.from(container.querySelectorAll<HTMLElement>("[data-category]"))
      .filter((group) => !group.hidden)
      .map((group) => group.dataset.category);

  test("list the names and show the first category's tiles", async () => {
    const { container, headings } = await toolboxWith({ layout: "tabs" });
    const tabs = Array.from(container.querySelectorAll<HTMLButtonElement>(".morphic-category-tab"));

    expect(container.classList.contains("morphic-toolbox-tabs")).toBe(true);
    expect(tabs.map((tab) => tab.textContent)).toEqual(["Output & Text", "Loops"]);
    expect(tabs.map((tab) => tab.getAttribute("aria-selected"))).toEqual(["true", "false"]);
    expect(shown(container)).toEqual(["output-text"]);
    // The tabs name the categories, so no headings above the tiles.
    expect(headings()).toEqual([]);
  });

  test("show the chosen category, also after the tiles are drawn again", async () => {
    const { engine, container } = await toolboxWith({ layout: "tabs" });

    container.querySelectorAll<HTMLButtonElement>(".morphic-category-tab")[1]!.click();
    expect(shown(container)).toEqual(["loops"]);

    engine.setModes({ toolboxMode: "python" });
    expect(shown(container)).toEqual(["loops"]);
  });

  test("keep tiles without a category in view", async () => {
    const { container } = await toolboxWith({ layout: "tabs" });

    expect(container.querySelector<HTMLElement>('[data-block-type="wait"]')!.closest("[hidden]")).toBeNull();
  });

  test("warn without categories and show a flat list", async () => {
    const warnings: string[] = [];
    const { categories: _, ...flat } = format;
    const engine = new MorphicBlocks(flat, {});
    engines.push(engine);
    const container = div();
    await engine.mount({
      workspaceContainer: div(),
      toolboxContainer: container,
      toolbox: { layout: "tabs" },
      onWarning: (message) => warnings.push(message),
    });

    expect(warnings.some((message) => message.includes('"tabs" needs categories'))).toBe(true);
    expect(container.querySelectorAll("[data-block-type]")).toHaveLength(3);
  });

  test("stacked is the default layout", async () => {
    const { container } = await toolboxWith();

    expect(container.classList.contains("morphic-toolbox-stacked")).toBe(true);
  });
});

describe("scrolling the toolbox", () => {
  test("hides the scrollbar by default, or keeps it on request", async () => {
    const hidden = await toolboxWith();
    expect(hidden.container.classList.contains("morphic-toolbox")).toBe(true);
    expect(hidden.container.classList.contains("morphic-toolbox-hide-scrollbar")).toBe(true);

    const shownBar = await toolboxWith({ scrollbar: true });
    expect(shownBar.container.classList.contains("morphic-toolbox")).toBe(true);
    expect(shownBar.container.classList.contains("morphic-toolbox-hide-scrollbar")).toBe(false);
  });

  test("marks where more tiles wait while scrolling", async () => {
    const { container } = await toolboxWith();
    // jsdom lays nothing out: a toolbox 100px high showing tiles 300px high.
    Object.defineProperty(container, "clientHeight", { configurable: true, value: 100 });
    Object.defineProperty(container, "scrollHeight", { configurable: true, value: 300 });
    const scrollTo = (top: number) => {
      container.scrollTop = top;
      container.dispatchEvent(new Event("scroll"));
    };
    const marks = () =>
      ["morphic-toolbox-more-above", "morphic-toolbox-more-below"].filter((name) => container.classList.contains(name));

    scrollTo(0);
    expect(marks()).toEqual(["morphic-toolbox-more-below"]);
    scrollTo(100);
    expect(marks()).toEqual(["morphic-toolbox-more-above", "morphic-toolbox-more-below"]);
    scrollTo(200);
    expect(marks()).toEqual(["morphic-toolbox-more-above"]);
  });
});
