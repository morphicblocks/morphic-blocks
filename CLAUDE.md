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

`mount()` accepts either `workspaceContainer`, `codespaceContainer`, or both. At least one is required. When only `codespaceContainer` is provided, Blockly runs headless (offscreen) so the block model stays authoritative. Modes with `presentation: "codespace"` require `codespaceContainer`.

### Template syntax

- `%1`, `%2` — input slots (auto-create Blockly inputs; also substituted in text rendering)
- `%FIELDNAME` — field value (uppercase alpha token; substituted in text rendering; ignored by Blockly block rendering because behaviors attach fields via `onViewApplied`)
- `<img src="...">` — image/SVG fields
- Plain text — label fields

**Whitespace and indentation:** Text-mode rendering preserves whatever the template contains. Authors control line breaks and indent:

- `"if ( %1 ) { %2 }"` → single line
- `"if ( %1 ) {\n  %2\n}"` → multi-line with indent

## Playground (`apps/playground`)

Demo app. Uses `import.meta.glob()` to auto-discover mode CSS files by filename. Seeds a demo workspace on load. Shows live code generation and execution.

## Core Concept: Morphic Block

A **Morphic Block** is the fundamental unit. It has named **elements** — the visual parts it can show. Each element name is **free-form**; its **type** drives rendering behavior.

### Element types

| Type    | Toolbox tile            | Workspace block                                            |
|---------|-------------------------|------------------------------------------------------------|
| `text`  | Rendered as HTML label  | Never shown                                                |
| `code`  | Rendered as Blockly SVG | Used as Blockly template (`<img>` in content → FieldImage) |
| `image` | Rendered as `<img>`     | Never shown                                                |

Element names (`title`, `icon`, `block`, `syntax`, …) are fully free-form. The type is declared once globally in `elementTypes` — not repeated per block.

A **mode** declares which elements are visible and, by scanning for the first `type: "code"` element listed, determines which template is used in the workspace.

## definitions.json Structure

```json
{
  "elementTypes": {
    "title":  "text",
    "text":   "text",
    "icon":   "image",
    "block":  "code",
    "syntax": "code"
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
        "title":  "Print",
        "icon":   "<img src='assets/log.svg'>",
        "block":  "log %1",
        "syntax": "console.log( %1 );",
        "text":   "Print a message"
      },
      "inputSlots": { "1": { "kind": "value", "name": "MESSAGE" } }
    }
  ]
}
```

- `elementTypes` — global registry mapping element names to their type (`text`, `code`, `image`)
- `modes` — explicit mode definitions; mode names are arbitrary (no coupling to element names)
- `categories` — optional metadata (name, colour); blocks reference them by name
- `blocks` — flat array; per-block `elements` are plain `name: content` strings

### Mode fields

| Field           | Required       | Purpose                                                                                 |
|-----------------|----------------|-----------------------------------------------------------------------------------------|
| `name`          | yes            | Mode identifier                                                                         |
| `elements`      | yes            | Element names rendered on the toolbox tile                                              |
| `presentation`  | no             | `"workspace"` (default) or `"codespace"`                                                |
| `primarySource` | when codespace | Element name used as the primary view source (must be type `code`)                      |
| `preview`       | no             | Element name used by the preview editor (must be type `code`)                           |
| `tileRender`    | no             | Map of element name → `"block"` or `"text"`. Overrides tile rendering for code elements |

Validation at mount: `presentation: "codespace"` requires `primarySource`; `primarySource` and `preview` must reference elements declared as `code` in `elementTypes`.

### Workspace template resolution

1. Mode's explicit `primarySource` (when set)
2. First `type: "code"` element listed in the mode's `elements` array
3. Fallback: first `type: "code"` element in the block definition
4. Fallback: element literally named `"block"` (backward compat)
5. Fallback: first element in the definition

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

## Use Cases

The primary motivating use case is **gradual block-to-text programming transition** (covered by the companion short paper). Because the element-type and mode system decouple block content from presentation, the same architecture can serve several other applications without framework changes — only new modes, elements, and CSS:

- **Localization / internationalization** — same blocks with different natural-language labels per mode (English, German, Spanish, Arabic, …). Classrooms in any language without rewriting block logic.
- **Accessibility** — alternate modes for high-contrast, large-text, dyslexia-friendly, or screen-reader-optimized rendering.
- **Age-appropriate rendering** — icon-centric mode for young learners; verbose-text mode for older learners. Same lesson content, multiple age groups.
- **Comparative programming education** — render the same program in Python, Java, and C++ syntax side-by-side to show how concepts translate across languages.
- **Expert vs novice views** — compact (icon / short-label) mode for experts, verbose (full-text / description) mode for novices. Same codebase, tailored rendering.
- **Domain-specific visual languages** — custom modes for music composition, robotics, data science, game design, etc., each with domain-appropriate visuals.
- **Documentation-enriched blocks** — render descriptions, examples, or rationale alongside blocks for learning or onboarding.

These are *potential* applications, not currently deployed. They are worth keeping in mind when evaluating feature-design decisions — the framework's value extends beyond the transition use case.

## Planned Features (Roadmap)

### Completed

- ~~**CodeMirror text editor integration**~~ — optional code editor with lazy loading
- ~~**Block metadata mapping**~~ — maps block IDs to generated code positions
- ~~**Block ↔ code selection sync**~~ — multi-editor (code editor, codespace, preview)
- ~~**Codespace** — editable-by-structure text view of the workspace
- ~~**Preview editor** — read-only view of `mode.preview`
- ~~**Drag from toolbox / grip into codespace**~~ with drop-position indicator
- ~~**Slot-based drop resolution**~~ — drops into empty `for`/`if` bodies and statement chains, not just before/after the parent
- ~~**Same-chain reorder via grip**~~ — active-source exclusion makes drop-on-self a real move
- ~~**Indent compounding**~~ in template-codegen across nesting depth
- ~~**Per-element empty-slot defaults**~~ via `elementTypes` config (`{ type, empty: { Number, String, Boolean, default } }`)
- ~~**Empty-area click clears highlight**~~ in codespace/preview

### Upcoming

- **Definition-driven syntax highlighting** — top-level `highlighting` map in definitions, keyed by element name (matches `mode.primarySource` / `mode.preview`); each entry: `{ keywords, strings, comment, numbers, colors }`. Implementation: CodeMirror 6 `ViewPlugin` + `Decoration.mark` (no `StreamLanguage` — keeps highlighting decoupled from language behavior); runtime swap via `Compartment` on `setModes()`. Type: `MorphicHighlightDefinition`.
- **Drag value blocks into value slots** (numbers, strings, variables)
- **Field edits in codespace** — replace placeholders, insert variables
- **Use empty defaults in the Blockly block view** as well (cosmetic)
- **Bidirectional sync** — AST parsing converts text back to blocks (future, separate paper)
- **Error recovery / draft blocks** — handles incomplete/invalid code gracefully
- **Headless UI components** (terminal, sidebar, info panel, resizable panes) — unstyled
- **Monaco editor (optional)** — separate entry point (`morphic-blocks/monaco`)
- **Package architecture refactor** — split framework into plugin/feature modules (e.g. `core/`, `codespace/`, `toolbox/`, `selection-sync/`, `highlight/`); ports-and-adapters or similar; planned as the final cleanup after feature surface stabilises.

### Removed

- ~~**Multi-language code generation**~~ — **Not needed.** Blockly's built-in language generators (Python, Lua, Dart, PHP) only cover Blockly's stock blocks, not custom Morphic blocks. Since behaviors already produce whatever code strings the developer writes, the "language" is fully controlled by the developer. Multi-language *display* is already handled by the element system (e.g., a `"syntax"` element can show Python, Java, or any syntax). Multi-language *execution* is impractical in a web framework where JavaScript is the runtime. Adding per-language behavior maps would create maintenance overhead with no real benefit.

## Conventions

- **TypeScript only** — avoid plain JavaScript in the framework package
- **Ask before implementing** — always discuss and get approval before writing or changing code
- **Don't restrict users** — UI components should be unstyled/headless so developers can style them freely
- **Library scope** — the framework is an embeddable library, not a standalone app
- **No unnecessary abstraction** — minimum complexity for the current task

## Commit Workflow

1. Before committing, always suggest **three** commit message options
2. Follow the emoji-style Conventional Commits format defined in `.vscode/commit-instructions.md`
3. Mark the recommended option with **(recommended)** so the user can see which one you prefer
4. The user picks one; then commit with the chosen message
5. Add `Co-Authored-By: Claude <noreply@anthropic.com>` unless the user says to be the main author
