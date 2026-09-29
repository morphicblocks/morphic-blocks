import * as Blockly from "blockly";
import { getLifecycleBehavior } from "./behavior-runtime";
import {
  applyBlockCategoryClass,
  applyBlockView,
  applyBlockIdentifierClass,
  applyBlockColorFromCSS,
  applyRootModeClasses,
  applyTextViewModeClass,
  captureFieldValues,
  decorateBlockRoot,
  isOnCanvas,
  restoreFieldValues,
  type MorphicManagedBlock,
} from "./block-view";
import { BLOCK_ID_DRAG_KEY, MorphicCodeEditor, getActiveGripDragSourceId, setActiveGripDragSourceId } from "./code-editor";
import { resolveBlocklyType, toBlocklyType, toCleanId } from "./block-namespace";
import { generateJavaScriptFromWorkspace, generateJavaScriptWithMetadataFromWorkspace } from "./codegen";
import { generateTextFromWorkspace } from "./template-codegen";
import { MorphicSelectionSync } from "./selection-sync";
import { applyBlockShapes, createDefinitionMap, expandDefaultElements } from "./definitions";
import { applyFont, measuredFont, readCssFont, remeasureBlocks, type MorphicBlockFont } from "./block-font";
import { validateDefinitions } from "./validate-definitions";
import { withCodeSettings } from "./element-types";
import { formatValue } from "./value-format";
import { MorphicStyleManager, type MorphicModeStyle } from "./styles";
import { toModeClassToken } from "./template";
import { DRAG_DATA_KEY, MorphicToolboxCanvas } from "./toolbox-canvas";
import { buildToolboxDefinition } from "./toolbox";
import { resolveBlockView, resolveModeSourceElement } from "./view-resolver";
import { renderToolbar, toolbarItems, type MorphicToolbarHandle } from "./toolbar";
import type {
  MorphicBehaviorContext,
  MorphicBehaviorMap,
  MorphicBlockDefinition,
  MorphicBlocksFormat,
  MorphicBlocksFormatJson,
  MorphicCodeBlockPosition,
  MorphicCodeEditorOptions,
  MorphicCodeEditorTheme,
  MorphicCodeGenerationResult,
  MorphicCodeElementConfig,
  MorphicElementTypeEntry,
  MorphicHighlightDefinition,
  MorphicModeDefinition,
  MorphicModeName,
  MorphicMountConfig,
  MorphicPlaceholderEditTarget,
  MorphicPresetDefinition,
  MorphicPresetToolbox,
  MorphicRenderContext,
  MorphicRunOutputLine,
  MorphicRunResult,
  MorphicSelectionSyncOptions,
  MorphicToolbarPane,
  MorphicToolbarConfig,
  MorphicToolboxCanvasOptions,
  MorphicToolboxCategory,
  MorphicViewHandle,
  MorphicViewKind,
  MorphicViewOptions,
} from "./types";

/**
 * Parses a Vite `import.meta.glob` result for a CSS folder into MorphicModeStyle entries.
 * Handles both `{ eager: true, as: 'url' }` (string values) and
 * `{ eager: true, query: '?url' }` ({ default: string } values).
 */
/**
 * A mode's stylesheet given as one string: CSS text or a link to a CSS file.
 * CSS always contains a `{` and a link never does, so the string itself says
 * which it is.
 */
function modeStyleFrom(mode: MorphicModeName, source: string): MorphicModeStyle {
  return source.includes("{") ? { mode, cssText: source } : { mode, href: source };
}

/**
 * Mode stylesheets from a folder import such as Vite's `import.meta.glob`,
 * named after their files (`modes/py.css` styles mode `py`). Each value may be
 * a link (`?url`) or the CSS itself (`?raw`, `?inline`), directly or as a
 * module's default export.
 */
function parseModeStylesFromFolder(
  folder: Record<string, unknown>,
): MorphicModeStyle[] {
  const styles: MorphicModeStyle[] = [];
  for (const [path, value] of Object.entries(folder)) {
    const filename = path.split("/").pop() ?? path;
    const mode = filename.replace(/\.css$/i, "");
    const source =
      typeof value === "string"
        ? value
        : typeof value === "object" && value !== null && "default" in value
          ? String((value as Record<string, unknown>)["default"])
          : undefined;
    if (source) styles.push(modeStyleFrom(mode, source));
  }
  return styles;
}

