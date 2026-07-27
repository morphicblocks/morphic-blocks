# Morphic Blocks — CLAUDE.md

## What This Project Is

Morphic Blocks is a TypeScript framework built on top of Google Blockly. Its purpose is to render Blockly blocks in multiple **modes** (e.g., iconic, lexical, syntactic), facilitating the transition between block-based and text-based programming — or between any given visual representation modes.

It is designed as a **reusable library** that developers embed in their own apps. It should not lock users into specific UI components.

## Repository Structure

```text
morphic-blocks/
├── apps/
│   └── sandbox/             # Dev app showing the framework in use
├── packages/
│   └── morphic-blocks/      # Core framework (the library)
└── CLAUDE.md
```

## Framework Architecture (`packages/morphic-blocks`)

### Key files

- `src/morphic/MorphicBlocks.ts` — Main orchestration class (`mount`, `setModes`, `applyPreset`, `generateJavaScript`)
- `src/morphic/block-view.ts` — Block rendering, mode class application, connection management
- `src/morphic/block-namespace.ts` — Clean ↔ `morphic:` Blockly-type translation (collision isolation)
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
5. `engine.applyPreset()` / `engine.setModes()` switch the per-view modes at runtime — blocks re-render

`mount()` accepts either `workspaceContainer`, `codespaceContainer`, or both. At least one is required. When only `codespaceContainer` is provided, Blockly runs headless (offscreen) so the block model stays authoritative. Using a codespace (via `codespaceMode` or a preset with `codespace`) requires `codespaceContainer`.

### Block identifier namespacing

Definitions and behaviors use **clean, free-form identifiers** (`text_print`, `logic_if`). Internally, blocks are registered with Blockly under a namespaced type — `morphic:<identifier>` — so a developer's identifier can never collide with a Blockly built-in (naming a block `logic_boolean` would otherwise clobber the stock block that shadows and connection checks depend on). `block-namespace.ts` owns this translation:

- `toBlocklyType(id)` / `toCleanId(type)` — convert between the two forms
- `resolveBlocklyType(ref, definitions)` — resolve a developer-facing reference (a `default.shadow` / `default.placeholder`, a toolbox block list entry, or a drag payload): it is a morphic block **iff** its clean id is in the definitions map (then namespaced), otherwise it is a Blockly stock type and passes through unchanged (e.g. `math_number`)

The namespace is an internal Blockly-type detail — it appears only in `Blockly.Blocks[…]` registration, `newBlock`, the toolbox `type` entries, `generator.forBlock[…]`, and serialized workspace state. Everything developer-facing (the `definitions` map, the `behaviors` map, the `behaviorProxy.blockType`) stays keyed by the clean id. When reading a live `block.type`, strip it with `toCleanId` before any definitions/behaviors lookup.

### Template syntax

- `%1`, `%2` — input slots (auto-create Blockly inputs; also substituted in text rendering)
- `%FIELDNAME` — field value (uppercase alpha token; substituted in text rendering; ignored by Blockly block rendering because behaviors attach fields via `onViewApplied`)
- `<img src="...">` — image/SVG fields
- Plain text — label fields

**Whitespace and indentation:** Text-mode rendering preserves whatever the template contains. Authors control line breaks and indent:

- `"if ( %1 ) { %2 }"` → single line
- `"if ( %1 ) {\n  %2\n}"` → multi-line with indent

## Sandbox (`apps/sandbox`)

Local dev app. Uses `import.meta.glob()` to auto-discover mode CSS files by filename. Seeds a demo workspace on load. Shows live code generation and execution.

### Themes

The sandbox ships three themes selectable via the header dropdown: `Dark`, `Light`, and `Creme`. Theme state persists in `localStorage` under `morphic-sandbox-theme`. CSS variables are defined per theme in `src/style.css` (`:root` for Dark, `[data-theme="light"]`, `[data-theme="creme"]`); editor and preview themes are wired in `src/main.ts`. The `Creme` theme is a warm off-white (Solarized-style, `#fdf6e3`).

**Light theme — Leibniz University Hannover corporate identity colors.** Source: <https://www.corporate.uni-hannover.de/die-marke/farben>

| Role | Hex |
|---|---|
| Primary | `#00509B`, `#C8D317` |
| Secondary | `#99B9D8`, `#DEE574` |
| Typography | `#000000`, `#666666`, `#b2b2b2`, `#e5e5e5` |
| Department (this lab) | `#55bdcb` |

