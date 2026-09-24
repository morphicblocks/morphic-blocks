import { afterEach, describe, expect, test } from "vitest";
import { MorphicBlocks } from "../src";
import type { MorphicBlocksFormat } from "../src/morphic/types";

/**
 * An engine can be disposed and mounted again into the same containers, as
 * React's double mount in development does. Nothing from the first mount may
 * survive the dispose, even work that was still loading.
 */

const format: MorphicBlocksFormat = {
  elementTypes: { code: "code" },
  modes: [{ name: "only", elements: ["code"] }],
  presets: [{ name: "all", toolbox: "only", workspace: "only", codespace: "only", preview: "only" }],
  blocks: [{ identifier: "say", elements: { code: "say()" }, shape: "statement" }],
};

const engines: MorphicBlocks[] = [];
const div = () => document.body.appendChild(document.createElement("div"));

function create(): MorphicBlocks {
  const engine = new MorphicBlocks(format, { say: () => "say();\n" });
  engines.push(engine);
  return engine;
}

afterEach(() => {
  for (const engine of engines.splice(0)) engine.dispose();
  document.body.innerHTML = "";
});

describe("dispose and mount again", () => {
  test("an editor disposed while loading does not appear", async () => {
    const engine = create();
    const containers = {
      workspaceContainer: div(),
      codespaceContainer: div(),
      previewContainer: div(),
      codeEditorContainer: div(),
    };

    const first = engine.mount(containers);
    engine.dispose();
    await Promise.all([first, engine.mount(containers)]);

    expect(containers.codespaceContainer.querySelectorAll(".cm-editor")).toHaveLength(1);
    expect(containers.previewContainer.querySelectorAll(".cm-editor")).toHaveLength(1);
    expect(containers.codeEditorContainer.querySelectorAll(".cm-editor")).toHaveLength(1);
  });
});
