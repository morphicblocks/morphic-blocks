import { toModeClassToken } from "./template";
import type {
  MorphicModeDefinition,
  MorphicModeStyle,
  MorphicModeName,
  MorphicStyleBundle,
  MorphicToolboxCategory,
} from "./types";

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
  public ensureModeVisibilityStyles(modes: MorphicModeDefinition[]): void {
    const lines: string[] = ['[class^="morphic-element-"] { display: none; }'];
    for (const mode of modes) {
      const modeToken = toModeClassToken(mode.name);
      for (const element of mode.elements) {
        const elementToken = toModeClassToken(element);
        lines.push(`.morphic-mode-${modeToken} > .morphic-element-${elementToken} { display: block; }`);
      }
    }

    addStyle("mode-visibility", lines.join("\n"));
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
