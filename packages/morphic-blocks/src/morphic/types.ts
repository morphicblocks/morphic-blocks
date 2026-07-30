import type * as Blockly from "blockly";

export type MorphicModeName = string;

/**
 * The rendering type of a named element.
 * - "text"  — rendered as an HTML label; never shown in the workspace
 * - "code"  — template with %N placeholders; rendered as a Blockly block in the workspace or as text in the codespace
 * - "image" — rendered as an <img> in the toolbox tile; never shown in the workspace
 */
export type MorphicElementType = "text" | "code" | "image";

/**
 * Configuration for a value slot's empty-state default. Keyed by slot
 * `check` in `elementTypes[name].empty[check]`, or set per-slot via
 * `inputSlot.default`. Both `shadow` and `placeholder` are optional; when
 * both are configured, the placeholder is created first and Blockly's
 * native shadow restoration brings the shadow up if the user removes the
 * placeholder.
 */
export interface MorphicEmptyDefaultConfig {
  /**
   * Blockly block type used as a *shadow* — ghosted, immutable, auto-replaced
   * when a real block connects, restored when the user disconnects.
   * Standard examples: `"math_number"`, `"text"`, `"logic_boolean"`.
   * The shadow's output type must be compatible with the slot's `check`,
   * otherwise Blockly silently rejects the connection.
   */
  shadow?: string;
  /**
   * Blockly block type used as a *placeholder* — a real (non-shadow) block
   * attached on render. Movable, editable, deletable. When both `shadow`
   * and `placeholder` are configured, the placeholder takes priority on
   * the visible slot.
   */
  placeholder?: string;
  /**
   * Initial values applied to the chosen block's internal Blockly fields
   * (e.g. `{ NUM: "0" }` for `math_number`, `{ TEXT: "text" }` for `text`).
   * Plural because a single shadow/placeholder block can carry multiple
   * fields (`{ MIN: "0", MAX: "100", STEP: "1" }` for a range picker).
   */
  fieldValues?: Record<string, string>;
}

/**
 * Optional per-element configuration. Used in place of a bare type string in
 * `elementTypes` when the developer needs to declare extras (e.g. shadows /
 * placeholders for empty value slots).
 */
export interface MorphicElementTypeConfig {
  type: MorphicElementType;
  /**
   * Per-slot-check defaults for empty value inputs. Keys are the slot's
   * `check` string (e.g. `"Number"`, `"String"`, or any developer-defined
   * check name). Slots without a matching key get no default — the codespace
   * renders a `[TYPE]` marker (e.g. `[NUMBER]`) and the workspace shows an empty
   * socket. Per-slot overrides via `inputSlots[i].default` take priority.
   */
  empty?: Record<string, MorphicEmptyDefaultConfig>;
  /**
   * String delimiter used to wrap framework-supplied literals (shadow values
   * and empty-slot fallbacks) in `String`-checked value slots, so the
   * codespace renders e.g. `print("hello")` rather than `print(hello)`. The
   * quotes are emitted around the value but outside the editable marker, so
   * inline editing targets only the inner text. Only applies to literals the
   * framework supplies; user-attached real blocks render via their own
   * templates (a `var_get` stays bare, a `text_value` quotes itself).
   * Language-specific (`"\""` for most languages); omit to disable quoting.
   */
  stringQuote?: string;
  /**
   * Display size for `type: "image"` elements. Used when the element value is
   * a file path (e.g. `"assets/icon.svg"`) and the framework auto-wraps it as
   * an `<img>` tag. Accepted formats:
   *   - number: square, e.g. `32` → 32×32
   *   - `"32"`: square
   *   - `"32x32"`: explicit width × height
   * Defaults to 16×16 if omitted. Ignored for non-image element types and for
   * values that are already `<img>` HTML.
   */
  size?: number | string;
}

/** Either a bare type or a config object with extras. */
export type MorphicElementTypeEntry = MorphicElementType | MorphicElementTypeConfig;
export type MorphicConnectionSpec = boolean | string | string[];
export type MorphicInputKind = "value" | "statement";
export type MorphicInputAlign = "left" | "centre" | "right";

