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

Blockly is bundled as a dependency — no separate install needed. The code editor,
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

const engine = new MorphicBlocks(
  definitions.blocks,
  behaviors,
  definitions.elementTypes,
);

engine.mount({
  workspaceContainer: document.getElementById("workspace")!,
  modes: definitions.modes,
  workspaceMode: "conceptual",
});

engine.mountToolbox(document.getElementById("toolbox")!, {
  categories: definitions.categories,
});

// switch representation at runtime — the same blocks re-render
engine.setModes({ workspaceMode: "python" });
```

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
