import * as Blockly from "blockly";
import { getLifecycleBehavior } from "./behavior-runtime";
import { resolveBlocklyType } from "./block-namespace";
import { applyBlockView } from "./block-view";
import { generateTextFromWorkspace } from "./template-codegen";
import { ensureTileHighlightStyles, ensureTileTouchStyles } from "./styles";
import { tokenMatcher } from "./syntax-highlight";
import { applyFont, measuredFont, readCssFont, type MorphicBlockFont } from "./block-font";
import { resolveElementType, resolveImageSize } from "./element-types";
import {
  normalizeImageValue,
  parseTemplate,
  renderTemplateAsHtml,
  toModeClassToken,
} from "./template";
import type {
  MorphicBehaviorMap,
  MorphicBlockDefinition,
  MorphicElementTypeEntry,
  MorphicModeDefinition,
  MorphicCodeElementConfig,
  MorphicHighlightDefinition,
  MorphicModeName,
  MorphicResolvedView,
  MorphicToolboxCanvasOptions,
  MorphicToolboxCategory,
} from "./types";

export const DRAG_DATA_KEY = "morphic/block-type";

/**
 * Where a tile dragged by touch or pen can land. HTML drag and drop, which
 * mouse drags use, does not start from a finger in most browsers.
 */
export interface TileDropTarget {
  element: HTMLElement;
  /** The tile is over the target at this point. */
  over?(x: number, y: number): void;
  /** The tile left the target or the drag ended. */
  leave?(): void;
  drop(blockType: string, x: number, y: number): void;
}

/** Sideways movement in pixels before a press on a tile becomes a drag. */
const TOUCH_DRAG_DISTANCE = 8;
/** A press held this long, in milliseconds, starts a drag in any direction. */
const LONG_PRESS_MS = 350;

/** Text as HTML with its tokens wrapped in the classes the codespace uses. */
function highlightedHtml(text: string, rules: MorphicHighlightDefinition): string {
  const matchTokens = tokenMatcher(rules);
  const escape = (value: string) =>
    value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return text
    .split("\n")
    .map((line) => {
      let html = "";
      let at = 0;
      for (const token of matchTokens(line)) {
        html += escape(line.slice(at, token.from));
        html += `<span class="morphic-tok-${token.kind}">${escape(line.slice(token.from, token.to))}</span>`;
        at = token.to;
      }
      return html + escape(line.slice(at));
    })
    .join("\n");
}

export class MorphicToolboxCanvas {
  private readonly container: HTMLElement;
  private readonly workspaceContainer: HTMLElement;
  private readonly workspace: Blockly.WorkspaceSvg;
  private readonly definitions: Map<string, MorphicBlockDefinition>;
  private readonly blockColors: Map<string, string>;
  private readonly behaviors: MorphicBehaviorMap;
  private readonly elementTypes: Record<string, MorphicElementTypeEntry>;
  private readonly options: MorphicToolboxCanvasOptions;
  private readonly modes: MorphicModeDefinition[];
  private currentMode: MorphicModeName;
  private readonly code: Record<string, MorphicCodeElementConfig>;
  /** Per-element block/text override for code elements in tiles (from the active preset). */
  private renderOverride?: Record<string, "block" | "text">;

  private previewWorkspace?: Blockly.WorkspaceSvg;
  private readonly onPreviewWorkspace?: (workspace: Blockly.WorkspaceSvg) => void;
  private previewContainer?: HTMLDivElement;
  /** The preview workspace's own theme and font, before any tile font. */
  private previewBase?: { theme: Blockly.Theme; font: MorphicBlockFont };

  private readonly onDragOver: (e: DragEvent) => void;
  private readonly onDrop: (e: DragEvent) => void;
  /** Targets besides the workspace, such as codespaces, for touch drags. */
  private readonly dropTargets: () => TileDropTarget[];

