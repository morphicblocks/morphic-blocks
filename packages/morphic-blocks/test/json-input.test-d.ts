import { expectTypeOf, test } from "vitest";
import { MorphicBlocks, type MorphicBlocksFormatJson } from "../src";
import definitions from "./fixtures/definitions.json";

/**
 * A definitions file imported from JSON must be accepted without a cast.
 * TypeScript widens JSON values ("code" to string, pairs to string lists) and
 * adds `undefined` for keys only some objects in a list have; the fixture
 * covers each of those shapes.
 */
test("a JSON import is accepted as definitions without a cast", () => {
  expectTypeOf(definitions).toMatchTypeOf<MorphicBlocksFormatJson>();
  expectTypeOf(() => new MorphicBlocks(definitions, {})).toBeFunction();
});
