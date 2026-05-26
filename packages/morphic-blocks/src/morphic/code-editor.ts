import type * as Blockly from "blockly";
import { buildHighlightExtensions } from "./syntax-highlight";
import type {
  MorphicCodeEditorOptions,
  MorphicCodeEditorTheme,
  MorphicCodeGenerationResult,
  MorphicCodeMetadata,
  MorphicHighlightDefinition,
  MorphicPlaceholderEditTarget,
  MorphicPlaceholderRange,
} from "./types";

// Re-export the type so MorphicBlocks.ts doesn't need to import CodeMirror types.
type EditorView = import("@codemirror/view").EditorView;
type Extension = import("@codemirror/state").Extension;
type StateEffect<T = unknown> = import("@codemirror/state").StateEffect<T>;
type StateEffectType<T> = import("@codemirror/state").StateEffectType<T>;

/** A single span of 1-based lines. */
export interface LineSpan { fromLine: number; toLine: number }

/** One or more line spans to highlight, or `null` to clear. */
export type HighlightRange = LineSpan | LineSpan[] | null;

/** Drop-indicator position relative to a line. */
export interface DropIndicator { line: number; position: "above" | "below" }

/** Data-transfer key carrying a Blockly block id during a codespace drag. */
export const BLOCK_ID_DRAG_KEY = "morphic/block-id";

/**
 * Tracks the block id of the grip-marker currently being dragged. Set on
 * `dragstart`, cleared on `dragend`. Read during `dragover` / `drop` so the
 * host can exclude the source from drop-target resolution (otherwise dropping
 * on the source's own line resolves to a no-op).
 */
let activeGripDragSourceId: string | undefined;
export function getActiveGripDragSourceId(): string | undefined {
  return activeGripDragSourceId;
}

const DEFAULT_THEME: Required<MorphicCodeEditorTheme> = {
  fontSize: "14px",
  fontFamily: "monospace",
  lineHeight: 1.5,
  background: "#1e1e1e",
  foreground: "#d4d4d4",
  gutterBackground: "#1e1e1e",
  gutterForeground: "#858585",
  selectionBackground: "#264f78",
};

const mix = (color: string, pct: number) =>
  `color-mix(in srgb, ${color} ${pct}%, transparent)`;

const SYNC_DEBOUNCE_MS = 150;

/** Blockly event types that can change generated code. */
const CODE_AFFECTING_EVENTS = new Set([
  "create",           // block created
  "delete",           // block deleted
  "move",             // block moved / connected / disconnected
  "change",           // field value changed
]);

function isCodeAffectingEvent(event: Blockly.Events.Abstract): boolean {
  return CODE_AFFECTING_EVENTS.has(event.type);
}

/** Dynamically imports CodeMirror. Throws a helpful error if not installed. */
async function loadCodeMirror() {
  try {
    const [view, state, langJs] = await Promise.all([
      import("@codemirror/view"),
      import("@codemirror/state"),
      import("@codemirror/lang-javascript"),
    ]);
    return { view, state, langJs };
  } catch {
    throw new Error(
      "CodeMirror is required for the code editor. Install it:\n" +
        "  bun add codemirror @codemirror/view @codemirror/state @codemirror/lang-javascript\n" +
        "  # or: npm install codemirror @codemirror/view @codemirror/state @codemirror/lang-javascript",
    );
  }
}

function buildThemeExtension(
  cmView: typeof import("@codemirror/view"),
  theme: MorphicCodeEditorTheme,
): Extension {
  const t = { ...DEFAULT_THEME, ...theme };
  return cmView.EditorView.theme({
    "&": {
      fontSize: t.fontSize,
      fontFamily: t.fontFamily,
      backgroundColor: t.background,
      color: t.foreground,
    },
    ".cm-content": {
      lineHeight: String(t.lineHeight),
    },
    ".cm-gutters": {
      backgroundColor: t.gutterBackground,
      color: t.gutterForeground,
      border: "none",
    },
    "&.cm-focused .cm-selectionBackground, .cm-selectionBackground": {
      backgroundColor: `${t.selectionBackground} !important`,
    },
    ".morphic-placeholder-default, .morphic-placeholder-set": {
      textDecoration: "underline",
      textDecorationColor: mix(t.foreground, 30),
      textDecorationThickness: "1px",
      textUnderlineOffset: "3px",
      // Pad the mark visually so short placeholders (e.g. a single digit) have
      // a wider underline and a bigger click target.
      padding: "0 0.25em",
    },
    ".morphic-placeholder-default": {
      fontStyle: "italic",
      opacity: "0.55",
    },
    ".morphic-delete-marker": {
      color: mix(t.foreground, 70),
      backgroundColor: mix(t.foreground, 12),
    },
    ".morphic-delete-marker:hover": {
      color: t.foreground,
      backgroundColor: mix(t.foreground, 22),
    },
    ".morphic-grip-marker": {
      color: mix(t.foreground, 75),
    },
    ".morphic-grip-marker:hover": {
      color: t.foreground,
    },
  });
}

