import { afterEach, describe, expect, test } from "vitest";
import { MorphicBlocks } from "../src";
import type { MorphicBlocksFormat } from "../src/morphic/types";

/** Without a workspace container, the program lives in a hidden workspace while the text views switch freely. */

const format: MorphicBlocksFormat = {
  elementTypes: { outline: "code", python: "code", go: "code" },
  modes: [
    { name: "in-python", elements: ["python"] },
    { name: "in-go", elements: ["go"] },
  ],
  views: { workspace: "workspace", codespace: "codespace", preview: { kind: "codespace", editable: false } },
  presets: [{ name: "start", toolbox: "in-python", views: { workspace: "outline", codespace: "python", preview: "go" } }],
  blocks: [{ identifier: "say", elements: { outline: "say", python: "print()", go: "fmt.Println()" }, shape: "statement" }],
};

const engines: MorphicBlocks[] = [];
const div = () => document.body.appendChild(document.createElement("div"));

afterEach(() => {
  for (const engine of engines.splice(0)) engine.dispose();
  document.body.innerHTML = "";
});

async function setUp(definitions: MorphicBlocksFormat = format) {
  const engine = new MorphicBlocks(definitions, {});
  engines.push(engine);
  await engine.mount({ containers: { codespace: div(), preview: div() } });
  const programElement = () => (engine as unknown as { mountConfig: { workspaceElement: string } }).mountConfig.workspaceElement;
  return { engine, programElement };
}

describe("a hidden program workspace", () => {
  test("takes the element the preset gives the declared workspace", async () => {
    const { programElement } = await setUp();

    expect(programElement()).toBe("outline");
  });

  test("leaves the codespace free to switch", async () => {
    const { engine, programElement } = await setUp();

    engine.show({ toolbox: "in-go", views: { codespace: "go", preview: "python" } });

    expect(engine.getViewElement("codespace")).toBe("go");
    expect(engine.getViewElement("preview")).toBe("python");
    expect(programElement()).toBe("outline");
  });

  test("follows the first shown view when no workspace is declared", async () => {
    const { workspace: _, ...textOnly } = format.views!;
    const { engine, programElement } = await setUp({
      ...format,
      views: textOnly,
      presets: [{ name: "start", toolbox: "in-python", views: { codespace: "python", preview: "go" } }],
    });

    engine.show({ views: { codespace: "go" } });

    expect(engine.getViewElement("codespace")).toBe("go");
    expect(programElement()).toBe("go");
  });
});
