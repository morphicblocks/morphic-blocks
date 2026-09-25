import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

/**
 * The framework makes no requests to external services, so a site embedding
 * it keeps control over every request its visitors' browsers make. Anything
 * external stays the host's choice. This fails as soon as an address appears
 * in the framework's source.
 */

const src = join(__dirname, "../src");

// XML namespace names look like addresses but are never requested.
const NAMESPACES = ["http://www.w3.org/2000/svg", "http://www.w3.org/1999/xhtml", "http://www.w3.org/1999/xlink"];

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? sourceFiles(join(dir, entry.name)) : [join(dir, entry.name)],
  );
}

describe("external requests", () => {
  test("the framework source contains no external addresses", () => {
    const found = sourceFiles(src).flatMap((file) =>
      (readFileSync(file, "utf8").match(/(?:https?:)?\/\/[a-z0-9-]+(?:\.[a-z0-9-]+)+[^\s"'`)]*/gi) ?? [])
        .filter((address) => !NAMESPACES.some((ns) => address.startsWith(ns)))
        .map((address) => `${file.slice(src.length + 1)}: ${address}`),
    );

    expect(found).toEqual([]);
  });
});