export class MorphicCodeEditor {
  private editorView?: EditorView;
  private container: HTMLElement;
  private options: MorphicCodeEditorOptions;
  private workspace: Blockly.WorkspaceSvg;
  private generateWithMetadata: () => MorphicCodeGenerationResult;

  private visible = true;
  private syncTimer?: ReturnType<typeof setTimeout>;
  private changeListener?: (event: Blockly.Events.Abstract) => void;
  private lastCode = "";

  /** Latest metadata from the most recent code generation. */
  public metadata: MorphicCodeGenerationResult["metadata"] = new Map();

  /**
   * Latest placeholder ranges. Sorted by `start` ascending. Used to suppress
   * block-line highlighting when the cursor lands inside a value-slot range
   * (a placeholder is its own selectable target).
   */
  private placeholders: MorphicPlaceholderRange[] = [];

  /**
   * Find the placeholder that covers `pos`. End is inclusive so a click that
   * lands just past a single-digit marker still resolves; when ranges nest
   * (e.g. "0 < 0" outer with two inner "0" markers) the narrowest match wins
   * so clicks resolve to the editable inner range. Returns `null` when the
   * editor has placeholder markers disabled (e.g. the preview editor) so
   * clicks fall through to the block-line selection path instead.
   */
  private findPlaceholderAtPos(pos: number): MorphicPlaceholderRange | null {
    if (this.options.showPlaceholderMarkers === false) return null;
    let best: MorphicPlaceholderRange | null = null;
    let bestSize = Infinity;
    for (const p of this.placeholders) {
      if (p.start > pos) break;
      if (pos >= p.start && pos <= p.end) {
        const size = p.end - p.start;
        if (size < bestSize) {
          bestSize = size;
          best = p;
        }
      }
    }
    return best;
  }

  /** DOM root of the active inline placeholder editor (input/select), if open. */
  private placeholderEditorEl?: HTMLElement;
  private placeholderEditorScrollHandler?: () => void;

  private closePlaceholderEditor(): void {
    // Clear state references BEFORE calling .remove(): removal of a focused
    // element synchronously fires a blur event, whose handler re-enters this
    // method. Without the early bailout, the second call tries to remove an
    // element that's already detached and throws NotFoundError — which then
    // leaves the editor in a stuck state where new placeholders can't open.
    const el = this.placeholderEditorEl;
    if (!el) return;
    this.placeholderEditorEl = undefined;
    if (this.placeholderEditorScrollHandler && this.editorView) {
      this.editorView.scrollDOM.removeEventListener("scroll", this.placeholderEditorScrollHandler);
      this.placeholderEditorScrollHandler = undefined;
    }
    if (el.parentNode) el.parentNode.removeChild(el);
  }

