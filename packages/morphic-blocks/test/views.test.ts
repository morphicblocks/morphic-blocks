import { afterEach, describe, expect, test } from "vitest";
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

describe("added previews", () => {
  test("each preview shows the program in its own mode", async () => {
    const engine = await mountEngine();
    const python = div();
    const javascript = div();

    await engine.addView({ kind: "preview", container: python, mode: "py" }).ready;
    await engine.addView({ kind: "preview", container: javascript, mode: "js" }).ready;

    expect(text(python)).toBe("print()");
    expect(text(javascript)).toBe("console.log();");
    expect(javascript.classList).toContain("morphic-mode-js");
  });

  test("a preview's mode can change, and it can be removed", async () => {
    const engine = await mountEngine();
    const container = div();
    const view = engine.addView({ kind: "preview", container, mode: "py" });
    await view.ready;

    view.setMode("js");
    await settle();
    expect(text(container)).toBe("console.log();");
    expect(view.getMode()).toBe("js");

    expect(() => view.setTheme({ background: "#ffffff" })).not.toThrow();

    view.dispose();
    expect(container.querySelector(".cm-editor")).toBeNull();
  });

  test("a new mount removes the added views", async () => {
    const engine = await mountEngine();
    const container = div();
    await engine.addView({ kind: "preview", container, mode: "py" }).ready;

    await engine.mount({ workspaceContainer: div() });

    expect(container.querySelector(".cm-editor")).toBeNull();
  });

  test("names are unique and modes must render text", async () => {
    const engine = await mountEngine();
    engine.addView({ kind: "preview", container: div(), mode: "py", name: "right" });

    expect(() => engine.addView({ kind: "preview", container: div(), mode: "js", name: "right" })).toThrow(
      /named "right" already exists/,
    );
    expect(() => engine.addView({ kind: "preview", container: div(), mode: "nope" })).toThrow(/unknown mode "nope"/);
    expect(() => engine.addView({ kind: "preview", container: div(), mode: "plain" })).toThrow(/no code element/);
  });
});

describe("added previews and the rest of the engine", () => {
  const editorsInSync = (engine: MorphicBlocks) =>
    (engine as unknown as { selectionSync?: { editors: unknown[] } }).selectionSync?.editors.length ?? 0;

  test("an added preview joins selection sync, and leaves it when removed", async () => {
    const engine = await mountEngine();

    const first = engine.addView({ kind: "preview", container: div(), mode: "py" });
    await first.ready;
    expect(editorsInSync(engine)).toBe(1);

    const second = engine.addView({ kind: "preview", container: div(), mode: "js" });
    await second.ready;
    expect(editorsInSync(engine)).toBe(2);

    second.dispose();
    expect(editorsInSync(engine)).toBe(1);
  });

  test("selection sync stays off when the host turned it off", async () => {
    const engine = new MorphicBlocks(format, { say: () => "" });
    engines.push(engine);
    await engine.mount({ workspaceContainer: div(), selectionSync: false });

    await engine.addView({ kind: "preview", container: div(), mode: "py" }).ready;

    expect(editorsInSync(engine)).toBe(0);
  });

  test("a mode an added preview shows keeps a code element", async () => {
    const engine = await mountEngine();
    engine.addView({ kind: "preview", container: div(), mode: "js" });

    expect(() => engine.setModeElements("js", ["title"])).toThrow(/needs a code element/);
  });
});

describe("views by name", () => {
  test("built in and added views are found by name", async () => {
    const engine = new MorphicBlocks(format, { say: () => "" });
    engines.push(engine);
    await engine.mount({ workspaceContainer: div(), previewContainer: div() });
    engine.setModes({ workspaceMode: "py", previewMode: "js" });

    const named = engine.addView({ kind: "preview", container: div(), mode: "py", name: "right" });
    const unnamed = engine.addView({ kind: "preview", container: div(), mode: "js" });

    expect(engine.getViewMode("workspace")).toBe("py");
    expect(engine.getViewMode("preview")).toBe("js");
    expect(named.name).toBe("right");
    expect(unnamed.name).toBe("view-1");
    expect(engine.getViewMode("view-1")).toBe("js");
    expect(engine.getViewMode("nothing")).toBeUndefined();
    expect(() => engine.addView({ kind: "preview", container: div(), mode: "py", name: "preview" })).toThrow(
      /named "preview" already exists/,
    );
  });
});

describe("toolbars on added views", () => {
  test("an added view brings its own toolbar, acting on that view", async () => {
    const engine = await mountEngine();
    const toolbar = div();
    const view = engine.addView({ kind: "preview", container: div(), mode: "js", name: "right", toolbar: { container: toolbar } });
    await view.ready;

    expect(toolbar.dataset.morphicView).toBe("right");
    expect(toolbar.querySelector(".morphic-toolbar-label")?.textContent).toBe("Mode: js");

    view.setMode("py");
    expect(toolbar.querySelector(".morphic-toolbar-label")?.textContent).toBe("Mode: py");

    view.dispose();
    expect(toolbar.childElementCount).toBe(0);
  });

  test("each toolbar can have its own items", async () => {
    const engine = await mountEngine();
    const toolbar = div();
    engine.addView({ kind: "preview", container: div(), mode: "js", toolbar: { container: toolbar, items: [] } });

    expect(toolbar.querySelector("[data-toolbar-id]")).toBeNull();
  });

  test("a toolbar for a view that does not exist is refused", async () => {
    const engine = await mountEngine();

    expect(() => engine.mountToolbar(div(), { view: "nothing" })).toThrow(/no view named "nothing"/);
  });
});

test("added previews follow blocks reordered with events off", async () => {
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
  await engine.addView({ kind: "preview", container, mode: "js" }).ready;
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
      { name: "a", toolbox: "py", workspace: "py", views: { right: "js" } },
      { name: "b", toolbox: "py", workspace: "py", views: { right: "py", missing: "js" } },
    ],
  };

  test("applying a preset switches the views it names", async () => {
    const engine = new MorphicBlocks(withPresets, { say: () => "" });
    engines.push(engine);
    await engine.mount({ workspaceContainer: div(), preset: "a" });
    const view = engine.addView({ kind: "preview", container: div(), mode: "js", name: "right" });

    engine.applyPreset("b");
    expect(view.getMode()).toBe("py");

    engine.applyPreset("a");
    expect(view.getMode()).toBe("js");
  });

  test("a preset naming an unknown mode for a view is refused", () => {
    const engine = new MorphicBlocks(
      { ...format, presets: [{ name: "a", toolbox: "py", workspace: "py", views: { right: "nope" } }] },
      {},
    );
    engines.push(engine);

    expect(() => engine.mount({ workspaceContainer: div() })).toThrow(/unknown mode "nope" for view "right"/);
  });
});

