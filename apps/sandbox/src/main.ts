import * as Blockly from "blockly";
import {
  makeResizable,
  MorphicBlocks,
  type MorphicBlockDefinition,
  type MorphicElementTypeEntry,
  type MorphicHighlightDefinition,
  type MorphicModeDefinition,
  type MorphicPresetDefinition,
  type MorphicToolboxCategory,
} from "morphic-blocks";
import definitions from "./definitions.json";
import { behaviors } from "./behaviors";
import "./style.css";

const presets = definitions.presets as MorphicPresetDefinition[];

// Enable drag-to-resize dividers between the panes.
const RESIZABLE_PANES = true;

// Auto-discover mode CSS files by filename
const modeStyles = import.meta.glob("./modes/*.css", {
  eager: true,
  query: "?url",
});

// ── DOM ────────────────────────────────────────────────

const workspaceContainer = document.getElementById("workspace-container")!;
const toolboxPanel = document.getElementById("toolbox-panel")!;
const codeEditorContainer = document.getElementById("code-editor")!;
const codespaceContainer = document.getElementById("codespace-container")!;
const previewContainer = document.getElementById("preview-container")!;
const workspacePane = document.getElementById("workspace-pane")!;
const codespacePane = document.getElementById("codespace-pane")!;
const previewPane = document.getElementById("preview-pane")!;
const outputPanel = document.getElementById("output-panel")!;
const gutterToolbox = document.getElementById("gutter-toolbox")!;
const gutterCodespace = document.getElementById("gutter-codespace")!;
const gutterPreview = document.getElementById("gutter-preview")!;
const gutterOutput = document.getElementById("gutter-output")!;
const workspaceToolbarEl = document.getElementById("workspace-toolbar")!;
const codespaceToolbarEl = document.getElementById("codespace-toolbar")!;
const previewToolbarEl = document.getElementById("preview-toolbar")!;
const outputEl = document.getElementById("output")!;
const modeButtonsContainer = document.getElementById("mode-buttons")!;
const runBtn = document.getElementById("run-btn")!;
const codeBtn = document.getElementById("code-btn")!;
const clearBtn = document.getElementById("clear-btn")!;
const themeSelect = document.getElementById("theme-select") as HTMLSelectElement;

// ── Theme ──────────────────────────────────────────────

type ThemeName = "dark" | "creme" | "light";

const THEME_STORAGE_KEY = "morphic-sandbox-theme";

const editorThemeFor = (name: ThemeName) => {
  if (name === "dark") {
    return {
      background: "#0f1117",
      foreground: "#d4d4d4",
      gutterBackground: "#0f1117",
      gutterForeground: "#5d677a",
      selectionBackground: "#264f78",
    };
  }
  if (name === "light") {
    return {
      background: "#ffffff",
      foreground: "#000000",
      gutterBackground: "#e5e5e5",
      gutterForeground: "#666666",
      selectionBackground: "#55bdcb",
    };
  }
  return {
    background: "#f5efdc",
    foreground: "#3d3a30",
    gutterBackground: "#f5efdc",
    gutterForeground: "#a59c80",
    selectionBackground: "#e0d9c2",
  };
};

const previewThemeFor = (name: ThemeName) => {
  if (name === "dark") {
    return {
      background: "#161a24",
      foreground: "#bfc7d9",
      gutterBackground: "#161a24",
      gutterForeground: "#5d677a",
      selectionBackground: "#264f78",
    };
  }
  if (name === "light") {
    return {
      background: "#ffffff",
      foreground: "#000000",
      gutterBackground: "#e5e5e5",
      gutterForeground: "#666666",
      selectionBackground: "#55bdcb",
    };
  }
  return {
    background: "#ebe5d2",
    foreground: "#3d3a30",
    gutterBackground: "#ebe5d2",
    gutterForeground: "#a59c80",
    selectionBackground: "#e0d9c2",
  };
};

function readInitialTheme(): ThemeName {
  const stored = localStorage.getItem(THEME_STORAGE_KEY);
  if (stored === "dark" || stored === "creme") return stored;
  return "light";
}

let currentTheme: ThemeName = readInitialTheme();

function applyTheme(theme: ThemeName, syncEditors: boolean): void {
  currentTheme = theme;
  document.documentElement.setAttribute("data-theme", theme);
  themeSelect.value = theme;
  if (syncEditors) {
    engine.setCodeEditorTheme(editorThemeFor(theme));
    engine.setCodespaceTheme(editorThemeFor(theme));
    engine.setPreviewTheme(previewThemeFor(theme));
  }
  localStorage.setItem(THEME_STORAGE_KEY, theme);
}

applyTheme(currentTheme, false);

themeSelect.addEventListener("change", () => {
  applyTheme(themeSelect.value as ThemeName, true);
});

// ── Engine Setup ───────────────────────────────────────

const engine = new MorphicBlocks(
  definitions.blocks as unknown as MorphicBlockDefinition[],
  behaviors,
  definitions.elementTypes as Record<string, MorphicElementTypeEntry>,
);

let currentPresetName = presets[0]?.name ?? "";

// Remembered codespace width (px) from a divider drag; re-applied across
// presets since a preset switch otherwise resets the codespace flex.
// Declared before mount() because onPresetApplied fires during mount.
let codespaceBasisPx: number | null = null;