  /**
   * Open an inline editor (input/select) over the placeholder range and call
   * `onPlaceholderApply` when the user commits. Read-only CodeMirror stays
   * read-only; this overlay is a separate DOM element positioned via
   * `coordsAtPos`. Closed on Enter/blur (apply), Escape (cancel), or doc
   * change / scroll.
   */
  private openPlaceholderEditor(range: MorphicPlaceholderRange): void {
    if (!this.editorView || !range.edit) return;
    const onApply = this.options.onPlaceholderApply;
    if (!onApply) return;

    this.closePlaceholderEditor();

    const view = this.editorView;
    const startCoords = view.coordsAtPos(range.start);
    const endCoords = view.coordsAtPos(range.end);
    if (!startCoords || !endCoords) return;
    const scrollerRect = view.scrollDOM.getBoundingClientRect();

    const currentText = view.state.doc.sliceString(range.start, range.end);
    const edit = range.edit;

    let inputEl: HTMLInputElement | HTMLSelectElement;
    if (edit.fieldType === "dropdown") {
      const select = document.createElement("select");
      for (const [label, value] of edit.options ?? []) {
        const opt = document.createElement("option");
        opt.value = value;
        opt.textContent = label;
        select.appendChild(opt);
      }
      inputEl = select;
    } else {
      const input = document.createElement("input");
      input.type = edit.fieldType === "number" ? "number" : "text";
      input.value = currentText;
      inputEl = input;
    }

    const computed = getComputedStyle(view.contentDOM);
    // Inherit the editor's own background so the input matches the active
    // theme. The CodeMirror theme's `&` selector targets `view.dom` (the
    // editor root), so that's where the opaque background lives; walk up
    // from contentDOM if needed in case the theme set it elsewhere.
    const editorBg = (() => {
      let el: HTMLElement | null = view.dom;
      while (el) {
        const bg = getComputedStyle(el).backgroundColor;
        if (bg && bg !== "rgba(0, 0, 0, 0)" && bg !== "transparent") return bg;
        el = el.parentElement;
      }
      return "#fff";
    })();
    Object.assign(inputEl.style, {
      position: "absolute",
      left: `${startCoords.left - scrollerRect.left + view.scrollDOM.scrollLeft}px`,
      top: `${startCoords.top - scrollerRect.top + view.scrollDOM.scrollTop}px`,
      minWidth: `${Math.max(40, endCoords.right - startCoords.left + 8)}px`,
      height: `${startCoords.bottom - startCoords.top}px`,
      font: computed.font,
      lineHeight: computed.lineHeight,
      padding: "0 2px",
      margin: "0",
      border: `1px solid ${computed.color}`,
      borderRadius: "2px",
      background: editorBg,
      color: computed.color,
      boxSizing: "border-box",
      zIndex: "20",
    });

    view.scrollDOM.appendChild(inputEl);
    this.placeholderEditorEl = inputEl;

    const apply = (): void => {
      const newValue = inputEl.value;
      this.closePlaceholderEditor();
      onApply(edit, newValue);
    };
    const cancel = (): void => {
      this.closePlaceholderEditor();
    };

    inputEl.addEventListener("keydown", (e) => {
      if (e.key === "Enter") { e.preventDefault(); apply(); }
      else if (e.key === "Escape") { e.preventDefault(); cancel(); }
    });
    inputEl.addEventListener("blur", () => apply());
    // Don't let clicks on the input bubble into CodeMirror's pointer handling
    // — otherwise CodeMirror would try to position its cursor in the doc and
    // could steal focus before the input commits.
    inputEl.addEventListener("mousedown", (e) => e.stopPropagation());
    if (edit.fieldType === "dropdown") {
      // The codespace renders the dropdown's display label (e.g. "=="), but
      // <option> values carry the stored key (e.g. "EQ"). Pre-select using
      // the field's actual stored value so the current option is highlighted.
      const block = this.workspace.getBlockById(edit.blockId);
      const field = block?.getField(edit.fieldName);
      const currentValue = field?.getValue();
      if (currentValue != null) {
        (inputEl as HTMLSelectElement).value = String(currentValue);
      }
      // Apply on change so the dropdown commits without an explicit blur.
      inputEl.addEventListener("change", () => apply());
    }

    // Close on editor scroll — repositioning is more work than re-opening.
    this.placeholderEditorScrollHandler = () => this.closePlaceholderEditor();
    view.scrollDOM.addEventListener("scroll", this.placeholderEditorScrollHandler);

    // Defer focus to the next paint frame — `setTimeout(0)` runs before
    // CodeMirror has finished its own pointer/focus handling on the click
    // that opened us, so focus would land on the editor instead of the input
    // (especially noticeable right after a drag-in, when Blockly's drag
    // sequence is still settling). One requestAnimationFrame is enough.
    requestAnimationFrame(() => {
      inputEl.focus();
      if (inputEl instanceof HTMLInputElement) inputEl.select();
    });
  }

  /** Called when the user's cursor line changes in the editor. */
  public onCursorLine?: (line: number) => void;

  /**
   * Called when the user clicks in the empty area below the last rendered
   * line. CodeMirror snaps the cursor to end-of-doc on such clicks, which
   * isn't enough to detect "user wants to deselect" — the cursor often lands
   * on a line that's still inside the currently selected block's range.
   */
  public onEmptyClick?: () => void;

