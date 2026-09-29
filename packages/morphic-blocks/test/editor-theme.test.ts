import { afterEach, expect, test } from "vitest";
import { MorphicBlocks } from "../src";

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
