import { afterEach, expect, test, vi } from "vitest";
import { MorphicBlocks } from "../src";
import type { MorphicBlocksFormat } from "../src/morphic/types";

/**
 * Missing media only shows as missing icons and silent sounds, so the
 * developer is told in the console. jsdom loads no images; the test fails the
 * load itself.
 */

const format: MorphicBlocksFormat = {
  elementTypes: { code: "code" },
  modes: [{ name: "only", elements: ["code"] }],
  blocks: [{ identifier: "say", elements: { code: "say()" }, shape: "statement" }],
};

const probes: { src: string; onerror: (() => void) | null }[] = [];
const engines: MorphicBlocks[] = [];

afterEach(() => {
  for (const engine of engines.splice(0)) engine.dispose();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  probes.length = 0;
  document.body.innerHTML = "";
});

test("a missing media folder is reported once", async () => {
  vi.stubGlobal(
    "Image",
    class {
      src = "";
      onerror: (() => void) | null = null;
      constructor() {
        probes.push(this);
      }
    },
  );
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

  for (let i = 0; i < 2; i++) {
    const engine = new MorphicBlocks(format, {});
    engines.push(engine);
    await engine.mount({
      workspaceContainer: document.body.appendChild(document.createElement("div")),
      blockly: { media: "missing-media/" },
    });
  }

  expect(probes.map((probe) => probe.src)).toEqual(["missing-media/sprites.png"]);
  probes[0]!.onerror?.();
  expect(warn).toHaveBeenCalledWith(expect.stringContaining('media is missing at "missing-media/"'));
});
