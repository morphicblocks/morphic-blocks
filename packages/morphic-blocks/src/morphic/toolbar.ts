import type {
  MorphicToolbarConfig,
  MorphicToolbarCtx,
  MorphicToolbarDisplay,
  MorphicToolbarItem,
  MorphicToolbarPane,
} from "./types";

const ICON_COPY = `<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="4" y="4" width="9" height="10" rx="1.5"/><path d="M3 11V3a1 1 0 0 1 1-1h7"/></svg>`;
const ICON_PASTE = `<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 3h6v2H5z"/><path d="M4 3H3a1 1 0 0 0-1 1v9a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V4a1 1 0 0 0-1-1h-1"/></svg>`;
const ICON_UNDO = `<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 8h7a3 3 0 0 1 0 6H6"/><polyline points="5 5 2 8 5 11"/></svg>`;
const ICON_REDO = `<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M13 8H6a3 3 0 0 0 0 6h4"/><polyline points="11 5 14 8 11 11"/></svg>`;
const ICON_CLEAR = `<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 4 13 4"/><path d="M5 4V3a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v1"/><path d="M4 4l1 9a1 1 0 0 0 1 1h4a1 1 0 0 0 1-1l1-9"/></svg>`;
const ICON_RUN = `<svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor"><polygon points="4,3 13,8 4,13"/></svg>`;
const ICON_ZOOM_IN = `<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="7" cy="7" r="4"/><line x1="10" y1="10" x2="14" y2="14"/><line x1="5" y1="7" x2="9" y2="7"/><line x1="7" y1="5" x2="7" y2="9"/></svg>`;
const ICON_ZOOM_OUT = `<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="7" cy="7" r="4"/><line x1="10" y1="10" x2="14" y2="14"/><line x1="5" y1="7" x2="9" y2="7"/></svg>`;
const ICON_ZOOM_FIT = `<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 3 3 6 3"/><polyline points="13 6 13 3 10 3"/><polyline points="3 10 3 13 6 13"/><polyline points="13 10 13 13 10 13"/></svg>`;
const ICON_SAVE = `<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 2h8l2 2v10H3z"/><rect x="5" y="2" width="6" height="4"/><rect x="5" y="9" width="6" height="4"/></svg>`;
const ICON_LOAD = `<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 8v5a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V8"/><polyline points="5 5 8 2 11 5"/><line x1="8" y1="2" x2="8" y2="10"/></svg>`;
const ICON_RESET = `<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 8a5 5 0 1 0 1.5-3.5"/><polyline points="3 2 3 5 6 5"/></svg>`;
const ICON_PREVIEW = `<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M2 8s2-4 6-4 6 4 6 4-2 4-6 4-6-4-6-4z"/><circle cx="8" cy="8" r="1.5"/></svg>`;

export interface MorphicRunEventDetail {
  code: string;
  result: unknown;
  error: Error | null;
}

export interface MorphicToolbarHandle {
  refresh: () => void;
  dispose: () => void;
  pane: MorphicToolbarPane;
}

