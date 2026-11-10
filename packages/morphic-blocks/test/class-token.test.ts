import { describe, expect, test } from "vitest";
import { toClassToken } from "../src";

/** Apps that write CSS for names from elsewhere use the framework's own rule. */
describe("toClassToken", () => {
  test("keeps a name a class can hold as written", () => {
    expect(toClassToken("title_en")).toBe("title_en");
    expect(toClassToken("iconTiles")).toBe("iconTiles");
  });

  test("turns characters a class cannot hold into one dash", () => {
    expect(toClassToken("my pane")).toBe("my-pane");
    expect(toClassToken("Output & Text")).toBe("Output-Text");
  });
});
