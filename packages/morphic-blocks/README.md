<div align="center">

<picture> 
  <img src="https://raw.githubusercontent.com/morphicblocks/morphic-meta/main/brand/logos/logo.png" alt="Morphic Blocks" width="120" height="120" />
</picture>

# Morphic Blocks

**One definition, multiple representations.**

[![npm](https://img.shields.io/npm/v/morphic-blocks)](https://www.npmjs.com/package/morphic-blocks)
[![License](https://img.shields.io/npm/l/morphic-blocks)](./LICENSE)
[![Types](https://img.shields.io/npm/types/morphic-blocks)](https://www.typescriptlang.org/)

</div>

Morphic Blocks is an embeddable TypeScript library built on top of
[Google Blockly](https://developers.google.com/blockly). It renders one block
model in multiple developer-defined **modes** — iconic, lexical, syntactic, or
any representation you design — to support the gradual transition between
block-based and text-based programming.

## Install

```sh
npm i morphic-blocks
```

Blockly is a dependency, so it is installed for you. The code editor,
codespace, and preview views additionally use CodeMirror — install those only if
you need them:

```sh
npm i @codemirror/state @codemirror/view @codemirror/lang-javascript
```

## Quick start

```ts
import { MorphicBlocks } from "morphic-blocks";
import definitions from "./definitions.json";
import { behaviors } from "./behaviors";

// Modes, presets and categories all come from the definitions file, passed as
// imported; mount() validates it.
const engine = new MorphicBlocks(definitions, behaviors);

// One call sets up every view it gets a container for.
engine.mount({
  workspaceContainer: document.getElementById("workspace")!,
  toolboxContainer: document.getElementById("toolbox")!,
  preset: "conceptual", // a preset from definitions.json; without presets the first mode is used
});

// switch representation at runtime; the same blocks re-render
engine.applyPreset("python");
```

## Serve Blockly's media yourself

By default Blockly loads its images and sounds from Google's server
(`blockly-demo.appspot.com`), so every visitor's browser contacts it. To keep
all requests on your own site, copy Blockly's `media` folder into your static
files before `dev` and `build`:

```js
// scripts/copy-blockly-media.mjs
import { cpSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

// Blockly comes with morphic-blocks, so look it up from there.
const require = createRequire(import.meta.url);
const blockly = dirname(require.resolve("blockly", { paths: [dirname(require.resolve("morphic-blocks"))] }));
cpSync(join(blockly, "media"), "public/blockly-media", { recursive: true });
```

Then point Blockly at the copy:

```ts
engine.mount({
  workspaceContainer: document.getElementById("workspace")!,
  blockly: { media: "blockly-media/" },
});
```

This works with every package manager. `public/` is Vite's folder for static
files; use your bundler's equivalent.

## Features

- **One definition, many representations** — define a block once; render it as
  icons, blocks, or source text, switchable at runtime.
- **Config-driven** — blocks in JSON, behaviors in TypeScript, one CSS file per
  mode. No per-representation duplication.
- **Headless & embeddable** — bring your own UI; the framework stays unstyled.
- **Built on Blockly** — the proven engine stays authoritative underneath.

## Documentation

- **Website** — <https://morphicblocks.com>
- **Docs** — <https://docs.morphicblocks.com>
- **Playground** — <https://playground.morphicblocks.com>
- **Source** — <https://github.com/morphicblocks/morphic-blocks>

## License

[Apache-2.0](./LICENSE) © Gottfried Wilhelm Leibniz Universität Hannover. See
[NOTICE](./NOTICE). The Morphic Blocks name and logo are trademarks.
