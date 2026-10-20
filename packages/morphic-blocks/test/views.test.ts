import { afterEach, describe, expect, test, vi } from "vitest";
import { MorphicBlocks } from "../src";
import type { MorphicBlocksFormat } from "../src/morphic/types";

/** Views added beside the ones mount() sets up, each in its own mode. */

const format: MorphicBlocksFormat = {
  elementTypes: { title: "text", python: "code", javascript: "code" },
  modes: [
    { name: "py", elements: ["python"] },
    { name: "js", elements: ["javascript"] },
    { name: "plain", elements: ["title"] },
  ],
  blocks: [
    { identifier: "say", elements: { title: "Say", python: "print()", javascript: "console.log();" }, shape: "statement" },
  ],
};

const engines: MorphicBlocks[] = [];
const div = () => document.body.appendChild(document.createElement("div"));
const text = (container: HTMLElement) => container.querySelector(".cm-content")?.textContent;
// The views write a new block after a short debounce.
const settle = () => new Promise((resolve) => setTimeout(resolve, 300));

async function mountEngine(): Promise<MorphicBlocks> {
  const engine = new MorphicBlocks(format, { say: () => "" });
  engines.push(engine);
  await engine.mount({ workspaceContainer: div() });
  engine.getWorkspace()!.newBlock("morphic:say");
  return engine;
}

afterEach(() => {
  for (const engine of engines.splice(0)) engine.dispose();
  document.body.innerHTML = "";
});

describe("added read only codespaces", () => {
  test("each preview shows the program in its own mode", async () => {
    const engine = await mountEngine();
    const python = div();
    const javascript = div();

    await engine.addView({ kind: "codespace", editable: false, container: python, element: "python" }).ready;
    await engine.addView({ kind: "codespace", editable: false, container: javascript, element: "javascript" }).ready;

    expect(text(python)).toBe("print()");
    expect(text(javascript)).toBe("console.log();");
    expect(javascript.classList).toContain("morphic-mode-javascript");
  });

  test("a read only codespace's element can change, and it can be removed", async () => {
    const engine = await mountEngine();
    const container = div();
    const view = engine.addView({ kind: "codespace", editable: false, container, element: "python" });
    await view.ready;

    view.show("javascript");
    await settle();
    expect(text(container)).toBe("console.log();");
    expect(view.getElement()).toBe("javascript");

    expect(() => view.setTheme({ background: "#ffffff" })).not.toThrow();

    view.dispose();
    expect(container.querySelector(".cm-editor")).toBeNull();
  });

  test("a new mount removes the added views", async () => {
    const engine = await mountEngine();
    const container = div();
    await engine.addView({ kind: "codespace", editable: false, container, element: "python" }).ready;

    await engine.mount({ workspaceContainer: div() });

    expect(container.querySelector(".cm-editor")).toBeNull();
  });

  test("names are unique and views show code elements", async () => {
    const engine = await mountEngine();
    engine.addView({ kind: "codespace", editable: false, container: div(), element: "python", name: "right" });

    expect(() => engine.addView({ kind: "codespace", editable: false, container: div(), element: "javascript", name: "right" })).toThrow(
      /named "right" already exists/,
    );
    expect(() => engine.addView({ kind: "codespace", editable: false, container: div(), element: "nope" })).toThrow(/"nope" is no code element/);
    expect(() => engine.addView({ kind: "codespace", editable: false, container: div(), element: "title" })).toThrow(/"title" is no code element/);
  });
});

describe("added read only codespaces and the rest of the engine", () => {
  const editorsInSync = (engine: MorphicBlocks) =>
    (engine as unknown as { selectionSync?: { editors: unknown[] } }).selectionSync?.editors.length ?? 0;

  test("an added preview joins selection sync, and leaves it when removed", async () => {
    const engine = await mountEngine();

    const first = engine.addView({ kind: "codespace", editable: false, container: div(), element: "python" });
    await first.ready;
    expect(editorsInSync(engine)).toBe(1);

    const second = engine.addView({ kind: "codespace", editable: false, container: div(), element: "javascript" });
    await second.ready;
    expect(editorsInSync(engine)).toBe(2);

    second.dispose();
    expect(editorsInSync(engine)).toBe(1);
  });

  test("selection sync stays off when the host turned it off", async () => {
    const engine = new MorphicBlocks(format, { say: () => "" });
    engines.push(engine);
    await engine.mount({ workspaceContainer: div(), selectionSync: false });

    await engine.addView({ kind: "codespace", editable: false, container: div(), element: "python" }).ready;

    expect(editorsInSync(engine)).toBe(0);
  });

  test("a mode's elements changing leaves the views alone", async () => {
    const engine = await mountEngine();
    const container = div();
    await engine.addView({ kind: "codespace", editable: false, container, element: "javascript" }).ready;

    engine.setModeElements("js", ["title"]);
    await settle();

    expect(text(container)).toBe("console.log();");
  });
});

