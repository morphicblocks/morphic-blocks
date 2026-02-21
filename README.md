# Morphic Blocks

Morphic Blocks is a TypeScript wrapper around Google Blockly where block rendering is mode-driven.

Developers configure:

1. `blocks.json`: logical block definitions + per-mode views.
2. `behavior.ts` or `behavior.js`: block behavior/generation logic (same behavior for all views).
3. Mode CSS files: one stylesheet per mode (`iconic.css`, `lexical.css`, etc.).

## Core idea

- Workspace and toolbox can run in different modes at the same time.
- Dragging a block from toolbox to workspace re-renders the block using the workspace mode.
- The framework itself has no built-in mode list. Modes come from your `views` keys.
- Consumer apps do not need to import Blockly directly.
- Views can stay as simple `"modeName": "template"` entries (no per-view class names required).
- Toolbox layout can be set by framework parameter: `toolboxLayout: "flyout" | "category"`.

## Install

```bash
bun install
```

## Run playground

```bash
bun run dev
```

## Build everything

```bash
bun run build
```

Library output is created in `packages/morphic-blocks/dist/`.

## Project structure

- `packages/morphic-blocks/src/morphic/MorphicBlocks.ts`: orchestration (mount, events, mode switching).
- `packages/morphic-blocks/src/morphic/block-view.ts`: block rendering and mode class decoration.
- `packages/morphic-blocks/src/morphic/codegen.ts`: Blockly JavaScript generator bridge + behavior proxies.
- `packages/morphic-blocks/src/morphic/behavior-runtime.ts`: behavior adapter helpers.
- `packages/morphic-blocks/src/morphic/definitions.ts`: block definition validation/lookup.
- `packages/morphic-blocks/src/morphic/view-resolver.ts`: fallback view selection per mode.
- `packages/morphic-blocks/src/morphic/toolbox.ts`: toolbox definition builder.
- `packages/morphic-blocks/src/morphic/styles.ts`: CSS loading and mode coverage warnings.
- `apps/playground`: isolated example app that consumes the package.

## Template support

- `%1`, `%2`, ... placeholders create dynamic inputs.
- `<img ...>` tags create Blockly image fields.
- Other HTML tags are ignored by the parser and treated as plain text wrappers.

## Behavior file format

You can provide `behavior.ts` or `behavior.js`.

```js
/** @type {import("morphic-blocks").MorphicBehaviorMap} */
const behaviors = {
  log_message(proxy) {
    const msg = proxy.inputs.MESSAGE || "'Hello, Morphic!'";
    return `console.log('[' + new Date().toLocaleTimeString() + '] ' + ${msg});\n`;
  },
  random_color() {
    return `('#' + Math.floor(Math.random() * 0xFFFFFF).toString(16).padStart(6, '0'))`;
  }
};
```

## Definition format

`apps/playground/src/blocks.json` shows the expected shape:

```json
{
  "identifier": "move_actor",
  "views": {
    "iconic": "<img src='assets/arrow.svg' width='58' height='58'>",
    "lexical": "move %1 steps",
    "syntactic": "moveActor(%1);",
    "code": "moveActor(%1);",
    "blueprint": "<div class='blueprint-box'>LOGIC: %1</div>"
  }
}
```

## Example usage

```ts
import definitions from "./blocks.json";
import { behaviors } from "./behavior.js";
import { MorphicBlocks } from "morphic-blocks";

const engine = new MorphicBlocks(definitions, behaviors);
engine.mount({
  workspaceContainer: document.getElementById("workspace")!,
  workspaceMode: "lexical",
  toolboxMode: "iconic",
  toolboxLayout: "flyout",
  ui: {
    workspaceClassName: "my-workspace",
    toolboxClassName: "my-toolbox"
  },
  toolbox: {
    blocks: ["log_message", "random_color", "text"]
  },
  blockly: {
    trashcan: true,
    move: { drag: true, wheel: true, scrollbars: true }
  },
  modeStyles: [
    { mode: "iconic", href: "/modes/iconic.css" },
    { mode: "lexical", href: "/modes/lexical.css" }
  ]
});
```

Switch modes at runtime:

```ts
engine.setModes({ workspaceMode: "syntactic", toolboxMode: "iconic" });
```

Generate JavaScript from workspace:

```ts
const js = engine.generateJavaScript();
```

`generateJavaScript()` uses Blockly's official JavaScript generator (`javascriptGenerator`) and also wires your custom behavior functions into Blockly generator hooks for custom block types.

`ui.workspaceClassName` and `ui.toolboxClassName` let you style workspace/toolbox roots in CSS.  
Mode CSS overrides apply naturally by combining these with mode/context classes, for example:

```css
.morphic-workspace-root.morphic-mode-iconic.my-workspace { ... }
.morphic-toolbox-root.morphic-mode-iconic.my-toolbox .blocklyFlyoutBackground { ... }
.morphic-toolbox-shell.morphic-mode-iconic.my-toolbox { ... }
```

Example "code editor" mode can be achieved only by CSS + templates:

```css
.morphic-workspace-root.morphic-mode-code.my-workspace .blocklySvg { ... }
.morphic-mode-code .blocklyText { font-family: Consolas, monospace; }
.morphic-mode-code .blocklyInputShapePath { fill: #000; }
```