export const toolbarItems = {
  languageLabel(): MorphicToolbarItem {
    return {
      id: "language-label",
      render: (ctx) => {
        const span = document.createElement("span");
        span.className = "morphic-toolbar-label";
        span.textContent = readLanguageLabel(ctx);
        return span;
      },
    };
  },

  /**
   * Block-aware copy. Resolves the active block via selection-sync or cursor
   * line, then copies it to the framework's internal clipboard. Mirrors the
   * generated code text to the system clipboard as a best-effort.
   */
  copy(): MorphicToolbarItem {
    return {
      id: "copy",
      label: "Copy",
      title: "Copy block",
      icon: ICON_COPY,
      onClick: (ctx) => {
        ctx.engine.copyActiveBlock(ctx.pane);
      },
    };
  },

  paste(): MorphicToolbarItem {
    return {
      id: "paste",
      label: "Paste",
      title: "Paste block",
      icon: ICON_PASTE,
      disabled: (ctx) => !ctx.engine.hasClipboardContents(),
      onClick: (ctx) => {
        ctx.engine.pasteActiveBlock(ctx.pane);
      },
    };
  },

  undo(): MorphicToolbarItem {
    return {
      id: "undo",
      label: "Undo",
      title: "Undo (block model)",
      icon: ICON_UNDO,
      onClick: (ctx) => {
        ctx.engine.getWorkspace()?.undo(false);
      },
      disabled: (ctx) => !ctx.engine.getWorkspace()?.getUndoStack().length,
    };
  },

  redo(): MorphicToolbarItem {
    return {
      id: "redo",
      label: "Redo",
      title: "Redo (block model)",
      icon: ICON_REDO,
      onClick: (ctx) => {
        ctx.engine.getWorkspace()?.undo(true);
      },
      disabled: (ctx) => !ctx.engine.getWorkspace()?.getRedoStack().length,
    };
  },

  zoomIn(): MorphicToolbarItem {
    return {
      id: "zoom-in",
      label: "Zoom in",
      title: "Zoom in",
      icon: ICON_ZOOM_IN,
      onClick: (ctx) => ctx.engine.zoomPane(ctx.pane, "in"),
    };
  },

  zoomOut(): MorphicToolbarItem {
    return {
      id: "zoom-out",
      label: "Zoom out",
      title: "Zoom out",
      icon: ICON_ZOOM_OUT,
      onClick: (ctx) => ctx.engine.zoomPane(ctx.pane, "out"),
    };
  },

  zoomFit(): MorphicToolbarItem {
    return {
      id: "zoom-fit",
      label: "Fit",
      title: "Reset zoom",
      icon: ICON_ZOOM_FIT,
      onClick: (ctx) => ctx.engine.zoomPane(ctx.pane, "fit"),
    };
  },

  clear(): MorphicToolbarItem {
    return {
      id: "clear",
      label: "Clear",
      title: "Clear workspace",
      icon: ICON_CLEAR,
      onClick: (ctx) => {
        if (!window.confirm("Clear workspace? This cannot be undone.")) return;
        ctx.engine.getWorkspace()?.clear();
      },
    };
  },

  /**
   * Run the workspace's generated JavaScript and dispatch a "morphic-run"
   * event on the engine. Not in any default set — hosts typically wire a
   * global Run button via `engine.runJavaScript()` instead. Kept here for
   * cases where a toolbar Run button is desired.
   */
  runCode(): MorphicToolbarItem {
    return {
      id: "run",
      label: "Run",
      title: "Run generated code",
      icon: ICON_RUN,
      onClick: (ctx) => {
        ctx.engine.runJavaScript();
      },
    };
  },

  /** Serialize the workspace and download as JSON. Not in defaults. */
  save(): MorphicToolbarItem {
    return {
      id: "save",
      label: "Save",
      title: "Save workspace as JSON",
      icon: ICON_SAVE,
      onClick: (ctx) => {
        const ws = ctx.engine.getWorkspace();
        if (!ws) return;
        const state = ctx.engine.serializeWorkspace();
        const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "workspace.json";
        a.click();
        URL.revokeObjectURL(url);
      },
    };
  },

  /** Load a workspace JSON file via a file picker. Not in defaults. */
  load(): MorphicToolbarItem {
    return {
      id: "load",
      label: "Load",
      title: "Load workspace JSON",
      icon: ICON_LOAD,
      onClick: (ctx) => {
        const input = document.createElement("input");
        input.type = "file";
        input.accept = "application/json";
        input.addEventListener("change", async () => {
          const file = input.files?.[0];
          if (!file) return;
          try {
            const text = await file.text();
            const state = JSON.parse(text);
            ctx.engine.loadWorkspace(state);
          } catch (e) {
            window.alert(`Load failed: ${e instanceof Error ? e.message : String(e)}`);
          }
        });
        input.click();
      },
    };
  },

  /** Reset the workspace to empty. With confirm. Not in defaults. */
  reset(): MorphicToolbarItem {
    return {
      id: "reset",
      label: "Reset",
      title: "Reset workspace",
      icon: ICON_RESET,
      onClick: (ctx) => {
        if (!window.confirm("Reset workspace to empty? This cannot be undone.")) return;
        ctx.engine.getWorkspace()?.clear();
      },
    };
  },

  /**
   * Toggle the preview pane's host container visibility. Not in defaults — the
   * developer decides whether the user controls this. Looks for an element
   * with `data-morphic-preview-host` and flips its `hidden` attribute.
   */
  togglePreview(): MorphicToolbarItem {
    return {
      id: "toggle-preview",
      label: "Preview",
      title: "Toggle preview pane",
      icon: ICON_PREVIEW,
      onClick: () => {
        const host = document.querySelector<HTMLElement>("[data-morphic-preview-host]");
        if (!host) return;
        host.hidden = !host.hidden;
      },
    };
  },

  readOnlyBadge(): MorphicToolbarItem {
    return {
      id: "read-only",
      align: "right",
      render: () => {
        const span = document.createElement("span");
        span.className = "morphic-toolbar-badge";
        span.textContent = "read-only";
        return span;
      },
    };
  },

  spacer(): MorphicToolbarItem {
    return {
      id: "spacer",
      render: () => {
        const el = document.createElement("span");
        el.className = "morphic-toolbar-spacer";
        return el;
      },
    };
  },

  defaultsFor(pane: MorphicToolbarPane): MorphicToolbarItem[] {
    switch (pane) {
      case "workspace":
      case "codespace":
        return [
          toolbarItems.languageLabel(),
          toolbarItems.spacer(),
          toolbarItems.undo(),
          toolbarItems.redo(),
          toolbarItems.copy(),
          toolbarItems.paste(),
          toolbarItems.zoomIn(),
          toolbarItems.zoomOut(),
          toolbarItems.zoomFit(),
          toolbarItems.clear(),
        ];
      case "preview":
        return [
          toolbarItems.languageLabel(),
          toolbarItems.spacer(),
          toolbarItems.copy(),
          toolbarItems.zoomIn(),
          toolbarItems.zoomOut(),
          toolbarItems.zoomFit(),
          toolbarItems.readOnlyBadge(),
        ];
    }
  },
};

