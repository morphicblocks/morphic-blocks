import type { MorphicCodeEditorTheme } from "morphic-blocks";
import standardFamily from "./standard.json" with { type: "json" };

/**
 * Themes for the code views, passed as `editorTheme` or in `themes` by view
 * name: `engine.mount({ editorTheme: standard.light })`. A family keeps its
 * light and dark version together, one JSON file each; every version sets
 * every field, so switching leaves nothing of the other behind.
 */
type Family = { light: Required<MorphicCodeEditorTheme>; dark: Required<MorphicCodeEditorTheme> };

/** The framework's own colors (based on VS Code's Light+ and Dark+); `dark` is the default. */
export const standard: Family = standardFamily;

/** Every family by name, e.g. for a theme picker. */
export const themes: Record<string, Family> = { standard };
