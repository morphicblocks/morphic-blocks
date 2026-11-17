import { expect, test } from "vitest";
import { rust } from "../src/rust";
import { write } from "./helpers";

/** The text Rust writes for the sample programs. */

test("basics", async () => {
  expect(await write(rust, "basics")).toBe(
    [
      "// the basics",
      "let mut total = 2;",
      "total = total * 10;",
      "total += 1;",
      'println!("{}", total);',
      'println!("{}", total % 4);',
      'println!("{}", ["total: ", total].concat());',
      'println!("{}", "hello".len());',
      'println!("{}", true);',
    ].join("\n"),
  );
});

test("control", async () => {
  expect(await write(rust, "control")).toBe(
    [
      "let mut count = 0;",
      "for _ in 0..3 {",
      "    count += 2;",
      "}",
      "while count < 9 {",
      "    count += 1;",
      "}",
      "if count == 9 && !(false) {",
      '    println!("{}", "nine");',
      "}",
      "if count >= 10 {",
      '    println!("{}", "big");',
      "} else {",
      '    println!("{}", "small");',
      "}",
    ].join("\n"),
  );
});

test("functions", async () => {
  expect(await write(rust, "functions")).toBe(
    [
      "fn add(a: i32, b: i32) {",
      "    return a + b;",
      "}",
      "fn greet(name: i32) {",
      '    println!("{}", ["Hello, ", name].concat());',
      "}",
      'greet("Ada");',
      'println!("{}", add(2, 3));',
    ].join("\n"),
  );
});

test("lists", async () => {
  expect(await write(rust, "lists")).toBe(
    [
      "let mut items = vec![1, 2, 3];",
      "items.push(4);",
      "items[0] = 10;",
      'println!("{}", items[1]);',
      "for item in items {",
      "    if item == 3 {",
      "        continue;",
      "    }",
      "    if item > 20 {",
      "        break;",
      "    }",
      '    println!("{}", item);',
      "}",
      'println!("{}", items.len());',
    ].join("\n"),
  );
});

test("classes", async () => {
  expect(await write(rust, "classes")).toBe(
    [
      "struct Cat {",
      "    sound: String,",
      "    lives: i32,",
      "}",
      "",
      "impl Cat {",
      "    fn speak(&self) {",
      '        println!("{}", self.sound);',
      "    }",
      "}",
      "let tom = Cat::new();",
      "tom.speak();",
    ].join("\n"),
  );
});

test("random", async () => {
  expect(await write(rust, "random")).toBe('println!("{}", rand::thread_rng().gen_range(1..=6) <= 6);');
});
