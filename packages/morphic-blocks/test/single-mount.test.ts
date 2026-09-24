import { afterEach, describe, expect, test } from "vitest";
import { MorphicBlocks } from "../src";
import type { MorphicBlocksFormat } from "../src/morphic/types";

/**
 * One mount() call sets up every view it gets a container for. Selection
 * sync links the views by default, and the older pattern of calling the
 * separate mount methods afterwards keeps working.
 */

const format: MorphicBlocksFormat = {
  elementTypes: { code: "code" },
  modes: [{ name: "only", elements: ["code"] }],
  presets: [{ name: "all", toolbox: "only", workspace: "only", codespace: "only", preview: "only" }],
  blocks: [{ identifier: "say", elements: { code: "say()" }, shape: "statement" }],
};

const engines: MorphicBlocks[] = [];
const div = () => document.body.appendChild(document.createElement("div"));
// Private state, read only to check wiring that has no public getter.
const syncOf = (engine: MorphicBlocks) => (engine as unknown as { selectionSync?: object }).selectionSync;

function create(): MorphicBlocks {
  const engine = new MorphicBlocks(format, { say: () => "say();\n" });
  engines.push(engine);
  return engine;
}

afterEach(() => {
  for (const engine of engines.splice(0)) engine.dispose();
  document.body.innerHTML = "";
});

describe("single mount call", () => {
  test("sets up every view it gets a container for", async () => {
    const engine = create();
    const toolbox = div(), codespace = div(), preview = div(), codeEditor = div();
    const toolbars = { workspace: div(), codespace: div(), preview: div() };

    await engine.mount({
      workspaceContainer: div(),
      toolboxContainer: toolbox,
      codespaceContainer: codespace,
      previewContainer: preview,
      codeEditorContainer: codeEditor,
      toolbarContainers: toolbars,
    });

    expect(toolbox.querySelector("[data-block-type='say']")).not.toBeNull();
    expect(codespace.querySelector(".cm-editor")).not.toBeNull();
    expect(preview.querySelector(".cm-editor")).not.toBeNull();
    expect(codeEditor.querySelector(".cm-editor")).not.toBeNull();
    expect(engine.isCodeEditorVisible()).toBe(false);
    for (const toolbar of Object.values(toolbars)) expect(toolbar.childElementCount).toBeGreaterThan(0);
  });

  test("links the views with selection sync by default", async () => {
    const engine = create();
    await engine.mount({ workspaceContainer: div(), codespaceContainer: div() });
    expect(syncOf(engine)).toBeDefined();
  });

  test("selectionSync: false leaves the views unlinked", async () => {
    const engine = create();
    await engine.mount({ workspaceContainer: div(), codespaceContainer: div(), selectionSync: false });
    expect(syncOf(engine)).toBeUndefined();
  });

  test("mounting an editor again afterwards relinks selection sync", async () => {
    const engine = create();
    await engine.mount({ workspaceContainer: div(), codespaceContainer: div() });
    const before = syncOf(engine);

    await engine.mountCodespace();

    expect(syncOf(engine)).toBeDefined();
    expect(syncOf(engine)).not.toBe(before);
  });
});