  constructor(params: {
    container: HTMLElement;
    workspaceContainer: HTMLElement;
    workspace: Blockly.WorkspaceSvg;
    definitions: Map<string, MorphicBlockDefinition>;
    blockColors: Map<string, string>;
    behaviors: MorphicBehaviorMap;
    elementTypes?: Record<string, MorphicElementTypeEntry>;
    mode: MorphicModeName;
    render?: Record<string, "block" | "text">;
    modes?: MorphicModeDefinition[];
    /** Code element settings; their highlighting colours code shown as text. */
    code?: Record<string, MorphicCodeElementConfig>;
    options?: MorphicToolboxCanvasOptions;
    /** Called once with the hidden workspace used to draw block previews. */
    onPreviewWorkspace?: (workspace: Blockly.WorkspaceSvg) => void;
    dropTargets?: () => TileDropTarget[];
  }) {
    this.container = params.container;
    this.workspaceContainer = params.workspaceContainer;
    this.workspace = params.workspace;
    this.onPreviewWorkspace = params.onPreviewWorkspace;
    this.definitions = params.definitions;
    this.blockColors = params.blockColors;
    this.behaviors = params.behaviors;
    this.elementTypes = params.elementTypes ?? {};
    this.code = params.code ?? {};
    this.currentMode = params.mode;
    this.renderOverride = params.render;
    this.modes = params.modes ?? [];
    this.options = params.options ?? {};
    this.dropTargets = params.dropTargets ?? (() => []);

    this.onDragOver = (e: DragEvent) => {
      if (e.dataTransfer?.types.includes(DRAG_DATA_KEY)) {
        e.preventDefault();
      }
    };

    this.onDrop = (e: DragEvent) => {
      const blockType = e.dataTransfer?.getData(DRAG_DATA_KEY);
      if (!blockType) return;
      e.preventDefault();
      this.createBlockAtPosition(blockType, e.clientX, e.clientY);
    };

    this.workspaceContainer.addEventListener("dragover", this.onDragOver);
    this.workspaceContainer.addEventListener("drop", this.onDrop);

    this.render();
  }

  rerender(mode: MorphicModeName, render?: Record<string, "block" | "text">): void {
    this.currentMode = mode;
    this.renderOverride = render;
    this.render();
  }

  dispose(): void {
    this.workspaceContainer.removeEventListener("dragover", this.onDragOver);
    this.workspaceContainer.removeEventListener("drop", this.onDrop);
    this.container.innerHTML = "";
    if (this.previewWorkspace) {
      this.previewWorkspace.dispose();
      this.previewWorkspace = undefined;
      this.previewBase = undefined;
    }
    if (this.previewContainer?.parentNode) {
      this.previewContainer.parentNode.removeChild(this.previewContainer);
      this.previewContainer = undefined;
    }
  }

  /**
   * Draw the tiles and publish the widest block's width as
   * `--morphic-toolbox-block-width` on the container. The layout stays the
   * app's: one that wants every block to fit gives the container
   * `min-width: calc(var(--morphic-toolbox-block-width) + <padding>)` and
   * lets its column grow to it (`minmax(250px, min-content)`). Only blocks
   * count, so long descriptions, which wrap, do not widen it.
   */
  private render(): void {
    this.widestBlock = 0;
    this.renderTiles();
    this.container.style.setProperty("--morphic-toolbox-block-width", `${Math.ceil(this.widestBlock)}px`);
  }

  /** Widest block drawn on a tile in the current render, in pixels. */
  private widestBlock = 0;

