import { afterEach, describe, expect, test } from "vitest";
import { MorphicBlocks } from "../src";
import type { MorphicBlocksFormat, MorphicMountConfig } from "../src/morphic/types";

/**
 * Mode stylesheets arrive in whatever form the app's bundler produces: a link
 * or the CSS itself. The framework tells them apart and loads each correctly.
 */

const format: MorphicBlocksFormat = {
  elementTypes: { code: "code" },
  modes: [
    { name: "py", elements: ["code"] },
    { name: "js", elements: ["code"] },
  ],
  blocks: [{ identifier: "say", elements: { code: "say()" }, shape: "statement" }],
};

const engines: MorphicBlocks[] = [];

function mountWith(styles: Partial<MorphicMountConfig>): void {
  const engine = new MorphicBlocks(format, {});
  engines.push(engine);
  void engine.mount({ workspaceContainer: document.body.appendChild(document.createElement("div")), ...styles });
}

const linkFor = (mode: string) => document.head.querySelector(`link[data-morphic-source="mode:${mode}"]`);
const styleFor = (mode: string) => document.head.querySelector(`style[data-morphic-source="mode:${mode}"]`);

afterEach(() => {
  for (const engine of engines.splice(0)) engine.dispose();
  document.body.innerHTML = "";
  document.head.innerHTML = "";
});

describe("modeStyles", () => {
  test("takes CSS text or a link per mode", () => {
    mountWith({ modeStyles: { py: ".py { color: teal; }", js: "/modes/js.css" } });

    expect(styleFor("py")?.textContent).toBe(".py { color: teal; }");
    expect(linkFor("js")?.getAttribute("href")).toBe("/modes/js.css");
  });

  test("a folder stylesheet wins over a hand-given one for the same mode", () => {
    mountWith({
      modesFolder: { "./modes/py.css": "/assets/py.css" },
      modeStyles: { py: ".py { color: teal; }" },
    });

    expect(linkFor("py")?.getAttribute("href")).toBe("/assets/py.css");
    expect(styleFor("py")).toBeNull();
  });
});

describe("modesFolder", () => {
  test("loads links from a folder import", () => {
    mountWith({ modesFolder: { "./modes/py.css": { default: "/assets/py.css" }, "./modes/js.css": "/assets/js.css" } });

    expect(linkFor("py")?.getAttribute("href")).toBe("/assets/py.css");
    expect(linkFor("js")?.getAttribute("href")).toBe("/assets/js.css");
  });

  test("loads CSS text from a folder import", () => {
    mountWith({ modesFolder: { "./modes/py.css": { default: ".py { color: teal; }" } } });

    expect(styleFor("py")?.textContent).toBe(".py { color: teal; }");
    expect(linkFor("py")).toBeNull();
  });
});