const workspace = engine.mount({
  workspaceContainer,
  codespaceContainer,
  presets,
  preset: currentPresetName,
  onPresetApplied: handlePresetApplied,
  modesFolder: modeStyles,
  canvasToolbox: true,
  modes: definitions.modes as MorphicModeDefinition[],
  highlighting: definitions.highlighting as Record<string, MorphicHighlightDefinition>,
  toolbox: {
    categories: definitions.categories as MorphicToolboxCategory[],
  },
  blockly: {
    scrollbars: true,
    trashcan: true,
    zoom: {
      controls: true,
      wheel: true,
      startScale: 1.0,
      maxScale: 3,
      minScale: 0.3,
      scaleSpeed: 1.2,
    },
    grid: {
      spacing: 20,
      length: 3,
      colour: "#2a3345",
      snap: true,
    },
  },
});

engine.mountToolbox(toolboxPanel, {
  categories: definitions.categories as MorphicToolboxCategory[],
});

Promise.all([
  engine.mountCodeEditor(codeEditorContainer, { theme: editorThemeFor(currentTheme) }),
  engine.mountCodespace({ theme: editorThemeFor(currentTheme) }),
  engine.mountPreview(previewContainer, { theme: previewThemeFor(currentTheme) }),
]).then(() => {
  engine.hideCodeEditor();
  engine.enableSelectionSync({ highlightColor: "rgba(139, 172, 221, 0.48)" });
  engine.mountToolbar(workspaceToolbarEl, { pane: "workspace" });
  engine.mountToolbar(codespaceToolbarEl, { pane: "codespace" });
  engine.mountToolbar(previewToolbarEl, { pane: "preview" });
});


// ── Preset Buttons ─────────────────────────────────────

function handlePresetApplied(preset: MorphicPresetDefinition): void {
  currentPresetName = preset.name;
  const showWorkspace = !!preset.workspace;
  const showCodespace = !!preset.codespace;
  const showPreview = !!preset.preview;
  workspacePane.style.display = showWorkspace ? "" : "none";
  codespacePane.style.display = showCodespace ? "" : "none";
  codespacePane.style.flex =
    showCodespace && !showWorkspace
      ? "1 1 auto"
      : codespaceBasisPx != null
        ? `0 0 ${codespaceBasisPx}px`
        : "";
  previewPane.style.display = showPreview ? "" : "none";

  if (RESIZABLE_PANES) {
    gutterCodespace.hidden = !(showWorkspace && showCodespace);
    gutterPreview.hidden = !(showPreview && (showWorkspace || showCodespace));
  }

  const ws = engine.getWorkspace();
  if (ws) Blockly.svgResize(ws);
  updateActiveButton();
}

function updateActiveButton(): void {
  const buttons = modeButtonsContainer.querySelectorAll<HTMLButtonElement>("button");
  buttons.forEach((b) =>
    b.classList.toggle("active", b.dataset.preset === currentPresetName),
  );
}

modeButtonsContainer.innerHTML = "";
presets.forEach((preset) => {
  const btn = document.createElement("button");
  btn.textContent = preset.label ?? preset.name;
  btn.dataset.preset = preset.name;
  btn.addEventListener("click", () => engine.applyPreset(preset.name));
  modeButtonsContainer.appendChild(btn);
});

updateActiveButton();

// ── Resize Handling ────────────────────────────────────

const resizeObserver = new ResizeObserver(() => {
  Blockly.svgResize(workspace);
});
resizeObserver.observe(workspaceContainer);

// Draggable pane dividers (opt-in). The toolbox and output gutters are always
// present; the codespace/preview gutters are toggled per preset above.
if (RESIZABLE_PANES) {
  const reflow = (): void => Blockly.svgResize(workspace);
  gutterToolbox.hidden = false;
  gutterOutput.hidden = false;
  makeResizable(gutterToolbox, { target: toolboxPanel, axis: "x", min: 160, onResize: reflow });
  makeResizable(gutterCodespace, {
    target: codespacePane,
    axis: "x",
    min: 200,
    invert: true,
    onResize: (size) => {
      codespaceBasisPx = size;
      reflow();
    },
  });
  makeResizable(gutterPreview, { target: previewPane, axis: "x", min: 180, invert: true, onResize: reflow });
  makeResizable(gutterOutput, { target: outputPanel, axis: "y", min: 80, invert: true, onResize: reflow });
}

// ── Code Editor Toggle ─────────────────────────────────

codeBtn.addEventListener("click", () => {
  if (engine.isCodeEditorVisible()) {
    engine.hideCodeEditor();
    codeEditorContainer.classList.remove("visible");
    codeBtn.classList.remove("active");
  } else {
    engine.showCodeEditor();
    codeEditorContainer.classList.add("visible");
    codeBtn.classList.add("active");
  }
  Blockly.svgResize(workspace);
});

// ── Code Execution ─────────────────────────────────────

runBtn.addEventListener("click", () => {
  const logs: string[] = [];
  const { error } = engine.runJavaScript({
    console: {
      log: (...args) => logs.push(args.map(String).join(" ")),
      warn: (...args) => logs.push("[warn] " + args.map(String).join(" ")),
      error: (...args) => logs.push("[error] " + args.map(String).join(" ")),
    },
  });
  if (error) {
    outputEl.textContent =
      logs.join("\n") + (logs.length ? "\n" : "") + `Error: ${error.message}`;
    outputEl.style.color = "#e74c3c";
  } else {
    outputEl.textContent = logs.length > 0 ? logs.join("\n") : "(no output)";
    outputEl.style.color = "";
  }
});

clearBtn.addEventListener("click", () => {
  outputEl.textContent = "";
  outputEl.style.color = "";
});
