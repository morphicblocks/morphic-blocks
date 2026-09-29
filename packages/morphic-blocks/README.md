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
model in multiple developer-defined **modes** (icons, words, code or any
representation you design) to support the gradual transition between
block-based and text-based programming.

## Install

```sh
npm i morphic-blocks
```

Blockly comes with it. Its images and sounds (trash can, zoom buttons, clicks)
load from your own site, so visitors' browsers never contact another server.
Copy them to `blockly-media/` next to your page before `dev` and `build`:

```json
"scripts": {
  "dev": "morphic-blocks copy-media public/blockly-media && vite",
  "build": "morphic-blocks copy-media public/blockly-media && vite build"
}
```

`public/` is Vite's folder for static files; use your bundler's equivalent.
You can still load them from Blockly's server instead; see
[Privacy & External Requests](https://docs.morphicblocks.com/guides/privacy/).

The text views (codespace, preview, code editor) use CodeMirror. Install it
only if you use them:

```sh
npm i @codemirror/state @codemirror/view @codemirror/lang-javascript
```

## Quick start

A block is defined once, with one element per representation:

```jsonc
// definitions.json
{
  "elementTypes": {
    "title":      "text",
    "conceptual": "code",
    "python":     "code"
  },
  "modes": [
    { "name": "conceptual", "elements": ["title", "conceptual"] },
    { "name": "python",     "elements": ["title", "python"] }
  ],
  "blocks": [
    {
      "identifier": "text_print",
      "elements": {
        "title":      "Print",
        "conceptual": "Output %1",
        "python":     "print(%1)"
      },
      "inputSlots": {
        "1": { "kind": "value", "name": "TEXT" }
      }
    }
  ]
}
```

A behavior writes the JavaScript that runs, one function per block:

```ts
// behaviors.ts
import type { MorphicBehaviorMap } from "morphic-blocks";

export const behaviors: MorphicBehaviorMap = {
  text_print(proxy) {
    return `console.log(${proxy.inputs.TEXT ?? "undefined"});\n`;
  },
};
```

One call sets up every view it gets a container for:

```ts
// main.ts
import { MorphicBlocks } from "morphic-blocks";
import definitions from "./definitions.json";
import { behaviors } from "./behaviors";

const engine = new MorphicBlocks(definitions, behaviors);

engine.mount({
  workspaceContainer: document.getElementById("workspace")!,
  toolboxContainer: document.getElementById("toolbox")!,
});

// Switch the representation at runtime; the same blocks re-render.
engine.setModes({ workspaceMode: "python", toolboxMode: "python" });
```

## How it works

1. **Definitions** name each block's elements: labels, images and code
   templates.
2. **Modes** choose which elements show, one CSS file per mode styles them.
3. **Views** (workspace, toolbox, codespace, preview) each show a mode, and
   presets switch them together.

## Features

- **One definition, many representations:** define a block once and show it
  as icons, blocks or source text, switchable at runtime.
- **Blocks and text side by side:** an editable text view of the program, a
  read only preview and selection that follows across views.
- **Config driven:** blocks in JSON, behaviors in TypeScript, one CSS file per
  mode, with no duplication per representation.
- **Headless and embeddable:** bring your own UI; the framework stays unstyled.
- **Accessible toolbox:** tiles work with a mouse, a finger, a pen or the
  keyboard, with names for screen readers.
- **No external requests:** the framework never contacts another server,
  Blockly's media included.

## Documentation

- **Website:** <https://morphicblocks.com>
- **Docs:** <https://docs.morphicblocks.com>
- **Playground:** <https://playground.morphicblocks.com>
- **Source:** <https://github.com/morphicblocks/morphic-blocks>

## License

[Apache-2.0](./LICENSE) © Gottfried Wilhelm Leibniz Universität Hannover. See
[NOTICE](./NOTICE). The Morphic Blocks name and logo are trademarks.
