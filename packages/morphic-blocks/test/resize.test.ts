import { afterEach, describe, expect, test } from "vitest";
import { makeResizable } from "../src";

/** A divider resizes its pane with the keyboard too. */

afterEach(() => {
  document.body.innerHTML = "";
});

function setUp(options: { axis?: "x" | "y"; invert?: boolean; max?: number } = {}) {
  const target = document.body.appendChild(document.createElement("div"));
  const gutter = document.body.appendChild(document.createElement("div"));
  // jsdom lays nothing out: the pane reports the size it was given.
  let size = 200;
  target.getBoundingClientRect = () => ({ width: size, height: size }) as DOMRect;
  const sizes: number[] = [];
  makeResizable(gutter, {
    target,
    axis: options.axis ?? "x",
    invert: options.invert,
    min: 100,
    max: options.max,
    onResize: (next) => {
      size = next;
      sizes.push(next);
    },
  });
  const press = (key: string, shiftKey = false) =>
    gutter.dispatchEvent(new KeyboardEvent("keydown", { key, shiftKey, bubbles: true, cancelable: true }));
  return { target, gutter, sizes, press };
}

describe("resizing with the keyboard", () => {
  test("the arrow keys along the axis move the divider, Shift further", () => {
    const { target, sizes, press } = setUp();

    press("ArrowRight");
    press("ArrowLeft", true);
    press("ArrowUp");

    expect(sizes).toEqual([210, 160]);
    expect(target.style.flexBasis).toBe("160px");
  });

  test("follow the axis and the side the divider sits on", () => {
    const vertical = setUp({ axis: "y", invert: true });
    vertical.press("ArrowDown");

    expect(vertical.sizes).toEqual([190]);
  });

  test("Home and End go to the limits", () => {
    const { sizes, press } = setUp({ max: 400 });

    press("End");
    press("Home");

    expect(sizes).toEqual([400, 100]);
  });

  test("the divider can be reached with Tab", () => {
    const { gutter } = setUp();

    expect(gutter.tabIndex).toBe(0);
  });
});
