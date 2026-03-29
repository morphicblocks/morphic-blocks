import * as Blockly from "blockly";
import {
  MorphicBlocks,
  type MorphicBlockDefinition,
  type MorphicElementType,
  type MorphicModeDefinition,
  type MorphicToolboxCategory,
} from "morphic-blocks";
import format from "./definitions.json";
import { behaviors } from "./behaviors";
import { blockIcons } from "./icons";
import "./style.css";

// Auto-discover mode CSS files by filename
const modeStyles = import.meta.glob("./modes/*.css", {
  eager: true,
  query: "?url",
});

// ── State ──────────────────────────────────────────────

let currentMode = "lexical";

// ── DOM ────────────────────────────────────────────────

const workspaceContainer = document.getElementById("workspace-container")!;
const toolboxPanel = document.getElementById("toolbox-panel")!;
const codeEditorContainer = document.getElementById("code-editor")!;
const outputEl = document.getElementById("output")!;
const modeButtons = document.querySelectorAll<HTMLButtonElement>("[data-mode]");
const runBtn = document.getElementById("run-btn")!;
const codeBtn = document.getElementById("code-btn")!;
const clearBtn = document.getElementById("clear-btn")!;

// ── Engine Setup ───────────────────────────────────────

const blocks = (format.blocks as MorphicBlockDefinition[]).map((block) => ({
  ...block,
  elements: {
    ...block.elements,
    ...(blockIcons[block.identifier] ? { icon: blockIcons[block.identifier] } : {}),
  },
}));

const engine = new MorphicBlocks(
  blocks,
  behaviors,
  format.elementTypes as Record<string, MorphicElementType>,
);

const workspace = engine.mount({
  workspaceContainer,
  workspaceMode: currentMode,
  toolboxMode: currentMode,
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

// Mount the custom HTML toolbox canvas (replaces Blockly's built-in flyout)
engine.mountToolbox(toolboxPanel, {
  categories: format.categories as MorphicToolboxCategory[],
});

// Mount the code editor (hidden by default, async due to dynamic CodeMirror import)
engine.mountCodeEditor(codeEditorContainer, {
  theme: {
    background: "#0f1117",
    foreground: "#d4d4d4",
    gutterBackground: "#0f1117",
    gutterForeground: "#5d677a",
    selectionBackground: "#264f78",
  },
}).then(() => {
  engine.hideCodeEditor();
});

// Set the initial active button
modeButtons.forEach((btn) =>
  btn.classList.toggle("active", btn.dataset.mode === currentMode),
);

// ── Resize Handling ────────────────────────────────────

const resizeObserver = new ResizeObserver(() => {
  Blockly.svgResize(workspace);
});
resizeObserver.observe(workspaceContainer);

// ── Mode Switching ─────────────────────────────────────

modeButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    const mode = btn.dataset.mode!;
    if (mode === currentMode) return;
    currentMode = mode;
    engine.setModes({ workspaceMode: mode, toolboxMode: mode });
    modeButtons.forEach((b) => b.classList.toggle("active", b === btn));
  });
});

// ── Code Editor Toggle ────────────────────────────────

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
    warn: (...args: unknown[]) => logs.push("[warn] " + args.map(String).join(" ")),
    error: (...args: unknown[]) => logs.push("[error] " + args.map(String).join(" ")),
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
