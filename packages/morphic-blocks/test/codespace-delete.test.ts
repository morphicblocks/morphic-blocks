import { afterEach, describe, expect, test, vi } from "vitest";
import type * as Blockly from "blockly";
import { MorphicBlocks } from "../src";
import type { MorphicBlocksFormat } from "../src/morphic/types";

/** Deleting a line in the codespace removes the block the line belongs to, as the workspace would. */

const format: MorphicBlocksFormat = {
  elementTypes: { js: "code" },
  modes: [{ name: "js", elements: ["js"] }],
  blocks: [
    {
      identifier: "when",
      elements: { js: "if (%1) {\n  %2\n}" },
      inputSlots: { "1": { kind: "value", name: "IF" }, "2": { kind: "statement", name: "DO" } },
      shape: "statement",
    },
    {
      identifier: "say",
      elements: { js: "say(%1);" },
      inputSlots: { "1": { kind: "value", name: "VALUE", default: { shadow: "num", fieldValues: { N: "1" } } } },
      shape: "statement",
    },
    {
      identifier: "plus",
      elements: { js: "%1 + %2" },
      inputSlots: {
        "1": { kind: "value", name: "A", default: { shadow: "num", fieldValues: { N: "3" } } },
        "2": { kind: "value", name: "B", default: { shadow: "num", fieldValues: { N: "5" } } },
      },
      output: true,
    },
    { identifier: "num", elements: { js: "%N" }, fields: { N: { type: "number", default: 0 } }, output: true },
  ],
};

const engines: MorphicBlocks[] = [];
const div = () => document.body.appendChild(document.createElement("div"));
// The codespace writes its text after a short pause.
const settle = () => new Promise((resolve) => setTimeout(resolve, 300));

afterEach(() => {
  for (const engine of engines.splice(0)) engine.dispose();
  document.body.innerHTML = "";
});

async function setUp() {
  const engine = new MorphicBlocks(format, {});
  engines.push(engine);
  const toolbar = div();
  await engine.mount({ workspaceContainer: div(), codespaceContainer: div(), toolbarContainers: { codespace: toolbar } });
  engine.setModes({ codespaceMode: "js" });
  const workspace = engine.getWorkspace()!;
  const make = (type: string) => {
    const block = workspace.newBlock(`morphic:${type}`) as Blockly.BlockSvg;
    block.initSvg();
    block.render();
    return block;
  };
  // if (3 + 5) { say(3 + 5); }  and, as its own group, 3 + 5
  const when = make("when");
  when.getInput("IF")!.connection!.connect(make("plus").outputConnection!);
  const say = make("say");
  when.getInput("DO")!.connection!.connect(say.previousConnection!);
  say.getInput("VALUE")!.connection!.connect(make("plus").outputConnection!);
  const loose = make("plus");
  loose.moveBy(0, 500);
  const internals = engine as unknown as {
    codespace: { getValue(): string; editorView: import("@codemirror/view").EditorView };
    deleteBlockAtCodespaceLine(editor: unknown, line: number, lastLine?: number): void;
  };
  // Under load the pause can pass before the codespace has written the program.
  await vi.waitFor(() => expect(internals.codespace.getValue()).toContain("3 + 5"), { timeout: 3000 });
  const deleteLine = async (line: number, lastLine?: number) => {
    internals.deleteBlockAtCodespaceLine(internals.codespace, line, lastLine);
    await settle();
  };
  // Select from the start of line `first` to the end of line `last`.
  const selectLines = (first: number, last: number) => {
    const view = internals.codespace.editorView;
    view.dispatch({ selection: { anchor: view.state.doc.line(first).from, head: view.state.doc.line(last).to } });
  };
  const pressOnLines = async (key: string, first: number, last: number) => {
    selectLines(first, last);
    const view = internals.codespace.editorView;
    view.contentDOM.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
    await settle();
  };
  const deleteButton = () => toolbar.querySelector<HTMLButtonElement>('[data-toolbar-id="delete"]')!;
  return {
    engine,
    workspace,
    make,
    when,
    say,
    loose,
    deleteLine,
    selectLines,
    pressOnLines,
    deleteButton,
    text: () => internals.codespace.getValue(),
  };
}

