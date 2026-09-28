import { afterEach, describe, expect, test } from "vitest";
import { MorphicBlocks } from "../src";
import type { MorphicBlocksFormat } from "../src/morphic/types";

/** Token highlighting in the codespace and preview, from the definitions. */

const format: MorphicBlocksFormat = {
  elementTypes: { python: "code", javascript: "code" },
  modes: [
    { name: "py", elements: ["python"] },
    { name: "js", elements: ["javascript"] },
  ],
  blocks: [{ identifier: "say", elements: { python: "print()", javascript: "log()" }, shape: "statement" }],
  code: {
    python: { highlighting: { keywords: ["print"], colors: { keyword: "#123456" } } },
    javascript: { highlighting: { keywords: ["log"] } },
  },
};

const engines: MorphicBlocks[] = [];
const div = () => document.body.appendChild(document.createElement("div"));

afterEach(() => {
  for (const engine of engines.splice(0)) engine.dispose();
  document.body.innerHTML = "";
});

const pageCss = () =>
  Array.from(document.querySelectorAll("style"))
    .map((style) => style.textContent)
    .join("\n");

/** Number of classes in a simple selector list entry, as CSS counts them. */
const classCount = (selector: string) => (selector.match(/\./g) ?? []).length;

describe("highlight colors", () => {
  test("a view's own colours are more specific than any view's defaults", async () => {
    const engine = new MorphicBlocks(format, { say: () => "" });
    engines.push(engine);
    await engine.mount({ workspaceContainer: div(), codespaceContainer: div(), previewContainer: div() });
    engine.setModes({ codespaceMode: "py", previewMode: "js" });

    const css = pageCss();
    const own = /([^{}]*)\{[^}]*#123456/.exec(css)?.[1]?.trim();
    const fallback = /([^{}]*morphic-tok-keyword[^{}]*)\{[^}]*#cc7832/.exec(css)?.[1]?.trim();

    expect(own).toBeDefined();
    expect(fallback).toBeDefined();
    expect(classCount(own!)).toBeGreaterThan(classCount(fallback!));
  });
});

describe("highlighted words and strings", () => {
  test("keywords in any script and quotes that open and close differently", async () => {
    const engine = new MorphicBlocks(
      {
        elementTypes: { ar: "code" },
        modes: [{ name: "ar", elements: ["ar"] }],
        blocks: [{ identifier: "say", elements: { ar: "اطبع „مرحبا“ إذا" }, shape: "statement" }],
        code: { ar: { highlighting: { keywords: ["اطبع"], strings: [["„", "“"]] } } },
      },
      { say: () => "" },
    );
    engines.push(engine);
    const codespace = div();
    await engine.mount({ workspaceContainer: div(), codespaceContainer: codespace });
    const block = engine.getWorkspace()!.newBlock("morphic:say");
    (block as unknown as { initSvg(): void }).initSvg();
    // The codespace writes the new block after a short debounce.
    await new Promise((resolve) => setTimeout(resolve, 300));

    const tokens = (kind: string) =>
      Array.from(codespace.querySelectorAll(`.morphic-tok-${kind}`)).map((token) => token.textContent);
    expect(tokens("keyword")).toEqual(["اطبع"]);
    expect(tokens("string")).toEqual(["„مرحبا“"]);
  });
});