  // Cached CodeMirror modules (loaded once on first mount).
  private cm?: Awaited<ReturnType<typeof loadCodeMirror>>;
  private themeCompartment?: import("@codemirror/state").Compartment;
  private syntaxHighlightCompartment?: import("@codemirror/state").Compartment;
  private highlightEffect?: StateEffect<HighlightRange>;
  private highlightColor = "rgba(255, 255, 255, 0.07)";
  private metadataEffect?: StateEffectType<MorphicCodeMetadata>;
  private placeholderEffect?: StateEffectType<MorphicPlaceholderRange[]>;
  private dropIndicatorEffect?: StateEffectType<DropIndicator | null>;
  private emptyClickListener?: (e: MouseEvent) => void;

  constructor(
    container: HTMLElement,
    workspace: Blockly.WorkspaceSvg,
    generateWithMetadata: () => MorphicCodeGenerationResult,
    options: MorphicCodeEditorOptions = {},
  ) {
    this.container = container;
    this.workspace = workspace;
    this.generateWithMetadata = generateWithMetadata;
    this.options = options;
  }

  async mount(): Promise<void> {
    this.cm = await loadCodeMirror();
    const { view: cmView, state: cmState, langJs } = this.cm;

    this.themeCompartment = new cmState.Compartment();
    this.syntaxHighlightCompartment = new cmState.Compartment();

    const themeExt = buildThemeExtension(cmView, this.options.theme ?? {});
    const initialHighlightExt = buildHighlightExtensions(
      cmView,
      cmState,
      this.options.highlightRules,
    );

    // Shared metadata effect — dispatched in syncNow, consumed by gutter fields.
    const metadataEffect = cmState.StateEffect.define<MorphicCodeMetadata>();
    this.metadataEffect = metadataEffect;

    // ── Placeholder marker state field ──
    // Codespace overlays an always-on underline on every value position.
    // Ranges with kind: "default" get an additional dim-italic style; "set"
    // ranges (placeholder or user-attached real block) keep normal style.
    const placeholderEffect = cmState.StateEffect.define<MorphicPlaceholderRange[]>();
    this.placeholderEffect = placeholderEffect;
    const placeholderDefaultMark = cmView.Decoration.mark({ class: "morphic-placeholder-default" });
    const placeholderSetMark = cmView.Decoration.mark({ class: "morphic-placeholder-set" });
    const placeholderField = cmState.StateField.define<import("@codemirror/view").DecorationSet>({
      create() {
        return cmView.Decoration.none;
      },
      update(decorations, tr) {
        for (const effect of tr.effects) {
          if (effect.is(placeholderEffect)) {
            const ranges = effect.value;
            if (!ranges || ranges.length === 0) return cmView.Decoration.none;
            const docLen = tr.state.doc.length;
            const sorted = [...ranges]
              .filter((r) => r.start < r.end && r.end <= docLen)
              .sort((a, b) => a.start - b.start || a.end - b.end);
            const builder = new cmState.RangeSetBuilder<import("@codemirror/view").Decoration>();
            for (const r of sorted) {
              builder.add(r.start, r.end, r.kind === "default" ? placeholderDefaultMark : placeholderSetMark);
            }
            return builder.finish();
          }
        }
        if (!tr.changes.empty) {
          return cmView.Decoration.none;
        }
        return decorations;
      },
      provide(field) {
        return cmView.EditorView.decorations.from(field);
      },
    });

    // ── Highlight state field (line decorations driven by StateEffect) ──
    const setHighlight = cmState.StateEffect.define<HighlightRange>();
    this.highlightEffect = setHighlight as unknown as StateEffect<HighlightRange>;

    const editor = this;
    const highlightField = cmState.StateField.define<import("@codemirror/view").DecorationSet>({
      create() {
        return cmView.Decoration.none;
      },
      update(decorations, tr) {
        for (const effect of tr.effects) {
          if (effect.is(setHighlight)) {
            const value = effect.value;
            if (!value) return cmView.Decoration.none;

            const spans = Array.isArray(value) ? value : [value];
            if (spans.length === 0) return cmView.Decoration.none;

            const doc = tr.state.doc;
            const mark = cmView.Decoration.mark({
              class: "morphic-highlight",
              attributes: { style: `background: ${editor.highlightColor}` },
            });
            const ranges = spans
              .map((s) => {
                const from = doc.line(Math.min(s.fromLine, doc.lines)).from;
                const to = doc.line(Math.min(s.toLine, doc.lines)).to;
                return mark.range(from, to);
              })
              .sort((a, b) => a.from - b.from);
            return cmView.Decoration.set(ranges);
          }
        }
        // Drop stale highlights whenever the doc changes; selection sync will
        // re-apply fresh ones on the next block-selection event.
        if (!tr.changes.empty) {
          return cmView.Decoration.none;
        }
        return decorations;
      },
      provide(field) {
        return cmView.EditorView.decorations.from(field);
      },
    });

    // ── Cursor activity listener ──
    // Pointer clicks are handled by the mousedown listener below — that path
    // works even when the cursor doesn't move (e.g. clicking the same line
    // again) and lets us distinguish "click below content" cleanly. Here we
    // only react to non-pointer movements (keyboard, programmatic).
    const cursorListener = cmView.EditorView.updateListener.of((update) => {
      // Doc replacements (codespace re-sync after a Blockly change) snap the
      // cursor to a new position. That's not a user-initiated cursor move —
      // treating it as one would spuriously select the first block whenever
      // the user commits an edit or drops a new block into the workspace.
      if (update.docChanged) return;
      if (update.transactions.some((tr) => tr.isUserEvent("select.pointer"))) {
        return;
      }
      const pos = update.state.selection.main.head;
      const prevPos = update.startState.selection.main.head;
      if (pos === prevPos) return;
      // Cursor inside a placeholder: clear block highlight rather than re-selecting
      // the enclosing block. The placeholder is the selectable target here.
      if (editor.findPlaceholderAtPos(pos)) {
        editor.onEmptyClick?.();
        return;
      }
      if (!editor.onCursorLine) return;
      const line = update.state.doc.lineAt(pos).number;
      editor.onCursorLine(line);
    });

    const showPlaceholderMarkers = this.options.showPlaceholderMarkers !== false;
    const extensions: Extension[] = [
      cmView.lineNumbers(),
      cmView.highlightSpecialChars(),
      cmState.EditorState.readOnly.of(true),
      langJs.javascript(),
      highlightField,
      ...(showPlaceholderMarkers ? [placeholderField] : []),
      cursorListener,
      this.themeCompartment.of(themeExt),
      this.syntaxHighlightCompartment.of(initialHighlightExt),
      ...this.buildDeleteExtensions(cmView, cmState, metadataEffect),
      ...this.buildGripExtensions(cmView, cmState, metadataEffect),
      ...this.buildDropIndicatorExtensions(cmView, cmState),
      ...(this.options.extensions ?? []) as Extension[],
    ];

    const result = this.generateWithMetadata();
    this.lastCode = result.code;
    this.metadata = result.metadata;
    this.placeholders = [...result.placeholders].sort((a, b) => a.start - b.start);

    this.editorView = new cmView.EditorView({
      parent: this.container,
      state: cmState.EditorState.create({
        doc: this.lastCode,
        extensions,
      }),
    });

    // Populate the delete gutter with initial metadata (if onDelete is configured).
    if (this.metadataEffect && this.metadata.size > 0) {
      this.editorView.dispatch({
        effects: this.metadataEffect.of(this.metadata),
      });
    }

    // Populate placeholder decorations for the initial doc.
    if (this.placeholderEffect && result.placeholders.length > 0) {
      this.editorView.dispatch({
        effects: this.placeholderEffect.of(result.placeholders),
      });
    }

    this.emptyClickListener = (e: MouseEvent) => {
      if (this.isBelowLastLine(e.clientY)) {
        this.onEmptyClick?.();
        return;
      }
      // Click inside a placeholder: clear block highlight (placeholder is the
      // selectable target). If the placeholder is editable, open inline editor.
      const pos = this.editorView?.posAtCoords({ x: e.clientX, y: e.clientY });
      if (typeof pos === "number") {
        const range = this.findPlaceholderAtPos(pos);
        if (range) {
          this.onEmptyClick?.();
          if (range.edit && this.options.onPlaceholderApply) {
            // Defer to the next frame so CodeMirror's own focus/cursor
            // handling doesn't immediately steal focus from the input.
            requestAnimationFrame(() => this.openPlaceholderEditor(range));
          }
          return;
        }
      }
      // Resolve the click directly so block selection still fires when the
      // CodeMirror cursor would otherwise stay put (e.g. clicking the line
      // it's already parked on after a re-render).
      if (this.onCursorLine) {
        const line = this.getLineAtCoords(e.clientX, e.clientY);
        if (line !== null) {
          this.onCursorLine(line);
        }
      }
    };
    this.editorView.scrollDOM.addEventListener("mousedown", this.emptyClickListener);

    this.attachSyncListener();
  }