/**
 * One choice in a declared `dropdown` field. The `value` is the source of
 * truth: it is what the block *generates* and what text/preview views render.
 * The optional `label` is a display-only override shown on the workspace block
 * (e.g. show `÷` while generating `/`); when omitted the value is shown.
 *
 * Forms:
 *   - `"=="`               → value = label = `"=="`
 *   - `["-", "−"]`         → value `"-"`, shown as `"−"` on the block
 *   - `{ value, label? }`  → explicit object form
 */
export type MorphicDropdownOption =
  | string
  | [value: string, label: string]
  | { value: string; label?: string };

/**
 * A field declared directly on a block (rendered at the `%FIELDNAME` token
 * position). Lets dropdown / text / number / checkbox fields live in the
 * definitions file instead of requiring a behavior's `onViewApplied`. Fields
 * outside these four (variables, colour, plugin/custom) still use
 * `onViewApplied` — the `%FIELDNAME` token is skipped when no declaration
 * exists, leaving the behavior to supply the field.
 */
export type MorphicFieldDefinition =
  | { type: "dropdown"; options: MorphicDropdownOption[]; default?: string }
  | { type: "text"; default?: string }
  | { type: "number"; default?: number; min?: number; max?: number; precision?: number }
  | { type: "checkbox"; default?: boolean };

export interface MorphicInputSlotDefinition {
  kind?: MorphicInputKind;
  name?: string;
  check?: string | string[];
  align?: MorphicInputAlign;
  label?: string;
  /**
   * Block-level override for this slot's empty-state default. Highest
   * priority: when set, takes precedence over the elementType-level
   * `empty[check]` lookup. Lets a specific block (e.g. a tutorial's first
   * `print` block) supply richer defaults than its language's generic ones.
   */
  default?: MorphicEmptyDefaultConfig;
}

/**
 * Named visual parts of a Morphic Block.
 * Keys are element names (e.g. "icon", "block", "code", "text") — free-form, not enforced.
 * Values are template strings (same syntax as before: %1 placeholders, <img> tags, plain text).
 * The "block" element is used as the Blockly workspace template.
 */
export type MorphicBlockElements = Record<string, string>;

/**
 * A named per-view mode configuration. Presence of a view key means that view
 * is part of the preset: `toolbox` is required, and at least one editing
 * space (`workspace` or `codespace`) must be set; `preview` is optional.
 */
/**
 * A preset's toolbox: either a bare mode name (all code elements render as
 * blocks) or an object that additionally overrides, per element, whether a
 * `code` element renders as a draggable block or as source text in the tile.
 */
export type MorphicPresetToolbox =
  | MorphicModeName
  | { mode: MorphicModeName; render?: Record<string, "block" | "text"> };

export interface MorphicPresetDefinition {
  name: string;
  /** Display label (e.g. for buttons). Falls back to `name`. */
  label?: string;
  toolbox: MorphicPresetToolbox;
  workspace?: MorphicModeName;
  codespace?: MorphicModeName;
  preview?: MorphicModeName;
}

/**
 * Declares which elements are visible for a given mode.
 * CSS (one file per mode) controls how those elements look.
 * A mode's source element (rendered in editing spaces and previews) is the
 * first element in `elements` whose type is "code".
 */
export interface MorphicModeDefinition {
  name: string;
  /** Element names that are visible in this mode (e.g. ["icon", "text"]). */
  elements: string[];
}

export interface MorphicBlockDefinition {
  identifier: string;
  /**
   * Named visual elements of this Morphic Block.
   * The "block" element (if present) is used as the Blockly workspace template.
   * Falls back to the first element if "block" is absent.
   */
  elements: MorphicBlockElements;
  /**
   * Input slot definitions keyed by placeholder index ("1", "2", …).
   * Applies to the workspace ("block") element template.
   */
  inputSlots?: Record<string, MorphicInputSlotDefinition>;
  /**
   * Inline field definitions keyed by `%FIELDNAME` token name (uppercase, e.g.
   * "OP", "NUM", "TEXT"). Rendered at the token position on the workspace block
   * and read by text/preview views and codegen. Types outside the built-in four
   * (dropdown / text / number / checkbox) are supplied by a behavior's
   * `onViewApplied` instead.
   */
  fields?: Record<string, MorphicFieldDefinition>;
  color?: number | string;
  output?: MorphicConnectionSpec;
  previousStatement?: MorphicConnectionSpec;
  nextStatement?: MorphicConnectionSpec;
  inputsInline?: boolean;
  tooltip?: string;
  helpUrl?: string;
  /** Category name this block belongs to. */
  category?: string;
}

