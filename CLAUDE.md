# Morphic Blocks — CLAUDE.md

## What This Project Is

Morphic Blocks is a TypeScript framework built on top of Google Blockly. Its purpose is to render Blockly blocks in multiple **modes** (e.g., iconic, lexical, syntactic), facilitating the transition between block-based and text-based programming — or between any given visual representation modes.

It is designed as a **reusable library** that developers embed in their own apps. It should not lock users into specific UI components.

## Repository Structure

```text
morphic-blocks/
├── apps/
│   └── playground/          # Demo app showing the framework in use
├── packages/
│   └── morphic-blocks/      # Core framework (the library)
└── CLAUDE.md
```

## Framework Architecture (`packages/morphic-blocks`)

### Key files

- `src/morphic/MorphicBlocks.ts` — Main orchestration class (`mount`, `setModes`, `generateJavaScript`)
- `src/morphic/block-view.ts` — Block rendering, mode class application, connection management
- `src/morphic/template.ts` — Template parsing (`%1` placeholders, `<img>` tags)
- `src/morphic/codegen.ts` — One-way code generation via behavior functions
- `src/morphic/view-resolver.ts` — Mode fallback logic
- `src/morphic/styles.ts` — CSS/style management, mode coverage validation
- `src/morphic/types.ts` — All TypeScript types

### How it works

1. User provides **definitions** (JSON): each block has an `elements` map (element name → content)
2. User provides **behaviors** (JS/TS): functions that generate code for each block type
3. User provides **CSS files**: one per mode, using `.morphic-mode-{name}` classes
4. `MorphicBlocks.mount()` initializes Blockly + morphic features
5. `engine.setModes()` switches rendering mode at runtime — blocks re-render

### Template syntax

- `%1`, `%2` — input slots (auto-create Blockly inputs)
- `<img src="...">` — image/SVG fields
- Plain text — label fields

## Playground (`apps/playground`)

Demo app. Uses `import.meta.glob()` to auto-discover mode CSS files by filename. Seeds a demo workspace on load. Shows live code generation and execution.

## Core Concept: Morphic Block

A **Morphic Block** is the fundamental unit. It has named **elements** — the visual parts it can show:

| Element  | What it is                            |
|----------|---------------------------------------|
| `icon`   | SVG or image                          |
| `block`  | Blockly-style template (`log %1`)     |
| `code`   | Code snippet (`console.log(%1)`)      |
| `text`   | Label or description                  |

Element names are **free-form** — `icon`, `block`, `code`, `text` are conventions, not enforced.

A **mode** declares which elements are visible. CSS defines how they look.

## definitions.json Structure

```json
{
  "modes": [
    { "name": "iconic",    "elements": ["icon", "text"] },
    { "name": "lexical",   "elements": ["block"] },
    { "name": "syntactic", "elements": ["block", "code"] }
  ],
  "categories": [
    { "name": "Output", "colour": "#5C81A6" }
  ],
  "blocks": [
    {
      "identifier": "log_message",
      "category": "Output",
      "elements": {
        "icon": "<img src='assets/log.svg'>",
        "block": "log %1",
        "code": "console.log(%1);",
        "text": "Print a message"
      },
      "inputSlots": { "1": { "kind": "value", "name": "MESSAGE" } }
    }
  ]
}
```

- `modes` — explicit mode definitions (which elements are shown per mode)
- `categories` — optional metadata (name, colour); blocks reference them by name
- `blocks` — flat array; `category` field is optional on each block
- `elements` replaces the old `views` map

## Rendered HTML (Morphic Block tile)

All elements are always rendered; CSS controls visibility:

```html
<div class="morphic-block morphic-mode-iconic morphic-block-log_message"
     style="--morphic-block-color: #5C81A6">
  <div class="morphic-element-icon"><img src="assets/log.svg"></div>
  <div class="morphic-element-block">log <span class="morphic-slot"></span></div>
  <div class="morphic-element-code">console.log(...);</div>
  <div class="morphic-element-text">Print a message</div>
</div>
```

## Custom Toolbox (`mountToolbox`)

`engine.mountToolbox(container, options?)` replaces Blockly's built-in flyout:

- Renders Morphic Block tiles as HTML (no off-screen Blockly workspaces)
- Drag-and-drop: dragging a tile into the workspace creates the actual Blockly block
- Optional category grouping via `<div data-category="...">` wrappers
- Re-renders on `setModes({ toolboxMode })`
- Options: `{ blocks?: string[], categories?: MorphicToolboxCategory[] }`

```ts
engine.mountToolbox(container, {
  categories: [{ name: 'Output', colour: '#5C81A6' }]
})
```

## Planned Features (Roadmap)

- **Bidirectional sync** — AST parsing converts JS text back to blocks
- **CodeMirror** text editor integration
- **Block ↔ code selection sync** — selecting a block highlights the corresponding code lines
- **Block metadata mapping** — maps block IDs to code positions
- **Drag blocks into text editor**
- **Error recovery / draft blocks** — handles incomplete/invalid code gracefully
- **Headless UI components** (terminal, sidebar, info panel, resizable panes) — unstyled

## Conventions

- **TypeScript only** — avoid plain JavaScript in the framework package
- **Ask before implementing** — always discuss and get approval before writing or changing code
- **Don't restrict users** — UI components should be unstyled/headless so developers can style them freely
- **Library scope** — the framework is an embeddable library, not a standalone app
- **No unnecessary abstraction** — minimum complexity for the current task
