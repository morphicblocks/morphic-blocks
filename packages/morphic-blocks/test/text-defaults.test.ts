import { afterEach, expect, test } from "vitest";
import type * as Blockly from "blockly";
import { MorphicBlocks } from "../src";
import { applyBlockShapes, createDefinitionMap, expandDefaultElements } from "../src/morphic/definitions";
import { generateTextFromWorkspace } from "../src/morphic/template-codegen";
import type { MorphicBlocksFormat } from "../src/morphic/types";

/**
 * A slot's default that is one of the developer's own blocks reads, in the
 * text views, like that block placed in the slot.
 */

const format: MorphicBlocksFormat = {
  elementTypes: { python: "code" },
  modes: [{ name: "py", elements: ["python"] }],
  blocks: [
    {
      identifier: "print",
      elements: { python: "print(%1)" },
      inputSlots: {
        "1": { kind: "value", name: "VALUE", default: { shadow: "text", fieldValues: { TEXT: "Hello" } } },
      },
      shape: "statement",
    },
    {
      identifier: "select",
      elements: { python: "SELECT %1" },
      inputSlots: { "1": { kind: "value", name: "COLUMNS", default: { shadow: "all_columns" } } },
      shape: "statement",
    },
    {
      identifier: "text",
      elements: { python: '"%TEXT"' },
      fields: { TEXT: { type: "text", default: "" } },
      output: true,
    },
    { identifier: "all_columns", elements: { python: "*" }, output: true },
  ],
};

const definitions = createDefinitionMap(
  applyBlockShapes(expandDefaultElements(format.blocks, format.elementTypes ?? {})),
);
const engines: MorphicBlocks[] = [];

async function textOf(type: string) {
  const engine = new MorphicBlocks(format, {});
  engines.push(engine);
  await engine.mount({ workspaceContainer: document.body.appendChild(document.createElement("div")) });
  const workspace = engine.getWorkspace()!;
  const block = workspace.newBlock(`morphic:${type}`) as Blockly.BlockSvg;
  block.initSvg();
  block.render();
  return generateTextFromWorkspace(workspace, "py", definitions, format.elementTypes ?? {}, format.modes ?? []);
}

afterEach(() => {
  for (const engine of engines.splice(0)) engine.dispose();
  document.body.innerHTML = "";
});

test("a default is written through its own template", async () => {
  const { code, placeholders } = await textOf("print");

  expect(code).toBe('print("Hello")');
  // Only the value is the editable default, not the quotes around it.
  const edit = placeholders.find((range) => range.edit);
  expect(code.slice(edit!.start, edit!.end)).toBe("Hello");
  expect(edit!.kind).toBe("default");
});

test("a default without fields still shows", async () => {
  const { code, metadata } = await textOf("select");

  expect(code).toBe("SELECT *");
  // The default is part of its parent, never a block of its own.
  expect(metadata.size).toBe(1);
});

test("a dropdown in a text view lists options as that view writes them", async () => {
  const flagFormat: MorphicBlocksFormat = {
    elementTypes: { concept: "code", python: "code" },
    modes: [
      { name: "concept", elements: ["concept"] },
      { name: "py", elements: ["python"] },
    ],
    blocks: [
      {
        identifier: "flag",
        elements: { concept: "%BOOL", python: "%BOOL" },
        fields: {
          BOOL: {
            type: "dropdown",
            options: [
              { value: "true", label: "yes", display: { python: "True" } },
              { value: "false", label: "no", display: { python: "False" } },
            ],
            default: "true",
          },
        },
        output: "Boolean",
      },
    ],
  };
  const engine = new MorphicBlocks(flagFormat, {});
  engines.push(engine);
  await engine.mount({ workspaceContainer: document.body.appendChild(document.createElement("div")) });
  const workspace = engine.getWorkspace()!;
  workspace.newBlock("morphic:flag");
  const flagDefinitions = createDefinitionMap(
    applyBlockShapes(expandDefaultElements(flagFormat.blocks, flagFormat.elementTypes ?? {})),
  );

  // The workspace shows the concept mode; the codespace writes Python.
  const { placeholders } = generateTextFromWorkspace(
    workspace,
    "py",
    flagDefinitions,
    flagFormat.elementTypes ?? {},
    flagFormat.modes ?? [],
  );

  expect(placeholders.find((range) => range.edit)?.edit?.options).toEqual([
    ["True", "true"],
    ["False", "false"],
  ]);
});