  private renderTiles(): void {
    this.container.innerHTML = "";

    const modeLabel = this.options.modeLabel ?? true;
    const labelText =
      typeof modeLabel === "function"
        ? modeLabel(this.currentMode)
        : typeof modeLabel === "string"
          ? modeLabel
          : modeLabel
            ? `Mode: ${this.currentMode}`
            : "";
    if (labelText) {
      const header = document.createElement("div");
      header.className = "morphic-toolbox-header";
      const label = document.createElement("span");
      label.className = "morphic-toolbar-label";
      label.textContent = labelText;
      header.appendChild(label);
      this.container.appendChild(header);
    }

    const blockIds = this.resolveBlockIds();
    const categories = this.options.categories ?? [];

    if (categories.length === 0) {
      for (const id of blockIds) {
        const def = this.definitions.get(id);
        if (def) this.container.appendChild(this.createTile(def));
      }
      return;
    }

    const categorized = new Set<string>();

    for (const category of categories) {
      const ids = this.resolveCategoryBlockIds(category, blockIds);
      if (ids.length === 0) continue;

      const group = document.createElement("div");
      group.setAttribute("data-category", toModeClassToken(category.name));
      if (category.color) {
        group.style.setProperty("--morphic-category-color", category.color);
      }

      for (const id of ids) {
        const def = this.definitions.get(id);
        if (def) {
          group.appendChild(this.createTile(def));
          categorized.add(id);
        }
      }

      this.container.appendChild(group);
    }

    // Append any blocks not covered by a category
    for (const id of blockIds) {
      if (!categorized.has(id)) {
        const def = this.definitions.get(id);
        if (def) this.container.appendChild(this.createTile(def));
      }
    }
  }

  private createTile(definition: MorphicBlockDefinition): HTMLElement {
    const modeToken = toModeClassToken(this.currentMode);
    const idToken = toModeClassToken(definition.identifier);
    const color = this.blockColors.get(definition.identifier);

    const tile = document.createElement("div");
    tile.setAttribute("draggable", "true");
    tile.setAttribute("data-block-type", definition.identifier);
    tile.className = `morphic-block morphic-mode-${modeToken} morphic-block-${idToken}`;
    if (color) {
      tile.style.setProperty("--morphic-block-color", color);
    }

    const activeMode = this.modes.find((m) => m.name === this.currentMode);
    const modeOrder = activeMode?.elements ?? [];
    const allEntries = Object.entries(definition.elements);
    const sortedEntries = [
      ...modeOrder.map((name) => allEntries.find(([key]) => key === name)).filter((e): e is [string, string] => e !== undefined),
      ...allEntries.filter(([key]) => !modeOrder.includes(key)),
    ];

    for (const [elementName, content] of sortedEntries) {
      const el = document.createElement("div");
      el.className = `morphic-element-${toModeClassToken(elementName)}`;

      const elementEntry = this.elementTypes[elementName];
      const elementType = resolveElementType(elementEntry);
      const isCodeElement = elementType === "code";
      const isImageElement = elementType === "image";
      const render = this.renderOverride?.[elementName] ?? (isCodeElement ? "block" : "text");

      // For type "image", auto-wrap file paths into <img> tags using the
      // per-element `size` config (or 16×16 default).
      const resolvedContent = isImageElement
        ? normalizeImageValue(content, resolveImageSize(elementEntry))
        : content;

      if (isCodeElement && render === "block") {
        this.syncPreviewFont(elementName);
        const svg = this.createBlockPreviewSvg(definition, this.currentMode, elementName);
        if (svg) {
          el.appendChild(svg);
        } else {
          el.innerHTML = renderTemplateAsHtml(parseTemplate(resolvedContent));
        }
      } else if (isCodeElement) {
        const text = this.createCodeText(definition, this.currentMode, elementName);
        const rules = this.options.highlight === false ? undefined : this.code[elementName]?.highlighting;
        if (text !== null && rules) {
          // Coloured like the codespace colours this element.
          ensureTileHighlightStyles(elementName, rules.colors);
          el.innerHTML = highlightedHtml(text, rules);
        } else if (text !== null) {
          el.textContent = text;
        } else {
          el.innerHTML = renderTemplateAsHtml(parseTemplate(resolvedContent));
        }
      } else {
        el.innerHTML = renderTemplateAsHtml(parseTemplate(resolvedContent));
      }

      tile.appendChild(el);
    }

    tile.addEventListener("dragstart", (e: DragEvent) => {
      e.dataTransfer?.setData(DRAG_DATA_KEY, definition.identifier);
    });
    if (this.options.touch !== false) {
      ensureTileTouchStyles();
      this.attachTouchDrag(tile, definition.identifier);
    }

    return tile;
  }