/** Internal resolved config: workspaceMode, toolboxMode and workspaceHost are guaranteed non-optional. */
type MorphicResolvedMountConfig = Omit<MorphicMountConfig, "modeStyles"> & {
  /** Every mode stylesheet, from `modesFolder` and `modeStyles` combined. */
  modeStyles: MorphicModeStyle[];
  workspaceMode: MorphicModeName;
  toolboxMode: MorphicModeName;
  /** Independent mode for the codespace; its source element is rendered there. */
  codespaceMode?: MorphicModeName;
  /** Mode for the preview editor; its source element is rendered there. */
  previewMode?: MorphicModeName;
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

/**
 * Blockly keeps one global table of block types for the whole page, while each
 * engine has its own definitions, modes and behaviors. A block's `init`
 * therefore asks which engine owns the workspace it is created in and lets that
 * engine build it, so several editors can share a page. A workspace no engine
 * has claimed falls back to the engine that registered the type most recently.
 */
/** A view added with `addView()`, as the engine keeps it. */
interface AddedView {
  kind: MorphicViewKind;
  /** The given name, or one the engine made up. */
  name: string;
  container: HTMLElement;
  mode: MorphicModeName;
  /** A preview's text editor. */
  editor?: MorphicCodeEditor;
  /** A workspace view's own, read only Blockly workspace. */
  workspace?: Blockly.WorkspaceSvg;
  /** Removes what the view set up besides its editor or workspace. */
  teardown?: () => void;
  /** The handle's `setMode`, used when a preset switches the view. */
  setMode?: (mode: MorphicModeName) => void;
}

/**
 * Any view by name: the ones `mount()` sets up are named `workspace`,
 * `codespace` and `preview`; added views carry their own name. Features that
 * act on "a view" (toolbars, zoom, copy) look it up here, so they work for
 * every view alike.
 */
interface ResolvedView {
  name: string;
  kind: "workspace" | "codespace" | "preview";
  mode: MorphicModeName | undefined;
  /** The text editor of a codespace or preview. */
  editor?: MorphicCodeEditor;
  /** The Blockly workspace of a workspace view. */
  workspace?: Blockly.WorkspaceSvg;
  /** Shows the program but cannot change it. */
  readOnly: boolean;
}

/** Where Blockly's media is loaded from unless the host sets `blockly.media`. */
const DEFAULT_BLOCKLY_MEDIA = "blockly-media/";

/** Media folders already checked on this page, so each is checked once. */
const checkedMedia = new Set<string>();

/**
 * Tell the developer when Blockly's media is missing, since icons then vanish
 * and sounds stay silent without any error. Blockly draws its trash can and
 * zoom controls from `sprites.png`, so checking it asks for a file the page
 * loads anyway.
 */
function warnWhenMediaMissing(media: string): void {
  if (checkedMedia.has(media) || typeof Image === "undefined") return;
  checkedMedia.add(media);
  const probe = new Image();
  probe.onerror = () => {
    console.warn(
      `[MorphicBlocks] Blockly's media is missing at "${media}", so icons are not shown and sounds stay silent. ` +
        `Copy it there with "morphic-blocks copy-media <folder>", or point blockly.media to where it is.`,
    );
  };
  probe.src = `${media}sprites.png`;
}

const workspaceOwners = new WeakMap<Blockly.Workspace, MorphicBlocks>();
const fallbackOwners = new Map<string, MorphicBlocks>();

/**
 * Blockly marks a block as an insertion marker (the preview drawn while
 * dragging) only after its `init`, which already gave it default shadows.
 * When the dragged block replaces an occupied slot, Blockly moves the old
 * block into the marker's input, and a shadow there breaks the drag. So a
 * marker drops its shadows the moment it becomes one.
 */
function dropShadowsWhenMarker(block: Blockly.BlockSvg): void {
  const setInsertionMarker = block.setInsertionMarker;
  block.setInsertionMarker = function (this: Blockly.BlockSvg, insertionMarker: boolean) {
    setInsertionMarker.call(this, insertionMarker);
    if (!insertionMarker) return;
    for (const input of this.inputList) {
      input.connection?.setShadowState(null);
    }
  };
}

export class MorphicBlocks extends EventTarget {
  private readonly definitions: Map<string, MorphicBlockDefinition>;
  private readonly behaviors: MorphicBehaviorMap;
  /** Element types with the mounted `code` settings folded in (see withCodeSettings). */
  private elementTypes: Record<string, MorphicElementTypeEntry>;
  private readonly formatElementTypes: Record<string, MorphicElementTypeEntry>;
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
  /** Views added with `addView()`, beside the ones `mount()` sets up. */
  private readonly views = new Set<AddedView>();
  /** The mode of each added workspace, read when its blocks are built. */
  private readonly viewWorkspaceModes = new WeakMap<Blockly.Workspace, MorphicModeName>();
  /** Numbers added views that are not given a name. */
  private viewCount = 0;
  private selectionSync?: MorphicSelectionSync;
  private toolboxDefinition?: NonNullable<Blockly.BlocklyOptions["toolbox"]>;
  /** Container the preview editor was mounted into. */
  private previewHost?: HTMLElement;
  private blockCategoryIndex = new Map<string, MorphicBlockCategoryMeta>();
  private appliedWorkspaceClasses: string[] = [];
  private appliedToolboxFlyoutClasses: string[] = [];
  private appliedToolboxShellClasses: string[] = [];
  /** Offscreen div created when no user-supplied workspaceContainer is present. */
  private headlessWorkspaceHost?: HTMLElement;
  /** Teardown fn for codespace drag/drop listeners; set when codespace is mounted. */
  private codespaceDropTeardown?: () => void;
  /** Redraws the workspace whenever its container changes size. */
  private workspaceResizeObserver?: ResizeObserver;
  /** Preset most recently applied, at mount or via `applyPreset`. */
  private activePreset?: MorphicPresetDefinition;
  /** The workspace's theme and font before any mode's CSS font was applied. */
  private baseTheme?: Blockly.Theme;
  private baseFont?: MorphicBlockFont;
  /** Counts mounts, so async view setup can tell it was superseded. */
  private mountGeneration = 0;
  /** Options of the active selection sync, reused when an editor is replaced. */
  private selectionSyncOptions?: MorphicSelectionSyncOptions;

  /** Format-level fields remembered from the constructor and used as `mount()`
   * defaults, so the developer hands the whole definitions file in once and the
   * runtime `mount()` call only carries DOM / runtime concerns. */
  private readonly formatModes?: MorphicModeDefinition[];
  private readonly formatPresets?: MorphicPresetDefinition[];
  private readonly formatCode?: Record<string, MorphicCodeElementConfig>;
  /** The definitions still use the old top level `highlighting` map. */
  private readonly formatHasHighlighting: boolean;
  private readonly formatCategories?: MorphicToolboxCategory[];

  /**
   * Build an engine from a whole definitions file plus its behaviors — the two
   * artifacts a developer authors. `blocks` and `elementTypes` configure the
   * engine; `modes` / `presets` / `highlighting` / `categories` are remembered
   * as defaults for `mount()` / `mountToolbox()` (a call may still override them).
   */
  public constructor(
    // A JSON import is accepted as is; mount() validates its values.
    formatInput: MorphicBlocksFormat | MorphicBlocksFormatJson,
    behaviors: MorphicBehaviorMap = {},
  ) {
    super();
    const format = formatInput as MorphicBlocksFormat;
    this.definitions = createDefinitionMap(
      applyBlockShapes(expandDefaultElements(format.blocks, format.elementTypes ?? {})),
    );
    this.behaviors = behaviors;
    this.formatElementTypes = format.elementTypes ?? {};
    this.elementTypes = withCodeSettings(this.formatElementTypes, format.code);
    this.formatModes = format.modes;
    this.formatPresets = format.presets;
    this.formatCode = format.code;
    this.formatHasHighlighting = "highlighting" in format;
    this.formatCategories = format.categories;
  }

  /**
   * Set the editor up. Everything given a container is mounted: workspace,
   * toolbox, codespace, preview, code editor and toolbars. The workspace is
   * ready as soon as this returns; the returned promise settles once the text
   * editors, which load in the background, are ready too.
   */
  public mount(inputConfig: MorphicMountConfig): Promise<void> {
    this.dispose();

    // Fill unset format-level fields from the definitions file handed to the
    // constructor, so a mount call only needs its DOM / runtime options.
    const config: MorphicMountConfig = {
      ...inputConfig,
      // A copy, so changing a mode's elements at runtime leaves the host's own list alone.
      modes: (inputConfig.modes ?? this.formatModes)?.slice(),
      presets: inputConfig.presets ?? this.formatPresets,
      code: inputConfig.code ?? this.formatCode,
      toolbox:
        inputConfig.toolbox || this.formatCategories
          ? {
              ...inputConfig.toolbox,
              categories:
                inputConfig.toolbox?.categories ?? this.formatCategories,
            }
          : undefined,
    };

    // Derive modeStyles from modesFolder (Vite glob) when provided
    const folderStyles = config.modesFolder
      ? parseModeStylesFromFolder(config.modesFolder as Record<string, unknown>)
      : [];
    const mergedModeStyles = [
      ...folderStyles,
      ...Object.entries(config.modeStyles ?? {})
        .filter(([mode]) => !folderStyles.some((f) => f.mode === mode))
        .map(([mode, source]) => modeStyleFrom(mode, source)),
    ];

    // The mounted code settings reach the renderers through the element types.
    this.elementTypes = withCodeSettings(this.formatElementTypes, config.code);

    // Definitions: static cross-field validation (silent-failure guards).
    this.validateDefinitions(config);

    // Presets: validate and resolve the initial one (drives the initial modes).
    this.validatePresets(config);
    const initialPreset = config.presets?.length
      ? (config.presets.find((p) => p.name === config.preset) ?? config.presets[0])
      : undefined;
    if (config.preset && !initialPreset) {
      throw new Error(`MorphicBlocks.mount: unknown preset "${config.preset}".`);
    }

    // Without a preset, start in the first declared mode; a folder import's
    // file order is alphabetical, so a stylesheet only decides when no modes
    // are declared.
    const declaredModeNames = (config.modes ?? []).map((mode) => mode.name);
    const defaultMode =
      declaredModeNames[0] ?? mergedModeStyles[0]?.mode ?? "default";
    const initialToolbox = initialPreset
      ? normalizePresetToolbox(initialPreset.toolbox)
      : undefined;
    const workspaceMode = initialPreset
      ? (initialPreset.workspace ?? initialPreset.codespace ?? defaultMode)
      : defaultMode;
    const toolboxMode = initialToolbox
      ? initialToolbox.mode
      : defaultMode;
    const toolboxRender = initialToolbox?.render;
    const codespaceMode = initialPreset?.codespace;
    const previewMode = initialPreset?.preview;

    this.validateContainers(config);

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
      // A toolbox container means the custom HTML toolbox.
      canvasToolbox: config.canvasToolbox ?? !!config.toolboxContainer,
    };

    this.mountConfig = resolvedConfig;

    this.styles.validateModeCoverage(mergedModeStyles, declaredModeNames);
    if (resolvedConfig.modes?.length) {
      this.styles.ensureModeVisibilityStyles(resolvedConfig.modes);
    }
    this.styles.ensureStyles(resolvedConfig.baseStyle, mergedModeStyles);
    // A mode stylesheet that is still loading may change the block font, and
    // web fonts change text widths once they arrive.
    for (const link of Array.from(document.head.querySelectorAll<HTMLLinkElement>('link[data-morphic-source^="mode:"]'))) {
      if (!link.sheet) link.addEventListener("load", this.onStylesLoaded, { once: true });
    }
    document.fonts?.addEventListener("loadingdone", this.onStylesLoaded);
    this.blockCategoryIndex = this.createCategoryIndex(
      resolvedConfig.toolbox,
      resolvedConfig,
    );
    this.styles.ensureCategoryStyles(resolvedConfig.toolbox?.categories ?? []);
    this.registerBlocks();
    this.toolboxDefinition = this.resolveToolboxDefinition(resolvedConfig);

    const blocklyOptions = resolvedConfig.blockly ?? {};

    this.workspace = Blockly.inject(resolvedConfig.workspaceHost, {
      ...blocklyOptions,
      // Without a folder of its own, Blockly loads its images and sounds from
      // Google's server. The default is the app's own copy next to the page
      // (`npx morphic-blocks copy-media`); a host sets `media` to choose.
      media: blocklyOptions.media ?? DEFAULT_BLOCKLY_MEDIA,
      ...(resolvedConfig.canvasToolbox ? {} : { toolbox: this.toolboxDefinition }),
    });
    this.workspace.addChangeListener(this.onWorkspaceChange);
    workspaceOwners.set(this.workspace, this);
    this.baseTheme = this.workspace.getTheme();
    this.baseFont = measuredFont(this.workspace);
    if (config.workspaceContainer) warnWhenMediaMissing(this.workspace.options.pathToMedia);

    // The framework owns the workspace, so it keeps Blockly's SVG sized to its
    // container: pane toggles, window resizes and divider drags all change the
    // container size, and the host never has to call Blockly itself. A headless
    // workspace has nothing visible to size.
    if (config.workspaceContainer && typeof ResizeObserver !== "undefined") {
      const workspace = this.workspace;
      this.workspaceResizeObserver = new ResizeObserver(() => Blockly.svgResize(workspace));
      this.workspaceResizeObserver.observe(config.workspaceContainer);
    }

    this.applyWorkspaceContainerClass();
    this.syncWorkspaceFont();
    this.refreshToolbox();
    this.bindFlyoutWorkspace();
    this.renderWorkspaceBlocks();
    this.renderFlyoutBlocks();

    if (config.toolboxContainer) {
      this.mountToolbox(config.toolboxContainer);
    }

    this.activePreset = initialPreset;
    if (initialPreset) resolvedConfig.onPresetApplied?.(initialPreset);

    return this.mountViews(config, ++this.mountGeneration);
  }

  /**
   * Set up the text editors and what depends on them (toolbars, selection
   * sync). Runs after the synchronous part of `mount()`; bails out quietly
   * when the engine was disposed or mounted again meanwhile.
   */
  private async mountViews(config: MorphicMountConfig, generation: number): Promise<void> {
    const editorOptions = config.editorTheme ? { theme: config.editorTheme } : undefined;
    const previewTheme = config.previewTheme ?? config.editorTheme;
    const pending: Promise<void>[] = [];
    if (config.codespaceContainer) {
      pending.push(this.mountCodespace(editorOptions));
    }
    if (config.previewContainer) {
      pending.push(this.mountPreview(config.previewContainer, previewTheme ? { theme: previewTheme } : undefined));
    }
    if (config.codeEditorContainer) {
      pending.push(this.mountCodeEditor(config.codeEditorContainer, editorOptions).then(() => {
        if (generation === this.mountGeneration) this.hideCodeEditor();
      }));
    }
    await Promise.all(pending);
    if (generation !== this.mountGeneration || !this.workspace) return;

    for (const [pane, container] of Object.entries(config.toolbarContainers ?? {})) {
      if (container) this.mountToolbar(container, { pane: pane as MorphicToolbarPane });
    }

    const viewCount =
      (config.workspaceContainer ? 1 : 0) + pending.length;
    const wantsSync = config.selectionSync ?? viewCount > 1;
    if (wantsSync && pending.length > 0) {
      this.enableSelectionSync(typeof wantsSync === "object" ? wantsSync : undefined);
    }
  }

  /** Presets declared at mount (empty when none were provided). */
  public getPresets(): MorphicPresetDefinition[] {
    return [...(this.mountConfig?.presets ?? [])];
  }

  /**
   * The preset most recently applied, at mount or via `applyPreset`, so a host
   * can mark the active preset button without tracking it itself. `undefined`
   * when no preset has been applied. Lower level `setModes` calls do not
   * change it.
   */
  public getActivePreset(): MorphicPresetDefinition | undefined {
    return this.activePreset;
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
    for (const view of this.views) {
      const mode = preset.views?.[view.name];
      if (mode !== undefined && mode !== view.mode) view.setMode?.(mode);
    }
    this.activePreset = preset;
    this.mountConfig.onPresetApplied?.(preset);
    return preset;
  }

  /** Validate preset definitions against modes, element types, and containers. */
  /**
   * Static validation of the block definitions against the mount config. Warns
   * on degraded / dead config and throws (listing every structural problem at
   * once) on breakage that guarantees wrong output. See `validate-definitions`.
   */
  private validateDefinitions(config: MorphicMountConfig): void {
    const { errors, warnings } = validateDefinitions({
      definitions: this.definitions,
      elementTypes: this.formatElementTypes,
      behaviors: this.behaviors,
      modes: config.modes,
      presets: config.presets,
      code: config.code,
      categories: config.toolbox?.categories,
    });
    // Moved in 0.3.0: named here so an upgrade fails with directions.
    if (this.formatHasHighlighting || "highlighting" in config) {
      errors.push(
        'The top level "highlighting" map moved into the "code" section: "code": { "<element>": { "highlighting": { … } } }.',
      );
    }
    if (warnings.length > 0) {
      console.warn(
        `[MorphicBlocks] Definition warnings:\n- ${warnings.join("\n- ")}`,
      );
    }
    if (errors.length > 0) {
      throw new Error(
        `[MorphicBlocks] Invalid definitions:\n- ${errors.join("\n- ")}`,
      );
    }
  }

  private validatePresets(config: Pick<MorphicMountConfig, "presets" | "modes" | "codespaceContainer">): void {
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

      for (const [viewName, mode] of Object.entries(preset.views ?? {})) {
        if (!modeByName.has(mode)) {
          throw new Error(`Preset "${preset.name}": unknown mode "${mode}" for view "${viewName}".`);
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
    for (const [blocklyType, owner] of fallbackOwners) {
      if (owner === this) fallbackOwners.delete(blocklyType);
    }
    this.workspaceResizeObserver?.disconnect();
    this.workspaceResizeObserver = undefined;
    document.fonts?.removeEventListener("loadingdone", this.onStylesLoaded);
    this.activePreset = undefined;

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
    this.previewHost = undefined;

    for (const view of this.views) this.disposeView(view);
    this.views.clear();

    this.toolboxCanvas?.dispose();
    this.toolboxCanvas = undefined;

    // Each handle's dispose drops it from the set and, with the last one,
    // removes the toolbar listener from the workspace.
    for (const handle of [...this.toolbars]) handle.dispose();

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
    this.baseTheme = undefined;
    this.baseFont = undefined;
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

    // Inherit the mount config's toolbox settings (categories already carry
    // the format's) when the call doesn't supply its own.
    const toolbox = this.mountConfig.toolbox;
    const canvasOptions: MorphicToolboxCanvasOptions = {
      ...options,
      blocks: options?.blocks ?? toolbox?.blocks,
      categories: options?.categories ?? toolbox?.categories,
      modeLabel: options?.modeLabel ?? toolbox?.modeLabel,
    };

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
      options: canvasOptions,
      onPreviewWorkspace: (workspace) => workspaceOwners.set(workspace, this),
    });
  }

  /**
   * The underlying Blockly workspace, for the rare case that needs Blockly
   * directly (e.g. creating blocks from code). Everyday use goes through the
   * engine. `undefined` before `mount`.
   */
  /**
   * Measure blocks and toolbox tiles again. Blockly measures block text only
   * when it draws a block, so call this after the app changes the block font
   * through its own CSS (a font size switch, say). Stylesheets and web fonts
   * that finish loading are handled already.
   */
  public refresh(): void {
    if (!this.workspace || !this.mountConfig) return;
    this.syncWorkspaceFont();
    remeasureBlocks(this.workspace);
    for (const view of this.views) {
      if (!view.workspace) continue;
      this.syncFontOf(view.workspace, view.container);
      remeasureBlocks(view.workspace);
    }
    this.toolboxCanvas?.rerender(this.mountConfig.toolboxMode, this.mountConfig.toolboxRender);
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

  /**
   * Change which elements a mode shows while the app runs, e.g. to let the
   * user pick what a toolbox tile shows. Every view using the mode is redrawn;
   * a mode a codespace or preview renders must keep a code element.
   */
  public setModeElements(mode: MorphicModeName, elements: string[]): void {
    if (!this.mountConfig || !this.workspace) {
      throw new Error(
        "MorphicBlocks must be mounted before setModeElements can be used.",
      );
    }
    const modes = this.mountConfig.modes ?? [];
    const index = modes.findIndex((m) => m.name === mode);
    if (index === -1) {
      throw new Error(`setModeElements: unknown mode "${mode}".`);
    }
    const unknown = elements.filter((name) => !(name in this.elementTypes));
    if (unknown.length > 0) {
      throw new Error(`setModeElements: unknown elements ${unknown.map((name) => `"${name}"`).join(", ")}.`);
    }
    const updated: MorphicModeDefinition = { ...modes[index]!, elements: [...elements] };
    const renderedAsText =
      (!!this.mountConfig.codespaceContainer && mode === this.getCodespaceMode()) ||
      mode === this.mountConfig.previewMode ||
      [...this.views].some((view) => view.mode === mode);
    if (renderedAsText && resolveModeSourceElement(updated, this.elementTypes) === undefined) {
      throw new Error(
        `setModeElements: mode "${mode}" is shown in a codespace or preview and needs a code element.`,
      );
    }
    const nextModes = modes.map((m, i) => (i === index ? updated : m));
    this.validatePresets({ ...this.mountConfig, modes: nextModes });

    // Replaced in place: the toolbox shares this list.
    const previousModes = modes.slice();
    modes[index] = updated;
    this.styles.ensureModeVisibilityStyles(modes, previousModes);

    if (mode === this.mountConfig.toolboxMode) {
      this.toolboxCanvas?.rerender(this.mountConfig.toolboxMode, this.mountConfig.toolboxRender);
      this.renderFlyoutBlocks();
    }
    if (mode === this.mountConfig.workspaceMode) {
      this.syncWorkspaceFont();
      this.renderWorkspaceBlocks();
    }
    this.codespace?.setHighlightRules(this.resolveHighlightRules("codespace"));
    this.previewEditor?.setHighlightRules(this.resolveHighlightRules("preview"));
    this.codespace?.refresh();
    this.previewEditor?.refresh();
    for (const view of this.views) {
      if (view.mode !== mode) continue;
      if (view.workspace) {
        this.styleWorkspaceView(view);
        this.renderWorkspaceView(view);
      }
      view.editor?.setHighlightRules(this.highlightRulesFor(view.mode));
      view.editor?.refresh();
    }
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
    // A built-in view's toolbar may be set up before its view is.
    const viewName = config.view ?? config.pane;
    if (!viewName) throw new Error("mountToolbar: set `view` (or `pane`).");
    const builtIn = ["workspace", "codespace", "preview"] as const;
    const resolved = this.resolveView(viewName);
    const kind = resolved?.kind ?? builtIn.find((name) => name === viewName);
    if (!kind) throw new Error(`mountToolbar: no view named "${viewName}".`);
    void this.styles.ensureToolbarStyles();
    // An added workspace shows the program but cannot change it.
    const items =
      config.items ?? (kind === "workspace" && resolved?.readOnly ? toolbarItems.readOnlyDefaults() : undefined);
    const handle = renderToolbar(container, { ...config, items }, {
      engine: this,
      pane: kind,
      view: viewName,
      getText: () => this.toolbarTextFor(viewName),
      refresh: () => this.toolbarRefreshFor(viewName),
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

  private toolbarTextFor(viewName: string): string {
    const view = this.resolveView(viewName);
    if (view?.kind === "codespace") {
      return view.editor?.getValue() ?? this.generateCodespaceText().code;
    }
    if (view?.kind === "preview") {
      return view.editor?.getValue() ?? "";
    }
    // An added workspace copies the program as its own mode writes it.
    if (view?.kind === "workspace" && view.readOnly) {
      return this.generateModeText(view.mode).code;
    }
    // Workspace: derive text from the codespace if mounted, else generate via JS codegen.
    if (this.codespace) return this.codespace.getValue();
    try {
      return this.generateJavaScript();
    } catch {
      return "";
    }
  }

  private toolbarRefreshFor(viewName: string): void {
    // Workspace has no separate refresh — Blockly redraws on its own events.
    this.resolveView(viewName)?.editor?.refresh();
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
    /**
     * Also print the program's lines to the browser console. Default `false`:
     * lines are only collected in `output`. Ignored when `console` is given,
     * since lines always go to a console the host passes in.
     */
    logToConsole?: boolean;
  }): MorphicRunResult {
    let code = "";
    let result: unknown = undefined;
    let error: Error | null = null;
    // Every printed line is collected with its level, so a host can show the
    // program's output on the page without writing its own console. Lines are
    // forwarded to the host's `console` option when given, or to the browser
    // console only when `logToConsole` is set.
    const output: MorphicRunOutputLine[] = [];
    const target = options?.console ?? (options?.logToConsole ? console : undefined);
    // Lines read like the language the codespace shows; a host console still
    // gets the values themselves.
    const element = this.getActivePrimarySourceElement();
    const format = element ? this.mountConfig?.code?.[element]?.values : undefined;
    const capture = (level: MorphicRunOutputLine["level"]) =>
      (...args: unknown[]): void => {
        output.push({ level, text: args.map((arg) => formatValue(arg, format)).join(" ") });
        if (target) (target[level] ?? target.log).apply(target, args);
      };
    const capturingConsole = { log: capture("log"), warn: capture("warn"), error: capture("error") };
    try {
      code = this.generateJavaScript();
      // eslint-disable-next-line @typescript-eslint/no-implied-eval
      result = new Function("console", code)(capturingConsole);
    } catch (e) {
      error = e instanceof Error ? e : new Error(String(e));
    }
    const detail: MorphicRunResult = { code, result, error, output };
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
  public copyActiveBlock(view: string): boolean {
    const block = this.resolveActiveBlock(view);
    if (!block) return false;
    const data = block.toCopyData();
    if (!data) return false;
    this.lastCopyData = data;
    // Mirror to system clipboard as code text — best-effort, fire-and-forget.
    try {
      const text = this.toolbarTextFor(view === "workspace" ? "codespace" : view);
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
  public pasteActiveBlock(_view: string): boolean {
    if (!this.lastCopyData || !this.workspace) return false;
    const pasted = Blockly.clipboard.paste(this.lastCopyData, this.workspace);
    return pasted !== null;
  }

  private resolveActiveBlock(viewName: string): Blockly.BlockSvg | null {
    // 1. Whatever Blockly currently has selected — selection-sync keeps this
    //    in lockstep with codespace/preview cursor clicks.
    const selected = Blockly.common.getSelected();
    if (selected && "id" in selected && this.workspace?.getBlockById((selected as { id: string }).id)) {
      return selected as Blockly.BlockSvg;
    }
    // 2. For a text view, fall back to the block at the cursor line.
    const editor = this.resolveView(viewName)?.editor;
    if (!editor) return null;
    const cursorLine = editor.getCursorLine();
    // Find the deepest (smallest range) block whose lines contain the cursor.
    let best: { id: string; size: number } | null = null;
    for (const [id, pos] of editor.metadata) {
      if (pos.startLine <= cursorLine && pos.endLine >= cursorLine) {
        const size = pos.endLine - pos.startLine;
        if (!best || size < best.size) best = { id, size };
      }
    }
    const block = best ? this.workspace?.getBlockById(best.id) : null;
    return (block as Blockly.BlockSvg | null | undefined) ?? null;
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
   * Adjust a view's zoom level, by view name. Direction is `"in" | "out" |
   * "fit"`. For the workspace this maps to `workspace.zoomCenter(±1)` /
   * `zoomToFit()`. For a text view it scales the editor's font-size.
   */
  public zoomPane(view: string, direction: "in" | "out" | "fit"): void {
    const resolved = this.resolveView(view);
    const workspace = resolved?.workspace;
    if (workspace) {
      if (direction === "in") workspace.zoomCenter(1);
      else if (direction === "out") workspace.zoomCenter(-1);
      else workspace.zoomToFit();
      return;
    }
    resolved?.editor?.adjustZoom(direction);
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

    // Workspace blocks follow only the workspace mode, so a toolbox change
    // alone leaves them as they are.
    if (modes.workspaceMode) {
      this.applyWorkspaceContainerClass();
      this.syncWorkspaceFont();
      this.renderWorkspaceBlocks();
    }
    this.applyTextViewClasses();
    this.refreshToolbox();
    this.bindFlyoutWorkspace();
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
    return this.mountConfig.code?.[elementName]?.highlighting;
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
      true,
    );

    const editor = this.codeEditor;
    await editor.mount();
    if (this.codeEditor !== editor) return;
    this.refreshSelectionSync();
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
      onDelete: options?.onDelete ?? ((line) => this.codespace && this.deleteBlockAtCodespaceLine(this.codespace, line)),
      canDragBlock: options?.canDragBlock ?? ((blockId) => this.canMoveInCodespace(blockId)),
      highlightRules: options?.highlightRules ?? this.resolveHighlightRules("codespace"),
      onPlaceholderApply:
        options?.onPlaceholderApply ?? ((edit, newValue) => this.applyPlaceholderEdit(edit, newValue)),
    };

    this.applyTextViewClasses();
    this.codespace = new MorphicCodeEditor(
      this.mountConfig.codespaceContainer,
      this.workspace,
      () => this.generateCodespaceText(),
      mergedOptions,
    );

    const codespace = this.codespace;
    await codespace.mount();
    // Disposed or replaced while CodeMirror was loading.
    if (this.codespace !== codespace) return;
    this.codespaceDropTeardown = this.attachCodespaceDropTarget(
      codespace,
      this.mountConfig.codespaceContainer,
      this.workspace,
    );
    this.refreshSelectionSync();
  }

  private attachCodespaceDropTarget(
    editor: MorphicCodeEditor,
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
      const drop = this.computeCodespaceDrop(editor, e.clientX, e.clientY);
      if (!drop) {
        editor.hideDropIndicator();
        editor.hideValueSlotHighlight();
        return;
      }
      if (drop.indicator.kind === "line") {
        editor.showDropIndicator(drop.indicator.line, drop.indicator.position);
        editor.hideValueSlotHighlight();
      } else {
        editor.showValueSlotHighlight(drop.indicator.from, drop.indicator.to);
        editor.hideDropIndicator();
      }
    };

    const onDragLeave = (e: DragEvent) => {
      const next = e.relatedTarget as Node | null;
      if (next && container.contains(next)) return;
      editor.hideDropIndicator();
      editor.hideValueSlotHighlight();
    };

    const onDrop = (e: DragEvent) => {
      if (!isCodespaceDrag(e)) return;
      e.preventDefault();
      editor.hideDropIndicator();
      editor.hideValueSlotHighlight();

      const aimed = this.computeCodespaceDrop(editor, e.clientX, e.clientY);
      if (!aimed) return;

      const blockType = e.dataTransfer?.getData(DRAG_DATA_KEY);
      const sourceId = e.dataTransfer?.getData(BLOCK_ID_DRAG_KEY);

      let block: Blockly.BlockSvg | null = null;
      if (blockType) {
        block = workspace.newBlock(resolveBlocklyType(blockType, this.definitions)) as Blockly.BlockSvg;
        // Placed before it is drawn: drawn first at 0,0, Blockly would push
        // blocks there out of its way.
        this.placeOrphanBelowTops(block);
        block.initSvg();
        block.render();
      } else if (sourceId) {
        block = workspace.getBlockById(sourceId) as Blockly.BlockSvg | null;
        if (!block) return;
      } else {
        return;
      }

      // A drop that does not fit changes nothing, like in the workspace; in a
      // top level chain the block lands as its own stack instead.
      const drop = this.fitOrLoose(workspace, block, aimed);
      if (!drop) {
        if (blockType) block.dispose(false);
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
      const drop = this.computeCodespaceDrop(editor, e.clientX, e.clientY);
      if (!drop) {
        editor.hideDropIndicator();
        editor.hideValueSlotHighlight();
        return;
      }
      if (drop.indicator.kind === "line") {
        editor.showDropIndicator(drop.indicator.line, drop.indicator.position);
        editor.hideValueSlotHighlight();
      } else {
        editor.showValueSlotHighlight(drop.indicator.from, drop.indicator.to);
        editor.hideDropIndicator();
      }
    };

    const onRightUp = (e: MouseEvent) => {
      window.removeEventListener("mousemove", onRightMove);
      window.removeEventListener("mouseup", onRightUp);
      editor.hideDropIndicator();
      editor.hideValueSlotHighlight();
      const state = rightDrag;
      rightDrag = null;
      setActiveGripDragSourceId(undefined);
      if (!state?.dragging) return;
      const drop = this.computeCodespaceDrop(editor, e.clientX, e.clientY);
      if (!drop) return;
      const block = workspace.getBlockById(state.sourceId) as Blockly.BlockSvg | null;
      if (!block) return;
      this.applyRightDragMove(workspace, block, drop);
    };

    const onMouseDown = (e: MouseEvent) => {
      if (!isSecondaryClick(e)) return;
      const charOffset = editor.charAtCoords(e.clientX, e.clientY);
      if (charOffset === null || charOffset === undefined) return;
      const block = this.findInnermostBlockAtChar(editor, charOffset);
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
      const charOffset = editor.charAtCoords(e.clientX, e.clientY);
      if (charOffset === null || charOffset === undefined) {
        editor.setHoverHighlight(null);
        editor.setEditableHoverHighlight(null);
        return;
      }
      const ph = this.findInnermostEditablePlaceholderAtChar(editor, charOffset);
      editor.setEditableHoverHighlight(
        ph ? { from: ph.start, to: ph.end } : null,
      );
      const block = this.findHoverBlockAtChar(editor, charOffset);
      if (!block) {
        editor.setHoverHighlight(null);
        return;
      }
      const pos = editor.metadata.get(block.id);
      if (!pos || pos.startChar === undefined || pos.endChar === undefined) {
        editor.setHoverHighlight(null);
        return;
      }
      editor.setHoverHighlight({ from: pos.startChar, to: pos.endChar });
    };
    const onHoverLeave = () => {
      editor.setHoverHighlight(null);
      editor.setEditableHoverHighlight(null);
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
  private findInnermostBlockAtChar(editor: MorphicCodeEditor, charOffset: number): Blockly.BlockSvg | null {
    if (!this.workspace) return null;
    let best: { id: string; size: number } | null = null;
    for (const [id, pos] of editor.metadata) {
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
  private findHoverBlockAtChar(editor: MorphicCodeEditor, charOffset: number): Blockly.BlockSvg | null {
    if (!this.workspace) return null;
    let bestNonAtomic: { id: string; size: number } | null = null;
    let bestAny: { id: string; size: number } | null = null;
    for (const [id, pos] of editor.metadata) {
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
  private findInnermostEditablePlaceholderAtChar(editor: MorphicCodeEditor, charOffset: number) {
    let best: { ph: { start: number; end: number; edit?: unknown }; size: number } | null = null;
    for (const ph of editor.getPlaceholders()) {
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
    drop = this.fitOrLoose(workspace, block, drop);
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
    editor: MorphicCodeEditor,
    clientX: number,
    clientY: number,
  ): {
    indicator:
      | { kind: "line"; line: number; position: "above" | "below" }
      | { kind: "value-slot"; from: number; to: number };
    target:
      | { kind: "top"; index: number }
      | {
          kind: "statement";
          targetBlockId: string;
          position: "before" | "after";
          /** Set in a top level chain: where the block lands as its own stack if it does not fit. */
          topIndex?: number;
        }
      | { kind: "into-slot"; parentBlockId: string; inputName: string }
      | { kind: "value-slot"; parentBlockId: string; inputName: string };
  } | null {
    if (!this.workspace) return null;
    const tops = this.workspace.getTopBlocks(true);
    const meta = editor.metadata;
    const lineCount = editor.getLineCount();

    if (tops.length === 0) {
      return {
        indicator: { kind: "line", line: 1, position: "above" },
        target: { kind: "top", index: 0 },
      };
    }

    if (editor.isBelowLastLine(clientY)) {
      const lastPos = meta.get(tops[tops.length - 1]!.id);
      return {
        indicator: { kind: "line", line: lastPos?.endLine ?? lineCount, position: "below" },
        target: { kind: "top", index: tops.length },
      };
    }

    const line = editor.getLineAtCoords(clientX, clientY);
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
    const charOffset = editor.charAtCoords(clientX, clientY);
    if (charOffset !== null) {
      const valueSlot = this.findValueSlotDropAtChar(editor, charOffset);
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
          const lowerHalf = editor.isInLowerHalfOfLine(line, clientY);
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

    // Top level: every block of a top level chain is a place to connect,
    // like a child in a slot; one that does not fit lands as its own stack.
    const dragSourceId = getActiveGripDragSourceId();
    for (let i = 0; i < tops.length; i++) {
      for (let member: Blockly.Block | null = tops[i]!; member; member = member.getNextBlock()) {
        if (member.id === dragSourceId) continue;
        const pos = meta.get(member.id);
        if (!pos) continue;
        if (line < pos.startLine || line > pos.endLine) continue;

        const onLastLine = line === pos.endLine;
        const lowerHalf = editor.isInLowerHalfOfLine(line, clientY);
        const after = onLastLine && lowerHalf;
        const isLast = after && !member.getNextBlock();
        return {
          indicator: after
            ? { kind: "line", line: pos.endLine, position: "below" }
            : { kind: "line", line: pos.startLine, position: "above" },
          target: {
            kind: "statement",
            targetBlockId: member.id,
            position: after ? "after" : "before",
            topIndex: isLast ? i + 1 : i,
          },
        };
      }
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
  /**
   * The drop as it will happen: unchanged when its connections fit, turned into
   * its own stack when it was aimed into a top level chain, `null` otherwise.
   */
  private fitOrLoose(
    workspace: Blockly.WorkspaceSvg,
    block: Blockly.BlockSvg,
    drop: NonNullable<ReturnType<MorphicBlocks["computeCodespaceDrop"]>>,
  ): NonNullable<ReturnType<MorphicBlocks["computeCodespaceDrop"]>> | null {
    if (this.codespaceDropAllowed(workspace, block, drop.target)) return drop;
    if (drop.target.kind === "statement" && drop.target.topIndex !== undefined) {
      return { ...drop, target: { kind: "top", index: drop.target.topIndex } };
    }
    return null;
  }

  /**
   * Whether a codespace drop makes only connections the workspace would make:
   * every connection it plans passes Blockly's connection checker, and no
   * block is left behind outside the chain. Checked before anything changes,
   * so a refused drop leaves the program as it was.
   */
  private codespaceDropAllowed(
    workspace: Blockly.WorkspaceSvg,
    block: Blockly.BlockSvg,
    target: NonNullable<ReturnType<MorphicBlocks["computeCodespaceDrop"]>>["target"],
  ): boolean {
    const fits = (a: Blockly.Connection | null | undefined, b: Blockly.Connection | null | undefined) =>
      !!a && !!b && workspace.connectionChecker.canConnect(a, b, false);
    if (target.kind === "top") return true;
    if (target.kind === "value-slot") {
      const parent = workspace.getBlockById(target.parentBlockId);
      return fits(parent?.getInput(target.inputName)?.connection, block.outputConnection);
    }
    if (target.kind === "into-slot") {
      const parent = workspace.getBlockById(target.parentBlockId);
      const slot = parent?.getInput(target.inputName)?.connection;
      let tail = slot?.targetBlock();
      while (tail?.getNextBlock() && tail.getNextBlock() !== block) tail = tail.getNextBlock();
      return tail && tail !== block ? fits(tail.nextConnection, block.previousConnection) : fits(slot, block.previousConnection);
    }
    const anchor = workspace.getBlockById(target.targetBlockId);
    if (!anchor || anchor === block) return false;
    if (target.position === "before") {
      const upstream = anchor.previousConnection?.targetConnection;
      if (upstream && upstream.getSourceBlock() !== block && !fits(upstream, block.previousConnection)) return false;
      // Without a connection below, the block would push the rest out of the chain.
      return fits(block.nextConnection, anchor.previousConnection);
    }
    const next = anchor.getNextBlock();
    if (!fits(anchor.nextConnection, block.previousConnection)) return false;
    return !next || next === block || fits(block.nextConnection, next.previousConnection);
  }

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
  private findValueSlotDropAtChar(editor: MorphicCodeEditor, charOffset: number): {
    parentBlockId: string;
    inputName: string;
    highlight: { from: number; to: number };
  } | null {
    if (!this.workspace) return null;
    const dragSourceId = getActiveGripDragSourceId();

    // 1. Empty value slots — placeholder ranges for a slot with no block in it.
    for (const ph of editor.getPlaceholders()) {
      if (charOffset < ph.start || charOffset >= ph.end) continue;
      // 1a. Truly empty slot ([TYPE] marker): the range carries its own
      //     parent + input, since there's no child block to walk up from.
      if (ph.emptySlot) {
        const { parentBlockId, inputName } = ph.emptySlot;
        if (parentBlockId === dragSourceId) continue;
        const parent = this.workspace.getBlockById(parentBlockId) as Blockly.BlockSvg | null;
        if (!parent?.getInput(inputName)?.connection) continue;
        return { parentBlockId, inputName, highlight: { from: ph.start, to: ph.end } };
      }
      // 1b. Shadow-filled slot: resolve via the shadow/placeholder block.
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
    for (const [id, pos] of editor.metadata) {
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
    // The slot's check applies as in the workspace; `codespaceDropAllowed`
    // has refused a value it does not accept.
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
      } else {
        // Above the first block of a stack: take the stack's place.
        source.moveTo(target.getRelativeToSurfaceXY());
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
      // Stacked by their real heights, so a tall block (an `if` with a body)
      // does not cover the next one, even while the workspace is hidden.
      let y = 20;
      for (const id of orderedIds) {
        const block = workspace.getBlockById(id) as Blockly.BlockSvg | null;
        if (!block) continue;
        block.moveTo(new Blockly.utils.Coordinate(20, y));
        y += block.getHeightWidth().height + 20;
      }
    } finally {
      if (eventsDisabled) Blockly.Events.enable();
    }
    Blockly.svgResize(workspace);
    this.refreshTextViews();
  }

  /** Write every text view again, added views included. */
  private refreshTextViews(): void {
    this.codespace?.refresh();
    this.previewEditor?.refresh();
    this.codeEditor?.refresh();
    for (const view of this.views) view.editor?.refresh();
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

    this.previewHost = container;
    this.applyTextViewClasses();
    this.previewEditor = new MorphicCodeEditor(
      container,
      this.workspace,
      () => this.generatePreviewText(),
      mergedOptions,
    );

    const preview = this.previewEditor;
    await preview.mount();
    if (this.previewEditor !== preview) return;
    this.refreshSelectionSync();
  }

  private generatePreviewText(): MorphicCodeGenerationResult {
    return this.generateModeText(this.mountConfig?.previewMode);
  }

  /** The program as `mode`'s source element writes it, as a preview shows it. */
  private generateModeText(mode: MorphicModeName | undefined): MorphicCodeGenerationResult {
    const modeDef = this.modeDef(mode);
    const elementName = modeDef ? resolveModeSourceElement(modeDef, this.elementTypes) : undefined;
    if (!this.workspace || !this.mountConfig || !mode || !elementName) {
      return { code: "", metadata: new Map(), placeholders: [] };
    }
    return generateTextFromWorkspace(
      this.workspace,
      mode,
      this.definitions,
      this.elementTypes,
      this.mountConfig.modes ?? [],
      elementName,
    );
  }

  /** Highlight rules of `mode`'s source element. */
  private highlightRulesFor(mode: MorphicModeName): MorphicHighlightDefinition | undefined {
    const modeDef = this.modeDef(mode);
    const elementName = modeDef ? resolveModeSourceElement(modeDef, this.elementTypes) : undefined;
    return elementName ? this.mountConfig?.code?.[elementName]?.highlighting : undefined;
  }

  /**
   * Add a view beside the ones `mount()` sets up, e.g. a second preview in
   * another mode. Returns a handle to change its mode or remove it; a new
   * `mount()` removes every added view.
   */
  public addView(options: MorphicViewOptions): MorphicViewHandle {
    if (!this.workspace || !this.mountConfig) {
      throw new Error("MorphicBlocks must be mounted before addView can be used.");
    }
    if (options.kind !== "preview" && options.kind !== "codespace" && options.kind !== "workspace") {
      throw new Error(`addView: unknown view kind "${String(options.kind)}".`);
    }
    if (options.kind === "workspace" && (options.editable as boolean | undefined) === true) {
      throw new Error("addView: an added workspace is read only for now (editable: false).");
    }
    if (options.name !== undefined && this.resolveView(options.name)) {
      throw new Error(`addView: a view named "${options.name}" already exists.`);
    }
    if (options.kind === "workspace") return this.addWorkspaceView(options);
    this.checkTextViewMode("addView", options.mode);

    // A codespace edits the program like the one `mount()` sets up; a
    // preview is read only, so the editing marker would mislead there.
    const editing = options.kind === "codespace";
    const editor: MorphicCodeEditor = new MorphicCodeEditor(
      options.container,
      this.workspace,
      () => this.generateModeText(view.mode),
      {
        theme: options.theme,
        highlightRules: this.highlightRulesFor(options.mode),
        ...(editing
          ? {
              onDelete: (line: number) => this.deleteBlockAtCodespaceLine(editor, line),
              canDragBlock: (blockId: string) => this.canMoveInCodespace(blockId),
              onPlaceholderApply: (edit: MorphicPlaceholderEditTarget, value: string) =>
                this.applyPlaceholderEdit(edit, value),
            }
          : { showPlaceholderMarkers: false }),
      },
    );
    const rootClass = editing ? "morphic-codespace-root" : "morphic-preview-root";
    let name = options.name;
    while (name === undefined || this.resolveView(name)) name = `view-${++this.viewCount}`;
    const view: AddedView = {
      kind: options.kind,
      name,
      container: options.container,
      mode: options.mode,
      editor,
    };
    this.views.add(view);
    applyTextViewModeClass(view.container, view.mode, rootClass);
    const toolbar = options.toolbar
      ? this.mountToolbar(options.toolbar.container, {
          view: name,
          items: options.toolbar.items,
          display: options.toolbar.display,
        })
      : undefined;

    const handle: MorphicViewHandle = {
      kind: view.kind,
      name: view.name,
      ready: editor.mount().then(() => {
        if (!this.views.has(view)) return;
        if (editing && this.workspace) {
          view.teardown = this.attachCodespaceDropTarget(editor, view.container, this.workspace);
        }
        this.linkAddedView();
      }),
      getMode: () => view.mode,
      setMode: (mode) => {
        if (!this.views.has(view)) return;
        this.checkTextViewMode("setMode", mode);
        view.mode = mode;
        applyTextViewModeClass(view.container, mode, rootClass);
        editor.setHighlightRules(this.highlightRulesFor(mode));
        editor.refresh();
        for (const handle of this.toolbars) handle.refresh();
      },
      setTheme: (theme) => editor.setTheme(theme),
      dispose: () => {
        if (!this.views.delete(view)) return;
        toolbar?.dispose();
        view.teardown?.();
        editor.dispose();
        this.refreshSelectionSync();
      },
    };
    view.setMode = handle.setMode;
    return handle;
  }

  /**
   * A read only Blockly workspace in its own mode that mirrors the main one:
   * it starts from a copy of the program and replays every change, the way
   * Blockly mirrors workspaces. Selection runs both ways through the main
   * workspace, so the text views follow a click in the mirror too.
   */
  private addWorkspaceView(options: MorphicViewOptions): MorphicViewHandle {
    const main = this.workspace!;
    if (!this.modeDef(options.mode)) throw new Error(`addView: unknown mode "${options.mode}".`);
    let name = options.name;
    while (name === undefined || this.resolveView(name)) name = `view-${++this.viewCount}`;

    // Drawn like the main workspace, never loading from elsewhere or playing sounds.
    const host = main.options;
    const mirror = Blockly.inject(options.container, {
      readOnly: true,
      media: host.pathToMedia,
      sounds: false,
      renderer: host.renderer,
      rendererOverrides: host.rendererOverrides ?? undefined,
      theme: this.baseTheme ?? host.theme,
      rtl: host.RTL,
      move: { scrollbars: true, drag: true, wheel: true },
    });
    workspaceOwners.set(mirror, this);
    this.viewWorkspaceModes.set(mirror, options.mode);
    const view: AddedView = {
      kind: "workspace",
      name,
      container: options.container,
      mode: options.mode,
      workspace: mirror,
    };
    this.views.add(view);
    this.styleWorkspaceView(view);

    // A fresh copy of the program, drawn in the view's mode.
    const copyProgram = (): void => {
      Blockly.Events.disable();
      try {
        Blockly.serialization.workspaces.load(Blockly.serialization.workspaces.save(main), mirror);
      } finally {
        Blockly.Events.enable();
      }
      this.renderWorkspaceView(view);
    };
    copyProgram();

    // Replaying single events cannot follow how the engine redraws blocks
    // (a slot default is removed and made again, and Blockly's events do not
    // say which block it belongs to). So after each batch of changes the
    // mirror takes a fresh copy, once, and shows the main selection again.
    let selectedId: string | null = null;
    let copyPending = false;
    const showSelection = (): void => {
      for (const block of mirror.getAllBlocks(false)) (block as Blockly.BlockSvg).unselect();
      (mirror.getBlockById(selectedId ?? "") as Blockly.BlockSvg | null)?.select();
    };
    const replay = (event: Blockly.Events.Abstract): void => {
      if (event.workspaceId !== main.id) return;
      if (event.type === Blockly.Events.SELECTED) {
        selectedId = (event as Blockly.Events.Selected).newElementId ?? null;
        showSelection();
        return;
      }
      if (event.isUiEvent || copyPending) return;
      copyPending = true;
      setTimeout(() => {
        copyPending = false;
        if (!this.views.has(view)) return;
        copyProgram();
        showSelection();
      }, 0);
    };
    main.addChangeListener(replay);

    // A click in the mirror selects the same block in the main workspace, so
    // every view highlights it; a click on an empty spot clears it. Blockly selects nothing in a read only
    // workspace, so the click is read from the drawing; a slot default stands
    // for the block that holds it, as in Blockly.
    const followClick = (event: MouseEvent): void => {
      const target = event.target as Element | null;
      const drawn = target?.closest?.("[data-id]");
      let block = drawn ? main.getBlockById(drawn.getAttribute("data-id") ?? "") : null;
      while (block?.isShadow()) block = block.getParent();
      if (block) Blockly.common.setSelected(block as Blockly.BlockSvg);
      // The background clears it, as in the other views; scrollbars do not.
      else if (target?.classList.contains("blocklyMainBackground")) Blockly.common.setSelected(null);
    };
    options.container.addEventListener("click", followClick);

    const resize = typeof ResizeObserver !== "undefined" ? new ResizeObserver(() => Blockly.svgResize(mirror)) : undefined;
    resize?.observe(options.container);

    const toolbar = options.toolbar
      ? this.mountToolbar(options.toolbar.container, {
          view: name,
          items: options.toolbar.items,
          display: options.toolbar.display,
        })
      : undefined;
    view.teardown = () => {
      main.removeChangeListener(replay);
      options.container.removeEventListener("click", followClick);
      resize?.disconnect();
      toolbar?.dispose();
    };

    const handle: MorphicViewHandle = {
      kind: "workspace",
      name,
      ready: Promise.resolve(),
      getMode: () => view.mode,
      setMode: (mode) => {
        if (!this.views.has(view)) return;
        if (!this.modeDef(mode)) throw new Error(`setMode: unknown mode "${mode}".`);
        view.mode = mode;
        this.viewWorkspaceModes.set(mirror, mode);
        this.styleWorkspaceView(view);
        this.renderWorkspaceView(view);
        for (const handle of this.toolbars) handle.refresh();
      },
      setTheme: () => {},
      dispose: () => {
        if (!this.views.delete(view)) return;
        this.disposeView(view);
      },
    };
    view.setMode = handle.setMode;
    return handle;
  }

  /** The mode's classes and block font on an added workspace. */
  private styleWorkspaceView(view: AddedView): void {
    if (!view.workspace) return;
    applyRootModeClasses(view.container, view.mode, "workspace", "morphic-workspace-root");
    this.syncFontOf(view.workspace, view.container);
  }

  /** Draw every block of an added workspace in the view's mode. */
  private renderWorkspaceView(view: AddedView): void {
    for (const block of view.workspace?.getAllBlocks(false) ?? []) {
      const definition = this.definitions.get(toCleanId(block.type));
      if (definition) this.applyView(block as Blockly.BlockSvg, definition, view.mode, "workspace");
    }
  }

  /** Remove an added view and everything it set up. */
  private disposeView(view: AddedView): void {
    view.teardown?.();
    view.editor?.dispose();
    view.workspace?.dispose();
  }

  /**
   * Take a ready added view into selection sync: relink an active sync, or
   * start one now that more than one view is shown, as `mount()` would have,
   * unless the host turned it off.
   */
  private linkAddedView(): void {
    if (this.selectionSync) {
      this.refreshSelectionSync();
      return;
    }
    const wanted = this.mountConfig?.selectionSync;
    if (wanted === false || !this.mountConfig?.workspaceContainer) return;
    this.enableSelectionSync(typeof wanted === "object" ? wanted : undefined);
  }

  /** A view by name, built in or added; `undefined` when there is none. */
  private resolveView(name: string): ResolvedView | undefined {
    if (name === "workspace") {
      return this.workspace
        ? { name, kind: "workspace", mode: this.mountConfig?.workspaceMode, workspace: this.workspace, readOnly: false }
        : undefined;
    }
    if (name === "codespace") {
      return this.mountConfig?.codespaceContainer
        ? { name, kind: "codespace", mode: this.getCodespaceMode(), editor: this.codespace, readOnly: false }
        : undefined;
    }
    if (name === "preview") {
      return this.previewHost
        ? { name, kind: "preview", mode: this.mountConfig?.previewMode, editor: this.previewEditor, readOnly: true }
        : undefined;
    }
    for (const view of this.views) {
      if (view.name === name) {
        return {
          name,
          kind: view.kind,
          mode: view.mode,
          editor: view.editor,
          workspace: view.workspace,
          readOnly: view.kind !== "codespace",
        };
      }
    }
    return undefined;
  }

  /** The mode a view shows, by name (`workspace`, `codespace`, `preview`, or an added view's). */
  public getViewMode(name: string): MorphicModeName | undefined {
    return this.resolveView(name)?.mode;
  }

  /** A text view's mode must exist and have a code element to render. */
  private checkTextViewMode(caller: string, mode: MorphicModeName): void {
    const modeDef = this.modeDef(mode);
    if (!modeDef) throw new Error(`${caller}: unknown mode "${mode}".`);
    if (resolveModeSourceElement(modeDef, this.elementTypes) === undefined) {
      throw new Error(`${caller}: mode "${mode}" has no code element to render.`);
    }
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

  /**
   * Whether a codespace grip may move the block: statement blocks
   * (previousConnection) and value blocks (outputConnection), so the
   * codespace mirrors Blockly's full set of moveable blocks.
   */
  private canMoveInCodespace(blockId: string): boolean {
    const block = this.workspace?.getBlockById(blockId);
    return !!(block?.previousConnection || block?.outputConnection);
  }

  private deleteBlockAtCodespaceLine(editor: MorphicCodeEditor, line: number): void {
    const meta = editor.metadata;
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

    const editors = [
      this.codeEditor,
      this.codespace,
      this.previewEditor,
      ...[...this.views].map((view) => view.editor),
    ].filter((e): e is MorphicCodeEditor => e !== undefined);

    if (editors.length === 0) {
      throw new Error(
        "enableSelectionSync requires at least one of mountCodeEditor, mountCodespace, or mountPreview to have been called first.",
      );
    }

    this.selectionSync?.disable();
    this.selectionSyncOptions = options;
    this.selectionSync = new MorphicSelectionSync(
      this.workspace,
      editors,
      options,
    );
    this.selectionSync.enable();
  }

  /**
   * Rebuild an active selection sync after an editor was (re)mounted, so it
   * links the current editors rather than a disposed one.
   */
  private refreshSelectionSync(): void {
    if (!this.selectionSync) return;
    const anyEditor =
      this.codeEditor || this.codespace || this.previewEditor || [...this.views].some((view) => view.editor);
    if (anyEditor) this.enableSelectionSync(this.selectionSyncOptions);
    else this.disableSelectionSync();
  }

  /** Disable selection sync and clear any active highlights. */
  public disableSelectionSync(): void {
    this.selectionSync?.disable();
    this.selectionSync = undefined;
    this.selectionSyncOptions = undefined;
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

      // A block built in this mode at its creation only needs its drawing
      // styled. Building it again would remake its slot defaults, which
      // Blockly draws at 0,0 before connecting them, bumping blocks there.
      const mode = this.mountConfig.workspaceMode;
      const managed = block as MorphicManagedBlock;
      if (managed.__morphicMode === mode && managed.__morphicContext === "workspace" && block.getSvgRoot()) {
        decorateBlockRoot(block, mode, "workspace");
        this.styleBlock(block, definition);
        continue;
      }
      this.applyView(block, definition, mode, "workspace");
      if (!block.getSvgRoot()) {
        this.deferApplyView(id, mode, "workspace");
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
      fallbackOwners.set(blocklyType, this);
      if (this.registeredBlockTypes.has(blocklyType)) {
        continue;
      }

      // The entry is the same for every engine: it only finds the engine that
      // owns the workspace and hands the block to it.
      const identifier = definition.identifier;
      Blockly.Blocks[blocklyType] = {
        init(this: Blockly.BlockSvg) {
          const owner = workspaceOwners.get(this.workspace) ?? fallbackOwners.get(blocklyType);
          owner?.initManagedBlock(this, identifier);
        },
      };

      this.registeredBlockTypes.add(blocklyType);
    }
  }

  /** Build a newly created block with this engine's definition, mode and behavior. */
  private initManagedBlock(block: Blockly.BlockSvg, identifier: string): void {
    const definition = this.definitions.get(identifier);
    if (!definition) {
      return;
    }
    const context: MorphicRenderContext = block.workspace.isFlyout ? "toolbox" : "workspace";
    const mode = this.viewWorkspaceModes.get(block.workspace) ?? this.resolveMode(context);
    this.applyView(block, definition, mode, context);
    dropShadowsWhenMarker(block);

    const lifecycleBehavior = getLifecycleBehavior(this.behaviors[definition.identifier]);
    lifecycleBehavior?.init?.(block, this.createBehaviorContext(block, definition, mode, context));
  }

  private validateContainers(config: MorphicMountConfig): void {
    if (!config.workspaceContainer && !config.codespaceContainer) {
      throw new Error(
        "MorphicBlocks.mount requires at least one of workspaceContainer or codespaceContainer.",
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
    // A disposed block can linger in a stale `getAllBlocks()` snapshot: when a
    // parent re-renders, `removeInputs` disposes its empty-default shadow and
    // `attachEmptyDefaults` creates a fresh one, but the snapshot the caller is
    // iterating still holds the dead shadow. Rendering it would run
    // `FieldDropdown.init()` on a dead block, where `getConstants()` is null and
    // Blockly throws. Skip it — the live replacement is rendered on creation.
    if (block.isDeadOrDying()) {
      return;
    }
    const category = this.blockCategoryIndex.get(definition.identifier);

    // Apply category color before applyBlockView so the internal render() uses it.
    // Only used when the definition has no explicit color of its own.
    if (definition.color === undefined && category?.color !== undefined) {
      block.setColour(category.color);
    }

    // Preserve user-added field values (dropdowns, text inputs, etc.) across re-renders
    const fieldMemory = ((block as MorphicManagedBlock).__morphicFieldMemory ??= new Map<string, unknown>());
    for (const [name, value] of captureFieldValues(block)) fieldMemory.set(name, value);

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
    this.styleBlock(block, definition);

    const lifecycleBehavior = getLifecycleBehavior(
      this.behaviors[definition.identifier],
    );
    lifecycleBehavior?.onViewApplied?.(
      block,
      this.createBehaviorContext(block, definition, mode, context),
    );

    // Restore field values after onViewApplied has recreated the fields
    restoreFieldValues(block, fieldMemory);
  }

  /**
   * The classes and colours a block's drawing takes from its definition and
   * the mode's CSS. Needs the block's SVG, so a block built before it had one
   * is styled again once it does.
   */
  private styleBlock(block: Blockly.BlockSvg, definition: MorphicBlockDefinition): void {
    const category = this.blockCategoryIndex.get(definition.identifier);
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
      if (isOnCanvas(block)) block.render();
    }
  }

  private applyTextViewClasses(): void {
    if (!this.mountConfig) return;
    if (this.mountConfig.codespaceContainer) {
      applyTextViewModeClass(
        this.mountConfig.codespaceContainer,
        this.getCodespaceMode(),
        "morphic-codespace-root",
      );
    }
    if (this.previewHost) {
      applyTextViewModeClass(this.previewHost, this.mountConfig.previewMode, "morphic-preview-root");
    }
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

  /**
   * Measure block text with the font the workspace mode's CSS draws it in.
   * The probe sits in the workspace container with Blockly's renderer and
   * base theme classes, so it gets Blockly's own font unless the mode's CSS
   * overrides it, exactly like real block text.
   */
  private syncWorkspaceFont(): void {
    if (this.workspace && this.mountConfig?.workspaceHost) this.syncFontOf(this.workspace, this.mountConfig.workspaceHost);
  }

  /** Measure a workspace's blocks with the font its host's mode CSS sets. */
  private syncFontOf(workspace: Blockly.WorkspaceSvg, host: HTMLElement): void {
    if (!this.baseTheme || !this.baseFont) return;
    const font = readCssFont(
      host,
      [[workspace.getRenderer().getClassName(), this.baseTheme.getClassName()]],
      this.baseFont,
    );
    if (applyFont(workspace, this.baseTheme, this.baseFont, font)) remeasureBlocks(workspace);
  }

  private readonly onStylesLoaded = (): void => this.refresh();

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
    // Blockly gives a read only workspace no toolbox, so there is none to update.
    if (this.workspace.options.readOnly) {
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
    workspaceOwners.set(flyoutWorkspace, this);
    this.flyoutWorkspace.addChangeListener(this.onFlyoutChange);
    this.applyFlyoutClass();
  }

  private resolveToolboxDefinition(
    config: Omit<MorphicMountConfig, "modeStyles">,
  ): NonNullable<Blockly.BlocklyOptions["toolbox"]> {
    if (config.toolbox) {
      const layoutKind = this.resolveToolboxKind(config.toolboxLayout);
      const toolboxConfig = layoutKind
        ? { ...config.toolbox, kind: layoutKind }
        : config.toolbox;
      return buildToolboxDefinition(toolboxConfig, this.definitions);
    }

    const blocklyOptions = config.blockly;
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
    config?: Omit<MorphicMountConfig, "modeStyles">,
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
