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
import { BLOCK_ID_DRAG_KEY, MorphicCodeEditor, getActiveGripDragSourceId, setActiveGripDragSourceId } from "./code-editor";
import { resolveBlocklyType, toBlocklyType, toCleanId } from "./block-namespace";
import { generateJavaScriptFromWorkspace, generateJavaScriptWithMetadataFromWorkspace } from "./codegen";
import { generateTextFromWorkspace } from "./template-codegen";
import { MorphicSelectionSync } from "./selection-sync";
import { createDefinitionMap } from "./definitions";
import { MorphicStyleManager } from "./styles";
import { toModeClassToken } from "./template";
import { DRAG_DATA_KEY, MorphicToolboxCanvas } from "./toolbox-canvas";
import { buildToolboxDefinition } from "./toolbox";
import { resolveBlockView, resolveModeSourceElement } from "./view-resolver";
import { renderToolbar, type MorphicToolbarHandle } from "./toolbar";
import type {
  MorphicBehaviorContext,
  MorphicBehaviorMap,
  MorphicBlockDefinition,
  MorphicCodeBlockPosition,
  MorphicCodeEditorOptions,
  MorphicCodeEditorTheme,
  MorphicCodeGenerationResult,
  MorphicElementTypeEntry,
  MorphicHighlightDefinition,
  MorphicModeDefinition,
  MorphicModeName,
  MorphicModeStyle,
  MorphicMountConfig,
  MorphicPlaceholderEditTarget,
  MorphicPresetDefinition,
  MorphicPresetToolbox,
  MorphicRenderContext,
  MorphicSelectionSyncOptions,
  MorphicToolbarConfig,
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

/** Internal resolved config: workspaceMode, toolboxMode and workspaceHost are guaranteed non-optional. */
type MorphicResolvedMountConfig = Omit<
  MorphicMountConfig,
  "workspaceMode" | "toolboxMode"
> & {
  workspaceMode: MorphicModeName;
  toolboxMode: MorphicModeName;
  /** Per-element block/text override for toolbox tiles (from the active preset's toolbox entry). */
  toolboxRender?: Record<string, "block" | "text">;
  /** The element Blockly was injected into — either the user's workspaceContainer or an internal headless host. */
  workspaceHost: HTMLElement;
};

/** Normalize a preset's toolbox (string or object) to a mode + optional render map. */
function normalizePresetToolbox(toolbox: MorphicPresetToolbox): {
  mode: MorphicModeName;
  render?: Record<string, "block" | "text">;
} {
  return typeof toolbox === "string"
    ? { mode: toolbox }
    : { mode: toolbox.mode, render: toolbox.render };
}

export class MorphicBlocks extends EventTarget {
  private readonly definitions: Map<string, MorphicBlockDefinition>;
  private readonly behaviors: MorphicBehaviorMap;
  private readonly elementTypes: Record<string, MorphicElementTypeEntry>;
  private readonly styles = new MorphicStyleManager();
  private readonly registeredBlockTypes = new Set<string>();
  private readonly toolbars = new Set<MorphicToolbarHandle>();
  /** Blockly events listener installed when the first toolbar mounts. */
  private toolbarsBlocklyListener?: (e: Blockly.Events.Abstract) => void;
  /** Latest internal clipboard contents — set by `copyActiveBlock`, used by `pasteActiveBlock`. */
  private lastCopyData?: ReturnType<Blockly.BlockSvg["toCopyData"]>;

  private mountConfig?: MorphicResolvedMountConfig;
  private workspace?: Blockly.WorkspaceSvg;
  private flyoutWorkspace?: Blockly.WorkspaceSvg;
  private toolboxCanvas?: MorphicToolboxCanvas;
  private codeEditor?: MorphicCodeEditor;
  private codespace?: MorphicCodeEditor;
  private previewEditor?: MorphicCodeEditor;
  private selectionSync?: MorphicSelectionSync;
  private toolboxDefinition?: NonNullable<Blockly.BlocklyOptions["toolbox"]>;
  private blockCategoryIndex = new Map<string, MorphicBlockCategoryMeta>();
  private appliedWorkspaceClasses: string[] = [];
  private appliedToolboxFlyoutClasses: string[] = [];
  private appliedToolboxShellClasses: string[] = [];
  /** Offscreen div created when no user-supplied workspaceContainer is present. */
  private headlessWorkspaceHost?: HTMLElement;
  /** Teardown fn for codespace drag/drop listeners; set when codespace is mounted. */
  private codespaceDropTeardown?: () => void;

  public constructor(
    definitions: MorphicBlockDefinition[] | MorphicBlockDefinition,
    behaviors: MorphicBehaviorMap = {},
    elementTypes: Record<string, MorphicElementTypeEntry> = {},
  ) {
    super();
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

    // Presets: validate and resolve the initial one (drives the initial modes).
    this.validatePresets(config);
    const initialPreset = config.presets?.length
      ? (config.presets.find((p) => p.name === config.preset) ?? config.presets[0])
      : undefined;
    if (config.preset && !initialPreset) {
      throw new Error(`MorphicBlocks.mount: unknown preset "${config.preset}".`);
    }

    // Resolve default modes: fallback to first discovered mode or "default"
    const declaredModeNames = (config.modes ?? []).map((mode) => mode.name);
    const availableModeNames = mergedModeStyles.map((s) => s.mode);
    const defaultMode =
      availableModeNames[0] ?? declaredModeNames[0] ?? "default";
    const initialToolbox = initialPreset
      ? normalizePresetToolbox(initialPreset.toolbox)
      : undefined;
    const workspaceMode = initialPreset
      ? (initialPreset.workspace ?? initialPreset.codespace ?? defaultMode)
      : (config.workspaceMode ?? defaultMode);
    const toolboxMode = initialToolbox
      ? initialToolbox.mode
      : (config.toolboxMode ?? defaultMode);
    const toolboxRender = initialToolbox?.render;
    const codespaceMode = initialPreset
      ? initialPreset.codespace
      : config.codespaceMode;
    const previewMode = initialPreset ? initialPreset.preview : config.previewMode;

    this.validateContainers({ ...config, codespaceMode });

    const workspaceHost = config.workspaceContainer ?? this.createHeadlessHost();

    const resolvedConfig: MorphicResolvedMountConfig = {
      ...config,
      modeStyles: mergedModeStyles,
      workspaceMode,
      toolboxMode,
      toolboxRender,
      codespaceMode,
      previewMode,
      workspaceHost,
    };

    this.mountConfig = resolvedConfig;

    this.styles.validateModeCoverage(mergedModeStyles, declaredModeNames);
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

    this.workspace = Blockly.inject(resolvedConfig.workspaceHost, {
      ...blocklyOptions,
      ...(resolvedConfig.canvasToolbox ? {} : { toolbox: this.toolboxDefinition }),
    });
    this.workspace.addChangeListener(this.onWorkspaceChange);

    this.applyWorkspaceContainerClass();
    this.refreshToolbox();
    this.bindFlyoutWorkspace();
    this.renderWorkspaceBlocks();
    this.renderFlyoutBlocks();

    if (initialPreset) resolvedConfig.onPresetApplied?.(initialPreset);

    return this.workspace;
  }

  /** Presets declared at mount (empty when none were provided). */
  public getPresets(): MorphicPresetDefinition[] {
    return [...(this.mountConfig?.presets ?? [])];
  }

  /**
   * Apply a preset by name or index: sets the per-view modes derived from the
   * preset and notifies `onPresetApplied` so the host can update pane
   * visibility. Returns the applied preset.
   */
  public applyPreset(nameOrIndex: string | number): MorphicPresetDefinition {
    if (!this.mountConfig || !this.workspace) {
      throw new Error(
        "MorphicBlocks must be mounted before applyPreset can be used.",
      );
    }
    const presets = this.mountConfig.presets ?? [];
    const preset =
      typeof nameOrIndex === "number"
        ? presets[nameOrIndex]
        : presets.find((p) => p.name === nameOrIndex);
    if (!preset) {
      throw new Error(`applyPreset: unknown preset "${nameOrIndex}".`);
    }
    const toolbox = normalizePresetToolbox(preset.toolbox);
    this.setModes({
      toolboxMode: toolbox.mode,
      toolboxRender: toolbox.render ?? null,
      workspaceMode: preset.workspace ?? preset.codespace,
      codespaceMode: preset.codespace ?? null,
      previewMode: preset.preview ?? null,
    });
    this.mountConfig.onPresetApplied?.(preset);
    return preset;
  }

  /** Validate preset definitions against modes, element types, and containers. */
  private validatePresets(config: MorphicMountConfig): void {
    const presets = config.presets ?? [];
    if (presets.length === 0) return;
    const modes = config.modes ?? [];
    const modeByName = new Map(modes.map((m) => [m.name, m]));
    const seen = new Set<string>();

    for (const preset of presets) {
      if (seen.has(preset.name)) {
        throw new Error(`Preset "${preset.name}" is defined more than once.`);
      }
      seen.add(preset.name);

      if (!preset.workspace && !preset.codespace) {
        throw new Error(
          `Preset "${preset.name}": at least one of workspace or codespace must be set.`,
        );
      }
      if (preset.codespace && !config.codespaceContainer) {
        throw new Error(
          `Preset "${preset.name}" uses a codespace but no codespaceContainer was provided.`,
        );
      }

      const toolbox = normalizePresetToolbox(preset.toolbox);
      const refs: Array<[view: string, name: MorphicModeName | undefined]> = [
        ["toolbox", toolbox.mode],
        ["workspace", preset.workspace],
        ["codespace", preset.codespace],
        ["preview", preset.preview],
      ];
      for (const [view, name] of refs) {
        if (name === undefined) continue;
        const mode = modeByName.get(name);
        if (!mode) {
          throw new Error(
            `Preset "${preset.name}": unknown mode "${name}" for ${view}.`,
          );
        }
        if (
          (view === "codespace" || view === "preview") &&
          resolveModeSourceElement(mode, this.elementTypes) === undefined
        ) {
          throw new Error(
            `Preset "${preset.name}": mode "${name}" has no code element to render in the ${view}.`,
          );
        }
      }

      for (const value of Object.values(toolbox.render ?? {})) {
        if (value !== "block" && value !== "text") {
          throw new Error(
            `Preset "${preset.name}": toolbox render values must be "block" or "text".`,
          );
        }
      }
    }
  }

  public dispose(): void {
    this.selectionSync?.disable();
    this.selectionSync = undefined;

    this.codeEditor?.dispose();
    this.codeEditor = undefined;

    this.codespaceDropTeardown?.();
    this.codespaceDropTeardown = undefined;

    this.codespace?.dispose();
    this.codespace = undefined;

    this.previewEditor?.dispose();
    this.previewEditor = undefined;

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

    if (this.headlessWorkspaceHost) {
      this.headlessWorkspaceHost.remove();
      this.headlessWorkspaceHost = undefined;
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
    // Header label reuses the toolbar stylesheet.
    void this.styles.ensureToolbarStyles();

    // Empty Blockly's built-in flyout so it doesn't compete with the custom canvas.
    // Skip when canvasToolbox is true — Blockly was injected without any toolbox.
    if (!this.mountConfig.canvasToolbox) {
      this.workspace.updateToolbox({ kind: "flyoutToolbox", contents: [] });
    }

    this.toolboxCanvas = new MorphicToolboxCanvas({
      container,
      workspaceContainer: this.mountConfig.workspaceHost,
      workspace: this.workspace,
      definitions: this.definitions,
      blockColors: this.buildBlockColorMap(),
      behaviors: this.behaviors,
      elementTypes: this.elementTypes,
      mode: this.mountConfig.toolboxMode,
      render: this.mountConfig.toolboxRender,
      modes: this.mountConfig.modes,
      options,
    });
  }

  public getWorkspace(): Blockly.WorkspaceSvg | undefined {
    return this.workspace;
  }

  /**
   * The declared mode names (`modes[].name` from the mount config). Empty until
   * `mount()` runs. Note: this is *modes*, not element names — an element like
   * `icon` or `python` is not a mode unless a mode is named after it.
   */
  public getAvailableModes(): MorphicModeName[] {
    return (this.mountConfig?.modes ?? []).map((mode) => mode.name);
  }

  /** Current workspace mode name, or `undefined` if not mounted. */
  public getWorkspaceMode(): MorphicModeName | undefined {
    return this.mountConfig?.workspaceMode;
  }

  /**
   * Effective codespace mode name: the independent `codespaceMode` when set,
   * else the workspace mode. `undefined` if not mounted.
   */
  public getCodespaceMode(): MorphicModeName | undefined {
    return this.mountConfig?.codespaceMode ?? this.mountConfig?.workspaceMode;
  }

  /** Preview mode name, or `undefined` when no preview mode is set. */
  public getPreviewMode(): MorphicModeName | undefined {
    return this.mountConfig?.previewMode;
  }

  /** Mode definition by name, or `undefined`. */
  private modeDef(name: MorphicModeName | undefined): MorphicModeDefinition | undefined {
    if (!name) return undefined;
    return (this.mountConfig?.modes ?? []).find((m) => m.name === name);
  }

  /** Source element rendered by the codespace (label + highlighting source). */
  public getActivePrimarySourceElement(): string | undefined {
    const mode = this.modeDef(this.getCodespaceMode());
    if (!mode) return undefined;
    return resolveModeSourceElement(mode, this.elementTypes);
  }

  /** Source element rendered by the preview (label + highlighting source). */
  public getActivePreviewElement(): string | undefined {
    const previewMode = this.modeDef(this.mountConfig?.previewMode);
    if (!previewMode) return undefined;
    return resolveModeSourceElement(previewMode, this.elementTypes);
  }

  /**
   * Mount a toolbar into the developer-provided container, bound to one of the
   * three editor surfaces. When `items` is omitted, the default set for the
   * pane is rendered. Returns a handle for `refresh()` / `dispose()`.
   *
   * The toolbar's stateful items (undo/redo enabled-state, language label)
   * refresh automatically when:
   *   - any Blockly event fires on the workspace (covers undo/redo,
   *     drops, edits — both workspace- and codespace-originated)
   *   - `setModes` is called (covers language label changes)
   */
  public mountToolbar(
    container: HTMLElement,
    config: MorphicToolbarConfig,
  ): MorphicToolbarHandle {
    if (!this.workspace) {
      throw new Error(
        "MorphicBlocks must be mounted before mountToolbar can be used.",
      );
    }
    void this.styles.ensureToolbarStyles();
    const handle = renderToolbar(container, config, {
      engine: this,
      pane: config.pane,
      getText: () => this.toolbarTextFor(config.pane),
      refresh: () => this.toolbarRefreshFor(config.pane),
    });

    this.toolbars.add(handle);
    this.ensureToolbarBlocklyListener();

    const originalDispose = handle.dispose;
    handle.dispose = (): void => {
      this.toolbars.delete(handle);
      if (this.toolbars.size === 0) this.teardownToolbarBlocklyListener();
      originalDispose();
    };

    return handle;
  }

  private toolbarTextFor(pane: "workspace" | "codespace" | "preview"): string {
    if (pane === "codespace") {
      return this.codespace?.getValue() ?? this.generateCodespaceText().code;
    }
    if (pane === "preview") {
      return this.previewEditor?.getValue() ?? "";
    }
    // Workspace: derive text from the codespace if mounted, else generate via JS codegen.
    if (this.codespace) return this.codespace.getValue();
    try {
      return this.generateJavaScript();
    } catch {
      return "";
    }
  }

  private toolbarRefreshFor(pane: "workspace" | "codespace" | "preview"): void {
    if (pane === "codespace") this.codespace?.refresh();
    else if (pane === "preview") this.previewEditor?.refresh();
    // Workspace has no separate refresh — Blockly redraws on its own events.
  }

  /**
   * Generate JavaScript from the current workspace and execute it.
   * Pass an optional `console` to capture `console.log` / `.warn` / `.error`
   * calls — useful when routing output to a panel rather than the browser
   * devtools. Dispatches a `morphic-run` CustomEvent with the result so
   * additional listeners can react.
   */
  public runJavaScript(options?: {
    console?: { log: (...a: unknown[]) => void; warn?: (...a: unknown[]) => void; error?: (...a: unknown[]) => void };
  }): { code: string; result: unknown; error: Error | null } {
    let code = "";
    let result: unknown = undefined;
    let error: Error | null = null;
    try {
      code = this.generateJavaScript();
      const consoleArg = options?.console ?? console;
      // eslint-disable-next-line @typescript-eslint/no-implied-eval
      result = new Function("console", code)(consoleArg);
    } catch (e) {
      error = e instanceof Error ? e : new Error(String(e));
    }
    const detail = { code, result, error };
    this.dispatchEvent(new CustomEvent("morphic-run", { detail }));
    return detail;
  }

  /** Whether the framework's internal clipboard has a copyable to paste. */
  public hasClipboardContents(): boolean {
    return !!this.lastCopyData;
  }

  /**
   * Copy the currently active block to the framework's internal clipboard and
   * mirror its generated code text to the system clipboard. Resolution order:
   * (1) Blockly's selected block, (2) for codespace/preview, the deepest block
   * enclosing the active line. Returns true when something was copied.
   */
  public copyActiveBlock(pane: "workspace" | "codespace" | "preview"): boolean {
    const block = this.resolveActiveBlock(pane);
    if (!block) return false;
    const data = block.toCopyData();
    if (!data) return false;
    this.lastCopyData = data;
    // Mirror to system clipboard as code text — best-effort, fire-and-forget.
    try {
      const text = this.toolbarTextFor(pane === "workspace" ? "codespace" : pane);
      if (text) void navigator.clipboard?.writeText(text);
    } catch {
      // ignored
    }
    for (const h of this.toolbars) h.refresh();
    return true;
  }

  /**
   * Paste the last copied block at the active pane's natural location.
   * Workspace: Blockly's default (workspace centre, slightly offset).
   * Codespace/preview: the block lands at the workspace level too — the text
   * view re-renders to include it. (Cursor-position-aware paste into a
   * specific slot is deferred; the current behaviour matches Ctrl+V in
   * standard Blockly.) Returns true if something was pasted.
   */
  public pasteActiveBlock(_pane: "workspace" | "codespace" | "preview"): boolean {
    if (!this.lastCopyData || !this.workspace) return false;
    const pasted = Blockly.clipboard.paste(this.lastCopyData, this.workspace);
    return pasted !== null;
  }

  private resolveActiveBlock(
    pane: "workspace" | "codespace" | "preview",
  ): Blockly.BlockSvg | null {
    // 1. Whatever Blockly currently has selected — selection-sync keeps this
    //    in lockstep with codespace/preview cursor clicks.
    const selected = Blockly.common.getSelected();
    if (selected && "id" in selected && this.workspace?.getBlockById((selected as { id: string }).id)) {
      return selected as Blockly.BlockSvg;
    }
    // 2. For codespace/preview, fall back to the block at the cursor line.
    if (pane === "codespace" || pane === "preview") {
      const editor = pane === "codespace" ? this.codespace : this.previewEditor;
      if (editor) {
        const meta = editor.metadata;
        const cursorLine = editor.getCursorLine();
        // Find the deepest (smallest range) block whose lines contain the cursor.
        let best: { id: string; size: number } | null = null;
        for (const [id, pos] of meta) {
          if (pos.startLine <= cursorLine && pos.endLine >= cursorLine) {
            const size = pos.endLine - pos.startLine;
            if (!best || size < best.size) best = { id, size };
          }
        }
        if (best) {
          const block = this.workspace?.getBlockById(best.id);
          if (block) return block as Blockly.BlockSvg;
        }
      }
    }
    return null;
  }

  /** Serialize the workspace to a plain object (Blockly's native format). */
  public serializeWorkspace(): unknown {
    if (!this.workspace) return null;
    return Blockly.serialization.workspaces.save(this.workspace);
  }

  /** Restore the workspace from a previously serialized state. */
  public loadWorkspace(state: unknown): void {
    if (!this.workspace) return;
    this.workspace.clear();
    Blockly.serialization.workspaces.load(state as object, this.workspace);
  }

  /**
   * Adjust the pane's zoom level. Direction is `"in" | "out" | "fit"`. For
   * the workspace pane this maps to `workspace.zoomCenter(±1)` /
   * `zoomToFit()`. For codespace/preview it scales the editor's font-size.
   */
  public zoomPane(
    pane: "workspace" | "codespace" | "preview",
    direction: "in" | "out" | "fit",
  ): void {
    if (pane === "workspace") {
      if (!this.workspace) return;
      if (direction === "in") this.workspace.zoomCenter(1);
      else if (direction === "out") this.workspace.zoomCenter(-1);
      else this.workspace.zoomToFit();
      return;
    }
    const editor = pane === "codespace" ? this.codespace : this.previewEditor;
    editor?.adjustZoom(direction);
  }

  private ensureToolbarBlocklyListener(): void {
    if (this.toolbarsBlocklyListener || !this.workspace) return;
    const listener = (_e: Blockly.Events.Abstract): void => {
      for (const h of this.toolbars) h.refresh();
    };
    this.toolbarsBlocklyListener = listener;
    this.workspace.addChangeListener(listener);
  }

  private teardownToolbarBlocklyListener(): void {
    if (!this.toolbarsBlocklyListener || !this.workspace) return;
    this.workspace.removeChangeListener(this.toolbarsBlocklyListener);
    this.toolbarsBlocklyListener = undefined;
  }

  public setModes(modes: {
    workspaceMode?: MorphicModeName;
    toolboxMode?: MorphicModeName;
    /** Per-element block/text override for toolbox tiles. `null` clears it (all code elements render as blocks). */
    toolboxRender?: Record<string, "block" | "text"> | null;
    /** Independent codespace mode. `null` clears the override (falls back to workspaceMode). */
    codespaceMode?: MorphicModeName | null;
    /** Preview mode. `null` clears it (preview renders nothing unless the workspace mode declares a legacy `preview`). */
    previewMode?: MorphicModeName | null;
  }): void {
    if (!this.mountConfig || !this.workspace) {
      throw new Error(
        "MorphicBlocks must be mounted before setModes can be used.",
      );
    }

    for (const [field, name] of [
      ["workspaceMode", modes.workspaceMode],
      ["toolboxMode", modes.toolboxMode],
      ["codespaceMode", modes.codespaceMode],
      ["previewMode", modes.previewMode],
    ] as const) {
      if (typeof name === "string" && !this.modeDef(name)) {
        throw new Error(`setModes: unknown mode "${name}" for ${field}.`);
      }
    }
    if (typeof modes.codespaceMode === "string" && !this.mountConfig.codespaceContainer) {
      throw new Error(
        "setModes: codespaceMode requires a codespaceContainer at mount.",
      );
    }

    if (modes.workspaceMode) {
      this.mountConfig.workspaceMode = modes.workspaceMode;
    }
    if (modes.codespaceMode !== undefined) {
      this.mountConfig.codespaceMode = modes.codespaceMode ?? undefined;
    }
    if (modes.previewMode !== undefined) {
      this.mountConfig.previewMode = modes.previewMode ?? undefined;
    }
    if (modes.toolboxRender !== undefined) {
      this.mountConfig.toolboxRender = modes.toolboxRender ?? undefined;
    }
    if (modes.toolboxMode || modes.toolboxRender !== undefined) {
      if (modes.toolboxMode) this.mountConfig.toolboxMode = modes.toolboxMode;
      this.toolboxCanvas?.rerender(
        this.mountConfig.toolboxMode,
        this.mountConfig.toolboxRender,
      );
    }

    this.applyWorkspaceContainerClass();
    this.refreshToolbox();
    this.bindFlyoutWorkspace();
    this.renderWorkspaceBlocks();
    this.renderFlyoutBlocks();
    this.codespace?.setHighlightRules(this.resolveHighlightRules("codespace"));
    this.previewEditor?.setHighlightRules(this.resolveHighlightRules("preview"));
    this.codespace?.refresh();
    this.previewEditor?.refresh();
    for (const h of this.toolbars) h.refresh();
    // Clear selection + line highlights on mode switch — the previous selection
    // can refer to a presentation that's no longer visible, leaving stale
    // highlights in views the user can no longer reach.
    this.selectionSync?.clearAll();
  }

  /**
   * Resolve the highlight rules for the codespace or preview editor by
   * looking up that pane's source element name in the
   * `mountConfig.highlighting` registry. Returns `undefined` when no
   * matching entry is configured.
   */
  private resolveHighlightRules(
    kind: "codespace" | "preview",
  ): MorphicHighlightDefinition | undefined {
    if (!this.mountConfig) return undefined;
    const elementName =
      kind === "codespace"
        ? this.getActivePrimarySourceElement()
        : this.getActivePreviewElement();
    if (!elementName) return undefined;
    return this.mountConfig.highlighting?.[elementName];
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

  public async mountCodeEditor(
    container: HTMLElement,
    options?: MorphicCodeEditorOptions,
  ): Promise<void> {
    if (!this.workspace || !this.mountConfig) {
      throw new Error(
        "MorphicBlocks must be mounted before mountCodeEditor can be used.",
      );
    }

    this.codeEditor?.dispose();

    this.codeEditor = new MorphicCodeEditor(
      container,
      this.workspace,
      () => this.generateJavaScriptWithMetadata(),
      options,
    );

    await this.codeEditor.mount();
  }

  /**
   * Mounts the primary text editor (codespace) into the `codespaceContainer`
   * declared at `mount()`. Renders the workspace as text using the codespace
   * mode's source element. Read-only for now; Task 4 adds drops.
   */
  public async mountCodespace(
    options?: MorphicCodeEditorOptions,
  ): Promise<void> {
    if (!this.workspace || !this.mountConfig) {
      throw new Error(
        "MorphicBlocks must be mounted before mountCodespace can be used.",
      );
    }
    if (!this.mountConfig.codespaceContainer) {
      throw new Error(
        "mountCodespace requires a codespaceContainer to be passed to mount().",
      );
    }

    this.codespace?.dispose();
    this.codespaceDropTeardown?.();

    const mergedOptions: MorphicCodeEditorOptions = {
      ...options,
      onDelete: options?.onDelete ?? ((line) => this.deleteBlockAtCodespaceLine(line)),
      canDragBlock:
        options?.canDragBlock ??
        ((blockId) => {
          const block = this.workspace?.getBlockById(blockId);
          // Allow grip-dragging both statement blocks (previousConnection)
          // and value blocks (outputConnection) so the codespace mirrors
          // Blockly's full set of moveable blocks.
          return !!(block?.previousConnection || block?.outputConnection);
        }),
      highlightRules: options?.highlightRules ?? this.resolveHighlightRules("codespace"),
      onPlaceholderApply:
        options?.onPlaceholderApply ?? ((edit, newValue) => this.applyPlaceholderEdit(edit, newValue)),
    };

    this.codespace = new MorphicCodeEditor(
      this.mountConfig.codespaceContainer,
      this.workspace,
      () => this.generateCodespaceText(),
      mergedOptions,
    );

    await this.codespace.mount();
    this.codespaceDropTeardown = this.attachCodespaceDropTarget(
      this.mountConfig.codespaceContainer,
      this.workspace,
    );
  }

  private attachCodespaceDropTarget(
    container: HTMLElement,
    workspace: Blockly.WorkspaceSvg,
  ): () => void {
    const isCodespaceDrag = (e: DragEvent): boolean => {
      const types = e.dataTransfer?.types;
      if (!types) return false;
      return types.includes(DRAG_DATA_KEY) || types.includes(BLOCK_ID_DRAG_KEY);
    };

    const onDragOver = (e: DragEvent) => {
      if (!isCodespaceDrag(e)) return;
      e.preventDefault();
      const drop = this.computeCodespaceDrop(e.clientX, e.clientY);
      if (!drop) {
        this.codespace?.hideDropIndicator();
        this.codespace?.hideValueSlotHighlight();
        return;
      }
      if (drop.indicator.kind === "line") {
        this.codespace?.showDropIndicator(drop.indicator.line, drop.indicator.position);
        this.codespace?.hideValueSlotHighlight();
      } else {
        this.codespace?.showValueSlotHighlight(drop.indicator.from, drop.indicator.to);
        this.codespace?.hideDropIndicator();
      }
    };

    const onDragLeave = (e: DragEvent) => {
      const next = e.relatedTarget as Node | null;
      if (next && container.contains(next)) return;
      this.codespace?.hideDropIndicator();
      this.codespace?.hideValueSlotHighlight();
    };

    const onDrop = (e: DragEvent) => {
      if (!isCodespaceDrag(e)) return;
      e.preventDefault();
      this.codespace?.hideDropIndicator();
      this.codespace?.hideValueSlotHighlight();

      const drop = this.computeCodespaceDrop(e.clientX, e.clientY);
      if (!drop) return;

      const blockType = e.dataTransfer?.getData(DRAG_DATA_KEY);
      const sourceId = e.dataTransfer?.getData(BLOCK_ID_DRAG_KEY);

      let block: Blockly.BlockSvg | null = null;
      if (blockType) {
        block = workspace.newBlock(resolveBlocklyType(blockType, this.definitions)) as Blockly.BlockSvg;
        block.initSvg();
        block.render();
      } else if (sourceId) {
        block = workspace.getBlockById(sourceId) as Blockly.BlockSvg | null;
        if (!block) return;
      } else {
        return;
      }

      let placed = false;
      Blockly.Events.setGroup(true);
      try {
        if (sourceId && block.getParent()) {
          block.unplug(true);
        }
        if (drop.target.kind === "top") {
          this.placeAtTopIndex(workspace, block, drop.target.index);
          placed = true;
        } else if (drop.target.kind === "statement") {
          if (block.previousConnection) {
            const target = workspace.getBlockById(drop.target.targetBlockId) as Blockly.BlockSvg | null;
            if (target && target !== block) {
              this.connectStatement(block, target, drop.target.position);
              placed = true;
            }
          }
        } else if (drop.target.kind === "into-slot") {
          if (block.previousConnection) {
            const parent = workspace.getBlockById(drop.target.parentBlockId) as Blockly.BlockSvg | null;
            if (parent && parent !== block) {
              this.connectIntoSlot(block, parent, drop.target.inputName);
              placed = true;
            }
          }
        } else if (drop.target.kind === "value-slot") {
          if (block.outputConnection) {
            const parent = workspace.getBlockById(drop.target.parentBlockId) as Blockly.BlockSvg | null;
            // Cycle guard: a grip-drag can't land its source inside its own subtree.
            if (parent && parent !== block && !this.isDescendantOf(parent, block)) {
              placed = this.connectIntoValueSlot(block, parent, drop.target.inputName);
            }
          }
          // A newly-created toolbox block that couldn't connect would orphan at
          // workspace origin; dispose it so a rejected drop leaves no trace.
          if (!placed && blockType) {
            block.dispose(false);
          }
        }
      } finally {
        Blockly.Events.setGroup(false);
      }
      // A grip-dragged block that didn't land anywhere connected still belongs
      // on the workspace — Blockly's "moved a block somewhere invalid" lands
      // it on the canvas. Push it below the current last top block so it
      // shows up as a fresh row instead of overlapping its old parent slot.
      if (!placed && block.workspace && !block.getParent()) {
        this.placeOrphanBelowTops(block);
      }
      Blockly.svgResize(workspace);
    };

    // ── Right-click drag ──
    // Left-click on a value text always opens the inline editor (Phase 1) —
    // no drag affordance is layered onto the text itself. To MOVE a block
    // (drag it out of its slot, move it between slots, send it to top
    // level), the user holds the RIGHT mouse button and drags. This avoids
    // the click-vs-drag race that otherwise steals the edit gesture, and
    // matches the user's preference for a clean separation between "edit"
    // and "move".
    let rightDrag: {
      sourceId: string;
      startX: number;
      startY: number;
      dragging: boolean;
    } | null = null;

    const moveThreshold = 3;

    // Right-click is `button === 2`. macOS also issues `button === 0` with
    // `ctrlKey === true` for Ctrl+click — the canonical "secondary click"
    // gesture there — so accept both.
    const isSecondaryClick = (e: MouseEvent) =>
      e.button === 2 || (e.button === 0 && e.ctrlKey);

    const onRightMove = (e: MouseEvent) => {
      if (!rightDrag) return;
      if (!rightDrag.dragging) {
        const dx = Math.abs(e.clientX - rightDrag.startX);
        const dy = Math.abs(e.clientY - rightDrag.startY);
        if (dx + dy < moveThreshold) return;
        rightDrag.dragging = true;
      }
      const drop = this.computeCodespaceDrop(e.clientX, e.clientY);
      if (!drop) {
        this.codespace?.hideDropIndicator();
        this.codespace?.hideValueSlotHighlight();
        return;
      }
      if (drop.indicator.kind === "line") {
        this.codespace?.showDropIndicator(drop.indicator.line, drop.indicator.position);
        this.codespace?.hideValueSlotHighlight();
      } else {
        this.codespace?.showValueSlotHighlight(drop.indicator.from, drop.indicator.to);
        this.codespace?.hideDropIndicator();
      }
    };

    const onRightUp = (e: MouseEvent) => {
      window.removeEventListener("mousemove", onRightMove);
      window.removeEventListener("mouseup", onRightUp);
      this.codespace?.hideDropIndicator();
      this.codespace?.hideValueSlotHighlight();
      const state = rightDrag;
      rightDrag = null;
      setActiveGripDragSourceId(undefined);
      if (!state?.dragging) return;
      const drop = this.computeCodespaceDrop(e.clientX, e.clientY);
      if (!drop) return;
      const block = workspace.getBlockById(state.sourceId) as Blockly.BlockSvg | null;
      if (!block) return;
      this.applyRightDragMove(workspace, block, drop);
    };

    const onMouseDown = (e: MouseEvent) => {
      if (!isSecondaryClick(e)) return;
      const charOffset = this.codespace?.charAtCoords(e.clientX, e.clientY);
      if (charOffset === null || charOffset === undefined) return;
      const block = this.findInnermostBlockAtChar(charOffset);
      if (!block) return;
      // Stop CodeMirror from processing the mousedown too — otherwise CM
      // starts its own text selection (especially for Ctrl+left-click on
      // macOS, which CM reads as `button=0`) and the user sees lines below
      // the cursor get highlighted during the drag.
      e.preventDefault();
      e.stopPropagation();
      rightDrag = {
        sourceId: block.id,
        startX: e.clientX,
        startY: e.clientY,
        dragging: false,
      };
      setActiveGripDragSourceId(block.id);
      window.addEventListener("mousemove", onRightMove);
      window.addEventListener("mouseup", onRightUp);
    };

    // Suppress the browser context menu inside the codespace — right-click is
    // reserved for block movement here.
    const onContextMenu = (e: MouseEvent) => {
      e.preventDefault();
    };

    // Hover hint, two layers:
    //   1. Editable outline — single outline around the innermost editable
    //      placeholder under the cursor (so a single value gets a single
    //      outline, never the stack of every wrapping placeholder).
    //   2. Block background — grey tint over the surrounding non-atomic
    //      block (so hovering on `3` highlights the whole `3 + 5` expression
    //      or the whole `for` loop, not just the digit). Falls back to the
    //      innermost block when no non-atomic ancestor contains the cursor
    //      (e.g. a top-level orphan number).
    // Both are suppressed while a right-click drag is in flight — the drop
    // indicators take over then.
    const onHoverMove = (e: MouseEvent) => {
      if (rightDrag) return;
      const charOffset = this.codespace?.charAtCoords(e.clientX, e.clientY);
      if (charOffset === null || charOffset === undefined) {
        this.codespace?.setHoverHighlight(null);
        this.codespace?.setEditableHoverHighlight(null);
        return;
      }
      const ph = this.findInnermostEditablePlaceholderAtChar(charOffset);
      this.codespace?.setEditableHoverHighlight(
        ph ? { from: ph.start, to: ph.end } : null,
      );
      const block = this.findHoverBlockAtChar(charOffset);
      if (!block) {
        this.codespace?.setHoverHighlight(null);
        return;
      }
      const pos = this.codespace?.metadata.get(block.id);
      if (!pos || pos.startChar === undefined || pos.endChar === undefined) {
        this.codespace?.setHoverHighlight(null);
        return;
      }
      this.codespace?.setHoverHighlight({ from: pos.startChar, to: pos.endChar });
    };
    const onHoverLeave = () => {
      this.codespace?.setHoverHighlight(null);
      this.codespace?.setEditableHoverHighlight(null);
    };

    container.addEventListener("dragover", onDragOver);
    container.addEventListener("dragleave", onDragLeave);
    container.addEventListener("drop", onDrop);
    container.addEventListener("mousedown", onMouseDown, true);
    container.addEventListener("contextmenu", onContextMenu);
    container.addEventListener("mousemove", onHoverMove);
    container.addEventListener("mouseleave", onHoverLeave);

    return () => {
      container.removeEventListener("dragover", onDragOver);
      container.removeEventListener("dragleave", onDragLeave);
      container.removeEventListener("drop", onDrop);
      container.removeEventListener("mousedown", onMouseDown, true);
      container.removeEventListener("contextmenu", onContextMenu);
      container.removeEventListener("mousemove", onHoverMove);
      container.removeEventListener("mouseleave", onHoverLeave);
      window.removeEventListener("mousemove", onRightMove);
      window.removeEventListener("mouseup", onRightUp);
    };
  }

  /** Innermost (smallest-range) block in metadata whose char range contains `charOffset`. */
  private findInnermostBlockAtChar(charOffset: number): Blockly.BlockSvg | null {
    if (!this.workspace || !this.codespace) return null;
    let best: { id: string; size: number } | null = null;
    for (const [id, pos] of this.codespace.metadata) {
      if (pos.startChar === undefined || pos.endChar === undefined) continue;
      if (charOffset < pos.startChar || charOffset >= pos.endChar) continue;
      const size = pos.endChar - pos.startChar;
      if (best === null || size < best.size) best = { id, size };
    }
    return best ? (this.workspace.getBlockById(best.id) as Blockly.BlockSvg) : null;
  }

  /**
   * Hover-background target: the smallest *non-atomic* block whose range
   * contains the cursor. Atomic single-field blocks (numbers, strings,
   * booleans) are skipped so hovering on `3` highlights the surrounding
   * `1 + 2` expression instead of just the digit. Falls back to the smallest
   * block found when only atomic blocks contain the cursor (e.g. a top-level
   * orphan number on its own line).
   */
  private findHoverBlockAtChar(charOffset: number): Blockly.BlockSvg | null {
    if (!this.workspace || !this.codespace) return null;
    let bestNonAtomic: { id: string; size: number } | null = null;
    let bestAny: { id: string; size: number } | null = null;
    for (const [id, pos] of this.codespace.metadata) {
      if (pos.startChar === undefined || pos.endChar === undefined) continue;
      if (charOffset < pos.startChar || charOffset >= pos.endChar) continue;
      const size = pos.endChar - pos.startChar;
      if (bestAny === null || size < bestAny.size) bestAny = { id, size };
      if (!pos.atomic && (bestNonAtomic === null || size < bestNonAtomic.size)) {
        bestNonAtomic = { id, size };
      }
    }
    const winner = bestNonAtomic ?? bestAny;
    return winner ? (this.workspace.getBlockById(winner.id) as Blockly.BlockSvg) : null;
  }

  /** Innermost placeholder with an editable `edit` target whose range contains `charOffset`. */
  private findInnermostEditablePlaceholderAtChar(charOffset: number) {
    if (!this.codespace) return null;
    let best: { ph: { start: number; end: number; edit?: unknown }; size: number } | null = null;
    for (const ph of this.codespace.getPlaceholders()) {
      if (!ph.edit) continue;
      if (charOffset < ph.start || charOffset >= ph.end) continue;
      const size = ph.end - ph.start;
      if (best === null || size < best.size) best = { ph, size };
    }
    return best ? { start: best.ph.start, end: best.ph.end } : null;
  }

  /**
   * Reusable drop-result applicator for the right-click drag path: same set
   * of target kinds as the HTML5 drop handler, but the source is always an
   * existing workspace block (no toolbox-spawn case).
   */
  private applyRightDragMove(
    workspace: Blockly.WorkspaceSvg,
    block: Blockly.BlockSvg,
    drop: ReturnType<MorphicBlocks["computeCodespaceDrop"]>,
  ): void {
    if (!drop) return;
    let placed = false;
    Blockly.Events.setGroup(true);
    try {
      if (block.getParent()) {
        block.unplug(true);
      }
      if (drop.target.kind === "top") {
        this.placeAtTopIndex(workspace, block, drop.target.index);
        placed = true;
      } else if (drop.target.kind === "statement") {
        if (block.previousConnection) {
          const target = workspace.getBlockById(drop.target.targetBlockId) as Blockly.BlockSvg | null;
          if (target && target !== block) {
            this.connectStatement(block, target, drop.target.position);
            placed = true;
          }
        }
      } else if (drop.target.kind === "into-slot") {
        if (block.previousConnection) {
          const parent = workspace.getBlockById(drop.target.parentBlockId) as Blockly.BlockSvg | null;
          if (parent && parent !== block) {
            this.connectIntoSlot(block, parent, drop.target.inputName);
            placed = true;
          }
        }
      } else if (drop.target.kind === "value-slot") {
        if (block.outputConnection) {
          const parent = workspace.getBlockById(drop.target.parentBlockId) as Blockly.BlockSvg | null;
          if (parent && parent !== block && !this.isDescendantOf(parent, block)) {
            placed = this.connectIntoValueSlot(block, parent, drop.target.inputName);
          }
        }
      }
    } finally {
      Blockly.Events.setGroup(false);
    }
    if (!placed && block.workspace && !block.getParent()) {
      this.placeOrphanBelowTops(block);
    }
    Blockly.svgResize(workspace);
  }

  /**
   * Resolve a codespace drop into both a visual indicator and a typed target.
   *
   * `target.kind === "top"` means the drop becomes a top-level block at
   * `target.index`. `target.kind === "statement"` means it should be wired into
   * an existing block's statement chain — `targetBlockId` is the block under
   * the cursor and `position` says whether to land before or after it.
   *
   * Above/below is decided by upper/lower-half of the cursor's line; cursor
   * past the last rendered line always resolves to "after all" at top level.
   */
  private computeCodespaceDrop(
    clientX: number,
    clientY: number,
  ): {
    indicator:
      | { kind: "line"; line: number; position: "above" | "below" }
      | { kind: "value-slot"; from: number; to: number };
    target:
      | { kind: "top"; index: number }
      | { kind: "statement"; targetBlockId: string; position: "before" | "after" }
      | { kind: "into-slot"; parentBlockId: string; inputName: string }
      | { kind: "value-slot"; parentBlockId: string; inputName: string };
  } | null {
    if (!this.workspace || !this.codespace) return null;
    const tops = this.workspace.getTopBlocks(true);
    const meta = this.codespace.metadata;
    const lineCount = this.codespace.getLineCount();

    if (tops.length === 0) {
      return {
        indicator: { kind: "line", line: 1, position: "above" },
        target: { kind: "top", index: 0 },
      };
    }

    if (this.codespace.isBelowLastLine(clientY)) {
      const lastPos = meta.get(tops[tops.length - 1]!.id);
      return {
        indicator: { kind: "line", line: lastPos?.endLine ?? lineCount, position: "below" },
        target: { kind: "top", index: tops.length },
      };
    }

    const line = this.codespace.getLineAtCoords(clientX, clientY);
    if (line === null) {
      const firstPos = meta.get(tops[0]!.id);
      return {
        indicator: { kind: "line", line: firstPos?.startLine ?? 1, position: "above" },
        target: { kind: "top", index: 0 },
      };
    }

    // Value-slot detection runs first: an empty slot (covered by a placeholder
    // range) or an occupied slot (the inner value child's char range) is
    // strictly narrower than any statement-slot match, so char-precision wins.
    const charOffset = this.codespace.charAtCoords(clientX, clientY);
    if (charOffset !== null) {
      const valueSlot = this.findValueSlotDropAtChar(charOffset);
      if (valueSlot) {
        return {
          indicator: {
            kind: "value-slot",
            from: valueSlot.highlight.from,
            to: valueSlot.highlight.to,
          },
          target: {
            kind: "value-slot",
            parentBlockId: valueSlot.parentBlockId,
            inputName: valueSlot.inputName,
          },
        };
      }
    }

    // Slot-based detection: if the cursor is inside *any* statement input's
    // body (deepest match wins), resolve to a position within that slot's
    // chain. Walking the slot's children inside that range catches the
    // common "between two siblings" case as well as empty bodies.
    //
    // When a grip-drag is in progress, exclude the source from the children
    // walk: hovering on the source's own line then resolves to "after the
    // remaining last child" (a real move) instead of "after self" (no-op).
    const slotMatch = this.findInnermostStatementSlotAtLine(line, meta);
    if (slotMatch) {
      const parent = this.workspace.getBlockById(slotMatch.blockId) as Blockly.BlockSvg | null;
      if (parent) {
        const dragSourceId = getActiveGripDragSourceId();
        const children: Blockly.BlockSvg[] = [];
        let cur = parent
          .getInput(slotMatch.inputName)
          ?.connection?.targetBlock() as Blockly.BlockSvg | null;
        while (cur) {
          if (cur.id !== dragSourceId) {
            children.push(cur);
          }
          cur = cur.getNextBlock() as Blockly.BlockSvg | null;
        }

        // Cursor sitting on one of the slot's existing children → before/after.
        for (const child of children) {
          const cpos = meta.get(child.id);
          if (!cpos) continue;
          if (line < cpos.startLine || line > cpos.endLine) continue;

          const onLastLine = line === cpos.endLine;
          const lowerHalf = this.codespace.isInLowerHalfOfLine(line, clientY);
          if (onLastLine && lowerHalf) {
            return {
              indicator: { kind: "line", line: cpos.endLine, position: "below" },
              target: { kind: "statement", targetBlockId: child.id, position: "after" },
            };
          }
          return {
            indicator: { kind: "line", line: cpos.startLine, position: "above" },
            target: { kind: "statement", targetBlockId: child.id, position: "before" },
          };
        }

        // Cursor is in the slot but not on any existing child — empty body
        // or whitespace tail line. Append to the slot.
        if (children.length > 0) {
          const last = children[children.length - 1]!;
          const lastPos = meta.get(last.id);
          return {
            indicator: { kind: "line", line: lastPos?.endLine ?? slotMatch.range.endLine, position: "below" },
            target: {
              kind: "into-slot",
              parentBlockId: slotMatch.blockId,
              inputName: slotMatch.inputName,
            },
          };
        }
        return {
          indicator: { kind: "line", line: slotMatch.range.startLine, position: "above" },
          target: {
            kind: "into-slot",
            parentBlockId: slotMatch.blockId,
            inputName: slotMatch.inputName,
          },
        };
      }
    }

    // Fall through to top-level placement based on which top block holds the line.
    for (let i = 0; i < tops.length; i++) {
      const pos = meta.get(tops[i]!.id);
      if (!pos) continue;
      if (line < pos.startLine || line > pos.endLine) continue;

      const onLastLine = line === pos.endLine;
      const lowerHalf = this.codespace.isInLowerHalfOfLine(line, clientY);
      if (onLastLine && lowerHalf) {
        return {
          indicator: { kind: "line", line: pos.endLine, position: "below" },
          target: { kind: "top", index: i + 1 },
        };
      }
      return {
        indicator: { kind: "line", line: pos.startLine, position: "above" },
        target: { kind: "top", index: i },
      };
    }

    const lastPos = meta.get(tops[tops.length - 1]!.id);
    return {
      indicator: { kind: "line", line: lastPos?.endLine ?? lineCount, position: "below" },
      target: { kind: "top", index: tops.length },
    };
  }

  /**
   * Deepest statement-input slot whose body range contains `line`. Used for
   * empty/whitespace bodies where no child block anchors the line.
   */
  private findInnermostStatementSlotAtLine(
    line: number,
    meta: ReadonlyMap<string, MorphicCodeBlockPosition>,
  ): { blockId: string; inputName: string; range: { startLine: number; endLine: number } } | null {
    let best: {
      blockId: string;
      inputName: string;
      range: { startLine: number; endLine: number };
      depth: number;
      size: number;
    } | null = null;
    for (const [id, pos] of meta) {
      if (!pos.statementSlots) continue;
      for (const [inputName, range] of Object.entries(pos.statementSlots)) {
        if (line < range.startLine || line > range.endLine) continue;
        const size = range.endLine - range.startLine;
        const depth = this.computeBlockDepth(id);
        if (
          best === null ||
          size < best.size ||
          (size === best.size && depth > best.depth)
        ) {
          best = { blockId: id, inputName, range, size, depth };
        }
      }
    }
    return best
      ? { blockId: best.blockId, inputName: best.inputName, range: best.range }
      : null;
  }

  /**
   * Append `source` to the chain in `parent`'s statement input named `inputName`.
   * Connects to the slot directly when the slot is empty; otherwise walks to
   * the chain's tail and connects there.
   */
  private connectIntoSlot(
    source: Blockly.BlockSvg,
    parent: Blockly.BlockSvg,
    inputName: string,
  ): void {
    if (!source.previousConnection) return;
    const input = parent.getInput(inputName);
    const conn = input?.connection;
    if (!conn) return;
    const firstChild = conn.targetBlock() as Blockly.BlockSvg | null;
    if (!firstChild) {
      conn.connect(source.previousConnection);
      return;
    }
    let tail: Blockly.BlockSvg = firstChild;
    let next = tail.getNextBlock() as Blockly.BlockSvg | null;
    while (next) {
      tail = next;
      next = tail.getNextBlock() as Blockly.BlockSvg | null;
    }
    if (tail.nextConnection) {
      tail.nextConnection.connect(source.previousConnection);
    }
  }

  /**
   * Resolve a char-offset in the codespace to the value slot the drop should
   * land in. Two cases, both yielding the parent block + input name:
   *
   *   1. Empty slot — the offset is inside a placeholder range with a
   *      shadow/placeholder block (`edit.blockId`). The shadow's parent
   *      connection identifies the slot.
   *   2. Occupied slot — the offset is inside an inner value block's char
   *      range (innermost wins by smallest range). The block's own parent
   *      connection identifies the slot; on drop, the child is replaced.
   *
   * Excludes the active grip-drag source so dragging a value block onto its
   * own rendered range is a no-op rather than a self-replace.
   */
  private findValueSlotDropAtChar(charOffset: number): {
    parentBlockId: string;
    inputName: string;
    highlight: { from: number; to: number };
  } | null {
    if (!this.workspace || !this.codespace) return null;
    const dragSourceId = getActiveGripDragSourceId();

    // 1. Empty value slots — placeholder ranges with an editable target.
    for (const ph of this.codespace.getPlaceholders()) {
      if (charOffset < ph.start || charOffset >= ph.end) continue;
      const blockId = ph.edit?.blockId;
      if (!blockId || blockId === dragSourceId) continue;
      const child = this.workspace.getBlockById(blockId) as Blockly.BlockSvg | null;
      if (!child) continue;
      const parentInfo = this.resolveValueParent(child);
      if (!parentInfo) continue;
      return {
        parentBlockId: parentInfo.parentBlockId,
        inputName: parentInfo.inputName,
        highlight: { from: ph.start, to: ph.end },
      };
    }

    // 2. Occupied value slots — narrowest value-output block containing the
    //    offset. metadata records inclusive `[startChar, endChar)` ranges.
    let best: {
      id: string;
      size: number;
      from: number;
      to: number;
    } | null = null;
    for (const [id, pos] of this.codespace.metadata) {
      if (pos.startChar === undefined || pos.endChar === undefined) continue;
      if (charOffset < pos.startChar || charOffset >= pos.endChar) continue;
      if (id === dragSourceId) continue;
      const block = this.workspace.getBlockById(id) as Blockly.BlockSvg | null;
      if (!block?.outputConnection) continue;
      const size = pos.endChar - pos.startChar;
      if (best === null || size < best.size) {
        best = { id, size, from: pos.startChar, to: pos.endChar };
      }
    }
    if (best) {
      const child = this.workspace.getBlockById(best.id) as Blockly.BlockSvg | null;
      if (child) {
        const parentInfo = this.resolveValueParent(child);
        if (parentInfo) {
          return {
            parentBlockId: parentInfo.parentBlockId,
            inputName: parentInfo.inputName,
            highlight: { from: best.from, to: best.to },
          };
        }
      }
    }

    return null;
  }

  /** Find the value-input that holds `child`, returning its parent + input name. */
  private resolveValueParent(child: Blockly.BlockSvg): {
    parentBlockId: string;
    inputName: string;
  } | null {
    const targetConn = child.outputConnection?.targetConnection;
    if (!targetConn) return null;
    const parent = targetConn.getSourceBlock() as Blockly.BlockSvg | null;
    if (!parent) return null;
    for (const input of parent.inputList) {
      if (input.connection === targetConn) {
        return { parentBlockId: parent.id, inputName: input.name };
      }
    }
    return null;
  }

  /**
   * Place a freshly-orphaned block at a clear workspace coordinate, below the
   * current bottom-most top block. Keeps replaced value children visible in
   * the codespace instead of overlapping the parent's slot position.
   */
  private placeOrphanBelowTops(orphan: Blockly.BlockSvg): void {
    if (!this.workspace) return;
    const tops = this.workspace
      .getTopBlocks(true)
      .filter((b) => b.id !== orphan.id) as Blockly.BlockSvg[];
    if (tops.length === 0) {
      orphan.moveTo(new Blockly.utils.Coordinate(20, 20));
      return;
    }
    let maxBottomY = 0;
    for (const top of tops) {
      const xy = top.getRelativeToSurfaceXY();
      const height = top.getHeightWidth?.()?.height ?? 50;
      maxBottomY = Math.max(maxBottomY, xy.y + height);
    }
    orphan.moveTo(new Blockly.utils.Coordinate(20, maxBottomY + 20));
  }

  /** True when `candidate` is `ancestor` itself or anywhere in its subtree. */
  private isDescendantOf(
    candidate: Blockly.BlockSvg,
    ancestor: Blockly.BlockSvg,
  ): boolean {
    let cur: Blockly.Block | null = candidate;
    while (cur) {
      if (cur === ancestor) return true;
      cur = cur.getParent();
    }
    return false;
  }

  /**
   * Connect `source`'s output into the value input named `inputName` on
   * `parent`. A real (non-shadow) child currently in the slot is `unplug`'d
   * to top level; a shadow disconnects implicitly when the new block
   * connects. The Blockly connection-check (output-type vs slot `check`)
   * runs inside `connect`; an incompatible drop throws and is rolled back
   * by restoring the prior real child when there was one.
   */
  private connectIntoValueSlot(
    source: Blockly.BlockSvg,
    parent: Blockly.BlockSvg,
    inputName: string,
  ): boolean {
    if (!source.outputConnection) return false;
    const input = parent.getInput(inputName);
    const conn = input?.connection;
    if (!conn) return false;

    const existing = conn.targetBlock() as Blockly.BlockSvg | null;
    const existingWasReal = !!existing && !existing.isShadow();
    if (existingWasReal) {
      existing!.unplug(false);
      // Without a manual move, the unplugged child keeps the (now-stale)
      // coordinate it inherited from its parent's slot, so it can render
      // above the parent's line in the codespace. Push it below the current
      // last top block instead.
      this.placeOrphanBelowTops(existing!);
    }
    // The codespace is a text surface: types aren't visually distinguished and
    // the user expects "any value goes anywhere" semantics (a Number into a
    // String slot still produces valid Python/JS at runtime). Temporarily
    // clear the slot's check so any output type connects; restore it after
    // the connect so Blockly's workspace-side connection logic isn't
    // permanently weakened.
    const checkRef = conn as unknown as { check_: string[] | null };
    const savedCheck = checkRef.check_;
    conn.setCheck(null);
    try {
      conn.connect(source.outputConnection);
      return true;
    } catch {
      if (existingWasReal && existing?.outputConnection) {
        try {
          conn.connect(existing.outputConnection);
        } catch {
          // Give up — let the shadow re-materialise on the next render.
        }
      }
      return false;
    } finally {
      conn.setCheck(savedCheck);
    }
  }

  private computeBlockDepth(blockId: string): number {
    let depth = 0;
    let cur = this.workspace?.getBlockById(blockId)?.getParent() ?? null;
    while (cur) {
      depth++;
      cur = cur.getParent();
    }
    return depth;
  }

  /** Place `block` at top-level `index`, re-spacing all top blocks. */
  private placeAtTopIndex(
    workspace: Blockly.WorkspaceSvg,
    block: Blockly.BlockSvg,
    targetIndex: number,
  ): void {
    const ids = workspace
      .getTopBlocks(true)
      .map((b) => b.id)
      .filter((id) => id !== block.id);
    const clamped = Math.max(0, Math.min(targetIndex, ids.length));
    ids.splice(clamped, 0, block.id);
    this.applyTopBlockOrder(workspace, ids);
  }

  /** Connect `source` into `target`'s statement chain before/after `target`. */
  private connectStatement(
    source: Blockly.BlockSvg,
    target: Blockly.BlockSvg,
    position: "before" | "after",
  ): void {
    if (!source.previousConnection) return;

    if (position === "before") {
      // Capture the connection target was attached to (parent slot, or prev's
      // nextConnection), then explicitly detach so chaining is unambiguous.
      const upstream = target.previousConnection?.targetConnection ?? null;
      target.previousConnection?.disconnect();

      if (upstream) {
        upstream.connect(source.previousConnection);
      }
      if (source.nextConnection && target.previousConnection) {
        source.nextConnection.connect(target.previousConnection);
      }
    } else {
      // Capture and detach the next block in chain so we can splice cleanly.
      const next = target.getNextBlock() as Blockly.BlockSvg | null;
      next?.previousConnection?.disconnect();

      if (target.nextConnection) {
        target.nextConnection.connect(source.previousConnection);
      }
      if (next?.previousConnection && source.nextConnection) {
        source.nextConnection.connect(next.previousConnection);
      }
    }
  }

  private applyTopBlockOrder(
    workspace: Blockly.WorkspaceSvg,
    orderedIds: string[],
  ): void {
    // Disable events around the bulk move so intermediate Y values can't
    // trigger codespace renders that read the workspace mid-update. Then
    // refresh the editors explicitly so they pick up the final state.
    const eventsDisabled = Blockly.Events.disable !== undefined;
    if (eventsDisabled) Blockly.Events.disable();
    try {
      for (let i = 0; i < orderedIds.length; i++) {
        const block = workspace.getBlockById(orderedIds[i]!) as Blockly.BlockSvg | null;
        if (!block) continue;
        block.moveTo(new Blockly.utils.Coordinate(20, 20 + i * 100));
      }
    } finally {
      if (eventsDisabled) Blockly.Events.enable();
    }
    Blockly.svgResize(workspace);
    this.codespace?.refresh();
    this.previewEditor?.refresh();
    this.codeEditor?.refresh();
  }

  /**
   * Mounts a read-only preview editor that renders the current mode's
   * `preview` element as text. Re-renders on workspace and mode changes.
   * If the active mode has no `preview` declared, the editor stays empty.
   */
  public async mountPreview(
    container: HTMLElement,
    options?: MorphicCodeEditorOptions,
  ): Promise<void> {
    if (!this.workspace || !this.mountConfig) {
      throw new Error(
        "MorphicBlocks must be mounted before mountPreview can be used.",
      );
    }

    this.previewEditor?.dispose();

    const mergedOptions: MorphicCodeEditorOptions = {
      ...options,
      highlightRules: options?.highlightRules ?? this.resolveHighlightRules("preview"),
      // Preview is read-only by design; the form-field underline marker is
      // only meaningful on the editable codespace, so suppress it here.
      showPlaceholderMarkers: options?.showPlaceholderMarkers ?? false,
    };

    this.previewEditor = new MorphicCodeEditor(
      container,
      this.workspace,
      () => this.generatePreviewText(),
      mergedOptions,
    );

    await this.previewEditor.mount();
  }

  private generatePreviewText(): MorphicCodeGenerationResult {
    if (!this.workspace || !this.mountConfig) {
      return { code: "", metadata: new Map(), placeholders: [] };
    }
    const previewMode = this.mountConfig.previewMode;
    const elementName = this.getActivePreviewElement();
    if (!previewMode || !elementName) {
      return { code: "", metadata: new Map(), placeholders: [] };
    }
    return generateTextFromWorkspace(
      this.workspace,
      previewMode,
      this.definitions,
      this.elementTypes,
      this.mountConfig.modes ?? [],
      elementName,
    );
  }

  /**
   * Write `newValue` to `edit.fieldName` on the Blockly block identified by
   * `edit.blockId`. The change event listener will trigger codespace re-sync.
   */
  private applyPlaceholderEdit(edit: MorphicPlaceholderEditTarget, newValue: string): void {
    if (!this.workspace) return;
    let block = this.workspace.getBlockById(edit.blockId);
    if (!block) return;

    // If the user is editing a shadow, materialize it as a real (non-shadow)
    // placeholder block of the same type. Two reasons:
    //   1. Persistence — `attachEmptyDefaults` resets shadows on every
    //      `applyView`; only real blocks are left alone.
    //   2. Semantics — the marker transitions from "default" (dim italic)
    //      to "set" (solid), matching the design: an edited value is no
    //      longer the framework's default.
    if (block.isShadow()) {
      const parentConn = block.outputConnection?.targetConnection;
      if (parentConn) {
        const real = this.workspace.newBlock(block.type) as Blockly.BlockSvg;
        // Copy the shadow's current field values onto the real block.
        for (const input of block.inputList) {
          for (const shadowField of input.fieldRow) {
            if (!shadowField.name) continue;
            const target = real.getField(shadowField.name);
            if (target) target.setValue(shadowField.getValue());
          }
        }
        if ((block as Blockly.BlockSvg).rendered) {
          real.initSvg();
          real.render();
        }
        // Connecting the real block disconnects the shadow but preserves the
        // stored shadow state on the connection (so removing the real block
        // would re-materialize the shadow).
        parentConn.connect(real.outputConnection!);
        block = real;
      }
    }

    const field = block.getField(edit.fieldName);
    if (!field) return;
    field.setValue(newValue);

    // Force re-render so the workspace SVG reflects the change even if the
    // workspace is currently hidden — without this, the visual can stay
    // stale until the next layout pass.
    const svg = block as Blockly.BlockSvg;
    if (svg.rendered && typeof svg.render === "function") svg.render();
    const parent = block.getParent();
    if (parent) {
      const parentSvg = parent as Blockly.BlockSvg;
      if (parentSvg.rendered && typeof parentSvg.render === "function") parentSvg.render();
    }
  }

  private deleteBlockAtCodespaceLine(line: number): void {
    const meta = this.codespace?.metadata;
    if (!this.workspace || !meta || meta.size === 0) return;

    // Pick the innermost block whose range contains the line.
    let bestId: string | null = null;
    let bestSize = Infinity;
    for (const [id, { startLine, endLine }] of meta) {
      if (line < startLine || line > endLine) continue;
      const size = endLine - startLine;
      if (size < bestSize) {
        bestSize = size;
        bestId = id;
      }
    }
    if (bestId) {
      this.workspace.getBlockById(bestId)?.dispose(true);
    }
  }

  private generateCodespaceText(): MorphicCodeGenerationResult {
    if (!this.workspace || !this.mountConfig) {
      return { code: "", metadata: new Map(), placeholders: [] };
    }
    const codespaceMode = this.mountConfig.codespaceMode;
    if (codespaceMode) {
      const modeDef = this.modeDef(codespaceMode);
      const elementOverride = modeDef
        ? resolveModeSourceElement(modeDef, this.elementTypes)
        : undefined;
      return generateTextFromWorkspace(
        this.workspace,
        codespaceMode,
        this.definitions,
        this.elementTypes,
        this.mountConfig.modes ?? [],
        elementOverride,
      );
    }
    return generateTextFromWorkspace(
      this.workspace,
      this.mountConfig.workspaceMode,
      this.definitions,
      this.elementTypes,
      this.mountConfig.modes ?? [],
    );
  }

  public showCodeEditor(): void {
    this.codeEditor?.show();
  }

  public hideCodeEditor(): void {
    this.codeEditor?.hide();
  }

  public isCodeEditorVisible(): boolean {
    return this.codeEditor?.isVisible() ?? false;
  }

  public setCodeEditorTheme(theme: MorphicCodeEditorTheme): void {
    this.codeEditor?.setTheme(theme);
  }

  public setCodespaceTheme(theme: MorphicCodeEditorTheme): void {
    this.codespace?.setTheme(theme);
  }

  public setPreviewTheme(theme: MorphicCodeEditorTheme): void {
    this.previewEditor?.setTheme(theme);
  }

  /**
   * Enable bidirectional selection sync between the Blockly workspace and every
   * currently-mounted editor (code editor, codespace, preview). Requires at
   * least one of those editors to be mounted first.
   */
  public enableSelectionSync(options?: MorphicSelectionSyncOptions): void {
    if (!this.workspace) {
      throw new Error(
        "MorphicBlocks must be mounted before enableSelectionSync can be used.",
      );
    }

    const editors = [this.codeEditor, this.codespace, this.previewEditor].filter(
      (e): e is MorphicCodeEditor => e !== undefined,
    );

    if (editors.length === 0) {
      throw new Error(
        "enableSelectionSync requires at least one of mountCodeEditor, mountCodespace, or mountPreview to have been called first.",
      );
    }

    this.selectionSync?.disable();
    this.selectionSync = new MorphicSelectionSync(
      this.workspace,
      editors,
      options,
    );
    this.selectionSync.enable();
  }

  /** Disable selection sync and clear any active highlights. */
  public disableSelectionSync(): void {
    this.selectionSync?.disable();
    this.selectionSync = undefined;
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

      const definition = this.definitions.get(toCleanId(block.type));
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

      const definition = this.definitions.get(toCleanId(block.type));
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
      // Register under the namespaced Blockly type so a developer's clean
      // identifier can never collide with a Blockly built-in (e.g. naming a
      // block `logic_boolean` no longer clobbers the stock block that shadows
      // and connection checks rely on). Definitions and behaviors stay keyed
      // by the clean identifier; see block-namespace.ts.
      const blocklyType = toBlocklyType(definition.identifier);
      if (this.registeredBlockTypes.has(blocklyType)) {
        continue;
      }

      const engine = this;
      Blockly.Blocks[blocklyType] = {
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

      this.registeredBlockTypes.add(blocklyType);
    }
  }

  private validateContainers(config: MorphicMountConfig): void {
    if (!config.workspaceContainer && !config.codespaceContainer) {
      throw new Error(
        "MorphicBlocks.mount requires at least one of workspaceContainer or codespaceContainer.",
      );
    }

    if (config.codespaceMode && !config.codespaceContainer) {
      throw new Error(
        "MorphicBlocks.mount: codespaceMode requires a codespaceContainer.",
      );
    }
  }

  private createHeadlessHost(): HTMLElement {
    const host = document.createElement("div");
    host.style.cssText =
      "position:absolute;left:-9999px;top:-9999px;width:800px;height:600px;overflow:hidden;";
    document.body.appendChild(host);
    this.headlessWorkspaceHost = host;
    return host;
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

    // Apply category color before applyBlockView so the internal render() uses it.
    // Only used when the definition has no explicit color of its own.
    if (definition.color === undefined && category?.color !== undefined) {
      block.setColour(category.color);
    }

    // Preserve user-added field values (dropdowns, text inputs, etc.) across re-renders
    const savedFieldValues = captureFieldValues(block);

    const view = resolveBlockView(definition, mode, this.elementTypes, this.mountConfig?.modes ?? []);
    // Empty-default shadows should only attach on the engine's main editing
    // workspace — not on the toolbox-canvas preview workspace (used for SVG
    // snapshots) and not on the Blockly flyout. Pass elementTypes only when
    // the block is actually on the main workspace.
    const isMainWorkspace = block.workspace === this.workspace;
    applyBlockView({
      block,
      definition,
      view,
      mode,
      context,
      elementTypes: isMainWorkspace ? this.elementTypes : undefined,
      resolveBlocklyType: (ref) => resolveBlocklyType(ref, this.definitions),
    });
    applyBlockCategoryClass(block, category?.token);

    // Stamp the stable per-block identifier class so mode CSS can target it
    applyBlockIdentifierClass(block, definition.identifier);

    // Apply mode-scoped CSS color via --morphic-block-color (Tier 2). This runs
    // after all classes are applied so the computed style reflects the cascade.
    applyBlockColorFromCSS(block);

    // Re-apply per-block color so it wins over CSS (Tier 3 — highest priority).
    // The principle is "more specific wins": an explicit `definition.color` is
    // a per-block assertion that should not be silently overruled when the
    // active mode changes the CSS theme.
    if (definition.color !== undefined) {
      block.setColour(definition.color);
      if (block.rendered) block.render();
    }

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

    const container = this.mountConfig.workspaceHost;
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
      const definition = this.definitions.get(toCleanId(svgBlock.type));
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
      const definition = this.definitions.get(toCleanId(svgBlock.type));
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
      const color = def.color ?? this.blockCategoryIndex.get(id)?.color;
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
        color: category.color,
      });

      // Index blocks from explicit `category.blocks` list if provided
      if (category.blocks) {
        for (const type of category.blocks) {
          if (!index.has(type)) {
            index.set(type, { token, color: category.color });
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

      const definition = this.definitions.get(toCleanId(block.type));
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
  color?: string;
}
