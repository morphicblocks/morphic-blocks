import * as Blockly from "blockly";
import {
  MorphicBlocks,
  type MorphicBlockDefinition,
  type MorphicElementType,
  type MorphicModeDefinition,
  type MorphicToolboxCategory,
} from "morphic-blocks";
import format from "./definitions.json";
import config from "./config.json";
import { behaviors } from "./behaviors";
import { blockIcons } from "./icons";
import "./style.css";

interface Level {
  label: string;
  toolboxMode: string;
  workspaceMode: string;
}

const levels = (config as { levels: Level[] }).levels;

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
const outputEl = document.getElementById("output")!;
const modeButtonsContainer = document.getElementById("mode-buttons")!;
const runBtn = document.getElementById("run-btn")!;
const codeBtn = document.getElementById("code-btn")!;
const clearBtn = document.getElementById("clear-btn")!;

// ── Engine Setup ───────────────────────────────────────

const blocks = (format.blocks as MorphicBlockDefinition[]).map((block) => ({
  ...block,
  elements: {
    ...block.elements,
    ...(blockIcons[block.identifier]
      ? { icon: blockIcons[block.identifier] }
      : {}),
  },
}));

const engine = new MorphicBlocks(
  blocks,
  behaviors,
  format.elementTypes as Record<string, MorphicElementType>,
);

let currentLevelIndex = 0;
const initialLevel = levels[currentLevelIndex]!;

const workspace = engine.mount({
  workspaceContainer,
  codespaceContainer,
  workspaceMode: initialLevel.workspaceMode,
  toolboxMode: initialLevel.toolboxMode,
  modesFolder: modeStyles,
  canvasToolbox: true,
  modes: format.modes as MorphicModeDefinition[],
  toolbox: {
    categories: format.categories as MorphicToolboxCategory[],
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
  categories: format.categories as MorphicToolboxCategory[],
});

const editorTheme = {
  background: "#0f1117",
  foreground: "#d4d4d4",
  gutterBackground: "#0f1117",
  gutterForeground: "#5d677a",
  selectionBackground: "#264f78",
};

engine.mountCodeEditor(codeEditorContainer, { theme: editorTheme }).then(() => {
  engine.hideCodeEditor();
  engine.enableSelectionSync({ highlightColor: "rgba(139, 172, 221, 0.48)" });
});

engine.mountCodespace({ theme: editorTheme });

engine.mountPreview(previewContainer, {
  theme: { ...editorTheme, background: "#161a24", gutterBackground: "#161a24", foreground: "#bfc7d9" },
});

// ── Level Buttons ──────────────────────────────────────

function modeByName(name: string): MorphicModeDefinition | undefined {
  return (format.modes as MorphicModeDefinition[]).find((m) => m.name === name);
}

function applyLevel(index: number): void {
  const level = levels[index];
  if (!level) return;
  currentLevelIndex = index;
  engine.setModes({
    workspaceMode: level.workspaceMode,
    toolboxMode: level.toolboxMode,
  });
  updateLayout(level.workspaceMode);
  updateActiveButton();
}

function updateLayout(workspaceModeName: string): void {
  const mode = modeByName(workspaceModeName);
  const isCodespacePresentation = mode?.presentation === "codespace";
  const hasPreview = !!mode?.preview;

  workspaceContainer.style.display = isCodespacePresentation ? "none" : "";
  codespaceContainer.style.display = isCodespacePresentation ? "" : "none";
  codespaceContainer.style.flex = isCodespacePresentation ? "1 1 auto" : "";
  previewContainer.style.display = hasPreview ? "" : "none";
  Blockly.svgResize(workspace);
}

function updateActiveButton(): void {
  const buttons = modeButtonsContainer.querySelectorAll<HTMLButtonElement>("button");
  buttons.forEach((b, i) => b.classList.toggle("active", i === currentLevelIndex));
}

modeButtonsContainer.innerHTML = "";
levels.forEach((level, i) => {
  const btn = document.createElement("button");
  btn.textContent = level.label;
  btn.addEventListener("click", () => applyLevel(i));
  modeButtonsContainer.appendChild(btn);
});

updateLayout(initialLevel.workspaceMode);
updateActiveButton();

// ── Resize Handling ────────────────────────────────────

const resizeObserver = new ResizeObserver(() => {
  Blockly.svgResize(workspace);
});
resizeObserver.observe(workspaceContainer);

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
  const code = engine.generateJavaScript();
  const logs: string[] = [];

  const customConsole = {
    log: (...args: unknown[]) => logs.push(args.map(String).join(" ")),
    warn: (...args: unknown[]) =>
      logs.push("[warn] " + args.map(String).join(" ")),
    error: (...args: unknown[]) =>
      logs.push("[error] " + args.map(String).join(" ")),
  };

  try {
    const fn = new Function("console", code);
    fn(customConsole);
    outputEl.textContent = logs.length > 0 ? logs.join("\n") : "(no output)";
    outputEl.style.color = "";
  } catch (err) {
    outputEl.textContent =
      logs.join("\n") +
      (logs.length > 0 ? "\n" : "") +
      `Error: ${err instanceof Error ? err.message : String(err)}`;
    outputEl.style.color = "#e74c3c";
  }
});

clearBtn.addEventListener("click", () => {
  outputEl.textContent = "";
  outputEl.style.color = "";
});
