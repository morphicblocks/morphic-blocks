# Morphic Blocks

A TypeScript framework built on Google Blockly for rendering blocks in multiple **modes** — enabling smooth transitions between block-based and text-based programming representations.

## Core Idea

Each block has named **elements** (visual parts). A global `elementTypes` registry declares what each element name represents. **Modes** declare which elements are visible on the toolbox tile and which element feeds each view (workspace block, codespace text, preview text). CSS defines how they look.

```text
iconic mode    → icon + title  (compact visual)
lexical mode   → natural language block template
syntactic mode → code-syntax block template
code modes     → codespace (text editor) replaces the workspace
```

Workspace and toolbox can run in **different modes simultaneously**. Dragging from toolbox to workspace — or dropping onto the codespace — adds a block to the underlying model.

## Use Cases

The primary motivating use case is **gradual block-to-text programming transition** — progressively fading visual scaffolding as learners build fluency. Because the mode system decouples content from presentation, the same architecture supports several other applications without framework changes (only new modes, elements, and CSS):

- **Localization / internationalization** — same blocks with different natural-language labels per mode (English, German, Spanish, …).
- **Accessibility** — alternate modes for high-contrast, large-text, dyslexia-friendly, or screen-reader-optimized rendering.
- **Age-appropriate rendering** — icon-centric for young learners; verbose-text for older learners.
- **Comparative programming education** — render the same program in Python, Java, and C++ syntax side-by-side.
- **Expert vs novice views** — compact (icon) for experts, verbose (full-text / descriptions) for novices.
- **Domain-specific visual languages** — custom modes for music, robotics, data science, game design.
- **Documentation-enriched blocks** — render descriptions, examples, or rationale alongside blocks.

These are potential applications, not currently deployed. They illustrate that the framework's value extends beyond the transition use case.

## Element Types

| Type    | What it means                                                             |
|---------|---------------------------------------------------------------------------|
| `text`  | Plain label / description (HTML text on tiles, never on workspace blocks) |
| `code`  | Blockly template with `%N` / `%FIELDNAME` placeholders                    |
| `image` | SVG or image (used inside block templates as FieldImage, or as icon)      |

Element **names** are free-form — `icon`, `title`, `concept`, `python`, `javascript` etc. are conventions. The `elementTypes` registry maps names to types.

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
│   └── playground/            # Demo app: 5 transition levels
│       └── src/
│           ├── definitions.json  # elements, modes, blocks
│           ├── config.json       # playground-only level wiring
│           ├── behaviors.ts      # executable code generators
│           ├── main.ts
│           └── modes/            # One CSS file per mode
├── packages/
│   └── morphic-blocks/        # Core library
│       └── src/morphic/
│           ├── MorphicBlocks.ts    # Orchestration (mount, setModes, codespace, preview)
│           ├── block-view.ts       # Block rendering + mode class decoration
│           ├── view-resolver.ts    # Mode fallback logic
│           ├── template.ts         # Template parsing (%1, %FIELDNAME, <img>)
│           ├── template-codegen.ts # Text rendering from templates (codespace/preview)
│           ├── code-editor.ts      # CodeMirror wrapper with delete gutter
│           ├── codegen.ts          # JavaScript code generation (behaviors)
│           ├── toolbox-canvas.ts   # Custom HTML toolbox (drag source)
│           ├── selection-sync.ts   # Block ↔ code line highlighting
│           ├── styles.ts           # CSS loading + mode coverage validation
│           └── types.ts            # All TypeScript types
└── CLAUDE.md
```

## definitions.json Format

```json
{
  "elementTypes": {
    "icon":       "image",
    "title":      "text",
    "description":"text",
    "concept":    "code",
    "python":     { "type": "code", "empty": { "Number": "0", "String": "\"text\"", "Boolean": "True",  "default": "None" } },
    "javascript": { "type": "code", "empty": { "Number": "0", "String": "\"text\"", "Boolean": "true",  "default": "null" } }
  },
  "modes": [
    { "name": "iconic",    "elements": ["icon", "title", "description"] },
    { "name": "concept",   "elements": ["title", "concept"] },
    { "name": "python",    "elements": ["title", "python"],     "preview": "python" },
    { "name": "javascript","elements": ["title", "javascript"], "preview": "javascript" },
    { "name": "code-python", "elements": ["title", "icon"],
      "presentation": "codespace", "primarySource": "python", "preview": "javascript" }
  ],
  "categories": [
    { "name": "Output", "colour": "#5C81A6" }
  ],
  "blocks": [
    {
      "identifier": "text_print",
      "category": "Output",
      "elements": {
        "title":      "Print",
        "description":"Prints a value to the console",
        "concept":    "Output %1",
        "python":     "print(%1)",
        "javascript": "console.log(%1);"
      },
      "inputSlots": {
        "1": { "kind": "value", "name": "TEXT" }
      }
    }
  ]
}
```

- `elementTypes` — global registry mapping element names either to a bare type string (`"text" | "code" | "image"`) or to a config object `{ type, empty }`. The `empty` map provides per-language defaults for empty value slots, keyed by the slot's `check` (`"Number"`, `"String"`, `"Boolean"`, plus `"default"` for unchecked slots). With defaults set, a `print` with no value attached renders as `print("text")` instead of `print()` — keeping generated code syntactically valid.
- `modes` — list of mode definitions with optional `presentation`, `primarySource`, `preview`, `tileRender`
- `categories` — optional groupings for the toolbox
- `blocks` — flat array of block definitions

## Mode Fields

| Field           | Required       | Purpose                                                                      |
|-----------------|----------------|------------------------------------------------------------------------------|
| `name`          | yes            | Mode identifier                                                              |
| `elements`      | yes            | Element names rendered on the toolbox tile                                   |
| `presentation`  | no             | `"workspace"` (default) or `"codespace"`                                     |
| `primarySource` | when codespace | Element name used as the primary view source (must be type `code`)           |
| `preview`       | no             | Element name used by the preview editor (must be type `code`)                |
| `tileRender`    | no             | Per-element map `{ name: "block" \| "text" }` for tile rendering override    |

Validation at mount: `presentation: "codespace"` requires `primarySource`.

## Template Syntax

Templates use `%N` for input slots, `%FIELDNAME` for fields, and `<img>` tags for images:

| Syntax        | Result                                                                   |
|---------------|--------------------------------------------------------------------------|
| `%1`, `%2`    | Input slot (Blockly input + text substitution for codespace/preview)     |
| `%FIELDNAME`  | Field value (e.g. `%NUM`, `%VAR`). Uppercase alpha token                 |
| `<img …>`     | Image (Blockly FieldImage on block templates)                            |
| Plain text    | Becomes a Blockly label field                                            |

**Whitespace and indentation in text rendering:** preserved as authored. `"if ( %1 ) {\n  %2\n}"` produces multi-line output; `"if ( %1 ) { %2 }"` stays on one line.

## Example Usage

```ts
import definitions from "./definitions.json";
import { behaviors } from "./behaviors";
import {
  MorphicBlocks,
  type MorphicBlockDefinition,
  type MorphicElementType,
  type MorphicModeDefinition,
} from "morphic-blocks";

