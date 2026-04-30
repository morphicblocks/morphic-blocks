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
   * check name). Slots without a matching key get no default — the
   * codespace renders the marker (`___`) and the workspace shows an empty
   * socket. Per-slot overrides via `inputSlots[i].default` take priority.
   */
  empty?: Record<string, MorphicEmptyDefaultConfig>;
}

/** Either a bare type or a config object with extras. */
export type MorphicElementTypeEntry = MorphicElementType | MorphicElementTypeConfig;
export type MorphicConnectionSpec = boolean | string | string[];
export type MorphicInputKind = "value" | "statement" | "dummy";
export type MorphicInputAlign = "left" | "centre" | "right";

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

/** How a mode is presented on screen. Defaults to "workspace" when omitted. */
export type MorphicPresentation = "workspace" | "codespace";

/**
 * Declares which elements are visible for a given mode.
 * CSS (one file per mode) controls how those elements look.
 */
export interface MorphicModeDefinition {
  name: string;
  /** Element names that are visible in this mode (e.g. ["icon", "text"]). */
  elements: string[];
  /**
   * How this mode is presented:
   * - "workspace" (default): Blockly block workspace
   * - "codespace": text editor that replaces the workspace
   */
  presentation?: MorphicPresentation;
  /**
   * Name of the element (must be type "code") used as the primary source.
   * - In workspace modes: used as the Blockly template; wins over auto-detection when set.
   * - In codespace modes: used as the text rendered in the codespace. Required.
   */
  primarySource?: string;
  /**
   * Name of the element (must be type "code") used as the preview editor source
   * (read-only). Optional; applies to both workspace and codespace modes.
   */
  preview?: string;
  /**
   * Optional per-element override for how tile elements render in the toolbox.
   * Keys are element names; values are "block" (Blockly SVG preview) or "text"
   * (HTML text). Applies only to elements of type "code". Defaults to "block".
   */
  tileRender?: Record<string, "block" | "text">;
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
 * (e.g. "python", "javascript", "concept") so a mode's `primarySource` /
 * `preview` already names the language — no separate `language` field is
 * needed on modes.
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
  /**
   * Global element type registry.
   * Maps each element name to either a bare type ("text" | "code" | "image")
   * or a config object (`{ type, empty? }`). Declared once here; per-block
   * elements remain plain name→content strings.
   */
  elementTypes?: Record<string, MorphicElementTypeEntry>;
  /** Explicit mode definitions — which elements are visible per mode. */
  modes?: MorphicModeDefinition[];
  /**
   * Per-element highlight rules, keyed by element name. The active mode's
   * `primarySource` and `preview` element names look up entries here for the
   * codespace and preview editors respectively.
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
  colour?: string;
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
   * Container for the primary text editor (codespace). Optional — required when
   * the initial `workspaceMode` uses `presentation: "codespace"`.
   */
  codespaceContainer?: HTMLElement;
  /** Mode definitions — drives automatic element visibility CSS. */
  modes?: MorphicModeDefinition[];
  toolbox?: MorphicToolboxConfig;
  toolboxLayout?: MorphicToolboxLayout;
  /**
   * When true, Blockly is injected without a built-in toolbox.
   * Use this when calling `mountToolbox()` to avoid Blockly toolbox type conflicts.
   */
  canvasToolbox?: boolean;
  workspaceMode?: MorphicModeName;
  toolboxMode?: MorphicModeName;
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
   * Per-element highlight rules, keyed by element name. The active mode's
   * `primarySource` and `preview` element names are used to look up entries
   * here for the codespace and preview editors. Optional — when absent,
   * editors render plain text.
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
   * Body line range of each statement input declared on this block, keyed by
   * the input name. Includes empty bodies — the start/end line points to the
   * indented body line where children would render. Used by the codespace to
   * resolve drops into empty `for`/`if` bodies.
   */
  statementSlots?: Record<string, { startLine: number; endLine: number }>;
}

/** Maps Blockly block IDs to their positions in the generated code. */
export type MorphicCodeMetadata = Map<string, MorphicCodeBlockPosition>;

/** Result of `generateJavaScriptWithMetadata()`. */
export interface MorphicCodeGenerationResult {
  code: string;
  metadata: MorphicCodeMetadata;
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