  /** The target under a point: a codespace, else the workspace. */
  private dropTargetAt(x: number, y: number): TileDropTarget | undefined {
    const hit = document.elementFromPoint(x, y);
    if (!hit) return undefined;
    const workspace: TileDropTarget = {
      element: this.workspaceContainer,
      drop: (blockType, dropX, dropY) => this.createBlockAtPosition(blockType, dropX, dropY),
    };
    return [...this.dropTargets(), workspace].find((target) => target.element.contains(hit));
  }

  /**
   * Drag a tile with a finger or pen: a copy of the tile follows the pointer
   * and the block is made where it is let go.
   */
  private attachTouchDrag(tile: HTMLElement, blockType: string): void {
    tile.addEventListener("pointerdown", (down: PointerEvent) => {
      if (down.pointerType === "mouse" || !down.isPrimary) return;

      const rect = tile.getBoundingClientRect();
      let ghost: HTMLElement | undefined;
      let target: TileDropTarget | undefined;
      let last = { x: down.clientX, y: down.clientY };
      // The browser's own drag of the tile would compete with this one.
      tile.draggable = false;

      // Where the copy's own coordinates start and how they scale: a toolbox
      // inside a zoomed or transformed element moves them.
      let origin = { x: 0, y: 0 };
      let scale = 1;
      let frame = 0;

      const start = () => {
        if (ghost) return;
        ghost = tile.cloneNode(true) as HTMLElement;
        ghost.classList.add("morphic-drag-ghost");
        ghost.removeAttribute("tabindex");
        Object.assign(ghost.style, {
          position: "fixed",
          left: "0",
          top: "0",
          margin: "0",
          pointerEvents: "none",
          zIndex: "2147483647",
          // A transition on the app's tiles would trail every move.
          transition: "none",
          animation: "none",
        });
        this.container.appendChild(ghost);
        const at0 = ghost.getBoundingClientRect();
        ghost.style.left = "100px";
        scale = (ghost.getBoundingClientRect().left - at0.left) / 100 || 1;
        origin = { x: at0.left, y: at0.top };
        Object.assign(ghost.style, {
          left: `${(rect.left - origin.x) / scale}px`,
          top: `${(rect.top - origin.y) / scale}px`,
          width: `${rect.width / scale}px`,
        });
        follow();
      };
      const longPress = window.setTimeout(start, LONG_PRESS_MS);

      // At most once per frame: finding the target makes the browser lay out.
      const follow = () => {
        if (!ghost || frame) return;
        frame = requestAnimationFrame(() => {
          frame = 0;
          if (!ghost) return;
          ghost.style.transform = `translate(${(last.x - down.clientX) / scale}px, ${(last.y - down.clientY) / scale}px)`;
          const next = this.dropTargetAt(last.x, last.y);
          if (next !== target) target?.leave?.();
          target = next;
          target?.over?.(last.x, last.y);
        });
      };

      const onMove = (e: PointerEvent) => {
        if (e.pointerId !== down.pointerId) return;
        last = { x: e.clientX, y: e.clientY };
        const dx = Math.abs(e.clientX - down.clientX);
        const dy = Math.abs(e.clientY - down.clientY);
        // Up and down belongs to the browser, which scrolls the toolbox.
        if (!ghost && (dx < TOUCH_DRAG_DISTANCE || dy > dx)) return;
        window.clearTimeout(longPress);
        start();
        follow();
      };
      // Once dragging, the page must not scroll under the finger.
      const onTouchMove = (e: TouchEvent) => {
        if (ghost) e.preventDefault();
      };
      const onContextMenu = (e: Event) => e.preventDefault();

      const end = (e: PointerEvent) => {
        if (e.pointerId !== down.pointerId) return;
        window.clearTimeout(longPress);
        tile.removeEventListener("pointermove", onMove);
        tile.removeEventListener("pointerup", end);
        tile.removeEventListener("pointercancel", end);
        tile.removeEventListener("touchmove", onTouchMove);
        tile.removeEventListener("contextmenu", onContextMenu);
        tile.draggable = true;
        cancelAnimationFrame(frame);
        target?.leave?.();
        if (!ghost) return;
        ghost.remove();
        if (e.type === "pointerup") this.dropTargetAt(e.clientX, e.clientY)?.drop(blockType, e.clientX, e.clientY);
      };

      tile.setPointerCapture?.(down.pointerId);
      tile.addEventListener("pointermove", onMove);
      tile.addEventListener("pointerup", end);
      tile.addEventListener("pointercancel", end);
      tile.addEventListener("touchmove", onTouchMove, { passive: false });
      tile.addEventListener("contextmenu", onContextMenu);
    });
  }