  private buildDeleteExtensions(
    cmView: typeof import("@codemirror/view"),
    cmState: typeof import("@codemirror/state"),
    metadataEffect: StateEffectType<MorphicCodeMetadata>,
  ): Extension[] {
    const onDelete = this.options.onDelete;
    if (!onDelete) return [];

    class DeleteMarker extends cmView.GutterMarker {
      toDOM() {
        const el = document.createElement("span");
        el.textContent = "✕";
        el.className = "morphic-delete-marker";
        el.style.cssText = [
          "display: inline-flex",
          "align-items: center",
          "justify-content: center",
          "width: 16px",
          "height: 16px",
          "margin: 0 4px",
          "border-radius: 50%",
          "font-size: 10px",
          "line-height: 1",
          "cursor: pointer",
          "transition: background 0.15s, color 0.15s",
        ].join(";");
        return el;
      }
    }
    const marker = new DeleteMarker();

    const markersField = cmState.StateField.define<import("@codemirror/state").RangeSet<import("@codemirror/view").GutterMarker>>({
      create() {
        return cmState.RangeSet.empty;
      },
      update(markers, tr) {
        for (const effect of tr.effects) {
          if (effect.is(metadataEffect)) {
            const meta = effect.value;
            const doc = tr.state.doc;
            const lines = new Set<number>();
            for (const { startLine } of meta.values()) {
              if (startLine >= 1 && startLine <= doc.lines) {
                lines.add(startLine);
              }
            }
            const ranges = Array.from(lines)
              .sort((a, b) => a - b)
              .map((line) => marker.range(doc.line(line).from));
            return cmState.RangeSet.of(ranges, true);
          }
        }
        return markers.map(tr.changes);
      },
    });

    const deleteGutter = cmView.gutter({
      class: "morphic-delete-gutter",
      markers(view) {
        return view.state.field(markersField);
      },
      initialSpacer: () => marker,
      domEventHandlers: {
        click(view, gutterBlock) {
          const line = view.state.doc.lineAt(gutterBlock.from).number;
          onDelete(line);
          return true;
        },
      },
    });

    const deleteKeymap = cmView.keymap.of([
      {
        key: "Delete",
        run: (view) => {
          if (!view.state.selection.main.empty) return false;
          const line = view.state.doc.lineAt(view.state.selection.main.head).number;
          onDelete(line);
          return true;
        },
      },
      {
        key: "Backspace",
        run: (view) => {
          if (!view.state.selection.main.empty) return false;
          const line = view.state.doc.lineAt(view.state.selection.main.head).number;
          onDelete(line);
          return true;
        },
      },
    ]);

    return [markersField, deleteGutter, cmState.Prec.highest(deleteKeymap)];
  }

