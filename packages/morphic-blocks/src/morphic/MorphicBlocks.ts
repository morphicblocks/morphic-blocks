import * as Blockly from "blockly";
import { getLifecycleBehavior } from "./behavior-runtime";
import {
  applyBlockCategoryClass,
  applyBlockView,
  applyBlockIdentifierClass,
  applyBlockColorFromCSS,
  applyRootModeClasses,
  captureFieldValues,
  restoreFieldValues,
} from "./block-view";
import { generateJavaScriptFromWorkspace, generateJavaScriptWithMetadataFromWorkspace } from "./codegen";
import { collectAvailableModes, createDefinitionMap } from "./definitions";
import { MorphicStyleManager } from "./styles";
import { toModeClassToken } from "./template";
import { MorphicToolboxCanvas } from "./toolbox-canvas";
import { buildToolboxDefinition } from "./toolbox";
import { resolveBlockView } from "./view-resolver";
import type {
  MorphicBehaviorContext,
  MorphicBehaviorMap,
  MorphicBlockDefinition,
  MorphicCodeGenerationResult,
  MorphicElementType,
  MorphicModeName,
  MorphicModeStyle,
  MorphicMountConfig,
  MorphicRenderContext,
  MorphicToolboxCanvasOptions,
} from "./types";

/**
 * Parses a Vite `import.meta.glob` result for a CSS folder into MorphicModeStyle entries.
 * Handles both `{ eager: true, as: 'url' }` (string values) and
 * `{ eager: true, query: '?url' }` ({ default: string } values).
 */
function parseModeStylesFromFolder(
  folder: Record<string, unknown>,
): MorphicModeStyle[] {
  return Object.entries(folder)
    .map(([path, value]) => {
      const filename = path.split("/").pop() ?? path;
      const mode = filename.replace(/\.css$/i, "");
      const href =
        typeof value === "string"
          ? value
          : typeof value === "object" && value !== null && "default" in value
            ? String((value as Record<string, unknown>)["default"])
            : undefined;
      return { mode, href };
    })
    .filter((s): s is { mode: string; href: string } => Boolean(s.href))
    .map((s): MorphicModeStyle => s);
}

/** Internal resolved config: workspaceMode and toolboxMode are guaranteed non-optional. */
type MorphicResolvedMountConfig = Omit<
  MorphicMountConfig,
  "workspaceMode" | "toolboxMode"
> & {
  workspaceMode: MorphicModeName;
  toolboxMode: MorphicModeName;
};

export class MorphicBlocks {
  private readonly definitions: Map<string, MorphicBlockDefinition>;
  private readonly behaviors: MorphicBehaviorMap;
  private readonly elementTypes: Record<string, MorphicElementType>;
  private readonly styles = new MorphicStyleManager();
  private readonly registeredBlockTypes = new Set<string>();

  private mountConfig?: MorphicResolvedMountConfig;
  private workspace?: Blockly.WorkspaceSvg;
  private flyoutWorkspace?: Blockly.WorkspaceSvg;
  private toolboxCanvas?: MorphicToolboxCanvas;
  private toolboxDefinition?: NonNullable<Blockly.BlocklyOptions["toolbox"]>;
  private blockCategoryIndex = new Map<string, MorphicBlockCategoryMeta>();
  private appliedWorkspaceClasses: string[] = [];
  private appliedToolboxFlyoutClasses: string[] = [];
  private appliedToolboxShellClasses: string[] = [];

  public constructor(
    definitions: MorphicBlockDefinition[] | MorphicBlockDefinition,
    behaviors: MorphicBehaviorMap = {},
    elementTypes: Record<string, MorphicElementType> = {},
  ) {
    this.definitions = createDefinitionMap(definitions);
    this.behaviors = behaviors;
    this.elementTypes = elementTypes;
  }

