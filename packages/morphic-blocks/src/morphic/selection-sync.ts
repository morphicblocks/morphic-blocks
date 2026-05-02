import * as Blockly from "blockly";
import type { LineSpan, MorphicCodeEditor } from "./code-editor";
import type {
  MorphicCodeBlockPosition,
  MorphicCodeMetadata,
  MorphicSelectionSyncOptions,
} from "./types";

const DEFAULT_HIGHLIGHT_COLOR = "rgba(255, 255, 255, 0.07)";

/**
 * Bidirectional selection sync between a Blockly workspace and one or more
 * `MorphicCodeEditor` instances (code editor, codespace, preview).
 *
 * - Block → Code: selecting a block highlights its **own** lines (excluding
 *   children) in every attached editor. Each editor's spans are computed from
 *   its own metadata — the same block can map to different line ranges when
 *   editors render different languages.
 * - Code → Block: moving the cursor in any editor selects the corresponding
 *   block and re-broadcasts highlights to the other editors.
 *
 * A guard flag prevents circular updates.
 */
export class MorphicSelectionSync {
  private workspace: Blockly.WorkspaceSvg;
  private editors: MorphicCodeEditor[];
  private blockToCode: boolean;
  private codeToBlock: boolean;

  private blockListener?: (event: Blockly.Events.Abstract) => void;
  private cursorCallbacks = new Map<MorphicCodeEditor, (line: number) => void>();
  private emptyClickCallbacks = new Map<MorphicCodeEditor, () => void>();

  /** Prevents circular updates. */
  private guard = false;

  constructor(
    workspace: Blockly.WorkspaceSvg,
    editors: MorphicCodeEditor | MorphicCodeEditor[],
    options: MorphicSelectionSyncOptions = {},
  ) {
    this.workspace = workspace;
    this.editors = Array.isArray(editors) ? [...editors] : [editors];
    this.blockToCode = options.blockToCode !== false;
    this.codeToBlock = options.codeToBlock !== false;
    const color = options.highlightColor ?? DEFAULT_HIGHLIGHT_COLOR;
    for (const editor of this.editors) {
      editor.setHighlightColor(color);
    }
  }

  /** Start listening for selection events in both directions. */
  enable(): void {
    if (this.blockToCode) {
      this.attachBlockListener();
    }
    if (this.codeToBlock) {
      this.attachCursorListeners();
    }
  }

  /** Stop listening and clear highlights / selection. */
  disable(): void {
    this.detachBlockListener();
    this.detachCursorListeners();
    for (const editor of this.editors) {
      editor.clearHighlight();
    }
  }

  // ── Block → Code ────────────────────────────────────────

  private attachBlockListener(): void {
    if (this.blockListener) return;

    this.blockListener = (event: Blockly.Events.Abstract) => {
      if (event.type !== "selected") return;
      if (this.guard) return;

      const blockId = (event as Blockly.Events.Selected).newElementId ?? undefined;

      this.guard = true;
      this.broadcastHighlight(blockId);
      this.guard = false;
    };

    this.workspace.addChangeListener(this.blockListener);
  }

  private detachBlockListener(): void {
    if (!this.blockListener) return;
    this.workspace.removeChangeListener(this.blockListener);
    this.blockListener = undefined;
  }

  /** Update every editor's highlight for the given block (or clear if undefined). */
  private broadcastHighlight(blockId?: string): void {
    for (const editor of this.editors) {
      if (!blockId) {
        editor.clearHighlight();
        continue;
      }
      const spans = this.computeOwnSpans(blockId, editor.metadata);
      if (spans) {
        editor.highlightLines(spans);
      } else {
        editor.clearHighlight();
      }
    }
  }

  // ── Code → Block ────────────────────────────────────────

  private attachCursorListeners(): void {
    for (const editor of this.editors) {
      if (!this.cursorCallbacks.has(editor)) {
        const callback = (line: number) => {
          if (this.guard) return;

          const blockId = this.findBlockAtLine(line, editor.metadata);

          if (!blockId) {
            this.clearAll();
            return;
          }

          const block = this.workspace.getBlockById(blockId);
          if (!block) return;

          if (Blockly.common.getSelected() === block) return;

          this.guard = true;
          Blockly.common.setSelected(block as Blockly.BlockSvg);
          this.broadcastHighlight(blockId);
          this.guard = false;
        };

        this.cursorCallbacks.set(editor, callback);
        editor.onCursorLine = callback;
      }

      if (!this.emptyClickCallbacks.has(editor)) {
        const emptyCb = () => {
          if (this.guard) return;
          this.clearAll();
        };
        this.emptyClickCallbacks.set(editor, emptyCb);
        editor.onEmptyClick = emptyCb;
      }
    }
  }

  private detachCursorListeners(): void {
    for (const [editor, callback] of this.cursorCallbacks) {
      if (editor.onCursorLine === callback) {
        editor.onCursorLine = undefined;
      }
    }
    this.cursorCallbacks.clear();
    for (const [editor, callback] of this.emptyClickCallbacks) {
      if (editor.onEmptyClick === callback) {
        editor.onEmptyClick = undefined;
      }
    }
    this.emptyClickCallbacks.clear();
  }

  /**
   * Clear the workspace selection and every editor's line highlight. Public
   * so consumers can reset selection state on view transitions (e.g. when
   * switching between workspace and codespace presentations).
   */
  public clearAll(): void {
    this.guard = true;
    Blockly.common.setSelected(null);
    for (const e of this.editors) e.clearHighlight();
    this.guard = false;
  }

  // ── Helpers ─────────────────────────────────────────────

  /**
   * Compute the line spans that belong to a block *excluding* its children
   * within the given metadata.
   */
  private computeOwnSpans(
    blockId: string,
    metadata: MorphicCodeMetadata,
  ): LineSpan[] | undefined {
    const position = metadata.get(blockId);
    if (!position) return undefined;

    const childRanges: MorphicCodeBlockPosition[] = [];
    for (const [otherId, otherPos] of metadata) {
      if (otherId === blockId) continue;
      if (otherPos.startLine >= position.startLine && otherPos.endLine <= position.endLine) {
        childRanges.push(otherPos);
      }
    }

    if (childRanges.length === 0) {
      return [{ fromLine: position.startLine, toLine: position.endLine }];
    }

    childRanges.sort((a, b) => a.startLine - b.startLine);

    const spans: LineSpan[] = [];
    let cursor = position.startLine;

    for (const child of childRanges) {
      if (cursor < child.startLine) {
        spans.push({ fromLine: cursor, toLine: child.startLine - 1 });
      }
      cursor = Math.max(cursor, child.endLine + 1);
    }

    if (cursor <= position.endLine) {
      spans.push({ fromLine: cursor, toLine: position.endLine });
    }

    return spans.length > 0 ? spans : undefined;
  }

  /** Scan metadata to find which block contains the given line. */
  private findBlockAtLine(
    line: number,
    metadata: MorphicCodeMetadata,
  ): string | undefined {
    let best: { id: string; size: number } | undefined;

    for (const [blockId, pos] of metadata) {
      if (line >= pos.startLine && line <= pos.endLine) {
        const size = pos.endLine - pos.startLine;
        if (!best || size < best.size) {
          best = { id: blockId, size };
        }
      }
    }

    return best?.id;
  }
}
