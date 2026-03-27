import * as Blockly from "blockly";
import { parseTemplate, renderTemplateAsHtml, toModeClassToken } from "./template";
import type {
  MorphicBlockDefinition,
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
  private readonly options: MorphicToolboxCanvasOptions;
  private currentMode: MorphicModeName;

  private readonly onDragOver: (e: DragEvent) => void;
  private readonly onDrop: (e: DragEvent) => void;

  constructor(params: {
    container: HTMLElement;
    workspaceContainer: HTMLElement;
    workspace: Blockly.WorkspaceSvg;
    definitions: Map<string, MorphicBlockDefinition>;
    blockColors: Map<string, string>;
    mode: MorphicModeName;
    options?: MorphicToolboxCanvasOptions;
  }) {
    this.container = params.container;
    this.workspaceContainer = params.workspaceContainer;
    this.workspace = params.workspace;
    this.definitions = params.definitions;
    this.blockColors = params.blockColors;
    this.currentMode = params.mode;
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

    for (const [elementName, content] of Object.entries(definition.elements)) {
      const el = document.createElement("div");
      el.className = `morphic-element-${toModeClassToken(elementName)}`;
      el.innerHTML = renderTemplateAsHtml(parseTemplate(content));
      tile.appendChild(el);
    }

    tile.addEventListener("dragstart", (e: DragEvent) => {
      e.dataTransfer?.setData(DRAG_DATA_KEY, definition.identifier);
    });

    return tile;
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
