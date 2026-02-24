import type * as Blockly from "blockly";

export type MorphicModeName = string;
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

export interface MorphicViewObject {
  template: string;
  inputSlots?: Record<string, MorphicInputSlotDefinition>;
}

export type MorphicViewDefinition = string | MorphicViewObject;

export interface MorphicBlockDefinition {
  identifier: string;
  views: Record<MorphicModeName, MorphicViewDefinition>;
  inputSlots?: Record<string, MorphicInputSlotDefinition>;
  color?: number | string;
  output?: MorphicConnectionSpec;
  previousStatement?: MorphicConnectionSpec;
  nextStatement?: MorphicConnectionSpec;
  inputsInline?: boolean;
  tooltip?: string;
  helpUrl?: string;
  /** Category name this block belongs to (used when categories are defined without explicit block lists). */
  category?: string;
}

/** Top-level format for a blocks JSON file, with categories declared separately. */
export interface MorphicBlocksFormat {
  categoryDefinitions: MorphicToolboxCategory[];
  /** Array of block definitions. Renamed from `blocks` to `blockDefinitions` for clarity. */
  blockDefinitions: MorphicBlockDefinition[];
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

export interface MorphicJavaScriptConfig {
  statementPrefix?: string | null;
  statementSuffix?: string | null;
  infiniteLoopTrap?: string | null;
  reservedWords?: string;
}

export interface MorphicMountConfig {
  workspaceContainer: HTMLElement;
  toolbox?: MorphicToolboxConfig;
  toolboxLayout?: MorphicToolboxLayout;
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

export interface MorphicResolvedView {
  mode: MorphicModeName;
  template: string;
  inputSlots?: Record<string, MorphicInputSlotDefinition>;
}
