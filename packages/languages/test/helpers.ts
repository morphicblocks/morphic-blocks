import { MorphicBlocks, checkDefinitions } from "morphic-blocks";
import { define, standard, type Language } from "@morphicblocks/blocks";
import { loadProgram } from "../../blocks/test/program";
import { programs } from "./programs";

const modes = [{ name: "tiles", elements: ["language"] }];

/** The standard blocks with one language, as an app would define them. */
export const defined = (language: Language) => define({ blocks: standard, languages: { language } }, { modes });

/** What `mount()` would report for the standard blocks with this language. */
export function check(language: Language) {
  const { definitions, behaviors } = defined(language);
  return checkDefinitions(definitions, behaviors);
}

/** Mount the standard blocks with one language and load a sample program. */
async function mounted(language: Language, program: string): Promise<MorphicBlocks> {
  const { definitions, behaviors } = defined(language);
  const engine = new MorphicBlocks(definitions, behaviors);
  await engine.mount({ workspaceContainer: document.body.appendChild(document.createElement("div")), onWarning: () => {} });
  loadProgram(engine.getWorkspace()!, programs[program]!);
  return engine;
}

/** The text a language writes for a sample program. */
export async function write(language: Language, program: string): Promise<string> {
  const engine = await mounted(language, program);
  try {
    return engine.generateText("language");
  } finally {
    engine.dispose();
    document.body.innerHTML = "";
  }
}

/**
 * Write a sample program in a language, read that text back into blocks, and
 * write and run the blocks it became.
 */
export async function roundTrip(language: Language, program: string) {
  const engine = await mounted(language, program);
  try {
    const before = engine.generateText("language");
    const result = engine.loadText(before, { element: "language" });
    const ran = engine.runJavaScript();
    return { before, result, after: engine.generateText("language"), prints: ran.error ? [String(ran.error)] : ran.output.map((line) => line.text) };
  } finally {
    engine.dispose();
    document.body.innerHTML = "";
  }
}

/** What a sample program prints when it runs with a language's blocks. */
export async function run(language: Language, program: string): Promise<string[]> {
  const engine = await mounted(language, program);
  try {
    const result = engine.runJavaScript();
    if (result.error) throw new Error(`${result.error.message}\n${result.code}`);
    return result.output.map((line) => line.text);
  } finally {
    engine.dispose();
    document.body.innerHTML = "";
  }
}