describe("views by name", () => {
  test("built in and added views are found by name", async () => {
    const engine = new MorphicBlocks(format, { say: () => "" });
    engines.push(engine);
    await engine.mount({
      views: { workspace: "workspace", preview: { kind: "codespace", editable: false } },
      containers: { workspace: div(), preview: div() },
    });
    engine.show({ views: { workspace: "python", preview: "javascript" } });

    const named = engine.addView({ kind: "codespace", editable: false, container: div(), element: "python", name: "right" });
    const unnamed = engine.addView({ kind: "codespace", editable: false, container: div(), element: "javascript" });

    expect(engine.getViewElement("workspace")).toBe("python");
    expect(engine.getViewElement("preview")).toBe("javascript");
    expect(named.name).toBe("right");
    expect(unnamed.name).toBe("view-1");
    expect(engine.getViewElement("view-1")).toBe("javascript");
    expect(engine.getViewElement("nothing")).toBeUndefined();
    expect(() => engine.addView({ kind: "codespace", editable: false, container: div(), element: "python", name: "preview" })).toThrow(
      /named "preview" already exists/,
    );
  });
});

describe("toolbars on added views", () => {
  test("an added view brings its own toolbar, acting on that view", async () => {
    const engine = await mountEngine();
    const toolbar = div();
    const view = engine.addView({ kind: "codespace", editable: false, container: div(), element: "javascript", name: "right", toolbar: { container: toolbar } });
    await view.ready;

    expect(toolbar.dataset.morphicView).toBe("right");
    expect(toolbar.querySelector(".morphic-toolbar-label")?.textContent).toBe("javascript");

    view.show("python");
    expect(toolbar.querySelector(".morphic-toolbar-label")?.textContent).toBe("python");

    view.dispose();
    expect(toolbar.childElementCount).toBe(0);
  });

  test("each toolbar can have its own items", async () => {
    const engine = await mountEngine();
    const toolbar = div();
    engine.addView({ kind: "codespace", editable: false, container: div(), element: "javascript", toolbar: { container: toolbar, items: [] } });

    expect(toolbar.querySelector("[data-toolbar-id]")).toBeNull();
  });

  test("a toolbar for a view that does not exist is refused", async () => {
    const engine = await mountEngine();

    expect(() => engine.mountToolbar(div(), { view: "nothing" })).toThrow(/no view named "nothing"/);
  });
});

test("added read only codespaces follow blocks reordered with events off", async () => {
  const engine = new MorphicBlocks(
    {
      ...format,
      blocks: [
        ...format.blocks,
        { identifier: "wait", elements: { title: "Wait", python: "wait()", javascript: "wait();" }, shape: "statement" },
      ],
    },
    { say: () => "", wait: () => "" },
  );
  engines.push(engine);
  await engine.mount({ workspaceContainer: div() });
  const workspace = engine.getWorkspace()!;
  const say = workspace.newBlock("morphic:say");
  const wait = workspace.newBlock("morphic:wait");
  say.moveBy(0, 0);
  wait.moveBy(0, 100);
  const container = div();
  await engine.addView({ kind: "codespace", editable: false, container, element: "javascript" }).ready;
  await settle();
  expect(text(container)).toBe("console.log();wait();");

  // What a reorder of top level lines in the codespace does.
  (engine as unknown as { applyTopBlockOrder(ws: unknown, ids: string[]): void }).applyTopBlockOrder(workspace, [
    wait.id,
    say.id,
  ]);

  expect(text(container)).toBe("wait();console.log();");
});

