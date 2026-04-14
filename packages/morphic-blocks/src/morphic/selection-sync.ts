import * as Blockly from "blockly";
import type { LineSpan, MorphicCodeEditor } from "./code-editor";
import type { MorphicCodeBlockPosition, MorphicCodeMetadata, MorphicSelectionSyncOptions } from "./types";

const DEFAULT_HIGHLIGHT_COLOR = "rgba(255, 255, 255, 0.07)";

/**
 * Bidirectional selection sync between a Blockly workspace and a MorphicCodeEditor.
 *
 * - Block → Code: selecting a block highlights its **own** lines (excluding children).
 * - Code → Block: clicking a code line selects the corresponding block.
 *
 * A guard flag prevents circular A → B → A updates.
 */
export class MorphicSelectionSync {
  private workspace: Blockly.WorkspaceSvg;
  private editor: MorphicCodeEditor;
  private blockToCode: boolean;
  private codeToBlock: boolean;

  private blockListener?: (event: Blockly.Events.Abstract) => void;
  private cursorCallback?: (line: number) => void;

  /** Prevents circular updates. */
  private guard = false;

  constructor(
    workspace: Blockly.WorkspaceSvg,
    editor: MorphicCodeEditor,
    options: MorphicSelectionSyncOptions = {},
  ) {
    this.workspace = workspace;
    this.editor = editor;
    this.blockToCode = options.blockToCode !== false;
    this.codeToBlock = options.codeToBlock !== false;
    editor.setHighlightColor(options.highlightColor ?? DEFAULT_HIGHLIGHT_COLOR);
  }

  /** Start listening for selection events in both directions. */
  enable(): void {
    if (this.blockToCode) {
      this.attachBlockListener();
    }
    if (this.codeToBlock) {
      this.attachCursorListener();
    }
  }

  /** Stop listening and clear highlights / selection. */
  disable(): void {
    this.detachBlockListener();
    this.detachCursorListener();
    this.editor.clearHighlight();
  }

  // ── Block → Code ────────────────────────────────────────

  private attachBlockListener(): void {
    if (this.blockListener) return;

    this.blockListener = (event: Blockly.Events.Abstract) => {
      if (event.type !== "selected") return;
      if (this.guard) return;

      const selectedEvent = event as Blockly.Events.Selected;
      const blockId = selectedEvent.newElementId;

      if (!blockId) {
        this.editor.clearHighlight();
        return;
      }

      const spans = this.computeOwnSpans(blockId);
      if (!spans) {
        this.editor.clearHighlight();
        return;
      }

      this.guard = true;
      this.editor.highlightLines(spans);
      this.guard = false;
    };

    this.workspace.addChangeListener(this.blockListener);
  }

  private detachBlockListener(): void {
    if (!this.blockListener) return;
    this.workspace.removeChangeListener(this.blockListener);
    this.blockListener = undefined;
  }

  // ── Code → Block ────────────────────────────────────────

  private attachCursorListener(): void {
    if (this.cursorCallback) return;

    this.cursorCallback = (line: number) => {
      if (this.guard) return;

      const blockId = this.findBlockAtLine(line, this.editor.metadata);

      if (!blockId) {
        // Clicked a line that doesn't belong to any block — deselect & clear.
        this.guard = true;
        Blockly.common.setSelected(null);
        this.editor.clearHighlight();
        this.guard = false;
        return;
      }

      const block = this.workspace.getBlockById(blockId);
      if (!block) return;

      // Skip if this block is already selected.
      if (Blockly.common.getSelected() === block) return;

      this.guard = true;
      Blockly.common.setSelected(block as Blockly.BlockSvg);
      // Update highlight directly — the guard blocks the block→code listener,
      // so we must set the highlight here to keep it in sync.
      const spans = this.computeOwnSpans(blockId);
      if (spans) {
        this.editor.highlightLines(spans);
      }
      this.guard = false;
    };

    this.editor.onCursorLine = this.cursorCallback;
  }

  private detachCursorListener(): void {
    if (!this.cursorCallback) return;
    if (this.editor.onCursorLine === this.cursorCallback) {
      this.editor.onCursorLine = undefined;
    }
    this.cursorCallback = undefined;
  }

  // ── Helpers ─────────────────────────────────────────────

  /**
   * Compute the line spans that belong to a block *excluding* its children.
   *
   * For example, a `for` block spanning lines 1–3 with a child at line 2
   * returns `[{1,1}, {3,3}]` — only the `for(…){` and `}` lines.
   */
  private computeOwnSpans(blockId: string): LineSpan[] | undefined {
    const metadata = this.editor.metadata;
    const position = metadata.get(blockId);
    if (!position) return undefined;

    // Find all other blocks whose range is strictly inside this block's range.
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

    // Sort by start line so the subtraction sweep works.
    childRanges.sort((a, b) => a.startLine - b.startLine);

    // Subtract child ranges from the parent range to get own spans.
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
        // Prefer the tightest (smallest) range — inner blocks over outer.
        if (!best || size < best.size) {
          best = { id: blockId, size };
        }
      }
    }

    return best?.id;
  }
}
