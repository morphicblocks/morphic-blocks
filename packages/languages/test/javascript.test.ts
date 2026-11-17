import { expect, test } from "vitest";
import { javascript } from "../src/javascript";
import { write } from "./helpers";

/** The text JavaScript writes for the sample programs. */

test("basics", async () => {
  expect(await write(javascript, "basics")).toBe(
    [
    "// the basics",
    "let total = 2;",
    "total = total * 10;",
    "total += 1;",
    "console.log(total);",
    "console.log(total % 4);",
    "console.log(\"total: \" + total);",
    "console.log(\"hello\".length);",
    "console.log(true);"
    ].join("\n"),
  );
});

test("control", async () => {
  expect(await write(javascript, "control")).toBe(
    [
    "let count = 0;",
    "for (let i = 0; i < 3; i++) {",
    "  count += 2;",
    "}",
    "while (count < 9) {",
    "  count += 1;",
    "}",
    "if (count === 9 && !(false)) {",
    "  console.log(\"nine\");",
    "}",
    "if (count >= 10) {",
    "  console.log(\"big\");",
    "} else {",
    "  console.log(\"small\");",
    "}"
    ].join("\n"),
  );
});

test("functions", async () => {
  expect(await write(javascript, "functions")).toBe(
    [
    "function add(a, b) {",
    "  return a + b;",
    "}",
    "function greet(name) {",
    "  console.log(\"Hello, \" + name);",
    "}",
    "greet(\"Ada\");",
    "console.log(add(2, 3));"
    ].join("\n"),
  );
});

test("lists", async () => {
  expect(await write(javascript, "lists")).toBe(
    [
    "let items = [1, 2, 3];",
    "items.push(4);",
    "items[0] = 10;",
    "console.log(items[1]);",
    "for (const item of items) {",
    "  if (item === 3) {",
    "    continue;",
    "  }",
    "  if (item > 20) {",
    "    break;",
    "  }",
    "  console.log(item);",
    "}",
    "console.log(items.length);"
    ].join("\n"),
  );
});

test("classes", async () => {
  expect(await write(javascript, "classes")).toBe(
    [
    "class Cat {",
    "  sound = \"meow\";",
    "  lives = 9;",
    "",
    "  speak() {",
    "    console.log(this.sound);",
    "  }",
    "}",
    "const tom = new Cat();",
    "tom.speak();"
    ].join("\n"),
  );
});

test("random", async () => {
  expect(await write(javascript, "random")).toBe(
    [
    "console.log((Math.floor(Math.random() * (6 - 1 + 1)) + 1) <= 6);"
    ].join("\n"),
  );
});