const engine = new MorphicBlocks(
  definitions.blocks as MorphicBlockDefinition[],
  behaviors,
  definitions.elementTypes as Record<string, MorphicElementType>,
);

const workspace = engine.mount({
  workspaceContainer: document.getElementById("workspace")!,
  codespaceContainer: document.getElementById("codespace")!,  // optional
  workspaceMode: "lexical",
  toolboxMode: "lexical",
  modesFolder: import.meta.glob("./modes/*.css", { eager: true, query: "?url" }),
  canvasToolbox: true,
  modes: definitions.modes as MorphicModeDefinition[],
  toolbox: { categories: definitions.categories },
  blockly: { scrollbars: true, trashcan: true },
});

// Mount custom HTML toolbox
engine.mountToolbox(document.getElementById("toolbox")!, {
  categories: definitions.categories,
});

// Mount codespace (editable text, receives drops, deletion via keyboard / gutter)
await engine.mountCodespace();

// Mount preview (read-only, renders mode.preview element as text)
await engine.mountPreview(document.getElementById("preview")!);
```

Switch modes at runtime:

```ts
engine.setModes({ workspaceMode: "code-python", toolboxMode: "python" });
```

Generate JavaScript from the workspace (via behaviors):

```ts
const js = engine.generateJavaScript();
```

## Behaviors

One behavior function per block. Produces the executable code string.

```ts
import type { MorphicBehaviorMap } from "morphic-blocks";

export const behaviors: MorphicBehaviorMap = {
  text_print(proxy) {
    return `console.log(${proxy.inputs.TEXT ?? "undefined"});\n`;
  },
};
```

The framework also supports **template-based rendering** for the codespace and preview — those use the `type: "code"` element content directly (with `%N` / `%FIELDNAME` substitution), separate from behaviors.

## Mode CSS

One CSS file per mode. Use `.morphic-mode-{name}` to target blocks in a specific mode. Use `.morphic-workspace-root.morphic-mode-{name}` to target the Blockly workspace.

```css
/* python.css */
.morphic-workspace-root.morphic-mode-python .blocklyText {
  font-family: "Fira Code", monospace;
}
```

Block colours can be driven from CSS via a custom property:

```css
.morphic-block-text_print {
  --morphic-block-color: #b469d6;
}
```

## Roadmap

### Done

- ✅ Codespace — editable-by-structure text view of the block model
- ✅ Preview editor — per-mode alternate language preview
- ✅ Drag from toolbox or grip handle (`⠿`) into the codespace, with drop-position indicator
- ✅ Slot-based drops — drop into empty `for`/`if` bodies, or before/after existing siblings
- ✅ Reorder via grip — including same-chain reorder (drop on own line moves it)
- ✅ Keyboard + gutter `✕` deletion
- ✅ Per-element empty-slot defaults (`Number`/`String`/`Boolean`/`default` per language) — generated text stays syntactically valid
- ✅ Indent compounding — nested templates stack indents automatically
- ✅ Multi-editor selection sync — block ↔ code editor ↔ codespace ↔ preview, with click-clears-on-empty-area
- ✅ Block→line metadata in template codegen, plus statement-input body ranges

### Upcoming

- Drag value blocks (numbers, strings, variables) into value slots
- Field edits in codespace (replace placeholders, insert variables)
- Use empty defaults in the Blockly block view as well
- Per-language syntax highlighting in codespace/preview
- Bidirectional sync — AST parsing converts text back to blocks (future)
- Schema simplification — split tiles/modes, move mode composition into definitions (future refactor)