  public mount(config: MorphicMountConfig): Blockly.WorkspaceSvg {
    this.dispose();

    // Derive modeStyles from modesFolder (Vite glob) when provided
    const folderStyles = config.modesFolder
      ? parseModeStylesFromFolder(config.modesFolder as Record<string, unknown>)
      : [];
    const mergedModeStyles = [
      ...folderStyles,
      ...(config.modeStyles ?? []).filter(
        (s) => !folderStyles.some((f) => f.mode === s.mode),
      ),
    ];

    // Resolve default modes: fallback to first discovered mode or "default"
    const availableModeNames = mergedModeStyles.map((s) => s.mode);
    const defaultMode =
      availableModeNames[0] ?? this.getAvailableModes()[0] ?? "default";
    const resolvedConfig: MorphicResolvedMountConfig = {
      ...config,
      modeStyles: mergedModeStyles,
      workspaceMode: config.workspaceMode ?? defaultMode,
      toolboxMode: config.toolboxMode ?? defaultMode,
    };

    this.mountConfig = resolvedConfig;

    this.styles.validateModeCoverage(
      mergedModeStyles,
      this.getAvailableModes(),
    );
    if (resolvedConfig.modes?.length) {
      this.styles.ensureModeVisibilityStyles(resolvedConfig.modes);
    }
    this.styles.ensureStyles(resolvedConfig.baseStyle, mergedModeStyles);
    this.blockCategoryIndex = this.createCategoryIndex(
      resolvedConfig.toolbox,
      resolvedConfig,
    );
    this.styles.ensureCategoryStyles(resolvedConfig.toolbox?.categories ?? []);
    this.registerBlocks();
    this.toolboxDefinition = this.resolveToolboxDefinition(resolvedConfig);

    const blocklyOptions =
      resolvedConfig.blockly ?? resolvedConfig.blocklyOptions ?? {};

    this.workspace = Blockly.inject(resolvedConfig.workspaceContainer, {
      ...blocklyOptions,
      ...(resolvedConfig.canvasToolbox ? {} : { toolbox: this.toolboxDefinition }),
    });
    this.workspace.addChangeListener(this.onWorkspaceChange);

    this.applyWorkspaceContainerClass();
    this.refreshToolbox();
    this.bindFlyoutWorkspace();
    this.renderWorkspaceBlocks();
    this.renderFlyoutBlocks();

    return this.workspace;
  }

  public dispose(): void {
    this.toolboxCanvas?.dispose();
    this.toolboxCanvas = undefined;

    if (this.flyoutWorkspace) {
      this.flyoutWorkspace.removeChangeListener(this.onFlyoutChange);
      this.flyoutWorkspace = undefined;
    }

    if (this.workspace) {
      this.workspace.removeChangeListener(this.onWorkspaceChange);
      this.workspace.dispose();
      this.workspace = undefined;
    }

    this.mountConfig = undefined;
    this.toolboxDefinition = undefined;
    this.blockCategoryIndex.clear();
    this.appliedWorkspaceClasses = [];
    this.appliedToolboxFlyoutClasses = [];
    this.appliedToolboxShellClasses = [];
  }

  public mountToolbox(
    container: HTMLElement,
    options?: MorphicToolboxCanvasOptions,
  ): void {
    if (!this.workspace || !this.mountConfig) {
      throw new Error(
        "MorphicBlocks must be mounted before mountToolbox can be used.",
      );
    }

    this.toolboxCanvas?.dispose();

    // Empty Blockly's built-in flyout so it doesn't compete with the custom canvas.
    // Skip when canvasToolbox is true — Blockly was injected without any toolbox.
    if (!this.mountConfig.canvasToolbox) {
      this.workspace.updateToolbox({ kind: "flyoutToolbox", contents: [] });
    }

    this.toolboxCanvas = new MorphicToolboxCanvas({
      container,
      workspaceContainer: this.mountConfig.workspaceContainer,
      workspace: this.workspace,
      definitions: this.definitions,
      blockColors: this.buildBlockColorMap(),
      behaviors: this.behaviors,
      elementTypes: this.elementTypes,
      mode: this.mountConfig.toolboxMode,
      modes: this.mountConfig.modes,
      options,
    });
  }

  public getWorkspace(): Blockly.WorkspaceSvg | undefined {
    return this.workspace;
  }

  public getAvailableModes(): MorphicModeName[] {
    return collectAvailableModes(this.definitions.values());
  }

  public setModes(modes: {
    workspaceMode?: MorphicModeName;
    toolboxMode?: MorphicModeName;
  }): void {
    if (!this.mountConfig || !this.workspace) {
      throw new Error(
        "MorphicBlocks must be mounted before setModes can be used.",
      );
    }

    if (modes.workspaceMode) {
      this.mountConfig.workspaceMode = modes.workspaceMode;
    }
    if (modes.toolboxMode) {
      this.mountConfig.toolboxMode = modes.toolboxMode;
      this.toolboxCanvas?.rerender(this.mountConfig.toolboxMode);
    }

    this.applyWorkspaceContainerClass();
    this.refreshToolbox();
    this.bindFlyoutWorkspace();
    this.renderWorkspaceBlocks();
    this.renderFlyoutBlocks();
  }

