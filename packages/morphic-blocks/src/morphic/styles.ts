import { toModeClassToken } from "./template";
import type {
  MorphicHighlightDefinition,
  MorphicModeDefinition,
  MorphicModeName,
  MorphicStyleBundle,
  MorphicToolboxCategory,
} from "./types";

/**
 * One mode's stylesheet, a link or the CSS itself. Hosts pass `modesFolder` or
 * the `modeStyles` map; the engine merges both into a list of these.
 */
export interface MorphicModeStyle {
  mode: MorphicModeName;
  href?: string;
  cssText?: string;
}

/**
 * Injects the framework's stylesheets into the page. Every helper first checks
 * the page itself for an identical stylesheet, so engines that are created
 * again and again (a remounted component, React's double mount in development,
 * several editors on one page) never stack up copies of the same CSS.
 */
export class MorphicStyleManager {

  /**
   * Injects visibility CSS derived from mode definitions.
   * Hides all morphic elements by default, then shows only those listed
   * in each mode's `elements` array. Developer CSS only needs to handle styling.
   */
  public ensureModeVisibilityStyles(
    modes: MorphicModeDefinition[],
    previousModes?: MorphicModeDefinition[],
  ): void {
    const css = modeVisibilityCss(modes);
    if (previousModes) {
      // Replace the rules the old modes added, or they would keep showing
      // elements a mode no longer lists.
      const previousCss = modeVisibilityCss(previousModes);
      for (const existing of Array.from(document.head.querySelectorAll<HTMLStyleElement>("style[data-morphic-source]"))) {
        if (existing.dataset.morphicSource === "mode-visibility" && existing.textContent === previousCss) {
          existing.textContent = css;
          return;
        }
      }
    }
    addStyle("mode-visibility", css);
  }

  public ensureStyles(
    baseStyle: MorphicStyleBundle | undefined,
    modeStyles: MorphicModeStyle[],
  ): void {
    this.ensureStyleBundle(baseStyle, "base");
    for (const style of modeStyles) {
      this.ensureStyleBundle(style, `mode:${style.mode}`);
    }
  }

  /**
   * Inject the framework-shipped toolbar layout CSS once per document. The
   * stylesheet itself lives at `toolbar.css`; we import it as a string via
   * Vite's `?inline` query so consumers don't need to add a CSS import.
   * Everything visual inherits from the parent by default; CSS variables let
   * the host theme without overriding class selectors.
   */
  public async ensureToolbarStyles(): Promise<void> {
    const mod = await import("./toolbar.css?inline");
    addStyle("toolbar", (mod as { default: string }).default);
  }

  /**
   * Blockly outlines the workspace background with a grey line. It is left
   * out by default and styleable through two CSS variables, e.g.
   * `--morphic-workspace-border-color: #ccc`.
   */
  public ensureWorkspaceStyles(): void {
    addStyle(
      "workspace",
      [
        ".morphic-workspace-root .blocklyMainBackground {",
        "  stroke: var(--morphic-workspace-border-color, transparent);",
        "  stroke-width: var(--morphic-workspace-border-width, 1px);",
        "}",
      ].join("\n"),
    );
  }

  public ensureCategoryStyles(categories: MorphicToolboxCategory[]): void {
    for (const category of categories) {
      if (!category.color) {
        continue;
      }
      const token = toModeClassToken(category.name);
      addStyle(
        `category:${token}`,
        `.morphic-category-${token} { --morphic-category-color: ${category.color}; }`,
      );
    }
  }

  public validateModeCoverage(
    modeStyles: MorphicModeStyle[],
    definitionModes: MorphicModeName[],
  ): void {
    const styleModes = new Set(modeStyles.map((style) => style.mode));
    const missingModes = definitionModes.filter(
      (mode) => !styleModes.has(mode),
    );
    if (missingModes.length > 0) {
      console.warn(
        `[MorphicBlocks] Modes without explicit CSS definition: ${missingModes.join(", ")}.`,
      );
    }
  }

  private ensureStyleBundle(
    style: MorphicStyleBundle | MorphicModeStyle | undefined,
    sourceName: string,
  ): void {
    if (!style) {
      return;
    }

    if (style.href) {
      addLink(sourceName, style.href);
    }
    if (style.cssText) {
      addStyle(sourceName, style.cssText);
    }
  }
}

/**
 * Token colours for code shown as text on toolbox tiles, per code element:
 * the element's own `highlighting.colors`, or the codespace's defaults.
 */
export function ensureTileHighlightStyles(
  elementName: string,
  colors: MorphicHighlightDefinition["colors"] = {},
): void {
  const scope = `.morphic-block .morphic-element-${toModeClassToken(elementName)}`;
  addStyle(
    `tile-highlight:${elementName}`,
    [
      `${scope} .morphic-tok-keyword { color: ${colors.keyword ?? "#cc7832"}; }`,
      `${scope} .morphic-tok-string { color: ${colors.string ?? "#6a8759"}; }`,
      `${scope} .morphic-tok-number { color: ${colors.number ?? "#6897bb"}; }`,
      `${scope} .morphic-tok-comment { color: ${colors.comment ?? "#808080"}; font-style: italic; }`,
    ].join("\n"),
  );
}

/** Hide every element, then show the ones each mode lists. */
function modeVisibilityCss(modes: MorphicModeDefinition[]): string {
  const lines: string[] = ['[class^="morphic-element-"] { display: none; }'];
  for (const mode of modes) {
    const modeToken = toModeClassToken(mode.name);
    for (const element of mode.elements) {
      const elementToken = toModeClassToken(element);
      lines.push(`.morphic-mode-${modeToken} > .morphic-element-${elementToken} { display: block; }`);
    }
  }
  return lines.join("\n");
}

/** Add a `<style>` unless the page already has one with the same source and CSS. */
function addStyle(source: string, css: string): void {
  for (const existing of Array.from(document.head.querySelectorAll<HTMLStyleElement>("style[data-morphic-source]"))) {
    if (existing.dataset.morphicSource === source && existing.textContent === css) return;
  }
  const styleEl = document.createElement("style");
  styleEl.dataset.morphicSource = source;
  styleEl.textContent = css;
  document.head.appendChild(styleEl);
}

/** Add a stylesheet `<link>` unless the page already links the same file. */
function addLink(source: string, href: string): void {
  for (const existing of Array.from(document.head.querySelectorAll<HTMLLinkElement>("link[data-morphic-source]"))) {
    if (existing.getAttribute("href") === href) return;
  }
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = href;
  link.dataset.morphicSource = source;
  document.head.appendChild(link);
}