/**
 * Token-level highlighting rules for a code element. Keyed by element name
 * (e.g. "python", "javascript", "concept") so a mode's source element already
 * names the language — no separate `language` field is needed on modes.
 *
 * The framework applies these as `Decoration.mark` ranges via a CodeMirror
 * `ViewPlugin`. Highlighting deliberately does NOT install a CodeMirror
 * language (no bracket matching, no auto-indent, no autocomplete) — Code
 * Blocks treats text as a rendered view, not a freeform editing surface.
 */
export interface MorphicHighlightDefinition {
  /** Words to highlight as keywords (exact match against `[A-Za-z_]\w*` tokens). */
  keywords?: string[];
  /** String delimiters (e.g. `["\"", "'"]`). Span until matching close on same line. */
  strings?: string[];
  /** Line-comment marker (e.g. `"#"`, `"//"`). Highlights from the marker to end of line. */
  comment?: string;
  /** Highlight integer/decimal numeric literals. Defaults to true; pass `false` to disable. */
  numbers?: boolean;
  /** Per-token-class color overrides. Each is optional; framework provides sensible defaults. */
  colors?: {
    keyword?: string;
    string?: string;
    number?: string;
    comment?: string;
  };
}

/** Top-level format for a definitions JSON file. */
export interface MorphicBlocksFormat {
  /** JSON Schema reference for editor tooling. Ignored by the framework. */
  $schema?: string;
  /** Definitions format version. Current: 1. */
  version?: number;
  /**
   * Global element type registry.
   * Maps each element name to either a bare type ("text" | "code" | "image")
   * or a config object (`{ type, empty? }`). Declared once here; per-block
   * elements remain plain name→content strings.
   */
  elementTypes?: Record<string, MorphicElementTypeEntry>;
  /** Explicit mode definitions — which elements are visible per mode. */
  modes?: MorphicModeDefinition[];
  /** Named per-view mode configurations. Used as the mount default for `presets`. */
  presets?: MorphicPresetDefinition[];
  /**
   * Per-element highlight rules, keyed by element name. The codespace and
   * preview modes' source elements look up entries here for their editors.
   */
  highlighting?: Record<string, MorphicHighlightDefinition>;
  /** Optional category metadata. Blocks reference categories by name. */
  categories?: MorphicToolboxCategory[];
  /** Flat array of block definitions. */
  blocks: MorphicBlockDefinition[];
}

export type MorphicRenderContext = "workspace" | "toolbox";

export interface MorphicBehaviorContext {
  Blockly: typeof Blockly;
  workspace: Blockly.WorkspaceSvg;
  mode: MorphicModeName;
  context: MorphicRenderContext;
  definition: MorphicBlockDefinition;
}

export interface MorphicBehaviorProxy {
  blockId: string;
  blockType: string;
  mode: MorphicModeName;
  context: MorphicRenderContext;
  inputs: Record<string, string>;
  fields: Record<string, string>;
}

export type MorphicCodeBehavior = (proxy: MorphicBehaviorProxy) => string;

export interface MorphicBlockBehavior {
  init?: (block: Blockly.BlockSvg, context: MorphicBehaviorContext) => void;
  onViewApplied?: (
    block: Blockly.BlockSvg,
    context: MorphicBehaviorContext,
  ) => void;
  generate?: MorphicCodeBehavior;
}

export type MorphicBehaviorDefinition =
  | MorphicBlockBehavior
  | MorphicCodeBehavior;
export type MorphicBehaviorMap = Record<string, MorphicBehaviorDefinition>;

export interface MorphicModeStyle {
  mode: MorphicModeName;
  href?: string;
  cssText?: string;
}

export interface MorphicStyleBundle {
  href?: string;
  cssText?: string;
}

export interface MorphicToolboxCategory {
  name: string;
  color?: string;
  /** Explicit block list. If omitted the framework derives it from block definitions whose `category` matches this name. */
  blocks?: string[];
}

export type MorphicToolboxLayout = "flyout" | "category";

export interface MorphicToolboxConfig {
  kind?: "flyoutToolbox" | "categoryToolbox";
  blocks?: string[];
  categories?: MorphicToolboxCategory[];
}

