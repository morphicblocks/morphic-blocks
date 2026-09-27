import { afterEach, expect, test, vi } from "vitest";
import { MorphicBlocks } from "../src";
import type { MorphicBlocksFormat } from "../src/morphic/types";

/**
 * Only the code editor shows JavaScript. Codespace and preview must work in
 * an app that does not install JavaScript language support.
 */
vi.mock("@codemirror/lang-javascript", () => {
  throw new Error("not installed");
});

const format: MorphicBlocksFormat = {
  elementTypes: { code: "code" },
  modes: [{ name: "only", elements: ["code"] }],
  blocks: [{ identifier: "say", elements: { code: "say()" }, shape: "statement" }],
};

const engines: MorphicBlocks[] = [];
const div = () => document.body.appendChild(document.createElement("div"));

afterEach(() => {
  for (const engine of engines.splice(0)) engine.dispose();
  document.body.innerHTML = "";
});

test("codespace and preview mount without JavaScript language support", async () => {
  const engine = new MorphicBlocks(format, { say: () => "say();\n" });
  engines.push(engine);
  const codespaceContainer = div();
  const previewContainer = div();

  await engine.mount({ workspaceContainer: div(), codespaceContainer, previewContainer });

  expect(codespaceContainer.querySelector(".cm-editor")).not.toBeNull();
  expect(previewContainer.querySelector(".cm-editor")).not.toBeNull();
});

test("the code editor names the package it needs", async () => {
  const engine = new MorphicBlocks(format, { say: () => "say();\n" });
  engines.push(engine);

  await expect(engine.mount({ workspaceContainer: div(), codeEditorContainer: div() })).rejects.toThrow(
    /@codemirror\/lang-javascript/,
  );
});
