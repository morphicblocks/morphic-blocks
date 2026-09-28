import { afterEach, expect, test } from "vitest";
import { MorphicBlocks } from "../src";
import type { MorphicBlocksFormat } from "../src/morphic/types";

/**
 * Programs run as JavaScript. Printed values read the way the language the
 * codespace shows writes them, when its code element has a value format.
 */

const format: MorphicBlocksFormat = {
  elementTypes: { python: "code", javascript: "code" },
  code: {
    python: {
      values: {
        true: "True",
        false: "False",
        null: "None",
        NaN: "nan",
        list: { quote: "'" },
      },
    },
  },
  modes: [
    { name: "py", elements: ["python"] },
    { name: "js", elements: ["javascript"] },
  ],
  blocks: [{ identifier: "show", elements: { python: "show()", javascript: "show()" }, shape: "statement" }],
};

const engines: MorphicBlocks[] = [];

afterEach(() => {
  for (const engine of engines.splice(0)) engine.dispose();
  document.body.innerHTML = "";
});

async function printed(mode: string): Promise<string[]> {
  const engine = new MorphicBlocks(format, {
    show: () => 'console.log(true, false, null, NaN, [1, "a"], "text", 3);\n',
  });
  engines.push(engine);
  await engine.mount({ workspaceContainer: document.body.appendChild(document.createElement("div")) });
  engine.setModes({ workspaceMode: mode });
  engine.getWorkspace()!.newBlock("morphic:show");
  return engine.runJavaScript().output.map((line) => line.text);
}

test("values print the way the shown language writes them", async () => {
  expect(await printed("py")).toEqual(["True False None nan [1, 'a'] text 3"]);
});

test("without a value format, values print as JavaScript", async () => {
  expect(await printed("js")).toEqual(["true false null NaN 1,a text 3"]);
});
