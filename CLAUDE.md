# Morphic Blocks — CLAUDE.md

## What This Project Is

Morphic Blocks is a TypeScript framework built on top of Google Blockly. It shows one block model in multiple representations (icons, words, code in any language, as blocks or as text), for the transition between block-based and text-based programming, or between any other representations. **Modes** decide what the toolbox tiles show; **views** (workspaces and codespaces) each show one code element.

It is a **reusable library** that developers embed in their own apps; it must not lock them into specific UI components. The user docs are at <https://docs.morphicblocks.com> (EN + DE, source in <https://github.com/morphicblocks/docs>); details belong there, not here or in the READMEs.

## Repository Structure

```text
morphic-blocks/
├── apps/
│   └── sandbox/             # Dev app and test bed for every feature
├── packages/
│   ├── morphic-blocks/      # Core framework (the library)
│   │   └── test/            # Vitest tests, run in jsdom
│   ├── themes/              # @morphicblocks/themes: code view themes, one JSON file per family ({ light, dark }), e.g. standard
│   ├── blocks/              # @morphicblocks/blocks: the standard blocks with their behaviors, `define()` and `pick()`
│   └── languages/           # @morphicblocks/languages: how python, javascript, java, go, rust and cpp write the standard blocks
└── CLAUDE.md
```

### Tests

`bun run test` (repo root) runs the framework tests with Vitest in jsdom, then the themes, blocks and languages packages' (those two mount the framework from its source; their type check reads its build, so `bun run build:package` first after a framework change). Run them after every framework change, and add a test for each fix or feature that fails without the change. `test/setup-dom.ts` stubs the text measuring calls jsdom cannot answer; tests check generated text, not rendering.

## Framework Architecture (`packages/morphic-blocks`)

### Key files