  private ensurePreviewWorkspace(): Blockly.WorkspaceSvg {
    if (this.previewWorkspace) return this.previewWorkspace;
    this.previewContainer = document.createElement("div");
    this.previewContainer.style.cssText =
      "position:absolute;left:-9999px;top:-9999px;width:800px;height:600px;overflow:hidden;";
    document.body.appendChild(this.previewContainer);
    // Options hold the host's own settings; the live theme may be one the
    // engine derived for a mode's font, which each tile sets again anyway.
    const host = this.workspace.options;
    this.previewWorkspace = Blockly.inject(this.previewContainer, {
      scrollbars: false,
      // Load media from wherever the host's workspace does, never from
      // Blockly's default server. Nothing plays here, so no sounds at all.
      media: host.pathToMedia,
      sounds: false,
      // Draw tiles the way the host's workspace draws its blocks.
      renderer: host.renderer,
      rendererOverrides: host.rendererOverrides ?? undefined,
      theme: host.theme,
      rtl: host.RTL,
    });
    this.onPreviewWorkspace?.(this.previewWorkspace);
    return this.previewWorkspace;
  }

  /**
   * The tile shows a copy of the rendered block outside Blockly, so its text
   * takes the font the tile's CSS gives that element. Measure with that font.
   */
  private syncPreviewFont(elementName: string): void {
    const ws = this.ensurePreviewWorkspace();
    this.previewBase ??= { theme: ws.getTheme(), font: measuredFont(ws) };
    const font = readCssFont(
      this.container,
      [
        ["morphic-block", `morphic-mode-${toModeClassToken(this.currentMode)}`],
        [`morphic-element-${toModeClassToken(elementName)}`],
        [ws.getRenderer().getClassName(), ws.getTheme().getClassName()],
      ],
      this.previewBase.font,
    );
    applyFont(ws, this.previewBase.theme, this.previewBase.font, font);
  }

  /**
   * A block for one code element of a tile, built like a workspace block,
   * slot defaults included, in the hidden tile workspace. Not drawn yet.
   */
  private createPreviewBlock(
    definition: MorphicBlockDefinition,
    mode: MorphicModeName,
    elementName: string,
  ): Blockly.BlockSvg {
    const ws = this.ensurePreviewWorkspace();
    const block = ws.newBlock(
      resolveBlocklyType(definition.identifier, this.definitions),
    ) as Blockly.BlockSvg;

    const color = this.blockColors.get(definition.identifier);
    if (color) block.setColour(color);

    // Each code element on the tile is drawn from its own template.
    const view: MorphicResolvedView = {
      mode,
      template: definition.elements[elementName] ?? "",
      elementName,
      inputSlots: definition.inputSlots,
    };
    applyBlockView({
      block,
      definition,
      view,
      mode: "block",
      context: "toolbox",
      // Slot defaults too, so the tile shows the block as it will be dropped.
      elementTypes: this.elementTypes,
      resolveBlocklyType: (ref) => resolveBlocklyType(ref, this.definitions),
    });

    // Invoke onViewApplied to add fields (dropdowns, number inputs, etc.)
    const lifecycle = getLifecycleBehavior(
      this.behaviors[definition.identifier],
    );
    lifecycle?.onViewApplied?.(block, {
      Blockly,
      workspace: ws,
      mode,
      context: "toolbox",
      definition,
    });
    return block;
  }