  public generateJavaScript(): string {
    if (!this.workspace || !this.mountConfig) {
      throw new Error(
        "MorphicBlocks must be mounted before generateJavaScript can be used.",
      );
    }
    return generateJavaScriptFromWorkspace(
      this.workspace,
      this.definitions,
      this.behaviors,
      this.mountConfig.javascript,
    );
  }

  public generateJavaScriptWithMetadata(): MorphicCodeGenerationResult {
    if (!this.workspace || !this.mountConfig) {
      throw new Error(
        "MorphicBlocks must be mounted before generateJavaScriptWithMetadata can be used.",
      );
    }
    return generateJavaScriptWithMetadataFromWorkspace(
      this.workspace,
      this.definitions,
      this.behaviors,
      this.mountConfig.javascript,
    );
  }

  private readonly onWorkspaceChange = (
    event: Blockly.Events.Abstract,
  ): void => {
    if (!this.workspace || !this.mountConfig) {
      return;
    }
    if (
      event.workspaceId !== this.workspace.id ||
      event.type !== Blockly.Events.BLOCK_CREATE
    ) {
      return;
    }

    const blockCreateEvent = event as Blockly.Events.BlockCreate;
    for (const id of blockCreateEvent.ids ?? []) {
      const block = this.workspace.getBlockById(id) as Blockly.BlockSvg | null;
      if (!block) {
        continue;
      }

      const definition = this.definitions.get(block.type);
      if (!definition) {
        continue;
      }

      this.applyView(
        block,
        definition,
        this.mountConfig.workspaceMode,
        "workspace",
      );
      if (!block.getSvgRoot()) {
        this.deferApplyView(id, this.mountConfig.workspaceMode, "workspace");
      }
    }
  };

  private readonly onFlyoutChange = (event: Blockly.Events.Abstract): void => {
    if (!this.flyoutWorkspace || !this.mountConfig) {
      return;
    }
    if (
      event.workspaceId !== this.flyoutWorkspace.id ||
      event.type !== Blockly.Events.BLOCK_CREATE
    ) {
      return;
    }

    const blockCreateEvent = event as Blockly.Events.BlockCreate;
    for (const id of blockCreateEvent.ids ?? []) {
      const block = this.flyoutWorkspace.getBlockById(
        id,
      ) as Blockly.BlockSvg | null;
      if (!block) {
        continue;
      }

      const definition = this.definitions.get(block.type);
      if (!definition) {
        continue;
      }

      this.applyView(
        block,
        definition,
        this.mountConfig.toolboxMode,
        "toolbox",
      );
      if (!block.getSvgRoot()) {
        this.deferApplyView(id, this.mountConfig.toolboxMode, "toolbox");
      }
    }
  };

  private registerBlocks(): void {
    for (const definition of this.definitions.values()) {
      if (this.registeredBlockTypes.has(definition.identifier)) {
        continue;
      }

      const engine = this;
      Blockly.Blocks[definition.identifier] = {
        init(this: Blockly.BlockSvg) {
          const context: MorphicRenderContext = this.workspace.isFlyout
            ? "toolbox"
            : "workspace";
          const mode = engine.resolveMode(context);
          engine.applyView(this, definition, mode, context);

          const lifecycleBehavior = getLifecycleBehavior(
            engine.behaviors[definition.identifier],
          );
          lifecycleBehavior?.init?.(
            this,
            engine.createBehaviorContext(this, definition, mode, context),
          );
        },
      };

      this.registeredBlockTypes.add(definition.identifier);
    }
  }

  private resolveMode(context: MorphicRenderContext): MorphicModeName {
    if (!this.mountConfig) {
      return "default";
    }
    return context === "toolbox"
      ? this.mountConfig.toolboxMode
      : this.mountConfig.workspaceMode;
  }

  private applyView(
    block: Blockly.BlockSvg,
    definition: MorphicBlockDefinition,
    mode: MorphicModeName,
    context: MorphicRenderContext,
  ): void {
    const category = this.blockCategoryIndex.get(definition.identifier);

    // Apply category colour before applyBlockView so the internal render() uses it.
    // Only used when the definition has no explicit colour of its own.
    if (definition.color === undefined && category?.colour !== undefined) {
      block.setColour(category.colour);
    }

    // Preserve user-added field values (dropdowns, text inputs, etc.) across re-renders
    const savedFieldValues = captureFieldValues(block);

    const view = resolveBlockView(definition, mode, this.elementTypes, this.mountConfig?.modes ?? []);
    applyBlockView({ block, definition, view, mode, context });
    applyBlockCategoryClass(block, category?.token);

    // Stamp the stable per-block identifier class so mode CSS can target it
    applyBlockIdentifierClass(block, definition.identifier);

    // Let CSS custom property --morphic-block-color override any programmatic colour.
    // This runs after all classes are applied so computed style reflects the cascade.
    applyBlockColorFromCSS(block);

    const lifecycleBehavior = getLifecycleBehavior(
      this.behaviors[definition.identifier],
    );
    lifecycleBehavior?.onViewApplied?.(
      block,
      this.createBehaviorContext(block, definition, mode, context),
    );

    // Restore field values after onViewApplied has recreated the fields
    restoreFieldValues(block, savedFieldValues);
  }

