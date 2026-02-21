import { MorphicBlocks } from "morphic-blocks";
import type {
  MorphicBlockDefinition,
  MorphicModeName,
  MorphicToolboxCategory,
} from "morphic-blocks";
import { behaviors } from "./behavior.js";
import definitionsFile from "./blocks.json";
import "./style.css";

const workspaceContainer = document.getElementById("workspace");
const workspaceModeButtons = document.getElementById("workspace-mode-buttons");
const toolboxModeButtons = document.getElementById("toolbox-mode-buttons");
const runButton = document.getElementById("run-js") as HTMLButtonElement | null;
const clearOutputButton = document.getElementById(
  "clear-output",
) as HTMLButtonElement | null;
const generatedOutput = document.getElementById("generated-output");
const runOutput = document.getElementById("run-output");

if (
  !workspaceContainer ||
  !workspaceModeButtons ||
  !toolboxModeButtons ||
  !runButton ||
  !clearOutputButton ||
  !generatedOutput ||
  !runOutput
) {
  throw new Error("Playground UI containers were not found.");
}

const definitions = definitionsFile as MorphicBlockDefinition[];
const allowedModes = ["iconic", "lexical", "syntactic"] as const;
const modeNames = collectModes(definitions).filter((modeName) =>
  allowedModes.includes(modeName as (typeof allowedModes)[number]),
);

let workspaceMode = pickDefaultMode(modeNames, "syntactic", "lexical");
let toolboxMode = pickDefaultMode(modeNames, "iconic", "lexical");
const engine = new MorphicBlocks(definitions, behaviors);
engine.mount({
  workspaceContainer,
  workspaceMode,
  toolboxMode,
  ui: {
    workspaceClassName: "playground-workspace",
    toolboxClassName: "playground-toolbox",
  },
  toolboxLayout: "flyout",
  toolbox: {
    categories: createToolboxCategories(),
  },
  modeStyles: [
    {
      mode: "iconic",
      href: new URL("./modes/iconic.css", import.meta.url).href,
    },
    {
      mode: "lexical",
      href: new URL("./modes/lexical.css", import.meta.url).href,
    },
    {
      mode: "syntactic",
      href: new URL("./modes/syntactic.css", import.meta.url).href,
    },
  ],
  baseStyle: {
    cssText: `
      .morphic-workspace-root {
        border-radius: 16px;
        border: 2px solid #0f172a;
        overflow: hidden;
      }
    `,
  },
  blockly: {
    trashcan: true,
    grid: {
      spacing: 24,
      length: 2,
      colour: "#d6dde8",
      snap: true,
    },
    move: {
      drag: true,
      wheel: true,
      scrollbars: true,
    },
    zoom: {
      controls: true,
      wheel: true,
      startScale: 0.94,
      maxScale: 1.8,
      minScale: 0.4,
    },
  },
});

renderModeButtons(
  workspaceModeButtons,
  modeNames,
  workspaceMode,
  (nextMode) => {
    workspaceMode = nextMode;
    engine.setModes({ workspaceMode });
    syncModeButtons(workspaceModeButtons, workspaceMode);
    updateGeneratedCode();
  },
);

renderModeButtons(toolboxModeButtons, modeNames, toolboxMode, (nextMode) => {
  toolboxMode = nextMode;
  engine.setModes({ toolboxMode });
  syncModeButtons(toolboxModeButtons, toolboxMode);
  updateGeneratedCode();
});

seedWorkspaceIfEmpty(engine);
updateGeneratedCode();

engine.getWorkspace()?.addChangeListener(() => {
  updateGeneratedCode();
});

runButton.addEventListener("click", handleRun);
clearOutputButton.addEventListener("click", () => {
  runOutput.textContent = "Run output will appear here.";
});

function updateGeneratedCode(): void {
  generatedOutput.textContent = engine.generateJavaScript();
}

function handleRun(): void {
  const code = engine.generateJavaScript();
  generatedOutput.textContent = code;

  const logs: string[] = [];
  const previousLog = console.log;
  console.log = (...args: unknown[]) => {
    logs.push(args.map((arg) => String(arg)).join(" "));
    previousLog(...args);
  };

  try {
    const runner = new Function(code);
    runner();
    runOutput.textContent =
      logs.length > 0
        ? logs.join("\n")
        : "Executed successfully (no console output).";
  } catch (error) {
    runOutput.textContent = `Runtime error: ${error instanceof Error ? error.message : String(error)}`;
  } finally {
    console.log = previousLog;
  }
}

