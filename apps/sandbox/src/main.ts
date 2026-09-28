import {
  makeResizable,
  MorphicBlocks,
  type MorphicPresetDefinition,
  type MorphicViewHandle,
} from "morphic-blocks";
import definitions from "./definitions.json";
import { behaviors } from "./behaviors";
import "./style.css";

// Open the sandbox with ?rtl to try a right to left page and workspace.
const RTL = new URLSearchParams(location.search).has("rtl");
if (RTL) document.documentElement.dir = "rtl";

// The JSON import goes to the engine as is; mount() validates it. The Arabic
// test block and the preset that shows its concept text in the codespace only
// appear in the right to left sandbox.
const format = RTL
  ? definitions
  : {
      ...definitions,
      blocks: definitions.blocks.filter((block) => block.identifier !== "rtl_test"),
      presets: definitions.presets?.filter((preset) => preset.name !== "arabic"),
    };
const presets = format.presets ?? [];

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
const preview2Pane = document.getElementById("preview2-pane")!;
const preview2Container = document.getElementById("preview2-container")!;
const preview2Toolbar = document.getElementById("preview2-toolbar")!;
// The second preview the Texts preset adds with engine.addView().
let addedPreview: MorphicViewHandle | undefined;
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
    addedPreview?.setTheme(previewThemeFor(theme));
  }
  localStorage.setItem(THEME_STORAGE_KEY, theme);
}

applyTheme(currentTheme, false);

themeSelect.addEventListener("change", () => {
  applyTheme(themeSelect.value as ThemeName, true);
});

// ── Engine Setup ───────────────────────────────────────

const engine = new MorphicBlocks(format, behaviors);

// Remembered codespace width (px) from a divider drag; re-applied across
// presets since a preset switch otherwise resets the codespace flex.
// Declared before mount() because onPresetApplied fires during mount.
let codespaceBasisPx: number | null = null;

void engine.mount({
  workspaceContainer,
  toolboxContainer: toolboxPanel,
  codespaceContainer,
  previewContainer,
  codeEditorContainer,
  toolbarContainers: {
    workspace: workspaceToolbarEl,
    codespace: codespaceToolbarEl,
    preview: previewToolbarEl,
  },
  editorTheme: editorThemeFor(currentTheme),
  previewTheme: previewThemeFor(currentTheme),
  preset: presets[0]?.name,
  onPresetApplied: handlePresetApplied,
  modesFolder: modeStyles,
  blockly: {
    rtl: RTL,
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


// ── Added view (to try engine.addView) ─────────────────
// The Texts preset shows a second preview in JavaScript next to the Python one.


function showAddedPreview(show: boolean): void {
  preview2Pane.style.display = show ? "" : "none";
  if (show && !addedPreview) {
    addedPreview = engine.addView({
      kind: "preview",
      name: "second",
      container: preview2Container,
      mode: "syntax-js",
      theme: previewThemeFor(currentTheme),
      toolbar: { container: preview2Toolbar },
    });
  } else if (!show && addedPreview) {
    addedPreview.dispose();
    addedPreview = undefined;
  }
}

// ── Preset Buttons ─────────────────────────────────────

function handlePresetApplied(preset: MorphicPresetDefinition): void {
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
  showAddedPreview(preset.name === "texts");

  if (RESIZABLE_PANES) {
    gutterCodespace.hidden = !(showWorkspace && showCodespace);
    gutterPreview.hidden = !(showPreview && (showWorkspace || showCodespace));
  }

  updateActiveButton();
}

function updateActiveButton(): void {
  const buttons = modeButtonsContainer.querySelectorAll<HTMLButtonElement>("button");
  buttons.forEach((b) =>
    b.classList.toggle("active", b.dataset.preset === engine.getActivePreset()?.name),
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

// ── Tile elements and block font (to try setModeElements and refresh) ──

const tileElementsList = document.getElementById("tile-elements-list")!;
const toolboxModeName = (): string | undefined => {
  const toolbox = engine.getActivePreset()?.toolbox;
  return typeof toolbox === "string" ? toolbox : toolbox?.mode;
};

function renderTileElements(): void {
  const mode = definitions.modes?.find((m) => m.name === toolboxModeName());
  if (!mode) return;
  const shown = new Set(tileElementsShown.get(mode.name) ?? mode.elements);
  tileElementsList.innerHTML = "";
  for (const name of Object.keys(definitions.elementTypes ?? {})) {
    const label = document.createElement("label");
    const box = document.createElement("input");
    box.type = "checkbox";
    box.checked = shown.has(name);
    box.addEventListener("change", () => {
      const checked = Array.from(tileElementsList.querySelectorAll<HTMLInputElement>("input:checked"))
        .map((input) => input.value);
      try {
        engine.setModeElements(mode.name, checked);
        tileElementsShown.set(mode.name, checked);
      } catch (error) {
        box.checked = !box.checked;
        console.warn(error);
      }
    });
    box.value = name;
    label.append(box, name);
    tileElementsList.appendChild(label);
  }
}

const tileElementsShown = new Map<string, string[]>();
modeButtonsContainer.addEventListener("click", renderTileElements);
renderTileElements();

// Block font size in points; null keeps the size the mode CSS sets.
let blockFontPt: number | null = null;
const blockFontStyle = document.head.appendChild(document.createElement("style"));

function changeBlockFont(stepPt: number): void {
  // Blockly's own size is 11pt; stay within sizes people really use.
  blockFontPt = Math.min(16, Math.max(8, (blockFontPt ?? 11) + stepPt));
  blockFontStyle.textContent = `.blocklyText { font-size: ${blockFontPt}pt !important; }`;
  engine.refresh();
}

document.getElementById("font-smaller")!.addEventListener("click", () => changeBlockFont(-1));
document.getElementById("font-bigger")!.addEventListener("click", () => changeBlockFont(1));

// Draggable pane dividers (opt-in). The toolbox and output gutters are always
// present; the codespace/preview gutters are toggled per preset above.
if (RESIZABLE_PANES) {
  gutterToolbox.hidden = false;
  gutterOutput.hidden = false;
  makeResizable(gutterToolbox, { target: toolboxPanel, axis: "x", min: 160 });
  makeResizable(gutterCodespace, {
    target: codespacePane,
    axis: "x",
    min: 200,
    invert: true,
    onResize: (size) => {
      codespaceBasisPx = size;
    },
  });
  makeResizable(gutterPreview, { target: previewPane, axis: "x", min: 180, invert: true });
  makeResizable(gutterOutput, { target: outputPanel, axis: "y", min: 80, invert: true });
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
});

// ── Code Execution ─────────────────────────────────────

runBtn.addEventListener("click", () => {
  const { output, error } = engine.runJavaScript();
  const logs = output.map((line) =>
    line.level === "log" ? line.text : `[${line.level}] ${line.text}`,
  );
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
