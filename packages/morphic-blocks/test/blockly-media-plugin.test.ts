// @vitest-environment node
/// <reference types="node" />
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { copyBlocklyMedia } from "../cli/copy-media";
import { blocklyMedia } from "../cli/plugin";

/** The bundler plugin copies Blockly's media when dev or build starts, like the command. */

const folders: string[] = [];
const newFolder = () => {
  const folder = join(mkdtempSync(join(tmpdir(), "mb-media-")), "blockly-media");
  folders.push(folder);
  return folder;
};

afterEach(() => {
  for (const folder of folders.splice(0)) rmSync(join(folder, ".."), { recursive: true, force: true });
});

describe("Blockly's media", () => {
  test("is copied once per Blockly version", () => {
    const folder = newFolder();

    const first = copyBlocklyMedia(folder);
    const again = copyBlocklyMedia(folder);

    expect(first.copied).toBe(true);
    expect(again.copied).toBe(false);
    expect(existsSync(join(folder, "sprites.svg"))).toBe(true);
    expect(readFileSync(join(folder, ".blockly-version"), "utf8").trim()).toBe(first.version);
  });

  test("is copied again after Blockly changed", () => {
    const folder = newFolder();
    copyBlocklyMedia(folder);
    writeFileSync(join(folder, ".blockly-version"), "0.0.0\n");

    expect(copyBlocklyMedia(folder).copied).toBe(true);
  });

  test("is copied by the bundler plugin when the build starts", async () => {
    const folder = newFolder();
    const plugin = blocklyMedia.raw({ folder }, { framework: "vite", versions: {} });
    const hooks = Array.isArray(plugin) ? plugin[0]! : plugin;

    await (hooks.buildStart as () => unknown).call({});

    expect(existsSync(join(folder, ".blockly-version"))).toBe(true);
  });

  test("is copied by the Vite plugin before Vite lists the public files", async () => {
    const folder = newFolder();
    const plugin = blocklyMedia.raw({ folder }, { framework: "vite", versions: {} });
    const hooks = Array.isArray(plugin) ? plugin[0]! : plugin;

    await (hooks.vite?.config as () => unknown).call({});

    expect(existsSync(join(folder, ".blockly-version"))).toBe(true);
  });
});
