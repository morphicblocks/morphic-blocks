import * as Blockly from "blockly";
import { getLifecycleBehavior } from "./behavior-runtime";
import { applyBlockView, applyRootModeClasses } from "./block-view";
import { generateJavaScriptFromWorkspace } from "./codegen";
import { collectAvailableModes, createDefinitionMap } from "./definitions";
import { MorphicStyleManager } from "./styles";
import { buildToolboxDefinition } from "./toolbox";
import { resolveBlockView } from "./view-resolver";
import type {
  MorphicBehaviorContext,
  MorphicBehaviorMap,
  MorphicBlockDefinition,
  MorphicModeName,
  MorphicMountConfig,
  MorphicRenderContext
} from "./types";

export class MorphicBlocks {
  private readonly definitions: Map<string, MorphicBlockDefinition>;
  private readonly behaviors: MorphicBehaviorMap;
  private readonly styles = new MorphicStyleManager();
  private readonly registeredBlockTypes = new Set<string>();

  private mountConfig?: MorphicMountConfig;
  private workspace?: Blockly.WorkspaceSvg;
  private flyoutWorkspace?: Blockly.WorkspaceSvg;
  private toolboxDefinition?: NonNullable<Blockly.BlocklyOptions["toolbox"]>;
  private appliedWorkspaceClasses: string[] = [];
  private appliedToolboxFlyoutClasses: string[] = [];
  private appliedToolboxShellClasses: string[] = [];

  public constructor(
    definitions: MorphicBlockDefinition[] | MorphicBlockDefinition,
    behaviors: MorphicBehaviorMap = {}
  ) {
    this.definitions = createDefinitionMap(definitions);
    this.behaviors = behaviors;
  }

  public mount(config: MorphicMountConfig): Blockly.WorkspaceSvg {
    this.dispose();
    this.mountConfig = { ...config };

    this.styles.validateModeCoverage(config.modeStyles ?? [], this.getAvailableModes());
    this.styles.ensureStyles(config.baseStyle, config.modeStyles ?? []);
    this.registerBlocks();
    this.toolboxDefinition = this.resolveToolboxDefinition(config);

    const blocklyOptions = config.blockly ?? config.blocklyOptions ?? {};

    this.workspace = Blockly.inject(config.workspaceContainer, {
      ...blocklyOptions,
      toolbox: this.toolboxDefinition
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
    this.appliedWorkspaceClasses = [];
    this.appliedToolboxFlyoutClasses = [];
    this.appliedToolboxShellClasses = [];
  }

  public getWorkspace(): Blockly.WorkspaceSvg | undefined {
    return this.workspace;
  }

  public getAvailableModes(): MorphicModeName[] {
    return collectAvailableModes(this.definitions.values());
  }

  public setModes(modes: { workspaceMode?: MorphicModeName; toolboxMode?: MorphicModeName }): void {
    if (!this.mountConfig || !this.workspace) {
      throw new Error("MorphicBlocks must be mounted before setModes can be used.");
    }

    if (modes.workspaceMode) {
      this.mountConfig.workspaceMode = modes.workspaceMode;
    }
    if (modes.toolboxMode) {
      this.mountConfig.toolboxMode = modes.toolboxMode;
    }

    this.applyWorkspaceContainerClass();
    this.refreshToolbox();
    this.bindFlyoutWorkspace();
    this.renderWorkspaceBlocks();
    this.renderFlyoutBlocks();
  }

  public generateJavaScript(): string {
    if (!this.workspace || !this.mountConfig) {
      throw new Error("MorphicBlocks must be mounted before generateJavaScript can be used.");
    }
    return generateJavaScriptFromWorkspace(
      this.workspace,
      this.definitions,
      this.behaviors,
      this.mountConfig.javascript
    );
  }

  private readonly onWorkspaceChange = (event: Blockly.Events.Abstract): void => {
    if (!this.workspace || !this.mountConfig) {
      return;
    }
    if (event.workspaceId !== this.workspace.id || event.type !== Blockly.Events.BLOCK_CREATE) {
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

      this.applyView(block, definition, this.mountConfig.workspaceMode, "workspace");
    }
  };

  private readonly onFlyoutChange = (event: Blockly.Events.Abstract): void => {
    if (!this.flyoutWorkspace || !this.mountConfig) {
      return;
    }
    if (event.workspaceId !== this.flyoutWorkspace.id || event.type !== Blockly.Events.BLOCK_CREATE) {
      return;
    }

    const blockCreateEvent = event as Blockly.Events.BlockCreate;
    for (const id of blockCreateEvent.ids ?? []) {
      const block = this.flyoutWorkspace.getBlockById(id) as Blockly.BlockSvg | null;
      if (!block) {
        continue;
      }

      const definition = this.definitions.get(block.type);
      if (!definition) {
        continue;
      }

      this.applyView(block, definition, this.mountConfig.toolboxMode, "toolbox");
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
          const context: MorphicRenderContext = this.workspace.isFlyout ? "toolbox" : "workspace";
          const mode = engine.resolveMode(context);
          engine.applyView(this, definition, mode, context);

          const lifecycleBehavior = getLifecycleBehavior(engine.behaviors[definition.identifier]);
          lifecycleBehavior?.init?.(this, engine.createBehaviorContext(this, definition, mode, context));
        }
      };

      this.registeredBlockTypes.add(definition.identifier);
    }
  }