  private buildGripExtensions(
    cmView: typeof import("@codemirror/view"),
    cmState: typeof import("@codemirror/state"),
    metadataEffect: StateEffectType<MorphicCodeMetadata>,
  ): Extension[] {
    const canDragBlock = this.options.canDragBlock;
    if (!canDragBlock) return [];

    class GripMarker extends cmView.GutterMarker {
      constructor(public readonly blockId: string) {
        super();
      }
      override eq(other: import("@codemirror/view").GutterMarker): boolean {
        return other instanceof GripMarker && other.blockId === this.blockId;
      }
      toDOM() {
        const el = document.createElement("span");
        el.textContent = "⠿";
        el.draggable = true;
        el.className = "morphic-grip-marker";
        el.style.cssText = [
          "display: inline-flex",
          "align-items: center",
          "justify-content: center",
          "width: 16px",
          "height: 16px",
          "margin: 0 2px",
          "font-size: 14px",
          "line-height: 1",
          "cursor: grab",
          "user-select: none",
          "transition: color 0.15s",
        ].join(";");
        const blockId = this.blockId;
        el.addEventListener("dragstart", (e) => {
          if (!e.dataTransfer) return;
          e.dataTransfer.setData(BLOCK_ID_DRAG_KEY, blockId);
          e.dataTransfer.effectAllowed = "move";
          el.style.cursor = "grabbing";
          activeGripDragSourceId = blockId;
        });
        el.addEventListener("dragend", () => {
          el.style.cursor = "grab";
          activeGripDragSourceId = undefined;
        });
        return el;
      }
    }

    const markersField = cmState.StateField.define<
      import("@codemirror/state").RangeSet<import("@codemirror/view").GutterMarker>
    >({
      create() {
        return cmState.RangeSet.empty;
      },
      update(markers, tr) {
        for (const effect of tr.effects) {
          if (effect.is(metadataEffect)) {
            const meta = effect.value;
            const doc = tr.state.doc;
            // One marker per startLine; first eligible block id wins.
            const lineToId = new Map<number, string>();
            for (const [id, { startLine }] of meta) {
              if (startLine < 1 || startLine > doc.lines) continue;
              if (lineToId.has(startLine)) continue;
              if (!canDragBlock(id)) continue;
              lineToId.set(startLine, id);
            }
            const ranges = Array.from(lineToId.entries())
              .sort((a, b) => a[0] - b[0])
              .map(([line, id]) => new GripMarker(id).range(doc.line(line).from));
            return cmState.RangeSet.of(ranges, true);
          }
        }
        return markers.map(tr.changes);
      },
    });

    const gripGutter = cmView.gutter({
      class: "morphic-grip-gutter",
      markers(view) {
        return view.state.field(markersField);
      },
      initialSpacer: () => new GripMarker(""),
    });

    return [markersField, gripGutter];
  }