  private applyWorkspaceContainerClass(): void {
    if (!this.mountConfig) {
      return;
    }

    const container = this.mountConfig.workspaceContainer;
    applyRootModeClasses(
      container,
      this.mountConfig.workspaceMode,
      "workspace",
      "morphic-workspace-root",
    );
    const workspaceClasses = this.resolveClassNames(
      this.mountConfig.ui?.workspaceClassName,
    );
    this.replaceUserClasses(
      container,
      this.appliedWorkspaceClasses,
      workspaceClasses,
    );
    this.appliedWorkspaceClasses = workspaceClasses;
  }

  private applyFlyoutClass(): void {
    if (!this.workspace || !this.mountConfig) {
      return;
    }

    const toolboxClasses = this.resolveClassNames(
      this.mountConfig.ui?.toolboxClassName,
    );

    const toolboxAny = this.workspace.getToolbox() as unknown as {
      getDiv?: () => Element | null;
    } | null;
    const toolboxDiv = toolboxAny?.getDiv?.() ?? null;
    if (toolboxDiv) {
      applyRootModeClasses(
        toolboxDiv,
        this.mountConfig.toolboxMode,
        "toolbox",
        "morphic-toolbox-shell",
      );
      this.replaceUserClasses(
        toolboxDiv,
        this.appliedToolboxShellClasses,
        toolboxClasses,
      );
      this.appliedToolboxShellClasses = toolboxClasses;
    }

    const flyoutWorkspace = this.workspace.getFlyout()?.getWorkspace();
    const flyoutSvg = flyoutWorkspace?.getParentSvg();
    if (!flyoutSvg) {
      return;
    }

    applyRootModeClasses(
      flyoutSvg,
      this.mountConfig.toolboxMode,
      "toolbox",
      "morphic-toolbox-root",
    );
    this.replaceUserClasses(
      flyoutSvg,
      this.appliedToolboxFlyoutClasses,
      toolboxClasses,
    );
    this.appliedToolboxFlyoutClasses = toolboxClasses;
  }

  private renderWorkspaceBlocks(): void {
    if (!this.workspace || !this.mountConfig) {
      return;
    }

    for (const block of this.workspace.getAllBlocks(false)) {
      const svgBlock = block as Blockly.BlockSvg;
      const definition = this.definitions.get(svgBlock.type);
      if (!definition) {
        continue;
      }
      this.applyView(
        svgBlock,
        definition,
        this.mountConfig.workspaceMode,
        "workspace",
      );
    }
  }

  private renderFlyoutBlocks(): void {
    if (!this.flyoutWorkspace || !this.mountConfig) {
      return;
    }

    for (const block of this.flyoutWorkspace.getAllBlocks(false)) {
      const svgBlock = block as Blockly.BlockSvg;
      const definition = this.definitions.get(svgBlock.type);
      if (!definition) {
        continue;
      }
      this.applyView(
        svgBlock,
        definition,
        this.mountConfig.toolboxMode,
        "toolbox",
      );
    }

    this.applyFlyoutClass();
  }

  private refreshToolbox(): void {
    if (!this.workspace || !this.toolboxDefinition || this.mountConfig?.canvasToolbox) {
      return;
    }
    this.workspace.updateToolbox(this.toolboxDefinition);
  }

  private bindFlyoutWorkspace(): void {
    if (this.flyoutWorkspace) {
      this.flyoutWorkspace.removeChangeListener(this.onFlyoutChange);
      this.flyoutWorkspace = undefined;
    }

    if (!this.workspace) {
      return;
    }

    const flyoutWorkspace = this.workspace.getFlyout()?.getWorkspace();
    if (!flyoutWorkspace) {
      return;
    }

    this.flyoutWorkspace = flyoutWorkspace;
    this.flyoutWorkspace.addChangeListener(this.onFlyoutChange);
    this.applyFlyoutClass();
  }