  /**
   * A code element shown as text reads exactly like the codespace would
   * write the block: field values, slot defaults and all.
   */
  private createCodeText(
    definition: MorphicBlockDefinition,
    mode: MorphicModeName,
    elementName: string,
  ): string | null {
    try {
      const block = this.createPreviewBlock(definition, mode, elementName);
      const { code } = generateTextFromWorkspace(
        block.workspace,
        mode,
        this.definitions,
        this.elementTypes,
        this.modes,
        elementName,
        // A tile shows the block, not runnable code, so an empty body stays empty.
        { emptyStatements: false },
      );
      block.dispose(false);
      return code;
    } catch {
      return null;
    }
  }

  private createBlockPreviewSvg(
    definition: MorphicBlockDefinition,
    mode: MorphicModeName,
    elementName: string,
  ): SVGSVGElement | null {
    try {
      const ws = this.ensurePreviewWorkspace();
      const block = this.createPreviewBlock(definition, mode, elementName);

      // Slot defaults were attached before the block had an SVG, so they
      // need theirs too.
      for (const part of block.getDescendants(false) as Blockly.BlockSvg[]) {
        part.initSvg();
        part.queueRender();
      }
      block.render();

      const svgRoot = block.getSvgRoot();
      if (!svgRoot) {
        block.dispose(false);
        return null;
      }

      const bbox = svgRoot.getBBox();
      const clone = svgRoot.cloneNode(true) as SVGGElement;

      const pad = 4;
      const svg = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "svg",
      );
      const width = Math.ceil(bbox.width + pad * 2);
      this.widestBlock = Math.max(this.widestBlock, width);
      svg.setAttribute("width", String(width));
      svg.setAttribute("height", String(Math.ceil(bbox.height + pad * 2)));
      svg.setAttribute(
        "viewBox",
        `${bbox.x - pad} ${bbox.y - pad} ${bbox.width + pad * 2} ${bbox.height + pad * 2}`,
      );
      // Blockly scopes its block CSS (text colour, editable field boxes, the
      // block font) to its renderer and theme classes, which sit on the
      // workspace's injection div. The copy leaves that div, so it carries them.
      svg.setAttribute("class", `${ws.getRenderer().getClassName()} ${ws.getTheme().getClassName()}`);
      // Blockly lays out right to left blocks itself and draws their text left
      // to right (its container is always dir="ltr"). A tile in a right to
      // left page would otherwise flip the text and overlap the slots.
      svg.style.direction = "ltr";
      svg.appendChild(clone);

      block.dispose(false);
      return svg;
    } catch {
      return null;
    }
  }

  private createBlockAtPosition(
    blockType: string,
    clientX: number,
    clientY: number,
  ): void {
    const ws = this.workspace;
    const rect = ws.getInjectionDiv().getBoundingClientRect();
    const x = (clientX - rect.left - ws.scrollX) / ws.scale;
    const y = (clientY - rect.top - ws.scrollY) / ws.scale;

    const block = ws.newBlock(
      resolveBlocklyType(blockType, this.definitions),
    ) as Blockly.BlockSvg;
    // Placed before it is drawn: drawn first at 0,0, Blockly would bump
    // blocks there out of its way.
    block.moveTo(new Blockly.utils.Coordinate(x, y));
    block.initSvg();
    block.render();
  }

  private resolveBlockIds(): string[] {
    return this.options.blocks ?? [...this.definitions.keys()];
  }

  private resolveCategoryBlockIds(
    category: MorphicToolboxCategory,
    allIds: string[],
  ): string[] {
    if (category.blocks && category.blocks.length > 0) {
      return category.blocks.filter((id) => allIds.includes(id));
    }
    return allIds.filter(
      (id) =>
        this.definitions.get(id)?.category?.toLowerCase() ===
        category.name.toLowerCase(),
    );
  }
}
