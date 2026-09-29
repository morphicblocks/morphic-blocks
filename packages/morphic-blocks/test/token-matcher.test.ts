import { expect, test } from "vitest";
import { tokenMatcher } from "../src/morphic/syntax-highlight";

test("the token matcher finds keywords, strings, numbers and comments", () => {
  const match = tokenMatcher({ keywords: ["print"], strings: ['"'], comment: "#" });
  const line = 'print("a\\"b", 42) # done';

  expect(match(line).map((t) => [line.slice(t.from, t.to), t.kind])).toEqual([
    ["print", "keyword"],
    ['"a\\"b"', "string"],
    ["42", "number"],
    ["# done", "comment"],
  ]);
});
