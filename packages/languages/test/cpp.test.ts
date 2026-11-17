import { expect, test } from "vitest";
import { cpp } from "../src/cpp";
import { write } from "./helpers";

/** The text C++ writes for the sample programs. */

test("basics", async () => {
  expect(await write(cpp, "basics")).toBe(
    [
      "// the basics",
      "int total = 2;",
      "total = total * 10;",
      "total += 1;",
      "std::cout << total << std::endl;",
      "std::cout << total % 4 << std::endl;",
      'std::cout << "total: " << total << std::endl;',
      'std::cout << std::string("hello").length() << std::endl;',
      "std::cout << true << std::endl;",
    ].join("\n"),
  );
});

test("control", async () => {
  expect(await write(cpp, "control")).toBe(
    [
      "int count = 0;",
      "for (int i = 0; i < 3; i++) {",
      "    count += 2;",
      "}",
      "while (count < 9) {",
      "    count += 1;",
      "}",
      "if (count == 9 && !(false)) {",
      '    std::cout << "nine" << std::endl;',
      "}",
      "if (count >= 10) {",
      '    std::cout << "big" << std::endl;',
      "} else {",
      '    std::cout << "small" << std::endl;',
      "}",
    ].join("\n"),
  );
});

test("functions", async () => {
  expect(await write(cpp, "functions")).toBe(
    [
      "auto add(int a, int b) {",
      "    return a + b;",
      "}",
      "auto greet(int name) {",
      '    std::cout << "Hello, " << name << std::endl;',
      "}",
      'greet("Ada");',
      "std::cout << add(2, 3) << std::endl;",
    ].join("\n"),
  );
});

test("lists", async () => {
  expect(await write(cpp, "lists")).toBe(
    [
      "std::vector<int> items = {1, 2, 3};",
      "items.push_back(4);",
      "items[0] = 10;",
      "std::cout << items[1] << std::endl;",
      "for (auto item : items) {",
      "    if (item == 3) {",
      "        continue;",
      "    }",
      "    if (item > 20) {",
      "        break;",
      "    }",
      "    std::cout << item << std::endl;",
      "}",
      "std::cout << items.size() << std::endl;",
    ].join("\n"),
  );
});

test("classes", async () => {
  expect(await write(cpp, "classes")).toBe(
    [
      "class Cat {",
      "public:",
      '    std::string sound = "meow";',
      "    int lives = 9;",
      "",
      "    void speak() {",
      "        std::cout << this->sound << std::endl;",
      "    }",
      "};",
      "Cat tom;",
      "tom.speak();",
    ].join("\n"),
  );
});

test("random", async () => {
  expect(await write(cpp, "random")).toBe(
    "std::cout << ((std::rand() % (6 - 1 + 1) + 1) <= 6) << std::endl;",
  );
});
