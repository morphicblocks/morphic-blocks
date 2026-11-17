import { expect, test } from "vitest";
import { python } from "../src/python";
import { write } from "./helpers";

/** The text Python writes for the sample programs. */

test("basics", async () => {
  expect(await write(python, "basics")).toBe(
    [
      "# the basics",
      "total = 2",
      "total = total * 10",
      "total += 1",
      "print(total)",
      "print(total % 4)",
      'print("".join(map(str, ["total: ", total])))',
      'print(len("hello"))',
      "print(True)",
    ].join("\n"),
  );
});

test("control", async () => {
  expect(await write(python, "control")).toBe(
    [
      "count = 0",
      "for _ in range(3):",
      "    count += 2",
      "while count < 9:",
      "    count += 1",
      "if count == 9 and not False:",
      '    print("nine")',
      "if count >= 10:",
      '    print("big")',
      "else:",
      '    print("small")',
    ].join("\n"),
  );
});

test("functions", async () => {
  expect(await write(python, "functions")).toBe(
    [
      "def add(a, b):",
      "    return a + b",
      "def greet(name):",
      '    print("".join(map(str, ["Hello, ", name])))',
      'greet("Ada")',
      "print(add(2, 3))",
    ].join("\n"),
  );
});

test("lists", async () => {
  expect(await write(python, "lists")).toBe(
    [
      "items = [1, 2, 3]",
      "items.append(4)",
      "items[0] = 10",
      "print(items[1])",
      "for item in items:",
      "    if item == 3:",
      "        continue",
      "    if item > 20:",
      "        break",
      "    print(item)",
      "print(len(items))",
    ].join("\n"),
  );
});

test("classes", async () => {
  expect(await write(python, "classes")).toBe(
    [
      "class Cat:",
      "    def __init__(self):",
      '        self.sound = "meow"',
      "        self.lives = 9",
      "",
      "    def speak(self):",
      "        print(self.sound)",
      "tom = Cat()",
      "tom.speak()",
    ].join("\n"),
  );
});

test("random", async () => {
  expect(await write(python, "random")).toBe("print(random.randint(1, 6) <= 6)");
});