  private resolveToolboxDefinition(
    config: MorphicMountConfig,
  ): NonNullable<Blockly.BlocklyOptions["toolbox"]> {
    if (config.toolbox) {
      const layoutKind = this.resolveToolboxKind(config.toolboxLayout);
      const toolboxConfig = layoutKind
        ? { ...config.toolbox, kind: layoutKind }
        : config.toolbox;
      return buildToolboxDefinition(toolboxConfig, this.definitions);
    }

    const blocklyOptions = config.blockly ?? config.blocklyOptions;
    if (blocklyOptions?.toolbox) {
      return blocklyOptions.toolbox;
    }

    const fallbackKind = this.resolveToolboxKind(config.toolboxLayout);
    return buildToolboxDefinition(
      {
        ...(fallbackKind !== undefined ? { kind: fallbackKind } : {}),
        blocks: [...this.definitions.keys()],
      },
      this.definitions,
    );
  }

  private createBehaviorContext(
    block: Blockly.BlockSvg,
    definition: MorphicBlockDefinition,
    mode: MorphicModeName,
    context: MorphicRenderContext,
  ): MorphicBehaviorContext {
    return {
      Blockly,
      workspace: block.workspace as Blockly.WorkspaceSvg,
      mode,
      context,
      definition,
    };
  }

  private resolveClassNames(input?: string | string[]): string[] {
    if (!input) {
      return [];
    }
    const source = Array.isArray(input) ? input.join(" ") : input;
    return source
      .split(/\s+/)
      .map((name) => name.trim())
      .filter(
        (name, index, all) => Boolean(name) && all.indexOf(name) === index,
      );
  }

  private replaceUserClasses(
    root: Element,
    previous: string[],
    next: string[],
  ): void {
    for (const className of previous) {
      root.classList.remove(className);
    }
    for (const className of next) {
      root.classList.add(className);
    }
  }

  private buildBlockColorMap(): Map<string, string> {
    const colorMap = new Map<string, string>();
    for (const [id, def] of this.definitions) {
      const color = def.color ?? this.blockCategoryIndex.get(id)?.colour;
      if (color !== undefined) {
        colorMap.set(id, String(color));
      }
    }
    return colorMap;
  }

  private resolveToolboxKind(
    layout?: MorphicMountConfig["toolboxLayout"],
  ): MorphicBlocklyKind | undefined {
    if (!layout) {
      return undefined;
    }
    return layout === "category" ? "categoryToolbox" : "flyoutToolbox";
  }

  private createCategoryIndex(
    toolbox?: MorphicMountConfig["toolbox"],
    config?: MorphicMountConfig,
  ): Map<string, MorphicBlockCategoryMeta> {
    const index = new Map<string, MorphicBlockCategoryMeta>();

    const categories = toolbox?.categories ?? [];

    // Build a lookup map from category name → meta for quick access
    const categoryMetaByName = new Map<string, MorphicBlockCategoryMeta>();
    for (const category of categories) {
      const token = toModeClassToken(category.name);
      categoryMetaByName.set(category.name.toLowerCase(), {
        token,
        colour: category.colour,
      });

      // Index blocks from explicit `category.blocks` list if provided
      if (category.blocks) {
        for (const type of category.blocks) {
          if (!index.has(type)) {
            index.set(type, { token, colour: category.colour });
          }
        }
      }
    }

    // Also index any block definition that uses the `category` string field
    const definitions = config
      ? this.definitions
      : new Map<string, MorphicBlockDefinition>();
    for (const def of definitions.values()) {
      if (!def.category || index.has(def.identifier)) {
        continue;
      }
      const meta = categoryMetaByName.get(def.category.toLowerCase());
      if (meta) {
        index.set(def.identifier, meta);
      }
    }

    return index;
  }

  private deferApplyView(
    blockId: string,
    mode: MorphicModeName,
    context: MorphicRenderContext,
  ): void {
    const workspace =
      context === "toolbox" ? this.flyoutWorkspace : this.workspace;
    if (!workspace) {
      return;
    }

    requestAnimationFrame(() => {
      const block = workspace.getBlockById(blockId) as Blockly.BlockSvg | null;
      if (!block) {
        return;
      }

      const definition = this.definitions.get(block.type);
      if (!definition) {
        return;
      }

      this.applyView(block, definition, mode, context);
    });
  }
}

type MorphicBlocklyKind = "flyoutToolbox" | "categoryToolbox";

interface MorphicBlockCategoryMeta {
  token: string;
  colour?: string;
}
