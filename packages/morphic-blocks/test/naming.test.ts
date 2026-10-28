import { afterEach, describe, expect, test, vi } from "vitest";
import { MorphicBlocks } from "../src";
import type { MorphicBlocksFormat } from "../src/morphic/types";

/** Names that read like the framework's own words, or mean two things, warn. */

const format: MorphicBlocksFormat = {
  elementTypes: { title: "text", python: "code" },
  modes: [{ name: "pythonTiles", elements: ["title", "python"] }],
  views: { editorPane: "workspace", readPane: { kind: "codespace", editable: false } },
  presets: [{ name: "step-python", toolbox: "pythonTiles", views: { editorPane: "python", readPane: "python" } }],
  blocks: [{ identifier: "say", elements: { title: "Say", python: "print()" }, shape: "statement" }],
};

const div = () => document.body.appendChild(document.createElement("div"));
afterEach(() => {
  document.body.innerHTML = "";
});

function warningsFor(definitions: MorphicBlocksFormat): string[] {
  const onWarning = vi.fn();
  const first = Object.keys(definitions.views ?? { workspace: "workspace" })[0]!;
  void new MorphicBlocks(definitions, {}).mount({ containers: { [first]: div() }, onWarning });
  return onWarning.mock.calls.map(([message]) => String(message));
}

describe("names", () => {
  test("in the recommended patterns pass without a warning", () => {
    expect(warningsFor(format).filter((m) => m.includes("Name "))).toEqual([]);
  });

  test("warn when they are a framework word", () => {
    const words = warningsFor({
      ...format,
      elementTypes: { title: "text", code: "code" },
      modes: [{ name: "blocks", elements: ["title", "code"] }],
      views: { workspace: "workspace" },
      presets: [{ name: "start", toolbox: "blocks", views: { workspace: "code" } }],
      blocks: [{ identifier: "say", elements: { title: "Say", code: "print()" }, shape: "statement" }],
    }).join("\n");

    expect(words).toContain('Name "code" (element) is a Morphic Blocks word');
    expect(words).toContain('Name "blocks" (mode) is a Morphic Blocks word');
    expect(words).toContain('Name "workspace" (view) is a Morphic Blocks word');
  });

  test("warn when a view shares a name with an element", () => {
    const shared = warningsFor({
      ...format,
      views: { python: "workspace" },
      presets: [{ name: "step-python", toolbox: "pythonTiles", views: { python: "python" } }],
    }).join("\n");

    expect(shared).toContain('Name "python" is used as element and view');
  });

  test("leave the default views alone", () => {
    const { views: _, ...withoutViews } = format;
    const defaults = warningsFor({ ...withoutViews, presets: undefined }).join("\n");

    expect(defaults).not.toContain("Morphic Blocks word");
  });

  test("warn about characters a class cannot hold, with the class they get", () => {
    const spaced = warningsFor({
      ...format,
      modes: [{ name: "python tiles", elements: ["title", "python"] }],
      presets: [{ name: "step-python", toolbox: "python tiles", views: { editorPane: "python" } }],
      categories: [{ name: "Output & Text" }],
    }).join("\n");

    expect(spaced).toContain('Name "python tiles" (mode) has characters a CSS class cannot hold; its classes use "python-tiles".');
    expect(spaced).not.toContain('Name "Output & Text"');
  });
});