- `src/morphic/MorphicBlocks.ts`: Main orchestration class (`mount`, `show`, `applyPreset`, `addView`, `generateJavaScript`, `generateText`, `loadText`, `changeRepeat`)
- `src/morphic/block-view.ts`: Block rendering, class application, fields, connection management
- `src/morphic/dropdown-fields.ts`: `MorphicDropdown` (menu classes) and `MorphicReference` (reference fields), and `keepReferencesInStep` (renames, new references)
- `src/morphic/strict-slots.ts`: strict slots, added to the workspace's connection checker
- `src/morphic/parent-field.ts`: the field a `%parent.NAME` token shows
- `src/morphic/repeat-slots.ts`: repeating slots (entry names, counts, the state saved with a block)
- `src/morphic/text-to-blocks.ts`: `parseTextToBlocks`, behind `loadText()`: text of a code element back into blocks, each template as its own pattern
- `src/morphic/operators.ts`: the order of operators in text (ranks by sign, `code.<element>.operators`) and what each slot takes without brackets (`slotBound`), one rule for the writer and the reader
- `src/morphic/block-namespace.ts`: Clean ↔ `morphic:` Blockly-type translation (collision isolation)
- `src/morphic/template.ts`: Template parsing (`%1`, `%NAME`, `<img>`), `toModeClassToken` (names into classes; public as `toClassToken`)
- `src/morphic/codegen.ts`: One-way code generation via behavior functions
- `src/morphic/view-resolver.ts`: Which element a block's template comes from (`resolveElementView` for views, `resolveBlockView` for tiles)
- `src/morphic/toolbox-canvas.ts`: The HTML toolbox (tiles, categories, drag, keyboard, custom elements)
- `src/morphic/styles.ts`: CSS/style management, mode coverage validation
- `src/morphic/validate-definitions.ts`: Mount-time checks (errors stop the mount, warnings go to `onWarning`); every message is listed on the docs' Errors & Warnings page
- `src/morphic/check-definitions.ts`: the preset and view checks, and `checkDefinitions` (public): every check `mount()` runs on a definitions file, without mounting (tools like Studio use it)
- `src/morphic/asset-urls.ts`: the `assetUrl` mount option; each mount passes every image path (template `<img>`, image elements, dropdown pictures) through it, from the blocks as loaded
- `src/morphic/types.ts`: All TypeScript types
- `cli/`: the Node side, the only code with Node types (`cli/tsconfig.json`): `index.ts` is the `morphic-blocks copy-media <folder>` command (built to `dist/cli.js`, the package's `bin`); `plugin.ts` the bundler plugin (unplugin) that copies Blockly's media on dev/build start, handed out per bundler by `vite.ts`, `webpack.ts`, `rspack.ts`, `rollup.ts`, `esbuild.ts` (package subpaths `morphic-blocks/vite` …); both use `copy-media.ts`. Built by `vite.cli.config.ts`, types by `cli/tsconfig.build.json`

### How it works

1. **Definitions** (JSON): `elementTypes`, `modes`, optional `views`, `presets` and `blockSets`, `code` settings per code element, `categories`, `blocks` (each with an `elements` map, element name → content). The docs' Definitions Format page has every field.
2. **Behaviors** (JS/TS): functions that generate the JavaScript for each block type.
3. **CSS**: one stylesheet per mode, using `.morphic-mode-<mode>` classes.
4. `mount()` sets up Blockly and every view it gets a container for; `applyPreset()` / `show()` switch the toolbox mode and the element each view shows at runtime.

**Views** are declared by name (`views` in the definitions or mount): `{ "editor-pane": "workspace", "read-pane": { "kind": "codespace", "editable": false, "delete": { … }, "rtl": false } }`. Without `views`, there are two: `workspace` and `codespace`. `mount()` takes `containers` by view name (`workspaceContainer` / `codespaceContainer` are short for `containers.workspace` / `.codespace`), `toolboxContainer`, `codeEditorContainer`, `toolbars` and `themes` by view name, and `editorTheme`; a view without a container is skipped, so the same definitions serve a full page and a small embed. The first workspace with a container holds the program (`programView`); without one, Blockly runs headless so the block model stays authoritative. Every other view goes through the added-view code. `mount()` returns a promise that settles once the text editors (lazy loaded CodeMirror) are ready. Selection sync is on when more than one view is set up; the code editor starts hidden.

Views show a **code element**, not a mode: presets say which, without presets every view shows the first mode's code element. View containers get `morphic-view`, `morphic-view-<name>`, `morphic-shows-<element>`, `morphic-preset-<name>`, `morphic-workspace-root` / `morphic-codespace-root` and `morphic-read-only`; workspace blocks get `morphic-shows-<element>`, tiles `morphic-mode-<mode>` (never `morphic-element-`, since every class starting with it is hidden by the mode visibility CSS). Names go into classes as written: only characters a class cannot hold become `-`, and such a name warns with the class it gets (categories, being labels, do not warn). Options moved in 0.3.0 and 0.4.0 fail at mount with directions.

**Added views:** `addView({ kind, container, element, name?, editable?, delete?, theme?, toolbar? })` returns a handle (`getElement`, `show`, `setTheme`, `dispose`, `ready`). Every view has a name (added ones `view-N` by default); toolbars, zoom, copy and `getViewElement()` look views up by name (`resolveView`). Workspaces beside the program's take a fresh copy of the program after each batch of changes (replaying single events cannot follow how the engine rebuilds slot defaults); they are editable by default, forwarding every change to the program's workspace, and `editable: false` makes one read only. A preset naming an unknown view only warns (it may be added later). Showing and hiding the containers is the host's job.

### Block identifier namespacing

Definitions and behaviors use **clean, free-form identifiers** (`text_print`). Blockly gets them namespaced, `morphic:<identifier>`, so an identifier can never clobber a Blockly built-in (`logic_boolean` would break stock shadows). `block-namespace.ts` owns this: `toBlocklyType(id)` / `toCleanId(type)`, and `resolveBlocklyType(ref, definitions)`, which treats a reference as a morphic block **iff** its clean id is in the definitions, else as a Blockly stock type (`math_number`). The namespace appears only in Blockly registration, `newBlock`, toolbox `type` entries, `generator.forBlock` and serialized state; strip a live `block.type` with `toCleanId` before any definitions/behaviors lookup.

### Templates and fields

- `%1`, `%2`: input slots (Blockly inputs; substituted in text). A slot declared in `inputSlots` that a template leaves out stays on the block, hidden with its value (`keepOmittedSlots`); a value slot written again shows the value in it as a label
- A slot with `"repeat": { "separator", "count" }` holds any number of values: one input per entry (`ARGS_0`, `ARGS_1`), `−` / `+` buttons on blocks and in editable codespaces (`changeRepeat`), the count in the block's saved state (with the placeholder slots it has dealt with), `proxy.lists.ARGS` for behaviors
- `%FIELDNAME`: a field: the one declared in the block's `fields` map (dropdown, reference, text, number, checkbox), or one a behavior attaches in `onViewApplied`. The template decides what a block shows, `fields` what it has: a declared field a workspace block's template leaves out stays on the block, undrawn (`keepOmittedFields`). A block has each field once; where a template names it again, a label repeats what it shows
- `%parent.NAME`: the `NAME` field of the nearest block around this one that has it, as a label (a Go method names its struct)
- `%1:type`: the type of slot 1's value, named per language in `code.<element>.types` (`value-type.ts`)
- `<img src="...">`: image fields; plain text: labels
- Text rendering keeps the template's line breaks and indentation as written

A dropdown option is `value` (generated, serialized, shown in text) plus a block-only `label`: text, an image (`{ src }`) or a color swatch (`{ color }`); `display`, keyed by element name, sets the shown text per language (`True`/`true`). An open menu gets `morphic-menu` and `morphic-menu-<FIELD>`; the look stays the app's.

A **reference** field (`{ "type": "reference", "to": "class_define.NAME" }`, or a list of targets) is a dropdown of the names the program declares: what that field holds on every such block. Its value is the name, so text, behaviors and saved programs read it like any field; renaming a declaration renames its references, and a new reference takes a declared name. `scope` limits the list to what is declared inside the nearest surrounding block of that type (the fields of a class, the parameters of a function); a name nothing declares gets `morphic-reference-missing`. A slot with `"strict": true` takes only blocks whose check matches its `check`, down the whole stack in it (Blockly lets a block without a check in everywhere); a block with `"strict": true` goes only where the place above it has a matching check. There are no built-in classes, functions or variables: developers build them from these pieces, or take them from `@morphicblocks/blocks`.

**Text both ways:** `generateText(element)` returns the program as a code element writes it; `loadText(text, { element })` reads such text back into blocks (valid text only, one undo step, `{ ok, line, message }` on a line that fits no block). Where two blocks write the same text, declared names decide (a reference prefers a declared name, a declaration a new one). Text views bracket a composed value where the text around its slot binds to it (`%1 %OP %2`, `-%1`, `%1.length`; a slot between brackets or commas, or after a statement's keyword, stands free), unless the value is one piece (its template closes itself, `max(%1, %2)`, `[%1]`, or only goes on from the value in front, `%1[%2]`) or the order of operators lets it stand free: a template that is an operator (`%1 %OP %2`, `not %1`, a repeating slot with a sign as separator) has the rank of its sign, from a default table that `code.<element>.operators` changes per sign (`false` turns it off; `direction: "any"` for a sign that needs no brackets beside itself, a `<<` stream), a ranked sign beside a slot of any other template counts too (`i < %1`), and `loadText` reads by the same order. A text field between quote marks is written with a backslash in front of the mark and of a backslash, and read back without.

**Packages:** `define({ blocks: standard, languages: { python, java } }, own, ownBehaviors)` from `@morphicblocks/blocks` returns ordinary definitions and behaviors: each language becomes a code element under its key, each standard block gets the languages' templates, and the app's own entries win (settings one by one, blocks by identifier). A language is `{ code, blocks, display?, separators? }`; `packages/languages/test/coverage.test.ts` holds the rules each one keeps, including the round trip through `loadText`.

## Elements, modes, presets

| Element type | Toolbox tile | Workspace block |
| --- | --- | --- |
| `text` | HTML label | never shown |
| `code` | a Blockly block, or source text (the mode's `render`) | the Blockly template |
| `image` | `<img>` (a bare path is wrapped, sized by the element's `size`, default 16) | never shown |
| `custom` | drawn by the app's function in `toolbox.custom` | never shown |

- A **mode** (`{ name, elements, render? }`) lists the elements a tile shows; `render` says per code element `"block-based"` (default) or `"text-based"`. All elements are rendered on every tile; CSS hides the ones the mode does not list.
- A **preset** (`{ name, label?, toolbox: <mode>, views: { <view>: <code element> }, blockSet?, categories? }`) says what the toolbox and each view show; views it leaves out keep theirs, and without `blockSet` the toolbox shows all blocks; `categories: false` shows the tiles as one list (HTML toolbox or Blockly's flyout; Blockly's category toolbox keeps them and warns). `onPresetApplied(preset)` lets the host lay out its panes.
- A **block set** (`blockSets`, `block-sets.ts`) names the toolbox's blocks: a list, or `{ extends, add?, remove? }`; `show({ blockSet })` switches it (`null` for all), blocks in the program stay.
- `toolbox.label` names tiles for screen readers after an element (e.g. a hidden `spoken-de`); presses on controls inside a custom element neither drag the tile nor add the block.
- Names: the docs' Naming page recommends kebab-case and a suffix per kind (`…-tiles`, `…-preset`, `…-pane`), other styles work too; a framework word as a name (`FRAMEWORK_WORDS`) and a name used for two kinds warn. An element cannot be called `default`.

**The HTML toolbox** (`toolboxContainer` / `mountToolbox`) replaces Blockly's flyout. Tiles are HTML; code shown as a block is drawn in a hidden Blockly workspace that takes `media`, `renderer`, `theme` and `rtl` from the host workspace and never loads sounds. Its default styles use `:where()`, so app CSS always wins.

## Sandbox (`apps/sandbox`)

Dev app and test bed for every feature; change it freely, commit it separately. It imports the framework from its source (an alias in `vite.config.ts`), so `bun run dev` picks up framework changes without a build; the themes package and the media plugin are read from their builds (`bun run build:package`). Mode CSS files are found by filename (`src/modes/<mode>.css`). Three themes (`Dark`, `Light`, `Creme`, CSS variables in `src/style.css`, stored under `morphic-sandbox-theme`); `?packaged-themes` uses `@morphicblocks/themes` for the code views.

**Light theme: Leibniz University Hannover colors** (<https://www.corporate.uni-hannover.de/die-marke/farben>): primary `#00509B`, `#C8D317`; secondary `#99B9D8`, `#DEE574`; typography `#000000`, `#666666`, `#b2b2b2`, `#e5e5e5`; this lab `#55bdcb`; backgrounds white. The greens are kept for branding moments and unused in the demo.

## Roadmap

**Upcoming:** a natural-language locale layer (an external translation table per locale, orthogonal to modes); inline edits for `FieldVariable` / `FieldCheckbox`; the rest of bidirectional sync (half-typed text and draft blocks, typing in the codespace, keeping a block's identity across an edit); typed parameters and results for Java and Go; optional Monaco; a package architecture refactor as the final cleanup.

**Not planned:** multi-language code generation. Behaviors already write whatever code the developer wants, elements already show any language, and execution is JavaScript, so per-language generators would add upkeep without benefit.

## Conventions

- **TypeScript only** in the framework package
- **Ask before implementing**: discuss and get approval before writing or changing code
- **Don't restrict users**: UI stays unstyled/headless; the app styles it
- **Library scope**: an embeddable library, not a standalone app
- **No unnecessary abstraction**: minimum complexity for the current task
- **No external requests**: the framework never loads anything from another server; `test/no-external-requests.test.ts` fails on any address in `src/`

## Commit Workflow

1. For a single change, or when the user asks for options, suggest **three** commit messages and mark the recommended one with **(recommended)**; for several changes at once, one message per commit is enough
2. Never commit before the user approves the message(s)
3. Follow the emoji-style Conventional Commits format defined in `.vscode/commit-instructions.md`
4. Add Claude Code's default co-author line, which names the model (e.g. `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`), so the history shows which model built a change; leave it out only when the user says to be the main author

## Release Workflow (npm)

Publishing runs in CI (`.github/workflows/publish.yml`) via OIDC trusted publishing when a GitHub **Release** is published; a tag `themes-v…` publishes the themes package, any other the framework. A published version is immutable, so before telling the developer to cut a release, **run a pre-flight and remind them of it**:

1. **Reproduce the CI build locally**: install with the lockfile in sync, build, type check (tests included), test, pack.
2. **Inspect the package contents**: only the intended files ship.
3. **Docs ↔ reality**: README, install and usage instructions match `package.json` (dependencies vs peers, exports, version).
4. **Version**: bump `package.json`; the npm page only refreshes on a new version.

The full routine, including testing the playground apps against the local build (local package references are never committed), the release notes (they replace upgrade pages and a changelog) and moving the apps to the published version, is the local `release` skill.