  private buildDropIndicatorExtensions(
    cmView: typeof import("@codemirror/view"),
    cmState: typeof import("@codemirror/state"),
  ): Extension[] {
    const setIndicator = cmState.StateEffect.define<DropIndicator | null>();
    this.dropIndicatorEffect = setIndicator as unknown as StateEffectType<DropIndicator | null>;

    const indicatorField = cmState.StateField.define<
      import("@codemirror/view").DecorationSet
    >({
      create() {
        return cmView.Decoration.none;
      },
      update(decorations, tr) {
        for (const effect of tr.effects) {
          if (effect.is(setIndicator)) {
            const v = effect.value;
            if (!v) return cmView.Decoration.none;
            const doc = tr.state.doc;
            const line = Math.max(1, Math.min(v.line, doc.lines));
            const lineRef = doc.line(line);
            const cls =
              v.position === "above"
                ? "morphic-drop-indicator-above"
                : "morphic-drop-indicator-below";
            const deco = cmView.Decoration.line({ class: cls });
            return cmView.Decoration.set([deco.range(lineRef.from)]);
          }
        }
        if (!tr.changes.empty) return cmView.Decoration.none;
        return decorations;
      },
      provide(field) {
        return cmView.EditorView.decorations.from(field);
      },
    });

    const indicatorTheme = cmView.EditorView.baseTheme({
      ".morphic-drop-indicator-above": {
        boxShadow: "inset 0 2px 0 0 #5a86bc",
      },
      ".morphic-drop-indicator-below": {
        boxShadow: "inset 0 -2px 0 0 #5a86bc",
      },
    });

    return [indicatorField, indicatorTheme];
  }

  show(): void {
    if (this.visible) return;
    this.visible = true;
    this.container.style.display = "";
    this.syncNow();
    this.attachSyncListener();
  }

  hide(): void {
    if (!this.visible) return;
    this.visible = false;
    this.container.style.display = "none";
    this.detachSyncListener();
  }

  isVisible(): boolean {
    return this.visible;
  }

  /** Highlight one or more ranges of 1-based lines in the editor. */
  highlightLines(spans: LineSpan | LineSpan[]): void {
    if (!this.editorView || !this.highlightEffect) return;
    this.editorView.dispatch({
      effects: (this.highlightEffect as any).of(spans satisfies HighlightRange),
    });
  }

  /** Remove all line highlights. */
  clearHighlight(): void {
    if (!this.editorView || !this.highlightEffect) return;
    this.editorView.dispatch({
      effects: (this.highlightEffect as any).of(null),
    });
  }

  /** Update the highlight background colour. */
  setHighlightColor(color: string): void {
    this.highlightColor = color;
  }

  /** Show a drop-position indicator above (or below) the given 1-based line. */
  showDropIndicator(line: number, position: "above" | "below" = "above"): void {
    if (!this.editorView || !this.dropIndicatorEffect) return;
    this.editorView.dispatch({
      effects: this.dropIndicatorEffect.of({ line, position }),
    });
  }

  /** Hide the drop-position indicator if currently shown. */
  hideDropIndicator(): void {
    if (!this.editorView || !this.dropIndicatorEffect) return;
    this.editorView.dispatch({
      effects: this.dropIndicatorEffect.of(null),
    });
  }

  /** Return the 1-based line number at the given client coordinates, or null. */
  getLineAtCoords(x: number, y: number): number | null {
    if (!this.editorView) return null;
    const pos = this.editorView.posAtCoords({ x, y });
    if (pos === null) return null;
    return this.editorView.state.doc.lineAt(pos).number;
  }

