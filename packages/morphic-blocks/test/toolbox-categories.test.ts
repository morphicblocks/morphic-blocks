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
