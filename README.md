# Morphic Blocks

A TypeScript framework built on Google Blockly for rendering blocks in multiple **modes** — enabling smooth transitions between block-based and text-based programming representations.

## Core Idea

Each block has named **elements** (visual parts). A global `elementTypes` registry declares what each element name represents. **Modes** declare which elements are visible; **presets** assign a mode to each view (toolbox, workspace, codespace, preview). CSS defines how modes look.

```text
iconic mode    → icon + title  (compact visual)
lexical mode   → natural language block template
syntactic mode → code-syntax block template
code modes     → codespace (text editor) mirrors the workspace
```

Workspace and toolbox can run in **different modes simultaneously**. Dragging from the toolbox to the workspace — or dropping onto the codespace — adds a block to the underlying model.

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
| `image` | SVG or image (used inside block templates as FieldImage, or as an icon)   |

Element **names** are free-form — `icon`, `title`, `concept`, `python`, `javascript` etc. are conventions. The `elementTypes` registry maps names to types.

An `image` value can be either a **bare file path** (`"icons/log.svg"` — auto-wrapped as `<img>`, sized via the element's `size` config, default 16×16) or explicit **`<img>` HTML** (`"<img src='icons/log.svg'>"`). Both work.

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
│   └── sandbox/               # Dev app: preset-driven view configurations
│       └── src/
│           ├── definitions.json  # elementTypes, modes, presets, blocks
│           ├── behaviors.ts      # executable code generators
│           ├── main.ts
│           └── modes/            # One CSS file per mode
├── packages/
│   └── morphic-blocks/        # Core library
│       ├── definitions.schema.json   # JSON Schema for definitions files
│       └── src/morphic/
│           ├── MorphicBlocks.ts       # Orchestration (mount, setModes, applyPreset, codegen)
│           ├── block-view.ts          # Block rendering + mode class decoration + fields
│           ├── block-namespace.ts     # Clean ↔ morphic: Blockly-type translation
│           ├── view-resolver.ts       # Mode / source-element resolution
│           ├── template.ts            # Template parsing (%N, %FIELDNAME, <img>)
│           ├── template-codegen.ts    # Text rendering from templates (codespace/preview)
│           ├── code-editor.ts         # CodeMirror wrapper (codespace/preview/code editor)
│           ├── codegen.ts             # JavaScript code generation (behaviors)
│           ├── element-types.ts       # elementTypes helpers (type, size, empty defaults)
│           ├── validate-definitions.ts# Mount-time definitions validation
│           ├── syntax-highlight.ts    # Definition-driven highlighting (CodeMirror)
│           ├── toolbox-canvas.ts      # Custom HTML toolbox (drag source)
│           ├── selection-sync.ts      # Block ↔ code line highlighting
│           ├── styles.ts              # CSS loading + mode coverage validation
│           └── types.ts               # All TypeScript types
└── CLAUDE.md
```

## definitions.json Format

One JSON document describes everything a block *is*. Point `$schema` at the
shipped schema for editor autocomplete and inline validation.

```json
{
  "$schema": "./node_modules/morphic-blocks/definitions.schema.json",
  "version": 1,
  "elementTypes": {
    "icon":       "image",
    "title":      "text",
    "description":"text",
    "concept":    "code",
    "python": {
      "type": "code",
      "stringQuote": "\"",
      "empty": {
        "Number": { "shadow": "math_number", "fieldValues": { "NUM": "42" } },
        "String": { "shadow": "text", "fieldValues": { "TEXT": "world" } }
      }
    }
  },
  "modes": [
    { "name": "iconic",    "elements": ["icon", "title", "description"] },
    { "name": "conceptual","elements": ["title", "concept"] },
    { "name": "syntax-py", "elements": ["title", "python"] }
  ],
  "presets": [
    { "name": "iconic", "label": "Iconic", "toolbox": "iconic", "workspace": "conceptual" },
    { "name": "hybrid", "label": "Hybrid", "toolbox": "conceptual",
      "workspace": "conceptual", "codespace": "syntax-py", "preview": "syntax-py" }
  ],
  "categories": [
    { "name": "Output", "color": "#5C81A6" }
  ],
  "highlighting": {
    "python": { "keywords": ["print", "if", "for"], "strings": ["\"", "'"], "comment": "#" }
  },
  "blocks": [
    {
      "identifier": "text_print",
      "category": "Output",
      "elements": {
        "title":      "Print",
        "description":"Prints a value to the console",
        "concept":    "Output %1",
        "python":     "print(%1)"
      },
      "inputSlots": {
        "1": { "kind": "value", "name": "TEXT", "check": "String" }
      }
    },
    {
      "identifier": "math_arithmetic",
      "category": "Operations",
      "elements": { "python": "%1 %OP %2" },
      "inputSlots": {
        "1": { "kind": "value", "name": "A", "check": "Number" },
        "2": { "kind": "value", "name": "B", "check": "Number" }
      },
      "fields": {
        "OP": { "type": "dropdown", "options": ["+", ["-", "−"], ["*", "×"], ["/", "÷"]], "default": "+" }
      },
      "output": true
    }
  ]
}
```

- `$schema` / `version` — optional. `$schema` (relative path or URL) gives editors autocomplete + validation; `version` marks the format revision. Both are ignored at runtime.
- `elementTypes` — global registry mapping element names to a bare type string (`"text" | "code" | "image"`) or a config object `{ type, empty?, stringQuote?, size? }`. `empty` gives per-language defaults for empty value slots, keyed by the slot's `check`; each entry is `{ shadow?, placeholder?, fieldValues? }` (a `shadow` is a ghosted, auto-restored block; a `placeholder` is a real, deletable one — placeholder wins when both are set). `stringQuote` wraps framework-supplied literals in `String` slots (`print("hello")` not `print(hello)`); `size` sets the display size for path-valued `image` elements.
- `modes` — mode definitions (`{ name, elements }`); `elements` render on the toolbox tile in list order.
- `presets` — named per-view mode configurations (toolbox / workspace / codespace / preview).
- `categories` — optional toolbox groupings (`{ name, color }`).
- `highlighting` — optional per-element syntax-highlighting rules for the codespace/preview.
- `blocks` — flat array of block definitions.

### Block fields

A block declares inline widgets in a `fields` map, keyed by the `%FIELDNAME` token in its templates:

| Type       | Config                                          |
|------------|-------------------------------------------------|
| `dropdown` | `options` (below), `default` (selected value)   |
| `text`     | `default`                                       |
| `number`   | `default`, `min`, `max`, `precision`            |
| `checkbox` | `default` (boolean)                             |

A dropdown **option** is `"=="` (value = label), `["/", "÷"]` (`[value, label]`), or `{ "value": "/", "label": "÷" }`. The **value** is generated and shown in text views; the optional **label** is a block-only display override (so a block can show `÷` while the code says `/`). Fields outside these four (variable, colour, custom) are attached by a behavior's `onViewApplied` — an undeclared `%FIELDNAME` token is left for the behavior to fill.

When a value slot is empty, the workspace shows an empty socket and the codespace shows a bracketed **type marker** (`[NUMBER]`, `[TEXT]`, `[BOOL]`) unless an `empty` default supplies a value.

## Block Identifiers

Block `identifier`s are free-form. You can name a block anything — **including names that match Blockly's built-in block types** such as `logic_boolean` or `math_number`. The framework registers each block internally as `morphic:<identifier>`, so your identifiers never clobber Blockly's stock blocks (which the framework still relies on for shadows, placeholders, and connection checks).

You always work with the **clean** identifier — it keys the `behaviors` map, the per-block `default.shadow` / `default.placeholder` references, and toolbox block lists. A reference in those places resolves to *your* block when it matches one of your definitions, and to a Blockly stock type otherwise. So `"shadow": "math_number"` keeps using Blockly's number block, while `"shadow": "my_number"` uses yours if you define a block with that identifier.

## Mode Fields

| Field      | Required | Purpose                                              |
|------------|----------|------------------------------------------------------|
| `name`     | yes      | Mode identifier (keep distinct from element / preset names) |
| `elements` | yes      | Element names rendered on the toolbox tile, in list order |

A mode is purely presentational. Its **source element** — what a codespace or preview renders when the mode is assigned to it — is the first `type: "code"` element in its `elements` array. How a code element renders on a toolbox tile (block vs text) is set by the preset's `toolbox` entry, so one mode is reusable across presets.

## Presets

A **preset** assigns a mode to each view and drives which views are visible:

| Field       | Required | Purpose                                                  |
|-------------|----------|----------------------------------------------------------|
| `name`      | yes      | Preset identifier                                        |
| `label`     | no       | Display label (falls back to `name`)                     |
| `toolbox`   | yes      | Toolbox mode (see below)                                 |
| `workspace` | no*      | Mode for the block workspace                             |
| `codespace` | no*      | Mode whose source element the codespace renders          |
| `preview`   | no       | Mode whose source element the read-only preview renders  |

`toolbox` is either a **mode name** (all code elements render as blocks) or an object `{ mode, render }` where `render` is a per-element map `{ name: "block" | "text" }` controlling how each `code` element renders on the tile (e.g. `{ "mode": "python", "render": { "python": "text" } }` shows the code as source text). Elements not named in `render` default to `block`, and `render` affects the toolbox tile only.

\* at least one of `workspace` / `codespace` must be set. Presence of a view key means the view is shown; workspace and codespace can be visible at the same time with different modes.

## Example Usage

```ts
import definitionsData from "./definitions.json";
import { behaviors } from "./behaviors";
import { MorphicBlocks, type MorphicBlocksFormat } from "morphic-blocks";

// The whole definitions file is one argument. (A JSON import widens "code" to
// string, so one assertion to MorphicBlocksFormat is expected here.)
const definitions = definitionsData as unknown as MorphicBlocksFormat;

const engine = new MorphicBlocks(definitions, behaviors);

const workspace = engine.mount({
  workspaceContainer: document.getElementById("workspace")!,
  codespaceContainer: document.getElementById("codespace")!, // optional
  preset: "iconic",                     // initial preset (by name)
  onPresetApplied(preset) {
    // show/hide panes based on which view keys the preset uses
  },
  modesFolder: import.meta.glob("./modes/*.css", { eager: true, query: "?url" }),
  canvasToolbox: true,                  // use the custom HTML toolbox
  blockly: { scrollbars: true, trashcan: true },
});

// Custom HTML toolbox (categories come from the definitions).
engine.mountToolbox(document.getElementById("toolbox")!);

// Editable text mirror of the workspace; receives drops, keyboard/gutter delete.
await engine.mountCodespace();

// Read-only preview of the preview mode's source element.
await engine.mountPreview(document.getElementById("preview")!);
```

Modes, presets, categories, and highlighting all come from the definitions
passed to the constructor — `mount()` only takes runtime wiring.

Switch presets or modes at runtime:

```ts
engine.applyPreset("hybrid");
engine.setModes({ workspaceMode: "conceptual", codespaceMode: "syntax-py" });
```

Generate JavaScript from the workspace (via behaviors):

```ts
const js = engine.generateJavaScript();
```

## Behaviors

One behavior function per block, producing the executable code string for the
**Run** path. Declared `fields` and `code` templates handle *display*, so a
field-only block needs no behavior; behaviors are for execution and for custom
(`onViewApplied`) fields.

```ts
import type { MorphicBehaviorMap } from "morphic-blocks";

export const behaviors: MorphicBehaviorMap = {
  text_print(proxy) {
    return `console.log(${proxy.inputs.TEXT ?? "undefined"});\n`;
  },
};
```

The codespace and preview don't use behaviors — they render the `type: "code"`
element content directly (with `%N` / `%FIELDNAME` substitution).

## Template Syntax

Templates use `%N` for input slots, `%FIELDNAME` for fields, and `<img>` tags for images:

| Syntax        | Result                                                                   |
|---------------|--------------------------------------------------------------------------|
| `%1`, `%2`    | Input slot (Blockly input + text substitution for codespace/preview)     |
| `%FIELDNAME`  | Inline field declared in `fields` (e.g. `%NUM`, `%OP`), or filled by `onViewApplied` |
| `<img …>`     | Image (Blockly FieldImage on block templates)                            |
| Plain text    | Becomes a Blockly label field                                            |

**Whitespace and indentation in text rendering:** preserved as authored. `"if ( %1 ) {\n  %2\n}"` produces multi-line output; `"if ( %1 ) { %2 }"` stays on one line.

## Validation

`mount()` validates the definitions and reports problems that would otherwise
fail silently at render time — throwing on structural breakage (mismatched `%N`
sets across a block's code elements, a `%FIELDNAME` with no field and no
behavior, an unresolvable `shadow` / `placeholder`) and warning on degraded
config (a `%N` with no `inputSlots` entry, an undeclared element name, a
`highlighting` key that isn't a code element, a config field on the wrong
element type, a name reused across element / mode / preset). Call the exported
`validateDefinitions(...)` to check a file before mounting.

## Mode CSS

One CSS file per mode. Use `.morphic-mode-{name}` to target blocks in a specific mode, and `.morphic-workspace-root.morphic-mode-{name}` to target the Blockly workspace.

```css
/* syntax-py.css */
.morphic-workspace-root.morphic-mode-syntax-py .blocklyText {
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

- ✅ Codespace — editable-by-structure text mirror of the block model
- ✅ Preview editor — read-only view of another mode's source element
- ✅ Drag from toolbox or grip handle (`⠿`) into the codespace, with drop-position indicator
- ✅ Slot-based drops — into empty `for`/`if` bodies, before/after siblings, and into empty value slots; reorder via grip
- ✅ Keyboard + gutter `✕` deletion
- ✅ Declarable inline fields (`fields` map: dropdown / text / number / checkbox) — field-only blocks need no behavior for display
- ✅ Inline field edits for atomic placeholders (text / number / dropdown), shadow auto-materialises on first edit
- ✅ Per-element empty-slot defaults; empty slots render a `[TYPE]` marker when no default is set
- ✅ Definition-driven syntax highlighting — per-element `highlighting` rules, runtime-swapped on `setModes()`
- ✅ Multi-editor selection sync — block ↔ code editor ↔ codespace ↔ preview
- ✅ One-file constructor + mount-time validation + shipped JSON Schema (`$schema` / `version`)

### Upcoming

- Per-mode field rendering — a dropdown option's displayed text mode-aware while its stored value stays single (booleans, keywords, i18n, comparative syntax)
- Editor toolbar for the codespace / preview
- Use empty defaults in the Blockly block view as well (cosmetic)
- Inline-edit coverage for `FieldVariable` / `FieldCheckbox` and a protocol for plugin / developer fields
- Bidirectional sync — AST parsing converts text back to blocks (future)
- Package architecture refactor — split framework into plugin/feature modules, once the feature surface stabilises