describe("presets and added views", () => {
  const withPresets: MorphicBlocksFormat = {
    ...format,
    presets: [
      { name: "a", toolbox: "py", views: { workspace: "python", right: "javascript" } },
      { name: "b", toolbox: "py", views: { workspace: "python", right: "python", missing: "javascript" } },
    ],
  };

  test("applying a preset switches the views it names", async () => {
    const engine = new MorphicBlocks(withPresets, { say: () => "" });
    engines.push(engine);
    await engine.mount({ workspaceContainer: div(), preset: "a" });
    const view = engine.addView({ kind: "codespace", editable: false, container: div(), element: "javascript", name: "right" });

    engine.applyPreset("b");
    expect(view.getElement()).toBe("python");

    engine.applyPreset("a");
    expect(view.getElement()).toBe("javascript");
  });

  test("a preset naming an unknown mode for a view is refused", () => {
    const engine = new MorphicBlocks(
      { ...format, presets: [{ name: "a", toolbox: "py", views: { workspace: "python", right: "nope" } }] },
      {},
    );
    engines.push(engine);

    expect(() => engine.mount({ workspaceContainer: div() })).toThrow(/view "right" shows "nope", which is no code element/);
  });
});

describe("added codespaces", () => {
  type Editor = { metadata: Map<string, unknown> };
  const addedEditor = (engine: MorphicBlocks, name: string) =>
    [...(engine as unknown as { views: Set<{ name: string; editor: Editor }> }).views].find((view) => view.name === name)!
      .editor;

  test("an added codespace edits the program in its own mode, and every view follows", async () => {
    const engine = await mountEngine();
    const python = div();
    const javascript = div();
    await engine.addView({ kind: "codespace", container: python, element: "python", name: "left" }).ready;
    await engine.addView({ kind: "codespace", editable: false, container: javascript, element: "javascript" }).ready;
    expect(python.classList).toContain("morphic-codespace-root");
    expect(text(python)).toBe("print()");

    // What the delete key or the gutter's ✕ on line 1 of the added codespace does.
    (engine as unknown as { deleteBlockAtCodespaceLine(editor: Editor, line: number): void }).deleteBlockAtCodespaceLine(
      addedEditor(engine, "left"),
      1,
    );
    await settle();

    expect(engine.getWorkspace()!.getAllBlocks(false)).toHaveLength(0);
    expect(text(python)).toBe("");
    expect(text(javascript)).toBe("");
  });

  test("drops are resolved against the codespace they land in", async () => {
    const engine = await mountEngine();
    await engine.addView({ kind: "codespace", container: div(), element: "javascript", name: "left" }).ready;
    const editor = addedEditor(engine, "left");
    // jsdom lays nothing out, so the pointer is placed on line 1, lower half.
    Object.assign(editor, {
      isBelowLastLine: () => false,
      getLineAtCoords: () => 1,
      charAtCoords: () => null,
      isInLowerHalfOfLine: () => true,
    });
    const say = engine.getWorkspace()!.getAllBlocks(false)[0]!;

    const drop = (engine as unknown as {
      computeCodespaceDrop(editor: Editor, x: number, y: number): { target: unknown } | null;
    }).computeCodespaceDrop(editor, 0, 0);

    expect(drop?.target).toEqual({ kind: "statement", targetBlockId: say.id, position: "after", topIndex: 1 });
  });
});

test("the inline value editor takes focus without scrolling its view", async () => {
  const engine = await mountEngine();
  await engine.addView({ kind: "codespace", container: div(), element: "python", name: "left" }).ready;
  const editor = (engine as unknown as {
    views: Set<{ name: string; editor: { openPlaceholderEditor(range: unknown): void; editorView: { coordsAtPos(): unknown } } }>;
  }).views.values().next().value!.editor;
  // jsdom has no layout; any position will do.
  editor.editorView.coordsAtPos = () => ({ left: 0, right: 10, top: 0, bottom: 10 });
  const focus = vi.spyOn(HTMLElement.prototype, "focus");

  editor.openPlaceholderEditor({ start: 0, end: 1, kind: "default", edit: { blockId: "x", fieldName: "X", fieldType: "text" } });
  await new Promise((resolve) => requestAnimationFrame(resolve));

  expect(focus).toHaveBeenCalledWith({ preventScroll: true });
});

