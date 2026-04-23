import type * as Blockly from "blockly";
import type {
  MorphicCodeEditorOptions,
  MorphicCodeEditorTheme,
  MorphicCodeGenerationResult,
} from "./types";

// Re-export the type so MorphicBlocks.ts doesn't need to import CodeMirror types.
type EditorView = import("@codemirror/view").EditorView;
type Extension = import("@codemirror/state").Extension;
type StateEffect<T = unknown> = import("@codemirror/state").StateEffect<T>;
type StateEffectType<T> = { of: (value: T) => StateEffect<T> };

/** A single span of 1-based lines. */
export interface LineSpan { fromLine: number; toLine: number }

/** One or more line spans to highlight, or `null` to clear. */
export type HighlightRange = LineSpan | LineSpan[] | null;

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

  /** Called when the user's cursor line changes in the editor. */
  public onCursorLine?: (line: number) => void;

  // Cached CodeMirror modules (loaded once on first mount).
  private cm?: Awaited<ReturnType<typeof loadCodeMirror>>;
  private themeCompartment?: import("@codemirror/state").Compartment;
  private highlightEffect?: StateEffect<HighlightRange>;
  private highlightColor = "rgba(255, 255, 255, 0.07)";
  private metadataEffect?: StateEffectType<MorphicCodeGenerationResult["metadata"]>;

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

    const themeExt = buildThemeExtension(cmView, this.options.theme ?? {});

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
    // Compare head positions rather than checking `selectionSet`, which can
    // miss clicks in a read-only editor.
    const cursorListener = cmView.EditorView.updateListener.of((update) => {
      if (!editor.onCursorLine) return;
      const pos = update.state.selection.main.head;
      const prevPos = update.startState.selection.main.head;
      if (pos === prevPos) return;
      const line = update.state.doc.lineAt(pos).number;
      editor.onCursorLine(line);
    });

    const extensions: Extension[] = [
      cmView.lineNumbers(),
      cmView.highlightSpecialChars(),
      cmState.EditorState.readOnly.of(true),
      langJs.javascript(),
      highlightField,
      cursorListener,
      this.themeCompartment.of(themeExt),
      ...this.buildDeleteExtensions(cmView, cmState),
      ...(this.options.extensions ?? []) as Extension[],
    ];

    const result = this.generateWithMetadata();
    this.lastCode = result.code;
    this.metadata = result.metadata;

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

    this.attachSyncListener();
  }

  private buildDeleteExtensions(
    cmView: typeof import("@codemirror/view"),
    cmState: typeof import("@codemirror/state"),
  ): Extension[] {
    const onDelete = this.options.onDelete;
    if (!onDelete) return [];

    const metadataEffect = cmState.StateEffect.define<MorphicCodeGenerationResult["metadata"]>();
    this.metadataEffect = metadataEffect;

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
          "background: rgba(255, 255, 255, 0.12)",
          "color: rgba(255, 255, 255, 0.7)",
          "font-size: 10px",
          "line-height: 1",
          "cursor: pointer",
          "transition: background 0.15s, color 0.15s",
        ].join(";");
        el.addEventListener("mouseenter", () => {
          el.style.background = "rgba(255, 255, 255, 0.22)";
          el.style.color = "#fff";
        });
        el.addEventListener("mouseleave", () => {
          el.style.background = "rgba(255, 255, 255, 0.12)";
          el.style.color = "rgba(255, 255, 255, 0.7)";
        });
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

  setTheme(theme: MorphicCodeEditorTheme): void {
    if (!this.editorView || !this.cm || !this.themeCompartment) return;
    const themeExt = buildThemeExtension(this.cm.view, theme);
    this.editorView.dispatch({
      effects: this.themeCompartment.reconfigure(themeExt),
    });
  }

  dispose(): void {
    this.detachSyncListener();
    if (this.syncTimer !== undefined) {
      clearTimeout(this.syncTimer);
      this.syncTimer = undefined;
    }
    this.editorView?.destroy();
    this.editorView = undefined;
    this.metadata = new Map();
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
    this.lastCode = result.code;
    this.metadata = result.metadata;
    this.editorView.dispatch({
      changes: {
        from: 0,
        to: this.editorView.state.doc.length,
        insert: result.code,
      },
      effects: this.metadataEffect ? [this.metadataEffect.of(result.metadata)] : undefined,
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
