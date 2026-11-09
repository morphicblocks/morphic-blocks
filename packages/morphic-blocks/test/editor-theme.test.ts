import { EditorView } from "@codemirror/view";
import { afterEach, describe, expect, test } from "vitest";
import { MorphicBlocks } from "../src";
import type { MorphicCodeEditorTheme } from "../src/morphic/types";

/** Themes and framework styles reach what they style. */

const engines: MorphicBlocks[] = [];
const div = () => document.body.appendChild(document.createElement("div"));

afterEach(() => {
  for (const engine of engines.splice(0)) engine.dispose();
  document.body.innerHTML = "";
});

test("the theme's font is set where the text takes it from", async () => {
  const engine = new MorphicBlocks(
    {
      elementTypes: { code: "code" },
      modes: [{ name: "only", elements: ["code"] }],
      blocks: [{ identifier: "say", elements: { code: "say()" }, shape: "statement" }],
    },
    {},
  );
  engines.push(engine);
  await engine.mount({ workspaceContainer: div(), codespaceContainer: div(), editorTheme: { fontFamily: "Georgia" } });

  // CodeMirror sets monospace on its scroller, so the font has to be set there too.
  const css = Array.from(document.querySelectorAll("style"))
    .map((style) => style.textContent)
    .join("\n");
  expect(css).toMatch(/\.cm-scroller\s*\{[^}]*font-family:\s*Georgia/);
});

test("the workspace border Blockly draws is off by default and styleable", async () => {
  const engine = new MorphicBlocks(
    {
      elementTypes: { code: "code" },
      modes: [{ name: "only", elements: ["code"] }],
      blocks: [{ identifier: "say", elements: { code: "say()" }, shape: "statement" }],
    },
    {},
  );
  engines.push(engine);
  await engine.mount({ workspaceContainer: div() });

  const css = document.querySelector('style[data-morphic-source="workspace"]')?.textContent ?? "";
  expect(css).toContain("stroke: var(--morphic-workspace-border-color, transparent)");
  expect(css).toContain("stroke-width: var(--morphic-workspace-border-width, 1px)");
});

describe("a CodeMirror theme in editorTheme", () => {
  async function mountWith(editorTheme: MorphicCodeEditorTheme): Promise<string> {
    const engine = new MorphicBlocks(
      {
        elementTypes: { code: "code" },
        modes: [{ name: "only", elements: ["code"] }],
        blocks: [{ identifier: "say", elements: { code: "say()" }, shape: "statement" }],
      },
      {},
    );
    engines.push(engine);
    const codespace = div();
    await engine.mount({ workspaceContainer: div(), codespaceContainer: codespace, editorTheme });
    // The rules of the themes this editor has, in stylesheet order (a later rule wins).
    const classes = Array.from(codespace.querySelector(".cm-editor")!.classList).filter((name) => name.startsWith("ͼ"));
    return Array.from(document.querySelectorAll("style"))
      .flatMap((style) => (style.textContent ?? "").split("\n"))
      .filter((rule) => classes.some((name) => rule.startsWith(`.${name}`)))
      .join("\n");
  }

  test("gives the colours; the framework's dark defaults step aside", async () => {
    const css = await mountWith({ codemirror: EditorView.theme({ "&": { backgroundColor: "rgb(1, 2, 3)" } }) });

    expect(css).toContain("rgb(1, 2, 3)");
    expect(css).not.toContain("#1e1e1e");
  });

  test("colours the app sets still win", async () => {
    const css = await mountWith({
      codemirror: EditorView.theme({ "&": { backgroundColor: "rgb(1, 2, 3)" } }),
      background: "rgb(4, 5, 6)",
    });

    expect(css.indexOf("rgb(4, 5, 6)")).toBeGreaterThan(css.indexOf("rgb(1, 2, 3)"));
  });
});
