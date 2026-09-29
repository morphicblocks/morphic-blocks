import { describe, expect, test, vi } from "vitest";
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

describe("settings moved into the code section in 0.3.0", () => {
  test("string quotes and empty defaults in elementTypes are reported with directions", () => {
    const old = { elementTypes: { code: { type: "code", stringQuote: '"', empty: {} } }, blocks: [block] };
    expect(mountWith(old)).toThrow(/elementTypes."code": "stringQuote" moved into the "code" section/);
    expect(mountWith(old)).toThrow(/elementTypes."code": "empty" moved into the "code" section/);
  });

  test("the top level highlighting map is reported with directions", () => {
    const old = { elementTypes: { code: "code" }, highlighting: { code: { keywords: ["say"] } }, blocks: [block] };
    expect(mountWith(old)).toThrow(/"highlighting" map moved into the "code" section/);
  });
});

describe("onWarning", () => {
  test("framework warnings go to the app instead of the console", async () => {
    const console_ = vi.spyOn(console, "warn").mockImplementation(() => {});
    const warnings: string[] = [];
    const engine = new MorphicBlocks(
      {
        elementTypes: { code: "code" },
        modes: [{ name: "only", elements: ["code", "nope"] }],
        blocks: [block],
      } as never,
      {},
    );

    await engine.mount({
      workspaceContainer: document.body.appendChild(document.createElement("div")),
      onWarning: (message) => warnings.push(message),
    });

    expect(warnings.some((m) => m.includes("Definition warnings"))).toBe(true);
    expect(warnings.some((m) => m.includes("Modes without explicit CSS"))).toBe(true);
    expect(console_).not.toHaveBeenCalled();
    engine.dispose();
    console_.mockRestore();
  });
});
