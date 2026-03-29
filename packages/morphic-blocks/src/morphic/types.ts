import type * as Blockly from "blockly";

export type MorphicModeName = string;

/**
 * The rendering type of a named element.
 * - "text"  — rendered as an HTML label; never shown in the workspace
 * - "block" — rendered as a Blockly block template; <img> in content becomes FieldImage
 * - "image" — rendered as an <img> in the toolbox tile; never shown in the workspace
 */
export type MorphicElementType = "text" | "block" | "image";
export type MorphicConnectionSpec = boolean | string | string[];
export type MorphicInputKind = "value" | "statement" | "dummy";
export type MorphicInputAlign = "left" | "centre" | "right";

export interface MorphicInputSlotDefinition {
  kind?: MorphicInputKind;
  name?: string;
  check?: string | string[];
  align?: MorphicInputAlign;
  label?: string;
}

/**
 * Named visual parts of a Morphic Block.
 * Keys are element names (e.g. "icon", "block", "code", "text") — free-form, not enforced.
 * Values are template strings (same syntax as before: %1 placeholders, <img> tags, plain text).
 * The "block" element is used as the Blockly workspace template.
 */
export type MorphicBlockElements = Record<string, string>;

/**
 * Declares which elements are visible for a given mode.
 * CSS (one file per mode) controls how those elements look.
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

/** Top-level format for a definitions JSON file. */
export interface MorphicBlocksFormat {
  /**
   * Global element type registry.
   * Maps each element name to its type ("text", "block", or "image").
   * Declared once here; per-block elements remain plain name→content strings.
   */
  elementTypes?: Record<string, MorphicElementType>;
  /** Explicit mode definitions — which elements are visible per mode. */
  modes?: MorphicModeDefinition[];
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
  workspaceContainer: HTMLElement;
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
}

/**
 * Resolved workspace template for a block in a given mode.
 * The template comes from the block's "block" element (or first element as fallback).
 * Used internally by block-view and view-resolver.
 */
export interface MorphicResolvedView {
  mode: MorphicModeName;
  template: string;
  inputSlots?: Record<string, MorphicInputSlotDefinition>;
}

/** Line range a single block occupies in the generated code (1-based, inclusive). */
export interface MorphicCodeBlockPosition {
  startLine: number;
  endLine: number;
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
}
