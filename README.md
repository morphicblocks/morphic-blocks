# Morphic Blocks

A TypeScript framework built on Google Blockly for rendering blocks in multiple **modes** — enabling smooth transitions between block-based and text-based programming representations.

## Core Idea

Each block has named **elements** (visual parts). A global `elementTypes` registry declares what each element name represents. **Modes** declare which elements are visible. CSS defines how they look.

```text
iconic mode    → shows icon + text (image + label)
lexical mode   → shows block template (Blockly-style)
syntactic mode → shows block + code snippet
```

Workspace and toolbox can run in **different modes simultaneously**. Dragging from toolbox to workspace re-renders the block using the workspace mode.

## Element Types

| Type    | What it means                               |
|---------|---------------------------------------------|
| `block` | Blockly template (`log %1`, `if %1 then %2`)|
| `text`  | Plain label or description                  |
| `image` | SVG or image (used inside block templates)  |

Element **names** are free-form — `icon`, `block`, `syntax`, `title` etc. are conventions. The `elementTypes` registry maps names to types.

## Install

```bash
bun install
```

## Run Playground

```bash
bun run dev
```

## Build

```bash
bun run build
```

Library output is emitted to `packages/morphic-blocks/dist/`.

## Project Structure

```text
morphic-blocks/
├── apps/
│   └── playground/           # Demo app
│       └── src/
│           ├── definitions.json
│           ├── behaviors.ts
│           ├── main.ts
│           └── modes/        # One CSS file per mode
├── packages/
│   └── morphic-blocks/       # Core library
│       └── src/morphic/
│           ├── MorphicBlocks.ts      # Orchestration (mount, setModes, generateJavaScript)
│           ├── block-view.ts         # Block rendering + mode class decoration
│           ├── view-resolver.ts      # Mode fallback logic
│           ├── template.ts           # Template parsing (%1 placeholders, <img> tags)
│           ├── toolbox-canvas.ts     # Custom HTML toolbox (drag-to-workspace)
│           ├── codegen.ts            # JavaScript code generation
│           ├── styles.ts             # CSS loading + mode coverage validation
│           └── types.ts              # All TypeScript types
└── CLAUDE.md
```

## definitions.json Format

```json
{
  "elementTypes": {
    "icon":   "image",
    "block":  "block",
    "syntax": "block",
    "title":  "text",
    "text":   "text"
  },
  "modes": [
    { "name": "iconic",    "elements": ["icon", "title", "text"] },
    { "name": "lexical",   "elements": ["title", "block"] },
    { "name": "syntactic", "elements": ["title", "syntax", "text"] }
  ],
  "categories": [
    { "name": "Output", "colour": "#5C81A6" }
  ],
  "blocks": [
    {
      "identifier": "log_message",
      "category": "Output",
      "elements": {
        "icon":   "<img src='assets/log.svg'>",
        "title":  "Log",
        "block":  "log %1",
        "syntax": "console.log(%1);",
        "text":   "Print a message to the console"
      },
      "inputSlots": {
        "1": { "kind": "value", "name": "MESSAGE" }
      }
    }
  ]
}
```

- `elementTypes` — global registry mapping element names to their type
- `modes` — list of mode definitions; each declares which elements are visible
- `categories` — optional groupings for the toolbox
- `blocks` — flat array of block definitions; `category` is optional per block

## Template Syntax

Templates use `%N` placeholders for input slots and `<img>` tags for images:

| Syntax       | Result                        |
|--------------|-------------------------------|
| `%1`         | Creates a Blockly input slot  |
| `<img …>`    | Creates a Blockly FieldImage  |
| Plain text   | Becomes a Blockly label field |

## Example Usage

```ts
import definitions from "./definitions.json";
import { behaviors } from "./behaviors";
import { MorphicBlocks, type MorphicBlockDefinition, type MorphicElementType, type MorphicModeDefinition } from "morphic-blocks";

const engine = new MorphicBlocks(
  definitions.blocks as MorphicBlockDefinition[],
  behaviors,
  definitions.elementTypes as Record<string, MorphicElementType>,
);

const workspace = engine.mount({
  workspaceContainer: document.getElementById("workspace")!,
  workspaceMode: "lexical",
  toolboxMode: "lexical",
  modesFolder: import.meta.glob("./modes/*.css", { eager: true, query: "?url" }),
  canvasToolbox: true,
  modes: definitions.modes as MorphicModeDefinition[],
  toolbox: { categories: definitions.categories },
  blockly: {
    scrollbars: true,
    trashcan: true,
  },
});

// Mount custom HTML toolbox (replaces Blockly's built-in flyout)
engine.mountToolbox(document.getElementById("toolbox")!, {
  categories: definitions.categories,
});
```

Switch modes at runtime:

```ts
engine.setModes({ workspaceMode: "syntactic", toolboxMode: "iconic" });
```

Generate JavaScript from the workspace:

```ts
const js = engine.generateJavaScript();
```

## Behaviors

One behavior function per block. The same function is used regardless of mode.

```ts
import type { MorphicBehaviorMap } from "morphic-blocks";

export const behaviors: MorphicBehaviorMap = {
  log_message(proxy) {
    const msg = proxy.inputs.MESSAGE ?? "'Hello'";
    return `console.log(${msg});\n`;
  },
};
```

## Mode CSS

One CSS file per mode. Use `.morphic-mode-{name}` to target blocks in a specific mode. Use `.morphic-workspace-root.morphic-mode-{name}` to target the Blockly workspace.

```css
/* lexical.css */
.morphic-workspace-root.morphic-mode-lexical .blocklyText {
  font-family: sans-serif;
}
```

Block colours can be driven from CSS via a custom property:

```css
.morphic-block-log_message {
  --morphic-block-color: #f97316;
}
```

## Roadmap

- Bidirectional sync — AST parsing converts JS text back to blocks
- CodeMirror text editor integration
- Block ↔ code selection sync
- Drag blocks into text editor
- Headless UI components (unstyled terminal, sidebar, resizable panes)