/** Options for the custom HTML toolbox canvas (mountToolbox). */
export interface MorphicToolboxCanvasOptions {
  /** Render a "Mode: <name>" header at the top of the toolbox. Defaults to true. */
  modeLabel?: boolean;
  /** Show only a subset of blocks. Defaults to all blocks in definitions. */
  blocks?: string[];
  /**
   * Category grouping for the toolbox canvas.
   * If omitted, falls back to categories from mount config.
   * If neither is provided, blocks render as a flat list.
   */
  categories?: MorphicToolboxCategory[];
}

export interface MorphicJavaScriptConfig {
  statementPrefix?: string | null;
  statementSuffix?: string | null;
  infiniteLoopTrap?: string | null;
  reservedWords?: string;
}

export interface MorphicMountConfig {
  /**
   * Container for the Blockly workspace. Optional — may be omitted when only a
   * codespace is used. At least one of `workspaceContainer` or `codespaceContainer`
   * must be provided. When omitted, Blockly runs headless (offscreen) so the block
   * model stays available.
   */
  workspaceContainer?: HTMLElement;
  /**
   * Container for the primary text editor (codespace). Optional — required
   * when a `codespaceMode` is used.
   */
  codespaceContainer?: HTMLElement;
  /** Mode definitions — drives automatic element visibility CSS. */
  modes?: MorphicModeDefinition[];
  /**
   * Named per-view mode configurations. Validated at mount. When provided,
   * the initial modes are derived from `preset` (or the first preset).
   */
  presets?: MorphicPresetDefinition[];
  /** Name of the preset applied at mount. Defaults to the first preset. */
  preset?: string;
  /**
   * Called after a preset is applied — at mount and on every `applyPreset` —
   * so the host can lay out pane visibility (a view is shown iff its key is
   * present on the preset).
   */
  onPresetApplied?: (preset: MorphicPresetDefinition) => void;
  toolbox?: MorphicToolboxConfig;
  toolboxLayout?: MorphicToolboxLayout;
  /**
   * When true, Blockly is injected without a built-in toolbox.
   * Use this when calling `mountToolbox()` to avoid Blockly toolbox type conflicts.
   */
  canvasToolbox?: boolean;
  workspaceMode?: MorphicModeName;
  toolboxMode?: MorphicModeName;
  /**
   * Independent mode for the codespace. When set, the codespace renders the
   * source element of this mode instead of following `workspaceMode`.
   */
  codespaceMode?: MorphicModeName;
  /**
   * Mode for the preview editor. The preview renders the source element of
   * this mode. When unset, the preview falls back to the active workspace
   * mode's `preview` element (legacy behavior).
   */
  previewMode?: MorphicModeName;
  ui?: {
    workspaceClassName?: string | string[];
    toolboxClassName?: string | string[];
  };
  modeStyles?: MorphicModeStyle[];
  /**
   * Pass the result of `import.meta.glob('./modes/*.css', { eager: true, query: '?url' })`
   * (or `{ eager: true, as: 'url' }` for older Vite).
   * The framework derives mode names from CSS filenames and loads the stylesheets automatically.
   * Takes precedence over `modeStyles` for the same modes.
   */
  modesFolder?: Record<string, unknown>;
  baseStyle?: MorphicStyleBundle;
  blockly?: Blockly.BlocklyOptions;
  blocklyOptions?: Blockly.BlocklyOptions;
  javascript?: MorphicJavaScriptConfig;
  /**
   * Per-element highlight rules, keyed by element name. The codespace and
   * preview modes' source elements are used to look up entries here for
   * their editors. Optional — when absent, editors render plain text.
   */
  highlighting?: Record<string, MorphicHighlightDefinition>;
}

/**
 * Resolved workspace template for a block in a given mode.
 * The template comes from the block's "block" element (or first element as fallback).
 * Used internally by block-view and view-resolver.
 */
export interface MorphicResolvedView {
  mode: MorphicModeName;
  template: string;
  /** Element name the template came from. Used to look up per-element config (e.g. `empty` defaults). */
  elementName?: string;
  inputSlots?: Record<string, MorphicInputSlotDefinition>;
}

