import type * as Blockly from "blockly";
import type {
  MorphicCodeEditorOptions,
  MorphicCodeEditorTheme,
  MorphicCodeGenerationResult,
} from "./types";

// Re-export the type so MorphicBlocks.ts doesn't need to import CodeMirror types.
type EditorView = import("@codemirror/view").EditorView;
type Extension = import("@codemirror/state").Extension;

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

  // Cached CodeMirror modules (loaded once on first mount).
  private cm?: Awaited<ReturnType<typeof loadCodeMirror>>;
  private themeCompartment?: import("@codemirror/state").Compartment;

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

    const extensions: Extension[] = [
      cmView.lineNumbers(),
      cmView.highlightSpecialChars(),
      cmState.EditorState.readOnly.of(true),
      langJs.javascript(),
      this.themeCompartment.of(themeExt),
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

    this.attachSyncListener();
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