The `Light` theme uses these colors plus white (`#ffffff`) for backgrounds. Greens (`#C8D317`, `#DEE574`) are reserved for explicit branding moments and are not currently used in the demo.

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
  "presets": [
    { "name": "starter", "label": "Starter", "toolbox": "iconic",  "workspace": "lexical" },
    { "name": "text",    "label": "Text",    "toolbox": { "mode": "syntactic", "render": { "syntax": "text" } }, "codespace": "syntactic", "preview": "syntactic" }
  ],
  "categories": [
    { "name": "Output", "color": "#5C81A6" }
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
- `presets` — named per-view mode configurations (see below)
- `categories` — optional metadata (name, colour); blocks reference them by name
- `blocks` — flat array; per-block `elements` are plain `name: content` strings

### Mode fields

| Field      | Required | Purpose                                    |
|------------|----------|--------------------------------------------|
| `name`     | yes      | Mode identifier                            |
| `elements` | yes      | Element names rendered on the toolbox tile |

A mode is purely presentational: it names a subset of elements. Its **source element** — what a codespace or preview renders when the mode is assigned to it — is the first `type: "code"` element in its `elements` array. How a mode's code elements render on a toolbox tile (block vs text) is decided by the preset's `toolbox` entry, not the mode, so one mode can be reused across presets with different tile rendering.

### Presets

A **preset** assigns a mode to each view: `{ name, label?, toolbox, workspace?, codespace?, preview? }`. `toolbox` is required, at least one editing space (`workspace` / `codespace`) must be set, and presence of a view key means that view is shown.

The `toolbox` entry is either a **mode name** (all code elements render as draggable blocks) or an **object** `{ mode, render }` where `render` is a per-element map (`{ elementName: "block" | "text" }`) that overrides how each `code` element renders in the tile. This is where a code element is shown as source text instead of a block, and lets a mode with several code elements render each differently.

Presets are passed via the mount config (`presets`, initial `preset`), validated at mount (unknown modes, missing code elements, codespace without `codespaceContainer`, duplicate names, invalid render values), applied at runtime with `engine.applyPreset(nameOrIndex)`, and reported to the host via `onPresetApplied(preset)` for pane-visibility layout. Workspace and codespace can be visible simultaneously with different modes; `setModes({ workspaceMode?, toolboxMode?, toolboxRender?, codespaceMode?, previewMode? })` remains the lower-level API (`null` clears the codespace/preview modes and the toolbox render override).

### Workspace template resolution

1. First `type: "code"` element listed in the mode's `elements` array
2. Fallback: first `type: "code"` element in the block definition
3. Fallback: element literally named `"block"` (backward compat)
4. Fallback: first element in the definition

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
- ~~**Preview editor** — read-only view of the preview mode's source element
- ~~**Drag from toolbox / grip into codespace**~~ with drop-position indicator
- ~~**Slot-based drop resolution**~~ — drops into empty `for`/`if` bodies and statement chains, not just before/after the parent
- ~~**Same-chain reorder via grip**~~ — active-source exclusion makes drop-on-self a real move
- ~~**Indent compounding**~~ in template-codegen across nesting depth
- ~~**Per-element empty-slot defaults**~~ via `elementTypes` config (`{ type, empty: { Number, String, Boolean, default } }`)
- ~~**Empty-area click clears highlight**~~ in codespace/preview
- ~~**Definition-driven syntax highlighting**~~ — top-level `highlighting` map in definitions, keyed by element name (matches the codespace/preview modes' source elements); each entry: `{ keywords, strings, comment, numbers, colors }`. Implementation: CodeMirror 6 `ViewPlugin` + `Decoration.mark` (no `StreamLanguage` — keeps highlighting decoupled from language behavior); runtime swap via `Compartment` on `setModes()`. Type: `MorphicHighlightDefinition`.
- ~~**Drag value blocks into value slots**~~ (numbers, strings, variables) — toolbox tile drop + grip-drag inside codespace; type-check bypassed on drop because codespace is text.
- ~~**Right-click drag inside codespace**~~ — secondary-button (or Ctrl-click on macOS) drag with capture-phase mousedown; hover affordances: blue outline on innermost editable placeholder, grey background on innermost non-atomic block.
- ~~**Inline field edits for atomic placeholders**~~ — text / number / dropdown editors overlaid on the placeholder range; shadows materialise to real blocks on first edit. Atomic = exactly one named field, no value inputs. `FieldVariable` and `FieldCheckbox`, plus plugin / developer custom fields, are deferred (option menu and rationale recorded outside the repo).
- ~~**Declarable inline fields**~~ — a `fields` map on a block definition builds dropdown / text / number / checkbox fields at the `%FIELDNAME` token, so field-carrying blocks need no behavior for display. Dropdown options are `value` (generated + shown in text) plus an optional block-only `label` (no serialization key). Undeclared `%FIELDNAME` tokens still fall through to `onViewApplied` for custom fields; `kind: "dummy"` was removed (it only ever anchored a behavior-attached field). Type: `MorphicFieldDefinition`.

### Upcoming

- **Per-mode field rendering** — a declared field renders identically in every mode today; make a dropdown option's *displayed* text mode-aware while its stored `value` (used for JS execution/codegen) stays single. This is the same gap the element system already closes for `text`/`code` content — fields are the one place mode-awareness stops. Motivating cases: boolean literals (Python `True`/`False` vs JS/Go `true`/`false`), keyword/operator dropdowns (Python `and`/`or`/`not` vs JS `&&`/`||`/`!`, `None`/`null`/`nil`), **localization / i18n** (option labels per natural language, e.g. `Monday`/`Montag`), and comparative-programming views (one concept, Python/Java/C++ syntax side by side). Only `dropdown` is affected — `text`/`number` fields hold user data or language-neutral values. Design axis to decide: inline per-mode labels in the definition vs an external translation table merged at load.
- **Codespace / preview editor toolbar** (Task 16)
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
