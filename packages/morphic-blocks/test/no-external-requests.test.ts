import { describe, expect, test } from "vitest";

/**
 * The framework makes no requests to external services, so a site embedding
 * it keeps control over every request its visitors' browsers make. Anything
 * external stays the host's choice. This fails as soon as an address appears
 * in the framework's source.
 */

// Every source file as text, keyed by its path.
const sources = import.meta.glob<string>("../src/**/*.{ts,css}", { query: "?raw", import: "default", eager: true });

// XML namespace names look like addresses but are never requested.
const NAMESPACES = ["http://www.w3.org/2000/svg", "http://www.w3.org/1999/xhtml", "http://www.w3.org/1999/xlink"];

describe("external requests", () => {
  test("the framework source contains no external addresses", () => {
    // Guards against a pattern that silently matches nothing.
    expect(Object.keys(sources).length).toBeGreaterThan(10);

    const found = Object.entries(sources).flatMap(([file, text]) =>
      (text.match(/(?:https?:)?\/\/[a-z0-9-]+(?:\.[a-z0-9-]+)+[^\s"'`)]*/gi) ?? [])
        .filter((address) => !NAMESPACES.some((ns) => address.startsWith(ns)))
        .map((address) => `${file.replace("../src/", "")}: ${address}`),
    );

    expect(found).toEqual([]);
  });
});