/** Line range a single block occupies in the generated code (1-based, inclusive). */
export interface MorphicCodeBlockPosition {
  startLine: number;
  endLine: number;
  /**
   * Character-offset range the block's rendered text occupies in the
   * generated code (0-based, half-open: `[startChar, endChar)`). Provides
   * inline precision so value children sharing a line (e.g. `1 + 2`) can
   * still be distinguished. Used by the codespace to resolve value-slot drops.
   */
  startChar?: number;
  endChar?: number;
  /**
   * True when the block's whole rendered text is a single editable cell
   * (atomic single-field block — `math_number`, `text`, `logic_boolean`, etc.).
   * Used by the codespace's hover background so it can prefer the surrounding
   * non-atomic wrapper (e.g. the whole `1 + 2` expression) instead of
   * highlighting just the atomic value the cursor lands on.
   */
  atomic?: boolean;
  /**
   * Body line range of each statement input declared on this block, keyed by
   * the input name. Includes empty bodies — the start/end line points to the
   * indented body line where children would render. Used by the codespace to
   * resolve drops into empty `for`/`if` bodies.
   */
  statementSlots?: Record<string, { startLine: number; endLine: number }>;
}

/** Maps Blockly block IDs to their positions in the generated code. */
export type MorphicCodeMetadata = Map<string, MorphicCodeBlockPosition>;

/**
 * Edit target for a placeholder range, when its content is an atomic
 * single-field block (shadow, placeholder, or user-attached value block with
 * exactly one field and no nested children). Empty-fallback ranges and
 * multi-field blocks have no `edit` and are not inline-editable.
 */
export interface MorphicPlaceholderEditTarget {
  /** Blockly block id whose field produced the rendered text. */
  blockId: string;
  /** Field name on that block. */
  fieldName: string;
  /** Input UI form to use for editing. */
  fieldType: "text" | "number" | "dropdown";
  /** Dropdown options as `[label, value]` pairs (only when `fieldType === "dropdown"`). */
  options?: [string, string][];
}

/**
 * Range in the generated code occupied by a value slot. The codespace overlays
 * an always-on underline on every value position; `kind: "default"` adds dim
 * italic styling for shadow targets and empty fallbacks (framework-supplied
 * defaults), while `kind: "set"` marks user-attached or placeholder content.
 */
export interface MorphicPlaceholderRange {
  /** Inclusive 0-based character offset in `code`. */
  start: number;
  /** Exclusive 0-based character offset in `code`. */
  end: number;
  kind: "default" | "set";
  /** Editing target when the slot contains an atomic single-field block. */
  edit?: MorphicPlaceholderEditTarget;
  /**
   * Set when the range is a *truly empty* value slot (rendered as a `[TYPE]`
   * marker, with no block in it). Identifies the parent block and input so the
   * codespace can resolve a drop into the empty slot — there's no child block
   * to walk up from, unlike an occupied or shadow-filled slot.
   */
  emptySlot?: { parentBlockId: string; inputName: string };
}

/** Result of `generateJavaScriptWithMetadata()`. */
export interface MorphicCodeGenerationResult {
  code: string;
  metadata: MorphicCodeMetadata;
  /** Value-slot ranges with default/set classification. Empty if no value slots emitted. */
  placeholders: MorphicPlaceholderRange[];
}

/** Theme configuration for the code editor. */
export interface MorphicCodeEditorTheme {
  /** Editor text size (e.g. "14px"). */
  fontSize?: string;
  /** Editor font family (e.g. "monospace"). */
  fontFamily?: string;
  /** Line spacing multiplier (e.g. 1.5). */
  lineHeight?: number;
  /** Editor background colour. */
  background?: string;
  /** Default text colour. */
  foreground?: string;
  /** Line number column background colour. */
  gutterBackground?: string;
  /** Line number text colour. */
  gutterForeground?: string;
  /** Text selection highlight colour. */
  selectionBackground?: string;
}