function readLanguageLabel(ctx: MorphicToolbarCtx): string {
  const engine = ctx.engine;
  if (ctx.pane === "workspace") {
    return engine.getWorkspaceMode() ?? "";
  }
  const sourceElement =
    ctx.pane === "codespace"
      ? engine.getActivePrimarySourceElement()
      : engine.getActivePreviewElement();
  return sourceElement ?? "";
}

export function renderToolbar(
  container: HTMLElement,
  config: MorphicToolbarConfig,
  ctx: MorphicToolbarCtx,
): MorphicToolbarHandle {
  const items = config.items ?? toolbarItems.defaultsFor(config.pane);
  const display: MorphicToolbarDisplay = config.display ?? "icon";

  container.classList.add("morphic-toolbar");
  container.setAttribute("data-morphic-pane", config.pane);

  const leftGroup = document.createElement("div");
  leftGroup.className = "morphic-toolbar-left";
  const rightGroup = document.createElement("div");
  rightGroup.className = "morphic-toolbar-right";

  const refresh = (): void => {
    leftGroup.replaceChildren();
    rightGroup.replaceChildren();
    let seenSpacer = false;
    for (const item of items) {
      if (item.visible && !item.visible(ctx)) continue;
      if (item.id === "spacer") {
        seenSpacer = true;
        continue;
      }
      const target =
        item.align === "right" || (seenSpacer && item.align !== "left")
          ? rightGroup
          : leftGroup;
      target.appendChild(renderItem(item, display, ctx));
    }
  };

  container.replaceChildren(leftGroup, rightGroup);
  refresh();

  return { refresh, pane: config.pane, dispose: () => container.replaceChildren() };
}

function renderItem(
  item: MorphicToolbarItem,
  display: MorphicToolbarDisplay,
  ctx: MorphicToolbarCtx,
): HTMLElement {
  if (item.render) {
    const out = item.render(ctx);
    if (typeof out === "string") {
      const span = document.createElement("span");
      span.className = "morphic-toolbar-item";
      span.dataset.toolbarId = item.id;
      span.textContent = out;
      return span;
    }
    out.classList.add("morphic-toolbar-item");
    out.dataset.toolbarId = item.id;
    return out;
  }
  const btn = document.createElement("button");
  btn.className = "morphic-toolbar-item";
  btn.dataset.toolbarId = item.id;
  btn.type = "button";
  if (item.title) btn.title = item.title;
  applyDisplay(btn, item, display);
  if (item.disabled && item.disabled(ctx)) btn.disabled = true;
  if (item.onClick) {
    btn.addEventListener("click", () => item.onClick!(ctx));
  }
  return btn;
}

function applyDisplay(
  btn: HTMLButtonElement,
  item: MorphicToolbarItem,
  display: MorphicToolbarDisplay,
): void {
  const wantIcon = display !== "label" && !!item.icon;
  const wantLabel = display !== "icon" && !!item.label;
  const showIcon = wantIcon || (display === "icon" && !item.label);
  const showLabel = wantLabel || (display === "label" && !item.icon);
  if (showIcon && item.icon) {
    const span = document.createElement("span");
    span.className = "morphic-toolbar-icon";
    span.innerHTML = item.icon;
    btn.appendChild(span);
  }
  if (showLabel && item.label) {
    const span = document.createElement("span");
    span.className = "morphic-toolbar-text";
    span.textContent = item.label;
    btn.appendChild(span);
  }
  if (!btn.title && item.label) btn.title = item.label;
  if (!btn.childNodes.length && item.label) btn.textContent = item.label;
}