function renderModeButtons(
  container: HTMLElement,
  modeNames: MorphicModeName[],
  activeMode: MorphicModeName,
  onSelect: (modeName: MorphicModeName) => void,
): void {
  container.replaceChildren();

  for (const modeName of modeNames) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "mode-button";
    button.dataset.mode = modeName;
    button.textContent = modeName;
    button.setAttribute("aria-pressed", String(modeName === activeMode));

    button.addEventListener("click", () => {
      if (modeName === activeMode) {
        return;
      }
      onSelect(modeName);
      activeMode = modeName;
      syncModeButtons(container, activeMode);
    });

    container.appendChild(button);
  }

  syncModeButtons(container, activeMode);
}

function syncModeButtons(
  container: HTMLElement,
  activeMode: MorphicModeName,
): void {
  const buttons =
    container.querySelectorAll<HTMLButtonElement>("button[data-mode]");
  for (const button of buttons) {
    const isActive = button.dataset.mode === activeMode;
    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-pressed", String(isActive));
  }
}

function collectModes(
  definitions: MorphicBlockDefinition[],
): MorphicModeName[] {
  const modeSet = new Set<MorphicModeName>();
  for (const definition of definitions) {
    for (const modeName of Object.keys(definition.views)) {
      modeSet.add(modeName);
    }
  }
  return [...modeSet];
}

function pickDefaultMode(
  availableModes: MorphicModeName[],
  primary: MorphicModeName,
  secondary: MorphicModeName,
): MorphicModeName {
  if (availableModes.includes(primary)) {
    return primary;
  }
  if (availableModes.includes(secondary)) {
    return secondary;
  }
  return availableModes[0] ?? "iconic";
}

function createToolboxCategories(): MorphicToolboxCategory[] {
  return [
    {
      name: "Flow",
      colour: "#14b8a6",
      blocks: ["for_each_range"],
    },
    {
      name: "Data",
      colour: "#3b82f6",
      blocks: [
        "create_range",
        "sum_range",
        "current_item",
        "num_1",
        "num_5",
        "num_10",
      ],
    },
    {
      name: "Output",
      colour: "#f97316",
      blocks: ["log_message", "concat_text", "text_sum_prefix", "random_color"],
    },
  ];
}

function seedWorkspaceIfEmpty(engine: MorphicBlocks): void {
  const workspace = engine.getWorkspace();
  if (!workspace || workspace.getAllBlocks(false).length > 0) {
    return;
  }

  const loop = createBlock(workspace, "for_each_range", 120, 68);
  const range = createBlock(workspace, "create_range");
  connect(loop.getInput("RANGE")?.connection, range.outputConnection);

  const start = createBlock(workspace, "num_1");
  connect(range.getInput("START")?.connection, start.outputConnection);

  const end = createBlock(workspace, "num_10");
  connect(range.getInput("END")?.connection, end.outputConnection);

  const step = createBlock(workspace, "num_1");
  connect(range.getInput("STEP")?.connection, step.outputConnection);

  const loopLog = createBlock(workspace, "log_message");
  connect(loop.getInput("DO")?.connection, loopLog.previousConnection);

  const currentItem = createBlock(workspace, "current_item");
  connect(
    loopLog.getInput("MESSAGE")?.connection,
    currentItem.outputConnection,
  );

  const totalLog = createBlock(workspace, "log_message");
  connect(loop.nextConnection, totalLog.previousConnection);

  const concat = createBlock(workspace, "concat_text");
  connect(totalLog.getInput("MESSAGE")?.connection, concat.outputConnection);

  const label = createBlock(workspace, "text_sum_prefix");
  connect(concat.getInput("A")?.connection, label.outputConnection);

  const sum = createBlock(workspace, "sum_range");
  connect(concat.getInput("B")?.connection, sum.outputConnection);

  const secondRange = createBlock(workspace, "create_range");
  connect(sum.getInput("RANGE")?.connection, secondRange.outputConnection);

  connect(
    secondRange.getInput("START")?.connection,
    createBlock(workspace, "num_1").outputConnection,
  );
  connect(
    secondRange.getInput("END")?.connection,
    createBlock(workspace, "num_5").outputConnection,
  );
  connect(
    secondRange.getInput("STEP")?.connection,
    createBlock(workspace, "num_1").outputConnection,
  );

  workspace.render();
}

function createBlock(
  workspace: NonNullable<ReturnType<MorphicBlocks["getWorkspace"]>>,
  type: string,
  x = 0,
  y = 0,
): ReturnType<typeof workspace.newBlock> {
  const block = workspace.newBlock(type);
  block.initSvg();
  block.render();
  block.moveBy(x, y);
  return block;
}

function connect(target: unknown, source: unknown): void {
  const targetConnection = target as {
    connect: (connection: unknown) => void;
  } | null;
  if (!targetConnection || !source) {
    return;
  }
  try {
    targetConnection.connect(source);
  } catch {
    // Ignore non-compatible seed connections.
  }
}