/** Options for `mountCodeEditor()`. */
export interface MorphicCodeEditorOptions {
  /** Visual theme — the framework provides sensible defaults. */
  theme?: MorphicCodeEditorTheme;
  /** Raw CodeMirror extensions for power users. Appended after the built-in ones. */
  extensions?: unknown[];
  /**
   * Called when the user requests to delete the block at a given 1-based line
   * (via Delete/Backspace on an empty selection, or a click on the gutter ✕).
   * When set, the editor installs a keymap and a delete gutter.
   */
  onDelete?: (line: number) => void;
  /**
   * If provided, a "grip" gutter (⋮⋮) appears on the start line of every block
   * id for which this returns `true`. Mousedown on the grip starts an HTML5
   * drag whose data transfer includes `morphic/block-id` set to the block id —
   * the host can then handle the drop (e.g. reorder).
   */
  canDragBlock?: (blockId: string) => boolean;
  /**
   * Token-level syntax highlighting rules. When set, the editor installs a
   * CodeMirror `ViewPlugin` that emits `Decoration.mark` ranges for keywords,
   * strings, numbers, and line comments per these rules. Swappable at runtime
   * via `setHighlightRules`.
   */
  highlightRules?: MorphicHighlightDefinition;
  /**
   * Called when the user commits an inline placeholder edit. The host should
   * write `newValue` to `edit.fieldName` on the Blockly block identified by
   * `edit.blockId`. Re-codegen + re-render then refresh the codespace.
   */
  onPlaceholderApply?: (edit: MorphicPlaceholderEditTarget, newValue: string) => void;
  /**
   * Whether value-slot underline markers are shown in this editor. The codespace
   * uses them as a form-field affordance for inline editing; read-only display
   * surfaces (e.g. the preview editor) should disable them. Default: `true`.
   */
  showPlaceholderMarkers?: boolean;
}

/** Options for `enableSelectionSync()`. */
export interface MorphicSelectionSyncOptions {
  /** CSS background colour for highlighted code lines. Defaults to a semi-transparent blue. */
  highlightColor?: string;
  /** Enable block → code direction. Defaults to true. */
  blockToCode?: boolean;
  /** Enable code → block direction. Defaults to true. */
  codeToBlock?: boolean;
}

/** Surface a toolbar binds to. Drives stateful items (undo enabled-state,
 * language label source, what "clear" affects). */
export type MorphicToolbarPane = "workspace" | "codespace" | "preview";

/** How items render their built-in icon + label pair. */
export type MorphicToolbarDisplay = "icon" | "label" | "both";

/**
 * Runtime context passed to every toolbar item callback. Items use this to
 * read pane state and request a re-render.
 */
export interface MorphicToolbarCtx {
  engine: import("./MorphicBlocks").MorphicBlocks;
  pane: MorphicToolbarPane;
  /** Current rendered text for the bound pane. Empty for workspace pane unless
   * the engine has a codespace/preview mounted to derive text from. */
  getText: () => string;
  /** Triggers the bound pane's re-render (codegen + redraw). */
  refresh: () => void;
}

/** Output of an item's render — string is treated as text content. */
export type MorphicToolbarRender = HTMLElement | string;

/**
 * One toolbar entry. Buttons supply `label` and/or `icon` plus `onClick`;
 * custom widgets supply `render`. `visible` is evaluated on every refresh.
 */
export interface MorphicToolbarItem {
  /** Stable id; reflected as `data-toolbar-id` for CSS targeting. */
  id: string;
  /** Lays out left of the spacer or right of it. Defaults to "left". */
  align?: "left" | "right";
  /** Plain-text label used in `label` / `both` display modes. */
  label?: string;
  /** Inline SVG string used in `icon` / `both` display modes. */
  icon?: string;
  /** Native `title` attribute / tooltip. */
  title?: string;
  /** Button click handler. Omit for non-interactive items (badges, labels). */
  onClick?: (ctx: MorphicToolbarCtx) => void;
  /** Optional predicate; item is omitted when this returns false on refresh. */
  visible?: (ctx: MorphicToolbarCtx) => boolean;
  /** Disable predicate; rendered with `disabled` and reduced opacity. */
  disabled?: (ctx: MorphicToolbarCtx) => boolean;
  /** Escape hatch — fully custom DOM. When set, label/icon/onClick are ignored. */
  render?: (ctx: MorphicToolbarCtx) => MorphicToolbarRender;
}

/** Configuration for `engine.mountToolbar(container, config)`. */
export interface MorphicToolbarConfig {
  /** Which pane this toolbar reflects. */
  pane: MorphicToolbarPane;
  /** Items to render. When omitted, the framework uses
   * `toolbarItems.defaultsFor(pane)`. To render no items, pass `[]`. */
  items?: MorphicToolbarItem[];
  /** Display mode for items that have both icon and label. Defaults to "icon". */
  display?: MorphicToolbarDisplay;
}