  /** Total line count of the editor's current document. */
  getLineCount(): number {
    return this.editorView?.state.doc.lines ?? 0;
  }

  /** Whether the given clientY is past the bottom of the last rendered line. */
  isBelowLastLine(clientY: number): boolean {
    if (!this.editorView) return false;
    const doc = this.editorView.state.doc;
    const endPos = doc.line(doc.lines).to;
    const coords = this.editorView.coordsAtPos(endPos);
    if (!coords) return false;
    return clientY > coords.bottom;
  }

  /** Whether clientY is in the lower half of the given 1-based line's bbox. */
  isInLowerHalfOfLine(line: number, clientY: number): boolean {
    if (!this.editorView) return false;
    const doc = this.editorView.state.doc;
    if (line < 1 || line > doc.lines) return false;
    const lineRef = doc.line(line);
    const top = this.editorView.coordsAtPos(lineRef.from);
    const bottom = this.editorView.coordsAtPos(lineRef.to);
    if (!top || !bottom) return false;
    return clientY > (top.top + bottom.bottom) / 2;
  }

  setTheme(theme: MorphicCodeEditorTheme): void {
    if (!this.editorView || !this.cm || !this.themeCompartment) return;
    const themeExt = buildThemeExtension(this.cm.view, theme);
    this.editorView.dispatch({
      effects: this.themeCompartment.reconfigure(themeExt),
    });
  }

  /**
   * Swap the active token-highlight rules. Pass `undefined` to clear. Used by
   * MorphicBlocks on `setModes()` so the codespace and preview re-tokenize for
   * the new mode's `primarySource` / `preview` element.
   */
  setHighlightRules(rules: MorphicHighlightDefinition | undefined): void {
    if (!this.editorView || !this.cm || !this.syntaxHighlightCompartment) return;
    const ext = buildHighlightExtensions(this.cm.view, this.cm.state, rules);
    this.editorView.dispatch({
      effects: this.syntaxHighlightCompartment.reconfigure(ext),
    });
  }

  dispose(): void {
    this.detachSyncListener();
    if (this.syncTimer !== undefined) {
      clearTimeout(this.syncTimer);
      this.syncTimer = undefined;
    }
    if (this.emptyClickListener && this.editorView) {
      this.editorView.scrollDOM.removeEventListener("mousedown", this.emptyClickListener);
      this.emptyClickListener = undefined;
    }
    this.editorView?.destroy();
    this.editorView = undefined;
    this.metadata = new Map();
    this.placeholders = [];
    this.lastCode = "";
  }

  /** Force a regeneration now (e.g. after the underlying template source changes). */
  public refresh(): void {
    this.syncNow();
  }

  private syncNow(): void {
    if (!this.editorView || !this.cm) return;
    const result = this.generateWithMetadata();
    if (result.code === this.lastCode) return;
    // Code is changing — close any open inline placeholder editor; its anchor
    // ranges no longer exist after the doc is replaced.
    this.closePlaceholderEditor();
    this.lastCode = result.code;
    this.metadata = result.metadata;
    this.placeholders = [...result.placeholders].sort((a, b) => a.start - b.start);
    const effects: StateEffect<unknown>[] = [];
    if (this.metadataEffect) effects.push(this.metadataEffect.of(result.metadata));
    if (this.placeholderEffect) effects.push(this.placeholderEffect.of(result.placeholders));
    this.editorView.dispatch({
      changes: {
        from: 0,
        to: this.editorView.state.doc.length,
        insert: result.code,
      },
      effects: effects.length > 0 ? effects : undefined,
    });
  }

  private scheduleDebouncedSync(): void {
    if (this.syncTimer !== undefined) {
      clearTimeout(this.syncTimer);
    }
    this.syncTimer = setTimeout(() => {
      this.syncTimer = undefined;
      this.syncNow();
    }, SYNC_DEBOUNCE_MS);
  }

  private attachSyncListener(): void {
    if (this.changeListener) return;
    this.changeListener = (event: Blockly.Events.Abstract) => {
      if (isCodeAffectingEvent(event)) {
        this.scheduleDebouncedSync();
      }
    };
    this.workspace.addChangeListener(this.changeListener);
  }

  private detachSyncListener(): void {
    if (!this.changeListener) return;
    this.workspace.removeChangeListener(this.changeListener);
    this.changeListener = undefined;
    if (this.syncTimer !== undefined) {
      clearTimeout(this.syncTimer);
      this.syncTimer = undefined;
    }
  }
}