  private resolveMode(context: MorphicRenderContext): MorphicModeName {
    if (!this.mountConfig) {
      return "default";
    }
    return context === "toolbox" ? this.mountConfig.toolboxMode : this.mountConfig.workspaceMode;
  }

  private applyView(
    block: Blockly.BlockSvg,
    definition: MorphicBlockDefinition,
    mode: MorphicModeName,
    context: MorphicRenderContext
  ): void {
    const view = resolveBlockView(definition, mode);
    applyBlockView({ block, definition, view, mode, context });

    const lifecycleBehavior = getLifecycleBehavior(this.behaviors[definition.identifier]);
    lifecycleBehavior?.onViewApplied?.(block, this.createBehaviorContext(block, definition, mode, context));
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
      "morphic-workspace-root"
    );
    const workspaceClasses = this.resolveClassNames(this.mountConfig.ui?.workspaceClassName);
    this.replaceUserClasses(container, this.appliedWorkspaceClasses, workspaceClasses);
    this.appliedWorkspaceClasses = workspaceClasses;
  }

  private applyFlyoutClass(): void {
    if (!this.workspace || !this.mountConfig) {
      return;
    }

    const toolboxClasses = this.resolveClassNames(this.mountConfig.ui?.toolboxClassName);

    const toolboxAny = this.workspace.getToolbox() as unknown as { getDiv?: () => Element | null } | null;
    const toolboxDiv = toolboxAny?.getDiv?.() ?? null;
    if (toolboxDiv) {
      applyRootModeClasses(toolboxDiv, this.mountConfig.toolboxMode, "toolbox", "morphic-toolbox-shell");
      this.replaceUserClasses(toolboxDiv, this.appliedToolboxShellClasses, toolboxClasses);
      this.appliedToolboxShellClasses = toolboxClasses;
    }

    const flyoutWorkspace = this.workspace.getFlyout()?.getWorkspace();
    const flyoutSvg = flyoutWorkspace?.getParentSvg();
    if (!flyoutSvg) {
      return;
    }

    applyRootModeClasses(flyoutSvg, this.mountConfig.toolboxMode, "toolbox", "morphic-toolbox-root");
    this.replaceUserClasses(flyoutSvg, this.appliedToolboxFlyoutClasses, toolboxClasses);
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
      this.applyView(svgBlock, definition, this.mountConfig.workspaceMode, "workspace");
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
      this.applyView(svgBlock, definition, this.mountConfig.toolboxMode, "toolbox");
    }

    this.applyFlyoutClass();
  }

  private refreshToolbox(): void {
    if (!this.workspace || !this.toolboxDefinition) {
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
    config: MorphicMountConfig
  ): NonNullable<Blockly.BlocklyOptions["toolbox"]> {
    if (config.toolbox) {
      const layoutKind = this.resolveToolboxKind(config.toolboxLayout);
      const toolboxConfig = layoutKind ? { ...config.toolbox, kind: layoutKind } : config.toolbox;
      return buildToolboxDefinition(toolboxConfig, this.definitions);
    }

    const blocklyOptions = config.blockly ?? config.blocklyOptions;
    if (blocklyOptions?.toolbox) {
      return blocklyOptions.toolbox;
    }

    const fallbackKind = this.resolveToolboxKind(config.toolboxLayout) ?? "flyoutToolbox";
    return buildToolboxDefinition(
      {
        kind: fallbackKind,
        blocks: [...this.definitions.keys()]
      },
      this.definitions
    );
  }

  private createBehaviorContext(
    block: Blockly.BlockSvg,
    definition: MorphicBlockDefinition,
    mode: MorphicModeName,
    context: MorphicRenderContext
  ): MorphicBehaviorContext {
    return {
      Blockly,
      workspace: block.workspace as Blockly.WorkspaceSvg,
      mode,
      context,
      definition
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
      .filter((name, index, all) => Boolean(name) && all.indexOf(name) === index);
  }

  private replaceUserClasses(root: Element, previous: string[], next: string[]): void {
    for (const className of previous) {
      root.classList.remove(className);
    }
    for (const className of next) {
      root.classList.add(className);
    }
  }

  private resolveToolboxKind(layout?: MorphicMountConfig["toolboxLayout"]): MorphicBlocklyKind | undefined {
    if (!layout) {
      return undefined;
    }
    return layout === "category" ? "categoryToolbox" : "flyoutToolbox";
  }
}

type MorphicBlocklyKind = "flyoutToolbox" | "categoryToolbox";