describe("deleting a line in the codespace", () => {
  test("removes the statement starting on it, with what it holds", async () => {
    const { workspace, when, deleteLine } = await setUp();
    expect(workspace.getBlockById(when.id)).not.toBeNull();

    await deleteLine(1);

    expect(workspace.getBlockById(when.id)).toBeNull();
  });

  test("removes a statement whose value has defaults, not the defaults", async () => {
    const { workspace, when, say, deleteLine } = await setUp();

    await deleteLine(2);

    expect(workspace.getBlockById(say.id)).toBeNull();
    expect(workspace.getBlockById(when.id)).not.toBeNull();
  });

  test("on a closing line removes the block it closes", async () => {
    const { workspace, when, deleteLine } = await setUp();

    await deleteLine(3);

    expect(workspace.getBlockById(when.id)).toBeNull();
  });

  test("removes a value standing as its own group", async () => {
    const { workspace, loose, text, deleteLine } = await setUp();
    const line = text().split("\n").indexOf("3 + 5") + 1;

    await deleteLine(line);

    expect(workspace.getBlockById(loose.id)).toBeNull();
  });
});

describe("deleting selected lines in the codespace", () => {
  test("removes the blocks of all of them", async () => {
    const { workspace, when, loose, text, deleteLine } = await setUp();
    const last = text().split("\n").indexOf("3 + 5") + 1;

    await deleteLine(1, last);

    expect(workspace.getBlockById(when.id)).toBeNull();
    expect(workspace.getBlockById(loose.id)).toBeNull();
    expect(text()).toBe("");
  });

  test("removes statements that follow each other", async () => {
    const { workspace, when, say, make, deleteLine } = await setUp();
    const after = make("say");
    when.nextConnection!.connect(after.previousConnection!);
    await settle();

    await deleteLine(3, 4);

    expect(workspace.getBlockById(when.id)).toBeNull();
    expect(workspace.getBlockById(say.id)).toBeNull();
    expect(workspace.getBlockById(after.id)).toBeNull();
  });

  test("removes a statement inside a selected one with it, in one undo step", async () => {
    const { engine, workspace, when, say, deleteLine } = await setUp();

    await deleteLine(1, 2);
    expect(workspace.getBlockById(when.id)).toBeNull();

    engine.getWorkspace()!.undo(false);
    expect(workspace.getBlockById(when.id)).not.toBeNull();
    expect(workspace.getBlockById(say.id)).not.toBeNull();
  });

  test("happens with Delete or Backspace", async () => {
    const { workspace, when, loose, text, pressOnLines } = await setUp();
    const last = text().split("\n").indexOf("3 + 5") + 1;

    await pressOnLines("Backspace", last, last);
    expect(workspace.getBlockById(loose.id)).toBeNull();
    expect(workspace.getBlockById(when.id)).not.toBeNull();

    await pressOnLines("Delete", 1, 3);
    expect(workspace.getBlockById(when.id)).toBeNull();
  });

  test("happens with the toolbar button, enabled only while lines are selected", async () => {
    const { workspace, when, selectLines, deleteButton } = await setUp();
    expect(deleteButton().disabled).toBe(true);

    selectLines(1, 3);
    expect(deleteButton().disabled).toBe(false);
    // The browser shows the selection too; jsdom does not, so set it by hand.
    const content = document.querySelector(".cm-content")!;
    document.getSelection()!.selectAllChildren(content);

    deleteButton().click();
    await settle();
    expect(workspace.getBlockById(when.id)).toBeNull();
    expect(deleteButton().disabled).toBe(true);
    // The button took the focus: the browser's selection must not stay on the text left.
    expect(document.getSelection()?.toString()).toBe("");
  });
});
