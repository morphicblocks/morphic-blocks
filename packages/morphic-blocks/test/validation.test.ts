import { describe, expect, test } from "vitest";
import { MorphicBlocks } from "../src";

/**
 * Definitions often come from a JSON file, where TypeScript cannot check
 * literal values. mount() must report the ones that would otherwise break a
 * block silently.
 */

function mountWith(format: unknown): () => void {
  return () =>
    new MorphicBlocks(format as never, {}).mount({
      workspaceContainer: document.body.appendChild(document.createElement("div")),
    });
}

const block = {
  identifier: "say",
  elements: { code: "say %1 %WORD" },
  inputSlots: { "1": { kind: "value", name: "VALUE" } },
  fields: { WORD: { type: "text" } },
  shape: "statement",
};

describe("validation of values JSON cannot type check", () => {
  test("valid definitions mount", () => {
    expect(mountWith({ elementTypes: { code: "code" }, blocks: [block] })).not.toThrow();
  });

  test("an unknown element type is reported", () => {
    expect(mountWith({ elementTypes: { code: "cdoe" }, blocks: [block] })).toThrow(
      /elementTypes."code": unknown type "cdoe"/,
    );
  });

  test("an unknown slot kind is reported", () => {
    const bad = { ...block, inputSlots: { "1": { kind: "valeu", name: "VALUE" } } };
    expect(mountWith({ elementTypes: { code: "code" }, blocks: [bad] })).toThrow(
      /inputSlots\["1"\] has unknown kind "valeu"/,
    );
  });

  test("an unknown field type is reported", () => {
    const bad = { ...block, fields: { WORD: { type: "txt" } } };
    expect(mountWith({ elementTypes: { code: "code" }, blocks: [bad] })).toThrow(
      /fields\["WORD"\] has unknown type "txt"/,
    );
  });
});
