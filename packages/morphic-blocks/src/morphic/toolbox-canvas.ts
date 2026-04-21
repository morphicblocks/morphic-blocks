import * as Blockly from "blockly";
import { getLifecycleBehavior } from "./behavior-runtime";
import { applyBlockView } from "./block-view";
import { parseTemplate, renderTemplateAsHtml, toModeClassToken } from "./template";
import { resolveBlockView } from "./view-resolver";
import type {
  MorphicBehaviorMap,
  MorphicBlockDefinition,
  MorphicElementType,
  MorphicModeDefinition,
  MorphicModeName,
  MorphicToolboxCanvasOptions,
  MorphicToolboxCategory,
} from "./types";

const DRAG_DATA_KEY = "morphic/block-type";

export class MorphicToolboxCanvas {
  private readonly container: HTMLElement;
  private readonly workspaceContainer: HTMLElement;
  private readonly workspace: Blockly.WorkspaceSvg;
  private readonly definitions: Map<string, MorphicBlockDefinition>;
  private readonly blockColors: Map<string, string>;
  private readonly behaviors: MorphicBehaviorMap;
  private readonly elementTypes: Record<string, MorphicElementType>;
  private readonly options: MorphicToolboxCanvasOptions;
  private readonly modes: MorphicModeDefinition[];
  private currentMode: MorphicModeName;

  private previewWorkspace?: Blockly.WorkspaceSvg;
  private previewContainer?: HTMLDivElement;

  private readonly onDragOver: (e: DragEvent) => void;
  private readonly onDrop: (e: DragEvent) => void;

  constructor(params: {
    container: HTMLElement;
    workspaceContainer: HTMLElement;
    workspace: Blockly.WorkspaceSvg;
    definitions: Map<string, MorphicBlockDefinition>;
    blockColors: Map<string, string>;
    behaviors: MorphicBehaviorMap;
    elementTypes?: Record<string, MorphicElementType>;
    mode: MorphicModeName;
    modes?: MorphicModeDefinition[];
    options?: MorphicToolboxCanvasOptions;
  }) {
    this.container = params.container;
    this.workspaceContainer = params.workspaceContainer;
    this.workspace = params.workspace;
    this.definitions = params.definitions;
    this.blockColors = params.blockColors;
    this.behaviors = params.behaviors;
    this.elementTypes = params.elementTypes ?? {};
    this.currentMode = params.mode;
    this.modes = params.modes ?? [];
    this.options = params.options ?? {};

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

  rerender(mode: MorphicModeName): void {
    this.currentMode = mode;
    this.render();
  }

  dispose(): void {
    this.workspaceContainer.removeEventListener("dragover", this.onDragOver);
    this.workspaceContainer.removeEventListener("drop", this.onDrop);
    this.container.innerHTML = "";
    if (this.previewWorkspace) {
      this.previewWorkspace.dispose();
      this.previewWorkspace = undefined;
    }
    if (this.previewContainer?.parentNode) {
      this.previewContainer.parentNode.removeChild(this.previewContainer);
      this.previewContainer = undefined;
    }
  }

  private render(): void {
    this.container.innerHTML = "";

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
      if (category.colour) {
        group.style.setProperty("--morphic-category-color", category.colour);
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

    const modeOrder = this.modes.find((m) => m.name === this.currentMode)?.elements ?? [];
    const allEntries = Object.entries(definition.elements);
    const sortedEntries = [
      ...modeOrder.map((name) => allEntries.find(([key]) => key === name)).filter((e): e is [string, string] => e !== undefined),
      ...allEntries.filter(([key]) => !modeOrder.includes(key)),
    ];

    for (const [elementName, content] of sortedEntries) {
      const el = document.createElement("div");
      el.className = `morphic-element-${toModeClassToken(elementName)}`;

      if (this.elementTypes[elementName] === "code") {
        const svg = this.createBlockPreviewSvg(definition, this.currentMode);
        if (svg) {
          el.appendChild(svg);
        } else {
          el.innerHTML = renderTemplateAsHtml(parseTemplate(content));
        }
      } else {
        el.innerHTML = renderTemplateAsHtml(parseTemplate(content));
      }

      tile.appendChild(el);
    }

    tile.addEventListener("dragstart", (e: DragEvent) => {
      e.dataTransfer?.setData(DRAG_DATA_KEY, definition.identifier);
    });

    return tile;
  }

  private ensurePreviewWorkspace(): Blockly.WorkspaceSvg {
    if (this.previewWorkspace) return this.previewWorkspace;
    this.previewContainer = document.createElement("div");
    this.previewContainer.style.cssText =
      "position:absolute;left:-9999px;top:-9999px;width:800px;height:600px;overflow:hidden;";
    document.body.appendChild(this.previewContainer);
    this.previewWorkspace = Blockly.inject(this.previewContainer, {
      scrollbars: false,
    });
    return this.previewWorkspace;
  }

  private createBlockPreviewSvg(
    definition: MorphicBlockDefinition,
    mode: MorphicModeName,
  ): SVGSVGElement | null {
    try {
      const ws = this.ensurePreviewWorkspace();
      const block = ws.newBlock(definition.identifier) as Blockly.BlockSvg;

      const color = this.blockColors.get(definition.identifier);
      if (color) block.setColour(color);

      const view = resolveBlockView(definition, mode, this.elementTypes, this.modes);
      applyBlockView({
        block,
        definition,
        view,
        mode: "block",
        context: "toolbox",
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

      block.initSvg();
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
      svg.setAttribute("width", String(Math.ceil(bbox.width + pad * 2)));
      svg.setAttribute("height", String(Math.ceil(bbox.height + pad * 2)));
      svg.setAttribute(
        "viewBox",
        `${bbox.x - pad} ${bbox.y - pad} ${bbox.width + pad * 2} ${bbox.height + pad * 2}`,
      );
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

    const block = ws.newBlock(blockType) as Blockly.BlockSvg;
    block.initSvg();
    block.render();
    block.moveTo(new Blockly.utils.Coordinate(x, y));
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
