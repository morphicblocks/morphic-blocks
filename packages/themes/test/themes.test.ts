import { describe, expect, test } from "vitest";
import { themes } from "../src";

const versions = Object.values(themes).flatMap((family) => [family.light, family.dark]);

describe("themes", () => {
  test("set the same fields", () => {
    const fields = Object.keys(themes.standard!.dark).sort();
    for (const theme of versions) expect(Object.keys(theme).sort()).toEqual(fields);
  });

  test("use hex colors", () => {
    for (const theme of versions) {
      for (const [field, value] of Object.entries(theme)) {
        if (/background|foreground/i.test(field)) expect(value).toMatch(/^#[0-9a-f]{6}$/);
      }
    }
  });
});
