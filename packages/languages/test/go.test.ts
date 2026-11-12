import { expect, test } from "vitest";
import { go } from "../src/go";
import { write } from "./helpers";

/** The text Go writes for the sample programs. */

test("basics", async () => {
  expect(await write(go, "basics")).toBe(
    [
      "// the basics",
      "total := 2",
      "total = total * 10",
      "total += 1",
      "fmt.Println(total)",
      "fmt.Println(total % 4)",
      'fmt.Println(fmt.Sprint("total: ", total))',
      'fmt.Println(len("hello"))',
      "fmt.Println(true)",
    ].join("\n"),
  );
});

test("control", async () => {
  expect(await write(go, "control")).toBe(
    [
      "count := 0",
      "for i := 0; i < 3; i++ {",
      "    count += 2",
      "}",
      "for count < 9 {",
      "    count += 1",
      "}",
      "if (count == 9) && !(false) {",
      '    fmt.Println("nine")',
      "}",
      "if count >= 10 {",
      '    fmt.Println("big")',
      "} else {",
      '    fmt.Println("small")',
      "}",
    ].join("\n"),
  );
});

test("functions", async () => {
  expect(await write(go, "functions")).toBe(
    [
      "func add(a any, b any) {",
      "    return a + b",
      "}",
      "func greet(name any) {",
      '    fmt.Println(fmt.Sprint("Hello, ", name))',
      "}",
      'greet("Ada")',
      "fmt.Println(add(2, 3))",
    ].join("\n"),
  );
});

test("lists", async () => {
  expect(await write(go, "lists")).toBe(
    [
      "items := []any{1, 2, 3}",
      "items = append(items, 4)",
      "items[0] = 10",
      "fmt.Println(items[1])",
      "for _, item := range items {",
      "    if item == 3 {",
      "        continue",
      "    }",
      "    if item > 20 {",
      "        break",
      "    }",
      "    fmt.Println(item)",
      "}",
      "fmt.Println(len(items))",
    ].join("\n"),
  );
});

test("classes", async () => {
  expect(await write(go, "classes")).toBe(
    [
      "type Cat struct {",
      "    sound string",
      "    lives int",
      "}",
      "",
      "func (self *Cat) speak() {",
      "    fmt.Println(self.sound)",
      "}",
      "tom := &Cat{}",
      "tom.speak()",
    ].join("\n"),
  );
});

test("random", async () => {
  expect(await write(go, "random")).toBe("fmt.Println((rand.Intn(6 - 1 + 1) + 1) <= 6)");
});
