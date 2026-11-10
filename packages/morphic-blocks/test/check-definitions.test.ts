import { afterEach, describe, expect, test } from "vitest";
import { checkDefinitions, MorphicBlocks } from "../src";
import type { MorphicBlocksFormat } from "../src/morphic/types";

/** checkDefinitions runs every check mount() runs on a definitions file, without mounting. */

const format = (): MorphicBlocksFormat => ({
  elementTypes: { words: "code", icon: "image" },
  modes: [{ name: "word-tiles", elements: ["words"] }],
  views: { "editor-pane": "workspace" },
  presets: [{ name: "start-preset", toolbox: "word-tiles", views: { "editor-pane": "words" } }],
  blocks: [{ identifier: "say", elements: { words: "say %1" }, inputSlots: { "1": { kind: "value", name: "VALUE" } }, shape: "statement" }],
});

describe("checkDefinitions", () => {
  test("a sound file has no errors or warnings", () => {
    expect(checkDefinitions(format())).toEqual({ errors: [], warnings: [] });
  });

  test("the engine's own block checks come first", () => {
    const definitions = format();
    definitions.blocks.push({ ...definitions.blocks[0]! });

    expect(checkDefinitions(definitions)).toEqual({ errors: ['Duplicate block identifier "say".'], warnings: [] });
  });

  test("the preset checks mount runs, all of them at once", () => {
    const definitions = format();
    definitions.presets = [
      { name: "a-preset", toolbox: "missing-tiles", views: { "editor-pane": "icon", "other-pane": "words" } },
      { name: "a-preset", toolbox: "word-tiles", views: { "editor-pane": "words" } },
    ];

    const { errors, warnings } = checkDefinitions(definitions);
    expect(errors).toEqual([
      'Preset "a-preset": unknown mode "missing-tiles" for the toolbox.',
      'Preset "a-preset": view "editor-pane" shows "icon", which is no code element.',
      'Preset "a-preset" is defined more than once.',
    ]);
    expect(warnings).toEqual(['Preset "a-preset" names "other-pane", which is no declared view (editor-pane).']);
  });

  test("view kinds and moved settings are errors", () => {
    const definitions = format() as MorphicBlocksFormat & { highlighting: object };
    definitions.views = { "editor-pane": "workspace", "read-pane": { kind: "preview" as "codespace" } };
    definitions.highlighting = {};

    expect(checkDefinitions(definitions).errors).toEqual([
      'The top level "highlighting" map moved into the "code" section: "code": { "<element>": { "highlighting": { … } } }.',
      'View "read-pane": the preview is a codespace that cannot be edited since 0.4.0: { "kind": "codespace", "editable": false }.',
    ]);
  });

  test("with the styled modes, a mode without a stylesheet warns", () => {
    expect(checkDefinitions(format(), {}, { modeStyles: [] }).warnings).toEqual(["Modes without explicit CSS definition: word-tiles."]);
    expect(checkDefinitions(format(), {}, { modeStyles: ["word-tiles"] }).warnings).toEqual([]);
  });
});

describe("mount reports every preset error at once", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  test("two broken presets are both named", () => {
    const definitions = format();
    definitions.presets = [
      { name: "a-preset", toolbox: "missing-tiles", views: { "editor-pane": "words" } },
      { name: "b-preset", toolbox: "other-tiles", views: { "editor-pane": "words" } },
    ];
    const engine = new MorphicBlocks(definitions, {});

    expect(() => engine.mount({ containers: { "editor-pane": document.body.appendChild(document.createElement("div")) } })).toThrow(
      '[MorphicBlocks] Invalid definitions:\n- Preset "a-preset": unknown mode "missing-tiles" for the toolbox.\n- Preset "b-preset": unknown mode "other-tiles" for the toolbox.',
    );
    engine.dispose();
  });
});
