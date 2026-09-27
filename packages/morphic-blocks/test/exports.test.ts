import { expect, test } from "vitest";
import { toCleanId } from "../src";

test("a live block type turns back into its identifier", () => {
  expect(toCleanId("morphic:text_print")).toBe("text_print");
  expect(toCleanId("math_number")).toBe("math_number");
});
