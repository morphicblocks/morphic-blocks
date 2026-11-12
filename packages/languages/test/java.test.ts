import { expect, test } from "vitest";
import { java } from "../src/java";
import { write } from "./helpers";

/** The text Java writes for the sample programs. */

test("basics", async () => {
  expect(await write(java, "basics")).toBe(
    [
      "// the basics",
      "int total = 2;",
      "total = total * 10;",
      "total += 1;",
      "System.out.println(total);",
      "System.out.println(total % 4);",
      'System.out.println("total: " + total);',
      'System.out.println("hello".length());',
      "System.out.println(true);",
    ].join("\n"),
  );
});

test("control", async () => {
  expect(await write(java, "control")).toBe(
    [
      "int count = 0;",
      "for (int i = 0; i < 3; i++) {",
      "    count += 2;",
      "}",
      "while (count < 9) {",
      "    count += 1;",
      "}",
      "if ((count == 9) && !(false)) {",
      '    System.out.println("nine");',
      "}",
      "if (count >= 10) {",
      '    System.out.println("big");',
      "} else {",
      '    System.out.println("small");',
      "}",
    ].join("\n"),
  );
});

test("functions", async () => {
  expect(await write(java, "functions")).toBe(
    [
      "static Object add(int a, int b) {",
      "    return a + b;",
      "}",
      "static Object greet(int name) {",
      '    System.out.println("Hello, " + name);',
      "}",
      'greet("Ada");',
      "System.out.println(add(2, 3));",
    ].join("\n"),
  );
});

test("lists", async () => {
  expect(await write(java, "lists")).toBe(
    [
      "var items = new ArrayList<>(List.of(1, 2, 3));",
      "items.add(4);",
      "items.set(0, 10);",
      "System.out.println(items.get(1));",
      "for (var item : items) {",
      "    if (item == 3) {",
      "        continue;",
      "    }",
      "    if (item > 20) {",
      "        break;",
      "    }",
      "    System.out.println(item);",
      "}",
      "System.out.println(items.size());",
    ].join("\n"),
  );
});

test("classes", async () => {
  expect(await write(java, "classes")).toBe(
    [
      "class Cat {",
      '    String sound = "meow";',
      "    int lives = 9;",
      "",
      "    void speak() {",
      "        System.out.println(this.sound);",
      "    }",
      "}",
      "Cat tom = new Cat();",
      "tom.speak();",
    ].join("\n"),
  );
});

test("random", async () => {
  expect(await write(java, "random")).toBe(
    "System.out.println(new Random().nextInt(1, 6 + 1) <= 6);",
  );
});
